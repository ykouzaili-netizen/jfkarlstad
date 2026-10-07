import { instagramConfigured, parseStatus, STATUS_SETTING, syncInstagram } from "../lib/instagram.js";
import { html, type SafeHtml } from "../lib/html.js";
import { renderField, validate, errorSummary, type Errors, type FieldSpec, type Values } from "../lib/forms.js";
import { DOCUMENT_CATEGORIES, GALLERY_ALBUMS, HONOR_KINDS, JOB_KINDS, documentLinkKind, isGoogleLink } from "../lib/content.js";
import { eventDate, formatDate, formatDateTimeShort, formatDay, localToUtcSql, stockholmToday, utcSqlToLocal } from "../lib/format.js";
import { purgeIfUnused } from "../lib/media.js";
import { slugify } from "../lib/slug.js";
export { slugify };
import { redirect } from "../lib/http.js";
import { DEFAULT_SETTINGS } from "../lib/settings.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount, postButton, statusPill } from "./layout.js";
import { handleUpload, imageUploadField } from "./uploads.js";
import { jobTotals } from "./job-stats.js";

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
  /**
   * Filen raderas helt när den byts ut eller tas bort (personfoton, galleribilder och PDF:er – GDPR).
   * Annars ligger bilden kvar i bildbanken så att den kan återanvändas.
   */
  purge?: boolean;
  /** Publiceringstid: visas i svensk tid men sparas i UTC. */
  schedule?: boolean;
  /** Val som hämtas från databasen när formuläret visas (t.ex. vilken partner ett jobb hör till). */
  optionsFrom?: (db: D1Database) => Promise<{ value: string; label: string }[]>;
  /** Fältet finns bara i formuläret och sparas inte som en egen kolumn (beforeSave tar hand om det). */
  virtual?: boolean;
  /**
   * Fältet visas bara när ett annat fält (oftast ett radioval) har ett visst värde, t.ex. länk eller PDF.
   * Ett dolt fält töms när posten sparas – en dold fil tas bort som om man hade klickat "Ta bort".
   */
  showIf?: { field: string; value: string };
}

const shown = (f: AdminField, v: Values) => !f.showIf || v[f.showIf.field] === f.showIf.value;

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
  /** Extra validering mellan fält. existing = posten som den ser ut innan ändringen (null för en ny). */
  check?: (v: Values, existing: Row | null) => Errors;
  /** Extra kolumner vid sparning, t.ex. publiceringsdatum. */
  extraColumns?: (v: Values, existing: Row | null) => Record<string, unknown>;
  emptyText: string;
  /** Kan kopieras ("Kopiera" i listan) – kopian blir ett opublicerat utkast. */
  duplicable?: boolean;
  /** Vilket menyval i sidomenyn som ska vara markerat (för typer som visas som flikar). */
  navActive?: string;
  /** Flikar ovanför listan, t.ex. Styrelsen · Kursombud · Utmärkelser · Lediga uppdrag. */
  tabs?: { href: string; label: string }[];
  /** Extra knappar bredvid "Ny …" i listan. */
  listActions?: SafeHtml;
  /** Extra innehåll mellan rubriken och listan (t.ex. status för automatisk hämtning). */
  listIntro?: (c: RequestContext, session: Session) => Promise<SafeHtml | string>;
  /** Formulärvärden som inte är egna kolumner (t.ex. jobbets snabbval av arbetsgivare), räknade från raden. */
  toValues?: (row: Row) => Values;
  /** Körs efter valideringen och före sparning: kan fylla i värden och kolumner från databasen eller ge fel. */
  beforeSave?: (db: D1Database, values: Values, data: Record<string, unknown>) => Promise<Errors>;
  /** Listan hämtas med en egen fråga (t.ex. med antal jobb per arbetsgivare). */
  listQuery?: string;
  /** Extra ruta överst på redigeringssidan för en befintlig post (t.ex. annonsens statistik). */
  editIntro?: (db: D1Database, row: Row) => Promise<SafeHtml | string>;
  /** Körs efter sparning. true = stanna kvar på redigeringssidan (där editIntro visar en varning) i stället för listan. */
  stayAfterSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const BOARD_TABS = [
  { href: "/admin/styrelsen", label: "Styrelsen" },
  { href: "/admin/utskott", label: "Utskott" },
  { href: "/admin/kursombud", label: "Kursombud" },
  { href: "/admin/utmarkelser", label: "Utmärkelser" },
  { href: "/admin/uppdrag", label: "Lediga uppdrag" },
];
const JOB_TABS = [
  { href: "/admin/jobb", label: "Tjänster" },
  { href: "/admin/arbetsgivare", label: "Arbetsgivare" },
  { href: "/admin/jobb/statistik", label: "Statistik" },
];
const PARTNER_TABS = [
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/partners/statistik", label: "Statistik" },
];

const nowUtc = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/**
 * Kontrollerar om ett Google-dokument går att öppna utan inloggning. Google skickar anonyma besökare till
 * inloggningen när dokumentet bara är delat med vissa personer. Går kontrollen inte att göra (nätfel,
 * timeout, annat svar) visas ingenting – den får aldrig hindra någon från att arbeta.
 */
async function documentShareWarning(url: string): Promise<SafeHtml | string> {
  if (!isGoogleLink(url)) return "";
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "Accept-Language": "sv" } });
  } catch {
    return "";
  }
  const location = res.headers.get("location") ?? "";
  res.body?.cancel().catch(() => {});
  const toLogin = res.status >= 300 && res.status < 400 && /^https:\/\/accounts\.google\.com\//i.test(location);
  if (toLogin) {
    return html`<div class="alert alert-warn" role="status">
      <strong>Besökarna kan inte öppna dokumentet ännu.</strong>
      Det är bara delat med vissa personer, så den som klickar ombeds logga in på Google. Öppna dokumentet i Google,
      klicka på <em>Dela</em> och välj <em>Alla som har länken</em> under Allmän åtkomst (behörighet: Läsare).
    </div>`;
  }
  if (res.status === 404) {
    return html`<div class="alert alert-warn" role="status">
      <strong>Länken leder inte till något dokument.</strong> Det kan ha tagits bort eller flyttats. Kopiera länken på nytt i Google och klistra in den nedan.
    </div>`;
  }
  return "";
}

