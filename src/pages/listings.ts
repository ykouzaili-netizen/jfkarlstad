import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, loadSettings, type Settings } from "../lib/settings.js";
import {
  DOCUMENT_BADGE,
  documentLinkKind,
  documentQuery,
  eventQuery,
  faqQuery,
  jobQuery,
  newsQuery,
  partnerQuery,
  rows,
  type DocumentRow,
  type EventRow,
  type FaqRow,
  type JobRow,
  type NewsRow,
  type PartnerRow,
} from "../lib/content.js";
import { plainText, renderInline, renderMarkdown } from "../lib/markdown.js";
import { eventDate, formatDate, isoDate, localToIso, stockholmNow, stockholmToday, truncate } from "../lib/format.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import { getFile } from "../lib/storage.js";
import { countStat, isCountable } from "../lib/stats.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout, mediaUrl, picture } from "../views/layout.js";
import { arrowLink, emptyState, eventCard, newsCard, partnerCard, partnerLogo } from "../views/components.js";
import { icon } from "../views/icons.js";
import { breadcrumb, faqList, pageHeader } from "../views/page.js";
import { jobCard } from "./careers.js";
import { notFoundPage } from "./errors.js";

const site = (c: RequestContext) => c.env.SITE_URL.replace(/\/$/, "");
const newTab = html`<span class="sr-only"> (öppnas i ny flik)</span>`;

/** Räkna en visning till partnerstatistiken – aldrig i förhandsvisningar eller för robotar. */
export function track(c: RequestContext, kind: Parameters<typeof countStat>[1], id: number): void {
  if (c.preview || !isCountable(c.req)) return;
  c.exec.waitUntil(countStat(c.env, kind, id));
}

// ───────────────────────── Partners ─────────────────────────

