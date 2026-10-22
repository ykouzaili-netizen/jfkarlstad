import { applyLayoutRow, arrangeBlocks, emptyLayout, type BlockRender, type SiteLayout } from "./pagelayout.js";
import { FIT_PREFIX, parseFit, type ImageFit } from "./imagefit.js";
import { contrastRatio, isHex, readableOn } from "./color.js";

import { ALL_FIELDS, editUrlFor, FIELD_INDEX, PAGES, type TextKey } from "./texts.js";
import { raw, type SafeHtml } from "./html.js";

/**
 * Inställningar = alla redigerbara texter (registret i texts.ts) + utseende och annat som inte är text.
 * Databasen (tabellen settings) skriver över standardvärdena, så en nyckel som saknas i databasen
 * får alltid ett vettigt värde.
 */
const EXTRA_DEFAULTS = {
  logo_key: "",
  /** Menyns ordning, namn och synlighet som JSON. Tom = standardmenyn (se views/nav.ts). */
  menu_config: "",
  /** Checklistan för styrelseskifte (JSON). */
  handover_state: "",
  /** Verksamhetsåret som visas på webbplatsen, t.ex. "2026/27" (src/lib/years.ts). Byts under Styrelseskifte. */
  service_year: "",
  /** "pa" = alla måste ha tvåstegsverifiering för att använda adminpanelen (Användare → Tvåstegsverifiering). */
  require_2fa: "av",
  font_heading: "playfair",
  /** Rörelse och animationer: "full" (standard), "lugn" (bara mjuka toningar) eller "av". */
  motion_level: "full",
  /** Introt med logotypen när man kommer till startsidan: "pa" (standard) eller "av". */
  intro_enabled: "pa",
  /** Introts utseende, se INTRO_STYLES. */
  intro_style: "sigill",
  color_background: "#fff7d6",
  color_accent: "#f1cc4d",
  color_button: "#f1cc4d",
  color_primary: "#141414",
  color_text: "#141414",
  color_surface: "#ffffff",
};

export type SettingKey = TextKey | keyof typeof EXTRA_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export const DEFAULT_SETTINGS: Settings = {
  ...(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.def])) as Record<TextKey, string>),
  ...EXTRA_DEFAULTS,
};

export const THEME_KEYS = [
  "color_background",
  "color_surface",
  "color_text",
  "color_primary",
  "color_accent",
  "color_button",
] as const satisfies readonly SettingKey[];

/** Valbara rubriktypsnitt. Cormorant har lägre x-höjd och behöver lite större storlek. */
export const HEADING_FONTS = {
  playfair: {
    label: "Playfair Display",
    file: "/assets/fonts/playfair-display.woff2",
    stack: '"Playfair Display","Cormorant Garamond",Georgia,serif',
    scale: "1",
    weight: "600",
  },
  cormorant: {
    label: "Cormorant Garamond",
    file: "/assets/fonts/cormorant-garamond.woff2",
    stack: '"Cormorant Garamond","Playfair Display",Georgia,serif',
    scale: "1.14",
    weight: "600",
  },
} as const;
export type HeadingFont = keyof typeof HEADING_FONTS;

export type MotionLevel = "full" | "lugn" | "av";

export const MOTION_LEVELS: Record<MotionLevel, { label: string; hint: string }> = {
  full: { label: "Full", hint: "Rubriker och bilder glider fram när man skrollar, och sidbyten tonar mjukt över" },
  lugn: { label: "Lugn", hint: "Innehållet tonar fram mjukt – inget glider eller rör sig" },
  av: { label: "Av", hint: "Allt visas direkt, utan animationer" },
};

/** Introts utseenden (intro.js). "blanda" = ett av de andra, olika varje gång. */
export const INTRO_STYLES = {
  sigill: { label: "Sigillet", hint: "En guldpunkt pulserar ut i en ring, vågen ritas, kransen växer och JFK glider upp (standard)" },
  ridan: { label: "Ridån", hint: "Logotypen träder fram ur mörkret – sedan lyfts den mörka ridån och avtäcker sidan" },
  vagen: { label: "Vågen", hint: "Vågskålarna väger upp och ned och stannar i jämvikt, sedan kommer JFK och kransen" },
  stampel: { label: "Stämpeln", hint: "Ljust papper där logotypen stämplas ned med en duns och en ring av bläck" },
  kransen: { label: "Lagerkransen", hint: "Lagerbladen flyger in från alla håll och sätter sig på plats runt JFK" },
  blanda: { label: "Blanda", hint: "Ett av utseendena ovan – olika varje gång någon kommer till sidan" },
} as const;
export type IntroStyle = keyof typeof INTRO_STYLES;

