import type { Env } from "../env.js";
import { deleteFile, MAX_IMAGE_BYTES, putFile, sniffType } from "./storage.js";
import { registerMedia } from "./media.js";

/**
 * Automatisk hämtning av föreningens senaste Instagraminlägg (valfritt).
 *
 * Aktiveras när Worker-secreten INSTAGRAM_TOKEN finns – en långlivad nyckel från Instagram API med
 * Instagram-inloggning (konto av typen Business eller Creator, se README). Cron (varje timme) anropar
 * syncInstagram(): profil och de 12 senaste inläggen hämtas, bilderna sparas i fillagringen och inläggen
 * i tabellen instagram_posts (source = 'auto'). Besökarnas webbläsare kontaktar aldrig Instagram.
 *
 * Nyckeln gäller i 60 dagar och förnyas automatiskt en gång i veckan; den förnyade nyckeln sparas i
 * fillagringen (KV) under en nyckel som inte kan nås via /media. Nyckeln skrivs aldrig till loggen.
 */

const TOKEN_KEY = "instagram:token";
const REFRESHED_KEY = "instagram:token-refreshed";
const KEEP_AUTO_POSTS = 24;
const FETCH_POSTS = 12;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export const PROFILE_SETTING = "ig:profil";
export const STATUS_SETTING = "ig:status";

export interface InstagramProfile {
  username: string;
  pictureKey: string | null;
  followers: number | null;
  posts: number | null;
}

export interface SyncStatus {
  ok: boolean;
  at: string;
  added?: number;
  error?: string;
}

interface ApiMedia {
  id: string;
  caption?: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

/**
 * Tabellen för inläggen skapas av migrering 0003. Workern skapar den också själv (en gång per instans) om
 * den saknas, så att inget behöver köras i Cloudflare för hand. Samma SQL som i migreringen, med IF NOT EXISTS.
 */
let schemaReady = false;
export async function ensureInstagramSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS instagram_posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ig_id       TEXT UNIQUE,
        source      TEXT NOT NULL DEFAULT 'manuell' CHECK (source IN ('manuell', 'auto')),
        image_key   TEXT NOT NULL,
        permalink   TEXT NOT NULL DEFAULT '',
        caption     TEXT NOT NULL DEFAULT '',
        posted_at   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        published   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_instagram_posts_order ON instagram_posts(published, posted_at DESC, id DESC)"),
    ]);
    schemaReady = true;
  } catch (err) {
    console.error("Kunde inte skapa tabellen för Instagram", err instanceof Error ? err.message : err);
  }
}

export function instagramConfigured(env: Env): boolean {
  return Boolean(env.INSTAGRAM_TOKEN);
}

async function currentToken(env: Env): Promise<string | null> {
  if (!env.INSTAGRAM_TOKEN) return null;
  const stored = env.FILES ? await env.FILES.get(TOKEN_KEY, "text") : null;
  return stored || env.INSTAGRAM_TOKEN;
}

function apiBase(env: Env): string {
  return (env.INSTAGRAM_API_BASE || "https://graph.instagram.com").replace(/\/$/, "");
}

/** Anropa API:t. Felmeddelandet innehåller aldrig nyckeln. */
async function api<T>(env: Env, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(apiBase(env) + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ? `: ${body.error.message.slice(0, 160)}` : "";
    } catch {
      /* inget JSON-svar */
    }
    throw new Error(`Instagram svarade ${res.status}${detail}`);
  }
  return (await res.json()) as T;
}

/** Ladda ned en bild från Instagram och spara den i fillagringen. Returnerar false om den inte är en godkänd bild. */
async function storeImage(env: Env, src: string, key: string, filename: string): Promise<boolean> {
  const res = await fetch(src);
  if (!res.ok) return false;
  const data = await res.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) return false;
  const type = sniffType(new Uint8Array(data.slice(0, 16)));
  if (!type || !ALLOWED.has(type)) return false;
  await putFile(env, key, data, { contentType: type, size: data.byteLength, filename });
  await registerMedia(env.DB, { key, kind: "image", filename, contentType: type, size: data.byteLength, hasSmall: false, user: "Instagram" });
  return true;
}

async function saveSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, value)
    .run();
}

/** Förnya den långlivade nyckeln en gång i veckan (den gäller i 60 dagar). */
async function refreshToken(env: Env, token: string): Promise<void> {
  if (!env.FILES) return;
  const last = Number((await env.FILES.get(REFRESHED_KEY, "text")) ?? 0);
  if (Date.now() - last < 7 * 24 * 3600 * 1000) return;
  try {
    const res = await api<{ access_token?: string }>(env, "/refresh_access_token", token, { grant_type: "ig_refresh_token" });
    if (res.access_token) await env.FILES.put(TOKEN_KEY, res.access_token);
    await env.FILES.put(REFRESHED_KEY, String(Date.now()));
  } catch (err) {
    console.error("Instagram: kunde inte förnya nyckeln", err instanceof Error ? err.message : "okänt fel");
  }
}

