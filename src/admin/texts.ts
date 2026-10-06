import { html, type SafeHtml } from "../lib/html.js";
import { isHex, luminance } from "../lib/color.js";
import { DEFAULT_SETTINGS, firstImage, loadSettings, SLIDE_PREFIX, slideshowOf, siteLayout, type SettingKey, type Settings } from "../lib/settings.js";
import { PAGES, FIELD_INDEX, findPage, type FieldDef, type PageDef, type SectionDef } from "../lib/texts.js";
import { renderField, validate, errorSummary, type Errors, type FieldSpec } from "../lib/forms.js";
import { redirect, randomToken } from "../lib/http.js";
import { formatDateTimeShort, formatWhen } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { DEFAULT_NAV, resolveMenu, type MenuConfigItem, type ResolvedLink } from "../views/nav.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";
import { handleUpload, imageUploadField, uploadInput } from "./uploads.js";
import { previewPane, samplePath } from "./preview.js";
import { blockControls, editorSectionOrder, layoutEntries, pageVisibilityCard, textStyleControls } from "./layout-form.js";
import { blockOrder, isBlockHidden, PAGE_LAYOUTS, type SiteLayout } from "../lib/pagelayout.js";

/**
 * "Texter och sidor": varje text på webbplatsen, ordnad som webbplatsen – sida → avsnitt → fält.
 * Ovanliga texter (knappar, etiketter, felmeddelanden) ligger bakom "Visa fler texter".
 * Varje sparning versionshanteras så att man kan ångra och återställa tidigare versioner.
 */

const MENU_ID = "meny";
const KEEP_VERSIONS = 25;

// ───────────────────────── Spara med versionshistorik ─────────────────────────

/**
 * Spara inställningar och för versionshistorik. Bara värden som faktiskt ändrats sparas.
 * Värden som är samma som standardtexten tas bort ur databasen, så att förbättrade standardtexter
 * i koden slår igenom automatiskt. Returnerar batch-id (för Ångra) och vilka nycklar som ändrades.
 */
export async function saveSettings(
  db: D1Database,
  session: Session | null,
  updates: [string, string][],
): Promise<{ batch: string | null; changed: string[] }> {
  const current = await loadSettings(db);
  const changed = updates.filter(([k, v]) => k in DEFAULT_SETTINGS && current[k as SettingKey] !== v);
  if (!changed.length) return { batch: null, changed: [] };
  const batch = randomToken(9);
  const keys = changed.map(([k]) => k);

  // Första gången en text ändras sparas även texten som gällde innan, så att den går att återställa.
  const { results } = await db
    .prepare(`SELECT DISTINCT key FROM setting_versions WHERE key IN (${keys.map(() => "?").join(",")})`)
    .bind(...keys)
    .all<{ key: string }>();
  const withHistory = new Set(results.map((r) => r.key));

  const stmts: D1PreparedStatement[] = [];
  for (const [k, v] of changed) {
    if (!withHistory.has(k)) {
      stmts.push(db.prepare("INSERT INTO setting_versions (key, value, batch, user_email, created_at) VALUES (?, ?, NULL, NULL, datetime('now', '-1 second'))").bind(k, current[k as SettingKey]));
    }
    if (v === DEFAULT_SETTINGS[k as SettingKey]) stmts.push(db.prepare("DELETE FROM settings WHERE key = ?").bind(k));
    else
      stmts.push(
        db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(k, v),
      );
    stmts.push(db.prepare("INSERT INTO setting_versions (key, value, batch, user_email) VALUES (?, ?, ?, ?)").bind(k, v, batch, session?.user.email ?? null));
  }
  await db.batch(stmts);
  return { batch, changed: keys };
}

// ───────────────────────── Hjälpfunktioner ─────────────────────────

// ───────────────────────── Bildspel ─────────────────────────

/** Bildfält som inte kan bli bildspel: mobilens egen toppbild (den ersätter en bild) och Instagram-profilbilden. */
const NO_SLIDESHOW = new Set(["hero_image_mobile", "insta_avatar"]);
/** Antal platser för nya bilder i ett bildspel per sparning. */
const SLIDE_SLOTS = 4;

/**
 * "Visa som: En bild / Bildspel" under ett bildfält. Bildspelets första bild är bilden ovanför; här visas de
 * övriga (med Ta bort) och platser för att lägga till fler – samma uppladdning som annars, med bildbanken.
 */
function slideshowEditor(field: string, s: Settings, errors: Errors): SafeHtml {
  const { on, extras } = slideshowOf(s, field);
  const err = Array.from({ length: SLIDE_SLOTS }, (_, i) => errors[`${field}__spel_${i + 1}`]).filter(Boolean);
  return html`<fieldset class="slides-edit" data-slides-edit>
    <legend class="field-label">Visa som</legend>
    <div class="segmented" role="radiogroup" aria-label="Visa som">
      <label><input type="radio" name="${field}__visning" value="en"${on ? "" : html` checked`} data-slides-mode><span>En bild</span></label>
      <label><input type="radio" name="${field}__visning" value="spel"${on ? html` checked` : ""} data-slides-mode><span>Bildspel</span></label>
    </div>
    <div class="slides-panel" data-slides-panel${on ? "" : html` hidden`}>
      <p class="field-help">Bilderna visas i tur och ordning och tonar mjukt över var sjätte sekund. Den första är bilden ovanför; lägg till fler här. Besökare som valt minskad rörelse ser bara den första.</p>
      ${extras.length
        ? html`<ul class="slides-list">${extras.map(
            (k, i) => html`<li class="slides-item">
              <img src="${mediaUrl(k, "sm")}" alt="Bild ${i + 2} i bildspelet" width="160" height="110" loading="lazy">
              <label class="check-field check-small"><input type="checkbox" name="${field}__spel_bort" value="${k}"><span>Ta bort</span></label>
            </li>`,
          )}</ul>`
        : html`<p class="slides-empty">Inga fler bilder ännu – lägg till minst en till för att det ska bli ett bildspel.</p>`}
      ${Array.from({ length: SLIDE_SLOTS }, (_, i) => {
        const name = `${field}__spel_${i + 1}`;
        return html`<div class="slides-add"${i > 0 ? html` hidden` : ""} data-slides-add>
          <span class="slides-add-label" id="falt-${name}-etikett">Lägg till en bild</span>
          ${uploadInput({ id: `falt-${name}`, name, kind: "image", labelledBy: `falt-${name}-etikett` })}
        </div>`;
      })}
      <button type="button" class="btn btn-outline btn-sm" data-slides-more>${icon("image", "icon icon-sm")}Lägg till ännu en bild</button>
      ${err.length ? html`<p class="field-error">${err.join(" ")}</p>` : ""}
    </div>
  </fieldset>`;
}

