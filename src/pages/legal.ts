import { html } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import { htmlResponse, textResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { pageHeader } from "../views/page.js";

interface Purpose {
  title: string;
  data: string;
  basis: string;
  retention: string;
  note?: string;
}

/** Senast policyn ändrades i sak. Uppdatera när innehållet ändras. */
const PRIVACY_UPDATED = "3 oktober 2026";

export async function privacyPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  const mail = html`<a href="mailto:${s.contact_email}">${s.contact_email}</a>`;

  const purposes: Purpose[] = [
    {
      title: "Svara på det du skickar via kontaktformuläret",
      data: "Namn, e-postadress, ämne och ditt meddelande.",
      basis: "Berättigat intresse (art. 6.1 f GDPR) – att kunna besvara frågor till föreningen.",
      retention: "Raderas automatiskt efter 12 månader, eller tidigare när ärendet är klart.",
    },
    {
      title: "Hantera förfrågningar om samarbete",
      data: "Företagets namn, kontaktperson, e-postadress, telefonnummer (valfritt) och ditt meddelande.",
      basis: "Berättigat intresse – att kunna diskutera ett samarbete med er.",
      retention: "Raderas automatiskt efter 12 månader. Blir det ett samarbete sparas kontaktuppgifterna så länge samarbetet pågår.",
    },
    {
      title: "Ta emot synpunkter och initiativ via JF Påverka",
      data: "Typ av ärende, rubrik och beskrivning. Namn och e-post bara om du väljer att lämna dem.",
      basis: "Berättigat intresse – att kunna förbättra utbildningen och föreningen.",
      retention: "Raderas automatiskt efter 12 månader.",
      note: "Skickar du anonymt sparas inget namn, ingen e-postadress och ingen IP-adress tillsammans med ditt inskick – varken i databasen, i våra loggar eller i mejlet till styrelsen. Tänk på att det du skriver i texten ändå kan avslöja vem du är.",
    },
    {
      title: "Skydda formulären mot skräppost och missbruk",
      data: "En oläsbar kontrollsumma (hash) av din IP-adress. IP-adressen sparas aldrig i klartext och kopplas aldrig till ditt meddelande.",
      basis: "Berättigat intresse – att hålla webbplatsen säker och fri från skräppost.",
      retention: "Raderas automatiskt inom 24 timmar.",
    },
    {
      title: "Visa styrelsen, kursombud och utmärkelser på webbplatsen",
      data: "Namn, roll, föreningens funktionsadress för rollen och – om personen har gett sitt samtycke – ett foto. För hedersmedlemmar och Årets pedagog även år och motivering.",
      basis: "Berättigat intresse – att medlemmar och andra ska veta vem de kan kontakta. Foton publiceras bara med personens samtycke (art. 6.1 a), som kan återkallas när som helst.",
      retention: "Så länge uppdraget pågår. Hedersmedlemmar och pristagare visas tills vidare, men tas bort om personen ber om det.",
    },
    {
      title: "Visa bilder från föreningens evenemang",
      data: "Fotografier där personer kan synas.",
      basis: "Berättigat intresse – att visa föreningens verksamhet. Vi publicerar inte bilder som kan uppfattas som kränkande.",
      retention: "Tills vidare. Vill du att en bild tas bort gör vi det skyndsamt – mejla oss.",
    },
    {
      title: "Inloggning för styrelsen i webbplatsens administration",
      data: "Namn, e-postadress, krypterat lösenord, roll, inloggningstider och en logg över vem som ändrat vad på webbplatsen.",
      basis: "Berättigat intresse – att hålla webbplatsen säker och kunna se vem som gjort en ändring.",
      retention: "Inloggningen gäller i högst 12 timmar. Ändringsloggen sparas i 24 månader. Konton stängs när någon lämnar sitt uppdrag.",
    },
    {
      title: "Leverera och skydda webbplatsen",
      data: "Tekniska uppgifter som behövs för att visa sidan, till exempel IP-adress, webbläsare och tidpunkt. De behandlas av vår driftleverantör Cloudflare.",
      basis: "Berättigat intresse – att webbplatsen ska fungera och skyddas mot attacker.",
      retention: "Kort tid enligt Cloudflares villkor. Vi för ingen egen besöksstatistik och använder inga analysverktyg.",
    },
  ];

  const content = html`
    ${pageHeader({
      kicker: "Integritet",
      title: "Integritetspolicy",
      lead: "Så behandlar vi personuppgifter. Kort sagt: vi samlar bara in det vi behöver, vi använder inga spårningskakor eller analysverktyg, och vi säljer eller delar aldrig dina uppgifter för reklam.",
    })}
    <section class="section section-tight-top">
      <div class="container narrow prose prose-lg legal">
        <h2>Personuppgiftsansvarig</h2>
        <p>${s.site_name}${s.org_number ? `, organisationsnummer ${s.org_number}` : ""}, ${s.address_street}, ${s.address_city}, är personuppgiftsansvarig för behandlingen som beskrivs här. Har du frågor om dina personuppgifter, eller vill du använda dina rättigheter, mejlar du ${mail}.</p>

        <h2>Vad vi behandlar, varför och hur länge</h2>
        <div class="purpose-list">
          ${purposes.map(
            (p) => html`<section class="purpose-card">
              <h3>${p.title}</h3>
              <dl>
                <div><dt>Uppgifter</dt><dd>${p.data}</dd></div>
                <div><dt>Rättslig grund</dt><dd>${p.basis}</dd></div>
                <div><dt>Hur länge</dt><dd>${p.retention}</dd></div>
              </dl>
              ${p.note ? html`<p class="purpose-note">${p.note}</p>` : ""}
            </section>`,
          )}
        </div>

        <h2>Uppgifter om andra personer</h2>
        <p>Synpunkter via JF Påverka kan handla om till exempel en kurs, en lärare eller en händelse i föreningen. Uppgifter om andra personer som nämns i ett meddelande används bara för att hantera ärendet och raderas tillsammans med det. Skriv bara det som behövs, och undvik känsliga uppgifter som hälsa, etniskt ursprung eller religion om de inte är nödvändiga för ärendet.</p>

        <h2>Måste du lämna uppgifterna?</h2>
        <p>Nej, allt är frivilligt. Utan namn och e-postadress kan vi dock inte svara på ett meddelande via kontaktformuläret.</p>

        <h2>Medlemskap via Hitract</h2>
        <p>Medlemskapet hanteras i Hitract. När du klickar på ”Bli medlem” lämnar du den här webbplatsen och registrerar dig direkt hos Hitract. Vi sparar inga medlemsuppgifter på den här webbplatsen. Hur medlemsuppgifterna behandlas i Hitract framgår av Hitracts villkor och integritetspolicy.</p>

        <h2>Vilka som kan ta del av uppgifterna</h2>
        <p>Inskickade meddelanden kan bara läsas av styrelseledamöter som har ett eget konto till webbplatsens administration. Vi anlitar följande personuppgiftsbiträden, som bara får behandla uppgifterna enligt våra instruktioner:</p>
        <ul>
          <li><strong>Cloudflare</strong> – drift av webbplatsen, databas, fillagring och skydd mot attacker.</li>
          <li><strong>One.com</strong> – föreningens e-post, dit en kopia av inskickade meddelanden skickas.</li>
        </ul>
        <p>Vi säljer aldrig personuppgifter och lämnar inte ut dem till andra, om vi inte är skyldiga enligt lag.</p>

        <h2>Överföring utanför EU/EES</h2>
        <p>Webbplatsens databas finns i Västeuropa, men Cloudflare är ett amerikanskt företag med servrar i hela världen, och uppgifter kan därför behandlas utanför EU/EES. Cloudflare är certifierat enligt EU–US Data Privacy Framework och har dessutom ingått EU-kommissionens standardavtalsklausuler, vilket gör överföringen laglig enligt GDPR.</p>

        <h2>Så skyddar vi uppgifterna</h2>
        <p>All trafik är krypterad (HTTPS). Lösenord sparas bara i krypterad form, inloggningen låses efter upprepade felaktiga försök, och varje ändring i administrationen loggas. Bara de som behöver har tillgång.</p>

        <h2>Dina rättigheter</h2>
        <p>Enligt dataskyddsförordningen (GDPR) har du rätt att</p>
        <ul>
          <li>få veta vilka uppgifter vi har om dig och få en kopia av dem (registerutdrag),</li>
          <li>få felaktiga uppgifter rättade,</li>
          <li>få dina uppgifter raderade,</li>
          <li>begära att behandlingen begränsas,</li>
          <li>invända mot behandling som grundar sig på berättigat intresse,</li>
          <li>få ut uppgifter du själv lämnat i ett maskinläsbart format (dataportabilitet), och</li>
          <li>när som helst återkalla ett samtycke, till exempel till att ett foto publiceras.</li>
        </ul>
        <p>Mejla ${mail}. Vi svarar inom en månad. Observera att anonyma inskick via JF Påverka inte kan kopplas till dig, så dem kan vi inte söka fram.</p>
        <p>Om du anser att vi behandlar dina uppgifter felaktigt kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se" target="_blank" rel="noopener">imy.se<span class="sr-only"> (öppnas i ny flik)</span></a>.</p>

        <h2>Automatiserade beslut</h2>
        <p>Vi fattar inga automatiserade beslut och gör ingen profilering.</p>

        <h2>Kakor (cookies)</h2>
        <p>Vanliga besökare får inga kakor. Den enda kakan används för inloggning i administrationen. Läs mer under <a href="/cookies">Cookie-inställningar</a>.</p>

        <h2>Ändringar</h2>
        <p>Vi uppdaterar policyn när vår behandling ändras. Den senaste versionen finns alltid här.</p>

        <p class="muted">Senast uppdaterad: ${PRIVACY_UPDATED}.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Integritetspolicy", description: "Så behandlar Juridiska Föreningen i Karlstad personuppgifter – vad vi sparar, varför, hur länge och vilka rättigheter du har." }, content));
}

export async function cookiesPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  const content = html`
    ${pageHeader({ kicker: "Integritet", title: "Cookie-inställningar", lead: "Den här webbplatsen använder inga kakor för spårning, statistik eller reklam. Därför behöver du inte godkänna något, och vi visar ingen cookie-banner." })}
    <section class="section section-tight-top">
      <div class="container narrow prose prose-lg legal">
        <h2>Vilka kakor används?</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Kaka</th><th scope="col">Syfte</th><th scope="col">Livslängd</th><th scope="col">Vem</th></tr></thead>
            <tbody>
              <tr><td><code>__Host-jfk_session</code></td><td>Håller styrelsens administratörer inloggade i adminpanelen. Sätts bara när någon loggar in.</td><td>Max 12 timmar</td><td>Bara administratörer</td></tr>
            </tbody>
          </table>
        </div>
        <p>Kakan är strikt nödvändig för att inloggningen ska fungera och kräver därför inget samtycke enligt lagen (2022:482) om elektronisk kommunikation. Vanliga besökare får inga kakor alls, och webbplatsen sparar inte heller något annat i din webbläsare (som local storage).</p>
        <h2>Externa tjänster</h2>
        <p>Vi bäddar inte in Instagram, YouTube, kartor eller liknande, eftersom sådana tjänster ofta sätter egna kakor. I stället länkar vi ut till dem – det är först när du klickar som du lämnar vår webbplats.</p>
        <p>Läs mer om hur vi behandlar personuppgifter i vår <a href="/integritetspolicy">integritetspolicy</a>.</p>
        <p class="muted">Senast uppdaterad: ${PRIVACY_UPDATED}.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Cookie-inställningar", description: "Webbplatsen använder inga spårningskakor." }, content));
}

