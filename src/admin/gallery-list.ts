import { html, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { GALLERY_ALBUMS, GALLERY_ORDER, type GalleryRow } from "../lib/content.js";
import { MONTHS_SHORT, formatDateTimeShort, parseLocal } from "../lib/format.js";
import { slugify } from "../lib/slug.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount, postButton } from "./layout.js";
import { resourceTabs } from "./resources.js";
import { galleryYearsAction } from "./gallery-years.js";

/**
 * Bildgalleri i adminpanelen (ersätter den generiska listan för galleri).
 *
 * - Kategorier: ett album i taget (eller alla), med antal bilder.
 * - Sortering: "Som på webbplatsen" (där man också kan dra bilderna i ny ordning inom ett album och år),
 *   eller efter fotodatum / när bilden lades till, för att hitta en bild snabbt. Sorteringen i adminpanelen
 *   ändrar inte webbplatsen – det gör bara dra och släpp (eller pilarna) i vyn "Som på webbplatsen".
 * - Återställ: tar bort den egna ordningen i ett album och år (eller i alla), så att bilderna åter visas
 *   efter fotodatum (se GALLERY_IMAGE_ORDER i content.ts).
 * - Läs fotodatum ur bilderna: för bilder som laddades upp innan fotodatumet lästes vid uppladdningen.
 *   Webbläsaren läser början av varje originalbild och skickar datumen hit (POST /admin/galleri/fotodatum).
 */

type Row = GalleryRow;

export const SORTS = {
  webbplats: "Som på webbplatsen",
  "foto-nyast": "Fotograferad – nyast först",
  "foto-aldst": "Fotograferad – äldst först",
  "tillagd-nyast": "Tillagd – senast först",
  "tillagd-aldst": "Tillagd – först tillagd först",
} as const;
type Sort = keyof typeof SORTS;

const TAKEN_RE = /^(19[89]\d|20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

/** "12 okt 2026 19:42" (kamerans lokala tid). */
function shortLocal(local: string | null): string {
  const p = parseLocal(local);
  if (!p) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

const titleOf = (r: Row) => r.alt || r.caption || `Bild utan beskrivning (${r.album})`;
const n = (count: number) => (count === 1 ? "1 bild" : `${count} bilder`);

/** Adressen till listan med samma kategori och sortering. */
function listHref(album: string | null, sort: Sort): string {
  const q = new URLSearchParams();
  if (album) q.set("kategori", slugify(album));
  if (sort !== "webbplats") q.set("sortera", sort);
  const s = q.toString();
  return `/admin/galleri${s ? `?${s}` : ""}`;
}

function sortRows(rows: Row[], sort: Sort): Row[] {
  if (sort === "webbplats") return rows;
  const out = [...rows];
  const byAdded = (a: Row, b: Row) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);
  if (sort === "tillagd-nyast") out.sort((a, b) => byAdded(b, a));
  else if (sort === "tillagd-aldst") out.sort(byAdded);
  else {
    const dir = sort === "foto-nyast" ? -1 : 1;
    // Bilder utan fotodatum hamnar alltid sist (senast tillagd först), oavsett riktning.
    out.sort((a, b) => {
      if (!a.taken_at !== !b.taken_at) return a.taken_at ? -1 : 1;
      if (!a.taken_at) return byAdded(b, a);
      return a.taken_at === b.taken_at ? byAdded(b, a) : a.taken_at < b.taken_at! ? -dir : dir;
    });
  }
  return out;
}

export async function galleryListPage(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const { results: all } = await db.prepare(`SELECT * FROM gallery_images ORDER BY ${GALLERY_ORDER}`).all<Row>();
  const params = c.url.searchParams;
  const sort: Sort = (Object.keys(SORTS) as Sort[]).find((k) => k === params.get("sortera")) ?? "webbplats";
  const albums = [...GALLERY_ALBUMS, ...[...new Set(all.map((r) => r.album))].filter((a) => !GALLERY_ALBUMS.includes(a))];
  const album = albums.find((a) => slugify(a) === params.get("kategori")) ?? null;
  const rows = album ? all.filter((r) => r.album === album) : all;
  const moved = Number(params.get("flyttad")) || 0;
  const movedDir = params.get("riktning") === "upp" ? "upp" : "ned";
  const unread = all.filter((r) => !r.taken_at && !r.exif_checked);
  const withDate = rows.filter((r) => r.taken_at).length;

  // ── Verktygsraden: kategorier och sortering ──
  const chip = (a: string | null, label: string, count: number) =>
    html`<li><a href="${listHref(a, sort)}"${a === album ? html` aria-current="page"` : ""}>${label} <span class="gl-count">${count}</span></a></li>`;
  const toolbar = html`<div class="gl-toolbar">
    <nav class="tabs tabs-compact gl-cats" aria-label="Kategori">
      <ul>
        ${chip(null, "Alla", all.length)}
        ${albums.map((a) => chip(a, a, all.filter((r) => r.album === a).length))}
      </ul>
    </nav>
    <form class="inline-filter gl-sort" method="get" action="/admin/galleri">
      ${album ? html`<input type="hidden" name="kategori" value="${slugify(album)}">` : ""}
      <label for="gl-sortera">Sortera</label>
      <select id="gl-sortera" name="sortera" data-autosubmit>
        ${(Object.entries(SORTS) as [Sort, string][]).map(([k, label]) => html`<option value="${k}"${k === sort ? html` selected` : ""}>${label}</option>`)}
      </select>
      <noscript><button class="btn btn-outline btn-sm" type="submit">Visa</button></noscript>
    </form>
  </div>`;

  // ── Äldre bilder som aldrig har lästs ──
  const backfill = unread.length
    ? html`<div class="admin-card gl-exif" data-exif-backfill data-csrf="${session.csrf}">
        <div class="gl-exif-text">
          <p><strong>${unread.length === 1 ? "1 bild" : `${unread.length} bilder`} har inget fotodatum ännu.</strong>
          De laddades upp innan datumet lästes automatiskt. Låt sajten leta efter datumet i själva bildfilerna – det tar en liten stund och ändrar inget annat.</p>
          <p class="field-help" data-exif-status role="status">Bilder som komprimerades vid uppladdningen har ofta förlorat datumet – de sorteras då efter när de laddades upp, och du kan skriva in datumet själv under Redigera.</p>
          <noscript><p class="field-help">Det här kräver JavaScript i webbläsaren.</p></noscript>
        </div>
        <button class="btn btn-primary" type="button" data-exif-start hidden>${icon("calendar", "icon icon-sm")}Läs fotodatum ur bilderna</button>
        <ul hidden>${unread.map((r) => html`<li data-exif-id="${r.id}" data-exif-src="${mediaUrl(r.image_key) ?? ""}"></li>`)}</ul>
      </div>`
    : "";

  // ── En rad i listan ──
  const dateCells = (r: Row) => html`
    <td data-label="Fotograferad">${r.taken_at ? html`<time datetime="${r.taken_at}">${shortLocal(r.taken_at)}</time>` : html`<span class="muted">Okänt</span>`}</td>
    <td data-label="Tillagd"><time datetime="${r.created_at.replace(" ", "T")}Z">${formatDateTimeShort(r.created_at)}</time></td>`;
  const actions = (r: Row) => html`<td class="col-actions"><div class="row-actions">
      <a class="btn btn-outline btn-sm" href="/admin/galleri/${r.id}">Redigera</a>
      ${postButton(session, `/admin/galleri/${r.id}/radera`, "Ta bort", { confirm: `Vill du ta bort ”${titleOf(r)}”? Bilden raderas helt och det går inte att ångra.`, className: "btn btn-danger-ghost btn-sm" })}
    </div></td>`;
  const thumbCell = (r: Row) => html`<td class="col-thumb"><a href="/admin/galleri/${r.id}" tabindex="-1" aria-hidden="true"><img class="thumb gl-thumb" src="${mediaUrl(r.image_key, "sm") ?? ""}" alt="" width="72" height="54" loading="lazy" decoding="async"></a></td>`;
  const titleCell = (r: Row, extra?: SafeHtml) => html`<td data-label="Beskrivning"><a class="row-title" href="/admin/galleri/${r.id}">${titleOf(r)}</a>${extra ?? ""}</td>`;
  const moveCell = (r: Row, pos: number, count: number) => {
    const btn = (dir: "upp" | "ned", disabled: boolean) => html`<form class="inline-form" method="post" action="/admin/galleri/${r.id}/flytta">
        ${csrfField(session)}<input type="hidden" name="riktning" value="${dir}">${album ? html`<input type="hidden" name="tillbaka" value="${listHref(album, "webbplats")}">` : ""}
        <button class="btn btn-outline btn-sm btn-move" type="submit" aria-label="Flytta ${dir} ${titleOf(r)}" title="Flytta ${dir}"${disabled ? html` disabled` : ""}${!disabled && moved === r.id && movedDir === dir ? html` autofocus` : ""}>${icon(dir === "upp" ? "arrowUp" : "arrowDown", "icon icon-sm")}</button>
      </form>`;
    return html`<td class="col-move"><div class="move-buttons"><button class="btn btn-outline btn-sm btn-move drag-handle" type="button" data-sort-handle hidden aria-label="Dra för att flytta ${titleOf(r)} (eller använd piltangenterna)" title="Dra för att flytta">${icon("grip", "icon icon-sm")}</button>${btn("upp", pos === 0)}${btn("ned", pos === count - 1)}</div></td>`;
  };
  const head = (move: boolean, withAlbum: boolean) => html`<thead><tr>
      ${move ? html`<th scope="col" class="col-move">Ordning</th>` : ""}
      <th scope="col" class="col-thumb"><span class="sr-only">Bild</span></th>
      <th scope="col">Beskrivning</th>
      ${withAlbum ? html`<th scope="col">Kategori</th><th scope="col">År</th>` : ""}
      <th scope="col">Fotograferad</th>
      <th scope="col">Tillagd</th>
      <th scope="col" class="col-actions"><span class="sr-only">Åtgärder</span></th>
    </tr></thead>`;

  let body: SafeHtml;
  if (!all.length) {
    body = html`<div class="admin-empty"><p>Inga bilder ännu. Ladda upp bilder så visas de här, sorterade efter när de togs.</p><a class="btn btn-primary" href="/admin/galleri/ny">+ Ladda upp bilder</a></div>`;
  } else if (!rows.length) {
    body = html`<div class="admin-empty"><p>Det finns inga bilder i kategorin ${album} ännu.</p><a class="btn btn-primary" href="/admin/galleri/ny?kategori=${slugify(album ?? "")}">+ Ladda upp bilder till ${album}</a></div>`;
  } else if (sort === "webbplats") {
    // Ett kort per album och år, i samma ordning som på webbplatsen. Raderna kan dras inom kortet.
    const groups: { album: string; year: number | null; rows: Row[] }[] = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && last.album === r.album && last.year === r.year) last.rows.push(r);
      else groups.push({ album: r.album, year: r.year, rows: [r] });
    }
    const anyCustom = groups.some((g) => g.rows.some((r) => r.sort_order > 0));
    body = html`
      <p class="gl-explain">
        ${icon("grip", "icon icon-sm")}
        <span>Bilderna visas i den här ordningen på webbplatsen: <strong>nyast fotograferad först</strong>, sedan bilder utan fotodatum (senast uppladdad först).
        Dra en bild i handtaget för att flytta den – då får det albumet en egen ordning. Med <em>Återställ</em> går albumet tillbaka till datumordning.</span>
      </p>
      ${groups.map((g) => {
        const custom = g.rows.some((r) => r.sort_order > 0);
        const fresh = custom ? g.rows.filter((r) => r.sort_order === 0).length : 0;
        const yearLabel = g.year == null ? "Utan årtal" : String(g.year);
        const resetForm = postButton(session, "/admin/galleri/aterstall", "Återställ till datumordning", {
          confirm: `Vill du återställa ordningen i ${g.album} ${yearLabel}? Bilderna visas då efter när de fotograferades, och den ordning du har dragit fram försvinner.`,
          className: "btn btn-outline btn-sm",
          hidden: { album: g.album, year: g.year == null ? "" : String(g.year), tillbaka: listHref(album, sort) },
        });
        return html`<section class="admin-card admin-card-flush gl-group" data-gl-group aria-labelledby="gl-${slugify(g.album)}-${yearLabel}">
          <header class="gl-group-head">
            <div>
              <h2 class="gl-group-title" id="gl-${slugify(g.album)}-${yearLabel}">${g.album} <span class="gl-year">${yearLabel}</span></h2>
              <p class="gl-group-meta">${n(g.rows.length)} ·
                <span class="pill ${custom ? "pill-plan" : "pill-on"}" data-gl-mode>${custom ? "Egen ordning" : "Efter fotodatum"}</span>
                ${fresh ? html`<span class="gl-fresh">${fresh === 1 ? "1 ny bild ligger sist" : `${fresh} nya bilder ligger sist`} – dra dit du vill ha ${fresh === 1 ? "den" : "dem"}.</span>` : ""}
              </p>
            </div>
            <div class="gl-reset" data-gl-reset${custom ? "" : html` hidden`}>${resetForm}</div>
          </header>
          <table class="admin-table gl-table">
            ${head(true, false)}
            <tbody data-sortable data-sort-url="/admin/galleri/ordning" data-csrf="${session.csrf}">
              ${g.rows.map(
                (r, i) => html`<tr id="rad-${r.id}"${moved === r.id ? html` class="is-moved"` : ""} data-sort-id="${r.id}" data-sort-group="${r.album}|${r.year ?? ""}">
                  ${moveCell(r, i, g.rows.length)}${thumbCell(r)}${titleCell(r)}${dateCells(r)}${actions(r)}
                </tr>`,
              )}
            </tbody>
          </table>
        </section>`;
      })}
      ${anyCustom && groups.length > 1
        ? html`<div class="gl-reset-all">${postButton(session, "/admin/galleri/aterstall", album ? `Återställ alla album i ${album}` : "Återställ ordningen i alla album", {
            confirm: album
              ? `Vill du återställa ordningen för alla år i ${album}? Bilderna visas då efter när de fotograferades.`
              : "Vill du återställa ordningen i hela bildgalleriet? Alla bilder visas då efter när de fotograferades, och all egen ordning försvinner.",
            className: "btn btn-danger-ghost btn-sm",
            hidden: { alla: "1", album: album ?? "", tillbaka: listHref(album, sort) },
          })}</div>`
        : ""}`;
  } else {
    const sorted = sortRows(rows, sort);
    const missing = sorted.length - withDate;
    body = html`
      <p class="gl-explain">
        ${icon("search", "icon icon-sm")}
        <span>Sorteringen gäller bara listan här, för att hitta bilder lättare. ${sort.startsWith("foto") && missing ? html`${n(missing)} utan fotodatum ligger sist. ` : ""}
        Ordningen på webbplatsen ändrar du under <a href="${listHref(album, "webbplats")}">Som på webbplatsen</a>.</span>
      </p>
      <div class="admin-card admin-card-flush">
        <table class="admin-table gl-table">
          ${head(false, true)}
          <tbody>
            ${sorted.map(
              (r) => html`<tr id="rad-${r.id}">
                ${thumbCell(r)}${titleCell(r)}
                <td data-label="Kategori">${r.album}</td>
                <td data-label="År">${r.year ?? "–"}</td>
                ${dateCells(r)}${actions(r)}
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`;
  }

  const content = html`
    ${adminHead("Bildgalleri", {
      lead: "Bilderna visas under För studenter, en kategori i taget. Publicera inga bilder som kan uppfattas som kränkande, och ta bort en bild direkt om någon som syns på den ber om det (GDPR).",
      actions: html`${galleryYearsAction}<a class="btn btn-primary" href="/admin/galleri/ny${album ? `?kategori=${slugify(album)}` : ""}">+ Ladda upp bilder</a>`,
    })}
    ${resourceTabs([{ href: "/admin/galleri", label: "Bilder" }, { href: "/admin/filmer", label: "Filmer" }], "/admin/galleri")}
    ${all.length ? toolbar : ""}
    ${backfill}
    ${body}`;
  return adminLayout(c, session, { title: "Bildgalleri", active: "/admin/galleri", newCount: await newMessageCount(db), wide: true }, content);
}

/** Tillbaka till listan med samma kategori och sortering (bara adresser inom /admin/galleri). */
function backTo(form: FormData, code: string): string {
  const raw = String(form.get("tillbaka") ?? "");
  const base = /^\/admin\/galleri(\?[a-z0-9=&%_-]*)?$/i.test(raw) ? raw : "/admin/galleri";
  return `${base}${base.includes("?") ? "&" : "?"}klart=${code}`;
}

/** Återställ: tar bort den egna ordningen i ett album och år, i alla år i ett album, eller i hela galleriet. */
export async function galleryResetSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/galleri?fel=csrf", 303);
  const db = c.env.DB;
  const album = String(form.get("album") ?? "");
  const everything = form.get("alla") === "1";
  let what: string;
  if (everything && !album) {
    await db.prepare("UPDATE gallery_images SET sort_order = 0 WHERE sort_order <> 0").run();
    what = "hela bildgalleriet";
  } else if (everything) {
    await db.prepare("UPDATE gallery_images SET sort_order = 0 WHERE album = ?").bind(album).run();
    what = album;
  } else {
    const raw = String(form.get("year") ?? "");
    const year = raw === "" ? null : Number(raw);
    if (!album || (year !== null && !Number.isInteger(year))) return redirect(backTo(form, "ordning-fel"), 303);
    await db.prepare(year === null ? "UPDATE gallery_images SET sort_order = 0 WHERE album = ? AND year IS NULL" : "UPDATE gallery_images SET sort_order = 0 WHERE album = ? AND year = ?")
      .bind(...(year === null ? [album] : [album, year]))
      .run();
    what = `${album} ${year ?? "utan årtal"}`;
  }
  await audit(c.env, session, "återställde ordningen i", "bildgalleri", null, what);
  return redirect(backTo(form, "ordning-aterstalld"), 303);
}

/**
 * Fotodatum för äldre bilder, lästa ur bildfilerna i webbläsaren (admin.js). Tar emot `id` och `tagen` i par
 * (tagen = "YYYY-MM-DDTHH:MM" eller tomt om bilden saknar datum). Bara bilder som saknar datum och inte har
 * lästs förut ändras – ett datum som någon har skrivit in skrivs aldrig över.
 */
export async function galleryExifSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return new Response("Sessionen har gått ut. Ladda om sidan.", { status: 403 });
  const ids = form.getAll("id").map((v) => Number(v));
  const dates = form.getAll("tagen").map((v) => String(v));
  if (ids.length !== dates.length || ids.length > 50) return new Response("Fel format.", { status: 400 });
  const db = c.env.DB;
  const stmts = [];
  let found = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (!Number.isInteger(id) || id <= 0) continue;
    const date = TAKEN_RE.test(dates[i]!) ? dates[i]! : null;
    if (date) found++;
    stmts.push(db.prepare("UPDATE gallery_images SET taken_at = COALESCE(taken_at, ?), exif_checked = 1 WHERE id = ? AND exif_checked = 0").bind(date, id));
  }
  if (stmts.length) await db.batch(stmts);
  if (found) await audit(c.env, session, "läste fotodatum för", "bildgalleri", null, `${found} av ${stmts.length} bilder`);
  return new Response(JSON.stringify({ ok: true, found }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
