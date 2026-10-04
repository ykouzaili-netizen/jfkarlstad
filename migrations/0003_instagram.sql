-- Migrering 3: inlägg från Instagram till startsidans Instagram-avsnitt.
-- Inläggen läggs in för hand i adminpanelen (source = 'manuell') eller hämtas automatiskt från föreningens
-- eget konto när en Instagram-nyckel finns (source = 'auto', se src/lib/instagram.ts). Bilderna lagras
-- alltid på webbplatsen, så besökarnas webbläsare kontaktar aldrig Instagram.
CREATE TABLE IF NOT EXISTS instagram_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ig_id       TEXT UNIQUE,                 -- Instagrams id för automatiskt hämtade inlägg
  source      TEXT NOT NULL DEFAULT 'manuell' CHECK (source IN ('manuell', 'auto')),
  image_key   TEXT NOT NULL,
  permalink   TEXT NOT NULL DEFAULT '',
  caption     TEXT NOT NULL DEFAULT '',
  posted_at   TEXT,                        -- 'YYYY-MM-DD'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_order ON instagram_posts(published, posted_at DESC, id DESC);
