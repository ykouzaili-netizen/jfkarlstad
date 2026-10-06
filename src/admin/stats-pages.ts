import { html, type SafeHtml } from "../lib/html.js";
import { formatDay, stockholmToday } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import type { Session } from "./auth.js";
import { adminHead, adminLayout, newMessageCount } from "./layout.js";
import { resourceTabs } from "./resources.js";

/**
 * Statistik till samarbetspartners, per termin (VT = januari–juni, HT = juli–december).
 * Bygger på totalsiffror per dag i stats_daily – inga personuppgifter, inga kakor.
 */

export interface Term {
  id: string; // "HT2026"
  label: string; // "Hösttermin 2026"
  from: string; // "2026-07-01"
  to: string; // "2026-12-31"
}

function termOf(day: string): Term {
  const y = Number(day.slice(0, 4));
  const ht = Number(day.slice(5, 7)) >= 7;
  return makeTerm(ht ? "HT" : "VT", y);
}

function makeTerm(kind: "HT" | "VT", y: number): Term {
  return kind === "HT"
    ? { id: `HT${y}`, label: `Hösttermin ${y}`, from: `${y}-07-01`, to: `${y}-12-31` }
    : { id: `VT${y}`, label: `Vårtermin ${y}`, from: `${y}-01-01`, to: `${y}-06-30` };
}

export function recentTerms(n: number): Term[] {
  const out: Term[] = [];
  let t = termOf(stockholmToday());
  for (let i = 0; i < n; i++) {
    out.push(t);
    const y = Number(t.id.slice(2));
    t = t.id.startsWith("HT") ? makeTerm("VT", y) : makeTerm("HT", y - 1);
  }
  return out;
}

interface PartnerStats {
  id: number;
  name: string;
  views: number;
  website: number;
  career: number;
  jobViews: number;
  applies: number;
}

async function collect(db: D1Database, term: Term) {
  const [sums, partners, jobs, first] = await db.batch([
    db.prepare("SELECT kind, ref_id, SUM(count) AS n FROM stats_daily WHERE day BETWEEN ? AND ? GROUP BY kind, ref_id").bind(term.from, term.to),
    db.prepare("SELECT id, name FROM partners ORDER BY CASE tier WHEN 'huvud' THEN 0 ELSE 1 END, sort_order, name"),
    db.prepare("SELECT id, title, employer, partner_id FROM jobs"),
    db.prepare("SELECT MIN(day) AS d FROM stats_daily"),
  ]);
  const n = new Map<string, number>();
  for (const r of sums!.results as { kind: string; ref_id: number; n: number }[]) n.set(`${r.kind}:${r.ref_id}`, r.n);
  const jobRows = jobs!.results as { id: number; title: string; employer: string; partner_id: number | null }[];
  const rows: PartnerStats[] = (partners!.results as { id: number; name: string }[]).map((p) => {
    const own = jobRows.filter((j) => j.partner_id === p.id);
    return {
      id: p.id,
      name: p.name,
      views: n.get(`partner_view:${p.id}`) ?? 0,
      website: n.get(`partner_website:${p.id}`) ?? 0,
      career: n.get(`partner_career:${p.id}`) ?? 0,
      jobViews: own.reduce((s, j) => s + (n.get(`job_view:${j.id}`) ?? 0), 0),
      applies: own.reduce((s, j) => s + (n.get(`job_apply:${j.id}`) ?? 0), 0),
    };
  });
  const jobStats = jobRows
    .map((j) => ({ ...j, views: n.get(`job_view:${j.id}`) ?? 0, applies: n.get(`job_apply:${j.id}`) ?? 0 }))
    .filter((j) => j.partner_id !== null && (j.views || j.applies))
    .sort((a, b) => b.views - a.views);
  const since = ((first!.results[0] as { d?: string } | undefined)?.d ?? null) as string | null;
  return { rows, jobStats, since };
}

