/**
 * Belöningssystemets ordnar och medaljer.
 *
 * Medaljernas utseende är föreningens egna bilder (förlagan från styrelsen 2026-10-08, 11 och 12 tillkom 2026-10-09).
 * public/assets/medaljer/medalj-01.webp … -12.webp är uppskalade (Real-ESRGAN) och lika stora: alla medaljer är lika
 * höga och ligger på samma yta (417 × 880), så att de står i jämnhöjd bredvid varandra. Se tools/design/medaljer.py.
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
  "04": { label: "Sol med JFK i guld – gult band (ljusare)", width: 417, height: 880 },
  "05": { label: "Stjärna i brons – rött band", width: 417, height: 880 },
  "06": { label: "Våg i brons – grönt band", width: 417, height: 880 },
  "07": { label: "Silver med emaljmärke – vitt och blått band", width: 417, height: 880 },
  "08": { label: "Våg i brons – rött band", width: 417, height: 880 },
  "09": { label: "Våg i brons – blått band", width: 417, height: 880 },
  "10": { label: "Stjärna i brons – blått band", width: 417, height: 880 },
  "11": { label: "Stjärna i silver med JK – blått och rött band", width: 417, height: 880 },
  "12": { label: "Våg i guld – gult band", width: 417, height: 880 },
} as const;
export type MedalDesign = keyof typeof MEDAL_DESIGNS;

export function medalDesign(v: unknown): MedalDesign {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MEDAL_DESIGNS, v) ? (v as MedalDesign) : "01";
}

/** Höj när bilderna byts ut – filerna i /assets cachas ett år. */
const MEDAL_IMAGES_VERSION = "5";
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
