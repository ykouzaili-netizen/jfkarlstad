import { html } from "../lib/html.js";
import { ALL_FIELDS, editUrlFor, FIELD_INDEX } from "../lib/texts.js";
import { loadSettings, type SettingKey } from "../lib/settings.js";
import { parsePartnerLinks } from "../lib/partner-links.js";
import { formatDateTimeShort, stockholmNow, stockholmToday } from "../lib/format.js";
import { icon } from "../views/icons.js";
import type { RequestContext } from "../router.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";

/**
 * Länkkontroll (Webbplatsen → Länkkontroll): alla länkar ut från webbplatsen – Hitract, Instagram, partners,
 * nätverk, jobb, event, dokument, tävlingen och länkar i texterna – kontrolleras och de som inte fungerar visas överst.
 *
 * - Kontrollen körs från adminpanelen i omgångar om högst BATCH länkar (admin.js anropar /admin/lankar/kontroll),
 *   så att en Worker aldrig gör fler än ~20 utgående anrop åt gången (Cloudflares gräns är 50 på gratisplanen).
 *   Utan JavaScript kontrolleras de första 40 länkarna.
 * - Bara adresser som faktiskt finns på webbplatsen kontrolleras (ingen öppen "hämta vilken adress som helst").
 * - Senaste resultatet sparas i settings (nyckeln `lankkontroll`) så att det syns nästa gång sidan öppnas.
 */

const RESULT_KEY = "lankkontroll";
const BATCH = 15;
const TIMEOUT_MS = 8000;

export interface FoundLink {
  url: string;
  places: { label: string; href: string }[];
}

type Verdict = "ok" | "trasig" | "osaker";
interface CheckResult {
  status: number; // HTTP-status, 0 = gick inte att nå
  verdict: Verdict;
  message: string;
  at: string; // svensk tid YYYY-MM-DDTHH:MM
}

const URL_IN_TEXT = /\]\((https?:\/\/[^)\s]+)\)|(?<![(\w])(https?:\/\/[^\s<>"')\]]+)/g;

function linksInText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_IN_TEXT)) out.push((m[1] ?? m[2] ?? "").replace(/[.,;:!?]+$/, ""));
  return out.filter(Boolean);
}

const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\/[^\s]+\.[^\s]+/i.test(u);

