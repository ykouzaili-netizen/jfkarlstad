import { raw, type SafeHtml } from "./html.js";
import { MONTHS, parseLocal, stockholmNow } from "./format.js";

/**
 * JFK Butik (/butik): produkter, släpp och deras läge.
 *
 * - Produkter är antingen "alltid" (sortimentet) eller "slapp" (kan bara beställas medan släppet pågår).
 * - Ett släpp pågår från starts_at till och med minuten ends_at (svensk tid, som evenemangen).
 * - Utan foto visas en tecknad bild av plagget (garment) i produktens första färg – sidan ska aldrig se tom ut.
 * Innehållet ändras under Innehåll → Butik, texterna under Texter och sidor → Butik.
 */

export type Garment = "hoodie" | "tshirt" | "pase" | "mossa" | "marke" | "annat";

export const GARMENTS: { value: Garment; label: string }[] = [
  { value: "hoodie", label: "Hoodie eller tröja" },
  { value: "tshirt", label: "T-shirt" },
  { value: "pase", label: "Tygpåse" },
  { value: "mossa", label: "Mössa" },
  { value: "marke", label: "Märke" },
  { value: "annat", label: "Annat" },
];

export interface DropRow {
  id: number;
  label: string;
  title: string;
  starts_at: string;
  ends_at: string;
  min_qty: number | null;
  delivery_note: string;
  summary: string;
  published: number;
}

export interface ProductRow {
  id: number;
  name: string;
  slug: string;
  kind: "alltid" | "slapp";
  drop_id: number | null;
  garment: Garment;
  featured: number;
  price: number;
  summary: string;
  description: string;
  colors: string;
  sizes: string;
  sold_out: string;
  image_key: string | null;
  image_alt: string;
  /** Fler bilder (tabellen shop_product_images), i visningsordning. Fylls i av loadShop. */
  photos?: ProductPhoto[];
  model_note: string;
  designer: string;
  designer_program: string;
  designer_quote: string;
  sketch_key: string | null;
  material: string;
  care: string;
  sort_order: number;
  published: number;
}

export interface ProductPhoto {
  key: string;
  caption: string;
}

export type DropState = "upcoming" | "open" | "closed";

export interface Color {
  name: string;
  hex: string;
}

const HEX_RE = /#[0-9a-f]{6}\b/i;
/** Reservfärg för den tecknade bilden när produkten saknar färg. */
const DEFAULT_HEX = "#ece4d0";

/** "Svart #1d1d1d" en per rad → [{name, hex}]. Rader utan färgkod får reservfärgen. */
export function parseColors(value: string): Color[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => {
      const hex = HEX_RE.exec(line)?.[0]?.toLowerCase() ?? DEFAULT_HEX;
      const name = line.replace(HEX_RE, "").replace(/\s+/g, " ").trim() || hex;
      return { name: name.slice(0, 40), hex };
    });
}

/** "XS, S, M" → ["XS", "S", "M"] (kommatecken eller ny rad). */
export function parseSizes(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,\n]/)
    .map((v) => v.trim().slice(0, 12))
    .filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
    .slice(0, 16);
}

/** Läget för ett släpp vid tidpunkten `now` ("YYYY-MM-DDTHH:MM" i svensk tid). Slutminuten räknas med. */
export function dropState(d: Pick<DropRow, "starts_at" | "ends_at">, now = stockholmNow()): DropState {
  if (now < d.starts_at.slice(0, 16)) return "upcoming";
  if (now <= d.ends_at.slice(0, 16)) return "open";
  return "closed";
}

/** "30 januari" (och året om det inte är i år). */
export function dropDay(local: string, now = stockholmNow()): string {
  const p = parseLocal(local);
  if (!p) return "";
  return `${p.day} ${MONTHS[p.month - 1]}${String(p.year) === now.slice(0, 4) ? "" : ` ${p.year}`}`;
}

