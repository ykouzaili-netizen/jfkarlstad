import { html, paragraphs, raw, type SafeHtml } from "../lib/html.js";
import { DEFAULT_SETTINGS, HEADING_FONTS, THEME_KEYS, headingFont, loadSettings, type SettingKey, type Settings } from "../lib/settings.js";
import { contrastRatio, isHex, readableOn } from "../lib/color.js";
import { renderField, validate, errorSummary, type Errors, type FieldSpec } from "../lib/forms.js";
import { eventDate, formatDate, formatDateTimeShort, stockholmNow } from "../lib/format.js";
import { redirect } from "../lib/http.js";
import { deleteFile } from "../lib/storage.js";
import { mailConfigured, sendMail } from "../lib/mail.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import {
  ROLE_LABELS,
  audit,
  checkCsrf,
  createResetToken,
  destroyUserSessions,
  hashPassword,
  passwordProblem,
  verifyPassword,
  MIN_PASSWORD,
  type Role,
  type Session,
  type User,
} from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount, postButton } from "./layout.js";
import { handleUpload, uploadInput } from "./uploads.js";
import { saveSettings } from "./texts.js";
import { PREVIEW_PAGES, deviceSwitch, previewPane } from "./preview.js";
import { handoverProgress } from "./handover.js";
import { FORM_LABELS as FORM_NAMES } from "../pages/forms.js";

const FORM_LABELS: Record<string, string> = FORM_NAMES;

const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

// ───────────────────────── Översikt ─────────────────────────

