/**
 * Belöningssystemets ordnar och medaljer.
 *
 * Medaljernas utseende är föreningens egna bilder (förlagan från styrelsen 2026-10-08), urklippta ur styrelsens
 * PNG (genomskinlig bakgrund) utan bearbetning till public/assets/medaljer/medalj-01.png … -12.png (11 och 12 tillkom 2026-10-09). I adminpanelen väljer man vilken bild en medalj har.
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
  "01": { label: "Våg i brons – rött och gult band", width: 216, height: 456 },
  "02": { label: "Våg i brons – rött, vitt och blått band", width: 218, height: 456 },
  "03": { label: "Sol med JFK i guld – gult band", width: 217, height: 457 },
  "04": { label: "Sol med JFK i guld – gult band (ljusare)", width: 216, height: 457 },
  "05": { label: "Stjärna i brons – rött band", width: 215, height: 457 },
  "06": { label: "Våg i brons – grönt band", width: 212, height: 479 },
  "07": { label: "Silver med emaljmärke – vitt och blått band", width: 212, height: 479 },
  "08": { label: "Våg i brons – rött band", width: 212, height: 479 },
  "09": { label: "Våg i brons – blått band", width: 212, height: 479 },
  "10": { label: "Stjärna i brons – blått band", width: 219, height: 477 },
  "11": { label: "Stjärna i silver med JK – blått och rött band", width: 204, height: 456 },
  "12": { label: "Våg i guld – gult band", width: 195, height: 456 },
} as const;
export type MedalDesign = keyof typeof MEDAL_DESIGNS;

export function medalDesign(v: unknown): MedalDesign {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MEDAL_DESIGNS, v) ? (v as MedalDesign) : "01";
}

/** Höj när bilderna byts ut – filerna i /assets cachas ett år. */
const MEDAL_IMAGES_VERSION = "4";
export const medalImageUrl = (design: unknown) => `/assets/medaljer/medalj-${medalDesign(design)}.png?v=${MEDAL_IMAGES_VERSION}`;

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