export function introStyle(s: Settings): IntroStyle {
  return s.intro_style in INTRO_STYLES ? (s.intro_style as IntroStyle) : "sigill";
}

export function motionLevel(s: Settings): MotionLevel {
  return s.motion_level === "lugn" || s.motion_level === "av" ? s.motion_level : "full";
}

export function headingFont(s: Settings): HeadingFont {
  return s.font_heading === "cormorant" ? "cormorant" : "playfair";
}

/**
 * Läs alla inställningar. `override` används av adminpanelens förhandsvisning för att visa
 * osparade ändringar – den skrivs aldrig till databasen. Med `override` (även tomt) märks
 * sidans texter upp så att förhandsvisningen kan göra dem klickbara (se ek/ec nedan).
 */
export async function loadSettings(db: D1Database, override?: Partial<Settings>): Promise<Settings> {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (override) MARKED.add(settings);
  const layout = emptyLayout();
  LAYOUTS.set(settings, layout);
  const slides = new Map<string, string[]>();
  SLIDES.set(settings, slides);
  try {
    const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
    const fits = new Map<string, ImageFit>();
    for (const row of results) {
      if (row.key in settings) settings[row.key as SettingKey] = row.value;
      else if (applyLayoutRow(layout, row.key, row.value)) continue;
      else if (row.key.startsWith(FIT_PREFIX)) {
        const fit = parseFit(row.value);
        if (fit) fits.set(row.key.slice(FIT_PREFIX.length), fit);
      } else if (row.key.startsWith(SLIDE_PREFIX)) {
        const field = row.key.slice(SLIDE_PREFIX.length);
        if (FIELD_INDEX.get(field)?.field.type === "image") slides.set(field, row.value.split(",").filter((k) => MEDIA_KEY_RE.test(k)));
      }
    }
    FITS.set(settings, fits);
  } catch (err) {
    // Databasen ska aldrig kunna fälla hela sajten – standardvärden räcker för att rendera.
    console.error("Kunde inte läsa inställningar", err);
  }
  if (override) {
    for (const [k, v] of Object.entries(override)) {
      if (typeof v !== "string") continue;
      if (k in settings) settings[k as SettingKey] = v;
      // Förhandsvisningen skickar även osparad ordning, dolda avsnitt och textstilar.
      else applyLayoutRow(layout, k, v);
    }
  }
  // Bildspel: bildfältet får alla sina bilder, "huvudbild|bild2|bild3". picture() visar då ett bildspel.
  for (const [field, extras] of slides) {
    const key = field as SettingKey;
    if (settings[key] && extras.length) settings[key] = [settings[key], ...extras].join("|");
  }
  return settings;
}

// ───────────────────── Bildspel ─────────────────────

/** Inställningsrad för ett bildspel: "bildspel:<bildfält>" = de extra bilderna efter huvudbilden, kommaseparerade. */
export const SLIDE_PREFIX = "bildspel:";
/** Giltig nyckel till en uppladdad fil (även förhandsvisningens platshållare "__fh__…"). */
export const MEDIA_KEY_RE = /^[A-Za-z0-9._-]{1,200}$/;
const SLIDES = new WeakMap<object, Map<string, string[]>>();

/** Är bildfältet ett bildspel, och vilka bilder finns efter huvudbilden? (Läses av adminpanelen.) */
export function slideshowOf(s: Settings, field: string): { on: boolean; extras: string[] } {
  const extras = SLIDES.get(s)?.get(field);
  return extras ? { on: true, extras } : { on: false, extras: [] };
}

/** Huvudbilden i ett bildfält som kan innehålla ett bildspel ("a|b|c" → "a"). */
export function firstImage(value: string | null | undefined): string {
  return (value ?? "").split("|")[0] ?? "";
}

/** Rader ur ett "lines"-fält, utan tomma rader. */

