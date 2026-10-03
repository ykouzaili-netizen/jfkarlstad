import { html, paragraphs, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, loadSettings, type Settings } from "../lib/settings.js";
import { boardQuery, honorQuery, partnerQuery, type BoardRow, type HonorRow, type PartnerRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { arrowLink, emptyState, partnerLogo } from "../views/components.js";
import { avatar, pageHeader, personCard } from "../views/page.js";

export async function aboutPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [boardRes, honorRes, partnerRes]] = await Promise.all([
    loadSettings(db, c.preview),
    db.batch([boardQuery.all(db), honorQuery.all(db), partnerQuery.all(db)]),
  ]);
  const board = boardRes!.results as unknown as BoardRow[];
  const honors = honorRes!.results as unknown as HonorRow[];
  const partners = partnerRes!.results as unknown as PartnerRow[];

  const content = html`
    ${pageHeader(s, {
      kickerKey: "about_kicker",
      titleKey: "about_title",
      leadKey: "about_lead",
      nav: [
        { href: "#sa-styrs-jfk", labelKey: "governance_title" },
        { href: "#styrelsen", labelKey: "board_title" },
        { href: "#utmarkelser", labelKey: "honors_title" },
        { href: "#arets-pedagog", labelKey: "pedagog_title" },
        { href: "#samarbeten", labelKey: "collab_title" },
      ],
    })}

    <section class="section section-tight-top">
      <div class="container split">
        <div class="prose prose-lg"${ek(s, "about_text")}>${paragraphs(s.about_text)}</div>
        <aside class="aside-card">
          <h2 class="aside-title"${ek(s, "about_docs_title")}>${s.about_docs_title}</h2>
          <p${ek(s, "about_docs_text")}>${s.about_docs_text}</p>
          ${arrowLink("/dokument", s.about_docs_link, "arrow-link", ek(s, "about_docs_link"))}
        </aside>
      </div>
    </section>

    ${governance(s)}
    ${boardSection(s, board)}
    ${honorsSection(s, honors)}
    ${pedagogSection(s, honors)}
    ${collabSection(s, partners)}
  `;

  return htmlResponse(c, layout(c, s, { title: s.about_kicker, description: s.about_lead }, content));
}

function governance(s: Settings): SafeHtml {
  const committees = lines(s.committees);
  return html`<section class="section section-surface" aria-labelledby="sa-styrs-jfk">
    <div class="container split">
      <div>
        <h2 class="section-title" id="sa-styrs-jfk"${ek(s, "governance_title")}>${s.governance_title}</h2>
        <div class="prose"${ek(s, "governance_text")}>${paragraphs(s.governance_text)}</div>
      </div>
      <div class="stack">
        ${committees.length
          ? html`<div class="info-card"${ek(s, "committees")}>
              <h3 class="info-title">${s.committees_title}</h3>
              <ul class="pill-list">${committees.map((cm) => html`<li>${cm}</li>`)}</ul>
            </div>`
          : ""}
        <div class="info-card">
          <h3 class="info-title"${ek(s, "inspector_title")}>${s.inspector_title}</h3>
          <div class="prose"${ek(s, "inspector_text")}>${paragraphs(s.inspector_text)}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function boardSection(s: Settings, board: BoardRow[]): SafeHtml {
  return html`<section class="section" aria-labelledby="styrelsen">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="styrelsen"${ek(s, "board_title")}>${s.board_title}</h2>
          <p class="section-lead"${ek(s, "board_lead")}>${s.board_lead}</p>
        </div>
      </div>
      ${board.length ? html`<ul class="person-grid">${board.map((p) => personCard(s, p))}</ul>` : emptyState(s.board_empty, ek(s, "board_empty"))}
    </div>
  </section>`;
}

function honorCard(s: Settings, h: HonorRow): SafeHtml {
  return html`<li class="honor-card"${ec(s, `/admin/utmarkelser/${h.id}`, `Utmärkelser › ${h.name}`)}>
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
      <h2 class="section-title" id="utmarkelser"${ek(s, "honors_title")}>${s.honors_title}</h2>
      <div class="split split-top">
        <div class="prose"${ek(s, "honors_text")}>${paragraphs(s.honors_text)}</div>
        <div class="info-card info-card-accent">
          <h3 class="info-title"${ek(s, "rewards_title")}>${s.rewards_title}</h3>
          <div class="prose"${ek(s, "rewards_text")}>${paragraphs(s.rewards_text)}</div>
        </div>
      </div>
      <h3 class="subsection-title"${ek(s, "honors_members_title")}>${s.honors_members_title}</h3>
      ${members.length
        ? html`<ul class="honor-grid">${members.map((h) => honorCard(s, h))}</ul>`
        : emptyState(s.honors_members_empty, ek(s, "honors_members_empty"))}
      ${awards.length
        ? html`<h3 class="subsection-title"${ek(s, "honors_awards_title")}>${s.honors_awards_title}</h3><ul class="honor-grid">${awards.map((h) => honorCard(s, h))}</ul>`
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
          <h2 class="section-title" id="arets-pedagog"${ek(s, "pedagog_title")}>${s.pedagog_title}</h2>
          <p class="section-lead"${ek(s, "pedagog_text")}>${s.pedagog_text}</p>
        </div>
      </div>
      ${winners.length ? html`<ul class="honor-grid">${winners.map((h) => honorCard(s, h))}</ul>` : emptyState(s.pedagog_empty, ek(s, "pedagog_empty"))}
    </div>
  </section>`;
}

function collabSection(s: Settings, partners: PartnerRow[]): SafeHtml {
  return html`<section class="section section-surface" aria-labelledby="samarbeten">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="samarbeten"${ek(s, "collab_title")}>${s.collab_title}</h2>
          <p class="section-lead"${ek(s, "collab_text")}>${s.collab_text}</p>
        </div>
        ${arrowLink("/partners", s.collab_link, "arrow-link section-link", ek(s, "collab_link"))}
      </div>
      <div class="two-col">
        <article class="info-card">
          <p class="partner-kicker"${ek(s, "juro_kicker")}>${s.juro_kicker}</p>
          <h3 class="info-title"${ek(s, "juro_title")}>${s.juro_title}</h3>
          <p${ek(s, "juro_text")}>${s.juro_text}</p>
        </article>
        <article class="info-card">
          <p class="partner-kicker"${ek(s, "elsa_kicker")}>${s.elsa_kicker}</p>
          <h3 class="info-title"${ek(s, "elsa_title")}>${s.elsa_title}</h3>
          <p${ek(s, "elsa_text")}>${s.elsa_text}</p>
        </article>
      </div>
      ${partners.length
        ? html`<ul class="logo-row">${partners.map((p) => html`<li${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>`
        : ""}
    </div>
  </section>`;
}
