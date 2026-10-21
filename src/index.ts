import { ensureCommitteeSchema } from "./lib/committees.js";
import { ensureInstagramSchema } from "./lib/instagram.js";
import { LAYOUT_PREFIX, PAGE_LAYOUTS, pageIdForPath } from "./lib/pagelayout.js";
import { escapeHtml } from "./lib/html.js";
import { formatDay } from "./lib/format.js";
import type { Env } from "./env.js";
import { Router, type RequestContext } from "./router.js";
import { randomToken, redirect, textResponse } from "./lib/http.js";
import { findRedirect, looksLikeOldAddress } from "./lib/legacy.js";
import { getFile, MEDIA_VARIANT_VERSION } from "./lib/storage.js";
import { thumbnail } from "./lib/youtube.js";
import { homePage } from "./pages/home.js";
import { aboutPage } from "./pages/about.js";
import { membershipPage } from "./pages/membership.js";
import { studentsPage } from "./pages/students.js";
import { companiesPage, contactPage, engagePage, nominatePage, paverkaPage, submitHandler, thanksPage } from "./pages/forms.js";
import { jobDetailPage, jobsPage, outboundHandler } from "./pages/careers.js";
import { calendarPage } from "./pages/calendar.js";
import { searchPage } from "./pages/search.js";
import {
  calendarFeedHandler,
  documentFileHandler,
  documentTextPage,
  documentsPage,
  eventDetailPage,
  faqPage,
  newsArticlePage,
  newsListPage,
  partnerDetailPage,
  partnersPage,
} from "./pages/listings.js";
import { cookiesPage, privacyPage, sitemapXml } from "./pages/legal.js";
import { networkPage } from "./pages/networks.js";
import { competitionIcsHandler, competitionPage } from "./pages/competition.js";
import { shopCartPage, shopPage, shopProductPage } from "./pages/shop.js";
import { errorPage, notFoundPage } from "./pages/errors.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { getSession } from "./admin/auth.js";
import { runMaintenance } from "./lib/maintenance.js";
import { hasShareCookie, loadShare, safeEqual, SHARE_PARAM, shareCookie, type Share } from "./lib/share.js";

/**
 * En dold sida som visas för den som är inloggad: en rad överst säger att besökarna inte ser den,
 * och svaret får inte sparas någonstans (private, no-store) eller indexeras.
 */
async function hiddenPreview(res: Response, path: string, shared?: Share): Promise<Response> {
  const pageId = pageIdForPath(path) ?? "";
  const note = shared
    ? `<p class="hidden-page-note" role="status"><strong>Förhandsvisning.</strong> Sidan är inte publicerad än – du ser den via en privat länk som gäller till ${escapeHtml(formatDay(shared.expires.slice(0, 10)))}.</p>`
    : `<p class="hidden-page-note" role="status"><strong>Sidan är dold.</strong> Bara du som är inloggad ser den. <a href="/admin/texter?sida=${encodeURIComponent(pageId)}">Visa den för alla under Texter och sidor</a></p>`;
  const body = (await res.text()).replace('<main id="innehall" tabindex="-1">', (m) => note + m);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(body, { status: 200, headers });
}

/** Sidor som styrelsen dolt (Texter och sidor) svarar som om de inte finns. */
async function isHiddenPage(env: Env, path: string): Promise<boolean> {
  const pageId = pageIdForPath(path);
  if (!pageId) return false;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(LAYOUT_PREFIX.page + pageId).first<{ value: string }>();
    return row?.value === "dold";
  } catch {
    return false;
  }
}

