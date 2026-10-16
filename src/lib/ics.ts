/**
 * iCalendar (RFC 5545): hjälp för kalenderfilerna – /kalender.ics, ett enskilt evenemang och tävlingens datum.
 * Tider skrivs i svensk lokal tid med TZID=Europe/Stockholm.
 */

/** Tidszonsdefinition så att alla kalenderappar tolkar tiderna som svensk tid (inkl. sommartid). */
export const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Stockholm",
  "X-LIC-LOCATION:Europe/Stockholm",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export const icsTime = (local: string) => local.replace(/[-:]/g, "") + "00";

/** Raderna får vara högst 75 oktetter (RFC 5545) – längre rader viks med CRLF + mellanslag. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const max = out.length ? 74 : 75; // fortsättningsrader börjar med ett mellanslag
    if (curLen + len > max) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function icsResponse(lines: string[], filename: string | null): Response {
  const body = lines.map(foldLine).join("\r\n") + "\r\n";
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=900",
  };
  if (filename) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(body, { headers });
}

export const nowStamp = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
