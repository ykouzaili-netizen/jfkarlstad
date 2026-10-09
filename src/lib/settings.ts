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
 * Avsnitt med egna färgfält: sida → avsnitt → prefix i textregistret (fälten heter <prefix>_c_bg, _c_text, _c_accent
 * och läggs till med blockColorFields() i texts.ts). Avsnitt med egna utseenden i färg (Instagram, Utskotten på
 * Om oss, JFK Idrott och anmälan på Engagera dig) har medvetet inga – där styr utseendevalet bakgrunden.
 */
export const BLOCK_COLORS: Record<string, Record<string, string>> = {
  startsida: { partners: "home_partners", varden: "home_values", ordband: "wordband", intro: "home_intro", evenemang: "home_events", nyheter: "home_news", paverka: "home_paverka" },
  "om-oss": { om: "om_oss_om", styrning: "om_oss_styrning", styrelsen: "om_oss_styrelsen", pedagog: "om_oss_pedagog", samarbeten: "om_oss_samarbeten" },
  "bli-medlem": { formaner: "bli_medlem_formaner", faq: "bli_medlem_faq" },
  "for-studenter": { studera: "for_studenter_studera", jobb: "for_studenter_jobb", kursombud: "for_studenter_kursombud", galleri: "for_studenter_galleri" },
  "engagera-dig": { uppdrag: "engagera_dig_uppdrag", utskott: "engagera_dig_utskott", fler: "engagera_dig_fler" },
  "for-foretag": { varfor: "for_foretag_varfor", paket: "for_foretag_paket", formular: "for_foretag_formular" },
};

/**
 * Färgerna för ett avsnitt, eller null om inga är valda. Ingenting räknas om automatiskt: det som styrelsen
 * har valt används. Vill man anpassa text och detaljer efter en ny bakgrund föreslår adminpanelen det
 * (admin.js) och frågar först.
 */
export function blockColors(s: Settings, pageId: string, blockId: string): { cls: string; css: string } | null {
  const prefix = BLOCK_COLORS[pageId]?.[blockId];
  if (!prefix) return null;
  const get = (k: string) => {
    const v = (s as Record<string, string>)[`${prefix}_c_${k}`];
    return isHex(v) ? v.toLowerCase() : "";
  };
  const bg = get("bg");
  const text = get("text");
  const accent = get("accent");
  if (!bg && !text && !accent) return null;
  const name = `hb-${pageId}-${blockId}`;
  let vars = "";
  if (bg) vars += `--c-bg:${bg};--c-surface:${bg};`;
  if (text) vars += `--c-text:${text};--c-muted:color-mix(in srgb,${text} 74%,transparent);--c-border:color-mix(in srgb,${text} 14%,transparent);--c-hover:color-mix(in srgb,${text} 8%,transparent);`;
  if (accent) vars += `--c-accent:${accent};--c-on-accent:${readableOn(accent)};`;
  return { cls: ` ${name} has-colors`, css: `.${name}{${vars}}` };
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

/** CSS för alla avsnitt med egna färger (skrivs i sidans <style> i layout.ts). Värdena är kontrollerade hexkoder. */
export function blockColorCss(s: Settings): string {
  let css = honorsBandCss(s) + honorsGalleryCss(s) + pedagogCss(s);
  for (const [pageId, blocks] of Object.entries(BLOCK_COLORS)) {
    for (const blockId of Object.keys(blocks)) css += blockColors(s, pageId, blockId)?.css ?? "";
  }
  return css;
}

/** Lägger avsnittets färgklasser på varje <section> som avsnittet består av (ett avsnitt kan vara flera). */
export function withBlockColors(s: Settings, pageId: string, blockId: string, out: SafeHtml | string): SafeHtml | string {
  const colors = blockColors(s, pageId, blockId);
  if (!colors) return out;
  return raw(String(out).replace(/<section class="([^"]*)"/g, (_m, c: string) => `<section class="${c}${colors.cls}"`));
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
