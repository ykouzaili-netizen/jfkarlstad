# JFK:s webbplats – guide för styrelsen

Den här guiden är till för dig som sitter i styrelsen och ska uppdatera webbplatsen. Du behöver inte kunna
något om programmering. Allt görs i **adminpanelen** i webbläsaren – på datorn eller i mobilen.

- **Webbplatsen:** https://jfkarlstad.ykouzaili.workers.dev
- **Adminpanelen:** https://jfkarlstad.ykouzaili.workers.dev/admin

---

## 1. Logga in

1. Gå till **/admin** (adressen ovan).
2. Skriv din e-post och ditt lösenord och klicka **Logga in**.

**Första gången** får du en personlig länk av en administratör (eller via mejl). Öppna länken, välj ett
lösenord på minst 10 tecken och logga sedan in. Länken gäller i 72 timmar och fungerar bara en gång.

**Glömt lösenordet?** Klicka på *Glömt lösenordet?* på inloggningssidan. Om e-post inte är inställt:
be en administratör gå till **Användare** och klicka **Ny lösenordslänk** bredvid ditt namn.

> Efter 5 felaktiga försök låses kontot i 15 minuter. Du loggas ut automatiskt efter 12 timmar.

---

## 2. Vad kan jag ändra?

Menyn till vänster (i mobilen: knappen ☰ uppe till höger) har tre delar:

| Meny | Vad du gör där |
|---|---|
| **Översikt** | Snabbknappar, nya meddelanden, kommande event och en att göra-lista. |
| **Nyheter** | Skriv, ändra, publicera eller ta bort nyheter. De tre senaste visas på startsidan. |
| **Event** | Lägg in evenemang i kalendern. De tre närmaste visas på startsidan. |
| **Partners** | Samarbetspartners med logotyp. *Huvudsamarbetspartners* visas stort direkt under toppen på startsidan. |
| **Styrelsen** | Namn, roll, e-post och foto. Byt ut när en ny styrelse har valts. |
| **Utmärkelser** | Hedersmedlemmar, utdelade utmärkelser och Årets pedagog. |
| **Kursombud** | Kursombud per termin. |
| **Bildgalleri** | Ladda upp bilder i album (Banketter, Inspark …). |
| **Vanliga frågor** | Frågor och svar. Kategorin *Medlemskap* visas även på sidan Bli medlem. |
| **Dokument** | Ladda upp stadgar, styrdokument och protokoll som PDF. |
| **Redigera texter** | Alla texter på sidorna, länken till Hitract, Instagram, kontaktuppgifter och bilderna på startsidan. |
| **Meddelanden** | Allt som skickas via formulären. |
| **Utseende** *(admin)* | Färger, typsnitt för rubriker och logotyp. |
| **Användare** *(admin)* | Bjud in och ta bort personer som får logga in. |
| **Ändringslogg** *(admin)* | Vem som ändrade vad och när. |

Det finns två roller:
- **Redaktör** – kan ändra allt innehåll och hantera meddelanden.
- **Administratör** – kan dessutom ändra utseendet, hantera användare och se ändringsloggen.

---

## 3. Vanliga uppgifter steg för steg

### Skriva en nyhet
1. **Nyheter → + Skriv en nyhet**.
2. Fyll i **Rubrik**, en kort **Ingress** och själva **Texten**.
3. Lägg gärna till en **Bild** (liggande format, max 5 MB) och en **Bildbeskrivning**.
4. Låt **Publicera** vara påslaget och klicka **Skapa**. Klart – nyheten syns direkt.

**Formatera texten:**
- Tom rad = nytt stycke
- `**fet text**` → **fet text**
- `*kursiv*` → *kursiv*
- `[Hitract](https://open.hitract.se/HitClub/645)` → en länk
- Rader som börjar med `- ` blir en punktlista
- En rad som börjar med `## ` blir en underrubrik

### Lägga in ett event
1. **Event → + Lägg till event**.
2. Fyll i namn, **Börjar** (datum och tid), plats och en kort beskrivning. *Slutar* är valfritt.
3. Har eventet en biljettsida på Hitract? Klistra in länken under **Länk till anmälan/biljetter**.
4. Bocka i **Endast för medlemmar** om det gäller. Klicka **Skapa**.

Event som har passerat flyttas automatiskt till *Tidigare evenemang* i kalendern – du behöver inte ta bort dem.

### Byta ut styrelsen efter årsmötet
1. **Styrelsen** – klicka **Redigera** på varje person och skriv in den nya ledamoten (namn, roll, foto).
   Rollens e-postadress kan oftast stå kvar.
2. Ordningen styrs av fältet **Ordning** (lägre tal visas först).

### Ladda upp ett protokoll
1. **Dokument → + Ladda upp dokument**.
2. Titel (t.ex. *Protokoll styrelsemöte 2026-09-14*), kategori **Protokoll**, år och PDF-fil. **Skapa**.

