/**
 * Utseendena för bilden på en partners egen sida (/partners/:slug). Väljs per partner i adminpanelen
 * (Partners → partnern → "Hur ska bilden visas?"). Kolumnerna kommer från migrering 0013.
 */
export const PARTNER_IMAGE_STYLES = [
  { value: "banner", label: "Brett bildband", hint: "Bilden i hela bredden mellan namnet och texten. Passar de flesta bilder." },
  { value: "bakgrund", label: "Bakgrund i toppen", hint: "Bilden fyller toppen bakom logotypen och namnet. Kräver en lugn bild utan text." },
  { value: "delad", label: "Bredvid namnet", hint: "Logotyp och namn till vänster, bilden stort till höger." },
  { value: "spalt", label: "I sidospalten", hint: "En stående bild under knapparna, bredvid presentationen." },
  { value: "platta", label: "Med färgplatta", hint: "Bilden överst i presentationen med en platta i föreningens färg bakom." },
] as const;

export type PartnerImageStyle = (typeof PARTNER_IMAGE_STYLES)[number]["value"];

export function partnerImageStyle(v: unknown): PartnerImageStyle {
  return PARTNER_IMAGE_STYLES.some((s) => s.value === v) ? (v as PartnerImageStyle) : "banner";
}
