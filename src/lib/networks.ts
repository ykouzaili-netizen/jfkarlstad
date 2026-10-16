/**
 * Studentnätverk som JFK samarbetar med (JURO, ELSA Karlstad …). Tabellen networks kommer från migrering 0015.
 * Kort under Samarbeten på Om oss och en egen sida per nätverk på /om-oss/:slug (src/pages/networks.ts).
 */
export interface NetworkRow {
  id: number;
  slug: string;
  name: string;
  kicker: string;
  summary: string;
  description: string;
  collaboration: string;
  logo_key: string | null;
  image_key: string | null;
  image_alt: string;
  image_2_key: string | null;
  image_2_caption: string;
  image_3_key: string | null;
  image_3_caption: string;
  image_4_key: string | null;
  image_4_caption: string;
  website_url: string | null;
  email: string | null;
  links: string;
  sort_order: number;
  published: number;
}

export const networkQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM networks WHERE published = 1 ORDER BY sort_order, name"),
  bySlug: (db: D1Database, slug: string) => db.prepare("SELECT * FROM networks WHERE published = 1 AND slug = ?").bind(slug),
};

/** Publicerade nätverk. Tål att tabellen saknas (koden publicerad före migreringen) – då visas inga kort. */
export async function loadNetworks(db: D1Database): Promise<NetworkRow[]> {
  try {
    return (await networkQuery.all(db).all<NetworkRow>()).results;
  } catch {
    return [];
  }
}

/** Bilderna under "Bilder" på nätverkets sida (bild 2–4), bara de som finns. */
export function networkGallery(n: NetworkRow): { key: string; caption: string }[] {
  return ([2, 3, 4] as const)
    .map((i) => ({ key: n[`image_${i}_key`], caption: n[`image_${i}_caption`] ?? "" }))
    .filter((g): g is { key: string; caption: string } => !!g.key);
}
