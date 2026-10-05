import type { SafeHtml } from "./html.js";

/**
 * Sidornas uppbyggnad, som styrelsen styr i Texter och sidor:
 * - hela sidor kan döljas (då svarar adressen "sidan finns inte" och länkarna i menyn försvinner),
 * - avsnitt kan döljas och flyttas genom att dra dem i redigeraren,
 * - varje text kan få egen storlek och justering.
 *
 * Allt sparas i tabellen settings (ingen migrering behövs):
 *   sida:<sid-id>     = "dold"
 *   ordning:<sid-id>  = "avsnitt1,avsnitt2,…"
 *   dolt:<sid-id>     = "avsnitt1,…"
 *   stil:<textnyckel> = "<storlek i %>,<justering>"   t.ex. "130,center"
 * loadSettings() läser in raderna; sidorna använder arrange() och layouten skriver textstilarna som CSS.
 */

export interface BlockDef {
  /** Samma id som avsnittet i textregistret (src/lib/texts.ts). */
  id: string;
  /** Andra avsnitt i registret som hör till samma block och flyttas med det. */
  with?: string[];
  /** Ankaret på sidan (för menyn och genvägarna). */
  anchor?: string;
}

export interface PageLayoutDef {
  /** Adresser som hör till sidan (prefix). Döljs sidan svarar alla med 404. */
  paths: string[];
  /** Avsnitt som kan flyttas och döljas, i standardordning. */
  blocks: BlockDef[];
}

/** Sidor som kan döljas och avsnitt som kan flyttas. Startsidan, integritetssidorna, sök och felsidan kan inte döljas. */
export const PAGE_LAYOUTS: Record<string, PageLayoutDef> = {
  startsida: {
    paths: [],
    blocks: [
      { id: "partners" },
      { id: "varden" },
      { id: "ordband" },
      { id: "intro" },
      { id: "evenemang" },
      { id: "nyheter" },
      { id: "paverka" },
      { id: "instagram" },
    ],
  },
  "om-oss": {
    paths: ["/om-oss"],
    blocks: [
      { id: "om", anchor: "om-jfk" },
      { id: "styrning", anchor: "sa-styrs-jfk" },
      { id: "styrelsen", anchor: "styrelsen" },
      { id: "utskott", anchor: "utskotten" },
      { id: "utmarkelser", anchor: "utmarkelser" },
      { id: "pedagog", anchor: "arets-pedagog" },
      { id: "samarbeten", anchor: "samarbeten" },
    ],
  },
  "bli-medlem": { paths: ["/bli-medlem"], blocks: [{ id: "formaner", with: ["steg"] }, { id: "faq" }] },
  "for-studenter": {
    paths: ["/for-studenter"],
    blocks: [
      { id: "studera", anchor: "studera-pa-kau" },
      { id: "jobb", anchor: "jobb-och-praktik" },
      { id: "kursombud", anchor: "kursombud" },
      { id: "idrott", anchor: "jfk-idrott" },
      { id: "galleri", anchor: "bildgalleri" },
    ],
  },
  karriar: { paths: ["/karriar"], blocks: [] },
  "engagera-dig": { paths: ["/engagera-dig"], blocks: [{ id: "uppdrag" }, { id: "utskott" }, { id: "formular" }] },
  "for-foretag": { paths: ["/for-foretag"], blocks: [{ id: "varfor" }, { id: "paket" }, { id: "formular" }] },
  partners: { paths: ["/partners"], blocks: [] },
  aktuellt: { paths: ["/aktuellt"], blocks: [] },
  kalender: { paths: ["/kalender"], blocks: [] },
  dokument: { paths: ["/dokument"], blocks: [] },
  faq: { paths: ["/faq"], blocks: [] },
  "jf-paverka": { paths: ["/jf-paverka"], blocks: [] },
  kontakt: { paths: ["/kontakt"], blocks: [] },
};

export const LAYOUT_PREFIX = { page: "sida:", order: "ordning:", hidden: "dolt:", style: "stil:" } as const;

export type TextAlign = "" | "left" | "center" | "right";

export interface TextStyle {
  /** Storlek i procent av standard (50–250). */
  size: number;
  align: TextAlign;
}

export interface SiteLayout {
  hiddenPages: Set<string>;
  order: Map<string, string[]>;
  hiddenBlocks: Map<string, Set<string>>;
  styles: Map<string, TextStyle>;
}

export function emptyLayout(): SiteLayout {
  return { hiddenPages: new Set(), order: new Map(), hiddenBlocks: new Map(), styles: new Map() };
}

const ID_RE = /^[a-z0-9_-]{1,60}$/;

export function canHidePage(pageId: string): boolean {
  return pageId in PAGE_LAYOUTS && PAGE_LAYOUTS[pageId]!.paths.length > 0;
}

export function parseStyle(value: string | null | undefined): TextStyle | null {
  if (!value) return null;
  const [sz, al] = value.split(",");
  const size = Math.round(Number(sz));
  const align = (["left", "center", "right"].includes(al ?? "") ? al : "") as TextAlign;
  if (!Number.isFinite(size)) return null;
  const clamped = Math.min(250, Math.max(50, size));
  if (clamped === 100 && !align) return null;
  return { size: clamped, align };
}

