-- Dokument kan vara en länk (t.ex. Google Dokument) i stället för en uppladdad PDF.
-- Länken vinner om båda finns; adminpanelen sparar bara den ena.
ALTER TABLE documents ADD COLUMN link_url TEXT;