### Byta bild eller text på startsidan
1. **Redigera texter → Startsidan**.
2. Ändra texten eller välj en ny bild under *Bild överst* / *”Vilka är JFK?” – bild*.
3. Klicka **Spara ändringar**, och sedan **Visa sidan** för att se resultatet.

### Byta logotyp eller färger *(administratör)*
1. **Utseende**.
2. Klicka på en färgruta eller skriv en hexkod (t.ex. `#f1cc4d`). Förhandsvisningen till höger uppdateras direkt.
3. Blir texten för svårläst visas en **kontrastvarning**. Lyssna på den – många läser på mobilen ute i solen.
4. Välj typsnitt för rubriker: **Playfair Display** (standard) eller **Cormorant Garamond**.
5. Ladda upp logotypen (helst kvadratisk SVG eller PNG med genomskinlig bakgrund).
6. **Spara utseende**. Ångrar du dig: **Återställ till standard** (påverkar inte logotypen).

### Hantera meddelanden
- Nya meddelanden har en röd prick och syns även på **Översikt**.
- Öppna ett meddelande → **Svara via e-post** (öppnar ditt mejlprogram) → **Markera som hanterad**.
- **Exportera CSV** ger en fil som öppnas i Excel.
- Meddelanden raderas automatiskt efter 12 månader. Du kan också radera dem direkt.
- **Anonyma JF Påverka-inskick** visar aldrig namn, e-post eller IP-adress – inte ens för styrelsen.

### Bjuda in en ny person *(administratör)*
1. **Användare** → fyll i namn, e-post och roll längst ned → **Skapa och få inbjudningslänk**.
2. Kopiera länken och skicka den till personen (den mejlas också automatiskt om e-post är inställt).
3. Slutar någon i styrelsen: klicka **Ta bort**. Personen loggas ut direkt.

---

## 4. Bra att veta

- **”Bli medlem”-knapparna** går alltid till länken som står under *Redigera texter → Länkar och kontaktuppgifter*.
- **Bilder:** JPG, PNG, WebP, GIF eller SVG, max 5 MB. **PDF:er:** max 20 MB.
- **Alt-text** (bildbeskrivning) gör sidan tillgänglig för personer som använder skärmläsare. Beskriv kort vad bilden visar.
- **Kakor:** webbplatsen använder inga spårningskakor, därför finns ingen cookie-banner.
- **Om något går fel:** kontrollera *Ändringslogg* för att se vad som senast ändrades, eller kontakta den som är teknisk ansvarig.

---

## 5. För teknisk ansvarig

Teknisk dokumentation finns i **CLAUDE.md** (arkitektur, konventioner, kommandon). Kort version:

- Cloudflare Worker (TypeScript, inga runtime-beroenden) + D1 (databas) + KV (filer).
- **Publicering:** varje push till `main` i GitHub byggs och publiceras automatiskt av Cloudflare (Workers Builds).
- **Lokalt:** `npm install`, `npm run db:migrate:local`, `npm run db:seed:local`, `npm run dev`.

### Hemligheter (Cloudflare → Workers & Pages → jfkarlstad → Settings → Variables and Secrets)

Lägg till som typ **Secret**:

| Namn | Värde | Behövs för |
|---|---|---|
| `SMTP_HOST` | `send.one.com` | E-postnotiser |
| `SMTP_PORT` | `465` | E-postnotiser (SSL) – `587` för STARTTLS fungerar också |
| `SMTP_USER` | t.ex. `informationsansvarig@jfkarlstad.se` | E-postnotiser – hela adressen |
| `SMTP_PASS` | lösenordet till brevlådan hos One.com | E-postnotiser |
| `MAIL_TO` | adressen som ska få notiserna | E-postnotiser (standard: `SMTP_USER`) |
| `TURNSTILE_SECRET_KEY` | från Cloudflare Turnstile | Extra robotskydd (valfritt) |
| `SETUP_TOKEN` | lång slumpad sträng | Skapa första admin om databasen är tom (valfritt) |

Utan SMTP fungerar allt ändå – meddelanden sparas i databasen och syns i adminpanelen.
Med **Turnstile**: skapa en widget i Cloudflare (Turnstile → Add widget, domän `jfkarlstad.ykouzaili.workers.dev`),
lägg in *secret key* som secret och byt `TURNSTILE_SITE_KEY` i `wrangler.jsonc` mot *site key*.

### Databasändringar
Lägg till en ny fil i `migrations/` (t.ex. `0002_...sql`) och kör `npm run db:migrate:remote`. Ändra aldrig en migrering som redan körts.

### Byta till R2 för filer
Aktivera R2 i Cloudflare, skapa bucketen `jfkarlstad-uploads` och lägg till den under `r2_buckets` i `wrangler.jsonc`
med binding `UPLOADS`. Nya uppladdningar hamnar då i R2. (Befintliga filer i KV behöver flyttas manuellt.)
