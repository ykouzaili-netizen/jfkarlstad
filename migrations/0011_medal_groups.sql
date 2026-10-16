-- Belöningssystemet: medaljerna delas in i grupper med egna rubriker på Om oss
-- (heder = Hedersmedlemskap, organ = Styrelse och utskott, projekt = Kommittéer och projektgrupper,
-- arets = Årets utmärkelser). Tomt = ingen grupp; har ingen medalj en grupp visas de utan rubriker som förut.
ALTER TABLE medals ADD COLUMN category TEXT NOT NULL DEFAULT '';
