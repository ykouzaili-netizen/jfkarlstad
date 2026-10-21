import type { Env } from "../env.js";
import type { RequestContext } from "../router.js";
import { randomToken, redirect } from "../lib/http.js";
import { appSecret, hmac, safeEqual, sha256 } from "../lib/security.js";

/**
 * Inloggning för adminpanelen.
 * - Lösenord hashas med PBKDF2-SHA256 (WebCrypto), 100 000 iterationer (maxgränsen i Workers) och unikt salt.
 * - Sessionen ligger i en __Host-kaka: Secure, HttpOnly, SameSite=Strict. I databasen sparas bara SHA-256 av token.
 * - Varje POST kräver CSRF-token kopplad till sessionen och att Origin stämmer.
 * - Tvåstegsverifiering (src/lib/totp.ts): med den påslagen skapas sessionen först när koden från appen är rätt.
 *   Mellan stegen finns bara en signerad kaka som gäller i fem minuter (createChallenge). Inställningen
 *   require_2fa = "pa" tvingar alla som saknar tvåstegsverifiering att slå på den innan de kan göra något annat.
 * - Upprepade felaktiga lösenord spärrar kontot allt längre: 15 min, 30 min, 1 h … högst ett dygn.
 */

export type Role = "admin" | "redaktor";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  failed_logins: number;
  locked_until: string | null;
  active: number;
  created_at: string;
  last_login_at: string | null;
  /** Tvåstegsverifiering (migrering 0027). Krypterad hemlighet, eller null. */
  totp_secret?: string | null;
  totp_pending?: string | null;
  totp_enabled_at?: string | null;
  totp_last_step?: number;
  recovery_codes?: string;
}

export interface Session {
  user: User;
  csrf: string;
  sessionId: string;
  /** Föreningen kräver tvåstegsverifiering och användaren har inte slagit på den än. */
  mustSetUpTwoFactor?: boolean;
}

export const ROLE_LABELS: Record<Role, string> = { admin: "Administratör", redaktor: "Redaktör" };

const COOKIE = "__Host-jfk_session";
const SESSION_HOURS = 12;
const ITERATIONS = 100_000;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
/** Spärrtiden efter 5, 10, 15 … felaktiga försök i rad: 15 min, 30 min, 1 h, 2 h … högst ett dygn. */
export function lockMinutes(failed: number): number {
  const round = Math.max(1, Math.floor(failed / MAX_FAILED));
  return Math.min(LOCK_MINUTES * 2 ** (round - 1), 24 * 60);
}
export const MIN_PASSWORD = 10;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** Ett giltigt hashformat som aldrig matchar något lösenord – för konton som ännu inte valt lösenord. */
export const UNUSABLE_HASH = "!";

const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored && stored !== UNUSABLE_HASH ? stored : DUMMY_HASH).split("$");
  if (parts.length !== 4) return false;
  const [, iter, saltB64, hashB64] = parts as [string, string, string, string];
  const actual = await derive(password, unb64(saltB64), parseInt(iter, 10));
  const ok = safeEqual(b64(actual), hashB64);
  return ok && Boolean(stored) && stored !== UNUSABLE_HASH;
}

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Lösenordet måste vara minst ${MIN_PASSWORD} tecken.`;
  if (password.length > 200) return "Lösenordet är för långt.";
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase())) return "Lösenordet får inte innehålla din e-postadress.";
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|password|lösenord)/i.test(password)) return "Välj ett svårare lösenord.";
  return null;
}

// ───────────────────────── Sessioner ─────────────────────────

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, datetime('now', '+${SESSION_HOURS} hours'))`,
  )
    .bind(await sha256(token), userId, csrf)
    .run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function getSession(c: RequestContext): Promise<Session | null> {
  const token = readCookie(c.req, COOKIE);
  if (!token || token.length < 20) return null;
  const id = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.csrf_token, (SELECT value FROM settings WHERE key = 'require_2fa') AS require_2fa, u.*
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`,
  )
    .bind(id)
    .first<User & { session_id: string; csrf_token: string; require_2fa: string | null }>();
  if (!row) return null;
  const { session_id, csrf_token, require_2fa, ...user } = row;
  return { user: user as User, csrf: csrf_token, sessionId: session_id, mustSetUpTwoFactor: require_2fa === "pa" && !user.totp_secret };
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function destroyUserSessions(env: Env, userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

/** POST-skydd: rätt Origin och rätt CSRF-token. */
export function checkCsrf(c: RequestContext, session: Session, form: FormData): boolean {
  const origin = c.req.headers.get("Origin");
  if (origin && origin !== c.url.origin) return false;
  const token = String(form.get("_csrf") ?? "");
  return token.length > 0 && safeEqual(token, session.csrf);
}

// ───────────────────────── Engångslänkar (inbjudan och återställning) ─────────────────────────

export async function createResetToken(env: Env, userId: number, hours: number): Promise<string> {
  const token = randomToken(32);
  await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").bind(userId).run();
  await env.DB.prepare(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${Math.round(hours)} hours'))`)
    .bind(await sha256(token), userId)
    .run();
  return token;
}

