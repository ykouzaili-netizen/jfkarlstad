import { html, type SafeHtml } from "../lib/html.js";
import { DEFAULT_SETTINGS, type SettingKey, type Settings } from "../lib/settings.js";
import type { RequestContext } from "../router.js";
import { PREVIEW_IMAGE_PREFIX } from "../views/layout.js";
import { homePage } from "../pages/home.js";
import { aboutPage } from "../pages/about.js";
import { membershipPage } from "../pages/membership.js";
import { studentsPage } from "../pages/students.js";
import { companiesPage, contactPage, engagePage, paverkaPage, thanksPage } from "../pages/forms.js";
import { documentTextPage, documentsPage, eventDetailPage, faqPage, newsArticlePage, newsListPage, partnerDetailPage, partnersPage } from "../pages/listings.js";
import { jobDetailPage, jobsPage } from "../pages/careers.js";
import { calendarPage } from "../pages/calendar.js";
import { searchPage } from "../pages/search.js";
import { cookiesPage, privacyPage } from "../pages/legal.js";
import { notFoundPage } from "../pages/errors.js";
import { checkCsrf, type Session } from "./auth.js";
import { isImageSetting } from "../lib/media.js";
import { findPage } from "../lib/texts.js";
import { layoutEntries } from "./layout-form.js";

/**
 * Förhandsvisning i adminpanelen.
 * - POST /admin/forhandsvisning: formulärets osparade värden renderas med den riktiga sidkoden i en iframe
 *   bredvid redigeringen. Inget sparas. Valda men ej uppladdade bilder ersätts med en platshållare som
 *   admin.js byter mot bilden från datorn.
 * - GET /admin/webbplatsen: den klickbara kartan på Översikt – sidan som den ser ut nu, där varje text och
 *   varje innehåll är märkt med var det redigeras.
 */

type Render = (c: RequestContext) => Promise<Response>;

/** Sidor som kan väljas i förhandsvisningens meny. */
export const PREVIEW_PAGES: { path: string; label: string; render: Render }[] = [
  { path: "/", label: "Startsidan", render: homePage },
  { path: "/om-oss", label: "Om oss", render: aboutPage },
  { path: "/engagera-dig", label: "Engagera dig", render: (c) => engagePage(c) },
  { path: "/bli-medlem", label: "Bli medlem", render: membershipPage },
  { path: "/for-studenter", label: "För studenter", render: studentsPage },
  { path: "/karriar", label: "Jobb och praktik", render: jobsPage },
  { path: "/for-foretag", label: "För företag", render: (c) => companiesPage(c) },
  { path: "/partners", label: "Partners", render: partnersPage },
  { path: "/aktuellt", label: "Nyheter", render: newsListPage },
  { path: "/kalender", label: "Kalender", render: calendarPage },
  { path: "/dokument", label: "Dokument", render: documentsPage },
  { path: "/faq", label: "Vanliga frågor", render: faqPage },
  { path: "/jf-paverka", label: "JF Påverka", render: (c) => paverkaPage(c) },
  { path: "/kontakt", label: "Kontakt", render: (c) => contactPage(c) },
  { path: "/sok", label: "Sök", render: searchPage },
  { path: "/integritetspolicy", label: "Integritetspolicy", render: privacyPage },
  { path: "/cookies", label: "Kakor", render: cookiesPage },
  { path: "/sidan-finns-inte", label: "Felsidan (404)", render: notFoundPage },
];

/** Sidor med adress som beror på innehållet (förhandsvisas med det första som finns). */
const DYNAMIC: [RegExp, Render][] = [
  [/^\/partners\/([^/]+)$/, partnerDetailPage],
  [/^\/aktuellt\/([^/]+)$/, newsArticlePage],
  [/^\/dokument\/(\d+(?:-[a-z0-9-]*)?)$/, documentTextPage],
  [/^\/kalender\/([^/.]+)$/, eventDetailPage],
  [/^\/karriar\/([^/]+)$/, jobDetailPage],
  [/^\/kontakt\/tack$/, thanksPage("kontakt")],
  [/^\/for-foretag\/tack$/, thanksPage("foretag")],
  [/^\/jf-paverka\/tack$/, thanksPage("paverka")],
  [/^\/engagera-dig\/tack$/, thanksPage("engagemang")],
];

function resolve(target: string, origin: string): { url: URL; render: Render; params: Record<string, string> } | null {
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  const url = new URL(target, origin);
  const page = PREVIEW_PAGES.find((p) => p.path === url.pathname);
  if (page) return { url, render: page.render, params: {} };
  for (const [re, render] of DYNAMIC) {
    const m = re.exec(url.pathname);
    if (m) return { url, render, params: m[1] ? { slug: decodeURIComponent(m[1]) } : {} };
  }
  return null;
}

/** Tillåt att sidan visas i en iframe i adminpanelen (men aldrig på andra webbplatser). */
function framable(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", (headers.get("Content-Security-Policy") ?? "").replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(res.body, { status: 200, headers });
}

const MAX_VALUE = 20000;

