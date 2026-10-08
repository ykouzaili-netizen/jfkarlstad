import { html, raw, type SafeHtml } from "../lib/html.js";
import { textResponse } from "../lib/http.js";
import type { Values } from "../lib/forms.js";
import { METALS, RIBBON_COLORS, medalLook, medalSvg, ribbonBarSvg } from "../lib/medals.js";
import type { RequestContext } from "../router.js";

/**
 * Adminpanelens delar för belöningssystemet: valen i formuläret (med små bilder), förhandsvisningen av
 * den ritade medaljen som följer valen och listan med medaljer att välja bland för en utmärkelse.
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

/** Liten bild bredvid ett val i formuläret: medaljens form, metallen, bandets mönster eller en färg. */
export function medalChoiceArt(o: { motif?: string; metal?: string; ribbon_pattern?: string; color?: string }): SafeHtml {
  if (o.color) {
    const hex = RIBBON_COLORS[o.color as keyof typeof RIBBON_COLORS]?.hex ?? "#888888";
    return raw(`<svg class="choice-swatch" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${hex}" stroke="#000" stroke-opacity=".18"/></svg>`);
  }
  if (o.metal) {
    const m = METALS[o.metal as keyof typeof METALS] ?? METALS.guld;
    const id = `val-${o.metal}`;
    return raw(`<svg class="choice-swatch" viewBox="0 0 24 24"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".5" stop-color="${m.stops[1]}"/><stop offset="1" stop-color="${m.stops[3]}"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#${id})"/></svg>`);
  }
  if (o.ribbon_pattern) {
    return html`<span class="choice-ribbon">${ribbonBarSvg(medalLook({ ribbon_pattern: o.ribbon_pattern, ribbon_1: "rod", ribbon_2: "vit", ribbon_3: "bla" }), `val-${o.ribbon_pattern}`)}</span>`;
  }
  return html`<span class="choice-medal">${medalSvg(medalLook({ motif: o.motif, metal: "brons", ribbon_1: "gul" }), `val-${o.motif}`)}</span>`;
}

const LOOK_FIELDS = ["motif", "metal", "ribbon_pattern", "ribbon_1", "ribbon_2", "ribbon_3"] as const;

/** Förhandsvisningen överst i formuläret. admin.js byter bilden när ett val ändras. */
export function medalFormPreview(values: Values): SafeHtml {
  const q = new URLSearchParams(LOOK_FIELDS.map((k) => [k, values[k] ?? ""])).toString();
  return html`<div class="admin-card medal-preview" data-medal-preview>
    <img class="medal-preview-img" src="/admin/medaljer-bild?${q}" alt="Förhandsvisning av den ritade medaljen" width="160" height="260" data-medal-preview-img>
    <div class="medal-preview-text">
      <p class="medal-preview-title">Så här ritas den på webbplatsen</p>
      <p class="field-help">Bilden ändras direkt när du väljer motiv, metall och band nedan.${values.image_key ? " Eftersom det finns ett foto på den riktiga medaljen visas fotot på webbplatsen i stället." : ""}</p>
    </div>
  </div>`;
}

/** GET /admin/medaljer-bild?motif=…&metal=… → den ritade medaljen som SVG (bara för inloggade). */
export async function medalPreviewHandler(c: RequestContext): Promise<Response> {
  const p = c.url.searchParams;
  const look = medalLook(Object.fromEntries(LOOK_FIELDS.map((k) => [k, p.get(k)])));
  return textResponse(String(medalSvg(look, "f")), "image/svg+xml; charset=utf-8", "private, max-age=600");
}
