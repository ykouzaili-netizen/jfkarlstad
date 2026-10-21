import type { Env } from "../env.js";
import { appSecret, safeEqual, sha256 } from "./security.js";

/**
 * Tvåstegsverifiering med engångskoder från en autentiseringsapp (TOTP, RFC 6238: HMAC-SHA1, 6 siffror, 30 sekunder),
 * som Google Authenticator, Microsoft Authenticator, 1Password och Apples inbyggda lösenordsapp.
 *
 * Hemligheten sparas krypterad i databasen (AES-GCM, nyckeln härleds från appens hemlighet – IP_HASH_SALT eller
 * den slumpade i settings), så att en kopia av databasen inte räcker för att skapa koder. En använd kod kan inte
 * användas igen (totp_last_step). Reservkoderna sparas bara som SHA-256.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** En ny hemlighet: 20 slumpade byte (160 bitar, som RFC 4226 rekommenderar), i base32. */
export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** Koden för ett visst tidssteg. */
export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1]! & 15;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Kontrollera en kod. Godtar föregående och nästa steg (±30 s) för klockor som går lite fel, men aldrig ett steg
 * som redan har använts (lastStep). Returnerar steget som matchade, eller null.
 */
export async function verifyTotp(secret: string, code: string, lastStep: number, now = Date.now()): Promise<number | null> {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastStep) continue;
    if (safeEqual(await totpAt(secret, s), clean)) return s;
  }
  return null;
}

/** Adressen som autentiseringsappen läser från QR-koden. */
export function otpauthUrl(secret: string, account: string, issuer = "JFK Adminpanel"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** Hemligheten i grupper om fyra, för den som skriver in den för hand. */
export function groupedSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

// ───────────── Kryptering av hemligheten ─────────────

/**
 * Nycklarna, i ordning: Worker-hemligheten TOTP_KEY om den finns (då räcker inte en kopia av databasen för att läsa
 * hemligheterna), annars appens hemlighet. Den nya krypteringen görs alltid med den första; vid läsning provas alla,
 * så att TOTP_KEY kan läggas till i efterhand utan att någon blir utelåst (hemligheten skrivs om vid nästa inloggning).
 */
async function aesKeys(env: Env): Promise<CryptoKey[]> {
  const sources = [env.TOTP_KEY && env.TOTP_KEY.length >= 16 ? `totp|${env.TOTP_KEY}` : null, `${await appSecret(env)}|tvastegs`].filter((x): x is string => !!x);
  return Promise.all(
    sources.map(async (src) => {
      const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src)));
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    }),
  );
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(env: Env, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const [key] = await aesKeys(env);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key!, new TextEncoder().encode(secret)));
  return `v1.${toB64(iv)}.${toB64(data)}`;
}

/** Hemligheten i klartext, och om den är krypterad med en äldre nyckel (och bör skrivas om). */
export async function decryptSecretInfo(env: Env, stored: string | null | undefined): Promise<{ secret: string; stale: boolean } | null> {
  if (!stored) return null;
  const [v, iv, data] = stored.split(".");
  if (v !== "v1" || !iv || !data) return null;
  const keys = await aesKeys(env);
  for (let i = 0; i < keys.length; i++) {
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, keys[i]!, fromB64(data));
      return { secret: new TextDecoder().decode(plain), stale: i > 0 };
    } catch {
      /* prova nästa nyckel */
    }
  }
  return null;
}

export async function decryptSecret(env: Env, stored: string | null | undefined): Promise<string | null> {
  return (await decryptSecretInfo(env, stored))?.secret ?? null;
}

// ───────────── Reservkoder ─────────────

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // utan 0/o, 1/l/i

/** Tio reservkoder i formen "k7m2p-x9q4t". Visas en gång; bara hashen sparas. */
export function newRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    codes.push(`${chars.slice(0, 5)}-${chars.slice(5)}`);
  }
  return codes;
}

export const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function hashRecoveryCodes(codes: string[]): Promise<string> {
  return JSON.stringify(await Promise.all(codes.map((c) => sha256(`reserv|${normalizeRecovery(c)}`))));
}

export function recoveryCount(stored: string | null | undefined): number {
  try {
    const list = JSON.parse(stored || "[]") as unknown;
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

/** Om koden är en oanvänd reservkod: listan utan den (som ska sparas). Annars null. */
export async function useRecoveryCode(stored: string | null | undefined, code: string): Promise<string | null> {
  const clean = normalizeRecovery(code);
  if (clean.length !== 10) return null;
  let list: string[];
  try {
    list = JSON.parse(stored || "[]") as string[];
  } catch {
    return null;
  }
  const hash = await sha256(`reserv|${clean}`);
  const i = list.findIndex((h) => typeof h === "string" && safeEqual(h, hash));
  if (i < 0) return null;
  list.splice(i, 1);
  return JSON.stringify(list);
}
