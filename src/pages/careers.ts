import { html, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, loadSettings, type Settings } from "../lib/settings.js";
import { JOB_KINDS, jobQuery, rows, type JobKind, type JobRow, type PartnerRow } from "../lib/content.js";
import { formatDay, isoDate, stockholmToday, truncate } from "../lib/format.js";
import { plainText, renderInline, renderMarkdown } from "../lib/markdown.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import { countStat, isCountable, type StatKind } from "../lib/stats.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl } from "../views/layout.js";
import { arrowLink, emptyState } from "../views/components.js";
import { icon } from "../views/icons.js";
import { breadcrumb, pageHeader } from "../views/page.js";
import { notFoundPage } from "./errors.js";

export const jobKindLabel = (s: Settings, kind: JobKind) => s[`jobs_kind_${kind}` as const] ?? kind;

const site = (c: RequestContext) => c.env.SITE_URL.replace(/\/$/, "");
const newTab = html`<span class="sr-only"> (öppnas i ny flik)</span>`;

function deadlineText(s: Settings, j: JobRow): string {
  return j.deadline ? fill(s.jobs_deadline, { datum: formatDay(j.deadline) }) : s.jobs_rolling;
}

/** Logga för arbetsgivaren: partnerns logga om tjänsten är kopplad till en partner, annars initialen. */
function employerMark(j: JobRow): SafeHtml {
  const logo = mediaUrl(j.partner_logo, "sm");
  return logo
    ? html`<span class="job-logo"><img src="${logo}" alt="" loading="lazy" decoding="async"></span>`
    : html`<span class="job-logo job-logo-initial" aria-hidden="true">${(j.employer.trim()[0] ?? "§").toUpperCase()}</span>`;
}

/** Kort för en tjänst – används på /karriar och på partnerns sida. */
export function jobCard(s: Settings, j: JobRow, showEmployer = true): SafeHtml {
  return html`<li class="job-card"${ec(s, `/admin/jobb/${j.id}`, `Jobb › ${j.title}`)}>
    ${showEmployer ? employerMark(j) : ""}
    <div class="job-body">
      <p class="job-meta-top"><span class="tag tag-soft">${jobKindLabel(s, j.kind)}</span>${showEmployer ? html`<span class="job-employer">${j.employer}</span>` : ""}</p>
      <h3 class="job-title"><a class="card-link" href="/karriar/${j.slug}">${j.title}</a></h3>
      ${j.summary ? html`<p class="job-summary">${truncate(j.summary, 160)}</p>` : ""}
      <ul class="meta-list">
        ${j.location ? html`<li>${icon("pin", "icon icon-sm")}<span>${j.location}</span></li>` : ""}
        <li>${icon("clock", "icon icon-sm")}<span>${deadlineText(s, j)}</span></li>
      </ul>
    </div>
  </li>`;
}

export async function jobsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const kindParam = c.url.searchParams.get("typ") ?? "";
  const kind = (JOB_KINDS as string[]).includes(kindParam) ? (kindParam as JobKind) : null;
  const [s, jobs] = await Promise.all([loadSettings(db, c.preview), rows<JobRow>(jobQuery.open(db, stockholmToday()))]);
  const kindsInUse = JOB_KINDS.filter((k) => jobs.some((j) => j.kind === k));
  const shown = kind ? jobs.filter((j) => j.kind === kind) : jobs;

  const content = html`
    ${pageHeader(s, { kickerKey: "jobs_kicker", hero: "jobs", titleKey: "jobs_title", leadKey: "jobs_lead" })}
    <section class="section section-tight-top">
      <div class="container">
        ${kindsInUse.length > 1
          ? html`<nav class="chip-nav chip-nav-filter" aria-label="Filtrera på typ">
              <ul>
                <li><a class="chip${kind ? "" : " is-active"}" href="/karriar"${kind ? "" : html` aria-current="page"`}${ek(s, "jobs_filter_all")}>${s.jobs_filter_all} <span class="chip-count">${jobs.length}</span></a></li>
                ${kindsInUse.map(
                  (k) => html`<li><a class="chip${kind === k ? " is-active" : ""}" href="/karriar?typ=${k}"${kind === k ? html` aria-current="page"` : ""}${ek(s, `jobs_kind_${k}` as const)}>${jobKindLabel(s, k)} <span class="chip-count">${jobs.filter((j) => j.kind === k).length}</span></a></li>`,
                )}
              </ul>
            </nav>`
          : ""}
        ${shown.length ? html`<ul class="job-list">${shown.map((j) => jobCard(s, j))}</ul>` : emptyState(renderInline(s.jobs_empty), ek(s, "jobs_empty"))}
        <div class="cta-inline">
          <div>
            <h2 class="cta-inline-title"${ek(s, "jobs_cta_title")}>${s.jobs_cta_title}</h2>
            <p${ek(s, "jobs_cta_text")}>${s.jobs_cta_text}</p>
          </div>
          <a class="btn btn-primary" href="/for-foretag#kontakta-oss"${ek(s, "jobs_cta_button")}>${s.jobs_cta_button}</a>
        </div>
      </div>
    </section>`;
  return htmlResponse(
    c,
    layout(c, s, { title: kind ? `${jobKindLabel(s, kind)} – ${s.jobs_title}` : s.jobs_title, description: s.jobs_lead, path: kind ? `/karriar?typ=${kind}` : "/karriar" }, content),
  );
}

