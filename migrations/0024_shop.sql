-- JFK Butik (/butik). Se src/pages/shop.ts och src/lib/shop.ts.
-- Ändras i adminpanelen under Innehåll → Butik (flikarna Produkter och Släpp). Texterna under Texter och sidor → Butik.
-- Första versionen visar sortimentet och släppen och har en varukorg i webbläsaren. Betalningen och beställningarna
-- till leverantören kopplas på när leverantören är vald – fram till dess säger kassan det rakt ut.

-- Släpp: en kollektion som bara kan beställas under en period och trycks samlat när perioden är slut.
-- Tiderna är svensk lokal tid "YYYY-MM-DDTHH:MM" (som evenemangen).
CREATE TABLE IF NOT EXISTS shop_drops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  min_qty       INTEGER,
  delivery_note TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL DEFAULT '',
  published     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Produkter. kind = 'alltid' (sortimentet) eller 'slapp' (bara medan släppet pågår).
-- garment styr den tecknade bilden som visas när det inte finns något foto.
CREATE TABLE IF NOT EXISTS shop_products (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  kind             TEXT NOT NULL DEFAULT 'alltid' CHECK (kind IN ('alltid', 'slapp')),
  drop_id          INTEGER,
  garment          TEXT NOT NULL DEFAULT 'hoodie' CHECK (garment IN ('hoodie', 'tshirt', 'pase', 'mossa', 'marke', 'annat')),
  featured         INTEGER NOT NULL DEFAULT 0,
  price            INTEGER NOT NULL DEFAULT 0,
  summary          TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  colors           TEXT NOT NULL DEFAULT '',
  sizes            TEXT NOT NULL DEFAULT '',
  sold_out         TEXT NOT NULL DEFAULT '',
  image_key        TEXT,
  image_alt        TEXT NOT NULL DEFAULT '',
  image2_key       TEXT,
  image2_caption   TEXT NOT NULL DEFAULT '',
  image3_key       TEXT,
  image3_caption   TEXT NOT NULL DEFAULT '',
  image4_key       TEXT,
  image4_caption   TEXT NOT NULL DEFAULT '',
  model_note       TEXT NOT NULL DEFAULT '',
  designer         TEXT NOT NULL DEFAULT '',
  designer_program TEXT NOT NULL DEFAULT '',
  designer_quote   TEXT NOT NULL DEFAULT '',
  sketch_key       TEXT,
  material         TEXT NOT NULL DEFAULT '',
  care             TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  published        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS shop_products_drop ON shop_products (drop_id);

-- Exempel så att sidan går att se och prova innan riktiga produkter och priser finns. Priserna och datumen är
-- påhittade – styrelsen ändrar eller tar bort dem under Innehåll → Butik.
INSERT INTO shop_drops (label, title, starts_at, ends_at, min_qty, delivery_note, summary) VALUES
('Släpp 01', 'Vinnarna', '2026-10-20T00:00', '2027-01-30T23:59', 30, 'Hos dig omkring tre veckor efter att släppet stängt',
 'Märket och tröjan som vann medlemmarnas omröstning i märkes- och merchtävlingen.');

INSERT INTO shop_products (name, slug, kind, drop_id, garment, featured, price, summary, colors, sizes, designer_quote, material, care, sort_order) VALUES
('Vinnartröjan', 'vinnartrojan', 'slapp', 1, 'hoodie', 1, 449, 'Ritad av en medlem och framröstad av er. Trycks bara i det antal som beställs.', 'Krämvit #ece4d0', 'XS, S, M, L, XL, XXL', '', '', '', 1),
('Vinnarmärket', 'vinnarmarket', 'slapp', 1, 'marke', 1, 79, 'Broderat, 8 cm. Till varselbyxorna, jackan eller datorväskan.', '', '', '', '', '', 2),
('JFK-hoodie', 'jfk-hoodie', 'alltid', NULL, 'hoodie', 1, 449, 'Den du har på dig hela tentaperioden. Logotypen på bröstet, inget på ryggen.', 'Svart #1d1d1d
Krämvit #ece4d0', 'XS, S, M, L, XL, XXL', '', '', '', 3),
('JFK-t-shirt', 'jfk-t-shirt', 'alltid', NULL, 'tshirt', 0, 229, 'Vit, med en liten logotyp på bröstet.', 'Vit #f6f3ea', 'XS, S, M, L, XL, XXL', '', '', '', 4),
('Tygpåse', 'tygpase', 'alltid', NULL, 'pase', 0, 129, 'Rymmer en lagbok, en dator och lunchen.', 'Naturvit #e9dfc4', '', '', '', '', 5),
('Mössa', 'mossa', 'alltid', NULL, 'mossa', 0, 199, 'Ribbstickad, i JFK-gult.', 'Gul #f1cc4d', '', '', '', '', 6);

-- Sidan är dold tills styrelsen väljer att visa den (Texter och sidor → Butik → Visa sidan på webbplatsen).
INSERT OR IGNORE INTO settings (key, value) VALUES ('sida:butik', 'dold');
