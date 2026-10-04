/**
 * Passform för uppladdade bilder: vilken del av bilden som ska synas (fokuspunkt), hur inzoomad den är
 * och om den fyller sin ruta (beskärs) eller visas hel. Ställs in per bild under Bildbank → Justera
 * och gäller överallt där bilden används.
 *
 * Sparas i tabellen settings som `bild:<filnyckel>` = "x,y,zoom,passform" (t.ex. "50,30,1.25,fyll"),
 * så att ingen databasmigrering behövs. loadSettings() läser in raderna och layouten skriver en
 * <style nonce> med en regel per justerad bild (inga inline-stilar – CSP).
 */

export type FitMode = "fyll" | "hela";

export interface ImageFit {
  /** Fokuspunkt i procent (0–100) från vänster respektive toppen. */
  x: number;
  y: number;
  /** 1 = ingen zoom, upp till 2,5. Gäller bara "fyll". */
  zoom: number;
  fit: FitMode;
}

export const FIT_PREFIX = "bild:";
export const DEFAULT_FIT: ImageFit = { x: 50, y: 50, zoom: 1, fit: "fyll" };
export const MAX_ZOOM = 2.5;

/** Samma format som filnycklarna i lagringen – inget annat kan hamna i CSS-väljaren. */
const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,200}$/i;

export function isFitKey(key: string): boolean {
  return KEY_RE.test(key);
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Tolka och validera ett sparat värde (eller formulärvärden). Ogiltigt → null. */
export function parseFit(value: string | null | undefined): ImageFit | null {
  if (!value) return null;
  const [xs, ys, zs, fs] = value.split(",");
  const x = Number(xs);
  const y = Number(ys);
  const zoom = Number(zs);
  if (![x, y, zoom].every(Number.isFinite)) return null;
  return {
    x: Math.round(clamp(x, 0, 100)),
    y: Math.round(clamp(y, 0, 100)),
    zoom: Math.round(clamp(zoom, 1, MAX_ZOOM) * 100) / 100,
    fit: fs === "hela" ? "hela" : "fyll",
  };
}

export function serializeFit(f: ImageFit): string {
  return `${f.x},${f.y},${f.zoom},${f.fit}`;
}

export function isDefaultFit(f: ImageFit): boolean {
  return f.x === DEFAULT_FIT.x && f.y === DEFAULT_FIT.y && f.zoom === 1 && f.fit === "fyll";
}

/**
 * CSS för alla justerade bilder. `!important` behövs för att styrelsens val ska gå före sidornas
 * egna regler för bildytor (t.ex. object-fit: cover i kollaget).
 */
export function imageFitCss(fits: ReadonlyMap<string, ImageFit>): string {
  let css = "";
  for (const [key, f] of fits) {
    if (!isFitKey(key)) continue;
    const sel = `img[data-img="${key}"]`;
    if (f.fit === "hela") {
      css += `${sel}{object-fit:contain!important;object-position:50% 50%!important;transform:none!important;background:var(--c-surface)}`;
      continue;
    }
    css += `${sel}{object-fit:cover!important;object-position:${f.x}% ${f.y}%!important;`;
    css += f.zoom > 1 ? `transform:scale(${f.zoom})!important;transform-origin:${f.x}% ${f.y}%!important}` : `}`;
    // Inzoomade bilder får inte sticka ut ur sin ruta, även där rutan annars inte beskär.
    if (f.zoom > 1) css += `:has(>${sel}){overflow:hidden}`;
  }
  return css;
}