/** Läser bildspelsvalen ur formuläret. Returnerar raden att spara och eventuellt en ny huvudbild. */
async function readSlideshow(
  c: RequestContext,
  form: FormData,
  field: string,
  s: Settings,
  mainAfter: string,
  email: string,
  errors: Errors,
): Promise<{ row: [string, string | null] | null; newMain: string | null }> {
  const mode = form.get(`${field}__visning`);
  if (mode !== "en" && mode !== "spel") return { row: null, newMain: null };
  const key = SLIDE_PREFIX + field;
  if (mode === "en") return { row: [key, null], newMain: null }; // bilderna ligger kvar i bildbanken
  const remove = new Set(form.getAll(`${field}__spel_bort`).map(String));
  const extras = slideshowOf(s, field).extras.filter((k) => !remove.has(k));
  for (let i = 1; i <= SLIDE_SLOTS; i++) {
    const res = await handleUpload(c.env, form, `${field}__spel_${i}`, "image", "sida", email);
    if (!res.ok) errors[`${field}__spel_${i}`] = res.error;
    else if (res.key && !extras.includes(res.key)) extras.push(res.key);
  }
  // Ingen huvudbild men nya bilder i bildspelet: den första blir huvudbild.
  let newMain: string | null = null;
  if (!mainAfter && extras.length) newMain = extras.shift()!;
  return { row: [key, extras.join(",")], newMain };
}

/** Sajtens färg (eller standardfärgen) – kontrastvarningen vid färgfälten räknar med den när ett fält står på "Standard". */
type ThemeKey = "color_background" | "color_surface" | "color_text" | "color_primary" | "color_accent" | "color_button";
function siteHex(s: Settings, key: ThemeKey): string {
  return isHex(s[key]) ? s[key].toLowerCase() : DEFAULT_SETTINGS[key];
}

/** Sajtens färger (Utseende) som snabbval vid färgfälten, som JSON: [[namn, "#rrggbb"], …]. Dubbletter tas bort. */
function sitePalette(s: Settings): string {
  const named: [string, string][] = [
    ["Bakgrund", siteHex(s, "color_background")],
    ["Kort och ytor", siteHex(s, "color_surface")],
    ["Text", siteHex(s, "color_text")],
    ["Primärfärg", siteHex(s, "color_primary")],
    ["Accentfärg", siteHex(s, "color_accent")],
    ["Knappar", siteHex(s, "color_button")],
    // Extra färger som styrelsen vill ha nära till hands
    ["Mörkt guld", "#cda72a"],
  ];
  // Vit och svart som extra val, men bara om paletten inte redan har en nästan vit eller nästan svart färg.
  if (!named.some(([, hex]) => luminance(hex) > 0.9)) named.push(["Vit", "#ffffff"]);
  if (!named.some(([, hex]) => luminance(hex) < 0.02)) named.push(["Svart", "#141414"]);
  const seen = new Set<string>();
  return JSON.stringify(named.filter(([, hex]) => !seen.has(hex) && seen.add(hex)));
}

function toSpec(f: FieldDef): FieldSpec {
  if (f.type === "choice") {
    return { name: f.key, label: f.label, type: "radio", required: f.required, help: f.help, options: (f.options ?? []).map((o) => ({ ...o })) };
  }
  if (f.type === "color") {
    return { name: f.key, label: f.label, type: "color", required: f.required, help: f.help, wrapClass: "field-color" };
  }
  if (f.type === "datetime") {
    return { name: f.key, label: f.label, type: "datetime-local", required: f.required, help: f.help };
  }
  const big = f.type === "markdown";
  const area = f.type === "textarea" || f.type === "lines" || f.type === "rich" || big;
  return {
    name: f.key,
    label: f.label,
    type: area ? "textarea" : f.type === "url" ? "url" : f.type === "email" ? "email" : "text",
    required: f.required,
    help: f.help,
    rows: big ? 10 : f.type === "lines" ? 6 : f.type === "rich" ? 3 : f.type === "textarea" ? 4 : undefined,
    max: big ? 12000 : area ? 4000 : 300,
  };
}

const textFields = (sec: SectionDef) => (sec.fields as readonly FieldDef[]).filter((f) => f.type !== "image");

/** Vilken sida förhandsvisningen ska visa för ett avsnitt. */
async function previewFor(db: D1Database, page: PageDef, sec: SectionDef): Promise<{ path: string; label: string }> {
  if (sec.id === "tack") return { path: `${page.path}/tack`, label: `${page.title} – bekräftelsen` };
  if (page.id === "integritet" && sec.id === "kakor") return { path: "/cookies", label: "Kakor" };
  const dyn: Record<string, "event" | "news" | "partner" | "job"> = { "kalender/eventsida": "event", "aktuellt/artikel": "news", "partners/partnersida": "partner", "karriar/annons": "job" };
  const kind = dyn[`${page.id}/${sec.id}`];
  if (kind) {
    const p = await samplePath(db, kind);
    if (p) return { path: p, label: sec.title };
  }
  return { path: page.path, label: page.title };
}

function changedCount(s: Settings, page: PageDef): number {
  return page.sections.reduce((n, sec) => n + (sec.fields as readonly FieldDef[]).filter((f) => s[f.key as SettingKey] !== f.def).length, 0);
}

function fieldCount(page: PageDef): number {
  return page.sections.reduce((n, sec) => n + sec.fields.length, 0);
}