export function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Bygg CSS-variablerna för temat. Ogiltiga färger ersätts med standardvärdet, så inget kan injiceras i CSS. */
export function themeCss(s: Settings): string {
  const pick = (key: (typeof THEME_KEYS)[number]) => (isHex(s[key]) ? s[key] : DEFAULT_SETTINGS[key]).toLowerCase();
  const bg = pick("color_background");
  const surface = pick("color_surface");
  const text = pick("color_text");
  const primary = pick("color_primary");
  const accent = pick("color_accent");
  const button = pick("color_button");
  const font = HEADING_FONTS[headingFont(s)];
  return `:root{--c-bg:${bg};--c-surface:${surface};--c-text:${text};--c-primary:${primary};--c-on-primary:${readableOn(primary)};--c-accent:${accent};--c-on-accent:${readableOn(accent)};--c-button:${button};--c-on-button:${readableOn(button)};--font-display:${font.stack};--display-scale:${font.scale};--display-weight:${font.weight}}`;
}

// ───────────────────── Bildernas passform ─────────────────────

const FITS = new WeakMap<object, Map<string, ImageFit>>();
const LAYOUTS = new WeakMap<object, SiteLayout>();

/** Dolda sidor, avsnittens ordning och textstilar (inlästa av loadSettings()). */
export function siteLayout(s: Settings): SiteLayout {
  return LAYOUTS.get(s) ?? emptyLayout();
}

/** Synliga avsnitt i vald ordning – se arrangeBlocks() i pagelayout.ts. */
export function arrange(s: Settings, pageId: string, render: Record<string, BlockRender>): (SafeHtml | string)[] {
  const colored: Record<string, BlockRender> = {};
  for (const [id, fn] of Object.entries(render)) colored[id] = (prev) => withBlockColors(s, pageId, id, fn(prev));
  return arrangeBlocks(siteLayout(s), pageId, colored);
}

// ───────────────────── Egna färger per avsnitt ─────────────────────

/**
 * Ett färgset i textregistret: tre valfria fält <prefix>_c_bg, <prefix>_c_text och <prefix>_c_accent
 * (colorSet() i texts.ts). Typen är prefixen som finns i registret, så ett felstavat prefix ger typfel.
 */
export type ColorPrefix = { [K in TextKey]: K extends `${infer P}_c_bg` ? P : never }[TextKey];

export interface PickedColors {
  bg: string;
  text: string;
  accent: string;
}

/** De valda färgerna i ett set (tomt = sajtens vanliga). Bara giltiga hexkoder släpps igenom. */
export function pickColors(s: Settings, prefix: string): PickedColors {
  const get = (k: string) => {
    const v = (s as Record<string, string>)[`${prefix}_c_${k}`];
    return isHex(v) ? v.toLowerCase() : "";
  };
  return { bg: get("bg"), text: get("text"), accent: get("accent") };
}

const anyColor = (c: PickedColors) => !!(c.bg || c.text || c.accent);

/**
 * Färgvariablerna för ett avsnitt. Bakgrunden blir även ytan (så att avsnittets egen yta följer med), texten
 * styr även de tonade varianterna (muted, linjer, hover). Korten i avsnittet återställs i site.css (.has-colors).
 */
export function colorVars(c: PickedColors): string {
  let vars = "";
  if (c.bg) vars += `--c-bg:${c.bg};--c-surface:${c.bg};background:${c.bg};`;
  if (c.text) vars += `--c-text:${c.text};--c-muted:color-mix(in srgb,${c.text} 74%,transparent);--c-border:color-mix(in srgb,${c.text} 14%,transparent);--c-hover:color-mix(in srgb,${c.text} 8%,transparent);color:${c.text};`;
  if (c.accent) vars += `--c-accent:${c.accent};--c-on-accent:${readableOn(c.accent)};`;
  return vars;
}

/**
 * Avsnitt med egna färgfält: sida → avsnitt → prefix i textregistret. Klasserna läggs på varje <section> i
 * avsnittet av arrange()/withBlockColors(). Avsnitt som inte kan flyttas får klassen direkt i mallen med sc().
 */
export const BLOCK_COLORS: Record<string, Record<string, ColorPrefix>> = {
  startsida: { partners: "home_partners", varden: "home_values", ordband: "wordband", intro: "home_intro", evenemang: "home_events", nyheter: "home_news", paverka: "home_paverka", instagram: "home_insta" },
  "om-oss": { om: "om_oss_om", styrning: "om_oss_styrning", styrelsen: "om_oss_styrelsen", utskott: "om_oss_utskott", utmarkelser: "om_oss_utmarkelser", pedagog: "om_oss_pedagog", samarbeten: "om_oss_samarbeten" },
  "bli-medlem": { formaner: "bli_medlem_formaner", faq: "bli_medlem_faq" },
  "for-studenter": { studera: "for_studenter_studera", jobb: "for_studenter_jobb", kursombud: "for_studenter_kursombud", idrott: "for_studenter_idrott", galleri: "for_studenter_galleri" },
  "engagera-dig": { uppdrag: "engagera_dig_uppdrag", utskott: "engagera_dig_utskott", fler: "engagera_dig_fler" },
  "for-foretag": { varfor: "for_foretag_varfor", aret: "for_foretag_aret", paket: "for_foretag_paket", formular: "for_foretag_formular" },
};