export async function sitemapXml(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const site = c.env.SITE_URL.replace(/\/$/, "");
  const [news, events, partners] = await db.batch([
    db.prepare("SELECT slug, COALESCE(updated_at, published_at) AS mod FROM news WHERE published = 1"),
    db.prepare("SELECT slug, updated_at AS mod FROM events WHERE published = 1"),
    db.prepare("SELECT slug, updated_at AS mod FROM partners WHERE published = 1"),
  ]);
  const staticPaths = ["/", "/om-oss", "/bli-medlem", "/for-studenter", "/for-foretag", "/partners", "/aktuellt", "/kalender", "/dokument", "/jf-paverka", "/faq", "/kontakt", "/integritetspolicy", "/cookies"];
  const entry = (path: string, mod?: string) =>
    `<url><loc>${site}${path}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ""}</url>`;
  const dyn = (res: D1Result | undefined, prefix: string) =>
    ((res?.results ?? []) as { slug: string; mod?: string }[]).map((r) => entry(`${prefix}/${encodeURIComponent(r.slug)}`, r.mod));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    ...staticPaths.map((p) => entry(p)),
    ...dyn(news, "/aktuellt"),
    ...dyn(events, "/kalender"),
    ...dyn(partners, "/partners"),
  ].join("\n")}\n</urlset>`;
  return textResponse(xml, "application/xml; charset=utf-8");
}
