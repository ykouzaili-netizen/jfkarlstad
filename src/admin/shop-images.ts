import { html, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { csrfField } from "./layout.js";
import { handleUpload, uploadHint, uploadInput } from "./uploads.js";

/**
 * Butik → produkt → Fler bilder: obegränsat antal bilder efter huvudbilden (tabellen shop_product_images).
 * Rutan ligger under produktens formulär. Flera bilder kan väljas på en gång – admin.js skickar dem en i taget till
 * samma adress (X-Bulk-Upload), precis som i bildgalleriet. Bilderna ligger kvar i bildbanken när de tas bort härifrån.
 */

const MAX_PHOTOS = 40;
const CAPTION_MAX = 160;

interface PhotoRow {
  id: number;
  image_key: string;
  caption: string;
  sort_order: number;
}

async function photos(db: D1Database, productId: number): Promise<PhotoRow[]> {
  try {
    return (await db.prepare("SELECT id, image_key, caption, sort_order FROM shop_product_images WHERE product_id = ? ORDER BY sort_order, id").bind(productId).all<PhotoRow>()).results;
  } catch {
    return [];
  }
}

/** Rutan på produktens redigeringssida. */
export async function shopPhotosPanel(db: D1Database, session: Session, product: { id: number; name: string; image_key: string | null }): Promise<SafeHtml> {
  const rows = await photos(db, product.id);
  const base = `/admin/butik/${product.id}/bilder`;
  const full = rows.length >= MAX_PHOTOS;
  return html`<section class="admin-card shop-photos" id="bilder" aria-labelledby="bilder-rubrik">
    <h2 class="shop-photos-title" id="bilder-rubrik">Fler bilder${rows.length ? html` <span class="muted">(${rows.length})</span>` : ""}</h2>
    <p class="field-help">Visas efter huvudbilden på produktens sida, i den här ordningen, och kan öppnas i helbild. T.ex. baksidan, en närbild på trycket eller en medlem som bär plagget (bara med samtycke).</p>
    ${rows.length
      ? html`<form method="post" action="${base}/andra">
          ${csrfField(session)}
          <button class="sr-only" type="submit" name="gora" value="spara" tabindex="-1" aria-hidden="true">Spara</button>
          <ol class="shop-photo-list">
            ${rows.map((r, i) => {
              const nr = i + 2; // huvudbilden är bild 1
              return html`<li class="shop-photo-row">
                <a class="shop-photo-thumb" href="${mediaUrl(r.image_key)}" target="_blank" rel="noopener"><img src="${mediaUrl(r.image_key, "sm")}" alt="" loading="lazy"><span class="sr-only">Öppna bild ${nr} i ny flik</span></a>
                <div class="shop-photo-fields">
                  <label class="field-label" for="bildtext-${r.id}">Bild ${nr} – bildtext <span class="optional">(valfritt)</span></label>
                  <input type="text" id="bildtext-${r.id}" name="bildtext_${r.id}" value="${r.caption}" maxlength="${CAPTION_MAX}" placeholder="T.ex. Baksidan med årtalet">
                  <div class="shop-photo-actions">
                    <button class="btn btn-outline btn-sm" type="submit" name="gora" value="upp:${r.id}"${i === 0 ? " disabled" : ""} aria-label="Flytta bild ${nr} tidigare">${icon("arrowUp", "icon icon-sm")}</button>
                    <button class="btn btn-outline btn-sm" type="submit" name="gora" value="ned:${r.id}"${i === rows.length - 1 ? " disabled" : ""} aria-label="Flytta bild ${nr} senare">${icon("arrowDown", "icon icon-sm")}</button>
                    <button class="btn btn-outline btn-sm" type="submit" name="gora" value="huvud:${r.id}">Gör till huvudbild</button>
                    <button class="btn btn-danger-ghost btn-sm" type="submit" name="gora" value="bort:${r.id}" data-confirm-click="Ta bort bild ${nr} från produkten? Den finns kvar i bildbanken.">Ta bort</button>
                  </div>
                </div>
              </li>`;
            })}
          </ol>
          <div class="admin-form-actions"><button class="btn btn-primary" type="submit" name="gora" value="spara">Spara bildtexterna</button></div>
        </form>`
      : html`<p class="shop-photos-empty">Inga fler bilder ännu.${product.image_key ? "" : " Tips: den första bilden du lägger till här visas som huvudbild tills du väljer en annan."}</p>`}
    ${full
      ? html`<p class="field-help">Produkten har ${MAX_PHOTOS} bilder, vilket är max. Ta bort någon för att lägga till fler.</p>`
      : html`<form class="shop-photo-add" method="post" action="${base}" enctype="multipart/form-data">
          ${csrfField(session)}
          <div class="field field-upload">
            <span class="field-label" id="falt-bild-etikett">Lägg till bilder</span>
            ${uploadInput({ id: "falt-bild", name: "bild", kind: "image", multiple: true, labelledBy: "falt-bild-etikett" })}
            <p class="field-help"><strong>Du kan välja flera bilder på en gång.</strong> ${uploadHint("image")}</p>
          </div>
          <div class="admin-form-actions"><button class="btn btn-primary" type="submit">${icon("image", "icon icon-sm")}Ladda upp</button></div>
        </form>`}
  </section>`;
}

async function productOf(db: D1Database, id: number): Promise<{ id: number; name: string; image_key: string | null; image_alt: string } | null> {
  return db.prepare("SELECT id, name, image_key, image_alt FROM shop_products WHERE id = ?").bind(id).first();
}

const back = (id: number, query: string) => redirect(`/admin/butik/${id}?${query}#bilder`, 303);

function isFile(v: unknown): v is File {
  return typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0;
}

async function addOne(c: RequestContext, session: Session, productId: number, form: FormData): Promise<boolean> {
  const db = c.env.DB;
  const n = (await db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), 0) AS top FROM shop_product_images WHERE product_id = ?").bind(productId).first<{ n: number; top: number }>()) ?? { n: 0, top: 0 };
  if (n.n >= MAX_PHOTOS) return false;
  const up = await handleUpload(c.env, form, "bild", "image", "butik", session.user.email);
  if (!up.ok || !up.key) return false;
  await db.prepare("INSERT INTO shop_product_images (product_id, image_key, caption, sort_order) VALUES (?, ?, '', ?)").bind(productId, up.key, n.top + 10).run();
  return true;
}

