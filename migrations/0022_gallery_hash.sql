-- Fingeravtryck (SHA-256) av originalfilen för galleribilder, räknat i webbläsaren innan bilden komprimeras.
-- Används för att varna när samma foto laddas upp igen. Bilder som laddades upp före 19 oktober 2026 saknar
-- fingeravtryck och kan därför inte kännas igen.
ALTER TABLE gallery_images ADD COLUMN file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_gallery_hash ON gallery_images(file_hash);
