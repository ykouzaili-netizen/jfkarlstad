import { html, paragraphs, safeUrl } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import {
  DOCUMENT_CATEGORIES,
  documentQuery,
  eventQuery,
  faqQuery,
  newsQuery,
  partnerQuery,
  rows,
  type DocumentRow,
  type EventRow,
  type FaqRow,
  type NewsRow,
  type PartnerRow,
} from "../lib/content.js";
import { renderMarkdown, plainText } from "../lib/markdown.js";
import { eventDate, formatDate, isoDate, localToIso, stockholmNow, truncate } from "../lib/format.js";
import { htmlResponse } from "../lib/http.js";
import { getFile } from "../lib/storage.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout, mediaUrl } from "../views/layout.js";
import { arrowLink, emptyState, eventCard, newsCard, partnerLogo } from "../views/components.js";
import { icon } from "../views/icons.js";
import { breadcrumb, faqList, pageHeader } from "../views/page.js";
import { notFoundPage } from "./errors.js";

const site = (c: RequestContext) => c.env.SITE_URL.replace(/\/$/, "");

// ───────────────────────── Partners ─────────────────────────

export async function partnersPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, partners] = await Promise.all([loadSettings(db, c.preview), rows<PartnerRow>(partnerQuery.all(db))]);
  const main = partners.filter((p) => p.tier === "huvud");
  const others = partners.filter((p) => p.tier !== "huvud");
  const card = (p: PartnerRow) => html`<li class="partner-card">
    <span class="partner-kicker">${p.tier === "huvud" ? "Huvudsamarbetspartner" : "Samarbetspartner"}</span>
    <div class="partner-logo-wrap">${partnerLogo(p, "lg")}</div>
    <p class="partner-tagline">${p.tagline}</p>
    <a class="card-link arrow-link" href="/partners/${p.slug}">Läs mer<span class="sr-only"> om ${p.name}</span>${icon("arrowRight", "icon icon-sm")}</a>
  </li>`;
  const content = html`
    ${pageHeader({ kicker: "Partners", title: "Våra samarbetspartners", lead: s.partners_lead })}
    <section class="section section-tight-top">
      <div class="container">
        ${main.length ? html`<h2 class="subsection-title first">Huvudsamarbetspartners</h2><ul class="partner-main">${main.map(card)}</ul>` : ""}
        ${others.length ? html`<h2 class="subsection-title">Samarbetspartners</h2><ul class="partner-main">${others.map(card)}</ul>` : ""}
        ${!partners.length ? emptyState("Våra samarbetspartners presenteras snart.") : ""}
        <div class="cta-inline">
          <div><h2 class="cta-inline-title">Vill ni också samarbeta med JFK?</h2><p>Vi berättar gärna mer om hur ett samarbete kan se ut.</p></div>
          <a class="btn btn-primary" href="/for-foretag">Bli samarbetspartner</a>
        </div>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Samarbetspartners", description: s.partners_lead }, content));
}

export async function partnerDetailPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, p] = await Promise.all([loadSettings(db, c.preview), partnerQuery.bySlug(db, c.params.slug ?? "").first<PartnerRow>()]);
  if (!p) return notFoundPage(c);
  const content = html`
    <section class="page-hero">
      <div class="container">
        ${breadcrumb([{ href: "/partners", label: "Partners" }, { label: p.name }])}
        <div class="partner-hero">
          <div class="partner-hero-logo">${partnerLogo(p, "lg")}</div>
          <div>
            <p class="page-kicker">${p.tier === "huvud" ? "Huvudsamarbetspartner" : "Samarbetspartner"}</p>
            <h1 class="page-title">${p.name}</h1>
            ${p.tagline ? html`<p class="page-lead">${p.tagline}</p>` : ""}
          </div>
        </div>
      </div>
    </section>
    <section class="section section-tight-top">
      <div class="container split split-top">
        <div class="prose prose-lg">${paragraphs(p.description)}</div>
        <aside class="aside-card">
          <h2 class="aside-title">Läs mer om ${p.name}</h2>
          <div class="stack-sm">
            ${p.career_url ? html`<a class="btn btn-primary btn-block" href="${safeUrl(p.career_url)}" target="_blank" rel="noopener">Karriär hos ${p.name}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>` : ""}
            ${p.website_url ? html`<a class="btn btn-outline btn-block" href="${safeUrl(p.website_url)}" target="_blank" rel="noopener">Webbplats${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>` : ""}
          </div>
        </aside>
      </div>
      <div class="container"><p class="after-list">${arrowLink("/partners", "Alla samarbetspartners")}</p></div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: p.name, description: p.tagline || truncate(p.description, 155) }, content));
}

