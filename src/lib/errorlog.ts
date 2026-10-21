import type { Env } from "../env.js";

/**
 * Tekniska fel (500) i tabellen error_log (migrering 0028) – så att ett fel går att felsöka i efterhand utan
 * Cloudflares anropsloggar (som är avstängda, se wrangler.jsonc). Sparar metod, adress och felmeddelande med
 * e-postadresser och långa token maskade. Visas för administratörer under Ändringslogg och rensas efter 30 dagar.
 */

/** Maskar sådant som inte ska sparas: e-postadresser och långa slumpade strängar (token). */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@<>"'()]+@[^\s@<>"'()]+\.[a-z]{2,}/gi, "[e-post]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]");
}

export async function logError(env: Env, method: string, path: string, err: unknown): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const cause = e.cause instanceof Error ? ` (orsak: ${e.cause.message})` : "";
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), method TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', stack TEXT NOT NULL DEFAULT '')",
    ).run();
    await env.DB.prepare("INSERT INTO error_log (method, path, message, stack) VALUES (?, ?, ?, ?)")
      .bind(method.slice(0, 10), scrub(path).slice(0, 300), scrub(`${e.name}: ${e.message}${cause}`).slice(0, 1000), scrub(e.stack ?? "").slice(0, 3000))
      .run();
  } catch {
    /* loggen får aldrig ge ett nytt fel */
  }
}
