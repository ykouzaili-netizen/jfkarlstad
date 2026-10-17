import type { Env } from "../env.js";
import { stockholmToday } from "./format.js";

/**
 * Statistik till samarbetspartners – helt utan personuppgifter.
 * Vi räknar bara upp en totalsiffra per dag och sak (t.ex. "partner 3 visades"). Ingen IP-adress,
 * inga kakor, ingen webbläsarinfo sparas. Robotar och förhandsvisningar räknas inte.
 */
export type StatKind = "partner_view" | "partner_website" | "partner_career" | "partner_link" | "job_view" | "job_apply";

export const STAT_LABELS: Record<StatKind, string> = {
  partner_view: "Visningar av partnersidan",
  partner_career: "Klick till karriärsidan",
  partner_website: "Klick till webbplatsen",
  partner_link: "Klick på övriga länkar",
  job_view: "Visningar av jobbannonser",
  job_apply: "Klick till ansökan",
};

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;

export function isCountable(req: Request): boolean {
  if (req.method !== "GET") return false;
  const ua = req.headers.get("User-Agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return false;
  // Förhämtningar från webbläsaren ska inte räknas
  const purpose = req.headers.get("Sec-Purpose") ?? req.headers.get("Purpose") ?? "";
  return !/prefetch|prerender/i.test(purpose);
}

export async function countStat(env: Env, kind: StatKind, refId: number): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO stats_daily (day, kind, ref_id, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, ref_id) DO UPDATE SET count = count + 1",
    )
      .bind(stockholmToday(), kind, refId)
      .run();
  } catch (err) {
    console.error("Kunde inte räkna statistik", err instanceof Error ? err.message : err);
  }
}

/**
 * Klick per enskild länk (partnerns "Fler länkar"): en totalsiffra per dag, partner och länk (stats_links, migrering 0017).
 * Länkens id följer länken när ordningen ändras. Tål att tabellen saknas.
 */
export async function countLink(env: Env, partnerId: number, linkId: string): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO stats_links (day, partner_id, link_id, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, partner_id, link_id) DO UPDATE SET count = count + 1",
    )
      .bind(stockholmToday(), partnerId, linkId)
      .run();
  } catch (err) {
    console.error("Kunde inte räkna länkklick", err instanceof Error ? err.message : err);
  }
}
