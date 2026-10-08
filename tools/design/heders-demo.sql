-- Exempelinnehåll för att granska Hedersmedlemmar och utmärkelser lokalt (inte en del av seed.sql).
-- Kör mot förhandsvisningens databas:  sqlite3 tools/local-preview/.data/local.sqlite < tools/design/heders-demo.sql
-- Medaljerna är föreningens tio medaljbilder (förlagan 2026-10-08) men saknar namn och beskrivning. Personerna är påhittade och märkta "(exempel)".

DELETE FROM honors WHERE kind IN ('hedersmedlem', 'utmarkelse');
DELETE FROM medals;

INSERT INTO medals (id, name, kind, design, description, founded, sort_order) VALUES
 (1, 'Medalj 1 (namn saknas)', 'medalj', '01', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 1),
 (2, 'Medalj 2 (namn saknas)', 'medalj', '02', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 2),
 (3, 'Medalj 3 (namn saknas)', 'medalj', '03', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 3),
 (4, 'Medalj 4 (namn saknas)', 'medalj', '04', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 4),
 (5, 'Medalj 5 (namn saknas)', 'medalj', '05', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 5),
 (6, 'Medalj 6 (namn saknas)', 'medalj', '06', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 6),
 (7, 'Medalj 7 (namn saknas)', 'medalj', '07', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 7),
 (8, 'Medalj 8 (namn saknas)', 'medalj', '08', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 8),
 (9, 'Medalj 9 (namn saknas)', 'medalj', '09', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 9),
 (10, 'Medalj 10 (namn saknas)', 'medalj', '10', 'Beskrivning saknas – fylls i av styrelsen.', 2025, 10);

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
