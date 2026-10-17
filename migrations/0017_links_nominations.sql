-- 0017: klick per partnerlänk, evenemang kopplade till studentnätverk, röstsiffror i tävlingen
-- och nomineringsformuläret (/nominera).

-- Klick per enskild länk i en partners länklista (bara totalsiffror per dag, utan IP/kakor)
CREATE TABLE IF NOT EXISTS stats_links (
  day         TEXT NOT NULL,            -- 'YYYY-MM-DD' (UTC)
  partner_id  INTEGER NOT NULL,
  link_id     TEXT NOT NULL,            -- id i partners.links (JSON)
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, partner_id, link_id)
);

-- Ett evenemang kan arrangeras tillsammans med ett studentnätverk (visas på nätverkets sida)
ALTER TABLE events ADD COLUMN network_id INTEGER;

-- Antal röster per bidrag (fylls i av styrelsen efter omröstningen; visas som diagram)
ALTER TABLE competition_entries ADD COLUMN votes INTEGER;

-- Nytt formulär: nominering. SQLite kan inte ändra en CHECK, så tabellen byggs om.
CREATE TABLE submissions_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  form         TEXT NOT NULL CHECK (form IN ('kontakt', 'foretag', 'paverka', 'engagemang', 'nominering')),
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
INSERT INTO submissions_new (id, form, status, name, email, subject, message, data, anonymous, email_sent, created_at, handled_at, handled_by, reminded_at)
  SELECT id, form, status, name, email, subject, message, data, anonymous, email_sent, created_at, handled_at, handled_by, reminded_at FROM submissions;
DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;
CREATE INDEX idx_submissions_status ON submissions(status, created_at DESC);
