import { isLinkVisible } from "../lib/pagelayout.js";
import { escapeHtml, html, raw, type SafeHtml } from "../lib/html.js";
import { ek, loadSettings, type SettingKey, type Settings, siteLayout } from "../lib/settings.js";
import {
  documentQuery,
  faqQuery,
  jobQuery,
  partnerQuery,
  searchQuery,
  type DocumentRow,
  type EventRow,
  type FaqRow,
  type JobRow,
  type NewsRow,
  type PartnerRow,
} from "../lib/content.js";
import { eventDate, formatDate, formatDay, stockholmToday } from "../lib/format.js";
import { renderInline } from "../lib/markdown.js";
import { highlight, matches, MIN_QUERY, normalizeQuery, snippet, terms } from "../lib/search.js";
import { fill, PAGES, type FieldDef } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { pageHeader } from "../views/page.js";
import { jobKindLabel } from "./careers.js";

interface Hit {
  title: string;
  href: string;
  meta?: string;
  text: string;
  score: number;
}

interface Group {
  key: SettingKey;
  hits: Hit[];
}

/** Sidor i textregistret som inte ska dyka upp som träffar. */
const SKIP_PAGES = new Set(["gemensamt", "felsidor", "sok"]);
const SEARCHABLE_TYPES = new Set(["text", "textarea", "lines", "rich", "markdown"]);
const PER_GROUP = 8;

function pageHits(s: Settings, ts: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const page of PAGES) {
    if (SKIP_PAGES.has(page.id)) continue;
    for (const section of page.sections) {
      // Små etiketter ("Knapp: sök" osv.) ger bara brus i sökresultaten.
      const fields = (section.fields as readonly FieldDef[]).filter((f) => !f.more && SEARCHABLE_TYPES.has(f.type));
      const values = fields.map((f) => s[f.key as SettingKey] ?? "");
      if (!values.some(Boolean) || !matches(ts, ...values)) continue;
      const best = values.find((v) => matches(ts, v)) ?? values.join(" ");
      const href = section.id === "kakor" ? "/cookies" : page.path;
      if (hits.some((h) => h.href === href)) continue;
      const titleField = fields.find((f) => /_title$/.test(f.key));
      hits.push({
        title: page.title,
        href,
        meta: titleField ? s[titleField.key as SettingKey] : undefined,
        text: snippet(ts, best),
        score: matches(ts, page.title) ? 2 : 1,
      });
    }
  }
  return hits;
}

const byScore = (a: Hit, b: Hit) => b.score - a.score;

