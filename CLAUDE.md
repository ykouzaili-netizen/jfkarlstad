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
- **Adminpanel** i `src/admin/`: `auth.ts` (PBKDF2, sessioner, CSRF), `resources.ts` (generisk CRUD för alla innehållstyper –
  lägg till en ny typ genom att beskriva den där), `pages.ts` (översikt, texter, utseende, meddelanden, användare, logg).
- **Formulär** i `src/pages/forms.ts`: validering (`src/lib/forms.ts`), honungsfälla + tidstoken + rate limiting (`src/lib/security.ts`),
  valfri Turnstile, sparas alltid i D1 först, e-post via SMTP (`src/lib/mail.ts`, `cloudflare:sockets`) är best effort.
- **Cron** (varje timme): `src/lib/maintenance.ts` rensar sessioner, rate limits, meddelanden > 12 mån och logg > 24 mån.
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

- **Inställningar:** varje redigerbar text/färg finns i `DEFAULT_SETTINGS` (`src/lib/settings.ts`). Databasen
  skriver över. Ny text på sajten = ny nyckel där (och ett fält i adminpanelens "Redigera texter").
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
  (`src/pages/legal.ts`, höj `PRIVACY_UPDATED`) – och för icke-nödvändiga kakor krävs samtycke (LEK 9 kap. 28 §).

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
```

Secrets (produktion): `npx wrangler secret put SMTP_PASS` osv. – se `.dev.vars.example` för hela listan.
