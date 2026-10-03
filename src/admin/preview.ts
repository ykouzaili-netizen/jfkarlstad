import { html, type SafeHtml } from "../lib/html.js";
import { DEFAULT_SETTINGS, type SettingKey, type Settings } from "../lib/settings.js";
import type { RequestContext } from "../router.js";
import { PREVIEW_IMAGE_PREFIX } from "../views/layout.js";
import { homePage } from "../pages/home.js";
import { aboutPage } from "../pages/about.js";
import { membershipPage } from "../pages/membership.js";
import { studentsPage } from "../pages/students.js";
import { companiesPage, contactPage, paverkaPage } from "../pages/forms.js";
import { calendarPage, faqPage, newsListPage } from "../pages/listings.js";
import { checkCsrf, type Session } from "./auth.js";

/**
 * Förhandsvisning i adminpanelen.
 * Formulärets osparade värden skickas (POST) till /admin/forhandsvisning och renderas med den riktiga
 * sidkoden i en iframe bredvid redigeringen. Inget sparas. Valda men ej uppladdade bilder ersätts
 * med en platshållare som admin.js byter mot bilden från datorn.
 */

/** Sidor som kan förhandsvisas, med etikett för väljaren. */
export const PREVIEW_PAGES: { path: string; label: string; render: (c: RequestContext) => Promise<Response> }[] = [
  { path: "/", label: "Startsidan", render: homePage },
  { path: "/om-oss", label: "Om oss", render: aboutPage },
  { path: "/bli-medlem", label: "Bli medlem", render: membershipPage },
  { path: "/for-studenter", label: "För studenter", render: studentsPage },
  { path: "/for-foretag", label: "För företag", render: (c) => companiesPage(c) },
  { path: "/aktuellt", label: "Nyheter", render: newsListPage },
  { path: "/kalender", label: "Kalender", render: calendarPage },
  { path: "/jf-paverka", label: "JF Påverka", render: (c) => paverkaPage(c) },
  { path: "/faq", label: "Vanliga frågor", render: faqPage },
  { path: "/kontakt", label: "Kontakt", render: (c) => contactPage(c) },
];

const MAX_VALUE = 20000;

export async function previewHandler(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return new Response("Ogiltig förfrågan", { status: 403 });

  const page = PREVIEW_PAGES.find((p) => p.path === (c.url.searchParams.get("sida") ?? "/")) ?? PREVIEW_PAGES[0]!;

  // Bara kända inställningsnycklar tas med. Färger och typsnitt valideras ändå av themeCss().
  const override: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const v = form.get(key);
    if (typeof v !== "string") continue;
    // Bilder får bara vara en befintlig nyckel, tom (borttagen) eller en platshållare för en vald bild.
    if (key.endsWith("_key") && v && !v.startsWith(PREVIEW_IMAGE_PREFIX) && !/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(v)) continue;
    override[key] = v.replace(/\r\n/g, "\n").trim().slice(0, MAX_VALUE);
  }

  const previewCtx: RequestContext = { ...c, url: new URL(page.path, c.url.origin), params: {}, preview: override };
  const res = await page.render(previewCtx);

  // Förhandsvisningen ska kunna visas i en iframe i adminpanelen (men aldrig på andra webbplatser).
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", (headers.get("Content-Security-Policy") ?? "").replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(res.body, { status: 200, headers });
}

/**
 * Panelen till höger: växla dator/mobil, (valfritt) välj sida, och en iframe med sidan.
 * `formId` pekar ut formuläret vars värden ska förhandsvisas.
 */
export function previewPane(opts: { formId: string; page: string; csrf: string; choosePage?: boolean; liveTheme?: boolean }): SafeHtml {
  const current = PREVIEW_PAGES.find((p) => p.path === opts.page) ?? PREVIEW_PAGES[0]!;
  return html`<aside class="live-preview" id="forhandsvisning" aria-label="Förhandsvisning" data-live-preview data-form="${opts.formId}" data-page="${current.path}" data-csrf="${opts.csrf}"${opts.liveTheme ? html` data-live-theme` : ""}>
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
                ${PREVIEW_PAGES.map((p) => html`<option value="${p.path}"${p.path === current.path ? html` selected` : ""}>${p.label}</option>`)}
              </select>`
          : html`<span class="lp-page-label">${current.label}</span>`}
        <div class="lp-devices" role="group" aria-label="Skärmstorlek">
          <button type="button" class="lp-device" data-lp-device="desktop" aria-pressed="true">Dator</button>
          <button type="button" class="lp-device" data-lp-device="mobile" aria-pressed="false">Mobil</button>
        </div>
        <button type="button" class="lp-close" data-lp-close aria-label="Stäng förhandsvisningen">✕</button>
      </div>
    </div>
    <div class="lp-viewport" data-lp-viewport>
      <iframe name="lp-ram" title="Förhandsvisning av ${current.label}" data-lp-frame tabindex="-1"></iframe>
      <div class="lp-loading" data-lp-loading>Laddar förhandsvisning …</div>
    </div>
    <p class="lp-note">Visar dina ändringar innan de sparas. Inget syns på webbplatsen förrän du klickar <strong>Spara</strong>.</p>
  </aside>
  <button type="button" class="btn btn-primary lp-open" data-lp-open aria-controls="forhandsvisning">Visa förhandsvisning</button>`;
}
