import { html, type SafeHtml } from "../lib/html.js";
import { formatDay } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import type { Session } from "./auth.js";
import { adminHead, adminLayout, newMessageCount } from "./layout.js";
import { resourceTabs } from "./resources.js";
import { recentTerms, type Term } from "./stats-pages.js";

/**
 * Statistik för jobbannonserna – för alla arbetsgivare, inte bara partners. Bygger på samma totalsiffror
 * per dag (stats_daily: job_view, job_apply) som partnerstatistiken; inga personuppgifter, inga kakor.
 * Annonserna grupperas på arbetsgivare: partner, arbetsgivare i registret eller (utan koppling) namnet.
 */

const JOB_TABS = [
  { href: "/admin/jobb", label: "Tjänster" },
  { href: "/admin/arbetsgivare", label: "Arbetsgivare" },
  { href: "/admin/jobb/statistik", label: "Statistik" },
];

interface JobLine {
  id: number;
  title: string;
  employer: string;
  views: number;
  applies: number;
}
interface EmployerLine {
  key: string;
  name: string;
  kind: "partner" | "arbetsgivare" | "annan";
  href: string | null;
  jobs: number;
  views: number;
  applies: number;
}

/** Siffror för en enskild annons sedan statistiken började räknas (visas på annonsens redigeringssida). */
export async function jobTotals(db: D1Database, jobId: number): Promise<{ views: number; applies: number }> {
  const { results } = await db
    .prepare("SELECT kind, SUM(count) AS n FROM stats_daily WHERE ref_id = ? AND kind IN ('job_view', 'job_apply') GROUP BY kind")
    .bind(jobId)
    .all<{ kind: string; n: number }>();
  const get = (k: string) => results.find((r) => r.kind === k)?.n ?? 0;
  return { views: get("job_view"), applies: get("job_apply") };
}

async function collect(db: D1Database, term: Term) {
  const [sums, jobs, first] = await db.batch([
    db.prepare("SELECT kind, ref_id, SUM(count) AS n FROM stats_daily WHERE day BETWEEN ? AND ? AND kind IN ('job_view', 'job_apply') GROUP BY kind, ref_id").bind(term.from, term.to),
    db.prepare(
      "SELECT j.id, j.title, j.employer, j.partner_id, j.company_id, p.name AS partner_name, co.name AS company_name FROM jobs j " +
        "LEFT JOIN partners p ON p.id = j.partner_id LEFT JOIN companies co ON co.id = j.company_id",
    ),
    db.prepare("SELECT MIN(day) AS d FROM stats_daily WHERE kind IN ('job_view', 'job_apply')"),
  ]);
  const n = new Map<string, number>();
  for (const r of sums!.results as { kind: string; ref_id: number; n: number }[]) n.set(`${r.kind}:${r.ref_id}`, r.n);
  type J = { id: number; title: string; employer: string; partner_id: number | null; company_id: number | null; partner_name: string | null; company_name: string | null };
  const lines: JobLine[] = [];
  const employers = new Map<string, EmployerLine>();
  for (const j of jobs!.results as J[]) {
    const views = n.get(`job_view:${j.id}`) ?? 0;
    const applies = n.get(`job_apply:${j.id}`) ?? 0;
    if (!views && !applies) continue;
    lines.push({ id: j.id, title: j.title, employer: j.partner_name ?? j.company_name ?? j.employer, views, applies });
    const e: Omit<EmployerLine, "jobs" | "views" | "applies"> = j.partner_id && j.partner_name
      ? { key: `p:${j.partner_id}`, name: j.partner_name, kind: "partner", href: `/admin/partners/${j.partner_id}` }
      : j.company_id && j.company_name
        ? { key: `c:${j.company_id}`, name: j.company_name, kind: "arbetsgivare", href: `/admin/arbetsgivare/${j.company_id}` }
        : { key: `n:${j.employer.trim().toLowerCase()}`, name: j.employer, kind: "annan", href: null };
    const cur = employers.get(e.key) ?? { ...e, jobs: 0, views: 0, applies: 0 };
    cur.jobs += 1;
    cur.views += views;
    cur.applies += applies;
    employers.set(e.key, cur);
  }
  lines.sort((a, b) => b.views - a.views || b.applies - a.applies);
  const byEmployer = [...employers.values()].sort((a, b) => b.views - a.views || b.applies - a.applies);
  const since = ((first!.results[0] as { d?: string } | undefined)?.d ?? null) as string | null;
  return { lines, byEmployer, since };
}

const num = (v: number) => v.toLocaleString("sv-SE");
/** Andel av visningarna som klickade vidare till ansökan, t.ex. "12 %". */
const rate = (views: number, applies: number) => (views ? `${Math.round((applies / views) * 100)} %` : "–");

