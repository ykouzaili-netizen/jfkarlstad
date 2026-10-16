/**
 * YouTube-filmer i bildgalleriet. Besökarens webbläsare kontaktar aldrig YouTube förrän hen själv klickar på
 * play: stillbilden hämtas av Workern (thumbnailHandler) och spelaren laddas från youtube-nocookie.com först vid klick.
 */
import type { Env } from "../env.js";
import { getFile, putFile } from "./storage.js";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Videons id ur en YouTube-länk (watch?v=, youtu.be/, shorts/, embed/, live/) eller ur ett id. Null om det inte går. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
    if (!id && m) id = m[2]!;
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Är länken en YouTube Short (alltid stående)? */
export const isShortsUrl = (input: string): boolean => /youtube\.com\/shorts\//i.test(input);

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

/** Lokal adress för YouTubes stillbild (hämtas och sparas av sajten första gången). */
export const thumbUrl = (id: string) => `/film/bild/${encodeURIComponent(id)}.jpg`;

/**
 * GET /film/bild/:id.jpg – YouTubes stillbild, hämtad en gång av Workern och sparad i fillagringen.
 * Bara för filmer som finns i galleriet, så att adressen inte kan användas som öppen proxy.
 */
export async function thumbnail(env: Env, id: string): Promise<Response | null> {
  if (!ID_RE.test(id)) return null;
  const known = await env.DB.prepare("SELECT 1 FROM gallery_videos WHERE youtube_id = ? LIMIT 1").bind(id).first().catch(() => null);
  if (!known) return null;
  const key = `yt-${id}.jpg`;
  let file = await getFile(env, key);
  if (!file) {
    for (const name of ["maxresdefault", "sddefault", "hqdefault"]) {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { cf: { cacheTtl: 86400 } } as RequestInit).catch(() => null);
      // YouTube svarar med en grå 120 px-bild i stället för 404 när en storlek saknas – hoppa över de små.
      if (!res || !res.ok) continue;
      const data = await res.arrayBuffer();
      if (data.byteLength < 3000) continue;
      await putFile(env, key, data, { contentType: "image/jpeg", size: data.byteLength, filename: `${key}` });
      file = await getFile(env, key);
      break;
    }
  }
  if (!file) return null;
  return new Response(file.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
