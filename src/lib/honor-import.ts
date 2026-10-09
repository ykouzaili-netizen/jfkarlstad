import type { Env } from "../env.js";
import { purgeIfUnused, registerMedia } from "./media.js";
import { putFile, randomKey } from "./storage.js";

/**
 * Engångsimport (2026-10-09): originalet av Lydia Kihléns porträtt ersätter bilden som var urklippt ur en
 * skärmdump – precis som om det hade laddats upp i adminpanelen (den gamla bilden raderas om inget annat använder den).
 * Bilden ligger tillfälligt i public/assets/import/hedersmedlemmar/ och tas bort ur koden när importen har körts.
 */
const FLAG = "import:lydia-original-2026-10";
const NAME = "Lydia Kihlén";
const FILE = "lydia-kihlen-original.jpg";

let done = false;

export async function importHonorPhotos(env: Env): Promise<void> {
  if (done) return;
  try {
    if (await env.DB.prepare("SELECT 1 FROM settings WHERE key = ?").bind(FLAG).first()) {
      done = true;
      return;
    }
    const row = await env.DB.prepare("SELECT id, photo_key FROM honors WHERE kind = 'hedersmedlem' AND name = ?").bind(NAME).first<{ id: number; photo_key: string | null }>();
    const res = await env.ASSETS.fetch(new Request(`https://assets.invalid/assets/import/hedersmedlemmar/${FILE}`));
    if (row && res.ok) {
      const data = await res.arrayBuffer();
      const key = randomKey("heder", "jpg");
      await putFile(env, key, data, { contentType: "image/jpeg", size: data.byteLength, filename: FILE });
      await registerMedia(env.DB, { key, kind: "image", filename: FILE, contentType: "image/jpeg", size: data.byteLength, width: 246, height: 325, hasSmall: false });
      await env.DB.prepare("UPDATE honors SET photo_key = ?, updated_at = datetime('now') WHERE id = ?").bind(key, row.id).run();
      await purgeIfUnused(env, row.photo_key);
    }
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").bind(FLAG).run();
    done = true;
  } catch (err) {
    console.error("Importen av Lydias porträtt misslyckades", err instanceof Error ? err.message : err);
  }
}
