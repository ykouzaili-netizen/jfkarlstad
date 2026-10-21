import { html, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { BOARD_GROUP, loadGroupPhotos, markerValue, type GroupPhotoRow } from "../lib/committees.js";
import { purgeIfUnused } from "../lib/media.js";
import { isServiceYear, nextYear, yearOptions, yearState } from "../lib/years.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { initials } from "../views/page.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { currentServiceYear } from "./committee-members.js";
import { csrfField } from "./layout.js";
import { handleUpload, uploadHint, uploadInput } from "./uploads.js";

/**
 * Gruppbilder per verksamhetsår (tabellen group_photos) för ett utskott eller styrelsen, lagbildens punkter
 * (committee_members.marker_x/y) och "Behåll från förra året".
 *
 * Adresserna har formen /admin/gruppbild/:scope där scope är utskottets id eller "styrelsen" – inte
 * /admin/styrelsen/… som skulle krocka med styrelsens vanliga redigeringssidor.
 */

const ALT_MAX = 200;

interface Scope {
  /** Utskottets id, eller BOARD_GROUP för styrelsen. */
  id: number;
  /** "12" eller "styrelsen" i adresserna. */
  slug: string;
  /** Vart man kommer tillbaka (med #ankare). */
  back: string;
  label: string;
}

async function scopeOf(db: D1Database, raw: string): Promise<Scope | null> {
  if (raw === "styrelsen") return { id: BOARD_GROUP, slug: "styrelsen", back: "/admin/styrelsen", label: "styrelsen" };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await db.prepare("SELECT id, name FROM committees WHERE id = ?").bind(id).first<{ id: number; name: string }>();
  return row ? { id: row.id, slug: String(row.id), back: `/admin/utskott/${row.id}`, label: row.name } : null;
}

const backTo = (scope: Scope, query: string, anchor: string) => redirect(`${scope.back}?${query}#${anchor}`, 303);

interface MarkerMember {
  id: number;
  name: string;
  role: string;
  photo_key: string | null;
  marker_x: number | null;
  marker_y: number | null;
}

/** Bildfältet för en ny eller utbytt gruppbild. */
function uploadForm(session: Session, scope: Scope, year: string | null, replace: boolean, choices: string[] = []): SafeHtml {
  const id = `gruppbild-${scope.slug}-${year ? year.replace("/", "-") : "annat"}${replace ? "-byt" : ""}`;
  return html`<form class="gp-upload" method="post" action="/admin/gruppbild/${scope.slug}" enctype="multipart/form-data">
    ${csrfField(session)}
    ${year
      ? html`<input type="hidden" name="ar" value="${year}">`
      : html`<div class="field">
          <label class="field-label" for="${id}-ar">Verksamhetsår</label>
          <select id="${id}-ar" name="ar">${choices.map((y) => html`<option value="${y}">${y}</option>`)}</select>
        </div>`}
    <div class="field field-upload">
      <span class="field-label" id="${id}-etikett">${replace ? "Byt bild" : "Gruppbild"}</span>
      ${uploadInput({ id, name: "bild", kind: "image", labelledBy: `${id}-etikett` })}
      <p class="field-help">${uploadHint("image")} Liggande bild fungerar bäst.</p>
    </div>
    ${replace
      ? ""
      : html`<div class="field">
          <label class="field-label" for="${id}-alt">Beskriv bilden <span class="optional">(valfritt)</span></label>
          <input type="text" id="${id}-alt" name="alt" maxlength="${ALT_MAX}" placeholder="T.ex. ${scope.id === BOARD_GROUP ? "Styrelsen på trappan till Juridicum" : `${scope.label} på kickoffen`}">
        </div>`}
    <button class="btn ${replace ? "btn-outline btn-sm" : "btn-primary"}" type="submit">${icon("image", "icon icon-sm")}${replace ? "Ladda upp ny bild" : "Ladda upp"}</button>
  </form>`;
}

/**
 * En gruppbild för ett år. Med markers (lagbilden, bara utskott): klicka i bilden för att placera den valda
 * personen. Utan JS skriver man in positionen i procent.
 */
function photoBlock(session: Session, scope: Scope, year: string, photo: GroupPhotoRow, members: MarkerMember[] | null): SafeHtml {
  const formId = `gp-form-${scope.slug}-${year.replace("/", "-")}`;
  const withMarkers = !!members && members.length > 0;
  const nextUnplaced = members?.find((m) => m.marker_x == null) ?? members?.[0];
  let n = 0;
  return html`<div class="gp-photo"${withMarkers ? html` data-marker-editor` : ""}>
    <form id="${formId}" method="post" action="/admin/gruppbild/${scope.slug}/andra">
      ${csrfField(session)}<input type="hidden" name="ar" value="${year}">
      <div class="gp-layout${withMarkers ? " has-markers" : ""}">
        <div class="gp-image" data-marker-img>
          <img src="${mediaUrl(photo.image_key, "md") ?? mediaUrl(photo.image_key)}" alt="${photo.image_alt}" loading="lazy">
          ${withMarkers
            ? members!.map((m) => {
                const placed = m.marker_x != null && m.marker_y != null;
                if (placed) n++;
                return html`<span class="gp-dot" data-marker="${m.id}"${placed ? html` data-x="${m.marker_x!}" data-y="${m.marker_y!}"` : html` hidden`} aria-hidden="true">${placed ? String(n) : ""}</span>`;
              })
            : ""}
        </div>
        ${withMarkers
          ? html`<fieldset class="gp-people">
              <legend>Var står de på bilden?</legend>
              <p class="field-help" data-marker-help>Välj en person och klicka där hen står i bilden. Nästa person väljs automatiskt. Utan siffra syns personen i listan bredvid bilden.</p>
              <ol class="gp-list">
                ${members!.map(
                  (m) => html`<li class="gp-person">
                    <label class="gp-pick">
                      <input type="radio" name="placera" value="${m.id}"${m === nextUnplaced ? html` checked` : ""}>
                      ${m.photo_key ? html`<img class="gp-face" src="${mediaUrl(m.photo_key, "sm")}" alt="" width="28" height="37">` : html`<span class="gp-face gp-face-initials" aria-hidden="true">${initials(m.name)}</span>`}
                      <span class="gp-name">${m.name}${m.role ? html`<span class="gp-role">${m.role}</span>` : ""}</span>
                    </label>
                    <span class="gp-coords">
                      <label><span class="sr-only">${m.name}: vågrätt i procent</span><input type="number" name="x_${m.id}" min="0" max="100" step="0.1" inputmode="decimal" value="${m.marker_x ?? ""}" data-marker-x="${m.id}" placeholder="x"></label>
                      <label><span class="sr-only">${m.name}: lodrätt i procent</span><input type="number" name="y_${m.id}" min="0" max="100" step="0.1" inputmode="decimal" value="${m.marker_y ?? ""}" data-marker-y="${m.id}" placeholder="y"></label>
                      <button class="link-btn gp-clear" type="button" data-marker-clear="${m.id}" hidden aria-label="Ta bort punkten för ${m.name}">Ta bort</button>
                    </span>
                  </li>`,
                )}
              </ol>
            </fieldset>`
          : ""}
      </div>
      <div class="field">
        <label class="field-label" for="${formId}-alt">Beskriv bilden <span class="optional">(valfritt)</span></label>
        <input type="text" id="${formId}-alt" name="alt" maxlength="${ALT_MAX}" value="${photo.image_alt}">
      </div>
      <div class="gp-actions">
        <button class="btn btn-primary" type="submit" name="gora" value="spara">${withMarkers ? "Spara bild och punkter" : "Spara"}</button>
        <button class="btn btn-danger-ghost btn-sm" type="submit" name="gora" value="ta-bort" data-confirm-click="Ta bort gruppbilden för ${year}? Den raderas helt.">Ta bort bilden</button>
      </div>
    </form>
    <details class="gp-replace"><summary>Byt bild</summary>${uploadForm(session, scope, year, true)}</details>
  </div>`;
}

/**
 * Rutan med gruppbilder: årets och nästa års (med lagbildens punkter för utskott) och tidigare år.
 * members = utskottets medlemmar per år (null för styrelsen, som inte har punkter).
 */
export async function groupPhotosPanel(
  db: D1Database,
  session: Session,
  scopeRaw: { committeeId: number; name: string },
  members: Map<string, MarkerMember[]> | null,
): Promise<SafeHtml> {
  const board = scopeRaw.committeeId === BOARD_GROUP;
  const scope: Scope = board
    ? { id: BOARD_GROUP, slug: "styrelsen", back: "/admin/styrelsen", label: "styrelsen" }
    : { id: scopeRaw.committeeId, slug: String(scopeRaw.committeeId), back: `/admin/utskott/${scopeRaw.committeeId}`, label: scopeRaw.name };
  const year = await currentServiceYear(db);
  const coming = nextYear(year);
  const photos = await loadGroupPhotos(db, scope.id);
  const past = [...photos.keys()].filter((y) => yearState(y, year) === "tidigare");
  const pastChoices = yearOptions(year).filter((o) => yearState(o.value, year) === "tidigare" && !photos.has(o.value));

  const yearBlock = (y: string, title: string, help: string) => {
    const photo = photos.get(y);
    const people = members?.get(y) ?? null;
    return html`<section class="gp-year" aria-label="${title}">
      <h3 class="cmm-subtitle">${title}</h3>
      <p class="field-help">${help}</p>
      ${photo ? photoBlock(session, scope, y, photo, people) : uploadForm(session, scope, y, false)}
    </section>`;
  };

  const anchor = board ? "gruppbilder" : "lagbild";
  const body = html`
    <div>
      <h2 class="cmm-title" id="${anchor}-rubrik">${board ? "Gruppbilder" : "Lagbild och gruppbilder"}</h2>
      <p class="field-help">${board
        ? "En gruppbild per verksamhetsår. Årets bild visas överst under Styrelsen på Om oss, och när året är slut visas den under Tidigare styrelser. Ladda bara upp bilder som alla på bilden har sagt ja till. Bilden raderas helt när du tar bort den."
        : "En gruppbild per verksamhetsår. Välj Lagbild under ”Visa medlemmarna som” så visas årets bild på utskottets sida med en siffra på varje person. När året är slut visas bilden under Tidigare år. Ladda bara upp bilder som alla på bilden har sagt ja till."}</p>
    </div>
    ${yearBlock(year, `${year} – visas nu`, board ? "Visas överst under Styrelsen på Om oss." : members?.get(year)?.length ? "Placera ut personerna så får de en siffra i bilden." : "Lägg först till årets medlemmar ovanför, så kan du placera ut dem i bilden.")}
    ${yearBlock(coming, `${coming} – nästa år`, "Syns på webbplatsen när ni byter verksamhetsår under Styrelseskifte.")}
    ${past.length || pastChoices.length
      ? html`<details class="cmm-archive gp-past">
          <summary>Tidigare år${past.length ? ` (${past.length} ${past.length === 1 ? "bild" : "bilder"})` : ""}</summary>
          ${past.map((y) => html`<section class="gp-year" aria-label="${y}"><h3 class="cmm-subtitle">${y}</h3>${photoBlock(session, scope, y, photos.get(y)!, null)}</section>`)}
          ${pastChoices.length ? html`<section class="gp-year"><h3 class="cmm-subtitle">Lägg till en bild från ett tidigare år</h3>${uploadForm(session, scope, null, false, pastChoices.map((o) => o.value))}</section>` : ""}
        </details>`
      : ""}`;
  // På Styrelsen ligger rutan ovanför ledamöterna, så där är den hopfälld (admin.js öppnar den vid #gruppbilder).
  return board
    ? html`<details class="admin-card gp gp-collapsible" id="${anchor}">
        <summary class="gp-summary">${icon("image", "icon icon-sm")}<span><strong>Gruppbilder</strong> <span class="muted">${photos.size ? `${photos.size} ${photos.size === 1 ? "bild" : "bilder"}` : "– ingen uppladdad än"}</span></span></summary>
        ${body}
      </details>`
    : html`<section class="admin-card gp" id="${anchor}" aria-labelledby="${anchor}-rubrik">${body}</section>`;
}

/** POST /admin/gruppbild/:scope – ladda upp eller byt årets gruppbild. */
export async function groupPhotoUpload(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const scope = await scopeOf(db, c.params.scope ?? "");
  if (!scope) return redirect("/admin", 303);
  const anchor = scope.id === BOARD_GROUP ? "gruppbilder" : "lagbild";
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return backTo(scope, "fel=uppladdning", anchor);
  }
  if (!checkCsrf(c, session, form)) return backTo(scope, "fel=csrf", anchor);
  const year = String(form.get("ar") ?? "");
  if (!isServiceYear(year)) return backTo(scope, "fel=uppladdning", anchor);
  const up = await handleUpload(c.env, form, "bild", "image", "gruppbild", session.user.email);
  if (!up.ok || !up.key) return backTo(scope, "fel=uppladdning", anchor);
  const alt = String(form.get("alt") ?? "").replace(/\s+/g, " ").trim().slice(0, ALT_MAX);
  const old = await db.prepare("SELECT image_key, image_alt FROM group_photos WHERE committee_id = ? AND year = ?").bind(scope.id, year).first<{ image_key: string; image_alt: string }>();
  if (old) {
    await db.prepare("UPDATE group_photos SET image_key = ?, image_alt = ? WHERE committee_id = ? AND year = ?").bind(up.key, form.has("alt") ? alt : old.image_alt, scope.id, year).run();
    // Ny bild = nya positioner, så punkterna för året nollställs.
    if (scope.id !== BOARD_GROUP && old.image_key !== up.key) {
      await db.prepare("UPDATE committee_members SET marker_x = NULL, marker_y = NULL WHERE committee_id = ? AND year = ?").bind(scope.id, year).run();
    }
    if (old.image_key !== up.key) await purgeIfUnused(c.env, old.image_key);
  } else {
    await db.prepare("INSERT INTO group_photos (committee_id, year, image_key, image_alt) VALUES (?, ?, ?, ?)").bind(scope.id, year, up.key, alt).run();
  }
  await audit(c.env, session, old ? "bytte gruppbild för" : "lade till gruppbild för", scope.id === BOARD_GROUP ? "styrelsen" : "utskott", scope.id || null, `${scope.label} ${year}`);
  return backTo(scope, `klart=${old ? "sparat" : "skapat"}`, anchor);
}

