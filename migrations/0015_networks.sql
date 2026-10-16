-- Studentnätverk som JFK samarbetar med (JURO, ELSA Karlstad). Varje nätverk får en egen sida /om-oss/:slug
-- och ett kort under Samarbeten på Om oss. Ändras under Partners → Studentnätverk. Se src/lib/networks.ts.
-- Texterna på korten flyttas hit från textregistret (juro_* och elsa_*); "Så samarbetar vi" är ett utkast
-- som styrelsen bör se över.
CREATE TABLE networks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  kicker         TEXT NOT NULL DEFAULT '',
  summary        TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  collaboration  TEXT NOT NULL DEFAULT '',
  logo_key       TEXT,
  image_key      TEXT,
  image_alt      TEXT NOT NULL DEFAULT '',
  image_2_key    TEXT,
  image_2_caption TEXT NOT NULL DEFAULT '',
  image_3_key    TEXT,
  image_3_caption TEXT NOT NULL DEFAULT '',
  image_4_key    TEXT,
  image_4_caption TEXT NOT NULL DEFAULT '',
  website_url    TEXT,
  email          TEXT,
  links          TEXT NOT NULL DEFAULT '[]',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO networks (slug, name, kicker, summary, description, collaboration, website_url, sort_order) VALUES
('juro', 'JURO', 'Nationellt',
 'Juridiska Studentföreningars Riksorganisation – där Sveriges juridiska studentföreningar samarbetar och driver juriststudenternas frågor nationellt.',
 'Juridiska Studentföreningars Riksorganisation, JURO, grundades den 2 oktober 1993. Organisationen samlar de juridiska studentföreningarna vid de lärosäten i Sverige som ger juristexamen.

JURO samordnar frågor som rör juriststudenter och driver utbildningspolitiska frågor på nationell nivå – så att studenternas röst hörs när juristutbildningen diskuteras.',
 'JFK är en av medlemsföreningarna i JURO. Genom nätverket träffar vi juridiska studentföreningar från hela landet, delar erfarenheter och för fram Karlstadsstudenternas perspektiv i nationella utbildningsfrågor.',
 NULL, 1),
('elsa-karlstad', 'ELSA Karlstad', 'Internationellt',
 'Den lokala avdelningen av European Law Students'' Association – juriststudenternas väg till kurser, praktik och kontakter i hela Europa.',
 'ELSA Karlstad är den lokala avdelningen av European Law Students'' Association – ett av världens största nätverk för juriststudenter och unga jurister.

ELSA ordnar bland annat:

- föreläsningar i juridisk engelska
- ELSA Law Schools – sommar- och vinterkurser på en till två veckor runt om i Europa
- STEP, ett utbytesprogram för praktik utomlands',
 'JFK och ELSA Karlstad finns till för samma studenter. Tillsammans ger vi juriststudenterna i Karlstad både ett starkt lokalt sammanhang och en väg ut i Europa.',
 NULL, 2);
