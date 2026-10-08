import { raw, type SafeHtml } from "./html.js";

/**
 * Belöningssystemets ordnar och medaljer.
 *
 * En medalj utan uppladdad bild ritas som SVG utifrån slag (orden/medalj), metall och bandets färger och mönster.
 * Färgerna är ett fast urval (inga hexkoder att skriva in) så att styrelsen håller sig till en sammanhållen palett.
 * Bandets färger är tygfärger, inte temafärger – de ska inte ändras om sajtens tema byts.
 */

export interface MedalRow {
  id: number;
  name: string;
  kind: MedalKind;
  metal: Metal;
  ribbon_pattern: RibbonPattern;
  ribbon_1: RibbonColor;
  ribbon_2: RibbonColor;
  description: string;
  founded: number | null;
  image_key: string | null;
  sort_order: number;
  published: number;
}

export const MEDAL_KINDS = {
  orden: { label: "Orden", hint: "Ritas som ett kors med emalj och strålar" },
  medalj: { label: "Medalj", hint: "Ritas som en rund medalj med lagerkrans" },
} as const;
export type MedalKind = keyof typeof MEDAL_KINDS;

export const METALS = {
  guld: { label: "Guld", stops: ["#fff2b0", "#e9c55a", "#b8892a", "#7a5713"], ink: "#6b4a0e", light: "#fff7cf" },
  silver: { label: "Silver", stops: ["#ffffff", "#d9dce1", "#a3a8b0", "#6d7279"], ink: "#5b6068", light: "#ffffff" },
  brons: { label: "Brons", stops: ["#f6c79a", "#c8844a", "#93562a", "#5e3315"], ink: "#4f2a10", light: "#ffd9b5" },
} as const;
export type Metal = keyof typeof METALS;

export const RIBBON_COLORS = {
  gul: { label: "JFK-gul", hex: "#f1cc4d" },
  svart: { label: "Svart", hex: "#161616" },
  vit: { label: "Vit", hex: "#f6f2e7" },
  bla: { label: "Kungsblå", hex: "#1f4f9e" },
  ljusbla: { label: "Ljusblå", hex: "#7fb2dd" },
  rod: { label: "Vinröd", hex: "#7c1d2c" },
  gron: { label: "Skogsgrön", hex: "#1f5b3a" },
  lila: { label: "Purpur", hex: "#4d2a6e" },
} as const;
export type RibbonColor = keyof typeof RIBBON_COLORS;

export const RIBBON_PATTERNS = {
  enfargat: { label: "Enfärgat", hint: "Hela bandet i huvudfärgen" },
  mittrand: { label: "Mittrand", hint: "En rand i mitten i den andra färgen" },
  kantrander: { label: "Kantränder", hint: "Smala ränder längs kanterna" },
  tre: { label: "Tre fält", hint: "Huvudfärg – andra färgen – huvudfärg" },
  delat: { label: "Delat", hint: "Halva bandet i vardera färg" },
} as const;
export type RibbonPattern = keyof typeof RIBBON_PATTERNS;

const pick = <T extends Record<string, unknown>>(map: T, v: unknown, def: keyof T): keyof T =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? (v as keyof T) : def;

/** Normaliserar en rad (eller formulärvärden) så att ritningen aldrig får ett ogiltigt värde. */
export function medalLook(m: Partial<Record<"kind" | "metal" | "ribbon_pattern" | "ribbon_1" | "ribbon_2", unknown>>) {
  return {
    kind: pick(MEDAL_KINDS, m.kind, "medalj") as MedalKind,
    metal: pick(METALS, m.metal, "guld") as Metal,
    pattern: pick(RIBBON_PATTERNS, m.ribbon_pattern, "mittrand") as RibbonPattern,
    c1: pick(RIBBON_COLORS, m.ribbon_1, "gul") as RibbonColor,
    c2: pick(RIBBON_COLORS, m.ribbon_2, "svart") as RibbonColor,
  };
}
export type MedalLook = ReturnType<typeof medalLook>;

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

// ───────────────────────── Ritning ─────────────────────────

const f = (n: number) => String(Math.round(n * 100) / 100);

