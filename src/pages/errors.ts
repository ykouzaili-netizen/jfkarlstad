import { html } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { icon } from "../views/icons.js";

export async function notFoundPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const content = html`<section class="section error-page">
    <div class="container narrow">
      <p class="error-code" aria-hidden="true">404</p>
      <h1 class="page-title">Sidan kunde inte hittas</h1>
      <p class="page-lead">Länken kan vara gammal, eller så har sidan flyttats. Prova någon av de här i stället:</p>
      <ul class="error-links">
        <li><a href="/">${icon("arrowRight", "icon icon-sm")}Startsidan</a></li>
        <li><a href="/kalender">${icon("arrowRight", "icon icon-sm")}Kalendern</a></li>
        <li><a href="/aktuellt">${icon("arrowRight", "icon icon-sm")}Nyheter</a></li>
        <li><a href="/kontakt">${icon("arrowRight", "icon icon-sm")}Kontakta oss</a></li>
      </ul>
    </div>
  </section>`;
  return htmlResponse(c, layout(c, s, { title: "Sidan kunde inte hittas", noindex: true }, content), 404);
}

/** Används om något går riktigt fel. Får inte vara beroende av databasen. */
export function errorPage(c: RequestContext): Response {
  const body = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Något gick fel | JFK</title><link rel="stylesheet" href="/assets/site.css"></head><body><main class="section error-page"><div class="container narrow"><p class="error-code" aria-hidden="true">500</p><h1 class="page-title">Något gick fel</h1><p class="page-lead">Ett tekniskt fel uppstod hos oss. Försök igen om en liten stund.</p><p><a class="btn btn-primary" href="/">Till startsidan</a></p></div></main></body></html>`;
  return htmlResponse(c, body, 500);
}