/** Hämta profil och de senaste inläggen. Körs av cron varje timme och från knappen "Hämta nu" i adminpanelen. */
export async function syncInstagram(env: Env): Promise<SyncStatus> {
  const at = new Date().toISOString().replace("T", " ").slice(0, 19);
  const token = await currentToken(env);
  if (!token) return { ok: false, at, error: "Ingen Instagram-nyckel är inlagd." };
  let status: SyncStatus;
  try {
    // Profilen
    const me = await api<{ username?: string; profile_picture_url?: string; followers_count?: number; media_count?: number }>(env, "/me", token, {
      fields: "username,profile_picture_url,followers_count,media_count",
    });
    let pictureKey: string | null = null;
    if (me.profile_picture_url) {
      // Profilbilden byts sällan – hämta den högst en gång per dygn.
      const prev = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(PROFILE_SETTING).first<{ value: string }>();
      const old = prev ? (JSON.parse(prev.value) as InstagramProfile & { pictureAt?: number }) : null;
      if (old?.pictureKey && old.pictureAt && Date.now() - old.pictureAt < 24 * 3600 * 1000) pictureKey = old.pictureKey;
      else {
        // Nytt filnamn varje gång – filerna under /media cachas länge i webbläsaren.
        const key = `ig-profil-${Date.now()}.jpg`;
        if (await storeImage(env, me.profile_picture_url, key, "Instagram-profilbild")) {
          pictureKey = key;
          if (old?.pictureKey && old.pictureKey !== key) {
            await env.DB.prepare("DELETE FROM media WHERE key = ?").bind(old.pictureKey).run();
            await deleteFile(env, old.pictureKey);
          }
        } else pictureKey = old?.pictureKey ?? null;
      }
    }
    const profile = {
      username: me.username ?? "",
      pictureKey,
      pictureAt: Date.now(),
      followers: typeof me.followers_count === "number" ? me.followers_count : null,
      posts: typeof me.media_count === "number" ? me.media_count : null,
    };
    await saveSetting(env, PROFILE_SETTING, JSON.stringify(profile));

    // Inläggen
    const media = await api<{ data?: ApiMedia[] }>(env, "/me/media", token, {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: String(FETCH_POSTS),
    });
    let added = 0;
    for (const m of media.data ?? []) {
      if (!/^\d{1,40}$/.test(m.id)) continue;
      const existing = await env.DB.prepare("SELECT id FROM instagram_posts WHERE ig_id = ?").bind(m.id).first<{ id: number }>();
      const caption = (m.caption ?? "").slice(0, 600);
      const permalink = m.permalink?.startsWith("https://www.instagram.com/") ? m.permalink : "";
      const day = m.timestamp ? m.timestamp.slice(0, 10) : null;
      if (existing) {
        await env.DB.prepare("UPDATE instagram_posts SET caption = ?, permalink = ?, updated_at = datetime('now') WHERE id = ?").bind(caption, permalink, existing.id).run();
        continue;
      }
      const src = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
      if (!src) continue;
      const key = `ig-${m.id}.jpg`;
      if (!(await storeImage(env, src, key, `Instagram ${day ?? m.id}`))) continue;
      // OR IGNORE: två hämtningar samtidigt (cron och en besökare) ska inte krocka.
      await env.DB.prepare("INSERT OR IGNORE INTO instagram_posts (ig_id, source, image_key, permalink, caption, posted_at) VALUES (?, 'auto', ?, ?, ?, ?)")
        .bind(m.id, key, permalink, caption, day)
        .run();
      added++;
    }

    // Behåll bara de senaste automatiska inläggen
    const { results: old } = await env.DB.prepare(
      "SELECT id, image_key FROM instagram_posts WHERE source = 'auto' ORDER BY COALESCE(posted_at, created_at) DESC, id DESC LIMIT -1 OFFSET ?",
    )
      .bind(KEEP_AUTO_POSTS)
      .all<{ id: number; image_key: string }>();
    for (const o of old) {
      await env.DB.prepare("DELETE FROM instagram_posts WHERE id = ?").bind(o.id).run();
      await env.DB.prepare("DELETE FROM media WHERE key = ?").bind(o.image_key).run();
      await deleteFile(env, o.image_key);
    }

    await refreshToken(env, token);
    status = { ok: true, at, added };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Fel från API:t är redan begripliga; nätverksfel (t.ex. "fetch failed") får en svensk förklaring.
    status = { ok: false, at, error: msg.startsWith("Instagram svarade") ? msg : `Kunde inte nå Instagram just nu (${msg || "okänt fel"}). Nästa försök görs automatiskt inom en timme.` };
    console.error("Instagram: hämtningen misslyckades", status.error);
  }
  await saveSetting(env, STATUS_SETTING, JSON.stringify(status));
  return status;
}

export function parseProfile(value: string | null | undefined): InstagramProfile | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as InstagramProfile;
    return typeof p.username === "string" ? p : null;
  } catch {
    return null;
  }
}

export function parseStatus(value: string | null | undefined): SyncStatus | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SyncStatus;
  } catch {
    return null;
  }
}
