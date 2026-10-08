/**
 * Belöningssystemets ordnar och medaljer.
 *
 * Medaljernas utseende är föreningens egna bilder (förlagan från styrelsen 2026-10-08), urklippta med genomskinlig
 * bakgrund i public/assets/medaljer/medalj-01.png … -10.png. I adminpanelen väljer man vilken bild en medalj har.
 * Ett uppladdat foto (fältet image_key) visas i stället för bilden om det finns.
 */

export interface MedalRow {
  id: number;
  name: string;
  kind: MedalKind;
  design: string;
  description: string;
  founded: number | null;
  image_key: string | null;
  sort_order: number;
  published: number;
}

/** Ordet som visas vid utmärkelsen på webbplatsen. */
export const MEDAL_KINDS = {
  medalj: { label: "Medalj" },
  orden: { label: "Orden" },
} as const;
export type MedalKind = keyof typeof MEDAL_KINDS;

/** Föreningens medaljbilder i förlagans ordning. Etiketterna beskriver bara utseendet – namnen sätts i adminpanelen. */
export const MEDAL_DESIGNS = {
  "01": { label: "Våg i brons – rött och gult band", width: 142, height: 297 },
  "02": { label: "Våg i brons – rött, vitt och blått band", width: 141, height: 297 },
  "03": { label: "Sol med JFK i guld – gult band", width: 142, height: 298 },
  "04": { label: "Sol med JFK i guld – gult band (ljusare)", width: 143, height: 298 },
  "05": { label: "Stjärna i brons – rött band", width: 136, height: 296 },
  "06": { label: "Våg i brons – grönt band", width: 138, height: 311 },
  "07": { label: "Silver med emaljmärke – vitt och blått band", width: 139, height: 312 },
  "08": { label: "Våg i brons – rött band", width: 137, height: 310 },
  "09": { label: "Våg i brons – blått band", width: 141, height: 311 },
  "10": { label: "Stjärna i brons – blått band", width: 140, height: 309 },
} as const;
export type MedalDesign = keyof typeof MEDAL_DESIGNS;

export function medalDesign(v: unknown): MedalDesign {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MEDAL_DESIGNS, v) ? (v as MedalDesign) : "01";
}

export const medalImageUrl = (design: unknown) => `/assets/medaljer/medalj-${medalDesign(design)}.png`;

export const medalQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM medals WHERE published = 1 ORDER BY sort_order, id"),
};

/** Publicerade medaljer. Tål att tabellen saknas (koden publicerad före migreringen) – då visas inga medaljer. */
export async function loadMedals(db: D1Database): Promise<MedalRow[]> {
  try {
    const { results } = await medalQuery.all(db).all<MedalRow>();
    return results;
  } catch {
    return [];
  }
}