/** Bandets ränder som rektanglar inom bredden x0…x0+w. */
function ribbonStripes(look: MedalLook, x0: number, w: number, y0: number, h: number): string {
  const a = RIBBON_COLORS[look.c1].hex;
  const b = RIBBON_COLORS[look.c2].hex;
  const rect = (x: number, width: number, fill: string) => `<rect x="${f(x)}" y="${y0}" width="${f(width)}" height="${h}" fill="${fill}"/>`;
  switch (look.pattern) {
    case "enfargat":
      return rect(x0, w, a);
    case "kantrander":
      return rect(x0, w, a) + rect(x0 + w * 0.08, w * 0.1, b) + rect(x0 + w * 0.82, w * 0.1, b);
    case "tre":
      return rect(x0, w, a) + rect(x0 + w / 3, w / 3, b);
    case "delat":
      return rect(x0, w / 2, a) + rect(x0 + w / 2, w / 2, b);
    case "mittrand":
    default:
      return rect(x0, w, a) + rect(x0 + w * 0.4, w * 0.2, b);
  }
}

/** Ett band (släpspänne) i full bredd, t.ex. som flik i utseendet Ordensbandet. */
export function ribbonBarSvg(look: MedalLook, id: string): SafeHtml {
  const W = 120;
  const H = 32;
  return raw(`<svg class="ribbon-bar" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
<defs><linearGradient id="${id}-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<pattern id="${id}-rib" width="2" height="${H}" patternUnits="userSpaceOnUse"><rect width="1" height="${H}" fill="#000" fill-opacity=".07"/></pattern></defs>
${ribbonStripes(look, 0, W, 0, H)}<rect width="${W}" height="${H}" fill="url(#${id}-rib)"/><rect width="${W}" height="${H}" fill="url(#${id}-sh)"/></svg>`);
}

/** Lagerkrans: två grenar med blad längs en båge runt (cx, cy). */
function laurel(cx: number, cy: number, r: number, ink: string, light: string): string {
  let out = "";
  for (const side of [-1, 1]) {
    // θ = vinkel från botten (0°) upp längs sidan; bladen lutar utåt från grenen.
    for (let i = 0; i < 8; i++) {
      const deg = 50 + i * 11;
      const t = (deg * Math.PI) / 180;
      const x = cx + side * r * Math.sin(t);
      const y = cy + r * Math.cos(t);
      const rot = side * (deg - 90) + side * 28;
      const leaf = (dx: number, dy: number, fill: string) =>
        `<ellipse cx="${f(x + dx)}" cy="${f(y + dy)}" rx="2.2" ry="5.4" transform="rotate(${f(rot)} ${f(x + dx)} ${f(y + dy)})" fill="${fill}"/>`;
      out += leaf(0.6, 0.7, light) + leaf(0, 0, ink);
    }
  }
    return out;
}

/**
 * Medaljen som SVG. id gör gradienternas id unika när flera medaljer står på samma sida.
 * viewBox 0 0 160 260: bandet överst, ring, medaljen under.
 */