function pageNav(current: string): SafeHtml {
  return html`<form class="texts-jump" method="get" action="/admin/texter">
    <label class="sr-only" for="hoppa-sida">Välj sida</label>
    <select id="hoppa-sida" name="sida" data-autosubmit>
      ${PAGES.map((p) => html`<option value="${p.id}"${p.id === current ? html` selected` : ""}>${p.title}</option>`)}
      <option value="${MENU_ID}"${current === MENU_ID ? html` selected` : ""}>Menyn</option>
    </select>
    <noscript><button class="btn btn-outline btn-sm" type="submit">Visa</button></noscript>
  </form>`;
}

function searchBox(q = ""): SafeHtml {
  return html`<form class="texts-search" method="get" action="/admin/sok" role="search">
    <label class="sr-only" for="hitta-text">Hitta text på webbplatsen</label>
    <span class="texts-search-icon" aria-hidden="true">${icon("search", "icon icon-sm")}</span>
    <input type="search" id="hitta-text" name="q" value="${q}" placeholder="Hitta text, t.ex. ”sittning” eller ”Bli medlem”" autocomplete="off">
    <button class="btn btn-primary btn-sm" type="submit">Sök</button>
  </form>`;
}

// ───────────────────────── Senast ändrad ─────────────────────────

export interface LastChange {
  who: string;
  userId: number | null;
  when: string;
  action: string;
}

/**
 * Senaste ändringen per sida, ur ändringsloggen. Nyare poster har sidans id (entity_id); äldre känns igen
 * på att sammanfattningen börjar med sidans namn. Loggen sparas i 24 månader.
 */
async function lastChanges(db: D1Database): Promise<Map<string, LastChange>> {
  const map = new Map<string, LastChange>();
  try {
    const { results } = await db
      .prepare(
        `SELECT a.entity_id, a.summary, a.action, a.created_at, a.user_id, a.user_email, u.name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.entity IN ('sidan', 'texten') ORDER BY a.id DESC LIMIT 500`,
      )
      .all<{ entity_id: string | null; summary: string | null; action: string; created_at: string; user_id: number | null; user_email: string | null; name: string | null }>();
    for (const r of results) {
      const page =
        PAGES.find((p) => p.id === r.entity_id) ??
        (r.entity_id ? undefined : PAGES.find((p) => r.summary === p.title || r.summary?.startsWith(`${p.title}:`)));
      if (!page || map.has(page.id)) continue;
      map.set(page.id, { who: r.name || r.user_email?.split("@")[0] || "okänd", userId: r.user_id, when: r.created_at, action: r.action });
    }
  } catch {
    /* ingen logg än */
  }
  return map;
}

function lastChangeText(change: LastChange | undefined, session: Session): SafeHtml | string {
  if (!change) return "";
  const who = change.userId === session.user.id ? "dig" : change.who;
  return html`Senast ändrad av <strong>${who}</strong> ${formatWhen(change.when)}`;
}

// ───────────────────────── Översikten: välj sida ─────────────────────────

async function textsIndex(c: RequestContext, session: Session): Promise<Response> {
  const [s, changes] = await Promise.all([loadSettings(c.env.DB), lastChanges(c.env.DB)]);
  const content = html`
    ${adminHead("Texter och sidor", { lead: "Här ändrar du alla rubriker och texter på webbplatsen. Välj en sida – eller sök efter texten du vill ändra." })}
    <div class="texts-toolbar">${searchBox()}</div>
    <ul class="page-cards">
      ${PAGES.map((p) => {
        const changed = changedCount(s, p);
        return html`<li>
          <a class="page-card" href="/admin/texter?sida=${p.id}">
            <span class="page-card-title">${p.title}</span>
            <span class="page-card-path">${p.id === "gemensamt" ? "Syns på alla sidor" : p.path}</span>
            <span class="page-card-sections">${p.sections.map((sec) => sec.title).slice(0, 4).join(" · ")}${p.sections.length > 4 ? " …" : ""}</span>
            <span class="page-card-meta">${siteLayout(s).hiddenPages.has(p.id) ? html`<span class="badge-hidden">${icon("eyeOff", "icon icon-sm")}Dold</span> · ` : ""}${fieldCount(p)} texter${changed ? html` · <strong>${changed} ändrade</strong>` : ""}</span>
            ${changes.get(p.id) ? html`<span class="page-card-changed">${icon("clock", "icon icon-sm")}<span>${lastChangeText(changes.get(p.id), session)}</span></span>` : ""}
          </a>
        </li>`;
      })}
      <li>
        <a class="page-card page-card-accent" href="/admin/texter?sida=${MENU_ID}">
          <span class="page-card-title">${icon("menuList", "icon icon-sm")} Menyn</span>
          <span class="page-card-path">Sidhuvudet och sidfoten</span>
          <span class="page-card-sections">Byt namn, ändra ordning och dölj menyval</span>
        </a>
      </li>
    </ul>`;
  return adminLayout(c, session, { title: "Texter och sidor", active: "/admin/texter", newCount: await newMessageCount(c.env.DB) }, content);
}

// ───────────────────────── Redigera en sida ─────────────────────────