/** "Schemalagd · 6 okt 08:00" om publiceringstiden ligger i framtiden, annars vanlig status. */
function publishPill(r: Row, column: string, labels?: [string, string]): SafeHtml {
  const at = r[column] as string | null;
  if (r.published && at && at > nowUtc()) return html`<span class="pill pill-plan">${icon("clock", "icon icon-xs")}Schemalagd · ${formatDateTimeShort(at)}</span>`;
  return statusPill(!!r.published, labels?.[0], labels?.[1]);
}

const SCHEDULE_HELP = "Lämna tomt för att publicera direkt när du sparar. Välj en tid framåt för att schemalägga – då syns det automatiskt på webbplatsen vid den tiden.";

const thumb = (key: unknown, alt = "") => {
  const src = mediaUrl(typeof key === "string" ? key : null, "sm");
  return src ? html`<img class="thumb" src="${src}" alt="${alt}" width="56" height="56" loading="lazy">` : html`<span class="thumb thumb-empty" aria-hidden="true"></span>`;
};

const MARKDOWN_HELP =
  "Tom rad = nytt stycke. **fet text**, *kursiv*, [länktext](https://adress.se), rader som börjar med ”- ” blir en punktlista och ”## ” blir en underrubrik.";

/** Rutan överst under Instagram: status för den automatiska hämtningen, eller hur den slås på. */
async function instagramIntro(c: RequestContext, session: Session): Promise<SafeHtml> {
  if (!instagramConfigured(c.env)) {
    return html`<details class="admin-card insta-sync">
      <summary><strong>Vill du att de senaste inläggen hämtas automatiskt?</strong> <span class="muted">Valfritt – annars lägger du till inläggen här nedan.</span></summary>
      <div class="insta-sync-body">
        <p>Webbplatsen kan själv hämta de senaste inläggen från @jfkarlstad varje timme. Det kräver:</p>
        <ol>
          <li>att Instagramkontot är ett <strong>företags- eller kreatörskonto</strong> (gratis, ställs in i Instagram-appen),</li>
          <li>en <strong>nyckel från Meta</strong> (Instagram API med Instagram-inloggning) som läggs in som hemlighet i Cloudflare med namnet <code>INSTAGRAM_TOKEN</code>.</li>
        </ol>
        <p class="muted">Steg för steg finns i README under ”Instagram”. Bilderna sparas på webbplatsen – besökarnas webbläsare kontaktar aldrig Instagram.</p>
      </div>
    </details>`;
  }
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(STATUS_SETTING).first<{ value: string }>();
  const status = parseStatus(row?.value);
  return html`<div class="admin-card insta-sync is-on">
    <div>
      <p><strong>${icon("check", "icon icon-sm")} Automatisk hämtning är på.</strong> De senaste inläggen från Instagram hämtas varje timme.</p>
      ${status
        ? status.ok
          ? html`<p class="muted">Senast hämtat ${formatDateTimeShort(status.at)}${status.added ? ` – ${status.added} ${status.added === 1 ? "nytt inlägg" : "nya inlägg"}` : " – inga nya inlägg"}.</p>`
          : html`<p class="field-error">Senaste försöket (${formatDateTimeShort(status.at)}) misslyckades: ${status.error}</p>`
        : html`<p class="muted">Inget hämtat ännu.</p>`}
    </div>
    <form method="post" action="/admin/instagram/hamta">${csrfField(session)}<button class="btn btn-outline btn-sm" type="submit">${icon("history", "icon icon-sm")}Hämta nu</button></form>
  </div>`;
}

/** "Hämta nu" under Instagram. */
export async function instagramSyncSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/instagram?fel=csrf", 303);
  const status = await syncInstagram(c.env);
  await audit(c.env, session, "hämtade", "instagram", null, status.ok ? `${status.added ?? 0} nya inlägg` : "misslyckades");
  return redirect(`/admin/instagram?${status.ok ? "klart=sparat" : "fel=instagram"}`, 303);
}

/** Snabbvalet av arbetsgivare i jobbformuläret: partnerna först, sedan övriga arbetsgivare. */
async function employerOptions(db: D1Database): Promise<{ value: string; label: string }[]> {
  const [partners, companies] = await db.batch([
    db.prepare("SELECT id, name FROM partners ORDER BY name COLLATE NOCASE"),
    db.prepare("SELECT id, name FROM companies ORDER BY name COLLATE NOCASE"),
  ]);
  return [
    ...(partners!.results as { id: number; name: string }[]).map((p) => ({ value: `p:${p.id}`, label: `${p.name} (samarbetspartner)` })),
    ...(companies!.results as { id: number; name: string }[]).map((co) => ({ value: `c:${co.id}`, label: co.name })),
  ];
}

