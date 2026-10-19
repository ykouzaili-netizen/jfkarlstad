-- Omslagsbild per kategori (Bildgalleri → Kategorier → Välj omslag). Visas som en liten bild på albumknappen i
-- bildgalleriet. NULL = inget omslag (knappen ser ut som förut). Tas bilden bort försvinner omslaget av sig självt
-- (frågorna kräver att bilden finns kvar i samma kategori).
ALTER TABLE gallery_albums ADD COLUMN cover_id INTEGER;