/**
 * Avsnitt som får sina färger med sc() direkt i mallen (sidor utan flyttbara avsnitt, undersidor och bekräftelser).
 * CSS:en för dem skrivs alltid (den är liten och bara för valda färger).
 */
export const SECTION_COLOR_SETS = [
  // Om oss: utskottens och nätverkens egna sidor
  "committee_top", "committee_meet", "committee_about", "committee_photos", "committee_events", "committee_archive", "committee_more",
  "network_top", "network_info", "network_photos", "network_more",
  // Formulärsidorna och bekräftelserna
  "nominate_form", "nominate_thanks", "engage_thanks", "companies_thanks", "paverka_form", "paverka_thanks", "contact_form", "contact_thanks",
  // Listor och undersidor
  "jobs_list", "job_page", "partners_list", "partner_page", "partner_more", "news_list", "news_article", "calendar_month", "calendar_past", "event_page",
  "docs_list", "doc_page", "faq_list", "search_results", "privacy_body", "cookies_body", "error_page",
] as const satisfies readonly ColorPrefix[];
export type SectionColorSet = (typeof SECTION_COLOR_SETS)[number];

/** Klasserna för ett avsnitt med egna färger, att lägga i class="…" i mallen. Tom sträng utan valda färger. */
export function sc(s: Settings, prefix: SectionColorSet): string {
  const mark = MARKED.has(s) ? ` em-sec--${prefix}` : "";
  return (anyColor(pickColors(s, prefix)) ? ` sc-${prefix} has-colors` : "") + mark;
}

/**
 * Färgerna för ett flyttbart avsnitt, eller null om inga är valda. Ingenting räknas om automatiskt: det som
 * styrelsen har valt används. Vill man anpassa text och detaljer efter en ny bakgrund föreslår adminpanelen det
 * (admin.js) och frågar först. Dubbla klassen i CSS:en väger tyngre än avsnittens egna utseenden (t.ex.
 * JFK Idrott och Instagram), som annars bestämmer bakgrunden själva.
 */
export function blockColors(s: Settings, pageId: string, blockId: string): { cls: string; css: string } | null {
  const prefix = BLOCK_COLORS[pageId]?.[blockId];
  if (!prefix) return null;
  const c = pickColors(s, prefix);
  if (!anyColor(c)) return null;
  const name = `hb-${pageId}-${blockId}`;
  return { cls: ` ${name} has-colors`, css: `.${name}.has-colors{${colorVars(c)}}` };
}

/**
 * Egna färger för utseendet Ordensbandet (Hedersmedlemmar och utmärkelser på Om oss). Tomt = gul yta med svart text.
 * Detaljerna (linjen över banden, mottagarnas brickor och initialer) följer texten om de inte är valda; texten i
 * brickorna har bakgrundens färg – eller svart/vitt om den skulle bli svårläst.
 */
export function honorsBandCss(s: Settings): string {
  const pick = (v: string) => (isHex(v) ? v.toLowerCase() : "");
  const bg = pick(s.honors_band_c_bg);
  const text = pick(s.honors_band_c_text);
  const detail = pick(s.honors_band_c_accent);
  if (!bg && !text && !detail) return "";
  let vars = "";
  if (bg) vars += `--hb-bg:${bg};`;
  // På en mörk bakgrund blir de ljusa korten för hedersmedlemmarna svårlästa – tona dem med textfärgen i stället.
  if (bg && contrastRatio(bg, "#ffffff") > contrastRatio(bg, "#141414")) vars += "--hb-card:color-mix(in srgb,var(--hb-text) 10%,transparent);";
  if (text) vars += `--hb-text:${text};`;
  if (detail) vars += `--hb-detail:${detail};`;
  const d = detail || text;
  if (d && bg && contrastRatio(d, bg) < 3) vars += `--hb-on-detail:${readableOn(d)};`;
  return `.honors--band{${vars}}`;
}

/**
 * Egna färger för utseendet Porträttgalleriet. Samma variabler som avsnittsfärgerna (blockColors), så att
 * text, tunna linjer och detaljer följer med – men bara för just det utseendet.
 */