export async function previewHandler(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return new Response("Ogiltig förfrågan", { status: 403 });
  const target = resolve(c.url.searchParams.get("sida") ?? "/", c.url.origin) ?? resolve("/", c.url.origin)!;

  // Bara kända inställningsnycklar tas med. Färger och typsnitt valideras ändå av themeCss().
  const override: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const v = form.get(key);
    if (typeof v !== "string") continue;
    // Bilder får bara vara en befintlig nyckel, tom (borttagen) eller en platshållare för en vald bild.
    if (isImageSetting(key) && v && !v.startsWith(PREVIEW_IMAGE_PREFIX) && !/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(v)) continue;
    override[key] = v.replace(/\r\n/g, "\n").trim().slice(0, MAX_VALUE);
  }

  // Osparad uppbyggnad från Texter och sidor: ordning, dolda avsnitt och textstilar.
  const editedPage = findPage(String(form.get("__sida_id") ?? ""));
  if (editedPage) {
    for (const [k, v] of layoutEntries(form, editedPage)) (override as Record<string, string>)[k] = v ?? "";
  }

  const editMap = c.url.searchParams.get("karta") === "1";
  const ctx: RequestContext = { ...c, url: target.url, params: target.params, preview: override, editMap };
  return framable(await target.render(ctx));
}

/** Klickbar karta över webbplatsen (Översikt). Visar sparat innehåll – ingenting kan ändras här. */
export async function siteMapHandler(c: RequestContext): Promise<Response> {
  const target = resolve(c.url.searchParams.get("sida") ?? "/", c.url.origin) ?? resolve("/", c.url.origin)!;
  const ctx: RequestContext = { ...c, url: target.url, params: target.params, preview: {}, editMap: true };
  return framable(await target.render(ctx));
}

/** Adress till en riktig sida för de avsnitt som visas på en undersida (t.ex. ett evenemang). */
export async function samplePath(db: D1Database, kind: "event" | "news" | "partner" | "job"): Promise<string | null> {
  const q = {
    event: ["/kalender/", "SELECT slug FROM events WHERE published = 1 ORDER BY starts_at DESC LIMIT 1"],
    news: ["/aktuellt/", "SELECT slug FROM news WHERE published = 1 ORDER BY published_at DESC LIMIT 1"],
    partner: ["/partners/", "SELECT slug FROM partners WHERE published = 1 ORDER BY CASE tier WHEN 'huvud' THEN 0 ELSE 1 END, sort_order LIMIT 1"],
    job: ["/karriar/", "SELECT slug FROM jobs WHERE published = 1 ORDER BY id DESC LIMIT 1"],
  }[kind] as [string, string];
  try {
    const row = await db.prepare(q[1]).first<{ slug: string }>();
    return row ? q[0] + encodeURIComponent(row.slug) : null;
  } catch {
    return null;
  }
}

/**
 * Panelen till höger: växla dator/mobil, (valfritt) välj sida, och en iframe med sidan.
 * `formId` pekar ut formuläret vars värden ska förhandsvisas. `editMap` gör texterna klickbara.
 */
export function previewPane(opts: { formId: string; page: string; pageLabel?: string; csrf: string; choosePage?: boolean; liveTheme?: boolean; editMap?: boolean }): SafeHtml {
  const known = PREVIEW_PAGES.find((p) => p.path === opts.page);
  const label = opts.pageLabel ?? known?.label ?? "Sidan";
  return html`<aside class="live-preview" id="forhandsvisning" aria-label="Förhandsvisning" data-live-preview data-form="${opts.formId}" data-page="${opts.page}" data-csrf="${opts.csrf}"${opts.liveTheme ? html` data-live-theme` : ""}${opts.editMap ? html` data-edit-map` : ""}>
    <div class="lp-head">
      <div class="lp-title">
        <span class="lp-dot" aria-hidden="true"></span>
        <span>Förhandsvisning</span>
        <span class="lp-state" data-lp-state aria-live="polite"></span>
      </div>
      <div class="lp-controls">
        ${opts.choosePage
          ? html`<label class="sr-only" for="lp-sida">Sida att förhandsvisa</label>
              <select id="lp-sida" class="lp-select" data-lp-page>
                ${PREVIEW_PAGES.map((p) => html`<option value="${p.path}"${p.path === opts.page ? html` selected` : ""}>${p.label}</option>`)}
              </select>`
          : html`<span class="lp-page-label" data-lp-label>${label}</span>`}
        ${deviceSwitch()}
        <button type="button" class="lp-close" data-lp-close aria-label="Stäng förhandsvisningen">✕</button>
      </div>
    </div>
    <div class="lp-viewport" data-lp-viewport>
      <iframe name="lp-ram" title="Förhandsvisning av ${label}" data-lp-frame tabindex="-1"></iframe>
      <div class="lp-loading" data-lp-loading>Laddar förhandsvisning …</div>
    </div>
    <p class="lp-note">${opts.editMap
      ? html`Visar dina ändringar innan de sparas. <strong>Klicka på en text</strong> för att hoppa till fältet.`
      : html`Visar dina ändringar innan de sparas. Inget syns på webbplatsen förrän du klickar <strong>Spara</strong>.`}</p>
  </aside>
  <button type="button" class="btn btn-primary lp-open" data-lp-open aria-controls="forhandsvisning">Visa förhandsvisning</button>`;
}

export function deviceSwitch(): SafeHtml {
  return html`<div class="lp-devices" role="group" aria-label="Skärmstorlek">
    <button type="button" class="lp-device" data-lp-device="desktop" aria-pressed="true">Dator</button>
    <button type="button" class="lp-device" data-lp-device="mobile" aria-pressed="false">Mobil</button>
  </div>`;
}