export async function textsPage(c: RequestContext, session: Session, errors: Errors = {}, override?: Record<string, string>, status = 200): Promise<Response> {
  const pageId = c.url.searchParams.get("sida");
  if (pageId === MENU_ID) return menuPage(c, session);
  const page = findPage(pageId);
  if (!page) return textsIndex(c, session);

  const db = c.env.DB;
  const [s, changes] = await Promise.all([loadSettings(db), lastChanges(db)]);
  const lastChange = changes.get(page.id);
  const target = c.url.searchParams.get("falt") ?? "";
  const keys = page.sections.flatMap((sec) => (sec.fields as readonly FieldDef[]).map((f) => f.key));
  let versionCounts = new Map<string, number>();
  try {
    const { results } = await db
      .prepare(`SELECT key, COUNT(*) AS n FROM setting_versions WHERE key IN (${keys.map(() => "?").join(",")}) GROUP BY key`)
      .bind(...keys)
      .all<{ key: string; n: number }>();
    versionCounts = new Map(results.map((r) => [r.key, r.n]));
  } catch {
    /* ingen historik ännu */
  }

  // Vilket avsnitt ska vara öppet: det med fel, det med det sökta fältet, annars det första.
  const errorKeys = Object.keys(errors);
  const openIdx = Math.max(
    0,
    page.sections.findIndex((sec) => (sec.fields as readonly FieldDef[]).some((f) => errorKeys.includes(f.key))),
    errorKeys.length ? -1 : page.sections.findIndex((sec) => (sec.fields as readonly FieldDef[]).some((f) => f.key === target)),
  );
  const previews = await Promise.all(page.sections.map((sec) => previewFor(db, page, sec)));
  const initial = previews[openIdx] ?? { path: page.path, label: page.title };
  const openId = page.sections[openIdx]?.id;
  const previewOf = (sec: SectionDef) => previews[page.sections.indexOf(sec as (typeof page.sections)[number])]!;
  const layout = siteLayout(s);

  // Ångra-rutan efter en sparning
  const batch = c.url.searchParams.get("andring") ?? "";
  let undoBox: SafeHtml | string = "";
  if (c.url.searchParams.get("klart") === "texter" && /^[A-Za-z0-9_-]{6,40}$/.test(batch)) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM setting_versions WHERE batch = ?").bind(batch).first<{ n: number }>().catch(() => null);
    if (n?.n) {
      undoBox = html`<div class="alert alert-ok undo-box" role="status">
        <span>${icon("check", "icon icon-sm")} Sparat! ${n.n === 1 ? "1 text ändrades" : `${n.n} texter ändrades`} och syns nu på webbplatsen.</span>
        <form method="post" action="/admin/texter/angra">${csrfField(session)}<input type="hidden" name="andring" value="${batch}"><input type="hidden" name="sida" value="${page.id}"><button class="btn btn-outline btn-sm" type="submit">${icon("history", "icon icon-sm")}Ångra</button></form>
      </div>`;
    }
  }

  const fieldBlock = (f: FieldDef): SafeHtml => {
    const key = f.key as SettingKey;
    const value = override?.[f.key] ?? s[key];
    const versions = versionCounts.get(f.key) ?? 0;
    const isTarget = f.key === target;
    const tools = html`<div class="field-tools">
      ${f.type !== "image" && f.type !== "choice"
        ? html`<button type="button" class="link-btn" hidden data-reset="${f.key}" data-default="${f.def}">${icon("history", "icon icon-sm")}Återställ originaltexten</button>`
        : ""}
      ${versions > 0 ? html`<a class="link-btn" href="/admin/texter/historik?nyckel=${f.key}">${icon("clock", "icon icon-sm")}Tidigare versioner (${versions})</a>` : ""}
    </div>`;
    if (f.type === "image") {
      return html`<div class="text-field${isTarget ? " is-target" : ""}" data-text-field="${f.key}">
        ${imageUploadField({ name: f.key, label: f.label, current: firstImage(value), help: f.help, error: errors[f.key], setting: f.key })}
        ${NO_SLIDESHOW.has(f.key) ? "" : slideshowEditor(f.key, s, errors)}
        ${tools}
      </div>`;
    }
    return html`<div class="text-field${isTarget ? " is-target" : ""}${value !== f.def ? " is-changed" : ""}" data-text-field="${f.key}">
      ${renderField(toSpec(f), value, errors[f.key])}
      ${tools}
      ${textStyleControls(f, layout.styles.get(f.key))}
    </div>`;
  };

  const content = html`
    ${adminHead(page.title, {
      back: { href: "/admin/texter", label: "Alla sidor" },
      lead: page.hint ?? (page.id === "gemensamt" ? "Texter som syns på alla sidor: föreningens namn, kontaktuppgifter, sidhuvudet, sidfoten och knappar." : `Texterna på ${page.path === "/" ? "startsidan" : `sidan ${page.path}`}. Klicka på ett avsnitt för att öppna det.`),
      actions: html`${pageNav(page.id)}`,
    })}
    ${lastChange
      ? html`<p class="last-change">${icon("clock", "icon icon-sm")}<span>${lastChangeText(lastChange, session)}${session.user.role === "admin" ? html` · <a href="/admin/logg">Visa ändringsloggen</a>` : ""}</span></p>`
      : ""}
    ${undoBox}
    <div class="editor-with-preview">
      <form class="admin-form" id="texter-form" method="post" action="/admin/texter?sida=${page.id}" enctype="multipart/form-data" novalidate data-dirty-check data-accordion data-site-bg="${siteHex(s, "color_background")}" data-site-text="${siteHex(s, "color_text")}" data-site-accent="${siteHex(s, "color_accent")}" data-site-palette="${sitePalette(s)}">
        ${csrfField(session)}
        ${errorSummary(errors, page.sections.flatMap((sec) => textFields(sec).map(toSpec)))}
        <input type="hidden" name="__sida_id" value="${page.id}">
        ${pageVisibilityCard(page, layout)}
        ${editorSectionOrder(page, layout).map((group) => {
          const sectionHtml = (sec: SectionDef, first: boolean) => {
            const fields = sec.fields as readonly FieldDef[];
            const main = fields.filter((f) => !f.more);
            const more = fields.filter((f) => f.more);
            const moreOpen = more.some((f) => f.key === target || errors[f.key]);
            const changed = fields.filter((f) => s[f.key as SettingKey] !== f.def).length;
            const pv = previewOf(sec);
            const hidden = group.block !== null && isBlockHidden(layout, page.id, group.block);
            return html`<details class="text-section" id="avsnitt-${sec.id}" data-section data-preview-path="${pv.path}" data-preview-label="${pv.label}"${sec.id === openId ? html` open` : ""}>
              <summary>
                <span class="text-section-title">${sec.title}</span>
                <span class="text-section-meta">${hidden && first ? html`<span class="badge-hidden" data-hidden-badge>${icon("eyeOff", "icon icon-sm")}Dold</span> · ` : ""}${fields.length} ${fields.length === 1 ? "text" : "texter"}${changed ? html` · ${changed} ändrade` : ""}</span>
                <span class="text-section-chevron" aria-hidden="true">${icon("chevronDown", "icon icon-sm")}</span>
              </summary>
              <div class="text-section-body">
                ${group.block && first ? blockControls(page.id, group.block, layout) : ""}
                ${sec.hint ? html`<p class="section-hint">${icon("sparkle", "icon icon-sm")}<span>${sec.hint}</span></p>` : ""}
                ${main.map(fieldBlock)}
                ${more.length
                  ? html`<details class="more-texts"${moreOpen ? html` open` : ""}>
                      <summary><span class="more-closed">Visa fler texter (${more.length})</span><span class="more-open">Dölj extra texter</span></summary>
                      <p class="field-help">Knappar, etiketter och texter som sällan behöver ändras.</p>
                      ${more.map(fieldBlock)}
                    </details>`
                  : ""}
              </div>
            </details>`;
          };
          if (!group.block) return sectionHtml(group.sections[0]!, true);
          const hidden = isBlockHidden(layout, page.id, group.block);
          return html`<div class="sec-group${hidden ? " is-hidden" : ""}" data-block="${group.block}">
            <button type="button" class="sec-handle" data-drag-handle aria-label="Dra för att flytta avsnittet ${group.sections[0]!.title}" title="Dra för att flytta">${icon("grip", "icon icon-sm")}</button>
            ${group.sections.map((sec, i) => sectionHtml(sec, i === 0))}
          </div>`;
        })}
        ${PAGE_LAYOUTS[page.id]?.blocks.length
          ? html`<input type="hidden" name="__ordning" value="${blockOrder(layout, page.id).join(",")}" data-block-order>`
          : ""}
        <div class="admin-form-actions sticky-actions">
          <button class="btn btn-primary btn-lg" type="submit">Spara ändringar</button>
          <a class="btn btn-outline" href="${initial.path}" target="_blank" rel="noopener" data-open-page>${icon("external", "icon icon-sm")}Öppna sidan</a>
        </div>
        <!-- Efter Spara-knappen, så att Enter i ett fält alltid sparar och aldrig återställer. -->
        ${hasLayoutChanges(page, layout)
          ? html`<div class="layout-reset">
              <div>
                <p class="layout-reset-title">${icon("history", "icon icon-sm")}Sidans uppbyggnad är ändrad</p>
                <p class="field-help">${layoutSummary(page, layout)}. Du kan återställa ordningen, visa alla avsnitt igen och ta bort alla egna textstorlekar och justeringar på en gång. Texterna och bilderna påverkas inte.</p>
              </div>
              <button class="btn btn-outline btn-sm" type="submit" formaction="/admin/texter/aterstall-uppbyggnad?sida=${page.id}" formnovalidate
                data-confirm-click="Återställa uppbyggnaden av ${page.title}? Ordningen, dolda avsnitt och alla egna textstorlekar och justeringar på sidan återställs. Osparade textändringar i formuläret sparas inte.">Återställ sidans uppbyggnad</button>
            </div>`
          : ""}
      </form>
      ${previewPane({ formId: "texter-form", page: initial.path, pageLabel: initial.label, csrf: session.csrf, editMap: true })}
    </div>`;
  return adminLayout(c, session, { title: `Texter: ${page.title}`, active: "/admin/texter", newCount: await newMessageCount(db), wide: true }, content, status);
}