export function honorsGalleryCss(s: Settings): string {
  const pick = (v: string) => (isHex(v) ? v.toLowerCase() : "");
  const bg = pick(s.honors_gallery_c_bg);
  const text = pick(s.honors_gallery_c_text);
  const accent = pick(s.honors_gallery_c_accent);
  if (!bg && !text && !accent) return "";
  let vars = "";
  if (bg) vars += `--c-bg:${bg};--c-surface:${bg};`;
  if (text) vars += `--c-text:${text};--c-muted:color-mix(in srgb,${text} 74%,transparent);--c-border:color-mix(in srgb,${text} 14%,transparent);--c-hover:color-mix(in srgb,${text} 8%,transparent);`;
  if (accent) vars += `--c-accent:${accent};--c-on-accent:${readableOn(accent)};`;
  return `.honors--galleri{${vars}}`;
}

/**
 * Egna färger för Årets pedagog, utseendet Plaketterna. Standard (i site.css) är sajtens primära färg som
 * bakgrund och accentfärgen på plaketterna. Textfärgen på plaketterna räknas ut (svart eller vit).
 */
export function pedagogCss(s: Settings): string {
  const pick = (v: string) => (isHex(v) ? v.toLowerCase() : "");
  const bg = pick(s.pedagog_c_bg);
  const text = pick(s.pedagog_c_text);
  const accent = pick(s.pedagog_c_accent);
  if (!bg && !text && !accent) return "";
  let vars = "";
  if (bg) vars += `--pd-bg:${bg};`;
  // Ny bakgrund utan vald textfärg: läsbar text räknas ut i stället för att behålla den som passade den gamla.
  if (text || bg) vars += `--pd-text:${text || readableOn(bg)};`;
  if (accent) vars += `--pd-accent:${accent};--pd-on-accent:${readableOn(accent)};`;
  return `.pedagog--plaketter{${vars}}`;
}

/**
 * Vilken sida i textregistret en adress hör till (för sidans egna färger): exakt adress eller den längsta
 * sidadress som adressen börjar med, t.ex. /aktuellt/en-nyhet → aktuellt. Startsidan bara på "/".
 */
export function pageIdForPath(path: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const p of PAGES) {
    if (p.id === "gemensamt") continue;
    const hit = p.path === "/" ? path === "/" : path === p.path || path.startsWith(p.path + "/");
    if (hit && (!best || p.path.length > best.len)) best = { id: p.id, len: p.path.length };
  }
  return best?.id ?? null;
}

/**
 * Egna färger för en hel sida (Texter och sidor → sidan → Sidans färger). Gäller innehållet (main), inte
 * sidhuvud och sidfot. Bara det som styrelsen valt används – adminpanelen föreslår att anpassa text och
 * detaljer när bakgrunden byts. Med en egen textfärg som inte syns mot korten tonas korten i stället.
 */
export function pageColorCss(s: Settings, pageId: string | null): string {
  if (!pageId) return "";
  const get = (k: string) => {
    const v = (s as Record<string, string>)[`pg_${pageId}_c_${k}`];
    return isHex(v) ? v.toLowerCase() : "";
  };
  const bg = get("bg");
  const text = get("text");
  const accent = get("accent");
  if (!bg && !text && !accent) return "";
  let vars = "";
  if (bg) vars += `--c-bg:${bg};background:${bg};`;
  if (text) {
    vars += `--c-text:${text};--c-muted:color-mix(in srgb,${text} 74%,transparent);--c-border:color-mix(in srgb,${text} 14%,transparent);--c-hover:color-mix(in srgb,${text} 8%,transparent);color:${text};`;
    const surface = isHex(s.color_surface) ? s.color_surface : "#ffffff";
    if (contrastRatio(text, surface) < 4.5) vars += `--c-surface:color-mix(in srgb,${text} 8%,${bg || "var(--c-bg)"});`;
  }
  if (accent) vars += `--c-accent:${accent};--c-on-accent:${readableOn(accent)};`;
  return `#innehall{${vars}}`;
}

/** Prefixet för en sidas egen topp i textregistret, t.ex. om-oss → top_om_oss. */
export const topPrefix = (pageId: string) => `top_${pageId.replace(/-/g, "_")}`;

/** Sidor vars topp är sidans vanliga topp (pageHeader) och därför har ett eget färgset för toppen. */
export const PAGES_WITH_TOP = [
  "om-oss", "nominera", "bli-medlem", "for-studenter", "karriar", "engagera-dig", "for-foretag", "partners", "aktuellt",
  "kalender", "dokument", "faq", "jf-paverka", "kontakt", "sok", "integritet",
] as const;