export async function dashboard(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const isAdmin = session.user.role === "admin";
  const [msgs, waiting, events, counts, scheduled, log] = await db.batch([
    db.prepare("SELECT id, form, subject, name, anonymous, created_at FROM submissions WHERE status = 'ny' ORDER BY created_at DESC LIMIT 5"),
    db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'ny' AND created_at <= datetime('now', '-7 days')"),
    db.prepare("SELECT id, title, starts_at, ends_at, published, publish_at FROM events WHERE COALESCE(ends_at, substr(starts_at,1,10) || 'T23:59') >= ? ORDER BY starts_at LIMIT 4").bind(stockholmNow()),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM news WHERE published = 0) AS news,
              (SELECT COUNT(*) FROM documents WHERE file_key IS NULL) AS docs,
              (SELECT COUNT(*) FROM partners WHERE published = 1 AND (logo_key IS NULL OR logo_key = '')) AS logos,
              (SELECT COUNT(*) FROM jobs WHERE published = 1 AND deadline IS NOT NULL AND deadline < date('now')) AS expired`,
    ),
    db.prepare(
      `SELECT 'nyheter' AS path, id, title, published_at AS at FROM news WHERE published = 1 AND published_at > datetime('now')
       UNION ALL SELECT 'event', id, title, publish_at FROM events WHERE published = 1 AND publish_at > datetime('now')
       UNION ALL SELECT 'jobb', id, title, publish_at FROM jobs WHERE published = 1 AND publish_at > datetime('now')
       ORDER BY at LIMIT 5`,
    ),
    db.prepare("SELECT action, entity, summary, user_email, created_at FROM audit_log ORDER BY id DESC LIMIT 6"),
  ]);
  const newMsgs = msgs!.results as { id: number; form: string; subject: string; name: string | null; anonymous: number; created_at: string }[];
  const oldWaiting = ((waiting!.results[0] as { n?: number } | undefined)?.n ?? 0) as number;
  const upcoming = events!.results as { id: number; title: string; starts_at: string; ends_at: string | null; published: number; publish_at: string | null }[];
  const todo = (counts!.results[0] ?? {}) as { news?: number; docs?: number; logos?: number; expired?: number };
  const planned = scheduled!.results as { path: string; id: number; title: string; at: string }[];
  const recent = log!.results as { action: string; entity: string; summary: string | null; user_email: string | null; created_at: string }[];
  const newCount = await newMessageCount(db);
  const smtp = mailConfigured(c.env);
  const s = await loadSettings(db);
  let handover: { done: number; total: number } | null = null;
  if (isAdmin) handover = handoverProgress(s);

  const quick = [
    { href: "/admin/nyheter/ny", label: "Skriv en nyhet", icon: "megaphone" as const },
    { href: "/admin/event/ny", label: "Lägg till event", icon: "calendar" as const },
    { href: "/admin/jobb/ny", label: "Lägg upp ett jobb", icon: "briefcase" as const },
    { href: "/admin/texter", label: "Ändra texter", icon: "edit" as const },
  ];

  const todoItems = [
    todo.news ? html`<li><a href="/admin/nyheter">${todo.news} ${todo.news === 1 ? "opublicerad nyhet" : "opublicerade nyheter"}</a></li>` : "",
    todo.docs ? html`<li><a href="/admin/dokument">${todo.docs} dokument saknar PDF</a></li>` : "",
    todo.logos ? html`<li><a href="/admin/partners">${todo.logos} ${todo.logos === 1 ? "partner saknar" : "partners saknar"} logotyp</a></li>` : "",
    todo.expired ? html`<li><a href="/admin/jobb">${todo.expired} ${todo.expired === 1 ? "jobbannons har" : "jobbannonser har"} gått ut – ta bort eller förläng</a></li>` : "",
    !s.hero_image_key ? html`<li><a href="/admin/texter?sida=startsida&falt=hero_image_key">Ladda upp en bild överst på startsidan</a></li>` : "",
    isAdmin && !s.logo_key ? html`<li><a href="/admin/utseende#logotyp">Ladda upp föreningens logotyp</a></li>` : "",
    isAdmin && !s.org_number ? html`<li><a href="/admin/texter?sida=gemensamt&falt=org_number">Fyll i organisationsnumret</a></li>` : "",
    handover && handover.done < handover.total
      ? html`<li><a href="/admin/styrelseskifte">Styrelseskifte: ${handover.done} av ${handover.total} steg klara</a></li>`
      : "",
  ].filter(Boolean);

  const content = html`
    ${adminHead(`Hej ${session.user.name.split(" ")[0]}!`, { lead: "Här är en snabb överblick. Klicka på något på webbplatsen till höger för att ändra det." })}
    <div class="dash-layout">
      <div class="dash-main">
        <ul class="quick-grid">
          ${quick.map((q) => html`<li><a class="quick-card" href="${q.href}">${icon(q.icon)}<span>${q.label}</span></a></li>`)}
        </ul>
        ${!smtp
          ? html`<div class="alert alert-warn">E-postnotiser är inte inställda ännu, så nya meddelanden syns bara här i panelen. ${isAdmin ? "Se README:n för hur du lägger in SMTP-uppgifterna." : ""}</div>`
          : ""}
        ${oldWaiting
          ? html`<div class="alert alert-warn"><strong>${oldWaiting} ${oldWaiting === 1 ? "meddelande har" : "meddelanden har"} väntat på svar i mer än en vecka.</strong> <a href="/admin/meddelanden">Visa meddelandena</a></div>`
          : ""}
        <div class="dash-grid">
          <section class="admin-card">
            <div class="card-head"><h2 class="card-heading">Nya meddelanden ${newCount ? html`<span class="badge">${newCount}</span>` : ""}</h2><a href="/admin/meddelanden">Alla →</a></div>
            ${newMsgs.length
              ? html`<ul class="dash-list">${newMsgs.map((m) => html`<li><a href="/admin/meddelanden/${m.id}"><strong>${m.subject}</strong><span class="muted">${FORM_LABELS[m.form] ?? m.form} · ${m.anonymous ? "Anonym" : (m.name ?? "–")} · ${formatDate(m.created_at)}</span></a></li>`)}</ul>`
              : html`<p class="muted">Inga nya meddelanden. Skönt!</p>`}
          </section>
          <section class="admin-card">
            <div class="card-head"><h2 class="card-heading">Kommande event</h2><a href="/admin/event">Alla →</a></div>
            ${upcoming.length
              ? html`<ul class="dash-list">${upcoming.map((e) => {
                  const d = eventDate(e.starts_at, e.ends_at);
                  return html`<li><a href="/admin/event/${e.id}"><strong>${e.title}</strong><span class="muted">${d ? `${d.weekday} ${d.day} ${d.monthShort}, ${d.time}` : ""}${e.published ? "" : " · Utkast"}</span></a></li>`;
                })}</ul>`
              : html`<p class="muted">Inga kommande event. <a href="/admin/event/ny">Lägg till ett</a>.</p>`}
          </section>
          ${planned.length
            ? html`<section class="admin-card">
                <h2 class="card-heading">Schemalagt</h2>
                <ul class="dash-list">${planned.map((p) => html`<li><a href="/admin/${p.path}/${p.id}"><strong>${p.title}</strong><span class="muted">Publiceras ${formatDateTimeShort(p.at)}</span></a></li>`)}</ul>
              </section>`
            : ""}
          <section class="admin-card">
            <h2 class="card-heading">Att göra</h2>
            ${todoItems.length ? html`<ul class="todo-list">${todoItems}</ul>` : html`<p class="muted">${icon("check", "icon icon-sm")} Inget som väntar. Bra jobbat!</p>`}
          </section>
          ${isAdmin
            ? html`<section class="admin-card">
                <div class="card-head"><h2 class="card-heading">Senaste ändringarna</h2><a href="/admin/logg">Hela loggen →</a></div>
                <ul class="dash-list dash-list-plain">${recent.map((r) => html`<li><span>${r.user_email ?? "System"} ${[r.action, r.entity].filter(Boolean).join(" ")}${r.summary ? html` <em>${r.summary}</em>` : ""}</span><span class="muted">${formatDateTime(r.created_at)}</span></li>`)}</ul>
              </section>`
            : ""}
        </div>
      </div>
      ${siteMapCard()}
    </div>`;
  return adminLayout(c, session, { title: "Översikt", active: "/admin", newCount, wide: true }, content);
}

/** Den klickbara webbplatsen på Översikt. */
function siteMapCard(): SafeHtml {
  return html`<section class="site-map" aria-labelledby="webbplatsen-rubrik" data-site-map>
    <div class="lp-head">
      <div class="lp-title"><span class="lp-dot" aria-hidden="true"></span><h2 class="site-map-title" id="webbplatsen-rubrik">Din webbplats</h2></div>
      <div class="lp-controls">
        <label class="sr-only" for="karta-sida">Sida</label>
        <select id="karta-sida" class="lp-select" data-map-page>
          ${PREVIEW_PAGES.map((p) => html`<option value="${p.path}">${p.label}</option>`)}
        </select>
        ${deviceSwitch()}
      </div>
    </div>
    <div class="lp-viewport" data-lp-viewport>
      <iframe src="/admin/webbplatsen?sida=%2F" title="Webbplatsen – klicka på det du vill ändra" data-map-frame tabindex="-1" loading="lazy"></iframe>
      <div class="lp-loading" data-lp-loading>Laddar webbplatsen …</div>
    </div>
    <p class="lp-note">${icon("edit", "icon icon-sm")} <span><strong>Klicka på det du vill ändra</strong> – en text, en bild, ett event eller menyn – så kommer du direkt rätt. Hittar du inte? <a href="/admin/sok">Sök efter texten</a>.</span></p>
  </section>`;
}

function formatDateTime(utc: string): string {
  const d = new Date(utc.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return utc;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium", timeStyle: "short" }).format(d);
}

// ───────────────────────── Utseende ─────────────────────────

const COLOR_FIELDS: { key: (typeof THEME_KEYS)[number]; label: string; help: string }[] = [
  { key: "color_background", label: "Bakgrund", help: "Sidans bakgrundsfärg." },
  { key: "color_surface", label: "Kort och ytor", help: "Bakgrund på kort, rutor och vissa sektioner." },
  { key: "color_text", label: "Text", help: "Färgen på all vanlig text och rubriker." },
  { key: "color_primary", label: "Primärfärg", help: "Mörka ytor: sidfoten, datumrutor och JF Påverka-rutan." },
  { key: "color_accent", label: "Accentfärg", help: "Markeringar, ikoner, understrykningar och datumbrickor." },
  { key: "color_button", label: "Knappar", help: "Bakgrund på knapparna, t.ex. ”Bli medlem”." },
];

export function contrastWarnings(colors: Record<string, string>): string[] {
  const w: string[] = [];
  const get = (k: string) => (isHex(colors[k]) ? colors[k]! : DEFAULT_SETTINGS[k as SettingKey]);
  const check = (fg: string, bg: string, what: string, min = 4.5) => {
    const r = contrastRatio(fg, bg);
    if (r < min) w.push(`${what}: kontrasten är ${r.toFixed(1).replace(".", ",")}:1 (minst ${String(min).replace(".", ",")}:1 krävs för att vara lättläst).`);
  };
  check(get("color_text"), get("color_background"), "Text på bakgrunden");
  check(get("color_text"), get("color_surface"), "Text på kort och ytor");
  const btn = get("color_button");
  check(readableOn(btn), btn, "Text på knapparna");
  const primary = get("color_primary");
  check(readableOn(primary), primary, "Text på primärfärgen");
  check(get("color_accent"), primary, "Accentfärgen på primärfärgen (rubriketiketter)", 3);
  return w;
}

export async function appearancePage(c: RequestContext, session: Session, override?: Partial<Settings>, errors: Errors = {}, status = 200): Promise<Response> {
  const s = { ...(await loadSettings(c.env.DB)), ...override } as Settings;
  const warnings = contrastWarnings(s);
  const logo = mediaUrl(s.logo_key);
  const current = headingFont(s);

  const content = html`
    ${adminHead("Utseende", { lead: "Färger, rubriktypsnitt och logotyp för hela webbplatsen. Ändringarna slår igenom direkt när du sparar." })}
    <form class="admin-form" id="utseende-form" method="post" action="/admin/utseende" enctype="multipart/form-data" novalidate data-theme-editor data-dirty-check>
      ${csrfField(session)}
      ${Object.keys(errors).length ? html`<div class="alert alert-error" role="alert">${Object.values(errors).join(" ")}</div>` : ""}
      <div class="appearance-grid">
        <div class="stack">
          <section class="admin-card">
            <h2 class="card-heading">Färger</h2>
            <div class="color-grid">
              ${COLOR_FIELDS.map(
                (f) => html`<div class="color-field">
                  <label class="field-label" for="falt-${f.key}">${f.label}</label>
                  <p class="field-help" id="${f.key}-hjalp">${f.help}</p>
                  <div class="color-input">
                    <input type="color" id="falt-${f.key}" name="${f.key}" value="${isHex(s[f.key]) ? s[f.key].toLowerCase() : DEFAULT_SETTINGS[f.key]}" aria-describedby="${f.key}-hjalp" data-color="${f.key}">
                    <input type="text" class="color-hex" value="${s[f.key]}" aria-label="${f.label} som hexkod" maxlength="7" pattern="#[0-9a-fA-F]{6}" data-color-hex="${f.key}">
                  </div>
                </div>`,
              )}
            </div>
            <div class="contrast-box" aria-live="polite" data-contrast>
              ${warnings.length
                ? html`<div class="alert alert-warn"><p class="alert-title">Kontrastvarning</p><ul>${warnings.map((w) => html`<li>${w}</li>`)}</ul><p>Du kan spara ändå, men texten kan bli svårläst – särskilt i mobilen och för personer med nedsatt syn.</p></div>`
                : html`<div class="alert alert-ok">Alla kontraster uppfyller WCAG AA. Snyggt!</div>`}
            </div>
          </section>

          <section class="admin-card">
            <h2 class="card-heading">Typsnitt för rubriker</h2>
            <div class="choice-grid" role="radiogroup" aria-label="Typsnitt för rubriker">
              ${(Object.keys(HEADING_FONTS) as (keyof typeof HEADING_FONTS)[]).map(
                (k) => html`<label class="choice font-choice">
                  <input type="radio" name="font_heading" value="${k}"${current === k ? html` checked` : ""} data-font="${HEADING_FONTS[k].stack}" data-font-scale="${HEADING_FONTS[k].scale}">
                  <span class="choice-body"><span class="font-sample font-${k}">Välkommen till JFK</span><span class="choice-hint">${HEADING_FONTS[k].label}${k === "playfair" ? " (standard)" : ""}</span></span>
                </label>`,
              )}
            </div>
            <p class="field-help">Brödtexten använder alltid Montserrat.</p>
          </section>

          <section class="admin-card" id="logotyp">
            <h2 class="card-heading">Logotyp</h2>
            <div class="upload-box">
              ${logo ? html`<img class="upload-preview upload-preview-logo" src="${logo}" alt="Nuvarande logotyp" data-preview="logo">` : html`<span class="brand-mark brand-mark-lg" aria-hidden="true">§</span><img class="upload-preview upload-preview-logo" alt="" data-preview="logo" hidden>`}
              <div class="upload-controls">
                <label class="field-label" for="falt-logo">${logo ? "Byt logotyp" : "Ladda upp logotyp"}</label>
                <p class="field-help" id="logo-hjalp">Kvadratisk SVG eller PNG med genomskinlig bakgrund fungerar bäst. Visas i sidhuvudet, i sidfoten och som ikon i webbläsarens flik. Stora bilder komprimeras automatiskt.</p>
                ${uploadInput({ id: "falt-logo", name: "logo", kind: "image", describedBy: "logo-hjalp", setting: "logo_key" })}
                ${logo ? html`<label class="check-field check-small"><input type="checkbox" name="logo__ta_bort" value="1"><span>Ta bort logotypen (visa §-symbolen igen)</span></label>` : ""}
              </div>
            </div>
          </section>
          <div class="admin-form-actions sticky-actions">
            <button class="btn btn-primary btn-lg" type="submit">Spara utseende</button>
            <button class="btn btn-outline" type="submit" name="aterstall" value="1" formnovalidate data-confirm-click="Återställa alla färger och typsnittet till standard? Logotypen påverkas inte.">Återställ till standard</button>
          </div>
        </div>

        ${previewPane({ formId: "utseende-form", page: "/", csrf: session.csrf, choosePage: true, liveTheme: true })}
      </div>
    </form>`;
  return adminLayout(c, session, { title: "Utseende", active: "/admin/utseende", newCount: await newMessageCount(c.env.DB), wide: true }, content, status);
}

export async function appearanceSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/utseende?fel=csrf", 303);

  if (form.get("aterstall")) {
    await c.env.DB.prepare(`DELETE FROM settings WHERE key IN (${[...THEME_KEYS, "font_heading"].map(() => "?").join(",")})`).bind(...THEME_KEYS, "font_heading").run();
    await audit(c.env, session, "återställde", "utseende", null, "Färger och typsnitt till standard");
    return redirect("/admin/utseende?klart=aterstallt", 303);
  }

  const updates: [string, string][] = [];
  const errors: Errors = {};
  const override: Partial<Settings> = {};
  for (const k of THEME_KEYS) {
    const v = String(form.get(k) ?? "").trim().toLowerCase();
    if (!isHex(v)) errors[k] = `Ogiltig färg för ${COLOR_FIELDS.find((f) => f.key === k)?.label}.`;
    else {
      updates.push([k, v]);
      override[k] = v;
    }
  }
  const font = String(form.get("font_heading") ?? "playfair");
  updates.push(["font_heading", font === "cormorant" ? "cormorant" : "playfair"]);

  const s = await loadSettings(c.env.DB);
  const res = await handleUpload(c.env, form, "logo", "image", "logo", session.user.email);
  if (!res.ok) errors.logo = res.error;
  else if (res.key) updates.push(["logo_key", res.key]);
  else if (form.get("logo__ta_bort") && s.logo_key) updates.push(["logo_key", ""]);
  if (Object.keys(errors).length) return appearancePage(c, session, override, errors, 422);
  // Den gamla logotypen ligger kvar i bildbanken och kan väljas igen.
  await saveSettings(c.env.DB, session, updates);
  await audit(c.env, session, "ändrade", "utseende", null, `Färger: ${THEME_KEYS.map((k) => override[k]).join(", ")}; rubriker: ${font}`);
  return redirect("/admin/utseende?klart=sparat", 303);
}

// ───────────────────────── Meddelanden ─────────────────────────


interface SubmissionRow {
  id: number;
  form: string;
  status: "ny" | "hanterad";
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  data: string;
  anonymous: number;
  email_sent: number;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
}

export async function messagesPage(c: RequestContext, session: Session): Promise<Response> {
  const status = c.url.searchParams.get("status") ?? "ny";
  const formFilter = c.url.searchParams.get("formular") ?? "";
  const where: string[] = [];
  const binds: string[] = [];
  if (status === "ny" || status === "hanterad") {
    where.push("status = ?");
    binds.push(status);
  }
  if (formFilter in FORM_LABELS) {
    where.push("form = ?");
    binds.push(formFilter);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM submissions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 200`)
    .bind(...binds)
    .all<SubmissionRow>();
  const newCount = await newMessageCount(c.env.DB);
  const tab = (value: string, label: string) =>
    html`<li><a href="/admin/meddelanden?status=${value}${formFilter ? `&formular=${formFilter}` : ""}"${status === value ? raw(' aria-current="page"') : ""}>${label}</a></li>`;

  const content = html`
    ${adminHead("Meddelanden", {
      lead: "Allt som skickas via kontaktformuläret, företagsformuläret och JF Påverka. Meddelanden raderas automatiskt efter tolv månader.",
      actions: html`<a class="btn btn-outline" href="/admin/meddelanden.csv?status=${status}${formFilter ? `&formular=${formFilter}` : ""}" download>Exportera CSV</a>`,
    })}
    <div class="filter-bar">
      <nav class="tabs tabs-compact" aria-label="Status"><ul>${tab("ny", `Nya (${newCount})`)}${tab("hanterad", "Hanterade")}${tab("alla", "Alla")}</ul></nav>
      <form method="get" action="/admin/meddelanden" class="inline-filter">
        <input type="hidden" name="status" value="${status}">
        <label class="sr-only" for="formular">Formulär</label>
        <select id="formular" name="formular" data-autosubmit>
          <option value="">Alla formulär</option>
          ${Object.entries(FORM_LABELS).map(([k, v]) => html`<option value="${k}"${formFilter === k ? html` selected` : ""}>${v}</option>`)}
        </select>
        <noscript><button class="btn btn-outline btn-sm" type="submit">Filtrera</button></noscript>
      </form>
    </div>
    ${results.length
      ? html`<div class="admin-card admin-card-flush">
          <table class="admin-table">
            <thead><tr><th scope="col">Ämne</th><th scope="col">Från</th><th scope="col">Formulär</th><th scope="col">Inkom</th><th scope="col">Status</th></tr></thead>
            <tbody>
              ${results.map(
                (m) => html`<tr class="${m.status === "ny" ? "row-new" : ""}">
                  <td data-label="Ämne"><a class="row-title" href="/admin/meddelanden/${m.id}">${m.subject || "(inget ämne)"}</a></td>
                  <td data-label="Från">${m.anonymous ? html`<span class="pill">Anonym</span>` : m.name ?? "–"}</td>
                  <td data-label="Formulär">${FORM_LABELS[m.form] ?? m.form}</td>
                  <td data-label="Inkom">${formatDateTime(m.created_at)}</td>
                  <td data-label="Status">${m.status === "ny" ? html`<span class="pill pill-warn">Ny</span>` : html`<span class="pill pill-on">Hanterad</span>`}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`
      : html`<div class="admin-empty"><p>${status === "ny" ? "Inga nya meddelanden. Allt är hanterat!" : "Inga meddelanden här."}</p></div>`}`;
  return adminLayout(c, session, { title: "Meddelanden", active: "/admin/meddelanden", newCount }, content);
}

export async function messageDetail(c: RequestContext, session: Session): Promise<Response> {
  const m = await c.env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(Number(c.params.id)).first<SubmissionRow>();
  if (!m) return redirect("/admin/meddelanden", 303);
  let data: Record<string, string> = {};
  try {
    data = JSON.parse(m.data) as Record<string, string>;
  } catch {
    /* ignorera */
  }
  const content = html`
    ${adminHead(m.subject || "Meddelande", { back: { href: "/admin/meddelanden", label: "Meddelanden" } })}
    <div class="message-layout">
      <article class="admin-card">
        <dl class="meta-grid">
          <div><dt>Formulär</dt><dd>${FORM_LABELS[m.form] ?? m.form}</dd></div>
          <div><dt>Inkom</dt><dd>${formatDateTime(m.created_at)}</dd></div>
          <div><dt>Från</dt><dd>${m.anonymous ? "Anonym avsändare" : m.name ?? "–"}</dd></div>
          ${m.email ? html`<div><dt>E-post</dt><dd><a href="mailto:${m.email}?subject=${encodeURIComponent("Sv: " + (m.subject ?? ""))}">${m.email}</a></dd></div>` : ""}
          ${Object.entries(data).filter(([, v]) => v).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
          <div><dt>E-postnotis</dt><dd>${m.email_sent ? "Skickad" : "Inte skickad"}</dd></div>
        </dl>
        <div class="message-body prose">${paragraphs(m.message)}</div>
      </article>
      <aside class="admin-card stack-sm">
        <p><strong>Status:</strong> ${m.status === "ny" ? "Ny" : `Hanterad${m.handled_by ? ` av ${m.handled_by}` : ""}${m.handled_at ? `, ${formatDateTime(m.handled_at)}` : ""}`}</p>
        ${m.email ? html`<a class="btn btn-primary btn-block" href="mailto:${m.email}?subject=${encodeURIComponent("Sv: " + (m.subject ?? ""))}">Svara via e-post</a>` : ""}
        ${postButton(session, `/admin/meddelanden/${m.id}/status`, m.status === "ny" ? "Markera som hanterad" : "Markera som ny", { className: `btn ${m.email ? "btn-outline" : "btn-primary"} btn-block` })}
        ${postButton(session, `/admin/meddelanden/${m.id}/radera`, "Radera meddelandet", { confirm: "Radera meddelandet permanent? Det går inte att ångra.", className: "btn btn-danger-ghost btn-block" })}
      </aside>
    </div>`;
  return adminLayout(c, session, { title: m.subject || "Meddelande", active: "/admin/meddelanden", newCount: await newMessageCount(c.env.DB) }, content);
}

export async function messageStatus(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/meddelanden?fel=csrf", 303);
  const id = Number(c.params.id);
  const m = await c.env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(id).first<{ status: string }>();
  if (!m) return redirect("/admin/meddelanden", 303);
  const next = m.status === "ny" ? "hanterad" : "ny";
  await c.env.DB.prepare("UPDATE submissions SET status = ?, handled_at = ?, handled_by = ? WHERE id = ?")
    .bind(next, next === "hanterad" ? nowSql() : null, next === "hanterad" ? session.user.name : null, id)
    .run();
  await audit(c.env, session, `markerade som ${next}`, "meddelande", id);
  return redirect(`/admin/meddelanden/${id}?klart=${next}`, 303);
}

export async function messageDelete(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/meddelanden?fel=csrf", 303);
  const id = Number(c.params.id);
  await c.env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id).run();
  await audit(c.env, session, "raderade", "meddelande", id);
  return redirect("/admin/meddelanden?klart=raderat", 303);
}

export async function messagesCsv(c: RequestContext, session: Session): Promise<Response> {
  const status = c.url.searchParams.get("status") ?? "alla";
  const formFilter = c.url.searchParams.get("formular") ?? "";
  const where: string[] = [];
  const binds: string[] = [];
  if (status === "ny" || status === "hanterad") {
    where.push("status = ?");
    binds.push(status);
  }
  if (formFilter in FORM_LABELS) {
    where.push("form = ?");
    binds.push(formFilter);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM submissions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`)
    .bind(...binds)
    .all<SubmissionRow>();
  // Skydd mot CSV-injektion i Excel: celler som börjar med = + - @ prefixas med '
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["ID", "Inkom", "Formulär", "Status", "Namn", "E-post", "Ämne", "Meddelande", "Övrigt", "Anonym", "Hanterad av"];
  const lines = results.map((m) =>
    [m.id, formatDateTime(m.created_at), FORM_LABELS[m.form] ?? m.form, m.status, m.name, m.email, m.subject, m.message, m.data === "{}" ? "" : m.data, m.anonymous ? "ja" : "nej", m.handled_by]
      .map(cell)
      .join(";"),
  );
  await audit(c.env, session, "exporterade", "meddelanden", null, `${results.length} st (CSV)`);
  // BOM + semikolon gör att svenska Excel öppnar filen rätt direkt
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jfk-meddelanden-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// ───────────────────────── Användare ─────────────────────────

const USER_FIELDS: FieldSpec[] = [
  { name: "namn", label: "Namn", type: "text", required: true, max: 100 },
  { name: "epost", label: "E-post", type: "email", required: true, max: 200 },
  {
    name: "roll",
    label: "Roll",
    type: "radio",
    required: true,
    options: [
      { value: "redaktor", label: "Redaktör", hint: "Kan ändra innehåll, texter och hantera meddelanden" },
      { value: "admin", label: "Administratör", hint: "Kan dessutom ändra utseende, hantera användare och se ändringsloggen" },
    ],
  },
];

export async function usersPage(c: RequestContext, session: Session, opts: { errors?: Errors; values?: Record<string, string>; inviteLink?: { name: string; link: string; emailed: boolean } } = {}, status = 200): Promise<Response> {
  const { results } = await c.env.DB.prepare("SELECT * FROM users ORDER BY active DESC, role, name").all<User>();
  const content = html`
    ${adminHead("Användare", { lead: "Alla som kan logga in i adminpanelen. Nya användare får en personlig länk där de väljer sitt eget lösenord." })}
    ${opts.inviteLink
      ? html`<div class="alert alert-ok invite-box" role="status">
          <p class="alert-title">Länk skapad för ${opts.inviteLink.name}</p>
          <p>${opts.inviteLink.emailed ? "Länken har också mejlats. " : ""}Skicka länken till personen. Den gäller i 72 timmar, kan bara användas en gång och visas bara nu.</p>
          <div class="copy-row"><input type="text" readonly value="${opts.inviteLink.link}" aria-label="Länk" data-copy-source><button class="btn btn-outline btn-sm" type="button" data-copy>Kopiera</button></div>
        </div>`
      : ""}
    <div class="admin-card admin-card-flush">
      <table class="admin-table">
        <thead><tr><th scope="col">Namn</th><th scope="col">E-post</th><th scope="col">Roll</th><th scope="col">Senast inloggad</th><th scope="col" class="col-actions"><span class="sr-only">Åtgärder</span></th></tr></thead>
        <tbody>
          ${results.map(
            (u) => html`<tr class="${u.active ? "" : "row-muted"}">
              <td data-label="Namn"><strong>${u.name}</strong>${u.id === session.user.id ? html` <span class="pill">Du</span>` : ""}${!u.active ? html` <span class="pill pill-off">Inaktiv</span>` : u.password_hash === "!" ? html` <span class="pill pill-warn">Inbjuden</span>` : ""}</td>
              <td data-label="E-post">${u.email}</td>
              <td data-label="Roll">${ROLE_LABELS[u.role]}</td>
              <td data-label="Senast inloggad">${u.last_login_at ? formatDateTime(u.last_login_at) : "Aldrig"}</td>
              <td class="col-actions">
                <div class="row-actions">
                  ${u.id !== session.user.id && u.active
                    ? html`${postButton(session, `/admin/anvandare/${u.id}/lank`, "Ny lösenordslänk")}
                        ${postButton(session, `/admin/anvandare/${u.id}/roll`, u.role === "admin" ? "Gör till redaktör" : "Gör till admin")}
                        ${postButton(session, `/admin/anvandare/${u.id}/ta-bort`, "Ta bort", { confirm: `Ta bort ${u.name}? Personen loggas ut direkt och kan inte logga in igen.`, className: "btn btn-danger-ghost btn-sm" })}`
                    : u.id === session.user.id
                      ? html`<a class="btn btn-outline btn-sm" href="/admin/konto">Mitt konto</a>`
                      : ""}
                </div>
              </td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>

    <section class="admin-card narrow-card" aria-labelledby="ny-anvandare">
      <h2 class="card-heading" id="ny-anvandare">Lägg till användare</h2>
      <form class="admin-form" method="post" action="/admin/anvandare" novalidate>
        ${csrfField(session)}
        ${errorSummary(opts.errors ?? {}, USER_FIELDS)}
        ${USER_FIELDS.map((f) => renderField(f, opts.values?.[f.name] ?? (f.name === "roll" ? "redaktor" : ""), opts.errors?.[f.name]))}
        <button class="btn btn-primary" type="submit">Skapa och få inbjudningslänk</button>
      </form>
    </section>`;
  return adminLayout(c, session, { title: "Användare", active: "/admin/anvandare", newCount: await newMessageCount(c.env.DB) }, content, status);
}

async function inviteFor(c: RequestContext, user: { id: number; name: string; email: string }, first: boolean): Promise<{ name: string; link: string; emailed: boolean }> {
  const token = await createResetToken(c.env, user.id, 72);
  const link = `${c.env.SITE_URL.replace(/\/$/, "")}/admin/losenord/${token}`;
  let emailed = false;
  if (mailConfigured(c.env)) {
    try {
      await sendMail(c.env, {
        to: [user.email],
        subject: first ? "Du är inbjuden till JFK:s adminpanel" : "Ny lösenordslänk till JFK:s adminpanel",
        text: `Hej ${user.name}!\n\n${first ? "Du har fått ett konto i adminpanelen för Juridiska Föreningen i Karlstads webbplats." : "Här är en ny länk för att välja lösenord till JFK:s adminpanel."}\n\nVälj ditt lösenord här (länken gäller i 72 timmar):\n${link}\n\nSedan loggar du in på ${c.env.SITE_URL.replace(/\/$/, "")}/admin\n\n/ JFK:s webbplats`,
      });
      emailed = true;
    } catch (err) {
      console.error("Kunde inte mejla inbjudan", err);
    }
  }
  return { name: user.name, link, emailed };
}

export async function userCreate(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/anvandare?fel=csrf", 303);
  const { values, errors } = validate(USER_FIELDS, form);
  const email = (values.epost ?? "").toLowerCase();
  if (!errors.epost && (await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first())) {
    errors.epost = "Det finns redan en användare med den e-postadressen.";
  }
  if (Object.keys(errors).length) return usersPage(c, session, { errors, values }, 422);
  const role: Role = values.roll === "admin" ? "admin" : "redaktor";
  const res = await c.env.DB.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, '!')").bind(email, values.namn, role).run();
  await audit(c.env, session, "bjöd in", "användare", res.meta.last_row_id, `${values.namn} (${ROLE_LABELS[role]})`);
  const invite = await inviteFor(c, { id: res.meta.last_row_id, name: values.namn!, email }, true);
  return usersPage(c, session, { inviteLink: invite });
}

async function loadOther(c: RequestContext, session: Session, form: FormData): Promise<User | Response> {
  if (!checkCsrf(c, session, form)) return redirect("/admin/anvandare?fel=csrf", 303);
  const u = await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND active = 1").bind(Number(c.params.id)).first<User>();
  if (!u || u.id === session.user.id) return redirect("/admin/anvandare", 303);
  return u;
}

export async function userLink(c: RequestContext, session: Session): Promise<Response> {
  const u = await loadOther(c, session, await c.req.formData());
  if (u instanceof Response) return u;
  await audit(c.env, session, "skapade lösenordslänk för", "användare", u.id, u.name);
  return usersPage(c, session, { inviteLink: await inviteFor(c, u, u.password_hash === "!") });
}

export async function userRole(c: RequestContext, session: Session): Promise<Response> {
  const u = await loadOther(c, session, await c.req.formData());
  if (u instanceof Response) return u;
  const next: Role = u.role === "admin" ? "redaktor" : "admin";
  await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(next, u.id).run();
  await audit(c.env, session, "ändrade roll för", "användare", u.id, `${u.name} → ${ROLE_LABELS[next]}`);
  return redirect("/admin/anvandare?klart=sparat", 303);
}

export async function userRemove(c: RequestContext, session: Session): Promise<Response> {
  const u = await loadOther(c, session, await c.req.formData());
  if (u instanceof Response) return u;
  // Kontot inaktiveras i stället för att raderas, så att ändringsloggen behåller sitt sammanhang.
  await c.env.DB.prepare("UPDATE users SET active = 0, password_hash = '!', email = email || '.borttagen-' || id WHERE id = ?").bind(u.id).run();
  await destroyUserSessions(c.env, u.id);
  await audit(c.env, session, "tog bort", "användare", u.id, u.name);
  return redirect("/admin/anvandare?klart=raderat", 303);
}

// ───────────────────────── Ändringslogg ─────────────────────────

export async function logPage(c: RequestContext, session: Session): Promise<Response> {
  const page = Math.max(1, parseInt(c.url.searchParams.get("sida") ?? "1", 10) || 1);
  const per = 50;
  const { results } = await c.env.DB.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?").bind(per + 1, (page - 1) * per).all<{
    id: number;
    user_email: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    summary: string | null;
    created_at: string;
  }>();
  const more = results.length > per;
  const content = html`
    ${adminHead("Ändringslogg", { lead: "Vem som ändrade vad och när. Loggen sparas i två år." })}
    <div class="admin-card admin-card-flush">
      <table class="admin-table">
        <thead><tr><th scope="col">När</th><th scope="col">Vem</th><th scope="col">Vad</th></tr></thead>
        <tbody>
          ${results.slice(0, per).map(
            (r) => html`<tr><td data-label="När" class="nowrap">${formatDateTime(r.created_at)}</td><td data-label="Vem">${r.user_email ?? "System"}</td><td data-label="Vad">${[r.action, r.entity].filter(Boolean).join(" ")}${r.summary ? html`: <em>${r.summary}</em>` : ""}</td></tr>`,
          )}
        </tbody>
      </table>
    </div>
    <nav class="pagination" aria-label="Sidor">
      ${page > 1 ? html`<a class="btn btn-outline btn-sm" href="/admin/logg?sida=${page - 1}">Nyare</a>` : html`<span></span>`}
      <span class="muted">Sida ${page}</span>
      ${more ? html`<a class="btn btn-outline btn-sm" href="/admin/logg?sida=${page + 1}">Äldre</a>` : html`<span></span>`}
    </nav>`;
  return adminLayout(c, session, { title: "Ändringslogg", active: "/admin/logg", newCount: await newMessageCount(c.env.DB) }, content);
}

// ───────────────────────── Mitt konto ─────────────────────────

export async function accountPage(c: RequestContext, session: Session, error?: string, status = 200): Promise<Response> {
  const content = html`
    ${adminHead("Mitt konto", { lead: `${session.user.name} · ${session.user.email} · ${ROLE_LABELS[session.user.role]}` })}
    <section class="admin-card narrow-card">
      <h2 class="card-heading">Byt lösenord</h2>
      ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ""}
      <form class="admin-form" method="post" action="/admin/konto" novalidate>
        ${csrfField(session)}
        <input type="hidden" name="anvandarnamn" value="${session.user.email}" autocomplete="username">
        <div class="field"><label class="field-label" for="falt-nuvarande">Nuvarande lösenord</label><input type="password" id="falt-nuvarande" name="nuvarande" autocomplete="current-password" required></div>
        <div class="field"><label class="field-label" for="falt-nytt">Nytt lösenord</label><p class="field-help" id="nytt-hjalp">Minst ${MIN_PASSWORD} tecken.</p><input type="password" id="falt-nytt" name="nytt" autocomplete="new-password" required aria-describedby="nytt-hjalp"></div>
        <div class="field"><label class="field-label" for="falt-igen">Upprepa nytt lösenord</label><input type="password" id="falt-igen" name="igen" autocomplete="new-password" required></div>
        <button class="btn btn-primary" type="submit">Byt lösenord</button>
      </form>
      <p class="field-help">När du byter lösenord loggas du ut på alla andra enheter.</p>
    </section>`;
  return adminLayout(c, session, { title: "Mitt konto", active: "/admin/konto", newCount: await newMessageCount(c.env.DB), narrow: true }, content, status);
}

export async function accountSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/konto?fel=csrf", 303);
  const current = String(form.get("nuvarande") ?? "");
  const p1 = String(form.get("nytt") ?? "");
  const p2 = String(form.get("igen") ?? "");
  if (!(await verifyPassword(current, session.user.password_hash))) return accountPage(c, session, "Nuvarande lösenord stämmer inte.", 422);
  const problem = passwordProblem(p1, session.user.email) ?? (p1 !== p2 ? "De nya lösenorden matchar inte." : null);
  if (problem) return accountPage(c, session, problem, 422);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(p1), session.user.id).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(session.user.id, session.sessionId).run();
  await audit(c.env, session, "bytte sitt lösenord", "", session.user.id);
  return redirect("/admin/konto?klart=losenord", 303);
}
