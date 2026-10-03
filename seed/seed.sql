-- Startinnehåll för JFK:s webbplats.
-- Texter är hämtade från jfkarlstad.se och språkligt förbättrade.
-- Allt som är markerat "(exempel)" eller "[Platshållare]" ska ersättas eller tas bort i adminpanelen.
-- Redigerbara texter och färger har standardvärden i koden (src/lib/settings.ts), så settings-tabellen kan börja tom.

DELETE FROM news; DELETE FROM events; DELETE FROM partners; DELETE FROM board_members;
DELETE FROM honors; DELETE FROM course_reps; DELETE FROM faq; DELETE FROM documents;

-- ───────────── Styrelsen 2026 ─────────────
INSERT INTO board_members (name, role, email, sort_order) VALUES
 ('Ebba Utberg',        'Ordförande',                       'ordforande@jfkarlstad.se',               1),
 ('Simél Gabrail',      'Vice ordförande',                  'viceordforande@jfkarlstad.se',           2),
 ('Emma Berander',      'Sekreterare',                      'sekreterare@jfkarlstad.se',              3),
 ('Ida Folkö',          'Kassör',                           'kassor@jfkarlstad.se',                   4),
 ('Emilia Ebeling',     'Utbildningsansvarig',              'utbildningsansvarig@jfkarlstad.se',      5),
 ('Nora Algurén',       'Vice utbildningsansvarig',         'viceutbildningsansvarig@jfkarlstad.se',  6),
 ('Filippa Hemberg',    'Arbetsmarknadsansvarig',           'arbetsmarknadsansvarig@jfkarlstad.se',   7),
 ('Gabriel Åhman',      'Vice arbetsmarknadsansvarig',      'vicearbetsmarknadsansvarig@jfkarlstad.se', 8),
 ('Tyra Hedberg',       'Evenemangsansvarig (Sexmästare)',  'evenemangsansvarig@jfkarlstad.se',       9),
 ('Petronella Nydahl',  'Vice evenemangsansvarig',          'viceevenemangsansvarig@jfkarlstad.se',   10),
 ('Yones Kouzaili',     'Informationsansvarig',             'informationsansvarig@jfkarlstad.se',     11),
 ('Anton Lundqvist',    'Idrottsansvarig',                  'idrottsansvarig@jfkarlstad.se',          12),
 ('Arash Torkipour',    'Ledamot',                          'ledamot@jfkarlstad.se',                  13);

-- ───────────── Partners ─────────────
INSERT INTO partners (slug, name, tier, tagline, description, website_url, career_url, sort_order) VALUES
 ('setterwalls', 'Setterwalls', 'huvud',
  'En av Sveriges mest välrenommerade advokatbyråer.',
  'Setterwalls är en av Sveriges mest välrenommerade advokatbyråer och ser sina medarbetare som nyckeln till framgång. Byrån har bred kompetens inom allt från M&A, IP/IT och tvistlösning till nischade områden som arbetsrätt, miljö och skatt – alltid med fokus på praktisk och affärsinriktad rådgivning åt entreprenörer, tillväxtbolag och internationella koncerner.

Setterwalls värdesätter kontakten med ambitiösa och engagerade juriststudenter och ordnar regelbundet evenemang både på campus och hos byrån.',
  'https://setterwalls.se', 'https://setterwalls.se/karriar/', 1),
 ('vinge', 'Vinge', 'huvud',
  'Nordisk affärsjuridik med omkring 580 medarbetare.',
  'Vinge är en av Nordens ledande advokatbyråer med omkring 580 medarbetare i Stockholm, Göteborg, Malmö och Bryssel. Byrån fokuserar på långsiktigt hållbar affärsjuridisk rådgivning och på att ligga i framkant.

Hos Vinge får du utvecklas genom kontinuerligt lärande, intressanta uppdrag och kompetenta kollegor. Byrån söker medarbetare med olika bakgrunder och bygger på tre värderingar: engagemang för juridik och affärer, lyhördhet mot klienter och kollegor och ett åtagande att alltid leverera arbete av högsta kvalitet.',
  'https://www.vinge.se', 'https://www.vinge.se/karriar', 2),
 ('mannheimer-swartling', 'Mannheimer Swartling', 'huvud',
  'Högkvalitativ affärsjuridisk rådgivning – i Sverige och internationellt.',
  'Mannheimer Swartling erbjuder högkvalitativ affärsjuridisk rådgivning inom affärsjuridikens samtliga områden, med medarbetare i Sverige och internationellt. Byrån kombinerar juridisk spets med nyfikenhet och utveckling och investerar i AI och digitala verktyg.

Som medarbetare får du strukturerad utbildning, mentorskap och möjlighet till rotation, utlandstjänstgöring och samhällsengagemang.',
  'https://www.mannheimerswartling.se', 'https://www.mannheimerswartling.se/karriar/', 3),
 ('gernandt-danielsson', 'Gernandt & Danielsson', 'partner',
  'En av de ledande svenska advokatbyråerna inom affärsjuridik.',
  'Gernandt & Danielsson är en av de ledande svenska advokatbyråerna inom svensk och internationell affärsjuridik. Här arbetar du med stora och komplexa uppdrag tillsammans med några av Sveriges främsta affärsjurister – i en miljö där det personliga finns kvar trots storleken.',
  'https://www.gda.se', 'https://karriar.gda.se/jobs', 10);