/**
 * Sidhuvudet och sidfoten (Texter och sidor → Gemensamt). Sidhuvudet byter färgvariablerna, så att menyerna
 * och mobilmenyn följer med; över startsidans bild är det fortfarande genomskinligt. Sidfoten är byggd på
 * primärfärgen – utan vald textfärg räknas en läsbar ut (svart eller vit), eftersom en ny bakgrund annars
 * kan göra all text i sidfoten oläslig.
 */
/** I sidhuvudet och sidfoten är detaljerna även knapparna (”Bli medlem”), så att de alltid syns mot bakgrunden. */
const chromeAccent = (a: string) => `--c-accent:${a};--c-on-accent:${readableOn(a)};--c-button:${a};--c-on-button:${readableOn(a)};`;

export function chromeColorCss(s: Settings): string {
  let css = "";
  const h = pickColors(s, "header");
  if (anyColor(h)) {
    let vars = "";
    if (h.bg) vars += `--c-bg:${h.bg};--c-surface:${h.bg};`;
    if (h.text) vars += `--c-text:${h.text};--c-muted:color-mix(in srgb,${h.text} 70%,transparent);--c-border:color-mix(in srgb,${h.text} 16%,transparent);--c-hover:color-mix(in srgb,${h.text} 8%,transparent);color:${h.text};`;
    if (h.accent) vars += chromeAccent(h.accent);
    css += `.site-header{${vars}}`;
  }
  const f = pickColors(s, "footer");
  if (anyColor(f)) {
    let vars = "";
    if (f.bg) vars += `--c-primary:${f.bg};`;
    if (f.text || f.bg) vars += `--c-on-primary:${f.text || readableOn(f.bg)};`;
    if (f.accent) vars += chromeAccent(f.accent);
    css += `.site-footer{${vars}}`;
  }
  return css;
}

/**
 * Färger för sidans topp och sidans egna, särskilda delar – bara på den sidan som visas.
 * - Undersidornas topp: sidans eget set (top_<sida>) om något är valt, annars Gemensamt → Sidornas topp (tops).
 *   Ett eget set ersätter standarden helt, så att färger från två ställen aldrig blandas till något oläsligt.
 *   :where() gör regeln svag: toppar med bild (Helbild, partnerns bakgrundsbild) behåller sin vita text.
 * - Startsidans topp: bakgrunden syns när ingen bild är vald; med bild ligger texten alltid vit på en mörk ton.
 * - Tävlingen och butiken har egna utseenden byggda på sajtens färger – där byts de variablerna.
 */
export function pageExtraColorCss(s: Settings, pageId: string | null): string {
  if (!pageId) return "";
  let css = "";
  if ((PAGES_WITH_TOP as readonly string[]).includes(pageId)) {
    const own = pickColors(s, topPrefix(pageId));
    const c = anyColor(own) ? own : pickColors(s, "tops");
    if (anyColor(c)) css += `:where(#innehall) :is(.page-hero,.page-top){${colorVars(c)}}`;
  }
  if (pageId === "startsida") {
    const c = pickColors(s, "home_hero");
    if (c.bg) css += `.hero:not(.has-image){background:${c.bg};color:${c.text || readableOn(c.bg)}}`;
    else if (c.text) css += `.hero:not(.has-image){color:${c.text}}`;
    if (c.accent) css += `.hero{--c-accent:${c.accent};--c-on-accent:${readableOn(c.accent)}}`;
  }
  if (pageId === "tavling") {
    const page = pickColors(s, "tavling_page");
    if (anyColor(page)) {
      let vars = "";
      if (page.bg) vars += `--c-bg:${page.bg};`;
      if (page.text) vars += `--c-text:${page.text};`;
      if (page.accent) vars += `--c-accent:${page.accent};--c-on-accent:${readableOn(page.accent)};`;
      css += `.jfk-tavling.jfk-tavling{${vars}}`;
    }
    const top = pickColors(s, "tavling_top");
    if (anyColor(top)) {
      let vars = "";
      if (top.bg) vars += `--t-hero-bg:${top.bg};--t-navy-3:${top.bg};`;
      const text = top.text || (top.bg ? readableOn(top.bg) : "");
      if (text) vars += `--t-hero-text:${text};--t-hero-muted:color-mix(in srgb,${text} 76%,transparent);--t-hero-line:color-mix(in srgb,${text} 14%,transparent);`;
      if (top.accent) vars += `--t-gold:${top.accent};--t-on-gold:${readableOn(top.accent)};`;
      css += `.jfk-tavling .t-hero{${vars}}`;
    }
  }
  if (pageId === "butik") css += shopColorCss(s);
  return css;
}