/** Jobbets arbetsgivare: valet i listan blir partner_id eller company_id, och namnet följer med. */
async function saveEmployer(db: D1Database, values: Values, data: Record<string, unknown>): Promise<Errors> {
  const m = /^([pc]):(\d+)$/.exec(values.employer_pick ?? "");
  data.partner_id = null;
  data.company_id = null;
  if (m) {
    const table = m[1] === "p" ? "partners" : "companies";
    const hit = await db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).bind(Number(m[2])).first<{ id: number; name: string }>();
    if (!hit) return { employer_pick: "Arbetsgivaren finns inte längre. Välj en annan i listan." };
    data[m[1] === "p" ? "partner_id" : "company_id"] = hit.id;
    values.employer = hit.name;
    return {};
  }
  if (!(values.employer ?? "").trim()) return { employer: "Välj arbetsgivaren i listan eller skriv namnet." };
  return {};
}

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
    duplicable: true,
    emptyText: "Inga nyheter ännu. Skriv den första!",
    fields: [
      { name: "title", label: "Rubrik", type: "text", required: true, max: 150 },
      { name: "excerpt", label: "Ingress", type: "textarea", rows: 3, max: 300, help: "En eller två meningar som sammanfattar nyheten. Visas på startsidan och i listan." },
      { name: "body", label: "Text", type: "textarea", rows: 14, max: 20000, help: MARKDOWN_HELP },
      { name: "image_key", label: "Bild", type: "text", upload: "image", nullable: true, help: "Valfri. Liggande bild fungerar bäst (t.ex. 1600 × 1000 px). Stora foton komprimeras automatiskt." },
      { name: "image_alt", label: "Bildbeskrivning (alt-text)", type: "text", max: 200, help: "Beskriv vad bilden visar för den som inte kan se den." },
      { name: "published_at", label: "Publiceringstid", type: "datetime-local", schedule: true, nullable: true, help: SCHEDULE_HELP + " Tiden visas också som nyhetens datum." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.image_key), className: "col-thumb" },
      { label: "Rubrik", render: (r) => html`<a class="row-title" href="/admin/nyheter/${r.id}">${String(r.title)}</a>` },
      { label: "Publicerad", render: (r) => (r.published_at ? formatDate(String(r.published_at)) : "–") },
      { label: "Status", render: (r) => publishPill(r, "published_at") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published && (!r.published_at || String(r.published_at) <= nowUtc()) ? `/aktuellt/${r.slug}` : null),
    extraColumns: (v, existing) => {
      const out: Record<string, unknown> = { updated_at: nowUtc() };
      // Publicerad utan vald tid = nu
      if (v.published === "1" && !(v.published_at ?? existing?.published_at)) out.published_at = out.updated_at;
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
    duplicable: true,
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
      { name: "publish_at", label: "Publicera på webbplatsen", type: "datetime-local", schedule: true, nullable: true, help: SCHEDULE_HELP },
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
      { label: "Status", render: (r) => publishPill(r, "publish_at") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published && (!r.publish_at || String(r.publish_at) <= nowUtc()) ? `/kalender/${r.slug}` : null),
    extraColumns: () => ({ updated_at: nowUtc() }),
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
    tabs: PARTNER_TABS,
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
    extraColumns: () => ({ updated_at: nowUtc() }),
  },
  {
    path: "styrelsen",
    table: "board_members",
    title: "Styrelsen",
    singular: "styrelseledamot",
    newLabel: "Lägg till ledamot",
    lead: "Visas på Om oss och på kontaktsidan. Byt ut alla när en ny styrelse har valts – checklistan under Styrelseskifte hjälper er.",
    orderBy: "sort_order, name",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    tabs: BOARD_TABS,
    emptyText: "Ingen i styrelsen är inlagd ännu.",
    fields: [
      { name: "name", label: "Namn", type: "text", required: true, max: 100 },
      { name: "role", label: "Roll", type: "text", required: true, max: 100, placeholder: "T.ex. Ordförande" },
      { name: "email", label: "E-post för rollen", type: "email", nullable: true, max: 200 },
      { name: "photo_key", label: "Foto", type: "text", upload: "image", nullable: true, purge: true, help: "Ladda bara upp ett foto om personen har sagt ja till att det publiceras (GDPR). Stående porträtt (ungefär 3:4) med ansiktet i övre halvan fungerar bäst. Utan foto visas initialerna. Fotot raderas helt när det tas bort." },
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
    navActive: "/admin/styrelsen",
    tabs: BOARD_TABS,
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
      { name: "photo_key", label: "Foto", type: "text", upload: "image", nullable: true, purge: true, help: "Ladda bara upp ett foto om personen har sagt ja till att det publiceras (GDPR)." },
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
    navActive: "/admin/styrelsen",
    tabs: BOARD_TABS,
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
      { name: "image_key", label: "Bild", type: "text", upload: "image", requiredOnCreate: true, purge: true, help: "JPG, PNG, WebP eller HEIC. Stora foton komprimeras automatiskt. Bilden raderas helt när den tas bort ur galleriet." },
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
    path: "instagram",
    table: "instagram_posts",
    title: "Instagram",
    singular: "inlägg",
    newLabel: "Lägg till inlägg",
    lead: "Inläggen visas i Instagram-avsnittet på startsidan. Lägg till dem här – eller låt webbplatsen hämta de senaste inläggen automatiskt (se rutan ovan). Utseende, antal och storlek väljer du under Texter och sidor → Startsidan → Instagram.",
    orderBy: "sort_order DESC, COALESCE(posted_at, created_at) DESC, id DESC",
    emptyText: "Inga inlägg ännu. Lägg till de senaste inläggen från @jfkarlstad, så visas de i ett bildspel på startsidan.",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    fields: [
      { name: "image_key", label: "Bild", type: "text", upload: "image", requiredOnCreate: true, help: "Spara bilden från inlägget och ladda upp den här. Kvadratiska eller stående (4:5) bilder blir snyggast." },
      { name: "permalink", label: "Länk till inlägget", type: "url", max: 300, help: "Öppna inlägget på Instagram och kopiera adressen, t.ex. https://www.instagram.com/p/… Lämna tomt för att länka till profilen." },
      { name: "caption", label: "Bildtext", type: "textarea", max: 600, help: "Visas under bilden (om bildtexter är påslagna) och läses upp för skärmläsare." },
      { name: "posted_at", label: "Publicerat på Instagram", type: "date", nullable: true, help: "Används för att visa de senaste inläggen först." },
      {
        name: "sort_order",
        label: "Placering",
        type: "select",
        options: [
          { value: "0", label: "Efter datum" },
          { value: "1", label: "Fäst först" },
        ],
      },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.image_key, ""), className: "col-thumb" },
      { label: "Inlägg", render: (r) => html`<a class="row-title" href="/admin/instagram/${r.id}">${String(r.caption || "Inlägg utan bildtext").slice(0, 70)}</a>${Number(r.sort_order) > 0 ? html` <span class="pill">Fäst först</span>` : ""}` },
      { label: "Datum", render: (r) => (r.posted_at ? formatDay(String(r.posted_at)) : "–") },
      { label: "Källa", render: (r) => (r.source === "auto" ? "Hämtat automatiskt" : "Tillagt för hand") },
    ],
    titleOf: (r) => String(r.caption || "Inlägg").slice(0, 60),
    publicUrl: (r) => (r.permalink ? String(r.permalink) : null),
    listIntro: instagramIntro,
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
    extraColumns: () => ({ updated_at: nowUtc() }),
  },
  {
    path: "dokument",
    table: "documents",
    title: "Dokument",
    singular: "dokument",
    newLabel: "Lägg till dokument",
    lead: "Stadgar, styrdokument och protokoll – som länk till Google Dokument eller som uppladdad PDF. Visas på sidan Dokument, grupperade per år.",
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
      {
        name: "source",
        label: "Var finns dokumentet?",
        type: "radio",
        required: true,
        virtual: true,
        options: [
          { value: "lank", label: "I Google Dokument", hint: "Klistra in länken. Ändringar du gör i Google syns direkt för besökarna." },
          { value: "pdf", label: "Som PDF-fil", hint: "Filen laddas upp hit. Passar för dokument som inte ska ändras, t.ex. justerade protokoll." },
        ],
      },
      {
        name: "link_url",
        label: "Länk till dokumentet",
        type: "url",
        nullable: true,
        max: 1000,
        showIf: { field: "source", value: "lank" },
        placeholder: "https://docs.google.com/document/d/…",
        help: "Kopiera länken via Dela → Kopiera länk i Google. Under Allmän åtkomst ska det stå ”Alla som har länken” – annars ombeds besökarna logga in. Kalkylark, presentationer och filer i Google Drive fungerar också.",
      },
      {
        name: "file_key",
        label: "PDF-fil",
        type: "text",
        upload: "pdf",
        nullable: true,
        purge: true,
        showIf: { field: "source", value: "pdf" },
        help: "Max 24 MB. Utan fil står det ”Laddas upp inom kort” på webbplatsen.",
      },
    ],
    listColumns: [
      { label: "Titel", render: (r) => html`<a class="row-title" href="/admin/dokument/${r.id}">${String(r.title)}</a>` },
      { label: "Kategori", render: (r) => DOCUMENT_CATEGORIES[r.category as keyof typeof DOCUMENT_CATEGORIES] ?? "" },
      { label: "År", render: (r) => String(r.year) },
      {
        label: "Fil",
        render: (r) =>
          r.link_url
            ? html`<span class="pill pill-on">${documentLinkKind(String(r.link_url)).startsWith("g") ? "Google" : "Länk"}</span>`
            : r.file_key
              ? html`<span class="pill pill-on">PDF</span>`
              : html`<span class="pill pill-warn">Saknas</span>`,
      },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published && (r.file_key || r.link_url) ? `/dokument/fil/${r.id}` : null),
    toValues: (r) => ({ source: r.file_key && !r.link_url ? "pdf" : "lank" }),
    // Byter man en uppladdad PDF mot en länk tas PDF:en bort – men bara när det faktiskt finns en länk att byta till.
    check: (v, existing): Errors =>
      v.source === "lank" && !v.link_url && existing?.file_key
        ? { link_url: "Klistra in länken till dokumentet. Vill du behålla den uppladdade PDF:en väljer du ”Som PDF-fil” i stället." }
        : {},
    editIntro: async (_db, row) => documentShareWarning(row.link_url ? String(row.link_url) : ""),
    stayAfterSave: async (data) => Boolean(data.published && data.link_url && (await documentShareWarning(String(data.link_url)))),
    extraColumns: () => ({ updated_at: nowUtc() }),
  },
  {
    path: "jobb",
    table: "jobs",
    title: "Jobb och praktik",
    singular: "tjänst",
    newLabel: "Lägg upp en tjänst",
    lead: "Praktikplatser, sommarnotarietjänster, trainee­program och jobb. Visas under Jobb och praktik och på partnerns sida. Annonsen försvinner automatiskt dagen efter sista ansökningsdag.",
    orderBy: "(deadline IS NOT NULL AND deadline < date('now')), deadline IS NULL, deadline, id DESC",
    listQuery:
      "SELECT j.*, COALESCE(p.logo_key, co.logo_key) AS employer_logo, (p.id IS NOT NULL) AS is_partner FROM jobs j LEFT JOIN partners p ON p.id = j.partner_id LEFT JOIN companies co ON co.id = j.company_id " +
      "ORDER BY (j.deadline IS NOT NULL AND j.deadline < date('now')), j.deadline IS NULL, j.deadline, j.id DESC",
    slugFrom: "title",
    publishable: true,
    duplicable: true,
    tabs: JOB_TABS,
    navActive: "/admin/jobb",
    emptyText: "Inga tjänster ännu. Har en partner eller annan arbetsgivare en praktikplats eller ett jobb? Lägg upp den här.",
    fields: [
      { name: "title", label: "Titel", type: "text", required: true, max: 150, placeholder: "T.ex. Sommarnotarie 2027" },
      {
        name: "employer_pick",
        label: "Arbetsgivare",
        type: "select",
        virtual: true,
        help: "Välj ur listan så kommer namnet och logotypen med automatiskt, och annonsen räknas i arbetsgivarens statistik. Finns arbetsgivaren inte? Lägg till den under fliken Arbetsgivare – eller lämna ”Välj …” och skriv namnet nedan.",
        optionsFrom: employerOptions,
      },
      { name: "employer", label: "Arbetsgivarens namn", type: "text", max: 120, help: "Behövs bara om arbetsgivaren inte finns i listan ovan." },
      {
        name: "kind",
        label: "Typ",
        type: "select",
        required: true,
        options: JOB_KINDS.map((k) => ({ value: k, label: DEFAULT_SETTINGS[`jobs_kind_${k}`] })),
      },
      { name: "location", label: "Ort", type: "text", max: 100, placeholder: "T.ex. Stockholm eller Distans" },
      { name: "summary", label: "Kort beskrivning", type: "textarea", rows: 2, max: 300, help: "En eller två meningar som visas i listan." },
      { name: "body", label: "Hela annonsen", type: "textarea", rows: 12, max: 20000, help: MARKDOWN_HELP },
      { name: "apply_url", label: "Länk till ansökan", type: "url", nullable: true, max: 500, help: "Arbetsgivarens ansökningssida. Klicken räknas i statistiken." },
      { name: "deadline", label: "Sista ansökningsdag", type: "date", nullable: true, help: "Lämna tomt för löpande urval." },
      { name: "publish_at", label: "Publicera på webbplatsen", type: "datetime-local", schedule: true, nullable: true, help: SCHEDULE_HELP },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.employer_logo, ""), className: "col-thumb" },
      { label: "Tjänst", render: (r) => html`<a class="row-title" href="/admin/jobb/${r.id}">${String(r.title)}</a>` },
      { label: "Arbetsgivare", render: (r) => html`${String(r.employer)}${r.is_partner ? html` <span class="pill">Partner</span>` : ""}` },
      { label: "Sista dag", render: (r) => (r.deadline ? html`${formatDay(String(r.deadline))}${String(r.deadline) < stockholmToday() ? html` <span class="pill pill-off">Utgången</span>` : ""}` : "Löpande") },
      { label: "Status", render: (r) => publishPill(r, "publish_at") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published && (!r.publish_at || String(r.publish_at) <= nowUtc()) ? `/karriar/${r.slug}` : null),
    extraColumns: () => ({ updated_at: nowUtc() }),

    toValues: (r) => ({ employer_pick: r.partner_id ? `p:${r.partner_id}` : r.company_id ? `c:${r.company_id}` : "" }),
    beforeSave: saveEmployer,
    editIntro: async (db, row) => {
      const s = await jobTotals(db, row.id);
      const n = (v: number) => v.toLocaleString("sv-SE");
      return html`<div class="admin-card job-stats-card">
        <div><span class="job-stats-num">${n(s.views)}</span><span class="job-stats-label">visningar av annonsen</span></div>
        <div><span class="job-stats-num">${n(s.applies)}</span><span class="job-stats-label">klick till ansökan</span></div>
        <div><span class="job-stats-num">${s.views ? `${Math.round((s.applies / s.views) * 100)} %` : "–"}</span><span class="job-stats-label">andel som klickade</span></div>
        <a class="arrow-link job-stats-more" href="/admin/jobb/statistik">Statistik per termin${icon("arrowRight", "icon icon-sm")}</a>
      </div>`;
    },
  },
  {
    path: "arbetsgivare",
    table: "companies",
    title: "Arbetsgivare",
    singular: "arbetsgivare",
    newLabel: "Lägg till arbetsgivare",
    lead: "Arbetsgivare som lägger upp jobb men inte är samarbetspartners – t.ex. myndigheter, domstolar och mindre byråer. Lägg in dem en gång, så väljer du dem med ett klick när du lägger upp en tjänst. Partnerna finns redan med i listan.",
    orderBy: "name COLLATE NOCASE",
    listQuery: "SELECT co.*, (SELECT COUNT(*) FROM jobs j WHERE j.company_id = co.id) AS job_count FROM companies co ORDER BY co.name COLLATE NOCASE",
    tabs: JOB_TABS,
    navActive: "/admin/jobb",
    emptyText: "Inga arbetsgivare ännu. Lägg till de arbetsgivare som brukar annonsera hos er, så kan du välja dem med ett klick när du lägger upp en tjänst.",
    fields: [
      { name: "name", label: "Namn", type: "text", required: true, max: 120, placeholder: "T.ex. Förvaltningsrätten i Karlstad" },
      { name: "logo_key", label: "Logotyp", type: "text", upload: "image", nullable: true, help: "Visas på arbetsgivarens jobbannonser. En liggande logotyp med genomskinlig bakgrund (PNG eller SVG) blir finast." },
      { name: "website_url", label: "Webbplats", type: "url", nullable: true, max: 300 },
      { name: "notes", label: "Anteckningar", type: "textarea", rows: 3, max: 2000, help: "Syns bara i adminpanelen – t.ex. kontaktperson eller när ni senast hördes." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.logo_key, ""), className: "col-thumb" },
      { label: "Arbetsgivare", render: (r) => html`<a class="row-title" href="/admin/arbetsgivare/${r.id}">${String(r.name)}</a>` },
      { label: "Tjänster", render: (r) => (Number(r.job_count) ? String(r.job_count) : "–") },
      { label: "Ny tjänst", render: (r) => html`<a class="btn btn-outline btn-sm" href="/admin/jobb/ny?arbetsgivare=${r.id}">+ Lägg upp en tjänst</a>` },
    ],
    titleOf: (r) => String(r.name),
    extraColumns: () => ({ updated_at: nowUtc() }),
  },
  {
    path: "utskott",
    table: "committees",
    title: "Utskott",
    singular: "utskott",
    newLabel: "Lägg till utskott",
    lead: "Utskotten visas som kort på Om oss och Engagera dig. På Engagera dig kan besökare klicka på ett utskott och läsa den långa beskrivningen med bilder – och anmäla intresse direkt.",
    orderBy: "sort_order, id",
    slugFrom: "name",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    navActive: "/admin/styrelsen",
    tabs: BOARD_TABS,
    emptyText: "Inga utskott ännu. Lägg till föreningens utskott, så visas de på Om oss och Engagera dig.",
    fields: [
      { name: "name", label: "Namn", type: "text", required: true, max: 100, placeholder: "T.ex. Arbetsmarknadsutskottet" },
      { name: "summary", label: "Kort beskrivning", type: "textarea", rows: 2, max: 300, help: "En eller två meningar. Visas på korten innan man klickar." },
      { name: "body", label: "Hela beskrivningen", type: "textarea", rows: 12, max: 8000, help: `Visas när man klickar på utskottet: vad ni gör, hur ett år ser ut och vad man får ut av att vara med. ${MARKDOWN_HELP}` },
      { name: "commitment", label: "Tidsåtgång", type: "text", max: 120, placeholder: "T.ex. Ett par timmar i veckan" },
      { name: "image_1_key", label: "Bild 1 (visas på kortet)", type: "text", upload: "image", nullable: true, help: "Liggande bild fungerar bäst. Bild 1 visas även på kortet innan man klickar." },
      { name: "image_1_alt", label: "Bild 1 – bildbeskrivning", type: "text", max: 200 },
      { name: "image_2_key", label: "Bild 2", type: "text", upload: "image", nullable: true },
      { name: "image_2_alt", label: "Bild 2 – bildbeskrivning", type: "text", max: 200 },
      { name: "image_3_key", label: "Bild 3", type: "text", upload: "image", nullable: true },
      { name: "image_3_alt", label: "Bild 3 – bildbeskrivning", type: "text", max: 200 },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999, help: "Lägre tal visas först." },
    ],
    listColumns: [
      { label: "", render: (r) => thumb(r.image_1_key, ""), className: "col-thumb" },
      { label: "Utskott", render: (r) => html`<a class="row-title" href="/admin/utskott/${r.id}">${String(r.name)}</a>` },
      { label: "Bilder", render: (r) => String([r.image_1_key, r.image_2_key, r.image_3_key].filter(Boolean).length) },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.name),
    publicUrl: (r) => (r.published ? `/engagera-dig#utskott-${r.slug}` : null),
    extraColumns: () => ({ updated_at: nowUtc() }),
  },
  {
    path: "uppdrag",
    table: "positions",
    title: "Lediga uppdrag",
    singular: "uppdrag",
    newLabel: "Lägg till uppdrag",
    lead: "Poster och uppgifter ni söker folk till. Visas på sidan Engagera dig, där studenter kan anmäla intresse. Anmälningarna kommer till Meddelanden.",
    orderBy: "sort_order, id",
    publishable: true,
    publishLabels: ["Visas", "Dold"],
    navActive: "/admin/styrelsen",
    tabs: BOARD_TABS,
    emptyText: "Inga uppdrag är utlysta. Utan uppdrag visar Engagera dig bara utskotten och intresseformuläret.",
    fields: [
      { name: "title", label: "Uppdrag", type: "text", required: true, max: 120, placeholder: "T.ex. Sexmästare eller Ledamot i arbetsmarknadsutskottet" },
      { name: "committee", label: "Utskott eller grupp", type: "text", max: 80 },
      { name: "description", label: "Beskrivning", type: "textarea", rows: 5, max: 2000, help: "Vad gör man? Vad får man ut av det? Tom rad = nytt stycke." },
      { name: "commitment", label: "Tidsåtgång", type: "text", max: 100, placeholder: "T.ex. Ett par timmar i veckan" },
      { name: "open_until", label: "Sök senast", type: "date", nullable: true, help: "Uppdraget döljs automatiskt efter det här datumet. Lämna tomt för tills vidare." },
      { name: "sort_order", label: "Ordning", type: "number", min: 0, max: 999, help: "Lägre tal visas först." },
    ],
    listColumns: [
      { label: "Uppdrag", render: (r) => html`<a class="row-title" href="/admin/uppdrag/${r.id}">${String(r.title)}</a>` },
      { label: "Utskott", render: (r) => String(r.committee || "–") },
      { label: "Sök senast", render: (r) => (r.open_until ? formatDay(String(r.open_until)) : "Tills vidare") },
      { label: "Status", render: (r) => statusPill(!!r.published, "Visas", "Dold") },
    ],
    titleOf: (r) => String(r.title),
    publicUrl: (r) => (r.published ? `/engagera-dig` : null),
    extraColumns: () => ({ updated_at: nowUtc() }),
  }
];

