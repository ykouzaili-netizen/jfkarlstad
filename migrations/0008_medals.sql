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

-- Föreningens tio medaljer som färdiga platser att fylla i. De är dolda tills styrelsen har gett dem namn och
-- beskrivning och slagit på "Visa på webbplatsen" (Styrelse och uppdrag → Ordnar och medaljer).
INSERT INTO medals (name, design, sort_order, published) VALUES
  ('Våg i brons – rött och gult band', '01', 1, 0),
  ('Våg i brons – rött, vitt och blått band', '02', 2, 0),
  ('Sol med JFK i guld – gult band', '03', 3, 0),
  ('Sol med JFK i guld – gult band (ljusare)', '04', 4, 0),
  ('Stjärna i brons – rött band', '05', 5, 0),
  ('Våg i brons – grönt band', '06', 6, 0),
  ('Silver med emaljmärke – vitt och blått band', '07', 7, 0),
  ('Våg i brons – rött band', '08', 8, 0),
  ('Våg i brons – blått band', '09', 9, 0),
  ('Stjärna i brons – blått band', '10', 10, 0);