/**
 * Butikens färger: fältet överst och de tre tonerna som avsnitten växlar mellan (mörk = primärfärgen, gul =
 * accentfärgen, ljus = bakgrunden). Varje ton har bakgrund, text och detaljer; utan vald text räknas en läsbar ut.
 */
function shopColorCss(s: Settings): string {
  let css = "";
  const tone = (prefix: string, sel: string, map: (c: PickedColors, text: string) => string) => {
    const c = pickColors(s, prefix);
    if (!anyColor(c)) return;
    css += `${sel}{${map(c, c.text || (c.bg ? readableOn(c.bg) : ""))}}`;
  };
  const accent = (a: string) => (a ? `--c-accent:${a};--c-on-accent:${readableOn(a)};` : "");
  tone("shop_bar", ".jfk-butik .shop-bar", (c, t) => `${c.bg ? `--c-primary:${c.bg};` : ""}${t ? `--c-on-primary:${t};` : ""}${accent(c.accent)}`);
  tone("shop_dark", ".jfk-butik :is(.shop-tone-dark,.shop-why)", (c, t) => `${c.bg ? `--c-primary:${c.bg};` : ""}${t ? `--c-on-primary:${t};` : ""}${accent(c.accent)}`);
  tone("shop_accent", ".jfk-butik :is(.shop-tone-accent,.shop-next-band)", (c, t) =>
    `${c.bg ? `--c-accent:${c.bg};` : ""}${t ? `--c-on-accent:${t};` : ""}${c.accent ? `--c-primary:${c.accent};--c-on-primary:${readableOn(c.accent)};` : ""}`);
  tone("shop_light", ".jfk-butik :is(.shop-tone-light,.shop-tone-surface,.shop-rest,.shop-archive,.shop-info,.shop-cart-page)", (c) =>
    `${c.bg ? `--c-bg:${c.bg};background:${c.bg};` : ""}${c.text ? `--c-text:${c.text};color:${c.text};` : ""}${accent(c.accent)}`);
  return css;
}

/** Egna färger för Biografen (filmerna). Standard i site.css: primär färg som bakgrund, accentfärgen på detaljerna. */
export function filmsCss(s: Settings): string {
  const pick = (v: string) => (isHex(v) ? v.toLowerCase() : "");
  const bg = pick(s.films_c_bg);
  const text = pick(s.films_c_text);
  const accent = pick(s.films_c_accent);
  if (!bg && !text && !accent) return "";
  let vars = "";
  if (bg) vars += `--fm-bg:${bg};`;
  if (text || bg) vars += `--fm-text:${text || readableOn(bg)};`;
  if (accent) vars += `--fm-accent:${accent};--fm-on-accent:${readableOn(accent)};`;
  return `.cine{${vars}}`;
}

/** CSS för alla avsnitt med egna färger (skrivs i sidans <style> i layout.ts). Värdena är kontrollerade hexkoder. */
export function blockColorCss(s: Settings): string {
  let css = honorsBandCss(s) + honorsGalleryCss(s) + pedagogCss(s) + filmsCss(s);
  for (const [pageId, blocks] of Object.entries(BLOCK_COLORS)) {
    for (const blockId of Object.keys(blocks)) css += blockColors(s, pageId, blockId)?.css ?? "";
  }
  for (const prefix of SECTION_COLOR_SETS) {
    const c = pickColors(s, prefix);
    if (anyColor(c)) css += `.sc-${prefix}.has-colors{${colorVars(c)}}`;
  }
  return css + chromeColorCss(s);
}

/** Lägger avsnittets färgklasser på varje <section> som avsnittet består av (ett avsnitt kan vara flera). */
export function withBlockColors(s: Settings, pageId: string, blockId: string, out: SafeHtml | string): SafeHtml | string {
  const colors = blockColors(s, pageId, blockId);
  // I förhandsvisningen märks avsnittet, så att ett klick på bakgrunden leder till avsnittets färger.
  const prefix = BLOCK_COLORS[pageId]?.[blockId];
  const cls = (colors?.cls ?? "") + (MARKED.has(s) && prefix ? ` em-sec--${prefix}` : "");
  if (!cls) return out;
  return raw(String(out).replace(/<section class="([^"]*)"/g, (_m, c: string) => `<section class="${c}${cls}"`));
}