export async function lookupResetToken(env: Env, token: string): Promise<(User & { token_hash: string }) | null> {
  if (!token || token.length < 20) return null;
  return env.DB.prepare(
    `SELECT u.*, r.token_hash FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > datetime('now') AND u.active = 1`,
  )
    .bind(await sha256(token))
    .first<User & { token_hash: string }>();
}

// ───────────────────────── Behörighet ─────────────────────────

/** Sidor som går att nå när tvåstegsverifiering krävs men inte är påslagen. */
const TWO_FACTOR_SETUP_PATHS = ["/admin/konto/tvastegs"];

export type AdminHandler = (c: RequestContext, session: Session) => Promise<Response> | Response;

/** Kräver inloggning (och ev. roll). Utloggade skickas till inloggningen. */
export function requireUser(handler: AdminHandler, role?: Role) {
  return async (c: RequestContext): Promise<Response> => {
    const session = await getSession(c);
    if (!session) {
      const next = c.req.method === "GET" ? `?nasta=${encodeURIComponent(c.url.pathname + c.url.search)}` : "";
      return redirect(`/admin/logga-in${next}`, 303);
    }
    // Kräver föreningen tvåstegsverifiering går det bara att slå på den (eller logga ut) tills den är på.
    if (session.mustSetUpTwoFactor && !TWO_FACTOR_SETUP_PATHS.some((p) => c.url.pathname === p)) {
      return redirect("/admin/konto/tvastegs?krav=1", 303);
    }
    if (role === "admin" && session.user.role !== "admin") {
      return redirect("/admin?fel=behorighet", 303);
    }
    return handler(c, session);
  };
}

export async function audit(env: Env, session: Session | null, action: string, entity: string, entityId?: string | number | null, summary?: string): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(session?.user.id ?? null, session?.user.email ?? null, action, entity, entityId == null ? null : String(entityId), summary?.slice(0, 300) ?? null)
      .run();
  } catch (err) {
    console.error("Kunde inte skriva till ändringsloggen", err);
  }
}

// ───────────────────────── Steg två vid inloggning ─────────────────────────

const CHALLENGE_COOKIE = "__Host-jfk_tvasteg";
const CHALLENGE_MINUTES = 5;

/**
 * Kakan mellan lösenordet och koden från appen: användarens id, giltig till och en HMAC som även binder den till
 * lösenordshashen (byts lösenordet slutar kakan gälla). Ger ingen åtkomst i sig – bara rätt att skriva in koden.
 */
export async function createChallenge(env: Env, user: User): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_MINUTES * 60;
  const sig = await hmac(await appSecret(env), `tvasteg|${user.id}|${exp}|${user.password_hash}`);
  return `${CHALLENGE_COOKIE}=${user.id}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${CHALLENGE_MINUTES * 60}`;
}

export function clearChallengeCookie(): string {
  return `${CHALLENGE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Användaren som har klarat lösenordssteget, om kakan är giltig. */
export async function readChallenge(c: RequestContext): Promise<User | null> {
  const value = readCookie(c.req, CHALLENGE_COOKIE);
  const m = value ? /^(\d{1,9})\.(\d{10})\.([0-9a-f]{64})$/.exec(value) : null;
  if (!m) return null;
  const [, id, exp, sig] = m as unknown as [string, string, string, string];
  if (Number(exp) < Date.now() / 1000) return null;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND active = 1").bind(Number(id)).first<User>();
  if (!user || !user.totp_secret) return null;
  const expected = await hmac(await appSecret(c.env), `tvasteg|${user.id}|${exp}|${user.password_hash}`);
  return safeEqual(sig, expected) ? user : null;
}
