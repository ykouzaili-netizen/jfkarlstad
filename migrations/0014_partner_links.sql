-- Fler länkar på en partners egen sida (utöver webbplats och karriärsida), som JSON:
-- [{"label": "LinkedIn", "url": "https://…"}, …]. Se src/lib/partner-links.ts.
ALTER TABLE partners ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
