-- Bildgalleriets kategorier (album) blir redigerbara: styrelsen lägger till, byter namn på och sorterar dem under
-- Bildgalleri → Kategorier. Bilderna och filmerna pekar fortfarande på kategorins namn (gallery_images.album,
-- gallery_videos.album); byter man namn uppdateras de i samma steg. Fotograf per bild visas i bildrutan.
CREATE TABLE IF NOT EXISTS gallery_albums (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO gallery_albums (name, sort_order) VALUES
  ('Banketter', 10), ('Arbetsmarknadsmässor', 20), ('Halvtidsmiddagar', 30), ('Inspark', 40), ('Övriga evenemang', 50);
-- Album som redan används men inte finns bland standardvalen (bör inte finnas, men inget får försvinna)
INSERT OR IGNORE INTO gallery_albums (name, sort_order) SELECT DISTINCT album, 900 FROM gallery_images WHERE album <> '';
ALTER TABLE gallery_images ADD COLUMN photographer TEXT NOT NULL DEFAULT '';
