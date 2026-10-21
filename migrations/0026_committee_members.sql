-- Migrering 26: utskottens egna sidor (/om-oss/utskott/:slug) med anslagsbild och medlemmar, arkivet "Tidigare år"
-- för styrelsen och utskotten, och evenemang som arrangeras av ett utskott.
--
-- Verksamhetsåret ("2026/27") styr vilka personer som visas: inställningen service_year är året som visas på
-- webbplatsen (byts under Styrelseskifte). Äldre år visas som Tidigare år, ett senare år är nästa styrelse
-- som läggs in i förväg och syns först när året byts.

-- Anslagsbilden: på kortet under Om oss och överst på utskottets sida. cover_focus = vad som alltid ska synas
-- när bilden beskärs olika på kortet (stående) och på sidan (liggande).
ALTER TABLE committees ADD COLUMN cover_key TEXT;
ALTER TABLE committees ADD COLUMN cover_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE committees ADD COLUMN cover_focus TEXT NOT NULL DEFAULT 'mitten';
ALTER TABLE committees ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS committee_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL,
  year         TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  program      TEXT NOT NULL DEFAULT '',
  quote        TEXT NOT NULL DEFAULT '',
  photo_key    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_committee_members ON committee_members(committee_id, year, sort_order, id);

-- Styrelsen får verksamhetsår. Alla som finns i dag hör till det nuvarande året.
ALTER TABLE board_members ADD COLUMN year TEXT NOT NULL DEFAULT '';
UPDATE board_members SET year = '2026/27' WHERE year = '';
INSERT OR IGNORE INTO settings (key, value) VALUES ('service_year', '2026/27');

-- Evenemang som ett utskott arrangerar (visas på utskottets sida och på eventet).
ALTER TABLE events ADD COLUMN committee_id INTEGER;

-- Lagbild: utskottets gruppbild för ett år med numrerade punkter på personerna (committee_members.marker_x/y,
-- procent av bildens bredd/höjd). Utskottet väljer om medlemmarna visas som porträtt eller lagbild (meet_style).
ALTER TABLE committees ADD COLUMN meet_style TEXT NOT NULL DEFAULT 'portratt';
ALTER TABLE committee_members ADD COLUMN marker_x REAL;
ALTER TABLE committee_members ADD COLUMN marker_y REAL;

-- Gruppbilder per verksamhetsår: för ett utskott (committee_id) eller styrelsen (committee_id = 0).
-- Visas som lagbild, överst bland årets styrelse och under Tidigare år. Raderas helt när de tas bort (personer).
CREATE TABLE IF NOT EXISTS group_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL DEFAULT 0,
  year         TEXT NOT NULL,
  image_key    TEXT NOT NULL,
  image_alt    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (committee_id, year)
);
