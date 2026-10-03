import { html, type SafeHtml } from "../lib/html.js";
import { renderField, validate, errorSummary, type Errors, type FieldSpec, type Values } from "../lib/forms.js";
import { DOCUMENT_CATEGORIES, GALLERY_ALBUMS, HONOR_KINDS } from "../lib/content.js";
import { eventDate, formatDate } from "../lib/format.js";
import { deleteFile } from "../lib/storage.js";
import { redirect } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount, postButton, statusPill } from "./layout.js";
import { handleUpload, uploadInput } from "./uploads.js";

/**
 * Generisk redigering (skapa, lista, ändra, publicera, ta bort) för innehållstyperna.
 * Varje typ beskrivs deklarativt nedan – samma mönster överallt gör panelen lätt att lära sig.
 */

type Row = Record<string, unknown> & { id: number };

export interface AdminField extends FieldSpec {
  /** Databaskolumn (standard: name). */
  column?: string;
  /** Bild eller PDF – sparas i fillagringen, kolumnen får filens nyckel. */
  upload?: "image" | "pdf";
  /** Tomt värde sparas som NULL i stället för tom sträng. */
  nullable?: boolean;
  /** Krävs bara när posten skapas (t.ex. bild i galleriet). */
  requiredOnCreate?: boolean;
}

export interface Resource {
  path: string; // "nyheter"
  table: string;
  title: string; // "Nyheter"
  singular: string; // "nyhet"
  newLabel: string; // "Ny nyhet"
  lead: string;
  fields: AdminField[];
  orderBy: string;
  slugFrom?: string;
  publishable?: boolean;
  publishLabels?: [string, string];
  listColumns: { label: string; render: (r: Row) => SafeHtml | string; className?: string }[];
  titleOf: (r: Row) => string;
  publicUrl?: (r: Row) => string | null;
  /** Extra validering mellan fält. */
  check?: (v: Values) => Errors;
  /** Extra kolumner vid sparning, t.ex. publiceringsdatum. */
  extraColumns?: (v: Values, existing: Row | null) => Record<string, unknown>;
  emptyText: string;
}

const thumb = (key: unknown, alt = "") => {
  const src = mediaUrl(typeof key === "string" ? key : null);
  return src ? html`<img class="thumb" src="${src}" alt="${alt}" width="56" height="56" loading="lazy">` : html`<span class="thumb thumb-empty" aria-hidden="true"></span>`;
};

const MARKDOWN_HELP =
  "Tom rad = nytt stycke. **fet text**, *kursiv*, [länktext](https://adress.se), rader som börjar med ”- ” blir en punktlista och ”## ” blir en underrubrik.";

