-- Belöningssystemet: föreningens ordnar och medaljer, och vilken av dem en utmärkelse avser.
-- Medaljen ritas automatiskt utifrån motiv, metall och bandets färger när ingen bild är uppladdad.
-- (Ändrad 2026-10-08 innan den körts i produktion: motiv, svärtad metall och tredje bandfärg efter de riktiga medaljerna.)

CREATE TABLE IF NOT EXISTS medals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'medalj' CHECK (kind IN ('orden', 'medalj')),
  motif        TEXT NOT NULL DEFAULT 'vag',
  metal        TEXT NOT NULL DEFAULT 'brons',
  ribbon_pattern TEXT NOT NULL DEFAULT 'enfargat',
  ribbon_1     TEXT NOT NULL DEFAULT 'gul',
  ribbon_2     TEXT NOT NULL DEFAULT 'rod',
  ribbon_3     TEXT NOT NULL DEFAULT 'bla',
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
