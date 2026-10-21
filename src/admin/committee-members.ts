import { html, type SafeHtml } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import { nextYear, shownYear, yearOptions, yearState } from "../lib/years.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { initials } from "../views/page.js";
import type { Session } from "./auth.js";
import { csrfField } from "./layout.js";

/**
 * Styrelse och uppdrag → Utskott → utskottet: rutan Medlemmar under formuläret. Årets medlemmar kan dras i
 * ordning (admin.js, samma som listorna), läggas till och ändras. Nästa år (inlagt i förväg) och tidigare år
 * visas för sig. Själva redigeringen är den vanliga sidan för utskottsmedlemmar (resources.ts), som skickar
 * tillbaka hit efter sparning.
 */

interface MemberRow {
  id: number;
  committee_id: number;
  year: string;
  name: string;
  role: string;
  program: string;
  photo_key: string | null;
  published: number;
}

/** Året som visas på webbplatsen (inställningen service_year). */
export async function currentServiceYear(db: D1Database): Promise<string> {
  return shownYear((await loadSettings(db)).service_year);
}

/** Valen för fältet Verksamhetsår. */
export async function serviceYearOptions(db: D1Database): Promise<{ value: string; label: string }[]> {
  return yearOptions(await currentServiceYear(db));
}

function photo(m: MemberRow): SafeHtml {
  return m.photo_key
    ? html`<img class="cmm-photo" src="${mediaUrl(m.photo_key, "sm")}" alt="" loading="lazy" width="42" height="56">`
    : html`<span class="cmm-photo cmm-initials" aria-hidden="true">${initials(m.name)}</span>`;
}

function memberRows(session: Session, list: MemberRow[], sortable: boolean): SafeHtml {
  const back = list[0] ? `/admin/utskott/${list[0].committee_id}` : "";
  return html`<ol class="cmm-list"${sortable && list.length > 1 ? html` data-sortable data-sort-url="/admin/utskottsmedlemmar/ordning" data-csrf="${session.csrf}"` : ""}>
    ${list.map(
      (m, i) => html`<li class="cmm-row" id="medlem-${m.id}" data-sort-id="${m.id}" data-sort-group="${m.committee_id}|${m.year}">
        ${sortable && list.length > 1
          ? html`<div class="move-buttons">
              <button class="btn btn-outline btn-sm btn-move drag-handle" type="button" data-sort-handle hidden aria-label="Dra för att flytta ${m.name} (eller använd piltangenterna)" title="Dra för att flytta">${icon("grip", "icon icon-sm")}</button>
              ${(["upp", "ned"] as const).map(
                (dir) => html`<form class="inline-form" method="post" action="/admin/utskottsmedlemmar/${m.id}/flytta">
                  ${csrfField(session)}<input type="hidden" name="riktning" value="${dir}"><input type="hidden" name="tillbaka" value="${back}">
                  <button class="btn btn-outline btn-sm btn-move" type="submit" aria-label="Flytta ${dir} ${m.name}" title="Flytta ${dir}"${(dir === "upp" ? i === 0 : i === list.length - 1) ? html` disabled` : ""}>${icon(dir === "upp" ? "arrowUp" : "arrowDown", "icon icon-sm")}</button>
                </form>`,
              )}
            </div>`
          : ""}
        ${photo(m)}
        <span class="cmm-text">
          <a class="row-title" href="/admin/utskottsmedlemmar/${m.id}">${m.name}</a>
          <span class="cmm-meta">${[m.role, m.program].filter(Boolean).join(" · ") || "Ingen roll ifylld"}</span>
        </span>
        <span class="cmm-flags">
          ${i === 0 && sortable ? html`<span class="pill pill-accent">Visas störst</span>` : ""}
          ${m.published ? "" : html`<span class="pill pill-muted">Dold</span>`}
          ${m.photo_key ? "" : html`<span class="cmm-nophoto">Inget foto</span>`}
        </span>
        <a class="btn btn-outline btn-sm" href="/admin/utskottsmedlemmar/${m.id}">Ändra</a>
      </li>`,
    )}
  </ol>`;
}

/** Rutan Medlemmar på utskottets redigeringssida. */
export async function committeeMembersPanel(db: D1Database, session: Session, committee: { id: number; name: string }): Promise<SafeHtml> {
  const year = await currentServiceYear(db);
  let all: MemberRow[] = [];
  try {
    all = (
      await db
        .prepare("SELECT id, committee_id, year, name, role, program, photo_key, published FROM committee_members WHERE committee_id = ? ORDER BY year DESC, sort_order, id")
        .bind(committee.id)
        .all<MemberRow>()
    ).results;
  } catch {
    all = []; // tabellen finns inte än (migrering 0026)
  }
  const now = all.filter((m) => yearState(m.year, year) === "nu");
  const next = all.filter((m) => yearState(m.year, year) === "kommande");
  const older = all.filter((m) => yearState(m.year, year) === "tidigare");
  const addHref = (y: string) => `/admin/utskottsmedlemmar/ny?utskott=${committee.id}&ar=${encodeURIComponent(y)}`;
  const coming = nextYear(year);

  return html`<section class="admin-card cmm" id="medlemmar" aria-labelledby="medlemmar-rubrik">
    <div class="cmm-head">
      <div>
        <h2 class="cmm-title" id="medlemmar-rubrik">Medlemmar ${year}${now.length ? html` <span class="muted">(${now.length})</span>` : ""}</h2>
        <p class="field-help">Visas på utskottets sida och räknas på affischen under Om oss. ${now.length > 1 ? "Dra i handtaget för att ändra ordningen – den som står först visas störst, med sitt citat." : "Den som står först visas störst, med sitt citat."}</p>
      </div>
      <a class="btn btn-primary" href="${addHref(year)}">+ Lägg till medlem</a>
    </div>
    ${now.length
      ? memberRows(session, now, true)
      : html`<p class="cmm-empty">Inga medlemmar för ${year} ännu. På webbplatsen står det att årets medlemmar presenteras snart.</p>`}

    <div class="cmm-next">
      <h3 class="cmm-subtitle">Nästa år, ${coming}${next.length ? html` <span class="muted">(${next.length})</span>` : ""}</h3>
      <p class="field-help">Lägg in nästa års utskott i förväg. De syns på webbplatsen först när ni byter verksamhetsår under Styrelseskifte.</p>
      ${next.length ? memberRows(session, next, true) : ""}
      <a class="link-btn" href="${addHref(coming)}">+ Lägg till medlem för ${coming}</a>
    </div>

    ${older.length
      ? html`<details class="cmm-archive">
          <summary>Tidigare år (${older.length} ${older.length === 1 ? "person" : "personer"})</summary>
          <p class="field-help">Visas under Tidigare år på utskottets sida, med namn och roll men utan foto.</p>
          ${[...new Set(older.map((m) => m.year))].map(
            (y) => html`<h3 class="cmm-subtitle">${y}</h3>${memberRows(session, older.filter((m) => m.year === y), false)}`,
          )}
        </details>`
      : ""}
  </section>`;
}
