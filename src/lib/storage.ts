import type { Env } from "../env.js";

/**
 * Lagring av uppladdade filer (bilder och PDF:er).
 * Använder R2 om bindningen UPLOADS finns, annars Workers KV (FILES).
 * KV räcker gott för föreningens behov (max 25 MB per fil) och kräver inget betalkort i Cloudflare.
 * Byte till R2: aktivera R2 i Cloudflare, lägg till r2_buckets i wrangler.jsonc – klart.
 */

export interface StoredFile {
  body: ReadableStream;
  contentType: string;
  size: number;
  filename: string;
}

interface FileMeta {
  contentType: string;
  size: number;
  filename: string;
}

/** Max storlek för en bild som sparas. Större bilder komprimeras automatiskt i webbläsaren innan uppladdning (public/assets/admin.js). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Max storlek för PDF. KV tillåter 25 MiB per värde – vi håller lite marginal. PDF:er kan inte komprimeras i webbläsaren. */
export const MAX_PDF_BYTES = 24 * 1024 * 1024; // 24 MB

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Kontrollera filens "magiska bytes" så att filändelse och innehåll stämmer (litar inte på webbläsarens MIME-typ). */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  const starts = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** SVG kan innehålla skript. Vi tillåter bara SVG utan skript, event-attribut och externa referenser. */
export function isSafeSvg(text: string): boolean {
  const t = text.toLowerCase();
  return !/<script|on[a-z]+\s*=|javascript:|<foreignobject|<iframe|<embed|<object|xlink:href\s*=\s*["']?(?!#)|href\s*=\s*["']?(?!#)/.test(t);
}

export function randomKey(prefix: string, ext: string): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}-${id}.${ext}`;
}

export async function putFile(env: Env, key: string, data: ArrayBuffer, meta: FileMeta): Promise<void> {
  if (env.UPLOADS) {
    await env.UPLOADS.put(key, data, {
      httpMetadata: { contentType: meta.contentType },
      customMetadata: { filename: meta.filename, size: String(meta.size) },
    });
    return;
  }
  if (env.FILES) {
    await env.FILES.put(key, data, { metadata: meta });
    return;
  }
  throw new Error("Ingen fillagring konfigurerad (varken UPLOADS eller FILES)");
}

export async function getFile(env: Env, key: string): Promise<StoredFile | null> {
  if (env.UPLOADS) {
    const obj = await env.UPLOADS.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
      filename: obj.customMetadata?.filename ?? key,
    };
  }
  if (env.FILES) {
    const { value, metadata } = await env.FILES.getWithMetadata<FileMeta>(key, "stream");
    if (!value) return null;
    return {
      body: value,
      contentType: metadata?.contentType ?? "application/octet-stream",
      size: metadata?.size ?? 0,
      filename: metadata?.filename ?? key,
    };
  }
  return null;
}

export async function deleteFile(env: Env, key: string | null | undefined): Promise<void> {
  // Töm även kopian i Cloudflares cache (i det här datacentret; övriga går ut inom ett dygn).
  if (key && typeof caches !== "undefined" && env.SITE_URL) {
    try {
      await caches.default.delete(new Request(`${env.SITE_URL.replace(/\/$/, "")}/media/${key}`));
    } catch {
      /* cachen är en bonus */
    }
  }
  if (!key) return;
  try {
    if (env.UPLOADS) await env.UPLOADS.delete(key);
    else if (env.FILES) await env.FILES.delete(key);
  } catch (err) {
    console.error("Kunde inte radera fil", key, err);
  }
}
