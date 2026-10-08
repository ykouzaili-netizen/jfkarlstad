# CLAUDE.md – JFK:s webbplats

Webbplats för Juridiska Föreningen i Karlstad. En Cloudflare Worker serverar både sidor och API.
All synlig text är på **svenska** (även felmeddelanden, admin, alt-texter, aria-labels). `<html lang="sv">`.

## Arkitektur

- **Cloudflare Worker** (`src/index.ts`) i TypeScript. **Inga runtime-beroenden.** Egen liten router (`src/router.ts`)
  i stället för Hono – medvetet val: mindre att underhålla, inget som går sönder vid uppgraderingar.
- **Serverrenderad HTML** via taggade mallar: `html\`...\`` i `src/lib/html.ts` escapar ALLT som interpoleras.
  Använd `raw()` bara för kodgenererad markup (t.ex. SVG-ikoner). Aldrig för användardata.
- **D1** (`env.DB`) för allt innehåll. Schema i `migrations/`, startinnehåll i `seed/seed.sql`.
- **Filer** (bilder/PDF): Workers KV (`env.FILES`) – R2 (`env.UPLOADS`) används automatiskt om den bindningen läggs till.
  All filåtkomst går via `src/lib/storage.ts`. Bilder > 5 MB (eller > 3200 px) komprimeras i webbläsaren (`public/assets/admin.js`,
  canvas → JPEG/WebP, max 2560 px) innan uppladdning; servern kräver ändå ≤ 5 MB. PDF max 24 MB (KV-gräns 25 MiB). Filfält renderas med `uploadInput()`.
  Bilder serveras via `/media/:key`, PDF:er via `/dokument/fil/:id`, båda med sandbox-CSP.
- **Dokument** är antingen en länk (`documents.link_url`, t.ex. Google Dokument) eller en PDF. `/dokument/fil/:id` skickar vidare
  till länken (adressen från databasen) eller serverar PDF:en. Adminformuläret växlar med radiovalet `source` och `showIf` i `resources.ts`;
  dolda fält töms vid sparning (en dold PDF raderas). Redigeringssidan varnar om Google-dokumentet inte är delat med "Alla som har länken".
- **Adminpanel** i `src/admin/`: `auth.ts` (PBKDF2, sessioner, CSRF), `resources.ts` (generisk CRUD för alla innehållstyper –
  lägg till en ny typ genom att beskriva den där), `pages.ts` (översikt, utseende, meddelanden, användare, logg), `texts.ts`, `media-pages.ts`, `stats-pages.ts`, `search.ts`, `handover.ts`.
- **Textregistret** (`src/lib/texts.ts`): VARJE text på webbplatsen är ett fält i `PAGES` (sida → avsnitt → fält) med
  standardtext, etikett och typ. `more: true` = sällan ändrad (ligger bakom "Visa fler texter"). `TextKey` är en
  literal-union, så `s.nyckel` typkontrolleras. Ny text på sajten = nytt fält här, och i mallen `${s.nyckel}` med
  `${ek(s, "nyckel")}` på elementet. Platshållare som `{namn}` fylls i med `fill()`.
- **Redigera texter** (`src/admin/texts.ts`): editorn, Ångra (batch-id), versionshistorik (`setting_versions`, 25 per
  nyckel) och menyredigeraren (`menu_config` som JSON, se `views/nav.ts`). Spara alltid inställningar via `saveSettings()`.
- **Förhandsvisning och klickbar karta** (`src/admin/preview.ts`): POST `/admin/forhandsvisning` renderar den riktiga sidan
  med osparade värden (`c.preview`); GET `/admin/webbplatsen` är kartan på Översikt (`c.editMap`). När `loadSettings` får en
  override märks texter med `ek()`/`ec()` (`data-ek`, `data-eu`, `data-el`) – aldrig på den publika sajten.
  Nya sidor: anropa `loadSettings(db, c.preview)` och lägg till sidan i `PREVIEW_PAGES` (eller `DYNAMIC`).
