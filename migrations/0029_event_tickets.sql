-- Migrering 29: när biljettförsäljningen till ett evenemang börjar och slutar (svensk lokal tid 'YYYY-MM-DDTHH:MM').
-- Båda är valfria. Visas i kalendern (på dagen för släppet och sista dagen) och på evenemanget.
ALTER TABLE events ADD COLUMN tickets_open_at TEXT;
ALTER TABLE events ADD COLUMN tickets_close_at TEXT;
