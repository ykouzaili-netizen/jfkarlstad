import { stockholmToday } from "./format.js";

/**
 * Verksamhetsår ("2026/27"): styrelsen och utskottens medlemmar hör till ett år. Webbplatsen visar året i
 * inställningen service_year (byts under Styrelseskifte); äldre år blir "Tidigare år" och ett senare år är
 * nästa styrelse som läggs in i förväg. En rad utan år räknas till året som visas.
 */

const YEAR_RE = /^(20\d\d)\/(\d\d)$/;

/** "2026/27" – rätt form och två år i följd. */
export function isServiceYear(v: string): boolean {
  const m = YEAR_RE.exec(v);
  return !!m && (Number(m[1]) + 1) % 100 === Number(m[2]);
}

const startOf = (y: string) => Number(y.slice(0, 4));
const yearFrom = (start: number) => `${start}/${String((start + 1) % 100).padStart(2, "0")}`;

export const nextYear = (y: string) => yearFrom(startOf(y) + 1);
export const prevYear = (y: string) => yearFrom(startOf(y) - 1);

/** Året som pågår enligt kalendern: från 1 juli (efter vårens årsmöte och styrelseskifte). */
export function calendarYear(today = stockholmToday()): string {
  const y = Number(today.slice(0, 4));
  return yearFrom(Number(today.slice(5, 7)) >= 7 ? y : y - 1);
}

/** Året som visas på webbplatsen. */
export function shownYear(setting: string): string {
  return isServiceYear(setting) ? setting : calendarYear();
}

/** Valen i formulären: några år bakåt (för att fylla i arkivet), året som visas och nästa år. */
export function yearOptions(shown: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 1; i >= -6; i--) {
    const y = yearFrom(startOf(shown) + i);
    out.push({ value: y, label: i === 0 ? `${y} – visas nu` : i === 1 ? `${y} – nästa år (visas efter styrelseskiftet)` : `${y} – tidigare år` });
  }
  return out;
}

/** Hur ett år förhåller sig till året som visas. */
export function yearState(year: string, shown: string): "nu" | "tidigare" | "kommande" {
  if (!year || year === shown) return "nu";
  return year < shown ? "tidigare" : "kommande";
}

/**
 * Delar personer i de som visas nu och de tidigare åren (nyast först). Kommande år visas inte alls.
 * Ordningen inom varje år behålls.
 */
export function splitByYear<T extends { year?: string | null }>(rows: T[], shown: string): { current: T[]; archive: { year: string; rows: T[] }[] } {
  const current: T[] = [];
  const older = new Map<string, T[]>();
  for (const r of rows) {
    const state = yearState(r.year ?? "", shown);
    if (state === "nu") current.push(r);
    else if (state === "tidigare") {
      const y = r.year!;
      if (!older.has(y)) older.set(y, []);
      older.get(y)!.push(r);
    }
  }
  const archive = [...older.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([year, list]) => ({ year, rows: list }));
  return { current, archive };
}
