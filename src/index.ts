import { ensureCommitteeSchema } from "./lib/committees.js";
import { ensureInstagramSchema } from "./lib/instagram.js";
import { LAYOUT_PREFIX, pageIdForPath } from "./lib/pagelayout.js";
import type { Env } from "./env.js";
import { Router, type RequestContext } from "./router.js";
import { randomToken, redirect, textResponse } from "./lib/http.js";
import { findRedirect, looksLikeOldAddress } from "./lib/legacy.js";
import { importHonorPhotos } from "./lib/honor-import.js";
import { getFile } from "./lib/storage.js";
import { homePage } from "./pages/home.js";
import { aboutPage } from "./pages/about.js";
import { membershipPage } from "./pages/membership.js";
import { studentsPage } from "./pages/students.js";
import { companiesPage, contactPage, engagePage, paverkaPage, submitHandler, thanksPage } from "./pages/forms.js";
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
import { errorPage, notFoundPage } from "./pages/errors.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { runMaintenance } from "./lib/maintenance.js";

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
  .get("/media/:key", mediaHandler);

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
  const cacheKey = new Request(new URL(`/media/${key}`, c.url).toString(), { method: "GET" });
  if (edge) {
    const hit = await edge.match(cacheKey);
    if (hit) return hit;
  }
  const res = await mediaFromStorage(c, key);
  if (edge && res.status === 200) {
    // Kopian i datacentret lever högst ett dygn, så att en raderad bild (t.ex. ett personfoto) försvinner
    // överallt inom 24 timmar även om den raderas från ett annat datacenter (GDPR).
    const copy = new Response(res.clone().body, res);
    copy.headers.set("Cache-Control", "public, max-age=86400");
    c.exec.waitUntil(edge.put(cacheKey, copy));
  }
  return res;
}

async function mediaFromStorage(c: RequestContext, key: string): Promise<Response> {
  // Den lilla versionen (".sm") finns inte för äldre bilder och SVG – svara då med originalet.
  const file = (await getFile(c.env, key)) ?? (key.endsWith(".sm") ? await getFile(c.env, key.slice(0, -3)) : null);
  if (!file) return notFoundPage(c);
  return new Response(c.req.method === "HEAD" ? null : file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
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
    // TILLFÄLLIGT AVSTÄNGT för workers.dev (2026-10-08) medan DNS-flytten till Cloudflare sprids: för många nät pekar
    // jfkarlstad.se ännu på den gamla sajten hos One.com, så workers.dev-adressen ska fungera som reservadress.
    // Slå på igen genom att ta bort villkoret om workers.dev när jfkarlstad.se pekar på Cloudflare överallt.
    const canonical = canonicalHost(env);
    if (canonical && url.hostname !== canonical && !url.hostname.endsWith(".workers.dev") && !["localhost", "127.0.0.1"].includes(url.hostname) && (req.method === "GET" || req.method === "HEAD")) {
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
      // Engångsimport av hedersmedlemmarnas porträtt (tas bort när den har körts, se lib/honor-import.ts).
      if (url.pathname.startsWith("/admin") || url.pathname === "/om-oss") await importHonorPhotos(env);
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
      return hidden ? await notFoundPage(c) : res;
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