const EMPLOYMENT_TYPE: Partial<Record<JobKind, string>> = { praktik: "INTERN", sommarnotarie: "TEMPORARY", trainee: "FULL_TIME", jobb: "FULL_TIME" };

export async function jobDetailPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, j] = await Promise.all([loadSettings(db, c.preview), jobQuery.bySlug(db, c.params.slug ?? "").first<JobRow>()]);
  if (!j) return notFoundPage(c);
  const today = stockholmToday();
  const expired = Boolean(j.deadline && j.deadline < today);
  if (!c.preview && isCountable(c.req)) c.exec.waitUntil(countStat(c.env, "job_view", j.id));
  const edit = ec(s, `/admin/jobb/${j.id}`, `Jobb › ${j.title}`);

  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: renderMarkdown(j.body || j.summary).toString() || j.title,
    datePosted: isoDate(j.publish_at ?? j.updated_at),
    validThrough: j.deadline ? `${j.deadline}T23:59:59+01:00` : undefined,
    employmentType: EMPLOYMENT_TYPE[j.kind],
    hiringOrganization: { "@type": "Organization", name: j.employer, logo: j.partner_logo ? site(c) + mediaUrl(j.partner_logo) : undefined },
    jobLocation: j.location ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location, addressCountry: "SE" } } : undefined,
    url: `${site(c)}/karriar/${j.slug}`,
  };

  const content = html`
    <article>
      <header class="page-hero">
        <div class="container">
          ${breadcrumb([{ href: "/karriar", label: s.job_back }, { label: j.title }])}
          <div class="job-hero"${edit}>
            ${employerMark(j)}
            <div>
              <p class="page-kicker">${jobKindLabel(s, j.kind)} · ${j.employer}</p>
              <h1 class="page-title">${j.title}</h1>
              ${j.summary ? html`<p class="page-lead">${j.summary}</p>` : ""}
            </div>
          </div>
        </div>
      </header>
      <section class="section section-tight-top">
        <div class="container split split-top">
          <div class="prose prose-lg"${edit}>${renderMarkdown(j.body)}</div>
          <aside class="aside-card">
            ${expired ? html`<p class="tag tag-muted"${ek(s, "job_expired")}>${s.job_expired}</p>` : ""}
            <ul class="meta-list meta-list-lg">
              <li>${icon("briefcase", "icon")}<span>${j.employer}</span></li>
              ${j.location ? html`<li>${icon("pin", "icon")}<span>${j.location}</span></li>` : ""}
              <li>${icon("clock", "icon")}<span>${deadlineText(s, j)}</span></li>
            </ul>
            <div class="stack-sm">
              ${!expired && j.apply_url
                ? html`<a class="btn btn-primary btn-block" href="/ut/ansok/${j.id}" target="_blank" rel="noopener nofollow"${ek(s, "job_apply_button")}>${s.job_apply_button}${icon("external", "icon icon-sm")}${newTab}</a>`
                : ""}
              ${j.partner_slug
                ? html`<a class="btn btn-outline btn-block" href="/partners/${j.partner_slug}"${ek(s, "job_partner_link")}>${fill(s.job_partner_link, { arbetsgivare: j.employer })}</a>`
                : ""}
            </div>
          </aside>
        </div>
        <div class="container"><p class="after-list">${arrowLink("/karriar", s.job_all, "arrow-link", ek(s, "job_all"))}</p></div>
      </section>
    </article>`;
  return htmlResponse(
    c,
    layout(c, s, { title: `${j.title} – ${j.employer}`, description: truncate(j.summary || plainText(j.body), 155), noindex: expired, jsonLd: expired ? [] : [posting] }, content),
  );
}

/**
 * Utgående länkar till partners och ansökningar: /ut/webb/:id, /ut/karriar/:id, /ut/ansok/:id.
 * Adressen hämtas alltid från databasen (ingen öppen omdirigering) och klicket räknas till partnerstatistiken.
 */
export async function outboundHandler(c: RequestContext): Promise<Response> {
  const id = parseInt(c.params.id ?? "", 10);
  const kind = c.params.kind ?? "";
  if (!id) return notFoundPage(c);
  const db = c.env.DB;
  let target: string | null | undefined;
  let stat: StatKind | null = null;
  let statId = id;
  if (kind === "webb" || kind === "karriar") {
    const p = await db.prepare("SELECT id, website_url, career_url FROM partners WHERE published = 1 AND id = ?").bind(id).first<Pick<PartnerRow, "id" | "website_url" | "career_url">>();
    target = kind === "webb" ? p?.website_url : p?.career_url;
    stat = kind === "webb" ? "partner_website" : "partner_career";
  } else if (kind === "ansok") {
    const j = await jobQuery.byId(db, id).first<JobRow>();
    target = j?.apply_url;
    stat = "job_apply";
    statId = j?.id ?? id;
  }
  const url = safeUrl(target);
  if (!target || !/^https?:\/\//i.test(url)) return notFoundPage(c);
  if (stat && isCountable(c.req)) c.exec.waitUntil(countStat(c.env, stat, statId));
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "strict-origin-when-cross-origin" },
  });
}