export const RESOURCES: Resource[] = [
  {
    path: "nyheter",
    table: "news",
    title: "Nyheter",
    singular: "nyhet",
    newLabel: "Skriv en nyhet",
    lead: "Nyheter visas under Aktuellt och de tre senaste på startsidan.",
    orderBy: "COALESCE(published_at, created_at) DESC, id DESC",
    slugFrom: "title",
    publishable: true,
    emptyText: "Inga nyheter ännu. Skriv den första!",
    fields: [
      { name: "title", label: "Rubrik", type: "text", required: true, max: 150 },
      { name: "excerpt", label: "Ingress", type: "textarea", rows: 3, max: 300, help: "En eller två meningar som sammanfattar nyheten. Visas på startsidan och i listan." },
      { name: "body", label: "Text", type: "textarea", rows: 14, max: 20000, help: MARKDOWN_HELP },
      { name: "image_key", label: "Bild", type: "text", upload: "image", nullable: true, help: "Valfri. Liggande bild fungerar bäst (t.ex. 1600 × 1000 px). Stora foton komprimeras automatiskt." },
      { name: "image_alt", label: "Bildbeskrivning (alt-text)", type: "text", max: 200, help: "Beskriv vad bilden visar för den som inte kan se den." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.image_key), className: "col-thumb" },
      { label: "Rubrik", render: (r) => html`<a class="row-title" href="/admin/nyheter/${r.id}">${String(r.title)}</a>` },
      { label: "Publicerad", render: (r) => (r.published_at ? formatDate(String(r.published_at)) : "–") },
      { label: "Status", render: (r) => statusPill(!!r.published) },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published ? `/aktuellt/${r.slug}` : null),
    extraColumns: (v, existing) => {
      const out: Record<string, unknown> = { updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) };
      if (v.published === "1" && !existing?.published_at) out.published_at = out.updated_at;
      return out;
    },
  },
  {
    path: "event",
    table: "events",
    title: "Event",
    singular: "event",
    newLabel: "Lägg till event",
    lead: "Kommande event visas i kalendern och de tre närmaste på startsidan. Tidigare event flyttas automatiskt till ”Tidigare evenemang”.",
    orderBy: "starts_at DESC",
    slugFrom: "title",
    publishable: true,
    emptyText: "Inga event ännu.",
    fields: [
      { name: "title", label: "Namn på eventet", type: "text", required: true, max: 150 },
      { name: "starts_at", label: "Börjar", type: "datetime-local", required: true },
      { name: "ends_at", label: "Slutar", type: "datetime-local", nullable: true, help: "Valfritt. Utan sluttid visas eventet som kommande hela dagen." },
      { name: "location", label: "Plats", type: "text", max: 150, placeholder: "T.ex. Karlstads universitet, sal 1B 309" },
      { name: "summary", label: "Kort beskrivning", type: "textarea", rows: 2, max: 250, help: "En mening som visas i kalendern." },
      { name: "body", label: "Mer information", type: "textarea", rows: 10, max: 20000, help: MARKDOWN_HELP },
      { name: "signup_url", label: "Länk till anmälan/biljetter", type: "url", nullable: true, max: 500, help: "T.ex. eventets sida hos Hitract." },
      { name: "members_only", label: "Endast för medlemmar", type: "checkbox" },
      { name: "image_key", label: "Bild", type: "text", upload: "image", nullable: true },
      { name: "image_alt", label: "Bildbeskrivning (alt-text)", type: "text", max: 200 },
    ],
    check: (v): Errors => (v.ends_at && v.starts_at && v.ends_at < v.starts_at ? { ends_at: "Sluttiden kan inte vara före starttiden." } : {}),
    listColumns: [
      {
        label: "Datum",
        render: (r) => {
          const d = eventDate(String(r.starts_at), r.ends_at as string | null);
          return d ? `${d.day} ${d.monthShort} ${String(r.starts_at).slice(0, 4)}, ${d.time}` : "";
        },
      },
      { label: "Event", render: (r) => html`<a class="row-title" href="/admin/event/${r.id}">${String(r.title)}</a>` },
      { label: "Status", render: (r) => statusPill(!!r.published) },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published ? `/kalender/${r.slug}` : null),
    extraColumns: () => ({ updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
  },
  {
    path: "partners",
    table: "partners",
    title: "Partners",
    singular: "partner",
    newLabel: "Lägg till partner",
    lead: "Huvudsamarbetspartners visas stort direkt under toppen på startsidan, övriga i en rad under dem.",
    orderBy: "CASE tier WHEN 'huvud' THEN 0 ELSE 1 END, sort_order, name",
    slugFrom: "name",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    emptyText: "Inga partners ännu.",
    fields: [
      { name: "name", label: "Namn", type: "text", required: true, max: 100 },
      {
        name: "tier",
        label: "Typ av partner",
        type: "radio",
        required: true,
        options: [
          { value: "huvud", label: "Huvudsamarbetspartner", hint: "Visas stort på startsidan" },
          { value: "partner", label: "Samarbetspartner", hint: "Visas i logoraden" },
        ],
      },
      { name: "logo_key", label: "Logotyp", type: "text", upload: "image", nullable: true, help: "Helst SVG eller PNG med genomskinlig bakgrund. Utan logotyp visas namnet i snygg text." },
      { name: "tagline", label: "Kort beskrivning", type: "text", max: 160, help: "En mening som visas på kortet." },
      { name: "description", label: "Presentation", type: "textarea", rows: 8, max: 5000, help: "Visas på partnerns egen sida. Tom rad = nytt stycke." },
      { name: "website_url", label: "Webbplats", type: "url", nullable: true, max: 300 },
      { name: "career_url", label: "Karriärsida", type: "url", nullable: true, max: 300 },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999, help: "Lägre tal visas först." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.logo_key), className: "col-thumb" },
      { label: "Namn", render: (r) => html`<a class="row-title" href="/admin/partners/${r.id}">${String(r.name)}</a>` },
      { label: "Typ", render: (r) => (r.tier === "huvud" ? "Huvudsamarbetspartner" : "Samarbetspartner") },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.name),
    publicUrl: (r) => (r.published ? `/partners/${r.slug}` : null),
    extraColumns: () => ({ updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
  },
  {
    path: "styrelsen",
    table: "board_members",
    title: "Styrelsen",
    singular: "styrelseledamot",
    newLabel: "Lägg till ledamot",
    lead: "Visas på Om oss och på kontaktsidan. Byt ut alla när en ny styrelse har valts.",
    orderBy: "sort_order, name",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    emptyText: "Ingen i styrelsen är inlagd ännu.",
    fields: [
      { name: "name", label: "Namn", type: "text", required: true, max: 100 },
      { name: "role", label: "Roll", type: "text", required: true, max: 100, placeholder: "T.ex. Ordförande" },
      { name: "email", label: "E-post för rollen", type: "email", nullable: true, max: 200 },
      { name: "photo_key", label: "Foto", type: "text", upload: "image", nullable: true, help: "Ladda bara upp ett foto om personen har sagt ja till att det publiceras (GDPR). Kvadratiskt porträtt fungerar bäst. Utan foto visas initialerna." },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999, help: "Lägre tal visas först." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.photo_key), className: "col-thumb" },
      { label: "Namn", render: (r) => html`<a class="row-title" href="/admin/styrelsen/${r.id}">${String(r.name)}</a>` },
      { label: "Roll", render: (r) => String(r.role) },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.name),
  },
  {
    path: "utmarkelser",
    table: "honors",
    title: "Utmärkelser",
    singular: "utmärkelse",
    newLabel: "Lägg till",
    lead: "Hedersmedlemmar, utdelade utmärkelser och Årets pedagog. Visas på Om oss.",
    orderBy: "year DESC, sort_order, name",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    emptyText: "Inga hedersmedlemmar eller pristagare är inlagda ännu.",
    fields: [
      {
        name: "kind",
        label: "Typ",
        type: "radio",
        required: true,
        options: Object.entries(HONOR_KINDS).map(([value, label]) => ({ value, label })),
      },
      { name: "name", label: "Namn", type: "text", required: true, max: 120 },
      { name: "year", label: "År", type: "number", min: 2011, max: 2100, nullable: true },
      { name: "description", label: "Motivering", type: "textarea", rows: 4, max: 1000 },
      { name: "photo_key", label: "Foto", type: "text", upload: "image", nullable: true, help: "Ladda bara upp ett foto om personen har sagt ja till att det publiceras (GDPR)." },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999 },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.photo_key), className: "col-thumb" },
      { label: "Namn", render: (r) => html`<a class="row-title" href="/admin/utmarkelser/${r.id}">${String(r.name)}</a>` },
      { label: "Typ", render: (r) => HONOR_KINDS[r.kind as keyof typeof HONOR_KINDS] ?? "" },
      { label: "År", render: (r) => (r.year ? String(r.year) : "–") },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.name),
  },
  {
    path: "kursombud",
    table: "course_reps",
    title: "Kursombud",
    singular: "kursombud",
    newLabel: "Lägg till kursombud",
    lead: "Visas under För studenter. Lämna namn tomt så står det ”Meddelas senare”.",
    orderBy: "sort_order, term",
    emptyText: "Inga kursombud är inlagda.",
    fields: [
      { name: "term", label: "Termin", type: "text", required: true, max: 20, placeholder: "T.ex. T4" },
      { name: "name", label: "Namn", type: "text", nullable: true, max: 100 },
      { name: "email", label: "E-post", type: "email", nullable: true, max: 200 },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999 },
    ],
    listColumns: [
      { label: "Termin", render: (r) => html`<a class="row-title" href="/admin/kursombud/${r.id}">${String(r.term)}</a>` },
      { label: "Namn", render: (r) => (r.name ? String(r.name) : html`<span class="muted">Meddelas senare</span>`) },
      { label: "E-post", render: (r) => (r.email ? String(r.email) : "–") },
    ],
    titleOf: (r) => String(r.term),
  },
  {
    path: "galleri",
    table: "gallery_images",
    title: "Bildgalleri",
    singular: "bild",
    newLabel: "Ladda upp bild",
    lead: "Bilderna visas under För studenter, grupperade per album. Publicera inga bilder som kan uppfattas som kränkande, och ta bort en bild direkt om någon som syns på den ber om det (GDPR).",
    orderBy: "album, sort_order, id DESC",
    emptyText: "Inga bilder ännu.",
    fields: [
      { name: "image_key", label: "Bild", type: "text", upload: "image", requiredOnCreate: true, help: "JPG, PNG, WebP eller HEIC. Stora foton komprimeras automatiskt." },
      { name: "album", label: "Album", type: "select", required: true, options: GALLERY_ALBUMS.map((a) => ({ value: a, label: a })) },
      { name: "alt", label: "Bildbeskrivning (alt-text)", type: "text", required: true, max: 200, help: "Krävs för tillgänglighet, t.ex. ”Studenter skålar på vårbanketten 2026”." },
      { name: "caption", label: "Bildtext", type: "text", max: 200, help: "Valfri text som visas under bilden." },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999 },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.image_key, String(r.alt ?? "")), className: "col-thumb" },
      { label: "Beskrivning", render: (r) => html`<a class="row-title" href="/admin/galleri/${r.id}">${String(r.alt || "Bild")}</a>` },
      { label: "Album", render: (r) => String(r.album) },
    ],
    titleOf: (r) => String(r.alt || "Bild"),
  },
  {
    path: "faq",
    table: "faq",
    title: "Vanliga frågor",
    singular: "fråga",
    newLabel: "Lägg till fråga",
    lead: "Visas på sidan Vanliga frågor. Frågor i kategorin ”Medlemskap” visas även på Bli medlem.",
    orderBy: "category, sort_order, id",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    emptyText: "Inga frågor ännu.",
    fields: [
      {
        name: "category",
        label: "Kategori",
        type: "select",
        required: true,
        options: ["Medlemskap", "Engagemang", "Evenemang", "Utbildning", "Övrigt"].map((v) => ({ value: v, label: v })),
      },
      { name: "question", label: "Fråga", type: "text", required: true, max: 200 },
      { name: "answer", label: "Svar", type: "textarea", required: true, rows: 5, max: 3000 },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999 },
    ],
    listColumns: [
      { label: "Fråga", render: (r) => html`<a class="row-title" href="/admin/faq/${r.id}">${String(r.question)}</a>` },
      { label: "Kategori", render: (r) => String(r.category) },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.question),
    extraColumns: () => ({ updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
  },
  {
    path: "dokument",
    table: "documents",
    title: "Dokument",
    singular: "dokument",
    newLabel: "Ladda upp dokument",
    lead: "Stadgar, styrdokument och protokoll. Visas på sidan Dokument, grupperade per år.",
    orderBy: "year DESC, category, title",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    emptyText: "Inga dokument ännu.",
    fields: [
      { name: "title", label: "Titel", type: "text", required: true, max: 200, placeholder: "T.ex. Protokoll styrelsemöte 2026-09-14" },
      {
        name: "category",
        label: "Kategori",
        type: "select",
        required: true,
        options: Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => ({ value, label })),
      },
      { name: "year", label: "År", type: "number", required: true, min: 2011, max: 2100 },
      { name: "file_key", label: "PDF-fil", type: "text", upload: "pdf", nullable: true, help: "Max 24 MB. Utan fil står det ”Laddas upp inom kort” på webbplatsen." },
    ],
    listColumns: [
      { label: "Titel", render: (r) => html`<a class="row-title" href="/admin/dokument/${r.id}">${String(r.title)}</a>` },
      { label: "Kategori", render: (r) => DOCUMENT_CATEGORIES[r.category as keyof typeof DOCUMENT_CATEGORIES] ?? "" },
      { label: "År", render: (r) => String(r.year) },
      { label: "Fil", render: (r) => (r.file_key ? html`<span class="pill pill-on">PDF</span>` : html`<span class="pill pill-warn">Saknas</span>`) },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published && r.file_key ? `/dokument/fil/${r.id}` : null),
    extraColumns: () => ({ updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
  },
];

// ───────────────────────── Hjälpfunktioner ─────────────────────────

const col = (f: AdminField) => f.column ?? f.name;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "inlagg"
  );
}

