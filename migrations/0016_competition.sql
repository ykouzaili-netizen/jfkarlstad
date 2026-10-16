-- Merch- och märkestävlingen (/tavling). Se src/pages/competition.ts och src/lib/competition.ts.
-- Ändras i adminpanelen under Innehåll → Tävlingen (flikarna Bidrag och Material).

-- Bidragen som visas på sidan under och efter röstningen (Design A, B, C …). Upphovspersonen visas först när
-- röstningen är klar – innan dess skickas namnet aldrig till besökarens webbläsare.
CREATE TABLE IF NOT EXISTS competition_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'marke' CHECK (category IN ('marke', 'merch')),
  image_key   TEXT,
  alt         TEXT NOT NULL DEFAULT '',
  designer    TEXT NOT NULL DEFAULT '',
  winner      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Verktyg och material för deltagarna: tips på program (länk) och filer att ladda ned (bilder, logotyper).
CREATE TABLE IF NOT EXISTS competition_resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL DEFAULT 'program' CHECK (kind IN ('program', 'fil')),
  title       TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT,
  file_key    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO competition_resources (kind, title, label, description, url, sort_order) VALUES
('program', 'Inkscape', 'Gratis · Windows, Mac, Linux', 'Vektorprogram som passar perfekt för märken: skarpa kanter, få färger och export till SVG, PDF och EPS.', 'https://inkscape.org', 1),
('program', 'Affinity', 'Gratis · Windows, Mac', 'Canvas proffsprogram för vektor, foto och layout i ett. Kräver ett gratis Canva-konto.', 'https://www.affinity.studio', 2),
('program', 'Canva', 'Gratis grundversion · webben och mobilen', 'Snabbaste vägen till en tryckidé med text, former och färger – direkt i webbläsaren.', 'https://www.canva.com', 3),
('program', 'Krita', 'Gratis · Windows, Mac, Linux', 'För dig som vill rita för hand med ritplatta. Penslar, lager och export till PNG.', 'https://krita.org', 4),
('program', 'Photopea', 'Gratis · i webbläsaren', 'Fungerar som Photoshop direkt i webbläsaren och öppnar PSD-filer. Inget att installera.', 'https://www.photopea.com', 5),
('program', 'Procreate', 'Engångsköp · iPad', 'Rita med Apple Pencil. Exportera som PNG med genomskinlig bakgrund i hög upplösning.', 'https://procreate.com', 6);

-- Sidan är dold tills styrelsen väljer att visa den (Texter och sidor → Merch- och märkestävlingen → Visa sidan på webbplatsen).
INSERT OR IGNORE INTO settings (key, value) VALUES ('sida:tavling', 'dold');