export async function partnersPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, partners] = await Promise.all([loadSettings(db, c.preview), rows<PartnerRow>(partnerQuery.all(db))]);
  const main = partners.filter((p) => p.tier === "huvud");
  const others = partners.filter((p) => p.tier !== "huvud");
  const content = html`
    ${pageHeader(s, { kickerKey: "partners_kicker", hero: "partners", titleKey: "partners_title", leadKey: "partners_lead" })}
    <section class="section section-tight-top">
      <div class="container">
        ${main.length
          ? html`<h2 class="subsection-title first"${ek(s, "partners_main_title")}>${s.partners_main_title}</h2><ul class="partner-main">${main.map((p) => partnerCard(s, p))}</ul>`
          : ""}
        ${others.length
          ? html`<h2 class="subsection-title${main.length ? "" : " first"}"${ek(s, "partners_other_title")}>${s.partners_other_title}</h2><ul class="partner-main">${others.map((p) => partnerCard(s, p))}</ul>`
          : ""}
        ${!partners.length ? emptyState(s.partners_empty, ek(s, "partners_empty")) : ""}
        <div class="cta-inline">
          <div>
            <h2 class="cta-inline-title"${ek(s, "partners_cta_title")}>${s.partners_cta_title}</h2>
            <p${ek(s, "partners_cta_text")}>${s.partners_cta_text}</p>
          </div>
          <a class="btn btn-primary" href="/for-foretag"${ek(s, "partners_cta_button")}>${s.partners_cta_button}</a>
        </div>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.partners_title, description: s.partners_lead }, content));
}

export async function partnerDetailPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, p] = await Promise.all([loadSettings(db, c.preview), partnerQuery.bySlug(db, c.params.slug ?? "").first<PartnerRow>()]);
  if (!p) return notFoundPage(c);
  const jobs = await rows<JobRow>(jobQuery.openForPartner(db, p.id, stockholmToday()));
  track(c, "partner_view", p.id);
  const kickerKey = p.tier === "huvud" ? "partner_main_kicker" : "partner_kicker";
  const vars = { namn: p.name };

  const content = html`
    <section class="page-hero">
      <div class="container">
        ${breadcrumb([{ href: "/partners", label: s.partners_kicker }, { label: p.name }])}
        <div class="partner-hero"${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}>
          <div class="partner-hero-logo">${partnerLogo(p, "lg")}</div>
          <div>
            <p class="page-kicker"${ek(s, kickerKey)}>${s[kickerKey]}</p>
            <h1 class="page-title">${p.name}</h1>
            ${p.tagline ? html`<p class="page-lead">${p.tagline}</p>` : ""}
          </div>
        </div>
      </div>
    </section>
    <section class="section section-tight-top">
      <div class="container split split-top">
        <div class="prose prose-lg"${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}>${paragraphs(p.description)}</div>
        ${p.career_url || p.website_url
          ? html`<aside class="aside-card">
              <h2 class="aside-title"${ek(s, "partner_aside_title")}>${fill(s.partner_aside_title, vars)}</h2>
              <div class="stack-sm">
                ${p.career_url
                  ? html`<a class="btn btn-primary btn-block" href="/ut/karriar/${p.id}" target="_blank" rel="noopener nofollow"${ek(s, "partner_career")}>${fill(s.partner_career, vars)}${icon("external", "icon icon-sm")}${newTab}</a>`
                  : ""}
                ${p.website_url
                  ? html`<a class="btn btn-outline btn-block" href="/ut/webb/${p.id}" target="_blank" rel="noopener nofollow"${ek(s, "partner_website")}>${s.partner_website}${icon("external", "icon icon-sm")}${newTab}</a>`
                  : ""}
              </div>
            </aside>`
          : ""}
      </div>
    </section>
    ${jobs.length
      ? html`<section class="section section-surface" aria-labelledby="partner-jobb">
          <div class="container">
            <h2 class="section-title" id="partner-jobb"${ek(s, "partner_jobs_title")}>${fill(s.partner_jobs_title, vars)}</h2>
            <ul class="job-list">${jobs.map((j) => jobCard(s, j, false))}</ul>
          </div>
        </section>`
      : ""}
    <div class="container"><p class="after-list after-list-page">${arrowLink("/partners", s.partner_all, "arrow-link", ek(s, "partner_all"))}</p></div>`;
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
    ${pageHeader(s, { kickerKey: "news_kicker", hero: "news", titleKey: "news_title", leadKey: "news_lead" })}
    <section class="section section-tight-top">
      <div class="container">
        ${news.length ? html`<div class="card-grid">${news.map((n) => newsCard(s, n, 2))}</div>` : emptyState(s.news_empty, ek(s, "news_empty"))}
        ${pages > 1
          ? html`<nav class="pagination" aria-label="Sidor">
              ${page > 1 ? html`<a class="btn btn-outline btn-sm" href="/aktuellt${page - 1 > 1 ? `?sida=${page - 1}` : ""}" rel="prev"${ek(s, "news_newer")}>${s.news_newer}</a>` : html`<span></span>`}
              <span class="muted"${ek(s, "news_page")}>${fill(s.news_page, { sida: page, antal: pages })}</span>
              ${page < pages ? html`<a class="btn btn-outline btn-sm" href="/aktuellt?sida=${page + 1}" rel="next"${ek(s, "news_older")}>${s.news_older}</a>` : html`<span></span>`}
            </nav>`
          : ""}
      </div>
    </section>`;
  const title = page > 1 ? `${s.news_title} – ${fill(s.news_page, { sida: page, antal: pages }).toLocaleLowerCase("sv")}` : s.news_title;
  return htmlResponse(c, layout(c, s, { title, description: s.news_lead, path: page > 1 ? `/aktuellt?sida=${page}` : "/aktuellt" }, content));
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
  const edit = ec(s, `/admin/nyheter/${n.id}`, `Nyhet › ${n.title}`);
  const content = html`
    <article>
      <header class="page-hero article-hero">
        <div class="container narrow"${edit}>
          ${breadcrumb([{ href: "/aktuellt", label: s.news_title }, { label: n.title }])}
          <time class="news-date" datetime="${isoDate(n.published_at)}">${formatDate(n.published_at)}</time>
          <h1 class="page-title">${n.title}</h1>
          ${n.excerpt ? html`<p class="page-lead">${n.excerpt}</p>` : ""}
        </div>
      </header>
      ${n.image_key
        ? html`<div class="container article-image-wrap">${picture(n.image_key, { alt: n.image_alt, className: "article-image", sizes: "(min-width: 1240px) 1160px, 100vw", width: 1200, height: 675, eager: true })}</div>`
        : ""}
      <div class="section section-tight-top">
        <div class="container narrow">
          <div class="prose prose-lg article-body"${edit}>${renderMarkdown(n.body)}</div>
          <p class="after-list">${arrowLink("/aktuellt", s.news_all, "arrow-link", ek(s, "news_all"))}</p>
        </div>
      </div>
    </article>`;
  return htmlResponse(c, layout(c, s, { title: n.title, description, ogType: "article", ogImage: img ?? undefined, jsonLd: [article] }, content));
}

// ───────────────────────── Kalender ─────────────────────────