export async function jobStatsPage(c: RequestContext, session: Session): Promise<Response> {
  const terms = recentTerms(6);
  const term = terms.find((t) => t.id === c.url.searchParams.get("termin")) ?? terms[0]!;
  const { lines, byEmployer, since } = await collect(c.env.DB, term);
  const max = Math.max(1, ...byEmployer.map((e) => e.views));
  const bar = (v: number): SafeHtml => html`<span class="stat-cell"><progress class="stat-bar" max="${max}" value="${v}" aria-hidden="true"></progress><span>${num(v)}</span></span>`;
  const kindPill = (k: EmployerLine["kind"]) =>
    k === "partner" ? html` <span class="pill">Partner</span>` : k === "annan" ? html` <span class="pill pill-off" title="Inte kopplad till arbetsgivarlistan">Ej i listan</span>` : "";

  const content = html`
    ${adminHead("Statistik för jobbannonser", {
      lead: "Hur många som har sett annonserna och klickat vidare till ansökan – per arbetsgivare och annons, per termin. Gäller alla arbetsgivare, även de som inte är partners. Inga uppgifter om besökarna sparas, bara totalsiffror.",
      actions: html`<a class="btn btn-outline" href="/admin/jobb/statistik.csv?termin=${term.id}" download>Ladda ner (CSV)</a>
        <button class="btn btn-outline" type="button" data-print hidden>Skriv ut</button>`,
    })}
    ${resourceTabs(JOB_TABS, "/admin/jobb/statistik")}
    <div class="filter-bar">
      <nav class="tabs tabs-compact" aria-label="Termin">
        <ul>${terms.map((t) => html`<li><a href="/admin/jobb/statistik?termin=${t.id}"${t.id === term.id ? html` aria-current="page"` : ""}>${t.label}</a></li>`)}</ul>
      </nav>
    </div>
    <h2 class="print-title">${term.label} (${formatDay(term.from)} – ${formatDay(term.to)})</h2>
    ${!lines.length
      ? html`<div class="admin-empty"><p>${since ? "Inga visningar eller klick på jobbannonserna under den här terminen." : "Statistiken har inte börjat räknas ännu. Siffrorna dyker upp här när besökare tittar på jobbannonserna."}</p></div>`
      : html`<h2 class="card-heading stats-subhead">Per arbetsgivare</h2>
        <div class="admin-card admin-card-flush">
          <table class="admin-table stats-table">
            <thead><tr><th scope="col">Arbetsgivare</th><th scope="col">Annonser</th><th scope="col">Visningar</th><th scope="col">Klick till ansökan</th><th scope="col">Andel som klickade</th></tr></thead>
            <tbody>
              ${byEmployer.map(
                (e) => html`<tr>
                  <td data-label="Arbetsgivare">${e.href ? html`<a class="row-title" href="${e.href}">${e.name}</a>` : html`<span class="row-title">${e.name}</span>`}${kindPill(e.kind)}</td>
                  <td data-label="Annonser" class="num">${num(e.jobs)}</td>
                  <td data-label="Visningar">${bar(e.views)}</td>
                  <td data-label="Ansökan" class="num">${num(e.applies)}</td>
                  <td data-label="Andel" class="num">${rate(e.views, e.applies)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        <h2 class="card-heading stats-subhead">Per annons</h2>
        <div class="admin-card admin-card-flush">
          <table class="admin-table stats-table">
            <thead><tr><th scope="col">Tjänst</th><th scope="col">Arbetsgivare</th><th scope="col">Visningar</th><th scope="col">Klick till ansökan</th><th scope="col">Andel som klickade</th></tr></thead>
            <tbody>${lines.map(
              (j) => html`<tr><td data-label="Tjänst"><a class="row-title" href="/admin/jobb/${j.id}">${j.title}</a></td><td data-label="Arbetsgivare">${j.employer}</td><td data-label="Visningar" class="num">${num(j.views)}</td><td data-label="Ansökan" class="num">${num(j.applies)}</td><td data-label="Andel" class="num">${rate(j.views, j.applies)}</td></tr>`,
            )}</tbody>
          </table>
        </div>`}
    <p class="field-help stats-note">Räknas sedan ${since ? formatDay(since) : "första besöket"}. ”Visningar” är hur många gånger annonsen öppnats, ”Klick till ansökan” hur många som klickat på ansökningsknappen. Robotar, förhandsvisningar i adminpanelen och webbläsarens förhämtningar räknas inte. Samma person kan räknas flera gånger. Siffrorna sparas i tre år.</p>`;
  return adminLayout(c, session, { title: "Statistik för jobbannonser", active: "/admin/jobb", newCount: await newMessageCount(c.env.DB), wide: true }, content);
}

export async function jobStatsCsv(c: RequestContext): Promise<Response> {
  const terms = recentTerms(6);
  const term = terms.find((t) => t.id === c.url.searchParams.get("termin")) ?? terms[0]!;
  const { lines, byEmployer } = await collect(c.env.DB, term);
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    [term.label],
    [],
    ["Per arbetsgivare"],
    ["Arbetsgivare", "Annonser", "Visningar", "Klick till ansökan", "Andel som klickade"],
    ...byEmployer.map((e) => [e.name, e.jobs, e.views, e.applies, rate(e.views, e.applies)]),
    [],
    ["Per annons"],
    ["Tjänst", "Arbetsgivare", "Visningar", "Klick till ansökan", "Andel som klickade"],
    ...lines.map((j) => [j.title, j.employer, j.views, j.applies, rate(j.views, j.applies)]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jfk-jobbstatistik-${term.id.toLowerCase()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
