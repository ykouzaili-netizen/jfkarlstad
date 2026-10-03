/** Färghjälp: validering och WCAG-kontrast. Delas av sajten och adminpanelens Utseende-vy. */

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const INK = "#141414";
export const PAPER = "#ffffff";

/** Välj svart eller vit text beroende på vilken som ger bäst kontrast mot bakgrunden. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, INK) >= contrastRatio(bg, PAPER) ? INK : PAPER;
}