// ───────────────────────── Hjälpfunktioner ─────────────────────────

const col = (f: AdminField) => f.column ?? f.name;


async function uniqueSlug(db: D1Database, table: string, base: string, exceptId?: number): Promise<string> {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const hit = await db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(slug, exceptId ?? 0).first();
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Fyll i val som hämtas från databasen (t.ex. listan med partners). */
async function resolveFields(r: Resource, db: D1Database): Promise<AdminField[]> {
  return Promise.all(r.fields.map(async (f) => (f.optionsFrom ? { ...f, options: await f.optionsFrom(db) } : f)));
}

function rowToValues(fields: AdminField[], r: Resource, row: Row | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const val = row?.[col(f)];
    v[f.name] = val == null ? "" : f.type === "checkbox" ? (val ? "1" : "") : f.schedule ? utcSqlToLocal(String(val)) : String(val);
  }
  if (r.publishable) v.published = row ? (row.published ? "1" : "") : "";
  if (row && r.toValues) Object.assign(v, r.toValues(row));
  return v;
}

function editForm(r: Resource, fields: AdminField[], session: Session, action: string, values: Values, errors: Errors, isNew: boolean): SafeHtml {
  const hasUpload = fields.some((f) => f.upload);
  return html`<form class="admin-form" method="post" action="${action}"${hasUpload ? html` enctype="multipart/form-data"` : ""} novalidate data-dirty-check>
    ${csrfField(session)}
    ${errorSummary(errors, fields)}
    <div class="admin-card">
      ${fields
        .filter((f) => !f.schedule)
        .map((f) => {
          const field = f.upload
            ? imageUploadField({ name: f.name, label: f.label, current: values[f.name] ?? "", help: f.help, error: errors[f.name], required: f.requiredOnCreate, removable: !f.requiredOnCreate, kind: f.upload })
            : renderField(f, values[f.name] ?? "", errors[f.name]);
          return f.showIf
            ? html`<div class="show-if" data-show-if="${f.showIf.field}" data-show-value="${f.showIf.value}"${shown(f, values) ? "" : html` hidden`}>${field}</div>`
            : field;
        })}
    </div>
    ${r.publishable
      ? html`<div class="admin-card admin-card-inline publish-card">
          <label class="switch">
            <input type="checkbox" name="published" value="1"${values.published ? html` checked` : ""}>
            <span class="switch-track" aria-hidden="true"></span>
            <span><strong>${r.publishLabels ? "Visa på webbplatsen" : "Publicera"}</strong><span class="field-help">${r.publishLabels ? "Avbocka för att dölja utan att ta bort." : "Avbocka för att spara som utkast som bara syns här."}</span></span>
          </label>
          ${fields.filter((f) => f.schedule).map((f) => html`<div class="schedule-field">${renderField(f, values[f.name] ?? "", errors[f.name])}</div>`)}
        </div>`
      : ""}
    <div class="admin-form-actions">
      <button class="btn btn-primary btn-lg" type="submit">${isNew ? "Skapa" : "Spara ändringar"}</button>
      <a class="btn btn-outline" href="/admin/${r.path}">Avbryt</a>
    </div>
  </form>`;
}