export function medalSvg(look: MedalLook, id: string, opts: { title?: string; className?: string } = {}): SafeHtml {
  const m = METALS[look.metal];
  const cx = 80;
  const cy = 182;
  const g = `${id}-g`;
  const parts: string[] = [];

  parts.push(`<defs>
<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".35" stop-color="${m.stops[1]}"/><stop offset=".7" stop-color="${m.stops[2]}"/><stop offset="1" stop-color="${m.stops[3]}"/></linearGradient>
<linearGradient id="${g}r" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".4" stop-color="${m.stops[1]}"/><stop offset="1" stop-color="${m.stops[3]}"/></linearGradient>
<radialGradient id="${g}h" cx=".32" cy=".26" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-fold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<linearGradient id="${id}-gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
<pattern id="${id}-rib" width="2.2" height="10" patternUnits="userSpaceOnUse"><rect width="1" height="10" fill="#000" fill-opacity=".08"/></pattern>
<clipPath id="${id}-band"><path d="M42 0H118V80L80 98L42 80Z"/></clipPath>
<path id="${id}-arc" d="M${cx - 49} ${cy} A49 49 0 0 1 ${cx + 49} ${cy}"/>
<path id="${id}-arc2" d="M${cx - 55} ${cy} A55 55 0 0 0 ${cx + 55} ${cy}"/>
</defs>`);

  // Bandet: ränder, ripsvävnad, skuggor vid vecket och en ljusreflex.
  parts.push(`<g clip-path="url(#${id}-band)">${ribbonStripes(look, 42, 76, 0, 100)}<rect x="42" width="76" height="100" fill="url(#${id}-rib)"/><rect x="42" width="76" height="100" fill="url(#${id}-gloss)"/><rect x="42" width="76" height="100" fill="url(#${id}-fold)"/></g>`);
  parts.push(`<path d="M42 80L80 98L118 80" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1"/>`);
  // Ring och ögla
  parts.push(`<circle cx="80" cy="104" r="7" fill="none" stroke="url(#${g})" stroke-width="3.2"/><rect x="75" y="108" width="10" height="9" rx="2" fill="url(#${g})"/>`);

  if (look.kind === "orden") {
    const enamel = ["vit", "gul", "ljusbla"].includes(look.c1) ? (["vit", "gul", "ljusbla"].includes(look.c2) ? "#141414" : RIBBON_COLORS[look.c2].hex) : RIBBON_COLORS[look.c1].hex;
    // Strålar bakom korset
    let rays = "";
    for (let k = 0; k < 4; k++) {
      for (const [off, len, half] of [[0, 52, 7], [-13, 43, 4.5], [13, 43, 4.5]] as const) {
        const a = (45 + k * 90 + off) * (Math.PI / 180);
        const x1 = cx + Math.sin(a) * len;
        const y1 = cy - Math.cos(a) * len;
        const sx = Math.cos(a) * half;
        const sy = Math.sin(a) * half;
        rays += `<path d="M${f(cx - sx)} ${f(cy - sy)}L${f(x1)} ${f(y1)}L${f(cx + sx)} ${f(cy + sy)}Z" fill="url(#${g})" stroke="${m.ink}" stroke-opacity=".25" stroke-width=".5"/>`;
      }
    }
    parts.push(`<g>${rays}</g>`);
    // Kors pattée: en arm som roteras fyra gånger.
    const arm = `M${cx - 9} ${cy - 14}L${cx - 27} ${cy - 62}Q${cx} ${cy - 54} ${cx + 27} ${cy - 62}L${cx + 9} ${cy - 14}Z`;
    const inner = `M${cx - 6.5} ${cy - 18}L${cx - 20.5} ${cy - 56}Q${cx} ${cy - 49.5} ${cx + 20.5} ${cy - 56}L${cx + 6.5} ${cy - 18}Z`;
    let cross = "";
    for (const r of [0, 90, 180, 270]) {
      cross += `<g transform="rotate(${r} ${cx} ${cy})"><path d="${arm}" fill="url(#${g})"/><path d="${inner}" fill="${enamel}"/><path d="${inner}" fill="url(#${g}h)" opacity=".8"/></g>`;
    }
    parts.push(`<g>${cross}</g>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="24" fill="url(#${g})"/><circle cx="${cx}" cy="${cy}" r="20" fill="url(#${g}r)"/><circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="${m.light}" stroke-opacity=".7" stroke-width=".8"/>`);
    parts.push(`<text x="${cx + 0.7}" y="${cy + 10.7}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="30" fill="${m.light}" fill-opacity=".8">§</text><text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="30" fill="${m.ink}">§</text>`);
  } else {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="64" fill="url(#${g})"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="58" fill="url(#${g}r)"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="${m.ink}" stroke-opacity=".35" stroke-width="1"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="61" fill="none" stroke="${m.light}" stroke-opacity=".6" stroke-width="1" stroke-dasharray="0.1 3.6" stroke-linecap="round"/>`);
    parts.push(laurel(cx, cy, 34, m.ink, m.light));
    parts.push(`<text font-family="Montserrat, Arial, sans-serif" font-weight="700" font-size="7" letter-spacing="1.2" fill="${m.ink}"><textPath href="#${id}-arc" startOffset="50%" text-anchor="middle">JURIDISKA FÖRENINGEN</textPath></text>`);
    parts.push(`<text x="${cx + 0.8}" y="${cy + 14.8}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="40" fill="${m.light}" fill-opacity=".85">§</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="40" fill="${m.ink}">§</text>`);
    parts.push(`<text font-family="Montserrat, Arial, sans-serif" font-weight="700" font-size="7.6" letter-spacing="1.6" fill="${m.ink}"><textPath href="#${id}-arc2" startOffset="50%" text-anchor="middle">I KARLSTAD</textPath></text>`);
  }
  // Glans över metallen
  parts.push(look.kind === "orden" ? "" : `<circle cx="${cx}" cy="${cy}" r="64" fill="url(#${g}h)"/>`);

  const label = opts.title ? `<title>${escapeXml(opts.title)}</title>` : "";
  const aria = opts.title ? ` role="img" aria-label="${escapeXml(opts.title)}"` : ` aria-hidden="true" focusable="false"`;
  return raw(`<svg class="${opts.className ?? "medal-svg"}" viewBox="0 0 160 260" xmlns="http://www.w3.org/2000/svg"${aria}>${label}${parts.join("")}</svg>`);
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