/** "Prenumerera på kalendern" – fungerar utan JS tack vare <details>; JS lägger bara till kopieringsknappen. */
export function subscribePanel(c: RequestContext, s: Settings): SafeHtml {
  const feed = `${site(c)}/kalender.ics`;
  const webcal = feed.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  return html`<details class="subscribe">
    <summary class="btn btn-outline"${ek(s, "cal_sub_button")}>${icon("calendar", "icon icon-sm")}${s.cal_sub_button}</summary>
    <div class="subscribe-panel">
      <h2 class="subscribe-title"${ek(s, "cal_sub_title")}>${s.cal_sub_title}</h2>
      <p${ek(s, "cal_sub_text")}>${s.cal_sub_text}</p>
      <div class="subscribe-actions">
        <a class="btn btn-primary btn-sm" href="${webcal}"${ek(s, "cal_sub_apple")}>${s.cal_sub_apple}</a>
        <a class="btn btn-outline btn-sm" href="${google}" target="_blank" rel="noopener"${ek(s, "cal_sub_google")}>${s.cal_sub_google}${newTab}</a>
      </div>
      <div class="copy-field">
        <input type="text" readonly value="${feed}" aria-label="${s.cal_sub_copy}" data-copy-source>
        <button class="btn btn-ghost btn-sm" type="button" hidden data-copy data-copied="${s.cal_sub_copied}"${ek(s, "cal_sub_copy")}>${icon("copy", "icon icon-sm")}<span>${s.cal_sub_copy}</span></button>
      </div>
    </div>
  </details>`;
}

export function eventJsonLd(siteUrl: string, org: string, e: EventRow): object {
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
  if (slug.endsWith(".ics")) return eventIcsHandler(c, slug.slice(0, -4));
  const [s, e] = await Promise.all([loadSettings(db, c.preview), eventQuery.bySlug(db, slug).first<EventRow>()]);
  if (!e) return notFoundPage(c);
  const d = eventDate(e.starts_at, e.ends_at);
  const isPast = (e.ends_at ?? e.starts_at.slice(0, 10) + "T23:59") < stockholmNow();
  const img = mediaUrl(e.image_key);
  const edit = ec(s, `/admin/event/${e.id}`, `Event › ${e.title}`);
  const content = html`
    <article>
      <header class="page-hero">
        <div class="container">
          ${breadcrumb([{ href: "/kalender", label: s.cal_title }, { label: e.title }])}
          <div class="event-hero"${edit}>
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
          <div${edit}>
            ${e.image_key ? picture(e.image_key, { alt: e.image_alt, className: "article-image", sizes: "(min-width: 920px) 60vw, 100vw", width: 1200, height: 675, eager: true }) : ""}
            <div class="prose prose-lg">${renderMarkdown(e.body)}</div>
          </div>
          <aside class="aside-card">
            ${isPast ? html`<p class="tag tag-muted"${ek(s, "event_past")}>${s.event_past}</p>` : ""}
            <ul class="meta-list meta-list-lg">
              ${d ? html`<li>${icon("calendar", "icon")}<span class="capitalize-first">${d.dateLong}</span></li>` : ""}
              ${d ? html`<li>${icon("clock", "icon")}<span>${d.time}</span></li>` : ""}
              ${e.location ? html`<li>${icon("pin", "icon")}<span>${e.location}</span></li>` : ""}
              ${e.members_only ? html`<li${ek(s, "event_members_only")}>${icon("lock", "icon")}<span>${s.event_members_only}</span></li>` : ""}
            </ul>
            ${!isPast
              ? html`<div class="stack-sm">
                  ${e.signup_url
                    ? html`<a class="btn btn-primary btn-block" href="${safeUrl(e.signup_url)}" target="_blank" rel="noopener"${ek(s, "event_signup")}>${s.event_signup}${icon("external", "icon icon-sm")}${newTab}</a>`
                    : e.members_only
                      ? joinButton(s, { className: "btn btn-primary btn-block", labelKey: "event_join" })
                      : ""}
                  <a class="btn btn-outline btn-block" href="/kalender/${e.slug}.ics" download${ek(s, "event_add")}>${icon("calendar", "icon icon-sm")}${s.event_add}</a>
                </div>`
              : ""}
          </aside>
        </div>
        <div class="container"><p class="after-list">${arrowLink("/kalender", s.event_all, "arrow-link", ek(s, "event_all"))}</p></div>
      </section>
    </article>`;
  return htmlResponse(
    c,
    layout(c, s, { title: e.title, description: truncate(e.summary || plainText(e.body), 155), ogImage: img ?? undefined, jsonLd: [eventJsonLd(site(c), s.site_name, e)] }, content),
  );
}

// ───────────────────────── iCalendar ─────────────────────────