// ───────────────────────── Nyheter ─────────────────────────

const NEWS_PER_PAGE = 9;

export async function newsListPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.url.searchParams.get("sida") ?? "1", 10) || 1);
  const [s, [listRes, countRes]] = await Promise.all([
    loadSettings(db, c.preview),
    db.batch([newsQuery.latest(db, NEWS_PER_PAGE, (page - 1) * NEWS_PER_PAGE), newsQuery.count(db)]),
  ]);
  const news = listRes!.results as unknown as NewsRow[];
  const total = ((countRes!.results[0] as { n?: number } | undefined)?.n ?? 0) as number;
  const pages = Math.max(1, Math.ceil(total / NEWS_PER_PAGE));
  if (page > pages) return notFoundPage(c);

  const content = html`
    ${pageHeader({ kicker: "Aktuellt", title: "Nyheter", lead: "Det senaste från föreningen – evenemang, beslut och annat som är bra att veta." })}
    <section class="section section-tight-top">
      <div class="container">
        ${news.length ? html`<div class="card-grid">${news.map((n) => newsCard(n, 2))}</div>` : emptyState("Inga nyheter ännu.")}
        ${pages > 1
          ? html`<nav class="pagination" aria-label="Sidor">
              ${page > 1 ? html`<a class="btn btn-outline btn-sm" href="/aktuellt${page - 1 > 1 ? `?sida=${page - 1}` : ""}" rel="prev">Nyare</a>` : html`<span></span>`}
              <span class="muted">Sida ${page} av ${pages}</span>
              ${page < pages ? html`<a class="btn btn-outline btn-sm" href="/aktuellt?sida=${page + 1}" rel="next">Äldre</a>` : html`<span></span>`}
            </nav>`
          : ""}
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: page > 1 ? `Nyheter – sida ${page}` : "Nyheter", description: "Nyheter från Juridiska Föreningen i Karlstad.", path: page > 1 ? `/aktuellt?sida=${page}` : "/aktuellt" }, content));
}

export async function newsArticlePage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, n] = await Promise.all([loadSettings(db, c.preview), newsQuery.bySlug(db, c.params.slug ?? "").first<NewsRow>()]);
  if (!n) return notFoundPage(c);
  const img = mediaUrl(n.image_key);
  const description = truncate(n.excerpt || plainText(n.body), 155);
  const article = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: n.title,
    datePublished: isoDate(n.published_at),
    dateModified: isoDate(n.updated_at),
    image: img ? [site(c) + img] : undefined,
    publisher: { "@type": "Organization", name: s.site_name },
    mainEntityOfPage: `${site(c)}/aktuellt/${n.slug}`,
  };
  const content = html`
    <article>
      <header class="page-hero article-hero">
        <div class="container narrow">
          ${breadcrumb([{ href: "/aktuellt", label: "Nyheter" }, { label: n.title }])}
          <time class="news-date" datetime="${isoDate(n.published_at)}">${formatDate(n.published_at)}</time>
          <h1 class="page-title">${n.title}</h1>
          ${n.excerpt ? html`<p class="page-lead">${n.excerpt}</p>` : ""}
        </div>
      </header>
      ${img ? html`<div class="container article-image-wrap"><img class="article-image" src="${img}" alt="${n.image_alt}" width="1200" height="675"></div>` : ""}
      <div class="section section-tight-top">
        <div class="container narrow">
          <div class="prose prose-lg article-body">${renderMarkdown(n.body)}</div>
          <p class="after-list">${arrowLink("/aktuellt", "Alla nyheter")}</p>
        </div>
      </div>
    </article>`;
  return htmlResponse(c, layout(c, s, { title: n.title, description, ogType: "article", ogImage: img ?? undefined, jsonLd: [article] }, content));
}

// ───────────────────────── Kalender ─────────────────────────

export async function calendarPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const now = stockholmNow();
  const [s, [upRes, pastRes]] = await Promise.all([loadSettings(db, c.preview), db.batch([eventQuery.upcoming(db, now, 100), eventQuery.past(db, now, 12)])]);
  const upcoming = upRes!.results as unknown as EventRow[];
  const past = pastRes!.results as unknown as EventRow[];

  // Gruppera kommande evenemang per månad
  const months = new Map<string, EventRow[]>();
  const monthName = (iso: string) => {
    const [y, m] = iso.split("-");
    const names = ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"];
    return `${names[+m! - 1]} ${y}`;
  };
  for (const e of upcoming) {
    const key = monthName(e.starts_at);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(e);
  }

  const content = html`
    ${pageHeader({ kicker: "Aktuellt", title: "Kalender", lead: "Sittningar, föreläsningar, arbetsmarknadsdagar och mycket mer. Biljetter till medlemsevenemang köper du via Hitract." })}
    <section class="section section-tight-top">
      <div class="container">
        ${upcoming.length
          ? [...months.entries()].map(
              ([month, evs], i) => html`<h2 class="subsection-title${i === 0 ? " first" : ""}">${month}</h2><div class="card-grid">${evs.map((e) => eventCard(e, 3))}</div>`,
            )
          : emptyState(html`Inga kommande evenemang är inlagda just nu. Följ <a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}</a> så missar du inget.`)}
      </div>
    </section>
    ${past.length
      ? html`<section class="section section-surface" aria-labelledby="tidigare">
          <div class="container">
            <h2 class="section-title" id="tidigare">Tidigare evenemang</h2>
            <ul class="past-list">
              ${past.map((e) => {
                const d = eventDate(e.starts_at, e.ends_at);
                return html`<li><time datetime="${d?.iso ?? ""}">${d ? `${d.day} ${d.monthShort} ${e.starts_at.slice(0, 4)}` : ""}</time><a href="/kalender/${e.slug}">${e.title}</a></li>`;
              })}
            </ul>
          </div>
        </section>`
      : ""}`;

  const site_ = site(c);
  const jsonLd = upcoming.slice(0, 10).map((e) => eventJsonLd(site_, s.site_name, e));
  return htmlResponse(c, layout(c, s, { title: "Kalender", description: "Kommande evenemang i Juridiska Föreningen i Karlstad.", jsonLd }, content));
}

function eventJsonLd(siteUrl: string, org: string, e: EventRow): object {
  const img = mediaUrl(e.image_key);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: localToIso(e.starts_at),
    endDate: localToIso(e.ends_at) ?? undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.location || "Karlstad", address: { "@type": "PostalAddress", addressLocality: "Karlstad", addressCountry: "SE" } },
    description: e.summary || plainText(e.body).slice(0, 300),
    image: img ? [siteUrl + img] : undefined,
    url: `${siteUrl}/kalender/${e.slug}`,
    organizer: { "@type": "Organization", name: org, url: siteUrl },
  };
}

export async function eventDetailPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const slug = c.params.slug ?? "";
  if (slug.endsWith(".ics")) return icsHandler(c, slug.slice(0, -4));
  const [s, e] = await Promise.all([loadSettings(db, c.preview), eventQuery.bySlug(db, slug).first<EventRow>()]);
  if (!e) return notFoundPage(c);
  const d = eventDate(e.starts_at, e.ends_at);
  const isPast = (e.ends_at ?? e.starts_at.slice(0, 10) + "T23:59") < stockholmNow();
  const img = mediaUrl(e.image_key);
  const content = html`
    <article>
      <header class="page-hero">
        <div class="container">
          ${breadcrumb([{ href: "/kalender", label: "Kalender" }, { label: e.title }])}
          <div class="event-hero">
            ${d ? html`<time class="date-badge date-badge-lg" datetime="${d.iso}"><span class="date-day">${d.day}</span><span class="date-month">${d.monthShort}</span></time>` : ""}
            <div>
              <h1 class="page-title">${e.title}</h1>
              ${e.summary ? html`<p class="page-lead">${e.summary}</p>` : ""}
            </div>
          </div>
        </div>
      </header>
      <section class="section section-tight-top">
        <div class="container split split-top">
          <div>
            ${img ? html`<img class="article-image" src="${img}" alt="${e.image_alt}" width="1200" height="675">` : ""}
            <div class="prose prose-lg">${renderMarkdown(e.body)}</div>
          </div>
          <aside class="aside-card">
            ${isPast ? html`<p class="tag tag-muted">Evenemanget har redan ägt rum</p>` : ""}
            <ul class="meta-list meta-list-lg">
              ${d ? html`<li>${icon("calendar", "icon")}<span class="capitalize-first">${d.dateLong}</span></li>` : ""}
              ${d ? html`<li>${icon("clock", "icon")}<span>${d.time}</span></li>` : ""}
              ${e.location ? html`<li>${icon("pin", "icon")}<span>${e.location}</span></li>` : ""}
              ${e.members_only ? html`<li>${icon("lock", "icon")}<span>Endast för medlemmar</span></li>` : ""}
            </ul>
            ${!isPast
              ? html`<div class="stack-sm">
                  ${e.signup_url
                    ? html`<a class="btn btn-primary btn-block" href="${safeUrl(e.signup_url)}" target="_blank" rel="noopener">Anmälan och biljetter${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>`
                    : e.members_only
                      ? joinButton(s, { className: "btn btn-primary btn-block", label: "Bli medlem för att delta" })
                      : ""}
                  <a class="btn btn-outline btn-block" href="/kalender/${e.slug}.ics" download>${icon("calendar", "icon icon-sm")}Lägg till i kalendern</a>
                </div>`
              : ""}
          </aside>
        </div>
        <div class="container"><p class="after-list">${arrowLink("/kalender", "Alla evenemang")}</p></div>
      </section>
    </article>`;
  return htmlResponse(
    c,
    layout(c, s, { title: e.title, description: truncate(e.summary || plainText(e.body), 155), ogImage: img ?? undefined, jsonLd: [eventJsonLd(site(c), s.site_name, e)] }, content),
  );
}

/** iCalendar-fil så att besökaren kan lägga in evenemanget i sin egen kalender. */
async function icsHandler(c: RequestContext, slug: string): Promise<Response> {
  const e = await eventQuery.bySlug(c.env.DB, slug).first<EventRow>();
  if (!e) return notFoundPage(c);
  const toIcs = (local: string) => local.replace(/[-:]/g, "") + "00";
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const end = e.ends_at ?? (() => {
    const [d, t] = e.starts_at.split("T");
    const [h, m] = (t ?? "00:00").split(":").map(Number);
    return `${d}T${String(Math.min(23, (h ?? 0) + 2)).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
  })();
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Juridiska Foreningen i Karlstad//Webbplats//SV",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:event-${e.id}@jfkarlstad`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Stockholm:${toIcs(e.starts_at)}`,
    `DTEND;TZID=Europe/Stockholm:${toIcs(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    `DESCRIPTION:${esc((e.summary ? e.summary + "\n\n" : "") + site(c) + "/kalender/" + e.slug)}`,
    `URL:${site(c)}/kalender/${e.slug}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ───────────────────────── Dokument ─────────────────────────

