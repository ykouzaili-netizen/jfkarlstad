import { html } from "../lib/html.js";
import { ek, loadSettings } from "../lib/settings.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { icon } from "../views/icons.js";

export async function notFoundPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const links = [
    ["/", "notfound_link_home"],
    ["/kalender", "notfound_link_calendar"],
    ["/aktuellt", "notfound_link_news"],
    ["/kontakt", "notfound_link_contact"],
  ] as const;
  const content = html`<section class="section error-page">
    <div class="container narrow">
      <p class="error-code" aria-hidden="true">404</p>
      <h1 class="page-title"${ek(s, "notfound_title")}>${s.notfound_title}</h1>
      <p class="page-lead"${ek(s, "notfound_text")}>${s.notfound_text}</p>
      <ul class="error-links">
        ${links.map(([href, key]) => html`<li><a href="${href}"${ek(s, key)}>${icon("arrowRight", "icon icon-sm")}${s[key]}</a></li>`)}
      </ul>
    </div>
  </section>`;
  return htmlResponse(c, layout(c, s, { title: s.notfound_title, noindex: true }, content), 404);
}

/** Används om något går riktigt fel. Får inte vara beroende av databasen. */
export function errorPage(c: RequestContext): Response {
  const body = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Något gick fel | JFK</title><link rel="stylesheet" href="/assets/site.css"></head><body><main class="section error-page"><div class="container narrow"><p class="error-code" aria-hidden="true">500</p><h1 class="page-title">Något gick fel</h1><p class="page-lead">Ett tekniskt fel uppstod hos oss. Försök igen om en liten stund.</p><p><a class="btn btn-primary" href="/">Till startsidan</a></p></div></main></body></html>`;
  return htmlResponse(c, body, 500);
}
