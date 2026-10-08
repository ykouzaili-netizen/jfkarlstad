-- Exempelinnehåll för att granska Hedersmedlemmar och utmärkelser lokalt (inte en del av seed.sql).
-- Kör mot förhandsvisningens databas:  sqlite3 tools/local-preview/.data/local.sqlite < tools/design/heders-demo.sql
-- Allt är påhittat och märkt "(exempel)".

DELETE FROM honors WHERE kind IN ('hedersmedlem', 'utmarkelse');
DELETE FROM medals;

INSERT INTO medals (id, name, kind, metal, ribbon_pattern, ribbon_1, ribbon_2, description, founded, sort_order) VALUES
 (1, 'Juridiska Föreningens förtjänstorden (exempel)', 'orden', 'guld', 'kantrander', 'svart', 'gul',
  'Föreningens högsta utmärkelse. Tilldelas den som under lång tid och på ett avgörande sätt har format föreningen – i styrelsen, i utskotten eller i samarbetet med universitetet och arbetslivet.', 2025, 1),
 (2, 'Förtjänstmedaljen i guld (exempel)', 'medalj', 'guld', 'mittrand', 'gul', 'svart',
  'Tilldelas en medlem som har gjort en särskilt betydande insats för föreningen, till exempel genom att leda ett större projekt från idé till genomförande.', 2025, 2),
 (3, 'Förtjänstmedaljen i silver (exempel)', 'medalj', 'silver', 'mittrand', 'gul', 'svart',
  'Tilldelas en medlem som under minst ett verksamhetsår har gjort en förtjänstfull insats i styrelse eller utskott.', 2025, 3),
 (4, 'Engagemangsmedaljen (exempel)', 'medalj', 'brons', 'tre', 'bla', 'gul',
  'Tilldelas en medlem som genom ideellt engagemang har gjort föreningen roligare och mer välkomnande – som funktionär, faddrare eller eldsjäl bakom en tradition.', 2025, 4),
 (5, 'Inspektorsorden (exempel)', 'orden', 'silver', 'enfargat', 'lila', 'vit',
  'Delas ut av föreningens inspektor till en lärare eller företrädare för universitetet som har stärkt studenternas röst.', 2026, 5);

INSERT INTO honors (kind, name, year, description, medal_id, sort_order) VALUES
 ('hedersmedlem', 'Margareta Lindqvist (exempel)', 2024, 'Grundade föreningens mentorsprogram och har i över tio år ställt upp som föreläsare, domare i moot court och bollplank för styrelser som behövt råd.', NULL, 1),
 ('hedersmedlem', 'Johan Ekström (exempel)', 2023, 'Var föreningens inspektor i sex år och lade grunden för samarbetet med juristprogrammets programråd.', NULL, 2),
 ('hedersmedlem', 'Sara Al-Hassan (exempel)', 2022, 'Ordförande under föreningens tioårsjubileum. Byggde upp arbetsmarknadsmässan till det den är i dag.', NULL, 3),
 ('hedersmedlem', 'Per-Olof Nyberg (exempel)', 2019, 'Har som advokat och alumn tagit emot över trettio JFK-medlemmar på praktik och sommarnotarietjänst.', NULL, 4),
 ('hedersmedlem', 'Linnea Berg (exempel)', 2016, 'Föreningens första kassör. Skrev stadgarna som fortfarande gäller i stort sett oförändrade.', NULL, 5),
 ('hedersmedlem', 'Ali Rahimi (exempel)', 2013, 'Initiativtagare till Juridikens dag och föreningens samarbete med Juro.', NULL, 6),
 ('utmarkelse', 'Elsa Johansson (exempel)', 2026, 'För tre år i styrelsen, varav två som ordförande.', 1, 1),
 ('utmarkelse', 'Oskar Holm (exempel)', 2025, 'För arbetet med arbetsmarknadsmässan 2025.', 2, 1),
 ('utmarkelse', 'Nora Andersson (exempel)', 2026, 'För ett år som sekreterare.', 3, 1),
 ('utmarkelse', 'Viktor Lund (exempel)', 2025, 'För ett år som kassör.', 3, 2),
 ('utmarkelse', 'Hanna Sjöberg (exempel)', 2025, 'För insatserna som ansvarig för insparken.', 4, 1),
 ('utmarkelse', 'Amir Karimi (exempel)', 2026, 'För att ha hållit liv i pubkvällarna.', 4, 2),
 ('utmarkelse', 'Ida Svensson (exempel)', 2026, '', 4, 3);
