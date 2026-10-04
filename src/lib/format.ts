/** Datum- och textformatering på svenska. Evenemangstider är svensk lokal tid 'YYYY-MM-DDTHH:MM'. */

const TZ = "Europe/Stockholm";

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MONTHS_SHORT = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export interface LocalDateParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
}

/** Månadens namn med stor bokstav: 10 → "Oktober". */
export function monthName(month: number): string {
  const m = MONTHS[month - 1] ?? "";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** ISO-veckonummer (som i svenska kalendrar) för ett datum. */
export function isoWeek(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function parseLocal(value: string | null | undefined): LocalDateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value ?? ""));
  if (!m) return null;
  return { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +(m[4] ?? 0), minute: +(m[5] ?? 0) };
}

/** Nuvarande tid i Stockholm som 'YYYY-MM-DDTHH:MM' – jämförbar med starts_at. */
export function stockholmNow(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

function weekday(p: LocalDateParts): string {
  return WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]!;
}

export interface EventDateView {
  day: string;
  monthShort: string;
  weekday: string;
  dateLong: string; // "torsdag 15 oktober 2026"
  time: string; // "12:15" eller "12:15–13:00"
  iso: string; // med tidszon, för <time datetime> och strukturerad data
}

export function eventDate(startsAt: string, endsAt?: string | null): EventDateView | null {
  const s = parseLocal(startsAt);
  if (!s) return null;
  const e = parseLocal(endsAt);
  const sameDay = e && e.year === s.year && e.month === s.month && e.day === s.day;
  const start = `${pad(s.hour)}:${pad(s.minute)}`;
  let time = start;
  if (e && sameDay) time = `${start}–${pad(e.hour)}:${pad(e.minute)}`;
  else if (e) time = `${start} – ${e.day} ${MONTHS_SHORT[e.month - 1]}`;
  return {
    day: String(s.day),
    monthShort: MONTHS_SHORT[s.month - 1]!,
    weekday: weekday(s),
    dateLong: `${weekday(s)} ${s.day} ${MONTHS[s.month - 1]} ${s.year}`,
    time,
    iso: localToIso(startsAt) ?? startsAt,
  };
}

/** 'YYYY-MM-DDTHH:MM' i svensk tid → ISO 8601 med rätt offset (+01:00/+02:00). */
export function localToIso(value: string | null | undefined): string | null {
  const p = parseLocal(value);
  if (!p) return null;
  // Gissa UTC-tid, räkna ut Stockholms offset för den tidpunkten och justera.
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  const offsetMin = tzOffsetMinutes(guess);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function tzOffsetMinutes(date: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 60;
  return (m[1] === "-" ? -1 : 1) * (+m[2]! * 60 + +(m[3] ?? 0));
}

/** UTC-tid från databasen ('YYYY-MM-DD HH:MM:SS') → "1 oktober 2026". */
export function formatDate(utc: string | null | undefined): string {
  if (!utc) return "";
  const d = new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function isoDate(utc: string | null | undefined): string {
  if (!utc) return "";
  return utc.replace(" ", "T").slice(0, 19) + "Z";
}

/** "073-523 56 89" → "tel:+46735235689" */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.startsWith("0")) return `tel:+46${digits.slice(1)}`;
  return `tel:${digits}`;
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

/** Dagens datum i Stockholm som 'YYYY-MM-DD'. */
export function stockholmToday(now = new Date()): string {
  return stockholmNow(now).slice(0, 10);
}

/** 'YYYY-MM-DD' → "15 november 2026". */
export function formatDay(day: string | null | undefined): string {
  const p = parseLocal(day);
  return p ? `${p.day} ${MONTHS[p.month - 1]} ${p.year}` : "";
}

/** Svensk lokal tid 'YYYY-MM-DDTHH:MM' → UTC i databasformat 'YYYY-MM-DD HH:MM:SS'. */
export function localToUtcSql(local: string | null | undefined): string | null {
  const iso = localToIso(local);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace("T", " ").slice(0, 19);
}

/** UTC i databasformat → svensk lokal tid 'YYYY-MM-DDTHH:MM' (för datetime-local-fält). */
export function utcSqlToLocal(utc: string | null | undefined): string {
  if (!utc) return "";
  const d = new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : stockholmNow(d);
}

/** UTC i databasformat → "6 okt 2026 08:00" i svensk tid. */
export function formatDateTimeShort(utc: string | null | undefined): string {
  const local = utcSqlToLocal(utc);
  const p = parseLocal(local);
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}` : "";
}

/** UTC i databasformat → "i dag 15:42", "i går 09:10" eller "3 okt 2026" (svensk tid). */
export function formatWhen(utc: string | null | undefined, now = new Date()): string {
  const local = utcSqlToLocal(utc);
  if (!local) return "";
  const today = stockholmToday(now);
  const yesterday = stockholmToday(new Date(now.getTime() - 86400000));
  const time = local.slice(11, 16);
  if (local.startsWith(today)) return `i dag ${time}`;
  if (local.startsWith(yesterday)) return `i går ${time}`;
  const p = parseLocal(local);
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}` : "";
}