export function serializeStyle(t: TextStyle): string {
  return `${t.size},${t.align}`;
}

/** Läs en rad ur settings in i layouten. Returnerar false om nyckeln inte hör hit. */
export function applyLayoutRow(layout: SiteLayout, key: string, value: string): boolean {
  if (key.startsWith(LAYOUT_PREFIX.page)) {
    const id = key.slice(LAYOUT_PREFIX.page.length);
    if (canHidePage(id)) value === "dold" ? layout.hiddenPages.add(id) : layout.hiddenPages.delete(id);
    return true;
  }
  if (key.startsWith(LAYOUT_PREFIX.order)) {
    const id = key.slice(LAYOUT_PREFIX.order.length);
    const ids = value.split(",").filter((b) => ID_RE.test(b));
    if (PAGE_LAYOUTS[id]) layout.order.set(id, ids);
    return true;
  }
  if (key.startsWith(LAYOUT_PREFIX.hidden)) {
    const id = key.slice(LAYOUT_PREFIX.hidden.length);
    if (PAGE_LAYOUTS[id]) layout.hiddenBlocks.set(id, new Set(value.split(",").filter((b) => ID_RE.test(b))));
    return true;
  }
  if (key.startsWith(LAYOUT_PREFIX.style)) {
    const k = key.slice(LAYOUT_PREFIX.style.length);
    const st = parseStyle(value);
    if (st && ID_RE.test(k)) layout.styles.set(k, st);
    else layout.styles.delete(k);
    return true;
  }
  return false;
}

/** Sidans avsnitt i den ordning styrelsen valt. Nya avsnitt (som saknas i den sparade ordningen) hamnar sist. */
export function blockOrder(layout: SiteLayout, pageId: string): string[] {
  const def = PAGE_LAYOUTS[pageId];
  if (!def) return [];
  const known = def.blocks.map((b) => b.id);
  const order = [...new Set((layout.order.get(pageId) ?? []).filter((id) => known.includes(id)))];
  // Avsnitt som saknas i den sparade ordningen (t.ex. ett nytt avsnitt som lagts till efter att styrelsen
  // sorterade sidan) hamnar direkt efter avsnittet som står före dem i standardordningen – inte sist.
  known.forEach((id, i) => {
    if (order.includes(id)) return;
    const prev = known.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
  });
  return order;
}

export function isBlockHidden(layout: SiteLayout, pageId: string, blockId: string): boolean {
  return layout.hiddenBlocks.get(pageId)?.has(blockId) ?? false;
}

/**
 * Synliga avsnitt i rätt ordning. `render` anropas bara för avsnitt som visas och får id:t på avsnittet
 * närmast ovanför (null = först efter sidans topp) – så kan ett avsnitt ligga tätt intill det som brukar
 * stå före det, men få luft om det har flyttats.
 */
export type BlockRender = (prev: string | null) => SafeHtml | string;
export function arrangeBlocks(layout: SiteLayout, pageId: string, render: Record<string, BlockRender>): (SafeHtml | string)[] {
  const ids = blockOrder(layout, pageId).filter((id) => !isBlockHidden(layout, pageId, id) && render[id]);
  return ids.map((id, i) => render[id]!(i === 0 ? null : ids[i - 1]!));
}

/** Vilken sida en adress hör till (för att kunna dölja den). */
export function pageIdForPath(path: string): string | null {
  for (const [id, def] of Object.entries(PAGE_LAYOUTS)) {
    if (def.paths.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "."))) return id;
  }
  return null;
}

/** Är länken synlig? Döljer länkar till dolda sidor och till ankare i dolda avsnitt. */
export function isLinkVisible(layout: SiteLayout, href: string): boolean {
  const [path, anchor] = href.split("#");
  const pageId = pageIdForPath(path ?? "");
  if (pageId && layout.hiddenPages.has(pageId)) return false;
  if (pageId && anchor) {
    const block = PAGE_LAYOUTS[pageId]!.blocks.find((b) => b.anchor === anchor);
    if (block && isBlockHidden(layout, pageId, block.id)) return false;
  }
  return true;
}

/** CSS för texternas storlek och justering. Nycklarna är validerade (ID_RE), så inget kan injiceras. */
export function textStyleCss(styles: ReadonlyMap<string, TextStyle>): string {
  let css = "";
  for (const [key, t] of styles) {
    if (!ID_RE.test(key)) continue;
    const rules: string[] = [];
    if (t.size !== 100) rules.push(`zoom:${t.size / 100}`);
    if (t.align) rules.push(`text-align:${t.align}!important`);
    if (t.align === "center") rules.push("margin-inline:auto!important");
    if (t.align === "right") rules.push("margin-inline-start:auto!important");
    if (rules.length) css += `[data-t="${key}"]{${rules.join(";")}}`;
  }
  return css;
}
