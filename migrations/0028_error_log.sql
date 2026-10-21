-- Migrering 28: tekniska fel (500) sparas i en egen tabell, så att de går att felsöka utan Cloudflares anropsloggar.
-- Bara metod, adress (engångslänkar maskade) och felmeddelandet – aldrig personuppgifter. Rensas efter 30 dagar.
CREATE TABLE IF NOT EXISTS error_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  method     TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  stack      TEXT NOT NULL DEFAULT ''
);
