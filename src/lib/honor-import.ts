import type { Env } from "../env.js";
import { purgeIfUnused, registerMedia } from "./media.js";
import { putFile, randomKey } from "./storage.js";

/**
 * Engångsimport (2026-10-16): svartvita versioner av Yad Yassins och Svante Hallstedts porträtt ersätter
 * färgbilderna från 2026-10-15, så att de ser ut som de andra hedersmedlemmarnas – precis som om de hade
 * laddats upp i adminpanelen (färgbilden raderas om inget annat använder den). Bilderna ligger tillfälligt i
 * public/assets/import/hedersmedlemmar/ och tas bort ur koden när importen har körts. Körs bara en gång.
 */
const FLAG = "import:hedersmedlemmar-svartvitt-2026-10-16";
const PHOTOS: { id: number; name: string; oldKey: string; file: string; width: number; height: number }[] = [
  { id: 18, name: "Yad Yassin", oldKey: "heder-e2bb8a19957e4a419b25.jpg", file: "yad-yassin", width: 984, height: 1300 },
  { id: 19, name: "Svante Hallstedt", oldKey: "heder-4de2246a3b2b49d4ac81.jpg", file: "svante-hallstedt", width: 984, height: 1300 },
];

let done = false;

export async function importHonorPhotos(env: Env): Promise<void> {
  if (done) return;
  try {
    if (await env.DB.prepare("SELECT 1 FROM settings WHERE key = ?").bind(FLAG).first()) {
      done = true;
      return;
    }
    for (const p of PHOTOS) {
      // Bara om fotot fortfarande är färgbilden – har någon bytt bild i adminpanelen rörs den inte.
      const row = await env.DB.prepare("SELECT id FROM honors WHERE id = ? AND kind = 'hedersmedlem' AND name = ? AND photo_key = ?")
        .bind(p.id, p.name, p.oldKey)
        .first<{ id: number }>();
      if (!row) continue;
      const [full, small] = await Promise.all(
        [`${p.file}.jpg`, `${p.file}.sm.jpg`].map((f) => env.ASSETS.fetch(new Request(`https://assets.invalid/assets/import/hedersmedlemmar/${f}`))),
      );
      if (!full!.ok) continue;
      const data = await full!.arrayBuffer();
      const key = randomKey("heder", "jpg");
      const filename = `${p.file}.jpg`;
      await putFile(env, key, data, { contentType: "image/jpeg", size: data.byteLength, filename });
      let hasSmall = false;
      if (small!.ok) {
        const sdata = await small!.arrayBuffer();
        await putFile(env, `${key}.sm`, sdata, { contentType: "image/jpeg", size: sdata.byteLength, filename: `liten-${filename}` });
        hasSmall = true;
      }
      await registerMedia(env.DB, { key, kind: "image", filename, contentType: "image/jpeg", size: data.byteLength, width: p.width, height: p.height, hasSmall });
      await env.DB.prepare("UPDATE honors SET photo_key = ?, updated_at = datetime('now') WHERE id = ?").bind(key, row.id).run();
      await purgeIfUnused(env, p.oldKey);
    }
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").bind(FLAG).run();
    done = true;
  } catch (err) {
    console.error("Importen av de svartvita porträtten misslyckades", err instanceof Error ? err.message : err);
  }
}