export async function searchPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const q = normalizeQuery(c.url.searchParams.get("q"));
  const s = await loadSettings(db, c.preview);
  const ts = terms(q);
  const tooShort = q.length > 0 && q.replace(/\s/g, "").length < MIN_QUERY;
  const searching = q.length > 0 && !tooShort;

  let groups: Group[] = [];
  if (searching) {
    const [newsRes, eventRes, jobRes, docRes, faqRes, partnerRes] = await db.batch([
      searchQuery.news(db),
      searchQuery.events(db),
      jobQuery.open(db, stockholmToday()),
      documentQuery.all(db),
      faqQuery.all(db),
      partnerQuery.all(db),
    ]);
    const res = <T,>(r: D1Result | undefined) => (r?.results ?? []) as T[];
    const title = (t: string) => (matches(ts, t) ? 2 : 1);

    groups = [
      { key: "search_group_pages", hits: pageHits(s, ts) },
      {
        key: "search_group_news",
        hits: res<NewsRow>(newsRes)
          .filter((n) => matches(ts, n.title, n.excerpt, n.body))
          .map((n) => ({ title: n.title, href: `/aktuellt/${n.slug}`, meta: formatDate(n.published_at), text: snippet(ts, matches(ts, n.excerpt) ? n.excerpt : n.body || n.excerpt), score: title(n.title) })),
      },
      {
        key: "search_group_events",
        hits: res<EventRow>(eventRes)
          .filter((e) => matches(ts, e.title, e.summary, e.body, e.location))
          .map((e) => {
            const d = eventDate(e.starts_at, e.ends_at);
            return { title: e.title, href: `/kalender/${e.slug}`, meta: d ? `${d.day} ${d.monthShort} ${e.starts_at.slice(0, 4)}${e.location ? ` · ${e.location}` : ""}` : e.location, text: snippet(ts, e.summary || e.body), score: title(e.title) };
          }),
      },
      {
        key: "search_group_jobs",
        hits: res<JobRow>(jobRes)
          .filter((j) => matches(ts, j.title, j.employer, j.summary, j.body, j.location, jobKindLabel(s, j.kind)))
          .map((j) => ({
            title: j.title,
            href: `/karriar/${j.slug}`,
            meta: `${jobKindLabel(s, j.kind)} · ${j.employer}${j.deadline ? ` · ${fill(s.jobs_deadline, { datum: formatDay(j.deadline) })}` : ""}`,
            text: snippet(ts, j.summary || j.body),
            score: title(j.title),
          })),
      },
      {
        key: "search_group_docs",
        hits: res<DocumentRow>(docRes)
          .filter((d) => matches(ts, d.title, String(d.year), s[`doc_cat_${d.category}` as const]))
          .map((d) => ({
            title: d.title,
            href: d.file_key || d.link_url ? `/dokument/fil/${d.id}` : `/dokument?q=${encodeURIComponent(d.title)}`,
            meta: `${s[`doc_cat_${d.category}` as const]} · ${d.year}`,
            text: "",
            score: title(d.title),
          })),
      },
      {
        key: "search_group_faq",
        hits: res<FaqRow>(faqRes)
          .filter((f) => matches(ts, f.question, f.answer))
          .map((f) => ({ title: f.question, href: `/faq#fraga-${f.id}`, meta: f.category, text: snippet(ts, f.answer), score: title(f.question) })),
      },
      {
        key: "search_group_partners",
        hits: res<PartnerRow>(partnerRes)
          .filter((p) => matches(ts, p.name, p.tagline, p.description))
          .map((p) => ({ title: p.name, href: `/partners/${p.slug}`, meta: p.tagline, text: snippet(ts, p.description), score: title(p.name) })),
      },
    ]
      .map((g) => ({ ...g, hits: g.hits.filter((h) => isLinkVisible(siteLayout(s), h.href)) }))
      .filter((g) => g.hits.length) as Group[];
    for (const g of groups) g.hits.sort(byScore);
    // Grupper med träff i rubriken först
    groups.sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));
  }
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  const content = html`
    ${pageHeader(s, { titleKey: "search_title", leadKey: "search_lead" })}
    <section class="section section-tight-top">
      <div class="container"><div class="search-wrap">
        <form class="search-form" method="get" action="/sok" role="search">
          <label class="sr-only" for="sok-falt">${s.search_title}</label>
          <span class="search-form-icon" aria-hidden="true">${icon("search", "icon")}</span>
          <input type="search" id="sok-falt" name="q" value="${q}" placeholder="${s.search_placeholder}" autocomplete="off" maxlength="100"${q ? "" : html` autofocus`}>
          <button class="btn btn-primary" type="submit"${ek(s, "search_button")}>${s.search_button}</button>
        </form>
        <div aria-live="polite">
          ${tooShort ? html`<p class="search-summary"${ek(s, "search_short")}>${s.search_short}</p>` : ""}
          ${searching && total ? html`<p class="search-summary"${ek(s, "search_results")}>${fill(s.search_results, { antal: total, sökord: q })}</p>` : ""}
          ${searching && !total ? html`<div class="empty-state"${ek(s, "search_none")}><p>${noneText(s.search_none, q)}</p></div>` : ""}
        </div>
        ${groups.map(
          (g, i) => html`<section class="search-group" aria-labelledby="sokgrupp-${i}">
            <h2 class="subsection-title${i === 0 ? " first" : ""}" id="sokgrupp-${i}">${s[g.key]} <span class="count-pill">${g.hits.length}</span></h2>
            <ul class="search-results">
              ${g.hits.slice(0, PER_GROUP).map(
                (h) => html`<li class="search-hit">
                  <a class="search-hit-title" href="${h.href}">${highlight(h.title, ts)}</a>
                  ${h.meta ? html`<p class="search-hit-meta">${h.meta}</p>` : ""}
                  ${h.text ? html`<p class="search-hit-text">${highlight(h.text, ts)}</p>` : ""}
                </li>`,
              )}
            </ul>
          </section>`,
        )}
      </div></div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: q ? `${s.search_title}: ${q}` : s.search_title, description: s.search_lead, path: "/sok", noindex: Boolean(q) }, content));
}

/** "Inga träffar för {sökord}" – texten är markdown från adminpanelen, sökordet kommer från besökaren och escapas separat. */
function noneText(template: string, q: string): SafeHtml {
  const TOKEN = "QSOKORDQ";
  const rendered = renderInline(template.replace(/\{sökord\}/g, TOKEN)).toString();
  return raw(rendered.split(TOKEN).join(escapeHtml(q)));
}
