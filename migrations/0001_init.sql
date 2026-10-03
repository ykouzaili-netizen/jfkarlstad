-- JFK webbplats – initialt schema
-- Tider lagras som text. *_at = UTC i ISO-format (datetime('now')).
-- Evenemangstider (starts_at/ends_at) lagras som svensk lokal tid 'YYYY-MM-DDTHH:MM'.

PRAGMA foreign_keys = ON;

-- Inställningar och redigerbara texter (nyckel/värde). Saknade nycklar faller tillbaka på standardvärden i koden.
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Administratörer och redaktörer
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'redaktor')),
  password_hash   TEXT NOT NULL,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

-- Inloggningssessioner. id är SHA-256 av cookie-token (token lagras aldrig i klartext).
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Lösenordsåterställning. token_hash = SHA-256 av token i länken.
CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

-- Ändringslogg
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL,      -- t.ex. 'skapade', 'ändrade', 'tog bort', 'loggade in'
  entity      TEXT NOT NULL,      -- t.ex. 'nyhet', 'event', 'inställningar'
  entity_id   TEXT,
  summary     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- Nyheter
CREATE TABLE news (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  image_key     TEXT,
  image_alt     TEXT NOT NULL DEFAULT '',
  published     INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_news_pub ON news(published, published_at DESC);

-- Evenemang
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT '',
  starts_at    TEXT NOT NULL,     -- svensk lokal tid 'YYYY-MM-DDTHH:MM'
  ends_at      TEXT,
  signup_url   TEXT,
  members_only INTEGER NOT NULL DEFAULT 0,
  image_key    TEXT,
  image_alt    TEXT NOT NULL DEFAULT '',
  published    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_start ON events(published, starts_at);

-- Samarbetspartners
CREATE TABLE partners (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  tier         TEXT NOT NULL CHECK (tier IN ('huvud', 'partner')),
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  logo_key     TEXT,
  website_url  TEXT,
  career_url   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Styrelsen
CREATE TABLE board_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  email       TEXT,
  photo_key   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hedersmedlemmar, Årets pedagog och övriga utmärkelser
CREATE TABLE honors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL CHECK (kind IN ('hedersmedlem', 'arets_pedagog', 'utmarkelse')),
  name         TEXT NOT NULL,
  year         INTEGER,
  description  TEXT NOT NULL DEFAULT '',
  photo_key    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kursombud
CREATE TABLE course_reps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  term        TEXT NOT NULL,      -- t.ex. 'T4'
  name        TEXT,
  email       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Bildgalleri
CREATE TABLE gallery_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  album       TEXT NOT NULL,      -- 'Banketter', 'Arbetsmarknadsmässor', ...
  image_key   TEXT NOT NULL,
  alt         TEXT NOT NULL DEFAULT '',
  caption     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vanliga frågor
CREATE TABLE faq (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL DEFAULT 'Allmänt',
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dokument (PDF i R2)
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('stadgar', 'styrdokument', 'protokoll', 'ovrigt')),
  year        INTEGER NOT NULL,
  file_key    TEXT,               -- NULL = dokument saknas ännu (visas som "kommer snart")
  file_size   INTEGER,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_year ON documents(year DESC, category);

-- Formulärinskick (kontakt, företag, JF Påverka)
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  form         TEXT NOT NULL CHECK (form IN ('kontakt', 'foretag', 'paverka')),
  status       TEXT NOT NULL DEFAULT 'ny' CHECK (status IN ('ny', 'hanterad')),
  name         TEXT,
  email        TEXT,
  subject      TEXT,
  message      TEXT NOT NULL,
  data         TEXT NOT NULL DEFAULT '{}',   -- övriga fält som JSON
  anonymous    INTEGER NOT NULL DEFAULT 0,
  email_sent   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  handled_at   TEXT,
  handled_by   TEXT
);
CREATE INDEX idx_submissions_status ON submissions(status, created_at DESC);

-- Rate limiting (nyckel = hash av t.ex. formulär + IP). Rensas löpande.
CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL,
  window_start  INTEGER NOT NULL   -- unix-sekunder
);