const router = new Router()
  .get("/", homePage)
  .get("/om-oss", aboutPage)
  .get("/om-oss/:slug", networkPage)
  .get("/engagera-dig", (c) => engagePage(c))
  .post("/engagera-dig", submitHandler("engagemang"))
  .get("/engagera-dig/tack", thanksPage("engagemang"))
  .get("/bli-medlem", membershipPage)
  .get("/for-studenter", studentsPage)
  .get("/karriar", jobsPage)
  .get("/karriar/:slug", jobDetailPage)
  .get("/ut/:kind/:id", outboundHandler)
  .get("/sok", searchPage)
  .get("/for-foretag", (c) => companiesPage(c))
  .post("/for-foretag", submitHandler("foretag"))
  .get("/for-foretag/tack", thanksPage("foretag"))
  .get("/partners", partnersPage)
  .get("/partners/:slug", partnerDetailPage)
  .get("/aktuellt", newsListPage)
  .get("/aktuellt/:slug", newsArticlePage)
  .get("/kalender", calendarPage)
  .get("/kalender.ics", calendarFeedHandler)
  .get("/kalender/:slug", eventDetailPage)
  .get("/dokument", documentsPage)
  .get("/dokument/fil/:id", documentFileHandler)
  .get("/dokument/:slug", documentTextPage)
  .get("/jf-paverka", (c) => paverkaPage(c))
  .post("/jf-paverka", submitHandler("paverka"))
  .get("/jf-paverka/tack", thanksPage("paverka"))
  .get("/nominera", (c) => nominatePage(c))
  .post("/nominera", submitHandler("nominering"))
  .get("/nominera/tack", thanksPage("nominering"))
  .get("/tavling", competitionPage)
  .get("/tavling/kalender.ics", competitionIcsHandler)
  .get("/tavlingen", () => redirect("/tavling", 301))
  .get("/butik", shopPage)
  .get("/butik/varukorg", shopCartPage)
  .get("/butik/:slug", shopProductPage)
  .get("/butiken", () => redirect("/butik", 301))
  .get("/faq", faqPage)
  .get("/kontakt", (c) => contactPage(c))
  .post("/kontakt", submitHandler("kontakt"))
  .get("/kontakt/tack", thanksPage("kontakt"))
  .get("/integritetspolicy", privacyPage)
  .get("/cookies", cookiesPage)
  .get("/sitemap.xml", sitemapXml)
  .get("/robots.txt", (c) =>
    textResponse(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /ut/\nDisallow: /sok?\n\nSitemap: ${c.env.SITE_URL.replace(/\/$/, "")}/sitemap.xml\n`, "text/plain; charset=utf-8"),
  )
  // Webbläsare och sökmotorer frågar ibland efter /favicon.ico direkt – skicka dem till logotypen.
  .get("/favicon.ico", async (c) => {
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'logo_key'").first<{ value: string }>().catch(() => null);
    return redirect(row?.value ? `/media/${encodeURI(row.value)}` : "/assets/favicon.svg");
  })
  .get("/media/:key", mediaHandler)
  // YouTubes stillbild för galleriets filmer – hämtas och lagras av sajten (se lib/youtube.ts).
  .get("/film/bild/:file", async (c) => (await thumbnail(c.env, (c.params.file ?? "").replace(/\.jpg$/, ""))) ?? notFoundPage(c));

registerAdminRoutes(router);

/** Uppladdade bilder. Nyckeln innehåller ett slumpat id, så filerna kan cachas länge. */
/**
 * Bilder (och andra filer) under /media. Filnamnen byts när en bild byts ut, så svaren kan cachas för
 * evigt – i webbläsaren och i Cloudflares datacenter nära besökaren (caches.default). Då hämtas en bild
 * från lagringen (KV/R2) bara första gången i varje datacenter, i stället för vid varje besök.
 */
async function mediaHandler(c: RequestContext): Promise<Response> {
  const key = c.params.key ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(key)) return notFoundPage(c);
  const edge = typeof caches !== "undefined" && c.req.method === "GET" ? caches.default : null;
  // Bara versionsparametern för de mindre versionerna räknas (se MEDIA_VARIANT_VERSION) – andra parametrar kan inte fylla cachen.
  const versioned = /\.(sm|md)$/.test(key) && c.url.searchParams.get("v") === MEDIA_VARIANT_VERSION;
  const cacheKey = new Request(new URL(`/media/${key}${versioned ? `?v=${MEDIA_VARIANT_VERSION}` : ""}`, c.url).toString(), { method: "GET" });
  if (edge) {
    const hit = await edge.match(cacheKey);
    if (hit) return hit;
  }
  const res = await mediaFromStorage(c, key);
  if (edge && res.status === 200) {
    // Kopian i datacentret lever högst ett dygn, så att en raderad bild (t.ex. ett personfoto) försvinner
    // överallt inom 24 timmar även om den raderas från ett annat datacenter (GDPR). En reserv (originalet i
    // stället för en mindre version som inte är gjord än) lever bara en kort stund – se mediaFromStorage.
    const copy = new Response(res.clone().body, res);
    copy.headers.set("Cache-Control", res.headers.has("X-Media-Fallback") ? "public, max-age=600" : "public, max-age=86400");
    c.exec.waitUntil(edge.put(cacheKey, copy));
  }
  return res;
}

async function mediaFromStorage(c: RequestContext, key: string): Promise<Response> {
  // De mindre versionerna (".sm" 800 px, ".md" 1600 px) finns inte för äldre bilder, små bilder och SVG – svara
  // då med originalet. Det svaret cachas bara kort, så att versionen används så fort den har gjorts
  // (Bildbanken → Optimera bilderna) i stället för att originalet ligger kvar i webbläsarens cache i ett år.
  let file = await getFile(c.env, key);
  let fallback = false;
  if (!file && /\.(sm|md)$/.test(key)) {
    file = await getFile(c.env, key.slice(0, -3));
    fallback = true;
  }
  if (!file) return notFoundPage(c);
  return new Response(c.req.method === "HEAD" ? null : file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": fallback ? "public, max-age=3600" : "public, max-age=31536000, immutable",
      ...(fallback ? { "X-Media-Fallback": "1" } : {}),
      "X-Content-Type-Options": "nosniff",
      // Förhindra att uppladdade filer (t.ex. SVG) kan köra skript i vår origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}

/** Värdnamnet i SITE_URL om det är en egen domän, annars null (workers.dev eller lokalt = ingen omdirigering). */
function canonicalHost(env: Env): string | null {
  try {
    const host = new URL(env.SITE_URL).hostname;
    return host.endsWith(".workers.dev") || host === "localhost" || host === "127.0.0.1" ? null : host;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Endast HTTPS (utom lokalt).
    if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      url.protocol = "https:";
      return redirect(url.toString(), 301);
    }
    // En enda adress för sajten: www.jfkarlstad.se och den gamla workers.dev-adressen skickas vidare till SITE_URL.
    // Görs bara när SITE_URL är en egen domän (aldrig mot workers.dev) och bara för visningar – ett formulär
    // som skickas från en gammal flik tas emot som vanligt.
    const canonical = canonicalHost(env);
    if (canonical && url.hostname !== canonical && !["localhost", "127.0.0.1"].includes(url.hostname) && (req.method === "GET" || req.method === "HEAD")) {
      url.hostname = canonical;
      url.protocol = "https:";
      url.port = "";
      return redirect(url.toString(), 301);
    }
    // Adresser från den gamla webbplatsen (bokmärken, länkar, Google) → motsvarande sida här. Före snedstrecksregeln
    // så att /om-jfk/ går direkt till /om-oss i ett steg.
    if ((req.method === "GET" || req.method === "HEAD") && looksLikeOldAddress(url.pathname)) {
      const target = await findRedirect(env, url.pathname);
      if (target) return redirect(target, 301);
    }
    // Ta bort avslutande snedstreck: /kalender/ → /kalender
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      return redirect(url.pathname.replace(/\/+$/, "") + url.search, 301);
    }

    const c: RequestContext = { req, env, exec, url, params: {}, nonce: randomToken(16) };
    try {
      // Tabellen för Instagram behövs bara på startsidan, i adminpanelens Instagram-del och i bildbanken.
      if (url.pathname === "/" || url.pathname.startsWith("/admin/instagram") || url.pathname.startsWith("/admin/bildbank")) await ensureInstagramSchema(env.DB);
      // Utskottstabellen (och flytten av den gamla listan) för adminpanelens Utskott och bildbanken.
      // Hela adminpanelen: bildbanken och raderingar räknar även med utskottens bilder. Körs en gång per instans.
      if (url.pathname.startsWith("/admin")) await ensureCommitteeSchema(env.DB);
      const match = router.match(req.method, url.pathname);
      if (match === "method-not-allowed") return new Response("Metoden stöds inte", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
      if (!match) {
        // Styrelsens egna omdirigeringar (Texter och sidor → Felsidan → Gamla adresser) för övriga adresser.
        const target = req.method === "GET" || req.method === "HEAD" ? await findRedirect(env, url.pathname) : null;
        return target ? redirect(target, 301) : await notFoundPage(c);
      }
      c.params = match.params;
      // Visningar: kontrollen om sidan är dold körs samtidigt som sidan byggs (ingen väntar på två anrop i rad).
      // Inskick (POST) kontrolleras först – ett formulär på en dold sida får aldrig tas emot.
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (await isHiddenPage(env, url.pathname)) return await notFoundPage(c);
        return await match.handler(c);
      }
      const [hidden, res] = await Promise.all([isHiddenPage(env, url.pathname), match.handler(c)]);
      if (!hidden) return res;
      // Inloggade i adminpanelen kan se en dold sida (t.ex. tävlingen innan den visas) – med en tydlig markering.
      const isHtml = res.status === 200 && (res.headers.get("Content-Type") ?? "").startsWith("text/html");
      if (isHtml && (await getSession(c))) return hiddenPreview(res, url.pathname);
      // Delningslänk (Butik → Dela förhandsvisning): den som har länken ser sidan, men bara den.
      const pageId = pageIdForPath(url.pathname);
      const share = pageId ? await loadShare(env.DB, pageId) : null;
      if (pageId && share) {
        const base = PAGE_LAYOUTS[pageId]?.paths[0] ?? url.pathname;
        const given = url.searchParams.get(SHARE_PARAM);
        if (given && safeEqual(given, share.token)) {
          const clean = new URL(url);
          clean.searchParams.delete(SHARE_PARAM);
          return new Response(null, { status: 303, headers: { Location: clean.pathname + clean.search, "Set-Cookie": shareCookie(pageId, base, share), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
        }
        if (isHtml && hasShareCookie(req, pageId, share)) return hiddenPreview(res, url.pathname, share);
      }
      return await notFoundPage(c);
    } catch (err) {
      // Engångslänkar (lösenord) får aldrig hamna i loggen
      const safePath = url.pathname.replace(/^\/admin\/losenord\/.+$/, "/admin/losenord/[dold]");
      console.error("Ohanterat fel", req.method, safePath, err);
      return errorPage(c);
    }
  },

  /** Körs varje timme (se triggers i wrangler.jsonc): rensar gamla sessioner, rate limits och meddelanden. */
  async scheduled(_controller: ScheduledController, env: Env, exec: ExecutionContext): Promise<void> {
    exec.waitUntil(runMaintenance(env));
  },
};