async function uniqueSlug(db: D1Database, table: string, base: string, exceptId?: number): Promise<string> {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const hit = await db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(slug, exceptId ?? 0).first();
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function rowToValues(r: Resource, row: Row | null): Values {
  const v: Values = {};
  for (const f of r.fields) {
    const val = row?.[col(f)];
    v[f.name] = val == null ? "" : f.type === "checkbox" ? (val ? "1" : "") : String(val);
  }
  if (r.publishable) v.published = row ? (row.published ? "1" : "") : "";
  return v;
}

function imageField(f: AdminField, current: string, error?: string): SafeHtml {
  const id = `falt-${f.name}`;
  const src = f.upload === "image" ? mediaUrl(current || null) : null;
  return html`<div class="field field-upload${error ? " has-error" : ""}">
    <span class="field-label" id="${id}-etikett">${f.label}${f.requiredOnCreate && !current ? html` <span class="req" aria-hidden="true">*</span>` : html` <span class="optional">(valfritt)</span>`}</span>
    ${f.help ? html`<p class="field-help" id="${f.name}-hjalp">${f.help}</p>` : ""}
    <div class="upload-box">
      ${src
        ? html`<img class="upload-preview" src="${src}" alt="Nuvarande bild" data-preview="${f.name}">`
        : f.upload === "pdf" && current
          ? html`<p class="upload-current">${icon("lock", "icon icon-sm")} En PDF är uppladdad.</p>`
          : html`<img class="upload-preview" alt="" data-preview="${f.name}" hidden>`}
      <div class="upload-controls">
        ${uploadInput({ id, name: f.name, kind: f.upload!, labelledBy: `${id}-etikett`, describedBy: [f.help ? `${f.name}-hjalp` : "", error ? `${f.name}-fel` : ""].filter(Boolean).join(" ") })}
        ${current ? html`<span class="field-help">Välj en ny fil för att ersätta den nuvarande.</span>` : ""}
        ${current && !f.requiredOnCreate ? html`<label class="check-field check-small"><input type="checkbox" name="${f.name}__ta_bort" value="1"><span>Ta bort ${f.upload === "pdf" ? "filen" : "bilden"}</span></label>` : ""}
      </div>
    </div>
    ${error ? html`<p class="field-error" id="${f.name}-fel">${error}</p>` : ""}
  </div>`;
}

function editForm(r: Resource, session: Session, action: string, values: Values, errors: Errors, isNew: boolean): SafeHtml {
  const hasUpload = r.fields.some((f) => f.upload);
  return html`<form class="admin-form" method="post" action="${action}"${hasUpload ? html` enctype="multipart/form-data"` : ""} novalidate data-dirty-check>
    ${csrfField(session)}
    ${errorSummary(errors, r.fields)}
    <div class="admin-card">
      ${r.fields.map((f) => (f.upload ? imageField(f, values[f.name] ?? "", errors[f.name]) : renderField(f, values[f.name] ?? "", errors[f.name])))}
    </div>
    ${r.publishable
      ? html`<div class="admin-card admin-card-inline">
          <label class="switch">
            <input type="checkbox" name="published" value="1"${values.published ? html` checked` : ""}>
            <span class="switch-track" aria-hidden="true"></span>
            <span><strong>${r.publishLabels ? "Visa på webbplatsen" : "Publicera"}</strong><span class="field-help">${r.publishLabels ? "Avbocka för att dölja utan att ta bort." : "Avbocka för att spara som utkast som bara syns här."}</span></span>
          </label>
        </div>`
      : ""}
    <div class="admin-form-actions">
      <button class="btn btn-primary btn-lg" type="submit">${isNew ? "Skapa" : "Spara ändringar"}</button>
      <a class="btn btn-outline" href="/admin/${r.path}">Avbryt</a>
    </div>
  </form>`;
}

// ───────────────────────── Handlers ─────────────────────────

export function listHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${r.table} ORDER BY ${r.orderBy}`).all<Row>();
    const content = html`
      ${adminHead(r.title, { lead: r.lead, actions: html`<a class="btn btn-primary" href="/admin/${r.path}/ny">+ ${r.newLabel}</a>` })}
      ${results.length
        ? html`<div class="admin-card admin-card-flush">
            <table class="admin-table">
              <thead><tr>${r.listColumns.map((cl) => html`<th scope="col" class="${cl.className ?? ""}">${cl.label ? cl.label : html`<span class="sr-only">Bild</span>`}</th>`)}<th scope="col" class="col-actions"><span class="sr-only">Åtgärder</span></th></tr></thead>
              <tbody>
                ${results.map(
                  (row) => html`<tr>
                    ${r.listColumns.map((cl) => html`<td class="${cl.className ?? ""}" data-label="${cl.label}">${cl.render(row)}</td>`)}
                    <td class="col-actions">
                      <div class="row-actions">
                        <a class="btn btn-outline btn-sm" href="/admin/${r.path}/${row.id}">Redigera</a>
                        ${r.publishable
                          ? postButton(session, `/admin/${r.path}/${row.id}/publicera`, row.published ? (r.publishLabels ? "Dölj" : "Avpublicera") : r.publishLabels ? "Visa" : "Publicera")
                          : ""}
                        ${postButton(session, `/admin/${r.path}/${row.id}/radera`, "Ta bort", {
                          confirm: `Vill du ta bort ”${r.titleOf(row)}”? Det går inte att ångra.`,
                          className: "btn btn-danger-ghost btn-sm",
                        })}
                      </div>
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : html`<div class="admin-empty"><p>${r.emptyText}</p><a class="btn btn-primary" href="/admin/${r.path}/ny">+ ${r.newLabel}</a></div>`}
    `;
    return adminLayout(c, session, { title: r.title, active: `/admin/${r.path}`, newCount: await newMessageCount(c.env.DB) }, content);
  };
}

export function newHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const values = rowToValues(r, null);
    if (r.publishable) values.published = "1";
    for (const f of r.fields) if (f.type === "number" && f.name === "sort_order") values[f.name] = "0";
    if (r.path === "dokument") values.year = String(new Date().getFullYear());
    return renderEdit(c, session, r, null, values, {});
  };
}

export function editHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(Number(c.params.id)).first<Row>();
    if (!row) return redirect(`/admin/${r.path}`, 303);
    return renderEdit(c, session, r, row, rowToValues(r, row), {});
  };
}

async function renderEdit(c: RequestContext, session: Session, r: Resource, row: Row | null, values: Values, errors: Errors, status = 200): Promise<Response> {
  const isNew = !row;
  const pub = row && r.publicUrl?.(row);
  const content = html`
    ${adminHead(isNew ? r.newLabel : `Redigera ${r.singular}`, {
      back: { href: `/admin/${r.path}`, label: r.title },
      actions: pub ? html`<a class="btn btn-outline btn-sm" href="${pub}" target="_blank" rel="noopener">${icon("external", "icon icon-sm")}Visa på webbplatsen</a>` : undefined,
    })}
    ${editForm(r, session, isNew ? `/admin/${r.path}/ny` : `/admin/${r.path}/${row!.id}`, values, errors, isNew)}
  `;
  return adminLayout(c, session, { title: isNew ? r.newLabel : `Redigera ${r.singular}`, active: `/admin/${r.path}`, newCount: await newMessageCount(c.env.DB), narrow: true }, content, status);
}

export function saveHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const id = c.params.id ? Number(c.params.id) : null;
    const db = c.env.DB;
    const existing = id ? await db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(id).first<Row>() : null;
    if (id && !existing) return redirect(`/admin/${r.path}`, 303);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return redirect(`/admin/${r.path}?fel=uppladdning`, 303);
    }
    if (!checkCsrf(c, session, form)) return redirect(`/admin/${r.path}?fel=csrf`, 303);

    const plain = r.fields.filter((f) => !f.upload);
    const { values, errors } = validate(plain, form);
    Object.assign(errors, r.check?.(values) ?? {});
    values.published = form.get("published") ? "1" : "";

    // Filer
    const fileCols: Record<string, string | null> = {};
    const oldFiles: string[] = [];
    const newFiles: string[] = [];
    let fileSize: number | null = null;
    for (const f of r.fields.filter((f) => f.upload)) {
      const current = existing ? ((existing[col(f)] as string | null) ?? "") : "";
      values[f.name] = current;
      const res = await handleUpload(c.env, form.get(f.name), f.upload!, r.path);
      if (!res.ok) {
        errors[f.name] = res.error;
        continue;
      }
      if (res.key) {
        fileCols[col(f)] = res.key;
        newFiles.push(res.key);
        if (current) oldFiles.push(current);
        fileSize = res.size;
        values[f.name] = res.key;
      } else if (form.get(`${f.name}__ta_bort`) && current) {
        fileCols[col(f)] = null;
        oldFiles.push(current);
        values[f.name] = "";
      }
      if (f.requiredOnCreate && !values[f.name]) errors[f.name] = "Välj en fil att ladda upp.";
    }

    if (Object.keys(errors).length) {
      // Städa bort filer som laddats upp i ett misslyckat försök
      for (const k of newFiles) await deleteFile(c.env, k);
      for (const f of r.fields.filter((f) => f.upload)) values[f.name] = existing ? String(existing[col(f)] ?? "") : "";
      return renderEdit(c, session, r, existing, values, errors, 422);
    }

    const data: Record<string, unknown> = {};
    for (const f of plain) {
      const v = values[f.name] ?? "";
      if (f.type === "checkbox") data[col(f)] = v ? 1 : 0;
      else if (f.type === "number") data[col(f)] = v === "" ? (f.nullable ? null : 0) : parseInt(v, 10);
      else data[col(f)] = v === "" && f.nullable ? null : v;
    }
    Object.assign(data, fileCols);
    if (r.path === "dokument" && fileSize !== null) data.file_size = fileSize;
    if (r.path === "dokument" && fileCols.file_key === null) data.file_size = null;
    if (r.publishable) data.published = values.published ? 1 : 0;
    Object.assign(data, r.extraColumns?.(values, existing) ?? {});
    if (r.slugFrom && !existing) data.slug = await uniqueSlug(db, r.table, slugify(values[r.slugFrom] ?? ""));

    const cols = Object.keys(data);
    let newId = id;
    if (existing) {
      await db.prepare(`UPDATE ${r.table} SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...cols.map((k) => data[k]), id).run();
      await audit(c.env, session, "ändrade", r.singular, id, values[r.slugFrom ?? r.fields[0]!.name]);
    } else {
      const res = await db.prepare(`INSERT INTO ${r.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((k) => data[k])).run();
      newId = res.meta.last_row_id;
      await audit(c.env, session, "skapade", r.singular, newId, values[r.slugFrom ?? r.fields[0]!.name]);
    }
    for (const k of oldFiles) await deleteFile(c.env, k);
    return redirect(`/admin/${r.path}?klart=${existing ? "sparat" : "skapat"}`, 303);
  };
}

export function deleteHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const form = await c.req.formData();
    if (!checkCsrf(c, session, form)) return redirect(`/admin/${r.path}?fel=csrf`, 303);
    const id = Number(c.params.id);
    const row = await c.env.DB.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(id).first<Row>();
    if (row) {
      await c.env.DB.prepare(`DELETE FROM ${r.table} WHERE id = ?`).bind(id).run();
      for (const f of r.fields.filter((f) => f.upload)) await deleteFile(c.env, row[col(f)] as string | null);
      await audit(c.env, session, "tog bort", r.singular, id, r.titleOf(row));
    }
    return redirect(`/admin/${r.path}?klart=raderat`, 303);
  };
}

export function toggleHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const form = await c.req.formData();
    if (!checkCsrf(c, session, form)) return redirect(`/admin/${r.path}?fel=csrf`, 303);
    const id = Number(c.params.id);
    const row = await c.env.DB.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(id).first<Row>();
    if (!row) return redirect(`/admin/${r.path}`, 303);
    const next = row.published ? 0 : 1;
    const extra = r.extraColumns?.({ published: next ? "1" : "" }, row) ?? {};
    const sets = ["published = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
    await c.env.DB.prepare(`UPDATE ${r.table} SET ${sets.join(", ")} WHERE id = ?`).bind(next, ...Object.values(extra), id).run();
    await audit(c.env, session, next ? "publicerade" : "avpublicerade", r.singular, id, r.titleOf(row));
    return redirect(`/admin/${r.path}?klart=${next ? "publicerat" : "avpublicerat"}`, 303);
  };
}