/** POST /admin/gruppbild/:scope/andra – spara beskrivning och punkter, eller ta bort bilden. */
export async function groupPhotoChange(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const scope = await scopeOf(db, c.params.scope ?? "");
  if (!scope) return redirect("/admin", 303);
  const anchor = scope.id === BOARD_GROUP ? "gruppbilder" : "lagbild";
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return backTo(scope, "fel=csrf", anchor);
  const year = String(form.get("ar") ?? "");
  const photo = await db.prepare("SELECT image_key FROM group_photos WHERE committee_id = ? AND year = ?").bind(scope.id, year).first<{ image_key: string }>();
  if (!photo) return backTo(scope, "fel=hittades-inte", anchor);

  if (form.get("gora") === "ta-bort") {
    const stmts = [db.prepare("DELETE FROM group_photos WHERE committee_id = ? AND year = ?").bind(scope.id, year)];
    if (scope.id !== BOARD_GROUP) stmts.push(db.prepare("UPDATE committee_members SET marker_x = NULL, marker_y = NULL WHERE committee_id = ? AND year = ?").bind(scope.id, year));
    await db.batch(stmts);
    await purgeIfUnused(c.env, photo.image_key);
    await audit(c.env, session, "tog bort gruppbild för", scope.id === BOARD_GROUP ? "styrelsen" : "utskott", scope.id || null, `${scope.label} ${year}`);
    return backTo(scope, "klart=raderat", anchor);
  }

  const alt = String(form.get("alt") ?? "").replace(/\s+/g, " ").trim().slice(0, ALT_MAX);
  const stmts: D1PreparedStatement[] = [db.prepare("UPDATE group_photos SET image_alt = ? WHERE committee_id = ? AND year = ?").bind(alt, scope.id, year)];
  if (scope.id !== BOARD_GROUP) {
    const { results } = await db.prepare("SELECT id FROM committee_members WHERE committee_id = ? AND year = ?").bind(scope.id, year).all<{ id: number }>();
    for (const { id } of results) {
      if (!form.has(`x_${id}`)) continue;
      const x = markerValue(form.get(`x_${id}`));
      const y = markerValue(form.get(`y_${id}`));
      // Bara hela par sparas – en ensam koordinat räknas som att punkten är borttagen.
      stmts.push(db.prepare("UPDATE committee_members SET marker_x = ?, marker_y = ? WHERE id = ?").bind(x != null && y != null ? x : null, x != null && y != null ? y : null, id));
    }
  }
  await db.batch(stmts);
  await audit(c.env, session, "ändrade gruppbilden för", scope.id === BOARD_GROUP ? "styrelsen" : "utskott", scope.id || null, `${scope.label} ${year}`);
  return backTo(scope, "klart=sparat", anchor);
}

