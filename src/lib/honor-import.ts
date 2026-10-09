import type { Env } from "../env.js";
import { registerMedia } from "./media.js";
import { putFile, randomKey } from "./storage.js";

/**
 * Engångsimport (2026-10-09): porträtten av Årets pedagog 2018–2024 från den gamla sajten läggs i fillagringen
 * och bildbanken och kopplas till pristagarna med samma namn – precis som om de hade laddats upp i adminpanelen.
 * Samma person (Jack Ågren, två år) får samma bild. Bilderna ligger tillfälligt i public/assets/import/pedagoger/
 * och tas bort ur koden när importen har körts. Körs bara för pristagare som saknar foto, och bara en gång.
 */
const FLAG = "import:pedagoger-2026-10";
const PHOTOS: { name: string; file: string }[] = [
  { name: "Jack Ågren", file: "jack-agren" },
  { name: "Jane Stoll", file: "jane-stoll" },
  { name: "Germaine Hillerström", file: "germaine-hillerstrom" },
  { name: "Andreas Prochazka", file: "andreas-prochazka" },
  { name: "Peter Lillieh", file: "peter-lillieh" },
  { name: "Fredrik Hjorth", file: "fredrik-hjorth" },
];
const SIZE = 254;

let done = false;

export async function importHonorPhotos(env: Env): Promise<void> {
  if (done) return;
  try {
    if (await env.DB.prepare("SELECT 1 FROM settings WHERE key = ?").bind(FLAG).first()) {
      done = true;
      return;
    }
    for (const p of PHOTOS) {
      const { results } = await env.DB.prepare("SELECT id FROM honors WHERE kind = 'arets_pedagog' AND name = ? AND (photo_key IS NULL OR photo_key = '')").bind(p.name).all<{ id: number }>();
      if (!results.length) continue;
      const res = await env.ASSETS.fetch(new Request(`https://assets.invalid/assets/import/pedagoger/${p.file}.jpg`));
      if (!res.ok) continue;
      const data = await res.arrayBuffer();
      const key = randomKey("pedagog", "jpg");
      const filename = `${p.file}.jpg`;
      await putFile(env, key, data, { contentType: "image/jpeg", size: data.byteLength, filename });
      await registerMedia(env.DB, { key, kind: "image", filename, contentType: "image/jpeg", size: data.byteLength, width: SIZE, height: SIZE, hasSmall: false });
      for (const r of results) await env.DB.prepare("UPDATE honors SET photo_key = ?, updated_at = datetime('now') WHERE id = ?").bind(key, r.id).run();
    }
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").bind(FLAG).run();
    done = true;
  } catch (err) {
    console.error("Importen av pedagogernas porträtt misslyckades", err instanceof Error ? err.message : err);
  }
}
