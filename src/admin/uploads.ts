import type { Env } from "../env.js";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PDF_BYTES, isSafeSvg, putFile, randomKey, sniffType } from "../lib/storage.js";

export type UploadResult = { ok: true; key: string; size: number } | { ok: false; error: string } | { ok: true; key: null; size: 0 };

function isFile(v: unknown): v is File {
  return typeof v === "object" && v !== null && "arrayBuffer" in v && "size" in v && "name" in v;
}

/**
 * Validera och spara en uppladdad fil. Kontrollerar storlek och filens faktiska innehåll (inte bara filändelsen).
 * Returnerar key: null om inget valdes.
 */
export async function handleUpload(env: Env, value: FormDataEntryValue | null, kind: "image" | "pdf", prefix: string): Promise<UploadResult> {
  if (!isFile(value) || value.size === 0) return { ok: true, key: null, size: 0 };
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  if (value.size > max) {
    return { ok: false, error: `Filen är för stor (${(value.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB). Max ${max / 1024 / 1024} MB.` };
  }
  const data = await value.arrayBuffer();
  const type = sniffType(new Uint8Array(data.slice(0, 1024)));
  if (kind === "pdf") {
    if (type !== "application/pdf") return { ok: false, error: "Filen måste vara en PDF." };
  } else {
    if (!type || !(type in IMAGE_TYPES)) return { ok: false, error: "Bilden måste vara JPG, PNG, WebP, GIF eller SVG." };
    if (type === "image/svg+xml" && !isSafeSvg(new TextDecoder().decode(data))) {
      return { ok: false, error: "SVG-filen innehåller skript eller externa länkar och kan inte användas. Exportera den igen eller använd PNG." };
    }
  }
  const ext = kind === "pdf" ? "pdf" : IMAGE_TYPES[type!]!;
  const key = randomKey(prefix, ext);
  const filename = value.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || `fil.${ext}`;
  await putFile(env, key, data, { contentType: type!, size: value.size, filename });
  return { ok: true, key, size: value.size };
}
