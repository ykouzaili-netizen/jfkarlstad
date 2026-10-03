import { html, paragraphs, type SafeHtml } from "../lib/html.js";
import { lines, loadSettings, type Settings } from "../lib/settings.js";
import { boardQuery, honorQuery, partnerQuery, type BoardRow, type HonorRow, type PartnerRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { arrowLink, emptyState, partnerLogo } from "../views/components.js";
import { avatar, pageHeader, personCard } from "../views/page.js";

export async function aboutPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [boardRes, honorRes, partnerRes]] = await Promise.all([
    loadSettings(db),
    db.batch([boardQuery.all(db), honorQuery.all(db), partnerQuery.all(db)]),
  ]);
  const board = boardRes!.results as unknown as BoardRow[];
  const honors = honorRes!.results as unknown as HonorRow[];
  const partners = partnerRes!.results as unknown as PartnerRow[];

  const content = html`
    ${pageHeader({
      kicker: "Om oss",
      title: "Om Juridiska Föreningen i Karlstad",
      lead: s.about_lead,
      nav: [
        { href: "#sa-styrs-jfk", label: "Så styrs JFK" },
        { href: "#styrelsen", label: "Styrelsen" },
        { href: "#utmarkelser", label: "Utmärkelser" },
        { href: "#arets-pedagog", label: "Årets pedagog" },
        { href: "#samarbeten", label: "Samarbeten" },
      ],
    })}

    <section class="section section-tight-top">
      <div class="container split">
        <div class="prose prose-lg">${paragraphs(s.about_text)}</div>
        <aside class="aside-card">
          <h2 class="aside-title">Dokument och protokoll</h2>
          <p>Stadgar, styrdokument och protokoll från styrelsemöten och årsmöten finns samlade på ett ställe.</p>
          ${arrowLink("/dokument", "Till dokumenten")}
        </aside>
      </div>
    </section>

    ${governance(s)}
    ${boardSection(board)}
    ${honorsSection(s, honors)}
    ${pedagogSection(s, honors)}
    ${collabSection(s, partners)}
  `;

  return htmlResponse(c, layout(c, s, { title: "Om oss", description: s.about_lead }, content));
}

function governance(s: Settings): SafeHtml {
  const committees = lines(s.committees);
  return html`<section class="section section-surface" aria-labelledby="sa-styrs-jfk">
    <div class="container split">
      <div>
        <h2 class="section-title" id="sa-styrs-jfk">Så styrs JFK</h2>
        <div class="prose">${paragraphs(s.governance_text)}</div>
      </div>
      <div class="stack">
        ${committees.length
          ? html`<div class="info-card">
              <h3 class="info-title">Utskotten</h3>
              <ul class="pill-list">${committees.map((cm) => html`<li>${cm}</li>`)}</ul>
            </div>`
          : ""}
        <div class="info-card">
          <h3 class="info-title">Inspektorn</h3>
          <div class="prose">${paragraphs(s.inspector_text)}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function boardSection(board: BoardRow[]): SafeHtml {
  return html`<section class="section" aria-labelledby="styrelsen">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="styrelsen">Styrelsen</h2>
          <p class="section-lead">Har du en fråga till någon i styrelsen? Mejla direkt – vi svarar så snart vi kan.</p>
        </div>
      </div>
      ${board.length ? html`<ul class="person-grid">${board.map(personCard)}</ul>` : emptyState("Styrelsen presenteras snart.")}
    </div>
  </section>`;
}

function honorCard(h: HonorRow): SafeHtml {
  return html`<li class="honor-card">
    ${avatar(h.name, h.photo_key, "md")}
    <div>
      ${h.year ? html`<p class="honor-year">${h.year}</p>` : ""}
      <h3 class="honor-name">${h.name}</h3>
      ${h.description ? html`<p class="honor-text">${h.description}</p>` : ""}
    </div>
  </li>`;
}

function honorsSection(s: Settings, honors: HonorRow[]): SafeHtml {
  const members = honors.filter((h) => h.kind === "hedersmedlem");
  const awards = honors.filter((h) => h.kind === "utmarkelse");
  return html`<section class="section section-surface" aria-labelledby="utmarkelser">
    <div class="container">
      <h2 class="section-title" id="utmarkelser">Hedersmedlemmar och utmärkelser</h2>
      <div class="split split-top">
        <div class="prose">${paragraphs(s.honors_text)}</div>
        <div class="info-card info-card-accent">
          <h3 class="info-title">Belöningssystemet</h3>
          <div class="prose">${paragraphs(s.rewards_text)}</div>
        </div>
      </div>
      <h3 class="subsection-title">Hedersmedlemmar</h3>
      ${members.length ? html`<ul class="honor-grid">${members.map(honorCard)}</ul>` : emptyState("Hedersmedlemmarna presenteras här inom kort.")}
      ${awards.length
        ? html`<h3 class="subsection-title">Utdelade utmärkelser</h3><ul class="honor-grid">${awards.map(honorCard)}</ul>`
        : ""}
    </div>
  </section>`;
}

function pedagogSection(s: Settings, honors: HonorRow[]): SafeHtml {
  const winners = honors.filter((h) => h.kind === "arets_pedagog");
  return html`<section class="section" aria-labelledby="arets-pedagog">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="arets-pedagog">Årets pedagog</h2>
          <p class="section-lead">${s.pedagog_text}</p>
        </div>
      </div>
      ${winners.length ? html`<ul class="honor-grid">${winners.map(honorCard)}</ul>` : emptyState("Pristagarna presenteras här inom kort.")}
    </div>
  </section>`;
}

function collabSection(s: Settings, partners: PartnerRow[]): SafeHtml {
  return html`<section class="section section-surface" aria-labelledby="samarbeten">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="samarbeten">Samarbeten</h2>
          <p class="section-lead">${s.collab_text}</p>
        </div>
        ${arrowLink("/partners", "Alla samarbetspartners", "arrow-link section-link")}
      </div>
      <div class="two-col">
        <article class="info-card">
          <p class="partner-kicker">Nationellt</p>
          <h3 class="info-title">JURO</h3>
          <p>${s.juro_text}</p>
        </article>
        <article class="info-card">
          <p class="partner-kicker">Internationellt</p>
          <h3 class="info-title">ELSA Karlstad</h3>
          <p>${s.elsa_text}</p>
        </article>
      </div>
      ${partners.length
        ? html`<ul class="logo-row">${partners.map((p) => html`<li><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>`
        : ""}
    </div>
  </section>`;
}