export interface ShopData {
  drops: DropRow[];
  products: ProductRow[];
  /** Släppet som pågår just nu (det som stänger först om flera pågår). */
  current: DropRow | null;
  /** Nästa släpp som inte har börjat. */
  next: DropRow | null;
  /** Släpp som har stängt, senaste först. */
  past: DropRow[];
  /** Produkter som går att beställa nu: släppets produkter först, sedan sortimentet. */
  live: ProductRow[];
}

const PRODUCT_ORDER = "sort_order, name COLLATE NOCASE, id";

/** Allt som butikens sidor behöver. Tål att tabellerna saknas (före migreringen) – då är butiken tom. */
export async function loadShop(db: D1Database, now = stockholmNow()): Promise<ShopData> {
  let drops: DropRow[] = [];
  let products: ProductRow[] = [];
  try {
    const [d, p] = await db.batch([
      db.prepare("SELECT * FROM shop_drops WHERE published = 1 ORDER BY starts_at, id"),
      db.prepare(`SELECT * FROM shop_products WHERE published = 1 ORDER BY ${PRODUCT_ORDER}`),
    ]);
    drops = (d?.results ?? []) as unknown as DropRow[];
    products = (p?.results ?? []) as unknown as ProductRow[];
  } catch {
    // Tabellerna finns inte än.
  }
  if (products.length) {
    try {
      const rows = (await db.prepare("SELECT product_id, image_key, caption FROM shop_product_images ORDER BY sort_order, id").all<{ product_id: number; image_key: string; caption: string }>()).results;
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const r of rows) {
        const p = byId.get(r.product_id);
        if (p) (p.photos ??= []).push({ key: r.image_key, caption: r.caption });
      }
    } catch {
      // Tabellen finns inte än (före migrering 0025) – bara huvudbilden visas.
    }
  }
  const open = drops.filter((d) => dropState(d, now) === "open").sort((a, b) => a.ends_at.localeCompare(b.ends_at));
  const current = open[0] ?? null;
  const next = drops.find((d) => dropState(d, now) === "upcoming") ?? null;
  const past = drops.filter((d) => dropState(d, now) === "closed").reverse();
  const openIds = new Set(open.map((d) => d.id));
  const inDrop = products.filter((p) => p.kind === "slapp" && p.drop_id != null && openIds.has(p.drop_id));
  const always = products.filter((p) => p.kind === "alltid");
  return { drops, products, current, next, past, live: [...inDrop, ...always] };
}

/** En produkt som går att visa på sin egen sida: sortimentet, eller ett släpp som pågår eller har stängt (arkivet). */
export function findProduct(data: ShopData, slug: string, now = stockholmNow()): { product: ProductRow; drop: DropRow | null; orderable: boolean } | null {
  const product = data.products.find((p) => p.slug === slug);
  if (!product) return null;
  if (product.kind === "alltid") return { product, drop: null, orderable: true };
  const drop = data.drops.find((d) => d.id === product.drop_id) ?? null;
  if (!drop) return null;
  const state = dropState(drop, now);
  if (state === "upcoming") return null; // Ett släpp som inte har börjat ska inte avslöjas i förväg.
  return { product, drop, orderable: state === "open" };
}

/**
 * Produktens bilder: huvudbilden först, sedan de övriga i sin ordning. `alt` beskriver bilden för skärmläsare,
 * `caption` är bildtexten som visas (huvudbilden har ingen – dess beskrivning är bara alt-text).
 */
export function productImages(p: ProductRow): { key: string; alt: string; caption: string }[] {
  const out: { key: string; alt: string; caption: string }[] = [];
  if (p.image_key) out.push({ key: p.image_key, alt: p.image_alt || p.name, caption: "" });
  for (const ph of p.photos ?? []) if (ph.key) out.push({ key: ph.key, alt: ph.caption || p.name, caption: ph.caption });
  return out;
}