/** POST /admin/butik/:id/bilder – en bild (eller flera utan JS). Med JS kommer bilderna en i taget (X-Bulk-Upload). */
export async function shopPhotosAdd(c: RequestContext, session: Session): Promise<Response> {
  const id = Number(c.params.id);
  const bulk = c.req.headers.get("X-Bulk-Upload") === "1";
  const json = (ok: boolean) => new Response(JSON.stringify({ ok }), { status: ok ? 200 : 422, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return bulk ? json(false) : back(id, "fel=uppladdning");
  }
  if (!checkCsrf(c, session, form)) return bulk ? json(false) : back(id, "fel=csrf");
  const product = await productOf(c.env.DB, id);
  if (!product) return bulk ? json(false) : redirect("/admin/butik", 303);

  const files = form.getAll("bild").filter(isFile);
  let ok = 0;
  let failed = 0;
  if (files.length > 1) {
    // Utan JS: alla filer på en gång, utan de mindre versionerna (de görs senare under Bildbanken → Gör bilderna snabbare).
    for (const file of files) {
      const one = new FormData();
      one.append("bild", file);
      (await addOne(c, session, id, one)) ? ok++ : failed++;
    }
  } else {
    (await addOne(c, session, id, form)) ? ok++ : failed++;
  }
  if (ok) await audit(c.env, session, "lade till bilder på", "produkt", id, `${product.name} (${ok})`);
  if (bulk) return json(ok > 0 && failed === 0);
  if (!ok && files.length <= 1 && !String(form.get("bild__bank") ?? "")) return back(id, "fel=uppladdning");
  return back(id, `klart=${failed ? "flera-delvis" : "flera"}&antal=${ok}&misslyckade=${failed}`);
}

/** GET /admin/butik/:id/bilder – dit admin.js skickar besökaren efter att flera bilder laddats upp. */
export async function shopPhotosDone(c: RequestContext): Promise<Response> {
  const id = Number(c.params.id);
  const q = new URLSearchParams();
  for (const k of ["klart", "antal", "misslyckade"]) {
    const v = c.url.searchParams.get(k);
    if (v && /^[a-z0-9-]{1,20}$/.test(v)) q.set(k, v);
  }
  return back(id, q.toString());
}

/** POST /admin/butik/:id/bilder/andra – bildtexter sparas alltid, och en knapp kan flytta, ta bort eller göra till huvudbild. */
export async function shopPhotosChange(c: RequestContext, session: Session): Promise<Response> {
  const id = Number(c.params.id);
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return back(id, "fel=csrf");
  const db = c.env.DB;
  const product = await productOf(db, id);
  if (!product) return redirect("/admin/butik", 303);
  const rows = await photos(db, id);

  // Bildtexterna först, så att inget som skrivits försvinner när man klickar på en pil.
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const v = form.get(`bildtext_${r.id}`);
    if (v === null) continue;
    const caption = String(v).replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
    if (caption !== r.caption) {
      stmts.push(db.prepare("UPDATE shop_product_images SET caption = ? WHERE id = ?").bind(caption, r.id));
      r.caption = caption;
    }
  }

  const [action, rawId] = String(form.get("gora") ?? "spara").split(":");
  const target = rows.findIndex((r) => r.id === Number(rawId));
  let flash = "sparat";
  if ((action === "upp" || action === "ned") && target >= 0) {
    const swap = action === "upp" ? target - 1 : target + 1;
    if (swap >= 0 && swap < rows.length) {
      [rows[target], rows[swap]] = [rows[swap]!, rows[target]!];
      rows.forEach((r, i) => stmts.push(db.prepare("UPDATE shop_product_images SET sort_order = ? WHERE id = ?").bind((i + 1) * 10, r.id)));
    }
  } else if (action === "bort" && target >= 0) {
    stmts.push(db.prepare("DELETE FROM shop_product_images WHERE id = ? AND product_id = ?").bind(rows[target]!.id, id));
    flash = "raderat";
  } else if (action === "huvud" && target >= 0) {
    // Bilden blir huvudbild. Den gamla huvudbilden tar dess plats i listan (beskrivningen blir bildtext).
    const r = rows[target]!;
    stmts.push(db.prepare("UPDATE shop_products SET image_key = ?, image_alt = ?, updated_at = datetime('now') WHERE id = ?").bind(r.image_key, r.caption, id));
    stmts.push(
      product.image_key
        ? db.prepare("UPDATE shop_product_images SET image_key = ?, caption = ? WHERE id = ?").bind(product.image_key, product.image_alt.slice(0, CAPTION_MAX), r.id)
        : db.prepare("DELETE FROM shop_product_images WHERE id = ?").bind(r.id),
    );
    flash = "huvudbild";
  }
  if (stmts.length) await db.batch(stmts);
  await audit(c.env, session, "ändrade bilderna på", "produkt", id, product.name);
  return back(id, `klart=${flash}`);
}

/** När en produkt kopieras följer bilderna med. */
export async function copyShopPhotos(db: D1Database, fromId: number, toId: number): Promise<void> {
  await db
    .prepare("INSERT INTO shop_product_images (product_id, image_key, caption, sort_order) SELECT ?, image_key, caption, sort_order FROM shop_product_images WHERE product_id = ?")
    .bind(toId, fromId)
    .run()
    .catch(() => undefined);
}

/** När en produkt tas bort försvinner kopplingen till bilderna (bilderna ligger kvar i bildbanken). */
export async function deleteShopPhotos(db: D1Database, productId: number): Promise<void> {
  await db.prepare("DELETE FROM shop_product_images WHERE product_id = ?").bind(productId).run().catch(() => undefined);
}
