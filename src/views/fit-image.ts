/**
 * Bilder i nyheter och evenemang som får plats utan att kapas (beställt 2026-11-02, "Automatiskt").
 *
 * - I kort och i kalendern har rutan en fast form (16:10 på nyhetskorten, kvadrat i kalendern). En bild som har
 *   ungefär rutans form fyller den. En bild med en helt annan form (en stående affisch, en bred banner) visas hel,
 *   och tomrummet runt den fylls med samma bild, suddig och mörkare (.fit-bg).
 * - På nyhetens och evenemangets egen sida visas bilden i sin egen form och beskärs aldrig. En stående bild visas
 *   som ett affischark på en suddig bakgrund.
 * - Styrelsen kan ändå bestämma själv per bild under Bildbank → Justera ("Fyll rutan" med fokuspunkt och zoom, eller
 *   "Visa hela bilden"); det valet går alltid före (imagefit.ts).
 *
 * Bildens mått kommer från bildbanken (media.width/height, se content.ts). Saknas de (äldre bilder) avgör site.js
 * formen när bilden har laddats (data-fit-auto / data-fit-natural); utan JavaScript fyller bilden då rutan som förut.
 */
import { html, type SafeHtml } from "../lib/html.js";
import { imageFits, type Settings } from "../lib/settings.js";
import { mediaUrl, picture } from "./layout.js";

/** Hur mycket formen får skilja innan bilden visas hel: 1,25 = en fjärdedel. Ett mobilfoto (4:3) fyller ett nyhetskort (16:10). */
export const FIT_TOLERANCE = 1.25;

export interface Dims {
  w?: number | null;
  h?: number | null;
}

function ratioOf(d: Dims): number | null {
  return d.w && d.h && d.w > 0 && d.h > 0 ? d.w / d.h : null;
}

/** Passar bildens form i rutan? null = vet inte (måtten saknas). */
export function fitsBox(d: Dims, box: number): boolean | null {
  const r = ratioOf(d);
  if (r === null) return null;
  const diff = r > box ? r / box : box / r;
  return diff < FIT_TOLERANCE;
}

/**
 * Bild i en ruta med fast form (kortet sätter formen, t.ex. .news-media med aspect-ratio 16/10).
 * `box` = rutans bredd/höjd, används för att avgöra om bilden ska fylla rutan eller visas hel.
 */
export function boxImage(
  s: Settings,
  key: string,
  opts: { alt: string; sizes: string; box: number; dims: Dims; width: number; height: number; eager?: boolean },
): SafeHtml {
  const own = imageFits(s).get(key);
  const fits = fitsBox(opts.dims, opts.box);
  // Styrelsens eget val går före. Annars: hel bild när formen inte passar, och okänt läge avgörs i webbläsaren.
  const whole = own ? own.fit === "hela" : fits === false;
  const unknown = !own && fits === null;
  const bg = mediaUrl(key, "sm");
  return html`<span class="fit-box${whole ? " is-whole" : ""}"${unknown ? html` data-fit-auto="${String(opts.box)}"` : ""}>
    ${whole || unknown ? html`<img class="fit-bg" src="${bg}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ""}
    ${picture(key, { alt: opts.alt, sizes: opts.sizes, className: "fit-img", width: opts.width, height: opts.height, eager: opts.eager })}
  </span>`;
}

/**
 * Bilden överst på nyhetens och evenemangets sida: i sin egen form, aldrig beskuren. Har styrelsen valt "Fyll rutan"
 * under Bildbank → Justera behålls den breda rutan (16:9) med deras fokuspunkt, precis som förut.
 */
export function articleImage(s: Settings, key: string, opts: { alt: string; sizes: string; dims: Dims }): SafeHtml {
  const own = imageFits(s).get(key);
  if (own && own.fit === "fyll") {
    return picture(key, { alt: opts.alt, className: "article-image", sizes: opts.sizes, width: 1200, height: 675, eager: true });
  }
  const r = ratioOf(opts.dims);
  const w = r ? opts.dims.w! : 1200;
  const h = r ? opts.dims.h! : 675;
  // Stående (eller nästan kvadratisk) bild: ett ark på suddig bakgrund i stället för en jättebild som fyller hela skärmen.
  const sheet = r !== null && r < 1.1;
  return html`<figure class="article-figure${sheet ? " is-sheet" : ""}"${r === null ? html` data-fit-natural` : ""}>
    ${sheet || r === null ? html`<img class="fit-bg" src="${mediaUrl(key, "sm")}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ""}
    ${picture(key, { alt: opts.alt, className: "article-figure-img", sizes: opts.sizes, width: w, height: h, eager: true })}
  </figure>`;
}
