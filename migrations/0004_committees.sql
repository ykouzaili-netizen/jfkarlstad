-- Migrering 4: utskotten som egen innehållstyp (Styrelse och uppdrag → Utskott), med längre beskrivning
-- och bilder. Workern skapar samma tabell själv om den saknas (src/lib/committees.ts) och flyttar då över
-- den gamla textlistan (inställningen "committees").
CREATE TABLE IF NOT EXISTS committees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  summary     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  commitment  TEXT NOT NULL DEFAULT '',
  image_1_key TEXT,
  image_1_alt TEXT NOT NULL DEFAULT '',
  image_2_key TEXT,
  image_2_alt TEXT NOT NULL DEFAULT '',
  image_3_key TEXT,
  image_3_alt TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_committees_order ON committees(published, sort_order, id);
