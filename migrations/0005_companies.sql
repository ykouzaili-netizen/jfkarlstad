-- Arbetsgivare som inte är samarbetspartners men lägger upp jobb (t.ex. myndigheter, domstolar, mindre byråer).
-- Läggs in en gång under Jobb och praktik → Arbetsgivare och väljs sedan med snabbval när en tjänst läggs upp.
-- Logotypen visas på jobbannonsen; statistiken räknas på jobben (stats_daily: job_view, job_apply).
CREATE TABLE companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  logo_key    TEXT,
  website_url TEXT,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE jobs ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_company ON jobs(company_id);