export async function textsSubmit(c: RequestContext, session: Session): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return redirect("/admin/texter?fel=uppladdning", 303);
  }
  const page = findPage(c.url.searchParams.get("sida"));
  if (!page) return redirect("/admin/texter", 303);
  if (!checkCsrf(c, session, form)) return redirect(`/admin/texter?sida=${page.id}&fel=csrf`, 303);

  const fields = page.sections.flatMap((sec) => sec.fields as readonly FieldDef[]);
  const plain = fields.filter((f) => f.type !== "image");
  const { values, errors } = validate(plain.map(toSpec), form);
  const s = await loadSettings(c.env.DB);
  const updates: [string, string][] = plain.map((f) => [f.key, values[f.key] ?? ""]);
  const slideRows: [string, string | null][] = [];
  for (const f of fields.filter((f) => f.type === "image")) {
    const res = await handleUpload(c.env, form, f.key, "image", "sida", session.user.email);
    const current = firstImage(s[f.key as SettingKey]);
    let mainAfter = current;
    if (!res.ok) errors[f.key] = res.error;
    else if (res.key) {
      updates.push([f.key, res.key]);
      mainAfter = res.key;
    } else if (form.get(`${f.key}__ta_bort`) && current) {
      updates.push([f.key, ""]);
      mainAfter = "";
    }
    if (!NO_SLIDESHOW.has(f.key)) {
      const sl = await readSlideshow(c, form, f.key, s, mainAfter, session.user.email, errors);
      if (sl.row) slideRows.push(sl.row);
      if (sl.newMain) updates.push([f.key, sl.newMain]);
    }
  }
  if (Object.keys(errors).length) return textsPage(c, session, errors, values, 422);

  // Utbytta bilder ligger kvar i bildbanken – de kan återanvändas och behövs för Ångra.
  const { batch, changed } = await saveSettings(c.env.DB, session, updates);
  const layoutChanged = await saveLayout(c.env.DB, [...layoutEntries(form, page), ...slideRows]);
  if (layoutChanged.length) await audit(c.env, session, "ändrade uppbyggnaden av", "sidan", page.id, `${page.title}: ${layoutChanged.join(", ")}`);
  if (!batch) return redirect(`/admin/texter?sida=${page.id}&klart=${layoutChanged.length ? "sparat" : "oforandrat"}`, 303);
  const labels = changed.map((k) => FIELD_INDEX.get(k)?.field.label ?? k);
  await audit(c.env, session, "ändrade texter på", "sidan", page.id, `${page.title}: ${labels.slice(0, 6).join(", ")}${labels.length > 6 ? ` m.fl. (${labels.length})` : ""}`);
  return redirect(`/admin/texter?sida=${page.id}&klart=texter&andring=${batch}`, 303);
}