-- ───────────── Kommande evenemang (exempel) ─────────────
INSERT INTO events (slug, title, summary, body, location, starts_at, ends_at, members_only, published) VALUES
 ('lunchforelasning-oktober-2026', 'Lunchföreläsning med en av våra partners (exempel)',
  'Ta med lunchen och lyssna på hur vardagen ser ut på en affärsjuridisk byrå.',
  'Exempelevent – ersätt eller ta bort i adminpanelen under Event.',
  'Karlstads universitet', '2026-10-15T12:15', '2026-10-15T13:00', 0, 1),
 ('arbetsmarknadsdag-2026', 'Arbetsmarknadsdag 2026 (exempel)',
  'Träffa byråer, myndigheter och företag – och hitta din framtida arbetsplats.',
  'Exempelevent – ersätt eller ta bort i adminpanelen under Event.',
  'Karlstads universitet', '2026-11-05T10:00', '2026-11-05T15:00', 0, 1),
 ('halvtidsmiddag-ht26', 'Halvtidsmiddag HT26 (exempel)',
  'Halvvägs genom utbildningen – det ska firas ordentligt.',
  'Exempelevent – ersätt eller ta bort i adminpanelen under Event.',
  '[Platshållare] Lokal meddelas', '2026-11-21T18:00', NULL, 1, 1),
 ('julsittning-2026', 'Julsittning (exempel)',
  'Årets mysigaste sittning innan tentaperioden.',
  'Exempelevent – ersätt eller ta bort i adminpanelen under Event.',
  '[Platshållare] Lokal meddelas', '2026-12-04T18:30', NULL, 1, 1),
 ('inspark-2026', 'Inspark 2026',
  'Årets mest efterlängtade evenemang för nya studenter.',
  'Dagar fyllda av sportsliga aktiviteter, festliga kvällar och fulsittning med neonfest som final.',
  'Karlstad', '2026-08-24T10:00', '2026-08-30T23:00', 0, 1);

