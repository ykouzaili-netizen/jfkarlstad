import { localToIso, MONTHS, MONTHS_SHORT, parseLocal, WEEKDAYS } from "./format.js";
import type { Settings } from "./settings.js";

/**
 * Merch- och märkestävlingen: datumen och tävlingens läge (fas).
 * Datumen ändras under Texter och sidor → Merch- och märkestävlingen → Datum och tider (svensk tid).
 * Samma regler finns i public/assets/tavling.js, som byter läge i webbläsaren utan att sidan laddas om.
 *
 *   before   före start                 → nedräkning till sista inlämning
 *   open     inlämningen är öppen        → nedräkning till sista inlämning
 *   between  mellan inlämning och röstning → nedräkning till röstningen
 *   voting   röstningen pågår            → nedräkning till att röstningen stänger
 *   done     röstningen är klar          → ingen nedräkning
 *
 * "Senast 23:59" betyder till och med den minuten, så inlämningen och röstningen stänger 60 sekunder efter
 * den angivna tiden (00:00 nästa dag för 23:59).
 */

export const PHASES = ["before", "open", "between", "voting", "done"] as const;
export type Phase = (typeof PHASES)[number];

export interface CompetitionDates {
  /** Lokal tid "YYYY-MM-DDTHH:MM" som de står i adminpanelen. */
  open: string;
  deadline: string;
  voteStart: string;
  voteEnd: string;
}

/** Tidpunkterna i millisekunder (UTC). `deadlineEnd`/`voteEndEnd` = slutet av den angivna minuten. */
export interface CompetitionInstants {
  open: number;
  deadlineEnd: number;
  voteStart: number;
  voteEndEnd: number;
}

const MINUTE = 60_000;

/** Reservdatum om ett fält skulle vara tomt eller trasigt – sidan ska aldrig gå sönder. */
const FALLBACK: CompetitionDates = { open: "2026-11-01T00:00", deadline: "2026-11-30T23:59", voteStart: "2026-12-03T00:00", voteEnd: "2026-12-10T23:59" };

export function competitionDates(s: Settings): CompetitionDates {
  const pick = (v: string, f: string) => (parseLocal(v) ? v : f);
  return {
    open: pick(s.comp_open_at, FALLBACK.open),
    deadline: pick(s.comp_deadline_at, FALLBACK.deadline),
    voteStart: pick(s.comp_vote_start_at, FALLBACK.voteStart),
    voteEnd: pick(s.comp_vote_end_at, FALLBACK.voteEnd),
  };
}

export function instants(d: CompetitionDates): CompetitionInstants {
  const ms = (local: string) => Date.parse(localToIso(local) ?? local);
  return { open: ms(d.open), deadlineEnd: ms(d.deadline) + MINUTE, voteStart: ms(d.voteStart), voteEndEnd: ms(d.voteEnd) + MINUTE };
}

/** Läget vid tidpunkten `now` (ms). Samma regel som phaseAt() i tavling.js. */
export function phaseAt(t: CompetitionInstants, now: number): Phase {
  if (now < t.open) return "before";
  if (now < t.deadlineEnd) return "open";
  if (now < t.voteStart) return "between";
  if (now < t.voteEndEnd) return "voting";
  return "done";
}

/** Vad nedräkningen räknar ned till i varje läge (null = ingen nedräkning). */
export function countdownTarget(t: CompetitionInstants, phase: Phase): number | null {
  if (phase === "before" || phase === "open") return t.deadlineEnd;
  if (phase === "between") return t.voteStart;
  if (phase === "voting") return t.voteEndEnd;
  return null;
}

/** Resterande tid uppdelad i dagar, timmar, minuter och sekunder (aldrig negativ). */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/**
 * Hur långt tidslinjen har kommit, 0–1. De fyra stegen ligger jämnt fördelade; mellan två steg fylls linjen
 * i takt med tiden. Samma regel som progressAt() i tavling.js.
 */
export function progressAt(t: CompetitionInstants, now: number): number {
  const points = [t.open, t.deadlineEnd, t.voteStart, t.voteEndEnd];
  if (now <= points[0]!) return 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (now < b) return (i + (b > a ? (now - a) / (b - a) : 1)) / (points.length - 1);
  }
  return 1;
}

