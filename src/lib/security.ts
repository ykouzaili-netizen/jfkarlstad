import type { Env } from "../env.js";

/** Kryptohjälp, rate limiting och skräppostskydd. */

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Jämförelse i konstant tid (motverkar timing-attacker). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hemlighet för HMAC/hashning. Om IP_HASH_SALT saknas skapas en slumpad och sparas i databasen en gång. */
let cachedSecret: string | null = null;
export async function appSecret(env: Env): Promise<string> {
  if (env.IP_HASH_SALT) return env.IP_HASH_SALT;
  if (cachedSecret) return cachedSecret;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = '_app_secret'").first<{ value: string }>();
  if (row) return (cachedSecret = row.value);
  const fresh = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('_app_secret', ?)").bind(fresh).run();
  const stored = await env.DB.prepare("SELECT value FROM settings WHERE key = '_app_secret'").first<{ value: string }>();
  return (cachedSecret = stored?.value ?? fresh);
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "okänd";
}

/**
 * Enkel rate limiting i D1. Nyckeln är en HMAC av (ändamål + IP), så ingen IP-adress lagras i klartext,
 * och raden rensas när tidsfönstret gått ut. Returnerar true om anropet är tillåtet.
 */
export async function rateLimit(env: Env, req: Request, purpose: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const key = (await hmac(await appSecret(env), `${purpose}|${clientIp(req)}`)).slice(0, 40);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  )
    .bind(key, now, windowSeconds)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

/** Tidsstämpel i formulär: ett skickat formulär som fylls i snabbare än 3 sekunder är troligen en robot. */
export async function formToken(env: Env): Promise<string> {
  const t = Date.now().toString(36);
  return `${t}.${(await hmac(await appSecret(env), "form|" + t)).slice(0, 16)}`;
}

export async function checkFormToken(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const [t, sig] = token.split(".");
  if (!t || !sig) return false;
  const expected = (await hmac(await appSecret(env), "form|" + t)).slice(0, 16);
  if (!safeEqual(sig, expected)) return false;
  const age = Date.now() - parseInt(t, 36);
  return age > 3000 && age < 24 * 3600 * 1000;
}

export function turnstileEnabled(env: Env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
}

/** Verifiera Cloudflare Turnstile. Om Turnstile inte är konfigurerat godkänns anropet (honungsfälla + rate limiting gäller ändå). */
export async function verifyTurnstile(env: Env, token: string | null, ip: string): Promise<boolean> {
  if (!turnstileEnabled(env)) return true;
  if (!token) return false;
  try {
    const body = new FormData();
    body.append("secret", env.TURNSTILE_SECRET_KEY!);
    body.append("response", token);
    body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Turnstile-verifiering misslyckades", err);
    return false;
  }
}
