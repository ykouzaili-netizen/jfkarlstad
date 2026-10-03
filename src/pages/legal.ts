import { html } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import { htmlResponse, textResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { pageHeader } from "../views/page.js";

export async function privacyPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  const content = html`
    ${pageHeader({ kicker: "Integritet", title: "Integritetspolicy", lead: "Så behandlar vi dina personuppgifter när du använder vår webbplats. Kort sagt: vi samlar bara in det vi behöver, och inget av det används för reklam eller spårning." })}
    <section class="section section-tight-top">
      <div class="container narrow prose prose-lg legal">
        <h2>Personuppgiftsansvarig</h2>
        <p>${s.site_name}${s.org_number ? `, organisationsnummer ${s.org_number}` : ""}, ${s.address_street}, ${s.address_city}. Frågor om hur vi behandlar personuppgifter skickar du till <a href="mailto:${s.contact_email}">${s.contact_email}</a>.</p>

        <h2>Vilka uppgifter vi samlar in och varför</h2>
        <h3>Kontaktformuläret</h3>
        <p>Namn, e-postadress och ditt meddelande. Vi använder uppgifterna för att svara dig. Rättslig grund: berättigat intresse (att kunna besvara frågor som skickas till föreningen).</p>
        <h3>Formuläret för företag</h3>
        <p>Företagsnamn, kontaktperson, e-postadress, eventuellt telefonnummer och ditt meddelande. Vi använder uppgifterna för att diskutera ett möjligt samarbete. Rättslig grund: berättigat intresse.</p>
        <h3>JF Påverka</h3>
        <p>Rubrik och beskrivning samt – om du vill – namn och e-postadress så att vi kan återkoppla. Väljer du att skicka anonymt sparar vi varken namn, e-post eller IP-adress, och inget som kan identifiera dig skickas vidare till styrelsen. Rättslig grund: berättigat intresse (att utveckla utbildningen och föreningen).</p>
        <h3>Medlemskap</h3>
        <p>Medlemskapet hanteras av Hitract. När du klickar på ”Bli medlem” lämnar du vår webbplats, och Hitracts egna villkor och integritetspolicy gäller. Vi sparar inga medlemsuppgifter på den här webbplatsen.</p>
        <h3>Skydd mot skräppost</h3>
        <p>För att stoppa automatiska inskick räknar vi hur många meddelanden som skickas från samma uppkoppling under en kort tid. IP-adressen sparas aldrig i klartext, utan bara som en oläsbar kontrollsumma som raderas automatiskt inom ett dygn och aldrig kopplas till ditt meddelande. Formulären kan även skyddas av Cloudflare Turnstile, som kontrollerar att det är en människa som skickar formuläret utan att använda kakor för spårning.</p>

        <h2>Hur länge vi sparar uppgifterna</h2>
        <p>Meddelanden från formulären sparas så länge vi behöver dem för att hantera ärendet och raderas automatiskt senast tolv månader efter att de kom in. Styrelsen kan radera ett meddelande tidigare när som helst.</p>

        <h2>Vilka som kan se uppgifterna</h2>
        <p>Bara styrelseledamöter med inloggning till webbplatsens administration kan läsa inskickade meddelanden. En kopia skickas till föreningens e-post hos One.com. Webbplatsen drivs av Cloudflare, som behandlar uppgifterna för vår räkning som personuppgiftsbiträde. Vi säljer eller lämnar aldrig ut dina uppgifter till någon annan.</p>

        <h2>Dina rättigheter</h2>
        <p>Du har rätt att få veta vilka uppgifter vi har om dig, att få felaktiga uppgifter rättade och att få dina uppgifter raderade. Du kan också invända mot behandlingen. Mejla <a href="mailto:${s.contact_email}">${s.contact_email}</a> så hjälper vi dig. Om du anser att vi behandlar dina uppgifter felaktigt kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se" target="_blank" rel="noopener">imy.se</a>.</p>

        <h2>Kakor (cookies)</h2>
        <p>Vi använder inga kakor för statistik, marknadsföring eller spårning. Läs mer på sidan <a href="/cookies">Cookie-inställningar</a>.</p>

        <p class="muted">Senast uppdaterad: oktober 2026.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Integritetspolicy", description: "Så behandlar Juridiska Föreningen i Karlstad dina personuppgifter." }, content));
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
        <p>Kakan är nödvändig för att inloggningen ska fungera och kräver därför inget samtycke enligt lagen om elektronisk kommunikation. Vanliga besökare får inga kakor alls.</p>
        <h2>Externa tjänster</h2>
        <p>Vi bäddar inte in Instagram, YouTube, kartor eller liknande, eftersom sådana tjänster ofta sätter egna kakor. I stället länkar vi ut till dem – det är först när du klickar som du lämnar vår webbplats.</p>
        <p>Läs mer om hur vi behandlar personuppgifter i vår <a href="/integritetspolicy">integritetspolicy</a>.</p>
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
