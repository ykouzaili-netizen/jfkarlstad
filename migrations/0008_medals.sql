-- Belöningssystemet: föreningens ordnar och medaljer, och vilken av dem en utmärkelse avser.
-- Medaljens utseende är en av föreningens medaljbilder (design) eller ett uppladdat foto.

CREATE TABLE IF NOT EXISTS medals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'medalj' CHECK (kind IN ('orden', 'medalj')),
  design       TEXT NOT NULL DEFAULT '01',   -- föreningens medaljbild, public/assets/medaljer/medalj-<design>.png
  description  TEXT NOT NULL DEFAULT '',
  founded      INTEGER,
  image_key    TEXT,                         -- valfritt uppladdat foto som visas i stället för bilden
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- En utmärkelse (kind = 'utmarkelse') kan peka på en orden eller medalj. Tas medaljen bort blir fältet tomt.
ALTER TABLE honors ADD COLUMN medal_id INTEGER REFERENCES medals(id) ON DELETE SET NULL;
