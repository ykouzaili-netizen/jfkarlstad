-- Fotodatum i bildgalleriet. Bilderna visas efter när de togs (nyast först) och de utan fotodatum efter när de
-- laddades upp. taken_at är kamerans lokala tid ur bildens uppgifter (EXIF), "YYYY-MM-DDTHH:MM", eller ett datum som
-- styrelsen har skrivit in. exif_checked = 1 när bildens uppgifter har lästs (vid uppladdningen eller med knappen
-- "Läs fotodatum ur bilderna" för äldre bilder), även om inget datum fanns.
-- sort_order > 0 = egen ordning (dragen i adminpanelen) inom album och år; 0 = datumordning.
ALTER TABLE gallery_images ADD COLUMN taken_at TEXT;
ALTER TABLE gallery_images ADD COLUMN exif_checked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_gallery_taken ON gallery_images(album, year, taken_at);
