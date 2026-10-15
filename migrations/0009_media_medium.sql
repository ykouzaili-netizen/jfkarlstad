-- Mellanstor bildversion (1600 px bred, ".md") och bredd-baserad liten version (800 px bred, ".sm").
-- has_medium = 1 när båda versionerna är gjorda med de nya reglerna (vid uppladdning eller med
-- "Optimera bilderna" i bildbanken). Äldre bilder får 0 och visas tills dess med originalet som reserv.
ALTER TABLE media ADD COLUMN has_medium INTEGER NOT NULL DEFAULT 0;