- **Bildbank** (`src/lib/media.ts`, `src/admin/media-pages.ts`): alla uppladdningar registreras i `media`. `handleUpload`
  tar emot `namn__liten` (800 px-version från webbläsaren → `nyckel.sm`), `namn__bank` (vald befintlig bild) och `namn__matt`.
  Utbytta bilder ligger kvar; fält med `purge: true` (personfoton, galleri, PDF) raderas med `purgeIfUnused`.
  Bilder visas med `picture()` (srcset med `.sm`); `/media/x.sm` faller tillbaka på originalet.
- **Schemaläggning:** `news.published_at`, `events.publish_at`, `jobs.publish_at` (UTC). Publika frågor filtrerar via
  `NEWS_LIVE`/`EVENT_LIVE`/`JOB_LIVE` i `content.ts`. Admin-fält med `schedule: true` visas i svensk tid.
- **Partnerstatistik** (`src/lib/stats.ts`): bara totalsiffror per dag i `stats_daily`, utan IP/kakor. Utlänkar går via
  `/ut/:typ/:id` (adressen hämtas från databasen – ingen öppen omdirigering).
- **Instagram** (startsidan): inlägg i `instagram_posts` – för hand under Instagram i adminpanelen, eller automatiskt
  via `src/lib/instagram.ts` (cron, kräver secret `INSTAGRAM_TOKEN`). Bilderna lagras på sajten; besökaren kontaktar aldrig Instagram.
- **Formulär** i `src/pages/forms.ts`: validering (`src/lib/forms.ts`), honungsfälla + tidstoken + rate limiting (`src/lib/security.ts`),
  valfri Turnstile, sparas alltid i D1 först, e-post via SMTP (`src/lib/mail.ts`, `cloudflare:sockets`) är best effort.
  SMTP-inställningarna läses via `mailConfig()` (trimmar inklistrade värden). Adminsidan **E-post** (`src/admin/mail-page.ts`) visar
  vilka inställningar som finns och skickar ett testmejl med begripligt felbesked per steg (`SmtpError.step`).
- **Cron** (varje timme): `src/lib/maintenance.ts` rensar sessioner, rate limits, meddelanden > 12 mån, logg > 24 mån,
  statistik > 3 år och gammal versionshistorik, och mejlar en påminnelse om meddelanden som väntat > 7 dagar.
- **Publicering:** GitHub-repot är kopplat till Workers Builds – push till `main` = deploy. Build-kommandot är `npm run build` (typkontroll).
- **Statiska filer** i `public/` (CSS, JS, typsnitt, ikoner) serveras direkt av Cloudflare (Workers Static Assets)
  innan Workern körs. Headers för dem i `public/_headers`.
- **Progressiv förbättring:** sidan fungerar utan JS. `public/assets/site.js` gör bara menyer smidigare.

### Mappar

```
src/
  index.ts          Entry: HTTPS-tvång, routing, felhantering
  router.ts         Router + RequestContext
  env.ts            Bindningar och secrets
  lib/
    html.ts         html``-mallar, escaping, safeUrl
    http.ts         Svarshjälp + säkerhetsheaders (CSP med nonce)
    settings.ts     DEFAULT_SETTINGS (alla redigerbara texter/färger) + temats CSS-variabler
    color.ts        Hex-validering, WCAG-kontrast, readableOn()
    format.ts       Svenska datum, Stockholmstid, telefonlänkar
    content.ts      Läsfrågor för publikt innehåll
  views/            layout (head/header/footer), nav, komponenter, ikoner
  pages/            En fil per sida/sektion
  types/            Minimala Cloudflare-typer (ersätter @cloudflare/workers-types)
public/assets/      site.css, site.js, fonts/, favicon.svg, og-image.png
migrations/         D1-migreringar (numrerade, ändra aldrig en körd migrering – lägg till en ny)
seed/seed.sql       Svenskt startinnehåll
src/admin/          Adminpanelen
tools/local-preview Reservlösning för förhandsvisning utan wrangler (node:sqlite, KV på disk, cloudflare:sockets-shim)
```

