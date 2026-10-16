-- År för galleribilderna, så att varje album kan delas upp per år (t.ex. Arbetsmarknadsmässor 2025, 2026).
-- Tomt (NULL) = inget år angivet; sådana bilder visas under "Utan årtal" tills ett år har satts.
ALTER TABLE gallery_images ADD COLUMN year INTEGER;
CREATE INDEX IF NOT EXISTS idx_gallery_album_year ON gallery_images(album, year);
