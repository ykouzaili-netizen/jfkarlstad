-- Migrering 2: versionshistorik för texter, bildbank, schemalagd publicering,
-- jobb och praktik, lediga uppdrag (Engagera dig), partnerstatistik och nytt formulär.

-- ───────── Versionshistorik för texter (Ångra / Tidigare versioner) ─────────
CREATE TABLE setting_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  batch       TEXT,               -- alla ändringar från samma sparning har samma batch (för Ångra)
  user_email  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_setting_versions_key ON setting_versions(key, id DESC);
CREATE INDEX idx_setting_versions_batch ON setting_versions(batch);

-- ───────── Bildbank: alla uppladdade filer ─────────
CREATE TABLE media (
  key           TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'pdf')),
  filename      TEXT NOT NULL DEFAULT '',
  content_type  TEXT NOT NULL DEFAULT '',
  size          INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  has_small     INTEGER NOT NULL DEFAULT 0,   -- finns en mindre version (nyckel + ".sm")
  uploaded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_created ON media(created_at DESC);

-- Befintliga filer läggs in i bildbanken
INSERT OR IGNORE INTO media (key, kind) SELECT image_key, 'image' FROM news WHERE image_key IS NOT NULL AND image_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT image_key, 'image' FROM events WHERE image_key IS NOT NULL AND image_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT logo_key, 'image' FROM partners WHERE logo_key IS NOT NULL AND logo_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT photo_key, 'image' FROM board_members WHERE photo_key IS NOT NULL AND photo_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT photo_key, 'image' FROM honors WHERE photo_key IS NOT NULL AND photo_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT image_key, 'image' FROM gallery_images WHERE image_key IS NOT NULL AND image_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT file_key, 'pdf' FROM documents WHERE file_key IS NOT NULL AND file_key != '';
INSERT OR IGNORE INTO media (key, kind) SELECT value, 'image' FROM settings WHERE key LIKE '%\_key' ESCAPE '\' AND value != '';

-- ───────── Schemalagd publicering av evenemang ─────────
ALTER TABLE events ADD COLUMN publish_at TEXT;   -- UTC; NULL = direkt

-- ───────── Jobb och praktik ─────────
CREATE TABLE jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  employer    TEXT NOT NULL,
  partner_id  INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'jobb' CHECK (kind IN ('praktik', 'sommarnotarie', 'trainee', 'jobb', 'uppsats', 'annat')),
  location    TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  apply_url   TEXT,
  deadline    TEXT,               -- 'YYYY-MM-DD' (svensk tid); NULL = löpande urval
  publish_at  TEXT,               -- UTC; NULL = direkt
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_jobs_pub ON jobs(published, deadline);
CREATE INDEX idx_jobs_partner ON jobs(partner_id);

-- ───────── Lediga uppdrag (Engagera dig) ─────────
CREATE TABLE positions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  committee      TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  commitment     TEXT NOT NULL DEFAULT '',
  contact_email  TEXT,
  open_until     TEXT,            -- 'YYYY-MM-DD'; NULL = tills vidare
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────── Statistik till partners: bara totalsiffror per dag, inget om besökaren ─────────
CREATE TABLE stats_daily (
  day     TEXT NOT NULL,          -- 'YYYY-MM-DD' (svensk tid)
  kind    TEXT NOT NULL,          -- partner_view, partner_website, partner_career, job_view, job_apply
  ref_id  INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, ref_id)
);

-- ───────── Formulärinskick: nytt formulär (engagemang) + påminnelser ─────────
-- SQLite kan inte ändra en CHECK-regel, så tabellen byggs om.
CREATE TABLE submissions_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  form         TEXT NOT NULL CHECK (form IN ('kontakt', 'foretag', 'paverka', 'engagemang')),
  status       TEXT NOT NULL DEFAULT 'ny' CHECK (status IN ('ny', 'hanterad')),
  name         TEXT,
  email        TEXT,
  subject      TEXT,
  message      TEXT NOT NULL,
  data         TEXT NOT NULL DEFAULT '{}',
  anonymous    INTEGER NOT NULL DEFAULT 0,
  email_sent   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  handled_at   TEXT,
  handled_by   TEXT,
  reminded_at  TEXT
);
INSERT INTO submissions_new (id, form, status, name, email, subject, message, data, anonymous, email_sent, created_at, handled_at, handled_by)
  SELECT id, form, status, name, email, subject, message, data, anonymous, email_sent, created_at, handled_at, handled_by FROM submissions;
DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;
CREATE INDEX idx_submissions_status ON submissions(status, created_at DESC);
