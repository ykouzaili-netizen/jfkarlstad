import type { Env } from "../env.js";

/**
 * Adresser från den gamla webbplatsen (jfkarlstad.se före hösten 2026) skickas vidare till motsvarande sida
 * på den nya med 301 (flyttad permanent), så att bokmärken, gamla länkar och Google hamnar rätt – och Google
 * flyttar över sidornas placering i sökresultaten till de nya adresserna.
 *
 * Tre lager, i ordning:
 *  1. Styrelsens egna omdirigeringar (Texter och sidor → Felsidan → Gamla adresser), en per rad.
 *  2. Kända adresser från den gamla sajten (OLD_PAGES nedan).
 *  3. Övriga adresser som ser ut att komma från den gamla sajten (.html, .pdf, gamla mappar) skickas till
 *     den sida som passar bäst utifrån orden i adressen – eller till startsidan.
 * Målet är alltid en sida på den här webbplatsen (ingen öppen omdirigering).
 */

/** Kända sidor på den gamla sajten (från Googles index). Nycklarna är normaliserade, se normalize(). */
const OLD_PAGES: Record<string, string> = {
  "/index.html": "/",
  "/index.htm": "/",
  "/om-jfk": "/om-oss",
  "/om-jfk/index.html": "/om-oss",
  "/om-jfk/externt/juro.html": "/om-oss#samarbeten",
  "/om-jfk/styrdokument/medlemspolicy.html": "/dokument",
  "/jf-klaga.html": "/jf-paverka",
  "/kontakt.html": "/kontakt",
  "/nyhetsbrev.html": "/aktuellt",
  "/utbildning": "/for-studenter",
  "/galleri": "/for-studenter#bildgalleri",
  "/ny-student/checklista.html": "/for-studenter",
  "/ny-student/cecklista.html": "/for-studenter",
  "/student/ny-student-1/index.html": "/for-studenter",
  "/student/ny-student-1/gratulerar-till-antagningsbeskedet.html": "/for-studenter",
  "/karri-rm-jligheter/lediga-tj-nster-1.html": "/karriar",
};

/** Mappar som bara fanns på den gamla sajten. */
const OLD_FOLDERS = ["/om-jfk", "/utbildning", "/student", "/ny-student", "/galleri", "/karri", "/styrdokument", "/externt", "/nyheter", "/evenemang", "/samarbetspartners", "/medlemskap"];

/** Ord i en gammal adress → bästa sidan. Första träffen gäller, så de mest specifika står först. */
const KEYWORDS: [RegExp, string][] = [
  [/styrdokument|stadga|policy|protokoll|verksamhet|arsmote|rsm-te|\.pdf$/, "/dokument"],
  [/klaga|paverka|p-verka/, "/jf-paverka"],
  [/kontakt/, "/kontakt"],
  [/karri|jobb|tj-nst|tjanst|praktik|lediga/, "/karriar"],
  [/galleri|bilder|foto/, "/for-studenter#bildgalleri"],
  [/idrott|sport/, "/for-studenter#jfk-idrott"],
  [/kursombud/, "/for-studenter#kursombud"],
  [/juro|elsa|externt/, "/om-oss#samarbeten"],
  [/styrelse/, "/om-oss#styrelsen"],
  [/utskott/, "/om-oss#utskotten"],
  [/partner|sponsor/, "/partners"],
  [/foretag|f-retag/, "/for-foretag"],
  [/medlem/, "/bli-medlem"],
  [/engagera|engagemang/, "/engagera-dig"],
  [/student|utbildning|checklista|cecklista|antagning|termin/, "/for-studenter"],
  [/nyhet|blogg|aktuellt|news/, "/aktuellt"],
  [/event|evenemang|kalender|aktivitet|sittning|bankett/, "/kalender"],
  [/faq|fragor|fr-gor/, "/faq"],
  [/integritet|gdpr|cookie|kakor/, "/integritetspolicy"],
  [/om-jfk|om-oss|om-foreningen|om-f-reningen/, "/om-oss"],
];

/** Gemener, avkodad, utan avslutande snedstreck och utan ?frågor. */
function normalize(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* behåll som den är */
  }
  p = p.toLowerCase().replace(/\/+$/, "");
  return p || "/";
}

/** Ser adressen ut att komma från den gamla sajten? (Nya sajtens adresser har inga filändelser.) */
export function looksLikeOldAddress(path: string): boolean {
  const p = normalize(path);
  if (p.startsWith("/assets/") || p.startsWith("/media/") || p.startsWith("/dokument/fil/") || p.startsWith("/admin")) return false;
  if (/\.(html?|php|aspx?|pdf)$/.test(p)) return true;
  return OLD_FOLDERS.some((f) => p === f || p.startsWith(f + "/") || p.startsWith(f + "-"));
}

/** Den inbyggda gissningen för en gammal adress (lager 2 och 3). */
export function builtInTarget(path: string): string | null {
  const p = normalize(path);
  if (OLD_PAGES[p]) return OLD_PAGES[p]!;
  if (!looksLikeOldAddress(path)) return null;
  for (const [re, target] of KEYWORDS) if (re.test(p)) return target;
  return "/";
}

/** En rad i styrelsens lista: "/gammal-adress → /ny-sida" (pil, -> eller mellanslag mellan). */
export interface RedirectRule {
  from: string;
  to: string;
}

/**
 * Tolkar styrelsens lista. Hela adresser (https://jfkarlstad.se/x.html) blir sökvägar. Målet måste vara en
 * sida på den här webbplatsen; rader som inte går att tolka hoppas över (och visas som fel i adminpanelen).
 */
export function parseRedirects(text: string): { rules: RedirectRule[]; bad: string[] } {
  const rules: RedirectRule[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s*(?:→|->|=>)\s*|\s+/).filter(Boolean);
    const from = parts.length === 2 ? toPath(parts[0]!) : null;
    const to = parts.length === 2 ? toPath(parts[1]!, true) : null;
    if (!from || !to || from === "/" || normalize(from) === normalize(to.split("#")[0]!)) bad.push(line);
    else rules.push({ from: normalize(from), to });
  }
  return { rules, bad };
}

/** "https://jfkarlstad.se/a/b.html" eller "/a/b.html" → "/a/b.html". Mål får behålla #ankare. */
function toPath(value: string, keepHash = false): string | null {
  let v = value.trim();
  const full = /^https?:\/\/(?:www\.)?([^/]+)(\/.*)?$/i.exec(v);
  if (full) {
    // Bara adresser på den egna domänen (eller workers.dev-adressen) – aldrig en annan webbplats.
    if (!/(^|\.)jfkarlstad\.se$|\.workers\.dev$/i.test(full[1]!)) return null;
    v = full[2] ?? "/";
  }
  if (!v.startsWith("/") || v.startsWith("//") || /[\s<>"'\\]/.test(v)) return null;
  const [beforeHash, hash] = v.split("#", 2) as [string, string | undefined];
  const path = beforeHash.split("?")[0]!;
  return keepHash && hash && /^[a-z0-9_-]+$/i.test(hash) ? `${path}#${hash}` : path;
}

/** Var ska en adress som inte finns skickas? null = ingen omdirigering (visa felsidan). */
export async function findRedirect(env: Env, path: string): Promise<string | null> {
  const p = normalize(path);
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'redirects'").first<{ value: string }>();
    if (row?.value) {
      const hit = parseRedirects(row.value).rules.find((r) => r.from === p);
      if (hit) return hit.to;
    }
  } catch {
    /* databasen svarar inte – använd de inbyggda reglerna */
  }
  return builtInTarget(path);
}
