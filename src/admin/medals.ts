import { html, type SafeHtml } from "../lib/html.js";
import type { Values } from "../lib/forms.js";
import { MEDAL_DESIGNS, medalImageUrl, type MedalDesign } from "../lib/medals.js";
import { mediaUrl } from "../views/layout.js";

/**
 * Adminpanelens delar för belöningssystemet: valet av medaljbild (med små bilder), förhandsvisningen överst i
 * formuläret och listan med medaljer att välja bland för en utmärkelse.
 */

/** Ordnar och medaljer att välja bland för en utmärkelse (även dolda, så att en mottagare kan läggas in i förväg). */
export async function medalOptions(db: D1Database): Promise<{ value: string; label: string }[]> {
  try {
    const { results } = await db.prepare("SELECT id, name, published FROM medals ORDER BY sort_order, id").all<{ id: number; name: string; published: number }>();
    return results.map((m) => ({ value: String(m.id), label: m.published ? m.name : `${m.name} (dold)` }));
  } catch {
    return [];
  }
}

/** Valet "Egen bild": medaljen får en uppladdad bild i stället för en av föreningens. */
export const CUSTOM_DESIGN = "egen";

/** Valen av medaljbild i formuläret, med bilden bredvid varje val, och sist Egen bild. */
// Sorterad uttryckligen: JavaScript lägger nyckeln "10" (ser ut som ett heltal) före "01"–"09".
export const DESIGN_OPTIONS = [
  ...(Object.entries(MEDAL_DESIGNS) as [MedalDesign, (typeof MEDAL_DESIGNS)[MedalDesign]][])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, d]) => ({
      value: value as string,
      label: d.label,
      art: html`<img class="choice-medal-img" src="${medalImageUrl(value)}" alt="" width="${d.width}" height="${d.height}" loading="lazy">`,
    })),
  { value: CUSTOM_DESIGN, label: "Egen bild – ladda upp", art: html`<span class="choice-medal-custom">+</span>` },
];

/** Förhandsvisningen överst i formuläret. admin.js byter bilden när ett annat val görs. */
export function medalFormPreview(values: Values): SafeHtml {
  const photo = values.image_key ? mediaUrl(values.image_key) : null;
  const custom = values.design === CUSTOM_DESIGN;
  const src = custom ? photo : medalImageUrl(values.design);
  return html`<div class="admin-card medal-preview" data-medal-preview>
    <img class="medal-preview-img" src="${src ?? ""}" alt="Förhandsvisning av medaljen" width="84" height="176" data-medal-preview-img data-photo="${photo ?? ""}"${src ? "" : html` hidden`}>
    <div class="medal-preview-text">
      <p class="medal-preview-title">Så här visas medaljen på webbplatsen</p>
      <p class="field-help">Bilden byts direkt när du väljer en annan nedan. Med Egen bild visas den bild du laddar upp.</p>
    </div>
  </div>`;
}
