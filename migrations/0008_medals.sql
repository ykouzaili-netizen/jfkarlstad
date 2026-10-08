-- Belöningssystemet: föreningens ordnar och medaljer, och vilken av dem en utmärkelse avser.
-- Medaljen ritas automatiskt utifrån slag, metall och bandets färger när ingen bild är uppladdad.

CREATE TABLE IF NOT EXISTS medals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'medalj' CHECK (kind IN ('orden', 'medalj')),
  metal        TEXT NOT NULL DEFAULT 'guld' CHECK (metal IN ('guld', 'silver', 'brons')),
  ribbon_pattern TEXT NOT NULL DEFAULT 'mittrand',
  ribbon_1     TEXT NOT NULL DEFAULT 'gul',
  ribbon_2     TEXT NOT NULL DEFAULT 'svart',
  description  TEXT NOT NULL DEFAULT '',
  founded      INTEGER,
  image_key    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- En utmärkelse (kind = 'utmarkelse') kan peka på en orden eller medalj. Tas medaljen bort blir fältet tomt.
ALTER TABLE honors ADD COLUMN medal_id INTEGER REFERENCES medals(id) ON DELETE SET NULL;