/**
 * POST /admin/behall/:scope – "Behåll från i år": de markerade personerna från året som visas läggs in för nästa år
 * (namn, roll, program, citat och foto). Den som redan finns för nästa år (samma namn) hoppas över.
 */
export async function keepForNextYear(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const scope = await scopeOf(db, c.params.scope ?? "");
  if (!scope) return redirect("/admin", 303);
  const anchor = scope.id === BOARD_GROUP ? "nasta-ar" : "medlemmar";
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return backTo(scope, "fel=csrf", anchor);
  const year = await currentServiceYear(db);
  const coming = nextYear(year);
  const ids = form.getAll("id").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return backTo(scope, "fel=inga-valda", anchor);
  const marks = ids.map(() => "?").join(",");
  const norm = (n: string) => n.trim().toLocaleLowerCase("sv");

  const stmts: D1PreparedStatement[] = [];
  if (scope.id === BOARD_GROUP) {
    const { results: chosen } = await db.prepare(`SELECT * FROM board_members WHERE id IN (${marks}) AND (year = ? OR year = '') ORDER BY sort_order, name`).bind(...ids, year).all<Record<string, unknown>>();
    const { results: existing } = await db.prepare("SELECT name, sort_order FROM board_members WHERE year = ?").bind(coming).all<{ name: string; sort_order: number }>();
    const have = new Set(existing.map((r) => norm(r.name)));
    let order = existing.reduce((m, r) => Math.max(m, r.sort_order), 0);
    for (const r of chosen) {
      if (have.has(norm(String(r.name)))) continue;
      order += 10;
      stmts.push(
        db.prepare("INSERT INTO board_members (name, role, email, photo_key, sort_order, published, year) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(r.name, r.role, r.email ?? null, r.photo_key ?? null, order, r.published ?? 1, coming),
      );
    }
  } else {
    const { results: chosen } = await db.prepare(`SELECT * FROM committee_members WHERE id IN (${marks}) AND committee_id = ? AND year = ? ORDER BY sort_order, id`).bind(...ids, scope.id, year).all<Record<string, unknown>>();
    const { results: existing } = await db.prepare("SELECT name, sort_order FROM committee_members WHERE committee_id = ? AND year = ?").bind(scope.id, coming).all<{ name: string; sort_order: number }>();
    const have = new Set(existing.map((r) => norm(r.name)));
    let order = existing.reduce((m, r) => Math.max(m, r.sort_order), 0);
    for (const r of chosen) {
      if (have.has(norm(String(r.name)))) continue;
      order += 10;
      stmts.push(
        db
          .prepare("INSERT INTO committee_members (committee_id, year, name, role, program, quote, photo_key, sort_order, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(scope.id, coming, r.name, r.role ?? "", r.program ?? "", r.quote ?? "", r.photo_key ?? null, order, r.published ?? 1),
      );
    }
  }
  if (stmts.length) await db.batch(stmts);
  await audit(c.env, session, "behöll till nästa år i", scope.id === BOARD_GROUP ? "styrelsen" : "utskott", scope.id || null, `${scope.label}: ${stmts.length} till ${coming}`);
  return backTo(scope, `klart=behallna&antal=${stmts.length}`, anchor);
}

/** Rutan "Behåll från i år" (en lista med kryssrutor). Tom sträng när det inte finns någon att behålla. */
export function keepForm(
  session: Session,
  scopeSlug: string,
  year: string,
  people: { id: number; name: string; role: string }[],
  alreadyNext: Set<string>,
): SafeHtml | string {
  if (!people.length) return "";
  const coming = nextYear(year);
  const norm = (n: string) => n.trim().toLocaleLowerCase("sv");
  const left = people.filter((p) => !alreadyNext.has(norm(p.name)));
  return html`<details class="keep">
    <summary>${icon("users", "icon icon-sm")}Behåll från ${year}${left.length < people.length ? ` (${people.length - left.length} redan inlagda)` : ""}</summary>
    ${left.length
      ? html`<form class="keep-form" method="post" action="/admin/behall/${scopeSlug}">
          ${csrfField(session)}
          <p class="field-help">Kryssa i dem som sitter kvar ${coming}. De läggs in för ${coming} med samma roll och foto – ändra det som är nytt efteråt.</p>
          <ul class="keep-list">
            ${left.map(
              (p) => html`<li><label class="keep-person"><input type="checkbox" name="id" value="${p.id}"><span>${p.name}${p.role ? html` <span class="muted">· ${p.role}</span>` : ""}</span></label></li>`,
            )}
          </ul>
          <button class="btn btn-outline btn-sm" type="submit">Lägg in de markerade för ${coming}</button>
        </form>`
      : html`<p class="field-help">Alla från ${year} är redan inlagda för ${coming}.</p>`}
  </details>`;
}