/** Sidans egna textstilar (nycklar i registret som har en sparad stil). */
function styledKeys(page: PageDef, layout: SiteLayout): string[] {
  return page.sections.flatMap((sec) => (sec.fields as readonly FieldDef[]).map((f) => f.key)).filter((k) => layout.styles.has(k));
}

function hasLayoutChanges(page: PageDef, layout: SiteLayout): boolean {
  return layout.order.has(page.id) || (layout.hiddenBlocks.get(page.id)?.size ?? 0) > 0 || styledKeys(page, layout).length > 0;
}

/** T.ex. "Ny ordning, 1 dolt avsnitt och 3 texter med egen stil". */
function layoutSummary(page: PageDef, layout: SiteLayout): string {
  const parts: string[] = [];
  if (layout.order.has(page.id)) parts.push("ny ordning");
  const hidden = layout.hiddenBlocks.get(page.id)?.size ?? 0;
  if (hidden) parts.push(`${hidden} ${hidden === 1 ? "dolt avsnitt" : "dolda avsnitt"}`);
  const styled = styledKeys(page, layout).length;
  if (styled) parts.push(`${styled} ${styled === 1 ? "text" : "texter"} med egen stil`);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} och ${parts.at(-1)}` : parts[0] ?? "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Återställ sidans uppbyggnad": ordning, dolda avsnitt och textstilar. Sidans synlighet och texterna rörs inte. */
export async function resetLayoutSubmit(c: RequestContext, session: Session): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return redirect("/admin/texter", 303);
  }
  const page = findPage(c.url.searchParams.get("sida"));
  if (!page) return redirect("/admin/texter", 303);
  if (!checkCsrf(c, session, form)) return redirect(`/admin/texter?sida=${page.id}&fel=csrf`, 303);
  const layout = siteLayout(await loadSettings(c.env.DB));
  const keys = [`ordning:${page.id}`, `dolt:${page.id}`, ...styledKeys(page, layout).map((k) => `stil:${k}`)];
  await c.env.DB.prepare(`DELETE FROM settings WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).run();
  await audit(c.env, session, "återställde uppbyggnaden av", "sidan", page.id, page.title);
  return redirect(`/admin/texter?sida=${page.id}&klart=uppbyggnad_aterstalld`, 303);
}

/**
 * Spara sidans uppbyggnad (synlighet, ordning, textstilar). Bara rader som ändrats skrivs.
 * Returnerar en kort beskrivning per ändring för ändringsloggen.
 */