export function resourceTabs(tabs: { href: string; label: string }[] | undefined, current: string): SafeHtml | string {
  if (!tabs) return "";
  return html`<nav class="tabs" aria-label="Avsnitt"><ul>${tabs.map((t) => html`<li><a href="${t.href}"${t.href === current ? html` aria-current="page"` : ""}>${t.label}</a></li>`)}</ul></nav>`;
}

// ───────────────────────── Handlers ─────────────────────────

export function listHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const { results } = await c.env.DB.prepare(r.listQuery ?? `SELECT * FROM ${r.table} ORDER BY ${r.orderBy}`).all<Row>();
    const content = html`
      ${adminHead(r.title, { lead: r.lead, actions: html`${r.listActions ?? ""}<a class="btn btn-primary" href="/admin/${r.path}/ny">+ ${r.newLabel}</a>` })}
      ${resourceTabs(r.tabs, `/admin/${r.path}`)}
      ${r.listIntro ? await r.listIntro(c, session) : ""}
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
                        ${r.duplicable ? postButton(session, `/admin/${r.path}/${row.id}/kopiera`, "Kopiera") : ""}
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
    return adminLayout(c, session, { title: r.title, active: r.navActive ?? `/admin/${r.path}`, newCount: await newMessageCount(c.env.DB) }, content);
  };
}

export function newHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const fields = await resolveFields(r, c.env.DB);
    const values = rowToValues(fields, r, null);
    if (r.publishable) values.published = "1";
    for (const f of fields) if (f.type === "number" && f.name === "sort_order") values[f.name] = "0";
    if (r.path === "dokument") {
      values.year = String(new Date().getFullYear());
      values.source = "lank";
    }
    if (r.path === "jobb") values.kind = "praktik";
    // "Lägg upp en tjänst" från en partner eller arbetsgivare förväljer den
    const q = c.url.searchParams;
    const pre = q.get("partner") ? `p:${q.get("partner")}` : q.get("arbetsgivare") ? `c:${q.get("arbetsgivare")}` : "";
    if (r.path === "jobb" && pre && fields.find((f) => f.name === "employer_pick")?.options?.some((o) => o.value === pre)) values.employer_pick = pre;
    return renderEdit(c, session, r, fields, null, values, {});
  };
}

export function editHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(Number(c.params.id)).first<Row>();
    if (!row) return redirect(`/admin/${r.path}`, 303);
    const fields = await resolveFields(r, c.env.DB);
    return renderEdit(c, session, r, fields, row, rowToValues(fields, r, row), {});
  };
}

async function renderEdit(c: RequestContext, session: Session, r: Resource, fields: AdminField[], row: Row | null, values: Values, errors: Errors, status = 200): Promise<Response> {
  const isNew = !row;
  const pub = row && r.publicUrl?.(row);
  const content = html`
    ${adminHead(isNew ? r.newLabel : `Redigera ${r.singular}`, {
      back: { href: `/admin/${r.path}`, label: r.title },
      actions: row
        ? html`${pub ? html`<a class="btn btn-outline btn-sm" href="${pub}" target="_blank" rel="noopener">${icon("external", "icon icon-sm")}Visa på webbplatsen</a>` : ""}
            ${r.duplicable ? postButton(session, `/admin/${r.path}/${row.id}/kopiera`, "Kopiera") : ""}
            ${r.path === "partners" ? html`<a class="btn btn-outline btn-sm" href="/admin/jobb/ny?partner=${row.id}">+ Lägg upp en tjänst</a>` : ""}
            ${r.path === "arbetsgivare" ? html`<a class="btn btn-outline btn-sm" href="/admin/jobb/ny?arbetsgivare=${row.id}">+ Lägg upp en tjänst</a>` : ""}`
        : undefined,
    })}
    ${row && r.editIntro ? await r.editIntro(c.env.DB, row) : ""}
    ${editForm(r, fields, session, isNew ? `/admin/${r.path}/ny` : `/admin/${r.path}/${row!.id}`, values, errors, isNew)}
  `;
  return adminLayout(c, session, { title: isNew ? r.newLabel : `Redigera ${r.singular}`, active: r.navActive ?? `/admin/${r.path}`, newCount: await newMessageCount(c.env.DB), narrow: true }, content, status);
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

    const fields = await resolveFields(r, db);
    const plain = fields.filter((f) => !f.upload);
    const { values, errors } = validate(plain, form);
    // Dolda fält (showIf) töms – det man inte ser ska inte sparas eller ge felmeddelanden.
    for (const f of plain) {
      if (shown(f, values)) continue;
      values[f.name] = "";
      delete errors[f.name];
    }
    Object.assign(errors, r.check?.(values, existing) ?? {});
    values.published = form.get("published") ? "1" : "";

    // Filer
    const fileCols: Record<string, string | null> = {};
    const released: { key: string; purge: boolean }[] = [];
    let fileSize: number | null = null;
    for (const f of fields.filter((f) => f.upload)) {
      const current = existing ? ((existing[col(f)] as string | null) ?? "") : "";
      values[f.name] = current;
      if (!shown(f, values)) {
        // Dold fil (t.ex. PDF när man valt länk): tas bort om posten sparas utan fel.
        if (current) {
          fileCols[col(f)] = null;
          released.push({ key: current, purge: !!f.purge });
        }
        values[f.name] = "";
        continue;
      }
      const res = await handleUpload(c.env, form, f.name, f.upload!, r.path, session.user.email);
      if (!res.ok) {
        errors[f.name] = res.error;
        continue;
      }
      if (res.key) {
        fileCols[col(f)] = res.key;
        if (current && current !== res.key) released.push({ key: current, purge: !!f.purge });
        if (!res.reused) fileSize = res.size;
        values[f.name] = res.key;
      } else if (form.get(`${f.name}__ta_bort`) && current) {
        fileCols[col(f)] = null;
        released.push({ key: current, purge: !!f.purge });
        values[f.name] = "";
      }
      if (f.requiredOnCreate && !values[f.name]) errors[f.name] = "Välj en fil att ladda upp.";
    }

    if (Object.keys(errors).length) {
      // Nyuppladdade filer ligger kvar i bildbanken – inget går förlorat om man rättar felet och sparar igen.
      for (const f of fields.filter((f) => f.upload)) values[f.name] = existing ? String(existing[col(f)] ?? "") : "";
      return renderEdit(c, session, r, fields, existing, values, errors, 422);
    }

    const data: Record<string, unknown> = {};
    if (r.beforeSave) {
      Object.assign(errors, await r.beforeSave(db, values, data));
      if (Object.keys(errors).length) {
        for (const f of fields.filter((f) => f.upload)) values[f.name] = existing ? String(existing[col(f)] ?? "") : "";
        return renderEdit(c, session, r, fields, existing, values, errors, 422);
      }
    }
    for (const f of plain) {
      if (f.virtual) continue;
      const v = values[f.name] ?? "";
      if (f.type === "checkbox") data[col(f)] = v ? 1 : 0;
      else if (f.schedule) data[col(f)] = localToUtcSql(v);
      else if (f.type === "number" || (f.type === "select" && f.name.endsWith("_id"))) data[col(f)] = v === "" ? (f.nullable ? null : 0) : parseInt(v, 10);
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
    for (const f of released) if (f.purge) await purgeIfUnused(c.env, f.key);
    const scheduled = fields.some((f) => f.schedule && data[col(f)] && String(data[col(f)]) > nowUtc()) && values.published;
    if (r.stayAfterSave && (await r.stayAfterSave(data))) return redirect(`/admin/${r.path}/${newId}?klart=sparat`, 303);
    return redirect(`/admin/${r.path}?klart=${scheduled ? "schemalagt" : existing ? "sparat" : "skapat"}`, 303);
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
      // Personfoton, galleribilder och PDF:er raderas helt. Övriga bilder ligger kvar i bildbanken.
      for (const f of r.fields.filter((f) => f.upload && f.purge)) await purgeIfUnused(c.env, row[col(f)] as string | null);
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

/** Kopiera en post (t.ex. ett återkommande event). Kopian blir ett opublicerat utkast. */
export function duplicateHandler(r: Resource) {
  return async (c: RequestContext, session: Session): Promise<Response> => {
    const form = await c.req.formData();
    if (!checkCsrf(c, session, form)) return redirect(`/admin/${r.path}?fel=csrf`, 303);
    const db = c.env.DB;
    const row = await db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).bind(Number(c.params.id)).first<Row>();
    if (!row) return redirect(`/admin/${r.path}`, 303);
    const skip = new Set(["id", "created_at", "updated_at", "slug", "published", "published_at", "publish_at"]);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (!skip.has(k)) data[k] = v;
    const titleCol = r.slugFrom ?? "title";
    data[titleCol] = `${String(row[titleCol] ?? "").slice(0, 140)} (kopia)`;
    data.published = 0;
    if (r.slugFrom) data.slug = await uniqueSlug(db, r.table, slugify(String(data[titleCol])));
    const cols = Object.keys(data);
    const res = await db.prepare(`INSERT INTO ${r.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((k) => data[k])).run();
    await audit(c.env, session, "kopierade", r.singular, res.meta.last_row_id, String(row[titleCol] ?? ""));
    return redirect(`/admin/${r.path}/${res.meta.last_row_id}?klart=kopierat`, 303);
  };
}