/** Tidszonsdefinition så att alla kalenderappar tolkar tiderna som svensk tid (inkl. sommartid). */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Stockholm",
  "X-LIC-LOCATION:Europe/Stockholm",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (local: string) => local.replace(/[-:]/g, "") + "00";

/** Raderna får vara högst 75 oktetter (RFC 5545) – längre rader viks med CRLF + mellanslag. */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const max = out.length ? 74 : 75; // fortsättningsrader börjar med ett mellanslag
    if (curLen + len > max) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function eventEnd(e: EventRow): string {
  if (e.ends_at) return e.ends_at;
  const [d, t] = e.starts_at.split("T");
  const [h, m] = (t ?? "00:00").split(":").map(Number);
  return `${d}T${String(Math.min(23, (h ?? 0) + 2)).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function vevent(siteUrl: string, e: EventRow, stamp: string): string[] {
  const url = `${siteUrl}/kalender/${e.slug}`;
  return [
    "BEGIN:VEVENT",
    `UID:event-${e.id}@jfkarlstad`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Stockholm:${icsTime(e.starts_at)}`,
    `DTEND;TZID=Europe/Stockholm:${icsTime(eventEnd(e))}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    `DESCRIPTION:${icsText((e.summary ? e.summary + "\n\n" : "") + url)}`,
    `URL:${url}`,
    "END:VEVENT",
  ];
}

function icsResponse(lines: string[], filename: string | null): Response {
  const body = lines.map(foldLine).join("\r\n") + "\r\n";
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=900",
  };
  if (filename) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(body, { headers });
}

const nowStamp = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

/** Ett enskilt evenemang som .ics-fil ("Lägg till i kalendern"). */
async function eventIcsHandler(c: RequestContext, slug: string): Promise<Response> {
  const e = await eventQuery.bySlug(c.env.DB, slug).first<EventRow>();
  if (!e) return notFoundPage(c);
  return icsResponse(
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Juridiska Foreningen i Karlstad//Webbplats//SV", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...VTIMEZONE, ...vevent(site(c), e, nowStamp()), "END:VCALENDAR"],
    `${e.slug}.ics`,
  );
}

/** Prenumerationsflöde med alla evenemang (från 60 dagar bakåt). Kalenderappar hämtar det regelbundet. */
export async function calendarFeedHandler(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const from = stockholmNow(new Date(Date.now() - 60 * 86400_000));
  const [s, events] = await Promise.all([loadSettings(db), rows<EventRow>(eventQuery.since(db, from))]);
  const stamp = nowStamp();
  return icsResponse(
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Juridiska Foreningen i Karlstad//Webbplats//SV",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsText(s.site_short_name)}`,
      `X-WR-CALDESC:${icsText(s.site_name)}`,
      "X-WR-TIMEZONE:Europe/Stockholm",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
      ...VTIMEZONE,
      ...events.flatMap((e) => vevent(site(c), e, stamp)),
      "END:VCALENDAR",
    ],
    null,
  );
}

// ───────────────────────── Dokument ─────────────────────────

const docCategory = (s: Settings, cat: DocumentRow["category"]) => s[`doc_cat_${cat}` as const] ?? cat;
const DOC_CATS: DocumentRow["category"][] = ["stadgar", "styrdokument", "protokoll", "ovrigt"];

