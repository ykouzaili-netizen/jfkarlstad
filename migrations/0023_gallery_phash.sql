-- Bildavtryck (dHash, 64 bitar som 16 hex-tecken) för galleribilder, räknat i webbläsaren ur hur bilden ser ut.
-- Till skillnad från file_hash (SHA-256 av originalfilen) känner det igen samma foto även när det har komprimerats
-- eller förminskats – så att dubblettvarningen fungerar även för bilder som laddades upp före 19 oktober 2026
-- (de får sitt avtryck med "Gå igenom äldre bilder" i Bildgalleri).
ALTER TABLE gallery_images ADD COLUMN phash TEXT;