/** Alla länkar ut från webbplatsen, med var de används och var de ändras. */
export async function collectLinks(c: RequestContext): Promise<FoundLink[]> {
  const db = c.env.DB;
  const own = new URL(c.env.SITE_URL).hostname.replace(/^www\./, "");
  const map = new Map<string, FoundLink>();
  const add = (url: string | null | undefined, label: string, href: string) => {
    if (!isHttp(url)) return;
    let key = url.trim();
    try {
      const u = new URL(key);
      if (u.hostname.replace(/^www\./, "") === own) return; // länkar inom sajten kontrolleras inte
      key = u.toString();
    } catch {
      return;
    }
    const found = map.get(key) ?? { url: key, places: [] };
    if (!found.places.some((p) => p.label === label)) found.places.push({ label, href });
    map.set(key, found);
  };

  // Texter och sidor: länkfält och länkar i texterna
  const s = await loadSettings(db);
  for (const f of ALL_FIELDS) {
    const v = s[f.key as SettingKey] ?? "";
    if (!v) continue;
    const loc = FIELD_INDEX.get(f.key);
    const label = loc ? `${loc.page.title} › ${f.label}` : f.label;
    const href = editUrlFor(f.key) ?? "/admin/texter";
    if (f.type === "url") add(v, label, href);
    else if (f.type === "rich" || f.type === "markdown" || f.type === "textarea") for (const u of linksInText(v)) add(u, label, href);
  }

  const today = stockholmToday();
  const now = stockholmNow();
  const q = async <T>(sql: string, ...bind: unknown[]): Promise<T[]> => {
    try {
      return (await db.prepare(sql).bind(...bind).all<T>()).results ?? [];
    } catch {
      return []; // tabellen finns inte i en äldre databas
    }
  };
  const [partners, networks, jobs, events, docs, news, resources, videos] = await Promise.all([
    q<{ id: number; name: string; website_url: string | null; career_url: string | null; links: string }>("SELECT id, name, website_url, career_url, links FROM partners"),
    q<{ id: number; name: string; website_url: string | null; links: string; description: string }>("SELECT id, name, website_url, links, description FROM networks"),
    q<{ id: number; title: string; apply_url: string | null; body: string }>(
      "SELECT id, title, apply_url, body FROM jobs WHERE published = 1 AND (deadline IS NULL OR deadline >= ?)",
      today,
    ),
    q<{ id: number; title: string; signup_url: string | null; body: string }>(
      "SELECT id, title, signup_url, body FROM events WHERE published = 1 AND COALESCE(ends_at, substr(starts_at, 1, 10) || 'T23:59') >= ?",
      now,
    ),
    q<{ id: number; title: string; link_url: string | null }>("SELECT id, title, link_url FROM documents WHERE link_url IS NOT NULL AND link_url != ''"),
    q<{ id: number; title: string; body: string }>("SELECT id, title, body FROM news WHERE published = 1"),
    q<{ id: number; title: string; url: string | null }>("SELECT id, title, url FROM competition_resources WHERE url IS NOT NULL"),
    q<{ id: number; title: string; youtube_url: string }>("SELECT id, title, youtube_url FROM gallery_videos WHERE published = 1"),
  ]);
  for (const p of partners) {
    const href = `/admin/partners/${p.id}`;
    add(p.website_url, `Partner › ${p.name} › webbplats`, href);
    add(p.career_url, `Partner › ${p.name} › karriärsida`, href);
    for (const l of parsePartnerLinks(p.links)) add(l.url, `Partner › ${p.name} › ${l.label}`, href);
  }
  for (const n of networks) {
    const href = `/admin/natverk/${n.id}`;
    add(n.website_url, `Studentnätverk › ${n.name} › webbplats`, href);
    for (const l of parsePartnerLinks(n.links)) add(l.url, `Studentnätverk › ${n.name} › ${l.label}`, href);
    for (const u of linksInText(n.description ?? "")) add(u, `Studentnätverk › ${n.name} › texten`, href);
  }
  for (const j of jobs) {
    add(j.apply_url, `Jobb › ${j.title} › ansökan`, `/admin/jobb/${j.id}`);
    for (const u of linksInText(j.body ?? "")) add(u, `Jobb › ${j.title} › texten`, `/admin/jobb/${j.id}`);
  }
  for (const e of events) {
    add(e.signup_url, `Event › ${e.title} › anmälan`, `/admin/event/${e.id}`);
    for (const u of linksInText(e.body ?? "")) add(u, `Event › ${e.title} › texten`, `/admin/event/${e.id}`);
  }
  for (const d of docs) add(d.link_url, `Dokument › ${d.title}`, `/admin/dokument/${d.id}`);
  for (const n of news) for (const u of linksInText(n.body ?? "")) add(u, `Nyhet › ${n.title}`, `/admin/nyheter/${n.id}`);
  for (const r of resources) add(r.url, `Tävlingen › ${r.title}`, `/admin/tavling-material/${r.id}`);
  for (const v of videos) add(v.youtube_url, `Film › ${v.title}`, `/admin/filmer/${v.id}`);

  return [...map.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function loadResults(db: D1Database): Promise<Record<string, CheckResult>> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(RESULT_KEY).first<{ value: string }>();
    const data = row ? (JSON.parse(row.value) as Record<string, CheckResult>) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function saveResults(db: D1Database, results: Record<string, CheckResult>, keep: Set<string>): Promise<void> {
  // Bara länkar som fortfarande finns sparas – borttagna länkar försvinner ur resultatet.
  const clean: Record<string, CheckResult> = {};
  for (const [u, r] of Object.entries(results)) if (keep.has(u)) clean[u] = r;
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(RESULT_KEY, JSON.stringify(clean))
    .run();
}

/** Kontrollera en adress: HEAD först, GET om servern inte svarar på HEAD. Följer omdirigeringar. */
async function checkUrl(url: string): Promise<CheckResult> {
  const at = stockholmNow();
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; JFK-lankkontroll/1.0; +https://jfkarlstad.se)",
    Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
  };
  const attempt = (method: "HEAD" | "GET") => fetch(url, { method, redirect: "follow", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let status = 0;
  try {
    let res = await attempt("HEAD");
    if ([400, 403, 404, 405, 429, 500, 501, 999].includes(res.status)) {
      // Många servrar svarar fel på HEAD men rätt på GET – försök en gång till innan länken räknas som trasig.
      res = await attempt("GET");
      if (res.body) await res.body.cancel();
    }
    status = res.status;
  } catch (err) {
    const timeout = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
    return { status: 0, verdict: "trasig", message: timeout ? "Svarade inte inom 8 sekunder" : "Gick inte att nå (adressen finns inte eller servern är nere)", at };
  }
  if (status >= 200 && status < 400) return { status, verdict: "ok", message: "Fungerar", at };
  if (status === 404 || status === 410) return { status, verdict: "trasig", message: "Sidan finns inte (404)", at };
  if (status === 401 || status === 403 || status === 429 || status === 999)
    return { status, verdict: "osaker", message: "Sajten stoppar automatiska kontroller – öppna länken och kontrollera själv", at };
  if (status >= 500) return { status, verdict: "osaker", message: `Fel hos sajten just nu (${status}) – prova igen senare`, at };
  return { status, verdict: "trasig", message: `Svarade med fel (${status})`, at };
}

async function checkMany(urls: string[]): Promise<Record<string, CheckResult>> {
  const out: Record<string, CheckResult> = {};
  // Några i taget, så att en långsam sajt inte håller upp resten
  for (let i = 0; i < urls.length; i += 5) {
    const part = urls.slice(i, i + 5);
    const res = await Promise.all(part.map(checkUrl));
    part.forEach((u, k) => (out[u] = res[k]!));
  }
  return out;
}

const VERDICT_LABEL: Record<Verdict | "ny", string> = { ok: "Fungerar", trasig: "Fungerar inte", osaker: "Kontrollera själv", ny: "Inte kontrollerad" };
const ORDER: Record<Verdict | "ny", number> = { trasig: 0, osaker: 1, ny: 2, ok: 3 };

function shortUrl(u: string): string {
  try {
    const x = new URL(u);
    const path = (x.pathname + x.search).replace(/\/$/, "");
    return x.hostname.replace(/^www\./, "") + (path.length > 48 ? path.slice(0, 46) + "…" : path);
  } catch {
    return u;
  }
}

export async function linkCheckPage(c: RequestContext, session: Session): Promise<Response> {
  const [links, results] = await Promise.all([collectLinks(c), loadResults(c.env.DB)]);
  const rows = links
    .map((l) => ({ ...l, result: results[l.url] as CheckResult | undefined }))
    .sort((a, b) => ORDER[a.result?.verdict ?? "ny"] - ORDER[b.result?.verdict ?? "ny"] || a.url.localeCompare(b.url));
  const count = (v: Verdict | "ny") => rows.filter((r) => (r.result?.verdict ?? "ny") === v).length;
  const last = Object.values(results).reduce((m, r) => (r.at > m ? r.at : m), "");
  const done = c.url.searchParams.get("klart") === "1";

  const pill = (v: Verdict | "ny") => html`<span class="pill lc-pill lc-${v}">${VERDICT_LABEL[v]}</span>`;
  const content = html`
    ${adminHead("Länkkontroll", {
      lead: "Alla länkar från webbplatsen till andra sajter – Hitract, Instagram, partners, jobb, event, dokument och länkar i texterna. Kör kontrollen ibland, så hittar ni trasiga länkar innan besökarna gör det.",
      actions: html`<form method="post" action="/admin/lankar" data-link-check data-csrf="${session.csrf}" data-total="${links.length}">
          ${csrfField(session)}
          <button class="btn btn-primary" type="submit">${icon("link", "icon icon-sm")}Kontrollera alla länkar</button>
        </form>`,
    })}
    <div class="lc-summary" role="status" data-link-summary>
      <span class="lc-stat"><strong>${links.length}</strong> länkar</span>
      <span class="lc-stat lc-stat-trasig"><strong data-count="trasig">${count("trasig")}</strong> fungerar inte</span>
      <span class="lc-stat lc-stat-osaker"><strong data-count="osaker">${count("osaker")}</strong> att kontrollera själv</span>
      <span class="lc-stat lc-stat-ok"><strong data-count="ok">${count("ok")}</strong> fungerar</span>
      <span class="muted lc-last" data-link-last>${last ? html`Senast kontrollerad ${formatDateTimeShort(last.replace("T", " ") + ":00")}` : "Inte kontrollerad än"}${done ? " – klart!" : ""}</span>
    </div>
    <div class="lc-progress" hidden data-link-progress><progress max="${links.length}" value="0"></progress><span data-link-progress-text></span></div>
    ${links.length
      ? html`<div class="admin-card admin-card-flush">
          <table class="admin-table lc-table">
            <thead><tr><th scope="col">Status</th><th scope="col">Länk</th><th scope="col">Används i</th></tr></thead>
            <tbody>
              ${rows.map(
                (r) => html`<tr data-link-row="${r.url}" class="lc-row lc-row-${r.result?.verdict ?? "ny"}">
                  <td data-label="Status" class="lc-status">${pill(r.result?.verdict ?? "ny")}${r.result && r.result.verdict !== "ok" ? html`<span class="lc-msg">${r.result.message}</span>` : html`<span class="lc-msg"></span>`}</td>
                  <td data-label="Länk"><a class="lc-url" href="${r.url}" target="_blank" rel="noopener noreferrer">${shortUrl(r.url)}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a></td>
                  <td data-label="Används i"><ul class="lc-places">${r.places.map((p) => html`<li><a href="${p.href}">${p.label}</a></li>`)}</ul></td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`
      : html`<div class="admin-empty"><p>Webbplatsen har inga länkar till andra sajter än.</p></div>`}
    <p class="field-help stats-note">Vissa sajter (t.ex. LinkedIn och Instagram) stoppar automatiska kontroller. De markeras ”Kontrollera själv” – öppna länken och se att den fungerar. Länkar inom webbplatsen kontrolleras inte.</p>`;
  return adminLayout(c, session, { title: "Länkkontroll", active: "/admin/lankar", newCount: await newMessageCount(c.env.DB), wide: true }, content);
}

/** Utan JavaScript: kontrollera de första 40 länkarna och visa sidan igen. */
export async function linkCheckSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return Response.redirect(new URL("/admin/lankar", c.url).toString(), 303);
  const links = await collectLinks(c);
  const results = await loadResults(c.env.DB);
  Object.assign(results, await checkMany(links.slice(0, 40).map((l) => l.url)));
  await saveResults(c.env.DB, results, new Set(links.map((l) => l.url)));
  await audit(c.env, session, "kontrollerade", "länkar", null, `${Math.min(40, links.length)} av ${links.length}`);
  return new Response(null, { status: 303, headers: { Location: "/admin/lankar?klart=1" } });
}

/** En omgång från admin.js: urls (radbrytningsseparerade, högst BATCH) → JSON med resultaten. */
export async function linkCheckBatch(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return new Response(JSON.stringify({ error: "Sessionen har gått ut. Ladda om sidan." }), { status: 403, headers: { "Content-Type": "application/json" } });
  const links = await collectLinks(c);
  const known = new Set(links.map((l) => l.url));
  const asked = String(form.get("urls") ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter((u) => known.has(u))
    .slice(0, BATCH);
  const checked = await checkMany(asked);
  const results = await loadResults(c.env.DB);
  Object.assign(results, checked);
  await saveResults(c.env.DB, results, known);
  if (form.get("sista") === "1") await audit(c.env, session, "kontrollerade", "länkar", null, `${links.length} länkar`);
  return new Response(JSON.stringify({ results: checked, labels: VERDICT_LABEL }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** Antal länkar som inte fungerade vid senaste kontrollen (Översikt). */
export async function brokenLinkCount(db: D1Database): Promise<number> {
  const results = await loadResults(db);
  return Object.values(results).filter((r) => r.verdict === "trasig").length;
}

export const LINK_CHECK_BATCH = BATCH;