/** Läget just nu (servern). */
export function currentPhase(s: Settings, now = Date.now()): Phase {
  return phaseAt(instants(competitionDates(s)), now);
}

// ───────────── Datum i text ─────────────

/** "1 november" */
export function dayMonth(local: string): string {
  const p = parseLocal(local);
  return p ? `${p.day} ${MONTHS[p.month - 1]}` : local;
}

/** "1 nov" */
export function dayMonthShort(local: string): string {
  const p = parseLocal(local);
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]}` : local;
}

/** "23:59" */
export function clock(local: string): string {
  const p = parseLocal(local);
  return p ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : "";
}

/** "30 november kl. 23:59" */
export function dayMonthClock(local: string): string {
  return `${dayMonth(local)} kl. ${clock(local)}`;
}

/** "måndag 30 november kl. 23:59" */
export function longDateClock(local: string): string {
  const p = parseLocal(local);
  if (!p) return local;
  const wd = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]!;
  return `${wd} ${dayMonthClock(local)}`;
}

/** "3–10 december", "28 november – 3 december" eller med förkortade månader: "3–10 dec". */
export function period(from: string, to: string, short = false): string {
  const a = parseLocal(from);
  const b = parseLocal(to);
  if (!a || !b) return `${from} – ${to}`;
  const names = short ? MONTHS_SHORT : MONTHS;
  if (a.year === b.year && a.month === b.month) return a.day === b.day ? `${a.day} ${names[a.month - 1]}` : `${a.day}–${b.day} ${names[b.month - 1]}`;
  return `${a.day} ${names[a.month - 1]} – ${b.day} ${names[b.month - 1]}`;
}

/** "dag|dagar" → ["dag", "dagar"] (fältet för enheterna i nedräkningen). */
export function unitForms(value: string): [string, string] {
  const [one, many] = value.split("|").map((x) => x.trim());
  return [one || many || "", many || one || ""];
}

// ───────────── Bidrag och material (Innehåll → Tävlingen) ─────────────

export interface EntryRow {
  id: number;
  code: string;
  category: "marke" | "merch";
  image_key: string | null;
  alt: string;
  designer: string;
  winner: number;
}

export interface ResourceRow {
  id: number;
  kind: "program" | "fil";
  title: string;
  label: string;
  description: string;
  url: string | null;
  file_key: string | null;
}

/** Publicerade bidrag. Upphovspersonen hämtas bara när den får visas (efter röstningen). */
export async function loadEntries(db: D1Database, withDesigner: boolean): Promise<EntryRow[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT id, code, category, image_key, alt, ${withDesigner ? "designer" : "'' AS designer"}, ${withDesigner ? "winner" : "0 AS winner"}
         FROM competition_entries WHERE published = 1 AND image_key IS NOT NULL AND image_key != '' ORDER BY category, sort_order, code COLLATE NOCASE, id`,
      )
      .all<EntryRow>();
    return results ?? [];
  } catch {
    return []; // tabellen finns inte än
  }
}

export async function loadResources(db: D1Database): Promise<ResourceRow[]> {
  try {
    const { results } = await db
      .prepare("SELECT id, kind, title, label, description, url, file_key FROM competition_resources WHERE published = 1 ORDER BY kind, sort_order, title COLLATE NOCASE")
      .all<ResourceRow>();
    return (results ?? []).filter((r) => (r.kind === "program" ? !!r.url : !!r.file_key));
  } catch {
    return [];
  }
}

/** Tid kvar i den största hela enheten, t.ex. "12 dagar" eller "5 timmar" (bannern på startsidan). */
export function timeLeft(ms: number, units: { days: string; hours: string; minutes: string }): string {
  const { d, h, m } = splitDuration(ms);
  const pick = (n: number, forms: string) => {
    const [one, many] = unitForms(forms);
    return `${n} ${n === 1 ? one : many}`;
  };
  if (d >= 1) return pick(d, units.days);
  if (h >= 1) return pick(h, units.hours);
  return pick(Math.max(1, m), units.minutes);
}