export async function documentsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const q = (c.url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const cat = c.url.searchParams.get("kategori") ?? "";
  const [s, docs] = await Promise.all([loadSettings(db, c.preview), rows<DocumentRow>(documentQuery.all(db))]);
  const norm = (t: string) => t.toLocaleLowerCase("sv");
  const haystack = (d: DocumentRow) => norm(`${d.title} ${docCategory(s, d.category)} ${d.year}`);
  const filtered = docs.filter((d) => (!cat || d.category === cat) && (!q || haystack(d).includes(norm(q))));
  const years = new Map<number, DocumentRow[]>();
  for (const d of filtered) {
    if (!years.has(d.year)) years.set(d.year, []);
    years.get(d.year)!.push(d);
  }
  const size = (b: number | null) => (b ? (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`) : "");
  const filtering = Boolean(q || cat);

  const content = html`
    ${pageHeader(s, { kickerKey: "docs_kicker", hero: "docs", titleKey: "docs_title", leadKey: "docs_lead" })}
    <section class="section section-tight-top">
      <div class="container">
        <form class="doc-filter" method="get" action="/dokument" role="search" data-doc-filter>
          <div class="field field-inline">
            <label class="field-label" for="dok-sok"${ek(s, "docs_search_label")}>${s.docs_search_label}</label>
            <input type="search" id="dok-sok" name="q" value="${q}" placeholder="${s.docs_search_placeholder}" autocomplete="off">
          </div>
          <div class="field field-inline">
            <label class="field-label" for="dok-kat"${ek(s, "docs_category_label")}>${s.docs_category_label}</label>
            <select id="dok-kat" name="kategori">
              <option value="">${s.docs_all_categories}</option>
              ${DOC_CATS.map((k) => html`<option value="${k}"${cat === k ? html` selected` : ""}>${docCategory(s, k)}</option>`)}
            </select>
          </div>
          <button class="btn btn-primary" type="submit"${ek(s, "docs_search_button")}>${s.docs_search_button}</button>
        </form>
        <p class="doc-count muted" aria-live="polite" data-doc-count data-count-all="${s.docs_count}" data-count-match="${s.docs_count_match}"${ek(s, "docs_count")}>${fill(filtering ? s.docs_count_match : s.docs_count, { antal: filtered.length })}</p>
        ${years.size
          ? [...years.entries()].map(
              ([year, list]) => html`<section class="doc-year" data-doc-year>
                <h2 class="subsection-title">${year}</h2>
                <ul class="doc-list">
                  ${list.map(
                    (d) => {
                      const kind = d.link_url ? documentLinkKind(d.link_url) : null;
                      const label = kind ? s[`docs_kind_${kind}` as const] : "PDF";
                      return html`<li class="doc-item${kind ? " doc-item-link" : ""}" data-doc="${haystack(d)}" data-cat="${d.category}"${ec(s, `/admin/dokument/${d.id}`, `Dokument › ${d.title}`)}>
                      <span class="doc-icon" aria-hidden="true">${DOCUMENT_BADGE[kind ?? "pdf"]}</span>
                      <div class="doc-body">
                        ${kind || d.file_key
                          ? html`<a class="doc-title" href="/dokument/fil/${d.id}" target="_blank" rel="noopener">${d.title}<span class="sr-only"> (${label}, öppnas i ny flik)</span></a>`
                          : html`<span class="doc-title">${d.title}</span>`}
                        <span class="doc-meta">${docCategory(s, d.category)} · ${kind
                          ? html`<span class="doc-kind"><span${ek(s, `docs_kind_${kind}`)}>${label}</span>${icon("external", "icon doc-meta-icon")}</span>`
                          : d.file_key
                            ? size(d.file_size)
                            : html`<span${ek(s, "docs_pending")}>${s.docs_pending}</span>`}</span>
                      </div>
                    </li>`;
                    },
                  )}
                </ul>
              </section>`,
            )
          : ""}
        ${years.size
          ? html`<div class="empty-state" hidden data-doc-empty><p>${renderInline(s.docs_no_match)}</p></div>`
          : filtering
            ? emptyState(renderInline(s.docs_no_match), ek(s, "docs_no_match"))
            : emptyState(s.docs_empty, ek(s, "docs_empty"))}
        <p class="after-list muted"${ek(s, "docs_missing")}>${renderInline(s.docs_missing)}</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.docs_title, description: s.docs_lead }, content));
}

export async function documentFileHandler(c: RequestContext): Promise<Response> {
  const id = parseInt(c.params.id ?? "", 10);
  if (!id) return notFoundPage(c);
  const doc = await documentQuery.byId(c.env.DB, id).first<DocumentRow>();
  // Länkade dokument (t.ex. Google Dokument): adressen kommer från databasen, så det är ingen öppen omdirigering.
  // Den fasta adressen /dokument/fil/:id fortsätter att fungera även om styrelsen byter länk.
  if (doc?.link_url && /^https?:\/\//i.test(doc.link_url)) {
    return new Response(null, { status: 302, headers: { Location: doc.link_url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
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
    ${pageHeader(s, { kickerKey: "faq_kicker", hero: "faq", titleKey: "faq_title", leadKey: "faq_lead" })}
    <section class="section section-tight-top">
      <div class="container narrow">
        ${groups.size
          ? [...groups.entries()].map(([cat, list], i) => html`<h2 class="subsection-title${i === 0 ? " first" : ""}">${cat}</h2>${faqList(s, list)}`)
          : emptyState(s.faq_empty, ek(s, "faq_empty"))}
        <div class="cta-inline">
          <div>
            <h2 class="cta-inline-title"${ek(s, "faq_cta_title")}>${s.faq_cta_title}</h2>
            <p${ek(s, "faq_cta_text")}>${s.faq_cta_text}</p>
          </div>
          <a class="btn btn-primary" href="/kontakt"${ek(s, "faq_cta_button")}>${s.faq_cta_button}</a>
        </div>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.faq_title, description: s.faq_lead, jsonLd: items.length ? [faqLd] : [] }, content));
}
