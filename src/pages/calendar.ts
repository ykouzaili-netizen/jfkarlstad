import { html, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, loadSettings, type Settings } from "../lib/settings.js";
import { eventQuery, rows, type EventRow } from "../lib/content.js";
import { eventDate, isoWeek, monthName, stockholmNow, stockholmToday, truncate } from "../lib/format.js";
import { renderInline } from "../lib/markdown.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout } from "../views/layout.js";
import { emptyState, eventCard } from "../views/components.js";
import { icon } from "../views/icons.js";
import { pageHeader } from "../views/page.js";
import { eventJsonLd, subscribePanel } from "./listings.js";

/**
 * Kalendern: en riktig månadskalender (måndag först, med veckonummer) och en listvy.
 *   /kalender                → innevarande månad
 *   /kalender?manad=2026-11  → en viss månad
 *   /kalender?visa=lista     → alla kommande evenemang som lista + tidigare evenemang
 * Fungerar helt utan JavaScript – bläddringen är vanliga länkar.
 */

const MAX_PER_DAY = 3;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const site = (c: RequestContext) => c.env.SITE_URL.replace(/\/$/, "");

/** Första och sista dag (inklusive) som evenemanget pågår, som 'YYYY-MM-DD'. */
function eventDays(e: EventRow): [string, string] {
  const start = e.starts_at.slice(0, 10);
  const end = (e.ends_at ?? e.starts_at).slice(0, 10);
  return [start, end < start ? start : end];
}

function parseMonth(value: string | null, fallback: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m && +m[1]! >= 2011 && +m[1]! <= 2100 && +m[2]! >= 1 && +m[2]! <= 12) return { year: +m[1]!, month: +m[2]! };
  return { year: +fallback.slice(0, 4), month: +fallback.slice(5, 7) };
}

function weekdayNames(s: Settings): string[] {
  const names = lines(s.cal_weekdays);
  return names.length === 7 ? names : ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
}

export async function calendarPage(c: RequestContext): Promise<Response> {
  return c.url.searchParams.get("visa") === "lista" ? listView(c) : monthView(c);
}

// ───────────────────────── Månadsvyn ─────────────────────────

