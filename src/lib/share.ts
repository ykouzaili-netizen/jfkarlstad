import { randomToken } from "./http.js";
import { safeEqual } from "./security.js";

/**
 * Delningslänk till en dold sida (t.ex. butiken innan den visas): den som har länken kan se sidan utan att vara
 * inloggad, men inte ändra något. Sparas i settings som `dela:<sid-id>` = {"token":"…","expires":"YYYY-MM-DDTHH:MM:SSZ"}.
 *
 * Länken är /butik?visa=<token>. Första besöket sätter en kaka som bara gäller sidans adresser (Path=/butik), och
 * adressen rensas från token direkt (så att den inte följer med i Referer eller hamnar i webbläsarhistoriken).
 * En ny länk eller "Stäng av" gör den gamla ogiltig, även kakor som redan är satta.
 */

export const SHARE_PREFIX = "dela:";
export const SHARE_DAYS = 14;
export const SHARE_PARAM = "visa";

export interface Share {
  token: string;
  /** ISO-tid i UTC. */
  expires: string;
}

const cookieName = (pageId: string) => `__Secure-jfk_visa_${pageId.replace(/[^a-z0-9]/gi, "")}`;

/** Den gällande länken, eller null om ingen finns eller den har gått ut. */
export async function loadShare(db: D1Database, pageId: string): Promise<Share | null> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(SHARE_PREFIX + pageId).first<{ value: string }>();
    if (!row) return null;
    const s = JSON.parse(row.value) as Partial<Share>;
    if (typeof s.token !== "string" || s.token.length < 20 || typeof s.expires !== "string") return null;
    if (Date.parse(s.expires) <= Date.now()) return null;
    return { token: s.token, expires: s.expires };
  } catch {
    return null;
  }
}

export async function createShare(db: D1Database, pageId: string): Promise<Share> {
  const share: Share = { token: randomToken(24), expires: new Date(Date.now() + SHARE_DAYS * 86400_000).toISOString().replace(/\.\d+Z$/, "Z") };
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(SHARE_PREFIX + pageId, JSON.stringify(share)).run();
  return share;
}

export async function removeShare(db: D1Database, pageId: string): Promise<void> {
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(SHARE_PREFIX + pageId).run();
}

export function shareUrl(origin: string, path: string, share: Share): string {
  return `${origin}${path}?${SHARE_PARAM}=${encodeURIComponent(share.token)}`;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Har besökaren en giltig kaka för sidan? */
export function hasShareCookie(req: Request, pageId: string, share: Share): boolean {
  const v = readCookie(req, cookieName(pageId));
  return !!v && safeEqual(v, share.token);
}

/** Kakan som sätts när länken öppnas. Gäller sidans adresser (t.ex. /butik och /butik/…) tills länken går ut. */
export function shareCookie(pageId: string, path: string, share: Share): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(share.expires) - Date.now()) / 1000));
  return `${cookieName(pageId)}=${share.token}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export { safeEqual };