export async function partnerStatsPage(c: RequestContext, session: Session): Promise<Response> {
  const terms = recentTerms(6);
  const term = terms.find((t) => t.id === c.url.searchParams.get("termin")) ?? terms[0]!;
  const { rows, jobStats, since } = await collect(c.env.DB, term);
  const max = Math.max(1, ...rows.map((r) => r.views));
  const total = rows.reduce((s, r) => s + r.views + r.website + r.career + r.jobViews + r.applies, 0);
  const num = (v: number) => v.toLocaleString("sv-SE");

  const bar = (v: number): SafeHtml => html`<span class="stat-cell"><progress class="stat-bar" max="${max}" value="${v}" aria-hidden="true"></progress><span>${num(v)}</span></span>`;

  const content = html`
    ${adminHead("Statistik till partners", {
      lead: "Hur många som har sett partnernas sidor och jobbannonser och klickat vidare – per termin. Bra underlag när ni pratar om förlängt samarbete. Inga uppgifter om besökarna sparas, bara totalsiffror.",
      actions: html`<a class="btn btn-outline" href="/admin/partners/statistik.csv?termin=${term.id}" download>Ladda ner (CSV)</a>
        <button class="btn btn-outline" type="button" data-print hidden>Skriv ut</button>`,
    })}
    ${resourceTabs([{ href: "/admin/partners", label: "Partners" }, { href: "/admin/partners/statistik", label: "Statistik" }], "/admin/partners/statistik")}
    <div class="filter-bar">
      <nav class="tabs tabs-compact" aria-label="Termin">
        <ul>${terms.map((t) => html`<li><a href="/admin/partners/statistik?termin=${t.id}"${t.id === term.id ? html` aria-current="page"` : ""}>${t.label}</a></li>`)}</ul>
      </nav>
    </div>
    <h2 class="print-title">${term.label} (${formatDay(term.from)} – ${formatDay(term.to)})</h2>
    ${!total
      ? html`<div class="admin-empty"><p>${since ? "Inga visningar eller klick under den här terminen." : "Statistiken har inte börjat räknas ännu. Siffrorna dyker upp här när besökare tittar på partnernas sidor."}</p></div>`
      : html`<div class="admin-card admin-card-flush">
          <table class="admin-table stats-table">
            <thead><tr><th scope="col">Partner</th><th scope="col">Visningar av partnersidan</th><th scope="col">Klick till webbplatsen</th><th scope="col">Klick till karriärsidan</th><th scope="col">Visningar av jobbannonser</th><th scope="col">Klick till ansökan</th></tr></thead>
            <tbody>
              ${rows.map(
                (r) => html`<tr>
                  <td data-label="Partner"><a class="row-title" href="/admin/partners/${r.id}">${r.name}</a></td>
                  <td data-label="Visningar">${bar(r.views)}</td>
                  <td data-label="Webbplatsen" class="num">${num(r.website)}</td>
                  <td data-label="Karriärsidan" class="num">${num(r.career)}</td>
                  <td data-label="Jobbannonser" class="num">${num(r.jobViews)}</td>
                  <td data-label="Ansökan" class="num">${num(r.applies)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${jobStats.length
          ? html`<h2 class="card-heading stats-subhead">Jobbannonser</h2>
              <div class="admin-card admin-card-flush">
                <table class="admin-table stats-table">
                  <thead><tr><th scope="col">Tjänst</th><th scope="col">Arbetsgivare</th><th scope="col">Visningar</th><th scope="col">Klick till ansökan</th></tr></thead>
                  <tbody>${jobStats.map((j) => html`<tr><td data-label="Tjänst"><a class="row-title" href="/admin/jobb/${j.id}">${j.title}</a></td><td data-label="Arbetsgivare">${j.employer}</td><td data-label="Visningar" class="num">${num(j.views)}</td><td data-label="Ansökan" class="num">${num(j.applies)}</td></tr>`)}</tbody>
                </table>
              </div>`
          : ""}`}
    <p class="field-help stats-note">Statistik för alla jobbannonser – även från arbetsgivare som inte är partners – finns under <a href="/admin/jobb/statistik">Jobb och praktik → Statistik</a>.</p>
    <p class="field-help stats-note">Räknas sedan ${since ? formatDay(since) : "första besöket"}. Robotar, förhandsvisningar i adminpanelen och webbläsarens förhämtningar räknas inte. Samma person kan räknas flera gånger. Siffrorna sparas i tre år.</p>`;
  return adminLayout(c, session, { title: "Statistik till partners", active: "/admin/partners", newCount: await newMessageCount(c.env.DB), wide: true }, content);
}

export async function partnerStatsCsv(c: RequestContext): Promise<Response> {
  const terms = recentTerms(6);
  const term = terms.find((t) => t.id === c.url.searchParams.get("termin")) ?? terms[0]!;
  const { rows } = await collect(c.env.DB, term);
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Partner", "Visningar av partnersidan", "Klick till webbplatsen", "Klick till karriärsidan", "Visningar av jobbannonser", "Klick till ansökan"];
  const lines = rows.map((r) => [r.name, r.views, r.website, r.career, r.jobViews, r.applies].map(cell).join(";"));
  const csv = "﻿" + [cell(term.label), header.map(cell).join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jfk-partnerstatistik-${term.id.toLowerCase()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