async function monthView(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const today = stockholmToday();
  const { year, month } = parseMonth(c.url.searchParams.get("manad"), today);
  const isCurrent = year === +today.slice(0, 4) && month === +today.slice(5, 7);

  // Rutnätet börjar på måndagen före den 1:a och slutar på söndagen efter månadens sista dag.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const gridStart = addDays(first, -(((first.getUTCDay() || 7) - 1)));
  const gridEnd = addDays(last, 7 - (last.getUTCDay() || 7));
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

  const [s, events, upcoming] = await Promise.all([
    loadSettings(db, c.preview),
    rows<EventRow>(eventQuery.between(db, `${ymd(gridStart)}T00:00`, `${ymd(addDays(gridEnd, 1))}T00:00`)),
    rows<EventRow>(eventQuery.upcoming(db, stockholmNow(), 10)),
  ]);

  // Evenemang per dag (flerdagarsevenemang visas på varje dag de pågår)
  const byDay = new Map<string, { e: EventRow; first: boolean; last: boolean }[]>();
  for (const e of events) {
    const [start, end] = eventDays(e);
    for (let d = new Date(start + "T00:00:00Z"); ymd(d) <= end; d = addDays(d, 1)) {
      const k = ymd(d);
      if (k < ymd(gridStart) || k > ymd(gridEnd)) continue;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push({ e, first: k === start, last: k === end });
    }
  }

  const monthLabel = `${monthName(month)} ${year}`;
  const inMonth = events.filter((e) => {
    const [start, end] = eventDays(e);
    const m0 = ymd(first);
    const m1 = ymd(last);
    return start <= m1 && end >= m0;
  });
  const nextAfter = !inMonth.length ? upcoming.find((e) => e.starts_at.slice(0, 7) > `${year}-${pad(month)}`) : undefined;
  const names = weekdayNames(s);

  const weeks: Date[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));

  const dayCell = (d: Date): SafeHtml => {
    const k = ymd(d);
    const items = byDay.get(k) ?? [];
    const other = d.getUTCMonth() !== month - 1;
    const dow = d.getUTCDay();
    const cls = ["cal-day", other ? "is-other" : "", k === today ? "is-today" : "", k < today ? "is-past" : "", dow === 0 || dow === 6 ? "is-weekend" : "", items.length ? "has-events" : ""]
      .filter(Boolean)
      .join(" ");
    const label = `${d.getUTCDate()} ${monthName(d.getUTCMonth() + 1).toLowerCase()}`;
    return html`<td class="${cls}">
      ${items.length && !other
        ? html`<a class="cal-num" href="#dag-${k}" aria-label="${label}, ${items.length} evenemang">${d.getUTCDate()}</a>`
        : html`<span class="cal-num"${k === today ? html` aria-current="date"` : ""}>${d.getUTCDate()}</span>`}
      ${items.length
        ? html`<ul class="cal-events">
            ${items.slice(0, MAX_PER_DAY).map(({ e, first: isFirst, last: isLast }) => {
              const t = e.starts_at.slice(11, 16);
              return html`<li><a class="cal-ev${e.members_only ? " is-members" : ""}${isFirst ? "" : " is-cont"}${isLast ? "" : " is-continues"}" href="/kalender/${e.slug}" data-pop="cal-pop-${e.id}" aria-describedby="cal-desc-${e.id}"${ec(s, `/admin/event/${e.id}`, `Event › ${e.title}`)}>
                ${isFirst && t && t !== "00:00" ? html`<span class="cal-ev-time">${t}</span>` : ""}<span class="cal-ev-title">${e.title}</span>
              </a></li>`;
            })}
            ${items.length > MAX_PER_DAY ? html`<li><a class="cal-more" href="#dag-${k}"${ek(s, "cal_more")}>${fill(s.cal_more, { antal: items.length - MAX_PER_DAY })}</a></li>` : ""}
          </ul>
          <span class="cal-dots" aria-hidden="true">${items.slice(0, 3).map(({ e }) => html`<span class="cal-dot${e.members_only ? " is-members" : ""}"></span>`)}</span>`
        : ""}
    </td>`;
  };

  // Listan under kalendern: varje evenemang i månaden en gång, med ankare per dag
  const seenDays = new Set<string>();
  const agenda = inMonth.map((e) => {
    const [start] = eventDays(e);
    const anchorDay = start < ymd(first) ? ymd(first) : start;
    const anchor = seenDays.has(anchorDay) ? "" : anchorDay;
    seenDays.add(anchorDay);
    return { e, anchor };
  });
  // Dagar med flerdagarsevenemang som börjat tidigare behöver också ett ankare
  const agendaAnchors = new Set(agenda.map((a) => a.anchor).filter(Boolean));
  const extraAnchors = [...byDay.keys()].filter((k) => k >= ymd(first) && k <= ymd(last) && !agendaAnchors.has(k));

  const monthNav = html`<div class="cal-toolbar">
    <div class="cal-nav">
      <a class="cal-nav-btn" href="/kalender?manad=${key(prev)}" rel="nofollow"${ek(s, "cal_prev")}>${icon("chevronLeft", "icon")}<span class="sr-only">${s.cal_prev}</span></a>
      <h2 class="cal-month" id="kalender-manad" aria-live="polite">${monthLabel}</h2>
      <a class="cal-nav-btn" href="/kalender?manad=${key(next)}" rel="nofollow"${ek(s, "cal_next")}>${icon("chevronRight", "icon")}<span class="sr-only">${s.cal_next}</span></a>
      ${!isCurrent ? html`<a class="btn btn-outline btn-sm cal-today" href="/kalender"${ek(s, "cal_today")}>${s.cal_today}</a>` : ""}
    </div>
    ${viewSwitch(s, "manad")}
  </div>`;

  const content = html`
    ${pageHeader(s, { kickerKey: "cal_kicker", titleKey: "cal_title", leadKey: "cal_lead", actions: subscribePanel(c, s) })}
    <section class="section section-tight-top" aria-labelledby="kalender-manad">
      <div class="container">
        ${monthNav}
        <div class="cal-wrap">
          <table class="cal-grid">
            <caption class="sr-only">${monthLabel}</caption>
            <thead>
              <tr>
                <th scope="col" class="cal-week"><span class="sr-only">Vecka</span></th>
                ${names.map((n, i) => html`<th scope="col"${i === 0 ? ek(s, "cal_weekdays") : ""}><abbr title="${n}">${n.slice(0, 3)}</abbr></th>`)}
              </tr>
            </thead>
            <tbody>
              ${weeks.map(
                (w) => html`<tr>
                  <th scope="row" class="cal-week"><span${ek(s, "cal_week")}>${s.cal_week}</span> ${isoWeek(w[0]!.getUTCFullYear(), w[0]!.getUTCMonth() + 1, w[0]!.getUTCDate())}</th>
                  ${w.map(dayCell)}
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${popoverSources(s, events, today)}
        <ul class="cal-legend">
          <li><span class="cal-dot" aria-hidden="true"></span><span${ek(s, "cal_legend_open")}>${s.cal_legend_open}</span></li>
          <li><span class="cal-dot is-members" aria-hidden="true"></span><span${ek(s, "members_tag")}>${s.members_tag}</span></li>
        </ul>

        <div class="cal-agenda">
          <h2 class="subsection-title"${ek(s, "cal_agenda_title")}>${fill(s.cal_agenda_title, { månad: monthName(month).toLowerCase() })}</h2>
          ${extraAnchors.map((k) => html`<span id="dag-${k}" class="cal-anchor"></span>`)}
          ${agenda.length
            ? html`<div class="card-grid">${agenda.map(({ e, anchor }) => html`<div class="cal-agenda-item"${anchor ? html` id="dag-${anchor}"` : ""}>${eventCard(s, e, 3)}</div>`)}</div>`
            : html`<div class="empty-state">
                <p${ek(s, "cal_month_empty")}>${s.cal_month_empty}</p>
                ${nextAfter
                  ? html`<p><a href="/kalender?manad=${nextAfter.starts_at.slice(0, 7)}#dag-${nextAfter.starts_at.slice(0, 10)}"${ek(s, "cal_next_event")}>${fill(s.cal_next_event, { namn: nextAfter.title, datum: eventDate(nextAfter.starts_at)?.dateLong ?? "" })}</a></p>`
                  : !upcoming.length
                    ? html`<p${ek(s, "cal_empty")}>${renderInline(s.cal_empty)}</p>`
                    : ""}
              </div>`}
        </div>
      </div>
    </section>`;

  const jsonLd = upcoming.slice(0, 10).map((e) => eventJsonLd(site(c), s.site_name, e));
  return htmlResponse(
    c,
    layout(c, s, { title: isCurrent ? s.cal_title : `${s.cal_title} – ${monthLabel}`, description: s.cal_lead, path: isCurrent ? "/kalender" : `/kalender?manad=${year}-${pad(month)}`, noindex: !isCurrent, jsonLd }, content),
  );
}

/**
 * Innehållet i rutan som visas när man pekar på ett evenemang i kalendern. Ligger dolt i sidan
 * (en gång per evenemang); site.js visar det bredvid evenemanget. Datum, tid och plats används
 * också som beskrivning för skärmläsare (aria-describedby) – utan JavaScript är evenemanget en vanlig länk.
 */
function popoverSources(s: Settings, events: EventRow[], today: string): SafeHtml {
  return html`<div class="cal-pop-sources" hidden>
    ${events.map((e) => {
      const d = eventDate(e.starts_at, e.ends_at);
      const [, end] = eventDays(e);
      const past = end < today;
      return html`<div id="cal-pop-${e.id}">
        <p class="cal-pop-title">${e.title}</p>
        <p class="cal-pop-meta" id="cal-desc-${e.id}">
          ${d ? html`<span class="cal-pop-row">${icon("calendar", "icon icon-sm")}<span class="capitalize-first">${d.dateLong}</span></span><span class="cal-pop-row">${icon("clock", "icon icon-sm")}<span>${d.time}</span></span>` : ""}
          ${e.location ? html`<span class="cal-pop-row">${icon("pin", "icon icon-sm")}<span>${e.location}</span></span>` : ""}
          ${e.members_only ? html`<span class="cal-pop-row">${icon("lock", "icon icon-sm")}<span>${s.event_members_only}</span></span>` : ""}
        </p>
        ${e.summary ? html`<p class="cal-pop-summary">${truncate(e.summary, 160)}</p>` : ""}
        <div class="cal-pop-actions">
          ${past
            ? html`<span class="tag tag-muted">${s.event_past}</span>`
            : e.signup_url
              ? html`<a class="btn btn-primary btn-sm" href="${safeUrl(e.signup_url)}" target="_blank" rel="noopener">${s.event_signup}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>`
              : e.members_only
                ? joinButton(s, { className: "btn btn-primary btn-sm", labelKey: "event_join" })
                : ""}
          <a class="arrow-link" href="/kalender/${e.slug}">${s.cal_pop_more}${icon("arrowRight", "icon icon-sm")}</a>
        </div>
      </div>`;
    })}
  </div>`;
}

function viewSwitch(s: Settings, current: "manad" | "lista"): SafeHtml {
  return html`<nav class="cal-views" aria-label="Visning">
    <a href="/kalender"${current === "manad" ? html` aria-current="page"` : ""}${ek(s, "cal_view_month")}>${icon("grid", "icon icon-sm")}${s.cal_view_month}</a>
    <a href="/kalender?visa=lista"${current === "lista" ? html` aria-current="page"` : ""}${ek(s, "cal_view_list")}>${icon("list", "icon icon-sm")}${s.cal_view_list}</a>
  </nav>`;
}

// ───────────────────────── Listvyn ─────────────────────────

async function listView(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const now = stockholmNow();
  const [s, [upRes, pastRes]] = await Promise.all([loadSettings(db, c.preview), db.batch([eventQuery.upcoming(db, now, 100), eventQuery.past(db, now, 12)])]);
  const upcoming = upRes!.results as unknown as EventRow[];
  const past = pastRes!.results as unknown as EventRow[];

  const months = new Map<string, EventRow[]>();
  for (const e of upcoming) {
    const [y, m] = e.starts_at.split("-");
    const k = `${monthName(+m!)} ${y}`;
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(e);
  }

  const content = html`
    ${pageHeader(s, { kickerKey: "cal_kicker", titleKey: "cal_title", leadKey: "cal_lead", actions: subscribePanel(c, s) })}
    <section class="section section-tight-top">
      <div class="container">
        <div class="cal-toolbar cal-toolbar-list">${viewSwitch(s, "lista")}</div>
        ${upcoming.length
          ? [...months.entries()].map(
              ([m, evs], i) => html`<h2 class="subsection-title${i === 0 ? " first" : ""}">${m}</h2><div class="card-grid">${evs.map((e) => eventCard(s, e, 3))}</div>`,
            )
          : emptyState(renderInline(s.cal_empty), ek(s, "cal_empty"))}
      </div>
    </section>
    ${past.length
      ? html`<section class="section section-surface" aria-labelledby="tidigare">
          <div class="container">
            <h2 class="section-title" id="tidigare"${ek(s, "cal_past_title")}>${s.cal_past_title}</h2>
            <ul class="past-list">
              ${past.map((e) => {
                const d = eventDate(e.starts_at, e.ends_at);
                return html`<li${ec(s, `/admin/event/${e.id}`, `Event › ${e.title}`)}><time datetime="${d?.iso ?? ""}">${d ? `${d.day} ${d.monthShort} ${e.starts_at.slice(0, 4)}` : ""}</time><a href="/kalender/${e.slug}">${e.title}</a></li>`;
              })}
            </ul>
          </div>
        </section>`
      : ""}`;
  const jsonLd = upcoming.slice(0, 10).map((e) => eventJsonLd(site(c), s.site_name, e));
  return htmlResponse(c, layout(c, s, { title: s.cal_title, description: s.cal_lead, path: "/kalender?visa=lista", jsonLd }, content));
}
