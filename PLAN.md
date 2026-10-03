# Byggplan

Varje steg avslutas med `npm run typecheck`, körning lokalt och skärmdumpar på mobil (375 px) och dator (1440 px).

1. **Grund** ✅ – wrangler-konfig, D1-schema (alla tabeller), seed med texter från jfkarlstad.se, egen router,
   säker HTML-mallning, säkerhetsheaders, CLAUDE.md.
2. **Layout + startsida** ✅ – sticky header med dropdowns och mobilmeny, sidfot med sidkarta, tema från databasen,
   startsidans nio sektioner, 404-sida, OG-bild, robots.txt. *(granskad)*
3. **Övriga publika sidor** ✅ – /om-oss, /bli-medlem, /for-studenter, /for-foretag, /partners(+/:slug),
   /aktuellt(+/:slug), /kalender(+/:slug), /dokument (gruppering per år + sök), /jf-paverka, /faq, /kontakt,
   /integritetspolicy, /cookies, sitemap.xml, strukturerad data för Event.
4. **Adminpanel** ✅ – inloggning (PBKDF2 via WebCrypto, sessioner i HttpOnly/Secure/SameSite=Strict-cookie, CSRF,
   lockout), roller Admin/Redaktör, första admin via engångsnyckel, Redigera texter, Utseende (färgväljare, live-förhandsvisning,
   kontrastvarning, återställ, logotyp), CRUD för Nyheter/Event/Partners/Styrelse/FAQ, Dokument (PDF till R2),
   Meddelanden (status, CSV, radering), Användare, Ändringslogg.
5. **Formulär + e-post** ✅ – kontakt, företag, JF Påverka (anonymt läge), validering, Turnstile, rate limiting,
   SMTP-klient över `cloudflare:sockets` mot One.com (best effort – inskick sparas alltid i D1 först).
6. **Säkerhet, SEO, tillgänglighet** ✅ – genomgång av CSP, headers, uppladdningsvalidering, tangentbordsnavigering,
   kontraster, meta per sida, README för styrelsen, antaganden och öppna frågor.
