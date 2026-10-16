-- En valfri bild på varje partners egen sida, med valbart utseende (se src/lib/partner-image.ts):
-- banner = brett bildband, bakgrund = bakom namnet i toppen, delad = bredvid namnet,
-- spalt = i sidospalten, platta = i texten med en färgad platta bakom.
-- image_alt beskriver bilden för skärmläsare (tom = bilden räknas som dekoration).
ALTER TABLE partners ADD COLUMN image_key TEXT;
ALTER TABLE partners ADD COLUMN image_style TEXT NOT NULL DEFAULT 'banner';
ALTER TABLE partners ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';
