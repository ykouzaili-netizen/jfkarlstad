import { html, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { GALLERY_ALBUMS } from "../lib/content.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";

/**
 * Bildgalleri → Sätt år på flera bilder. Bilderna visas per album och år (de utan år först), man bockar i
 * de som hör ihop och anger ett år – så slipper man öppna bild för bild efter en stor uppladdning.
 */

interface Row {
  id: number;
  album: string;
  year: number | null;
  image_key: string;
  alt: string;
  caption: string;
}

export async function galleryYearsPage(c: RequestContext, session: Session): Promise<Response> {
  const { results } = await c.env.DB.prepare("SELECT id, album, year, image_key, alt, caption FROM gallery_images ORDER BY album, year IS NOT NULL, year DESC, sort_order, id DESC").all<Row>();
  const albums = [...new Set([...GALLERY_ALBUMS, ...results.map((r) => r.album)])].filter((a) => results.some((r) => r.album === a));
  const missing = results.filter((r) => r.year == null).length;
  const content = html`
    ${adminHead("Sätt år på flera bilder", {
      back: { href: "/admin/galleri", label: "Bildgalleri" },
      lead: "Bocka i bilderna som är från samma år, skriv året längst ned och spara. På webbplatsen kan besökarna sedan välja år inom varje album.",
    })}
    ${results.length
      ? html`<form class="admin-form gy" method="post" action="/admin/galleri/ar" data-dirty-check>
          ${csrfField(session)}
          ${missing ? html`<p class="gy-note"><strong>${missing === 1 ? "1 bild" : `${missing} bilder`} saknar år.</strong> De ligger först i varje album.</p>` : ""}
          ${albums.map((album) => {
            const rows = results.filter((r) => r.album === album);
            const groups = new Map<string, Row[]>();
            for (const r of rows) {
              const k = r.year == null ? "" : String(r.year);
              if (!groups.has(k)) groups.set(k, []);
              groups.get(k)!.push(r);
            }
            return html`<section class="admin-card gy-album">
              <h2 class="gy-album-title">${album} <span class="gy-count">${rows.length} ${rows.length === 1 ? "bild" : "bilder"}</span></h2>
              ${[...groups.entries()].map(
                ([year, imgs]) => html`<fieldset class="gy-group${year ? "" : " gy-group--missing"}">
                  <legend>${year || "Utan årtal"}</legend>
                  <label class="check-field check-small gy-all" hidden><input type="checkbox" data-gy-all><span>Markera alla ${imgs.length}</span></label>
                  <ul class="gy-grid">
                    ${imgs.map(
                      (r) => html`<li><label class="gy-item">
                        <input type="checkbox" name="id" value="${r.id}">
                        <img src="${mediaUrl(r.image_key, "sm") ?? ""}" alt="" loading="lazy" decoding="async" width="160" height="120">
                        <span class="sr-only">${r.alt || r.caption || `Bild ${r.id}`}</span>
                      </label></li>`,
                    )}
                  </ul>
                </fieldset>`,
              )}
            </section>`;
          })}
          <div class="gy-bar">
            <label class="gy-year"><span>År för de markerade bilderna</span>
              <input class="input" type="number" name="year" min="2000" max="2100" inputmode="numeric" placeholder="${new Date().getUTCFullYear()}"></label>
            <button class="btn btn-primary" type="submit">Spara år</button>
            <p class="field-help">Lämna året tomt för att ta bort det. <span data-gy-count></span></p>
          </div>
        </form>`
      : html`<div class="admin-card"><p>Inga bilder ännu. <a href="/admin/galleri/ny">Ladda upp bilder</a> först.</p></div>`}`;
  return adminLayout(c, session, { title: "Sätt år på flera bilder", active: "/admin/galleri", newCount: await newMessageCount(c.env.DB), wide: true }, content);
}

export async function galleryYearsSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/galleri/ar?fel=csrf", 303);
  const ids = [...new Set(form.getAll("id").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 2000);
  const raw = String(form.get("year") ?? "").trim();
  const year = raw === "" ? null : Number(raw);
  if (year !== null && !(Number.isInteger(year) && year >= 2000 && year <= 2100)) return redirect("/admin/galleri/ar?fel=ar-ogiltigt", 303);
  if (!ids.length) return redirect("/admin/galleri/ar?fel=ar-inga", 303);
  const db = c.env.DB;
  // D1 tillåter högst 100 parametrar per fråga – uppdatera i omgångar.
  const stmts = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    stmts.push(db.prepare(`UPDATE gallery_images SET year = ? WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(year, ...chunk));
  }
  await db.batch(stmts);
  await audit(c.env, session, "ändrade", "bild", null, `År ${year ?? "borttaget"} på ${ids.length} galleribilder`);
  return redirect("/admin/galleri/ar?klart=ar-satt", 303);
}

export const galleryYearsAction: SafeHtml = html`<a class="btn btn-outline" href="/admin/galleri/ar">Sätt år på flera bilder</a>`;
