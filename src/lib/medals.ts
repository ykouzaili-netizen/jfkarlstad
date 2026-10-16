/**
 * Belöningssystemets ordnar och medaljer.
 *
 * Medaljernas utseende är föreningens egna bilder i public/assets/medaljer/medalj-NN.webp, alla på samma yta (417 × 880)
 * och lika stora (runda medaljer lika breda, övriga med samma bandbredd) – se tools/design/medaljer.py.
 * 2026-10-16 ersattes 01–04, 06–09, 11 och 12 med styrelsens foton, och 13–14 tillkom. 05 och 10 är fortfarande
 * de ritade förlagorna från 2026-10-08 (foton saknas).
 * I adminpanelen väljer man vilken bild en medalj har. Ett uppladdat foto (fältet image_key) visas i stället om det finns.
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
  "01": { label: "Våg i brons – rött och gult band", width: 417, height: 880 },
  "02": { label: "Våg i brons – rött, vitt och blått band", width: 417, height: 880 },
  "03": { label: "Sol med JFK i guld – gult band", width: 417, height: 880 },
  "04": { label: "Sol med JFK i silver – gult band", width: 417, height: 880 },
  "05": { label: "Stjärna i brons – rött band", width: 417, height: 880 },
  "06": { label: "Våg i brons – grönt band", width: 417, height: 880 },
  "07": { label: "JF-monogram i silver – blått och vitt band", width: 417, height: 880 },
  "08": { label: "Våg i brons – rött band", width: 417, height: 880 },
  "09": { label: "Våg i brons – blått band", width: 417, height: 880 },
  "10": { label: "Stjärna i brons – blått band", width: 417, height: 880 },
  "11": { label: "Stjärna i silver med JK – blått och rött band", width: 417, height: 880 },
  "12": { label: "Våg i guld – gult band", width: 417, height: 880 },
  "13": { label: "Snöflinga i silver med JFK – vitt band", width: 417, height: 880 },
  "14": { label: "Våg i brons – lila band", width: 417, height: 880 },
} as const;
export type MedalDesign = keyof typeof MEDAL_DESIGNS;

export function medalDesign(v: unknown): MedalDesign {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MEDAL_DESIGNS, v) ? (v as MedalDesign) : "01";
}

/** Höj när bilderna byts ut – filerna i /assets cachas ett år. */
const MEDAL_IMAGES_VERSION = "6";
export const medalImageUrl = (design: unknown) => `/assets/medaljer/medalj-${medalDesign(design)}.webp?v=${MEDAL_IMAGES_VERSION}`;

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