export async function documentsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const q = (c.url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const cat = c.url.searchParams.get("kategori") ?? "";
  const [s, docs] = await Promise.all([loadSettings(db, c.preview), rows<DocumentRow>(documentQuery.all(db))]);
  const norm = (t: string) => t.toLowerCase();
  const filtered = docs.filter(
    (d) => (!cat || d.category === cat) && (!q || norm(`${d.title} ${DOCUMENT_CATEGORIES[d.category]} ${d.year}`).includes(norm(q))),
  );
  const years = new Map<number, DocumentRow[]>();
  for (const d of filtered) {
    if (!years.has(d.year)) years.set(d.year, []);
    years.get(d.year)!.push(d);
  }
  const size = (b: number | null) => (b ? (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`) : "");

  const content = html`
    ${pageHeader({ kicker: "Om oss", title: "Dokument och protokoll", lead: "Stadgar, styrdokument och protokoll. Som medlem förbinder du dig att följa stadgarna och gällande styrdokument." })}
    <section class="section section-tight-top">
      <div class="container">
        <form class="doc-filter" method="get" action="/dokument" role="search" data-doc-filter>
          <div class="field field-inline">
            <label class="field-label" for="dok-sok">Sök bland dokumenten</label>
            <input type="search" id="dok-sok" name="q" value="${q}" placeholder="T.ex. stadgar eller 2025" autocomplete="off">
          </div>
          <div class="field field-inline">
            <label class="field-label" for="dok-kat">Kategori</label>
            <select id="dok-kat" name="kategori">
              <option value="">Alla kategorier</option>
              ${Object.entries(DOCUMENT_CATEGORIES).map(([k, v]) => html`<option value="${k}"${cat === k ? html` selected` : ""}>${v}</option>`)}
            </select>
          </div>
          <button class="btn btn-primary" type="submit">Sök</button>
        </form>
        <p class="doc-count muted" aria-live="polite" data-doc-count>${filtered.length} dokument${q || cat ? " matchar" : ""}</p>
        ${years.size
          ? [...years.entries()].map(
              ([year, list]) => html`<section class="doc-year" data-doc-year>
                <h2 class="subsection-title">${year}</h2>
                <ul class="doc-list">
                  ${list.map(
                    (d) => html`<li class="doc-item" data-doc="${`${d.title} ${DOCUMENT_CATEGORIES[d.category]} ${d.year}`.toLowerCase()}" data-cat="${d.category}">
                      <span class="doc-icon" aria-hidden="true">PDF</span>
                      <div class="doc-body">
                        ${d.file_key
                          ? html`<a class="doc-title" href="/dokument/fil/${d.id}" target="_blank" rel="noopener">${d.title}<span class="sr-only"> (PDF, öppnas i ny flik)</span></a>`
                          : html`<span class="doc-title">${d.title}</span>`}
                        <span class="doc-meta">${DOCUMENT_CATEGORIES[d.category]}${d.file_key ? ` · ${size(d.file_size)}` : " · Laddas upp inom kort"}</span>
                      </div>
                    </li>`,
                  )}
                </ul>
              </section>`,
            )
          : emptyState(q || cat ? html`Inga dokument matchar din sökning. <a href="/dokument">Visa alla dokument</a>` : "Inga dokument är uppladdade ännu.")}
        <p class="after-list muted">Saknar du ett protokoll? Mejla <a href="mailto:sekreterare@jfkarlstad.se">sekreterare@jfkarlstad.se</a>.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Dokument och protokoll", description: "Stadgar, styrdokument och protokoll för Juridiska Föreningen i Karlstad." }, content));
}

export async function documentFileHandler(c: RequestContext): Promise<Response> {
  const id = parseInt(c.params.id ?? "", 10);
  if (!id) return notFoundPage(c);
  const doc = await documentQuery.byId(c.env.DB, id).first<DocumentRow>();
  if (!doc?.file_key) return notFoundPage(c);
  const file = await getFile(c.env, doc.file_key);
  if (!file) return notFoundPage(c);
  const filename = doc.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + ".pdf";
  return new Response(c.req.method === "HEAD" ? null : file.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

// ───────────────────────── FAQ ─────────────────────────

export async function faqPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, items] = await Promise.all([loadSettings(db, c.preview), rows<FaqRow>(faqQuery.all(db))]);
  const groups = new Map<string, FaqRow[]>();
  for (const f of items) {
    if (!groups.has(f.category)) groups.set(f.category, []);
    groups.get(f.category)!.push(f);
  }
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
  const content = html`
    ${pageHeader({ kicker: "Hjälp", title: "Vanliga frågor", lead: "Svar på det vi oftast får frågor om. Hittar du inte svaret? Hör av dig till oss." })}
    <section class="section section-tight-top">
      <div class="container narrow">
        ${groups.size
          ? [...groups.entries()].map(([cat, list], i) => html`<h2 class="subsection-title${i === 0 ? " first" : ""}">${cat}</h2>${faqList(list)}`)
          : emptyState("Inga frågor ännu.")}
        <div class="cta-inline">
          <div><h2 class="cta-inline-title">Hittade du inte svaret?</h2><p>Skicka din fråga så svarar vi så snart vi kan.</p></div>
          <a class="btn btn-primary" href="/kontakt">Kontakta oss</a>
        </div>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Vanliga frågor", description: "Vanliga frågor om Juridiska Föreningen i Karlstad och medlemskapet.", jsonLd: items.length ? [faqLd] : [] }, content));
}