## Konventioner

- **Inställningar:** texterna kommer från registret i `src/lib/texts.ts`, övrigt (färger, logotyp, meny) från
  `EXTRA_DEFAULTS` i `src/lib/settings.ts`. Databasen skriver över; ett värde som är samma som standardtexten tas bort.
  Hårdkoda aldrig synlig text i mallarna – undantag: felmeddelanden i validering, adminpanelen, skärmläsartexter och 500-sidan.
- **Färger/tema:** CSS-variabler `--c-bg, --c-surface, --c-text, --c-primary, --c-accent, --c-button` kommer från
  databasen och skrivs i en `<style nonce>` i `<head>`. Textfärg *på* färgade ytor (`--c-on-*`) räknas ut automatiskt
  (svart eller vit, bäst kontrast). Använd alltid variablerna i CSS – aldrig hårdkodade färger.
- **CSP:** inga inline-`style=""`-attribut och inga inline-skript. Inline `<style>` måste ha `nonce="${c.nonce}"`.
- **Datum:** `*_at`-kolumner är UTC (`datetime('now')`). Evenemangstider är svensk lokal tid `YYYY-MM-DDTHH:MM`.
- **Länkar ut** (Hitract, Instagram, partners) öppnas i ny flik med `rel="noopener"` och har en sr-only-text
  "(öppnas i ny flik)". "Bli medlem" ska alltid gå via `joinButton()`.
- **Tillgänglighet:** semantiska element, synligt fokus (`:focus-visible`), skip-link, aria på menyer,
  `prefers-reduced-motion` respekteras globalt i CSS.
- **CSS/JS-cache:** filerna cachas ett år. Höj `ASSET_VERSION` i `src/views/layout.ts` när `site.css`/`site.js` ändras.
- **Typsnitt:** självhostade WOFF2 i `public/assets/fonts` (Montserrat, Playfair Display, Cormorant Garamond – OFL).
  Rubriktypsnittet väljs i adminpanelen och sätts via `--font-display`/`--display-scale`.
- **Säkerhet:** validera all indata på servern, escapa all utdata, inga hemligheter i koden (Worker secrets).
  Anonyma JF Påverka-inskick: spara/logga aldrig IP, namn eller e-post.
- **GDPR:** Cloudflares anropsloggar (invocation logs) är avstängda i `wrangler.jsonc` – slå inte på dem, det bryter
  löftet om anonyma inskick. `console.*` får aldrig innehålla personuppgifter eller engångslänkar.
  Ingen ny tredjepartstjänst (analys, inbäddningar, typsnitt från CDN) utan att uppdatera integritetspolicyn
  (texterna under "Integritet och kakor" i `texts.ts`, uppdatera `privacy_updated`) – och för icke-nödvändiga kakor krävs samtycke (LEK 9 kap. 28 §).

## Kommandon

```bash
npm install                     # installerar wrangler + typescript
npm run typecheck               # tsc --noEmit
npm run db:migrate:local        # skapa lokala D1-tabeller
npm run db:seed:local           # fyll med startinnehåll
npm run dev                     # wrangler dev → http://localhost:8787
npm run deploy                  # wrangler deploy (kräver inloggning, se README)

# Reserv utan wrangler (samma Worker-kod, SQLite i stället för D1):
npm run preview:node            # lägg till -- --reset för att nollställa databasen

# Webbläsartester (Playwright för Python) mot förhandsvisningen med nollställd databas:
python3 tools/e2e/test_features.py && python3 tools/e2e/test_regression.py && python3 tools/e2e/test_public.py
```

Secrets (produktion): `npx wrangler secret put SMTP_PASS` osv. – se `.dev.vars.example` för hela listan.
