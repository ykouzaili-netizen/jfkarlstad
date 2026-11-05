import { MONTHS_SHORT } from "./format.js";
import { fill } from "./texts.js";
import type { SettingKey, Settings } from "./settings.js";
import type { EventRow } from "./content.js";

/**
 * Biljettförsäljningen till ett evenemang (migrering 0029). Tiderna är svensk lokal tid
 * 'YYYY-MM-DDTHH:MM' och båda är valfria. Sista minuten räknas med (23:59 = till och med 23:59).
 *   soon   – släppet har inte börjat
 *   open   – biljetterna säljs nu
 *   closed – försäljningen har stängt
 */
export type TicketState = "none" | "soon" | "open" | "closed";

export function ticketState(e: Pick<EventRow, "tickets_open_at" | "tickets_close_at">, now: string): TicketState {
  const open = e.tickets_open_at || null;
  const close = e.tickets_close_at || null;
  if (!open && !close) return "none";
  if (open && now < open) return "soon";
  if (close && now > close) return "closed";
  return "open";
}

/** '2026-11-12T12:00' → '12 nov kl. 12:00' ('12 nov' när tiden är 00:00 eller 23:59). */
export function ticketDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const day = `${+m[3]!} ${MONTHS_SHORT[+m[2]! - 1]}`;
  const time = `${m[4]}:${m[5]}`;
  return time === "00:00" || time === "23:59" ? day : `${day} kl. ${time}`;
}

/** Kort rad om biljetterna ("Biljettsläpp 12 nov kl. 12:00"), eller null om det inte finns något att säga. */
export function ticketText(s: Settings, e: Pick<EventRow, "tickets_open_at" | "tickets_close_at">, now: string): { state: TicketState; text: string; key: SettingKey } | null {
  const state = ticketState(e, now);
  if (state === "none") return null;
  if (state === "soon") return { state, key: "event_tickets_soon", text: fill(s.event_tickets_soon, { datum: ticketDate(e.tickets_open_at!) }) };
  if (state === "closed") return { state, key: "event_tickets_closed", text: s.event_tickets_closed };
  return e.tickets_close_at
    ? { state, key: "event_tickets_open_until", text: fill(s.event_tickets_open_until, { datum: ticketDate(e.tickets_close_at) }) }
    : { state, key: "event_tickets_open", text: s.event_tickets_open };
}
