import type { Env } from "../env.js";
import { registerMedia } from "./media.js";
import { putFile, randomKey } from "./storage.js";

/**
 * Engångsimport (2026-10-15): porträtten av hedersmedlemmarna Yad Yassin och Svante Hallstedt läggs i
 * fillagringen och bildbanken och kopplas till hedersmedlemmarna – precis som om de hade laddats upp i
 * adminpanelen. Bilderna ligger tillfälligt i public/assets/import/hedersmedlemmar/ och tas bort ur koden
 * när importen har körts i produktion. Körs bara för hedersmedlemmar som saknar foto, och bara en gång.
 */
const FLAG = "import:hedersmedlemmar-2026-10-15";
const PHOTOS: { id: number; name: string; file: string; width: number; height: number }[] = [
  { id: 18, name: "Yad Yassin", file: "yad-yassin", width: 984, height: 1300 },
  { id: 19, name: "Svante Hallstedt", file: "svante-hallstedt", width: 984, height: 1300 },
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
      const row = await env.DB.prepare(
        "SELECT id FROM honors WHERE id = ? AND kind = 'hedersmedlem' AND name = ? AND (photo_key IS NULL OR photo_key = '')",
      )
        .bind(p.id, p.name)
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
    }
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").bind(FLAG).run();
    done = true;
  } catch (err) {
    console.error("Importen av hedersmedlemmarnas porträtt misslyckades", err instanceof Error ? err.message : err);
  }
}
