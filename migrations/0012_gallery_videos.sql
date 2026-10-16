-- Filmer i bildgalleriet (”Biografen” under För studenter). Själva filmerna ligger på YouTube; här sparas länken,
-- videons id, om den är stående (9:16) och en valfri egen stillbild. YouTubes stillbild hämtas av Workern och
-- lagras på sajten, så att besökaren inte kontaktar YouTube förrän hen själv startar filmen.
CREATE TABLE IF NOT EXISTS gallery_videos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  youtube_url  TEXT NOT NULL,
  youtube_id   TEXT NOT NULL,
  vertical     INTEGER NOT NULL DEFAULT 0,
  album        TEXT NOT NULL DEFAULT '',
  year         INTEGER,
  description  TEXT NOT NULL DEFAULT '',
  poster_key   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_pub ON gallery_videos(published, year);