/** Pris med mellanslag som tusentalsavgränsare: "1 299 kr". */
export function kr(n: number): string {
  return `${String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} kr`;
}

// ───────────── Tecknade plagg (när det inte finns något foto) ─────────────
// Formerna är egna, enkla teckningar. Plaggets färg kommer från CSS-variabeln --g på omslutande element
// (sätts per produkt i en <style nonce>, se shopCss i pages/shop.ts) – inga style-attribut (CSP).

const GARMENT_PATHS: Record<Garment, string> = {
  hoodie:
    '<path class="g-body" d="M150 40C120 48 96 60 80 84C66 104 60 140 56 190L46 370Q46 388 62 390L92 392Q106 392 106 378L114 220L116 402Q116 418 132 418H268Q284 418 284 402L286 220L294 378Q294 392 308 392L338 390Q354 388 354 370L344 190C340 140 334 104 320 84C304 60 280 48 250 40Z"/>' +
    '<path class="g-shade" d="M150 40C140 80 160 112 200 116C240 112 260 80 250 40C236 62 220 70 200 70C180 70 164 62 150 40Z"/>' +
    '<path class="g-line" d="M186 114l-4 54M214 114l4 54"/><path class="g-shade" d="M140 296H260V350Q260 362 248 362H152Q140 362 140 350Z"/>' +
    '<path class="g-line" d="M117 398H283M48 366L104 372M296 372L352 366"/>',
  tshirt:
    '<path class="g-body" d="M154 52c10 14 26 22 46 22s36-8 46-22l66 26c14 6 24 16 30 30l30 64c4 9 0 18-9 21l-44 16c-8 3-16-1-19-9l-12-30v222c0 12-8 20-20 20H132c-12 0-20-8-20-20V170l-12 30c-3 8-11 12-19 9l-44-16c-9-3-13-12-9-21l30-64c6-14 16-24 30-30z"/>' +
    '<path class="g-line" d="M154 52c10 22 26 34 46 34s36-12 46-34M112 390h176"/>',
  pase:
    '<path class="g-line g-strap" d="M148 150V96c0-30 22-52 52-52s52 22 52 52v54"/>' +
    '<path class="g-body" d="M84 140h232c6 0 10 4 11 10l17 248c1 8-5 14-13 14H69c-8 0-14-6-13-14l17-248c1-6 5-10 11-10z"/>' +
    '<path class="g-shade" d="M84 140h232c6 0 10 4 11 10l1 14H72l1-14c1-6 5-10 11-10z"/>',
  mossa:
    '<circle class="g-shade" cx="200" cy="92" r="30"/><path class="g-body" d="M86 270c0-92 50-160 114-160s114 68 114 160z"/>' +
    '<rect class="g-body" x="70" y="256" width="260" height="96" rx="18"/>' +
    '<path class="g-line" d="M96 256v96M122 256v96M148 256v96M174 256v96M200 256v96M226 256v96M252 256v96M278 256v96M304 256v96"/>',
  marke:
    '<circle class="g-ring" cx="200" cy="220" r="150"/><circle class="g-body" cx="200" cy="220" r="126"/>' +
    '<circle class="g-stitch" cx="200" cy="220" r="108"/>',
  annat: '<rect class="g-body" x="80" y="80" width="240" height="280" rx="36"/><rect class="g-shade" x="80" y="80" width="240" height="40" rx="20"/>',
};

/** Den tecknade bilden av plagget (inline-SVG, dekorativ). */
export function garmentSvg(g: Garment): SafeHtml {
  return raw(`<svg class="shop-garment shop-garment-${g}" viewBox="0 0 400 440" aria-hidden="true" focusable="false">${GARMENT_PATHS[g] ?? GARMENT_PATHS.annat}</svg>`);
}

/** Var logotypen sitter på den tecknade bilden (klass på logotypen). */
export function logoSpot(g: Garment): string {
  return `shop-logo-${g}`;
}