/**
 * Bara i adminpanelens förhandsvisning: gör varje del av sidan klickbar så att ett klick på dess bakgrund leder
 * till dess färger (data-ek på färgfältet för bakgrunden). Texter och kort inuti har egna märken och vinner.
 * Avsnitten märks med klassen em-sec--<prefix> (sc()/withBlockColors()); toppar och sidans egna delar känns
 * igen på sina klasser.
 */
export function markColorAreas(s: Settings, body: string, pageId: string | null): string {
  if (!MARKED.has(s)) return body;
  const attrs = (prefix: string) => String(ek(s, `${prefix}_c_bg` as SettingKey));
  const known = new Set<string>(ALL_FIELDS.map((f) => f.key));
  const addTo = (tag: string, prefix: string) => (known.has(`${prefix}_c_bg`) && !/\sdata-ek=/.test(tag) ? tag.replace(/>$/, `${attrs(prefix)}>`) : tag);
  let out = body.replace(/<[a-z]+\b[^>]*\bclass="[^"]*\bem-sec--([a-z0-9_]+)[^"]*"[^>]*>/g, (tag, prefix: string) => addTo(tag, prefix));
  const first = (re: RegExp, prefix: string) => {
    out = out.replace(re, (tag) => addTo(tag, prefix));
  };
  if (pageId && (PAGES_WITH_TOP as readonly string[]).includes(pageId)) first(/<(?:section|header) class="page-(?:hero|top)\b[^>]*>/, topPrefix(pageId));
  if (pageId === "startsida") first(/<section class="hero\b[^>]*>/, "home_hero");
  if (pageId === "tavling") {
    first(/<section class="t-hero\b[^>]*>/, "tavling_top");
    first(/<div class="jfk-tavling\b[^>]*>/, "tavling_page");
  }
  if (pageId === "butik") {
    out = out.replace(/<div class="shop-bar\b[^>]*>/g, (t) => addTo(t, "shop_bar"));
    out = out.replace(/<section class="[^"]*\b(shop-tone-dark|shop-why)\b[^>]*>/g, (t) => addTo(t, "shop_dark"));
    out = out.replace(/<(?:section|div) class="[^"]*\b(shop-tone-accent|shop-next-band)\b[^>]*>/g, (t) => addTo(t, "shop_accent"));
    out = out.replace(/<section class="[^"]*\b(shop-tone-light|shop-tone-surface|shop-rest|shop-archive|shop-info|shop-cart-page)\b[^>]*>/g, (t) => addTo(t, "shop_light"));
  }
  return out;
}

/** Justerade bilder (filnyckel → passform), inlästa av loadSettings(). */
export function imageFits(s: Settings): ReadonlyMap<string, ImageFit> {
  return FITS.get(s) ?? new Map();
}

// ───────────────────── Klickbar förhandsvisning ─────────────────────

/** Inställningsobjekt som renderas i adminpanelens förhandsvisning. */
const MARKED = new WeakSet<object>();

export function isMarked(s: Settings): boolean {
  return MARKED.has(s);
}

/**
 * Märk ett element med textnyckeln det visar (bara i förhandsvisningen). Används som attribut:
 * `<h2 class="x"${ek(s, "home_news_title")}>`. På den publika webbplatsen blir det ingenting.
 */
export function ek(s: Settings, key: SettingKey): SafeHtml {
  // data-t bär textens egen storlek/justering (textStyleCss). På den publika sajten bara när texten har en stil.
  const styled = siteLayout(s).styles.has(key);
  if (!MARKED.has(s)) return raw(styled ? ` data-t="${key}"` : "");
  const loc = FIELD_INDEX.get(key);
  const url = editUrlFor(key) ?? (key === "logo_key" ? "/admin/utseende#logotyp" : null);
  if (!url) return raw(styled ? ` data-t="${key}"` : "");
  const label = loc ? `${loc.page.title} › ${loc.field.label}` : "Logotyp";
  return raw(` data-t="${key}" data-ek="${key}" data-eu="${escapeAttr(url)}" data-el="${escapeAttr(label)}"`);
}

/** Märk innehåll (en nyhet, ett event …) med adressen där det redigeras. */
export function ec(s: Settings, editUrl: string, label: string): SafeHtml {
  if (!MARKED.has(s)) return raw("");
  return raw(` data-eu="${escapeAttr(editUrl)}" data-el="${escapeAttr(label)}"`);
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