-- ───────────── Nyheter ─────────────
INSERT INTO news (slug, title, excerpt, body, published, published_at) VALUES
 ('ny-webbplats', 'Välkommen till vår nya webbplats',
  'Snabbare, tydligare och lättare att hitta det du söker – från kalender och dokument till JF Påverka.',
  'Vi har byggt om jfkarlstad.se från grunden. Här hittar du nu kommande evenemang i kalendern, alla stadgar, styrdokument och protokoll samlade på ett ställe och ett enklare sätt att lämna synpunkter via JF Påverka – anonymt om du vill.

Saknar du något eller hittar du ett fel? Hör av dig via kontaktformuläret.',
  1, '2026-10-01 09:00:00'),
 ('jf-initiativ', 'Nyhet i JF Påverka: lämna ett JF Initiativ',
  'Har du en idé till ett nytt projekt eller en aktivitet? Nu kan du driva den med stöd från styrelsen.',
  'Utöver JF Åsikt, där du kan lämna synpunkter på utbildningen och föreningen, kan du nu skicka in ett JF Initiativ. Det är för dig som har en idé till ett nytt projekt, en aktivitet eller ett initiativ.

Om det finns en genomförbar plan och någon som vill leda projektet hjälper styrelsen till med planering och marknadsföring, medan du och ditt team står för det dagliga arbetet.',
  1, '2026-09-15 09:00:00'),
 ('beloningssystem','Nytt belöningssystem för engagerade medlemmar',
  'Sedan 2025 uppmärksammar JFK medlemmarnas insatser med ordnar och medaljer.',
  'Inspirerade av andra juridiska föreningar och av europeiska kungahus införde vi 2025 ett akademiskt belöningssystem. Systemet består av flera ordnar och medaljer som delas ut till medlemmar som gjort betydande insatser för föreningen.

Läs mer under Om oss.',
  1, '2025-09-01 09:00:00');

-- ───────────── Kursombud ─────────────
INSERT INTO course_reps (term, name, email, sort_order) VALUES
 ('T4', NULL, NULL, 1), ('T6', NULL, NULL, 2), ('T8', NULL, NULL, 3);

-- ───────────── Vanliga frågor ─────────────
INSERT INTO faq (category, question, answer, sort_order) VALUES
 ('Medlemskap', 'Vem kan bli medlem?',
  'Alla som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet är välkomna som medlemmar.', 1),
 ('Medlemskap', 'Hur blir jag medlem?',
  'Klicka på ”Bli medlem” var som helst på sidan. Du kommer då till vår sida hos Hitract, där du registrerar dig och betalar medlemsavgiften. Det tar bara ett par minuter.', 2),
 ('Medlemskap', 'Vad kostar medlemskapet?',
  '[Platshållare] Aktuellt pris och hur länge medlemskapet gäller visas hos Hitract när du registrerar dig. Fyll i priset här via adminpanelen.', 3),
 ('Medlemskap', 'Måste jag vara medlem för att gå på evenemang?',
  'Vissa evenemang är öppna för alla, andra är bara för medlemmar. Det står alltid i beskrivningen av varje evenemang i kalendern.', 4),
 ('Engagemang', 'Hur kan jag engagera mig i föreningen?',
  'Alla medlemmar kan väljas in i något av våra sex utskott: utbildning, arbetsmarknad, kommunikation, evenemang, ekonomi och idrott. Hör av dig till styrelsen eller kom på årsmötet, där styrelsen väljs.', 5),
 ('Engagemang', 'Kan jag vara anonym när jag lämnar synpunkter?',
  'Ja. I JF Påverka kan du välja att skicka in anonymt. Då sparar vi varken namn, e-post eller IP-adress, och styrelsen kan inte se vem som skrivit.', 6),
 ('Övrigt', 'Jag vill att en bild på mig tas bort från bildgalleriet.',
  'Mejla informationsansvarig@jfkarlstad.se och berätta vilken bild det gäller, så tar vi bort den.', 7);

-- ───────────── Dokument (filer laddas upp i adminpanelen) ─────────────
INSERT INTO documents (title, category, year, file_key) VALUES
 ('Stadgar för Juridiska Föreningen i Karlstad', 'stadgar', 2025, NULL),
 ('Värdegrund', 'styrdokument', 2025, NULL),
 ('Alkohol- och drogpolicy', 'styrdokument', 2025, NULL),
 ('Likabehandlingspolicy', 'styrdokument', 2025, NULL),
 ('Medlemspolicy', 'styrdokument', 2025, NULL);
