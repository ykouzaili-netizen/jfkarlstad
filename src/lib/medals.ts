import { raw, type SafeHtml } from "./html.js";

/**
 * Belöningssystemets ordnar och medaljer.
 *
 * En medalj utan uppladdad bild ritas som SVG utifrån föreningens riktiga medaljer (bilder från styrelsen
 * 2026-10-08): motiv (våg med lagerkrans, rund med våg, solen med JFK, stjärna), metall och bandets färger.
 * Färgerna är ett fast urval (inga hexkoder att skriva in) så att styrelsen håller sig till en sammanhållen palett.
 * Band och metall är materialfärger, inte temafärger – de ska inte ändras om sajtens tema byts.
 */

export interface MedalRow {
  id: number;
  name: string;
  kind: MedalKind;
  motif: Motif;
  metal: Metal;
  ribbon_pattern: RibbonPattern;
  ribbon_1: RibbonColor;
  ribbon_2: RibbonColor;
  ribbon_3: RibbonColor;
  description: string;
  founded: number | null;
  image_key: string | null;
  sort_order: number;
  published: number;
}

/** Ordet som visas vid utmärkelsen på webbplatsen. Påverkar inte hur den ritas. */
export const MEDAL_KINDS = {
  medalj: { label: "Medalj" },
  orden: { label: "Orden" },
} as const;
export type MedalKind = keyof typeof MEDAL_KINDS;

export const MOTIFS = {
  vag: { label: "Våg med lagerkrans", hint: "Rättvisans våg ovanför en lagerkrans, genombruten" },
  rund: { label: "Rund med våg", hint: "Rund medalj med vågen och en lagerkrans i relief" },
  sol: { label: "Solen med JFK", hint: "Strålande sol med bokstäverna JFK i mitten" },
  stjarna: { label: "Stjärna", hint: "Femuddig stjärna" },
} as const;
export type Motif = keyof typeof MOTIFS;

export const METALS = {
  guld: { label: "Guld", stops: ["#fff3b8", "#e8c45a", "#b88a2a", "#7a5713"], ink: "#5e400b", light: "#fff8d6" },
  brons: { label: "Brons", stops: ["#f3b98c", "#c9773f", "#93502a", "#5a2e14"], ink: "#4a230c", light: "#ffd7b8" },
  silver: { label: "Silver", stops: ["#ffffff", "#d9dce1", "#a3a8b0", "#6d7279"], ink: "#4f545b", light: "#ffffff" },
  svartad: { label: "Svärtad", stops: ["#9a9ca1", "#5b5e63", "#33353a", "#17181b"], ink: "#0c0c0e", light: "#c9ccd2" },
} as const;
export type Metal = keyof typeof METALS;

export const RIBBON_COLORS = {
  gul: { label: "Gul", hex: "#f2c21b" },
  rod: { label: "Röd", hex: "#d4202c" },
  bla: { label: "Blå", hex: "#1e47a8" },
  gron: { label: "Grön", hex: "#2e8b3d" },
  vit: { label: "Vit", hex: "#f6f4ee" },
  svart: { label: "Svart", hex: "#161616" },
  ljusbla: { label: "Ljusblå", hex: "#7fb2dd" },
  vinrod: { label: "Vinröd", hex: "#7c1d2c" },
  morkgron: { label: "Mörkgrön", hex: "#1f5b3a" },
  lila: { label: "Lila", hex: "#4d2a6e" },
} as const;
export type RibbonColor = keyof typeof RIBBON_COLORS;

export const RIBBON_PATTERNS = {
  enfargat: { label: "Enfärgat", hint: "Hela bandet i första färgen" },
  delat: { label: "Delat", hint: "Hälften var av första och andra färgen" },
  trefarg: { label: "Tre färger", hint: "Tre lika breda fält, t.ex. rött – vitt – blått" },
  mittrand: { label: "Mittrand", hint: "Första färgen med en rand i den andra" },
  kantrander: { label: "Kantränder", hint: "Smala ränder i den andra färgen längs kanterna" },
} as const;
export type RibbonPattern = keyof typeof RIBBON_PATTERNS;

const pick = <T extends Record<string, unknown>>(map: T, v: unknown, def: keyof T): keyof T =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? (v as keyof T) : def;

type LookInput = Partial<Record<"motif" | "metal" | "ribbon_pattern" | "ribbon_1" | "ribbon_2" | "ribbon_3", unknown>>;