async function saveLayout(db: D1Database, entries: [string, string | null][]): Promise<string[]> {
  if (!entries.length) return [];
  const { results } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${entries.map(() => "?").join(",")})`)
    .bind(...entries.map(([k]) => k))
    .all<{ key: string; value: string }>();
  const current = new Map(results.map((r) => [r.key, r.value]));
  const changes = entries.filter(([k, v]) => (current.get(k) ?? null) !== v);
  if (!changes.length) return [];
  await db.batch(
    changes.map(([k, v]) =>
      v === null
        ? db.prepare("DELETE FROM settings WHERE key = ?").bind(k)
        : db
            .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
            .bind(k, v),
    ),
  );
  return changes.map(([k, v]) => {
    if (k.startsWith("sida:")) return v ? "sidan dold" : "sidan visas";
    if (k.startsWith("ordning:")) return "avsnittens ordning";
    if (k.startsWith("dolt:")) return "dolda avsnitt";
    if (k.startsWith(SLIDE_PREFIX)) return `bildspel för ${FIELD_INDEX.get(k.slice(SLIDE_PREFIX.length))?.field.label ?? k}`;
    const field = FIELD_INDEX.get(k.slice("stil:".length))?.field.label ?? k;
    return `stil för ${field}`;
  });
}

// ───────────────────────── Ångra och tidigare versioner ─────────────────────────

interface VersionRow {
  id: number;
  key: string;
  value: string;
  batch: string | null;
  user_email: string | null;
  created_at: string;
}

/** Värdet före en viss version (eller standardtexten om det inte finns något äldre). */
async function valueBefore(db: D1Database, key: string, id: number): Promise<string> {
  const prev = await db.prepare("SELECT value FROM setting_versions WHERE key = ? AND id < ? ORDER BY id DESC LIMIT 1").bind(key, id).first<{ value: string }>();
  return prev ? prev.value : DEFAULT_SETTINGS[key as SettingKey] ?? "";
}

export async function undoSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  const pageId = String(form.get("sida") ?? "");
  const back = findPage(pageId) ? `/admin/texter?sida=${pageId}` : pageId === MENU_ID ? `/admin/texter?sida=${MENU_ID}` : "/admin/texter";
  if (!checkCsrf(c, session, form)) return redirect(`${back}&fel=csrf`, 303);
  const batch = String(form.get("andring") ?? "");
  const db = c.env.DB;
  const { results } = await db.prepare("SELECT * FROM setting_versions WHERE batch = ? ORDER BY id").bind(batch).all<VersionRow>();
  if (!results.length) return redirect(back, 303);
  const s = await loadSettings(db);
  const updates: [string, string][] = [];
  let skipped = 0;
  for (const v of results) {
    // Har någon ändrat texten igen efteråt ångrar vi inte deras ändring.
    if (s[v.key as SettingKey] !== v.value) {
      skipped++;
      continue;
    }
    updates.push([v.key, await valueBefore(db, v.key, v.id)]);
  }
  const { batch: newBatch } = await saveSettings(db, session, updates);
  if (newBatch) await audit(c.env, session, "ångrade ändringar på", "sidan", findPage(pageId)?.id ?? null, `${updates.length} texter`);
  return redirect(`${back}${back.includes("?") ? "&" : "?"}klart=${skipped ? "angrat-delvis" : "angrat"}`, 303);
}

export async function historyPage(c: RequestContext, session: Session): Promise<Response> {
  const key = c.url.searchParams.get("nyckel") ?? "";
  const loc = FIELD_INDEX.get(key);
  const isMenu = key === "menu_config";
  if (!loc && !isMenu) return redirect("/admin/texter", 303);
  const db = c.env.DB;
  const s = await loadSettings(db);
  const current = s[key as SettingKey];
  const def = DEFAULT_SETTINGS[key as SettingKey];
  const { results } = await db.prepare("SELECT * FROM setting_versions WHERE key = ? ORDER BY id DESC LIMIT ?").bind(key, KEEP_VERSIONS).all<VersionRow>().catch(() => ({ results: [] as VersionRow[] }));
  const isImage = loc?.field.type === "image";
  const label = isMenu ? "Menyn" : loc!.field.label;
  const backHref = isMenu ? `/admin/texter?sida=${MENU_ID}` : `/admin/texter?sida=${loc!.page.id}&falt=${key}`;

  const show = (value: string): SafeHtml => {
    if (isImage) {
      const src = mediaUrl(value || null, "sm");
      return src ? html`<img class="version-image" src="${src}" alt="">` : html`<span class="muted">Ingen bild</span>`;
    }
    if (isMenu) return html`<span class="muted">${value ? "Anpassad meny" : "Standardmenyn"}</span>`;
    if (loc?.field.type === "choice") return html`<div class="version-value">${loc.field.options?.find((o) => o.value === value)?.label ?? value}</div>`;
    return value ? html`<div class="version-value">${value}</div>` : html`<span class="muted">(tom)</span>`;
  };

  const restoreForm = (opts: { version?: number; original?: boolean }) => html`<form method="post" action="/admin/texter/historik" data-confirm="Återställa den här versionen? Den nuvarande texten sparas i historiken, så du kan ångra.">
    ${csrfField(session)}<input type="hidden" name="nyckel" value="${key}">
    ${opts.version ? html`<input type="hidden" name="version" value="${opts.version}">` : html`<input type="hidden" name="original" value="1">`}
    <button class="btn btn-outline btn-sm" type="submit">${icon("history", "icon icon-sm")}Återställ</button>
  </form>`;

  const content = html`
    ${adminHead(`Tidigare versioner: ${label}`, {
      back: { href: backHref, label: isMenu ? "Menyn" : `${loc!.page.title} › ${loc!.section.title}` },
      lead: "Varje gång texten sparas läggs en version här. Återställ en äldre version med ett klick – den nuvarande sparas också, så inget försvinner.",
    })}
    <ol class="version-list">
      <li class="version-item is-current">
        <div class="version-meta"><span class="pill pill-on">Nu på webbplatsen</span></div>
        ${show(current)}
      </li>
      ${results.map(
        (v) => html`<li class="version-item">
          <div class="version-meta">
            <strong>${formatDateTimeShort(v.created_at)}</strong>
            <span class="muted">${v.batch ? (v.user_email ?? "Okänd") : "Texten före första ändringen"}</span>
            ${v.value === current ? html`<span class="pill">Samma som nu</span>` : ""}
          </div>
          ${show(v.value)}
          ${v.value !== current ? restoreForm({ version: v.id }) : ""}
        </li>`,
      )}
      <li class="version-item version-original">
        <div class="version-meta"><strong>Originaltexten</strong><span class="muted">Texten som webbplatsen levererades med</span>${def === current ? html`<span class="pill">Samma som nu</span>` : ""}</div>
        ${show(def)}
        ${def !== current ? restoreForm({ original: true }) : ""}
      </li>
    </ol>`;
  return adminLayout(c, session, { title: `Tidigare versioner: ${label}`, active: "/admin/texter", newCount: await newMessageCount(db), narrow: true }, content);
}

export async function historyRestore(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  const key = String(form.get("nyckel") ?? "");
  const loc = FIELD_INDEX.get(key);
  if (!loc && key !== "menu_config") return redirect("/admin/texter", 303);
  const back = `/admin/texter/historik?nyckel=${key}`;
  if (!checkCsrf(c, session, form)) return redirect(`${back}&fel=csrf`, 303);
  let value: string | null = null;
  if (form.get("original")) value = DEFAULT_SETTINGS[key as SettingKey];
  else {
    const row = await c.env.DB.prepare("SELECT value FROM setting_versions WHERE id = ? AND key = ?").bind(Number(form.get("version")), key).first<{ value: string }>();
    value = row?.value ?? null;
  }
  if (value === null) return redirect(back, 303);
  if (loc?.field.type === "image" && value) {
    const exists = await c.env.DB.prepare("SELECT key FROM media WHERE key = ?").bind(value).first().catch(() => null);
    if (!exists) return redirect(`${back}&fel=bild-borta`, 303);
  }
  await saveSettings(c.env.DB, session, [[key, value]]);
  await audit(c.env, session, "återställde en tidigare version av", "texten", loc?.page.id ?? null, loc ? `${loc.page.title}: ${loc.field.label}` : "Menyn");
  return redirect(`${back}&klart=aterstallt-text`, 303);
}

// ───────────────────────── Menyn ─────────────────────────

function menuRow(it: ResolvedLink, isChild: boolean, index: number, total: number): SafeHtml {
  return html`<div class="menu-row${it.hidden ? " is-hidden" : ""}" data-menu-row>
    <input type="hidden" name="${isChild ? "underordning" : "ordning"}" value="${it.id}">
    <div class="menu-label-field">
      <label class="sr-only" for="meny-${it.id}">Namn på ${it.defaultLabel}</label>
      <input type="text" id="meny-${it.id}" name="etikett_${it.id}" value="${it.label}" placeholder="${it.defaultLabel}" maxlength="60" data-menu-label>
      <span class="menu-href">${it.href}</span>
    </div>
    <label class="menu-visible" title="Visa i menyn">
      <input type="checkbox" name="visa_${it.id}" value="1"${it.hidden ? "" : html` checked`} data-menu-visible>
      <span>Visas</span>
    </label>
    <div class="menu-move">
      <button class="icon-btn" type="submit" name="flytta" value="${it.id}:upp" aria-label="Flytta ${it.label} uppåt" data-move="up"${index === 0 ? html` disabled` : ""}>${icon("arrowUp", "icon icon-sm")}</button>
      <button class="icon-btn" type="submit" name="flytta" value="${it.id}:ner" aria-label="Flytta ${it.label} nedåt" data-move="down"${index === total - 1 ? html` disabled` : ""}>${icon("arrowDown", "icon icon-sm")}</button>
    </div>
  </div>`;
}

async function menuPage(c: RequestContext, session: Session, error?: string): Promise<Response> {
  const db = c.env.DB;
  const s = await loadSettings(db);
  const menu = resolveMenu(s);
  const versions = await db.prepare("SELECT COUNT(*) AS n FROM setting_versions WHERE key = 'menu_config'").first<{ n: number }>().catch(() => null);
  const content = html`
    ${adminHead("Menyn", {
      back: { href: "/admin/texter", label: "Alla sidor" },
      lead: "Byt namn på menyvalen, ändra ordningen med pilarna och dölj det som inte behövs. Sidorna finns kvar även om de döljs i menyn.",
      actions: pageNav(MENU_ID),
    })}
    ${c.url.searchParams.get("klart") === "meny" ? html`<div class="alert alert-ok" role="status">Menyn är sparad och syns nu på webbplatsen.</div>` : ""}
    ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ""}
    <div class="editor-with-preview">
      <form class="admin-form" id="meny-form" method="post" action="/admin/texter/meny" novalidate data-dirty-check data-menu-editor>
        ${csrfField(session)}
        <input type="hidden" name="menu_config" value="${s.menu_config}" data-menu-json>
        <ol class="menu-tree" data-menu-list>
          ${menu.map(
            (item, i) => html`<li class="menu-item" data-menu-item>
              ${menuRow(item, false, i, menu.length)}
              ${item.children?.length
                ? html`<ol class="menu-children" data-menu-list>
                    ${item.children.map((ch, j) => html`<li class="menu-item" data-menu-item>${menuRow(ch, true, j, item.children!.length)}</li>`)}
                  </ol>`
                : ""}
            </li>`,
          )}
        </ol>
        <p class="field-help">Tom ruta = standardnamnet. Undermenyerna följer med när du flyttar en huvudpunkt.</p>
        <div class="admin-form-actions sticky-actions">
          <button class="btn btn-primary btn-lg" type="submit">Spara menyn</button>
          <button class="btn btn-outline" type="submit" name="aterstall" value="1" data-confirm-click="Återställa menyn till standard? Alla namn, ordningen och dolda menyval återställs.">Återställ standardmenyn</button>
          ${versions?.n ? html`<a class="link-btn" href="/admin/texter/historik?nyckel=menu_config">${icon("clock", "icon icon-sm")}Tidigare versioner (${versions.n})</a>` : ""}
        </div>
      </form>
      ${previewPane({ formId: "meny-form", page: "/", pageLabel: "Startsidan", csrf: session.csrf })}
    </div>`;
  return adminLayout(c, session, { title: "Menyn", active: "/admin/texter", newCount: await newMessageCount(db), wide: true }, content, error ? 422 : 200);
}

/** Bygg menyns JSON från formuläret. Ordningen är den ordning fälten skickas i. */
function menuFromForm(form: FormData): MenuConfigItem[] {
  const topOrder = form.getAll("ordning").map(String);
  const childOrder = form.getAll("underordning").map(String);
  const label = (id: string, def: string) => {
    const l = String(form.get(`etikett_${id}`) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    return l && l !== def ? l : undefined;
  };
  const visible = (id: string) => Boolean(form.get(`visa_${id}`));
  const known = new Map(DEFAULT_NAV.map((d) => [d.id, d]));
  const items: MenuConfigItem[] = [];
  for (const id of topOrder) {
    const d = known.get(id);
    if (!d || items.some((i) => i.id === id)) continue;
    const children = d.children
      ? childOrder
          .filter((cid) => d.children!.some((dc) => dc.id === cid))
          .map((cid) => {
            const dc = d.children!.find((x) => x.id === cid)!;
            return { id: cid, label: label(cid, dc.label), hidden: !visible(cid) || undefined };
          })
      : undefined;
    items.push({ id, label: label(id, d.label), hidden: !visible(id) || undefined, children });
  }
  return items;
}

function moveIn<T extends { id: string }>(list: T[], id: string, dir: "upp" | "ner"): boolean {
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) return false;
  const j = dir === "upp" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return true;
  [list[i], list[j]] = [list[j]!, list[i]!];
  return true;
}

/** Är menyn likadan som standardmenyn? Då sparas inget (standardmenyn gäller). */
function isDefaultMenu(items: MenuConfigItem[]): boolean {
  return (
    items.length === DEFAULT_NAV.length &&
    items.every((it, i) => {
      const d = DEFAULT_NAV[i]!;
      return it.id === d.id && !it.label && !it.hidden && (it.children ?? []).every((ch, j) => ch.id === d.children?.[j]?.id && !ch.label && !ch.hidden);
    })
  );
}

export async function menuSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect(`/admin/texter?sida=${MENU_ID}&fel=csrf`, 303);
  let items = menuFromForm(form);
  if (form.get("aterstall")) items = [];
  const move = /^([a-z0-9-]+):(upp|ner)$/.exec(String(form.get("flytta") ?? ""));
  if (move) {
    const [, id, dir] = move;
    if (!moveIn(items, id!, dir as "upp" | "ner")) for (const it of items) if (it.children && moveIn(it.children, id!, dir as "upp" | "ner")) break;
  }
  if (items.length && items.every((i) => i.hidden)) {
    return menuPage(c, session, "Minst ett menyval måste synas – annars hittar besökarna inte runt på webbplatsen.");
  }
  // Ta bort tomma fält så att JSON:en blir kort och läsbar
  const clean = items.map((i) => JSON.parse(JSON.stringify(i)) as MenuConfigItem);
  const json = !items.length || isDefaultMenu(clean) ? "" : JSON.stringify(clean);
  const { batch } = await saveSettings(c.env.DB, session, [["menu_config", json]]);
  if (batch && !move) await audit(c.env, session, "ändrade", "menyn", null, form.get("aterstall") ? "Återställde standardmenyn" : undefined);
  if (move) return redirect(`/admin/texter?sida=${MENU_ID}#meny-${move[1]}`, 303);
  return redirect(`/admin/texter?sida=${MENU_ID}&klart=${batch ? "meny" : "oforandrat"}`, 303);
}