/** Normaliserar en rad (eller formulärvärden) så att ritningen aldrig får ett ogiltigt värde. */
export function medalLook(m: LookInput) {
  return {
    motif: pick(MOTIFS, m.motif, "vag") as Motif,
    metal: pick(METALS, m.metal, "brons") as Metal,
    pattern: pick(RIBBON_PATTERNS, m.ribbon_pattern, "enfargat") as RibbonPattern,
    c1: pick(RIBBON_COLORS, m.ribbon_1, "gul") as RibbonColor,
    c2: pick(RIBBON_COLORS, m.ribbon_2, "rod") as RibbonColor,
    c3: pick(RIBBON_COLORS, m.ribbon_3, "bla") as RibbonColor,
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

/** Bandets fält som rektanglar inom bredden x0…x0+w. */
function ribbonStripes(look: MedalLook, x0: number, w: number, y0: number, h: number): string {
  const [a, b, c] = [look.c1, look.c2, look.c3].map((k) => RIBBON_COLORS[k].hex);
  const rect = (x: number, width: number, fill: string) => `<rect x="${f(x)}" y="${y0}" width="${f(width + 0.4)}" height="${h}" fill="${fill}"/>`;
  switch (look.pattern) {
    case "delat":
      return rect(x0, w / 2, a!) + rect(x0 + w / 2, w / 2, b!);
    case "trefarg":
      return rect(x0, w / 3, a!) + rect(x0 + w / 3, w / 3, b!) + rect(x0 + (2 * w) / 3, w / 3, c!);
    case "mittrand":
      return rect(x0, w, a!) + rect(x0 + w * 0.4, w * 0.2, b!);
    case "kantrander":
      return rect(x0, w, a!) + rect(x0 + w * 0.08, w * 0.1, b!) + rect(x0 + w * 0.82, w * 0.1, b!);
    case "enfargat":
    default:
      return rect(x0, w, a!);
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

/** Lagerkrans: två grenar längs en båge runt (cx, cy) från botten och uppåt till vinkeln `top` (grader från botten). */
function laurel(cx: number, cy: number, r: number, fill: string, stroke: string, opts: { top?: number; leaves?: number; size?: number } = {}): string {
  const top = opts.top ?? 150;
  const n = opts.leaves ?? 9;
  const size = opts.size ?? 1;
  let out = "";
  for (const side of [-1, 1]) {
    // Stjälken
    const a0 = (12 * Math.PI) / 180;
    const a1 = (top * Math.PI) / 180;
    const p = (t: number) => [cx + side * r * Math.sin(t), cy + r * Math.cos(t)] as const;
    const [sx, sy] = p(a0);
    const [ex, ey] = p(a1);
    out += `<path d="M${f(sx)} ${f(sy)} A${r} ${r} 0 0 ${side === 1 ? 0 : 1} ${f(ex)} ${f(ey)}" fill="none" stroke="${fill}" stroke-width="${f(2.2 * size)}" stroke-linecap="round"/>`;
    // Bladpar längs stjälken: ett utåt och ett inåt
    for (let i = 0; i < n; i++) {
      const deg = 22 + (i * (top - 22)) / (n - 1);
      const t = (deg * Math.PI) / 180;
      const tangent = side * (deg - 90);
      for (const lean of [1, -1]) {
        const rot = tangent + side * lean * 34;
        const rr = r + lean * 3.6 * size;
        const lx = cx + side * rr * Math.sin(t);
        const ly = cy + rr * Math.cos(t);
        out += `<ellipse cx="${f(lx)}" cy="${f(ly)}" rx="${f(2.5 * size)}" ry="${f(6.4 * size)}" transform="rotate(${f(rot)} ${f(lx)} ${f(ly)})" fill="${fill}" stroke="${stroke}" stroke-width=".5"/>`;
      }
    }
  }
  return out;
}

/** Rättvisans våg: pelare med knopp, balk och två vågskålar i kedjor. Mitt (cx), topp (y0), skala s. */
function scales(cx: number, y0: number, s: number, fill: string, stroke: string): string {
  const X = (d: number) => f(cx + d * s);
  const Y = (d: number) => f(y0 + d * s);
  const sw = `stroke="${stroke}" stroke-width="${f(0.6)}"`;
  let out = "";
  // Pelare och fot
  out += `<rect x="${X(-1.8)}" y="${Y(6)}" width="${f(3.6 * s)}" height="${f(54 * s)}" fill="${fill}" ${sw}/>`;
  out += `<path d="M${X(-12)} ${Y(64)}Q${X(0)} ${Y(55)} ${X(12)} ${Y(64)}Z" fill="${fill}" ${sw}/>`;
  out += `<circle cx="${X(0)}" cy="${Y(3.5)}" r="${f(3.6 * s)}" fill="${fill}" ${sw}/>`;
  // Balk (lätt böjd) med kulor i ändarna
  out += `<path d="M${X(-30)} ${Y(13.5)}Q${X(0)} ${Y(9)} ${X(30)} ${Y(13.5)}" fill="none" stroke="${fill}" stroke-width="${f(3 * s)}" stroke-linecap="round"/>`;
  for (const side of [-1, 1]) {
    const bx = side * 30;
    out += `<circle cx="${X(bx)}" cy="${Y(13.5)}" r="${f(2.2 * s)}" fill="${fill}" ${sw}/>`;
    // Kedjor ned till skålen
    out += `<path d="M${X(bx)} ${Y(15)}L${X(bx - 10)} ${Y(38)}M${X(bx)} ${Y(15)}L${X(bx + 10)} ${Y(38)}" stroke="${fill}" stroke-width="${f(1.1 * s)}" fill="none"/>`;
    // Skål
    out += `<path d="M${X(bx - 13)} ${Y(38)}Q${X(bx)} ${Y(51)} ${X(bx + 13)} ${Y(38)}Z" fill="${fill}" ${sw}/>`;
  }
  return out;
}

/** Femuddig stjärna som path (yttre radie R, inre r), med spetsen uppåt. */
function starPath(cx: number, cy: number, R: number, r: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const a = (i * 36 * Math.PI) / 180;
    d += `${i ? "L" : "M"}${f(cx + Math.sin(a) * rad)} ${f(cy - Math.cos(a) * rad)}`;
  }
  return d + "Z";
}

/**
 * Medaljen som SVG. id gör gradienternas id unika när flera medaljer står på samma sida.
 * viewBox 0 0 160 260: bandet överst, ögla, medaljen under (mitt på y = 182).
 */
export function medalSvg(look: MedalLook, id: string, opts: { title?: string; className?: string } = {}): SafeHtml {
  const m = METALS[look.metal];
  const cx = 80;
  const cy = 184;
  const g = `${id}-g`;
  const metal = `url(#${g})`;
  const parts: string[] = [];

  // Metallens gradient i sidans koordinater, så att även raka linjer (kedjor, stjälkar) får glans.
  parts.push(`<defs>
<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="22" y1="112" x2="138" y2="252"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".35" stop-color="${m.stops[1]}"/><stop offset=".7" stop-color="${m.stops[2]}"/><stop offset="1" stop-color="${m.stops[3]}"/></linearGradient>
<linearGradient id="${g}r" gradientUnits="userSpaceOnUse" x1="138" y1="252" x2="22" y2="112"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".45" stop-color="${m.stops[1]}"/><stop offset="1" stop-color="${m.stops[3]}"/></linearGradient>
<radialGradient id="${g}h" cx=".34" cy=".28" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-fold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<linearGradient id="${id}-gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".45" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
<pattern id="${id}-rib" width="2.2" height="10" patternUnits="userSpaceOnUse"><rect width="1" height="10" fill="#000" fill-opacity=".08"/></pattern>
<clipPath id="${id}-band"><path d="M42 0H118V80L80 98L42 80Z"/></clipPath>
</defs>`);

  // Bandet: fält, ripsvävnad, skuggor vid vecket och en ljusreflex.
  parts.push(`<g clip-path="url(#${id}-band)">${ribbonStripes(look, 42, 76, 0, 100)}<rect x="42" width="76" height="100" fill="url(#${id}-rib)"/><rect x="42" width="76" height="100" fill="url(#${id}-gloss)"/><rect x="42" width="76" height="100" fill="url(#${id}-fold)"/></g>`);
  parts.push(`<path d="M42 80L80 98L118 80" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1"/>`);
  // Stången och öglan som medaljen hänger i
  parts.push(`<rect x="78.6" y="92" width="2.8" height="20" rx="1.2" fill="${metal}"/><circle cx="80" cy="117" r="4.6" fill="none" stroke="${metal}" stroke-width="2.2"/>`);

  const ink = m.ink;
  switch (look.motif) {
    case "rund": {
      // Rund medalj: kant, slät botten, vågen och lagerkransen i relief.
      parts.push(`<circle cx="${cx}" cy="${cy}" r="62" fill="${metal}" stroke="${ink}" stroke-opacity=".5" stroke-width=".8"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="55" fill="url(#${g}r)"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="55" fill="none" stroke="${m.light}" stroke-opacity=".55" stroke-width="1"/>`);
      const relief = (dx: number, dy: number, col: string, op: number) =>
        `<g transform="translate(${dx} ${dy})" opacity="${op}">${scales(cx, cy - 36, 0.95, col, col)}${laurel(cx, cy + 4, 42, col, col, { top: 108, leaves: 6, size: 0.85 })}</g>`;
      parts.push(relief(0.8, 0.9, m.light, 0.75) + relief(0, 0, ink, 0.85));
      parts.push(`<circle cx="${cx}" cy="${cy}" r="62" fill="url(#${g}h)"/>`);
      break;
    }
    case "sol": {
      // Solen: omväxlande långa och korta flammande strålar runt en skiva med JFK.
      let rays = "";
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i * 360) / n;
        const len = i % 2 ? 52 : 63;
        const w = i % 2 ? 6 : 8;
        const tip = cy - len;
        rays += `<path d="M${cx - w} ${cy - 26}Q${cx - w * 0.2} ${cy - (26 + len) / 2} ${cx + w * 0.3} ${tip}Q${cx + w * 0.6} ${cy - (26 + len) / 2} ${cx + w} ${cy - 26}Z" transform="rotate(${a} ${cx} ${cy})" fill="${metal}" stroke="${ink}" stroke-opacity=".45" stroke-width=".6"/>`;
      }
      parts.push(`<g>${rays}</g>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="31" fill="${metal}" stroke="${ink}" stroke-opacity=".5" stroke-width=".8"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="27" fill="url(#${g}r)"/><circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width=".8"/>`);
      const jfk = (dx: number, dy: number, col: string) =>
        `<text x="${cx + dx}" y="${cy + 7 + dy}" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="20" letter-spacing=".5" fill="${col}">JFK</text>`;
      parts.push(jfk(0.7, 0.8, m.light) + jfk(0, 0, ink));
      parts.push(`<circle cx="${cx}" cy="${cy}" r="63" fill="url(#${g}h)" opacity=".7"/>`);
      break;
    }
    case "stjarna": {
      // Femuddig stjärna med fasade spetsar (ljus och skugga på var sin sida om åsen).
      const R = 64;
      const r = 26;
      const sc = cy + 6;
      parts.push(`<path d="${starPath(cx, sc, R, r)}" fill="${metal}" stroke="${ink}" stroke-opacity=".55" stroke-width=".9" stroke-linejoin="round"/>`);
      let facets = "";
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 * Math.PI) / 180;
        const ax = cx + Math.sin(a) * R;
        const ay = sc - Math.cos(a) * R;
        for (const side of [-1, 1]) {
          const b = ((i * 72 + side * 36) * Math.PI) / 180;
          const bx = cx + Math.sin(b) * r;
          const by = sc - Math.cos(b) * r;
          facets += `<path d="M${f(cx)} ${f(sc)}L${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}Z" fill="${side < 0 ? m.light : ink}" fill-opacity="${side < 0 ? 0.28 : 0.22}"/>`;
        }
        facets += `<path d="M${f(cx)} ${f(sc)}L${f(ax)} ${f(ay)}" stroke="${ink}" stroke-opacity=".45" stroke-width=".7"/>`;
      }
      parts.push(facets);
      parts.push(`<path d="${starPath(cx, sc, R, r)}" fill="url(#${g}h)"/>`);
      break;
    }
    case "vag":
    default: {
      // Genombruten: lagerkransen nedtill och vågen ovanför, utan bakgrundsskiva. Öglan går genom vågens knopp.
      const vy = cy + 8;
      parts.push(laurel(cx, vy + 4, 44, metal, ink, { top: 105, leaves: 8 }));
      parts.push(`<path d="M${cx - 6} ${vy + 47}Q${cx} ${vy + 43} ${cx + 6} ${vy + 47}L${cx + 3} ${vy + 52}L${cx} ${vy + 49}L${cx - 3} ${vy + 52}Z" fill="${metal}" stroke="${ink}" stroke-width=".5"/>`);
      parts.push(scales(cx, vy - 74, 1.15, metal, ink));
      break;
    }
  }

  const label = opts.title ? `<title>${escapeXml(opts.title)}</title>` : "";
  const aria = opts.title ? ` role="img" aria-label="${escapeXml(opts.title)}"` : ` aria-hidden="true" focusable="false"`;
  return raw(`<svg class="${opts.className ?? "medal-svg"}" viewBox="0 0 160 260" xmlns="http://www.w3.org/2000/svg"${aria}>${label}${parts.join("")}</svg>`);
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
