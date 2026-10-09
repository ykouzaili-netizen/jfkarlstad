import { loadCommittees, type CommitteeRow } from "../lib/committees.js";
import { blockOrder, isBlockHidden } from "../lib/pagelayout.js";
import { html, paragraphs, type SafeHtml } from "../lib/html.js";
import { ec, ek, loadSettings, type SettingKey, type Settings, siteLayout, withBlockColors } from "../lib/settings.js";
import { boardQuery, honorQuery, partnerQuery, type BoardRow, type HonorRow, type PartnerRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import { loadMedals } from "../lib/medals.js";
import { honorsData, honorsSection } from "./honors.js";
import { pedagogSection } from "./pedagog.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout, picture } from "../views/layout.js";
import { arrowLink, emptyState, partnerLogo } from "../views/components.js";
import { icon, type IconName } from "../views/icons.js";
import { HERO_FALLBACKS, heroStyle, heroTile, personCard, photoTop, sectionNav, type HeroImage } from "../views/page.js";

export async function aboutPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [boardRes, honorRes, partnerRes], committeeRows, medals] = await Promise.all([
    loadSettings(db, c.preview),
    db.batch([boardQuery.all(db), honorQuery.all(db), partnerQuery.all(db)]),
    loadCommittees(db),
    loadMedals(db),
  ]);
  const board = boardRes!.results as unknown as BoardRow[];
  const honors = honorRes!.results as unknown as HonorRow[];
  const partners = partnerRes!.results as unknown as PartnerRow[];
  const committees = committeeRows;

  const sections: { id: string; anchor: string; labelKey: SettingKey; icon: IconName; render: () => SafeHtml | string }[] = [
    { id: "om", anchor: "#om-jfk", labelKey: "about_section_title", icon: "sparkle", render: () => aboutSection(s) },
    { id: "styrning", anchor: "#sa-styrs-jfk", labelKey: "governance_title", icon: "network", render: () => governance(s) },
    { id: "styrelsen", anchor: "#styrelsen", labelKey: "board_title", icon: "user", render: () => boardSection(s, board) },
    { id: "utskott", anchor: "#utskotten", labelKey: "committees_title", icon: "users", render: () => (committees.length ? committeesSection(s, committees) : "") },
    { id: "utmarkelser", anchor: "#utmarkelser", labelKey: "honors_title", icon: "check", render: () => honorsSection(s, honorsData(honors, medals)) },
    { id: "pedagog", anchor: "#arets-pedagog", labelKey: "pedagog_title", icon: "megaphone", render: () => pedagogSection(s, honors) },
    { id: "samarbeten", anchor: "#samarbeten", labelKey: "collab_title", icon: "briefcase", render: () => collabSection(s, partners) },
  ];
  // Genvägarna följer avsnittens ordning och hoppar över dolda avsnitt.
  const order = siteLayout(s);
  const shown = blockOrder(order, "om-oss")
    .map((id) => sections.find((x) => x.id === id)!)
    .filter((x) => x && !isBlockHidden(order, "om-oss", x.id) && (x.id !== "utskott" || committees.length));

  const content = html`
    ${hero(s)}
    ${sectionNav(s, shown.map((x) => ({ href: x.anchor, labelKey: x.labelKey, icon: x.icon })))}
    ${shown.map((x) => withBlockColors(s, "om-oss", x.id, x.render()))}
  `;

  return htmlResponse(c, layout(c, s, { title: s.about_kicker, description: s.about_lead }, content));
}

/** Om oss har egna reservrutor med föreningens nyckeltal när bilder saknas. */
function hero(s: Settings): SafeHtml {
  const style = heroStyle(s.about_hero_style, "kollage") === "enkel" ? "kollage" : heroStyle(s.about_hero_style, "kollage");
  const img = (n: 1 | 2 | 3): HeroImage | null => {
    const key = s[`about_image_${n}` as const];
    return key ? { key, alt: s[`about_image_${n}_alt` as const], setting: `about_image_${n}` } : null;
  };
  const copy = html`<p class="page-kicker"${ek(s, "about_kicker")}>${s.about_kicker}</p>
    <h1 class="page-title" id="om-oss-titel"${ek(s, "about_title")}>${s.about_title}</h1>
    <p class="page-lead"${ek(s, "about_lead")}>${s.about_lead}</p>
    <div class="page-actions">
      ${joinButton(s, { className: "btn btn-primary" })}
      <a class="btn btn-outline" href="/engagera-dig"${ek(s, "about_cta_engage")}>${s.about_cta_engage}</a>
    </div>`;
  const tiles = [
    heroTile(s, 1, style, img(1), HERO_FALLBACKS[0]!),
    heroTile(s, 2, style, img(2), html`<div class="collage-fallback collage-fallback-dark"><span class="collage-fig"${ek(s, "stat_1_value")}>${s.stat_1_value}</span><span class="collage-cap">${s.stat_1_label}</span></div>`),
    heroTile(s, 3, style, img(3), html`<div class="collage-fallback collage-fallback-light"><span class="collage-fig"${ek(s, "stat_2_value")}>${s.stat_2_value}</span><span class="collage-cap">${s.stat_2_label}</span></div>`),
  ];
  return photoTop({ style, hasPhoto: Boolean(s.about_image_1), copy, tiles, labelledBy: "om-oss-titel" });
}

function aboutSection(s: Settings): SafeHtml {
  const stats = [
    ["stat_1_value", "stat_1_label"],
    ["stat_2_value", "stat_2_label"],
    ["stat_3_value", "stat_3_label"],
    ["stat_4_value", "stat_4_label"],
  ] as const;
  return html`<section class="section about-intro" aria-labelledby="om-jfk">
    <div class="container about-intro-grid">
      <div class="about-intro-media${s.about_image ? " has-image" : ""}"${ek(s, "about_image")}>
        ${s.about_image
          ? picture(s.about_image, { alt: s.about_image_alt, sizes: "(min-width: 920px) 50vw, 100vw", width: 1200, height: 900 })
          : html`<div class="about-intro-fallback" aria-hidden="true"><span>§</span></div>`}
      </div>
      <div class="about-intro-copy">
        <h2 class="section-title" id="om-jfk"${ek(s, "about_section_title")}>${s.about_section_title}</h2>
        <div class="prose prose-lg"${ek(s, "about_text")}>${paragraphs(s.about_text)}</div>
        <dl class="about-stats">
          ${stats.map(([v, l]) => html`<div${ek(s, v)}><dt>${s[l]}</dt><dd>${s[v]}</dd></div>`)}
        </dl>
        <a class="doc-shortcut" href="/dokument"${ek(s, "about_docs_title")}>
          <span class="doc-shortcut-icon" aria-hidden="true">${icon("lock", "icon")}</span>
          <span><strong>${s.about_docs_title}</strong><span class="doc-shortcut-text">${s.about_docs_text}</span></span>
          ${icon("arrowRight", "icon icon-sm")}
        </a>
      </div>
    </div>
  </section>`;
}

function governance(s: Settings): SafeHtml {
  return html`<section class="section section-surface" aria-labelledby="sa-styrs-jfk">
    <div class="container split split-top">
      <div>
        <h2 class="section-title" id="sa-styrs-jfk"${ek(s, "governance_title")}>${s.governance_title}</h2>
        <div class="prose prose-lg"${ek(s, "governance_text")}>${paragraphs(s.governance_text)}</div>
      </div>
      <aside class="inspector-card">
        ${s.inspector_image
          ? html`<div class="inspector-photo"${ek(s, "inspector_image")}>${picture(s.inspector_image, { alt: "", sizes: "120px", width: 240, height: 240 })}</div>`
          : html`<span class="inspector-mark" aria-hidden="true"${ek(s, "inspector_image")}>${icon("sparkle", "icon")}</span>`}
        <h3 class="info-title"${ek(s, "inspector_title")}>${s.inspector_title}</h3>
        <div class="prose"${ek(s, "inspector_text")}>${paragraphs(s.inspector_text)}</div>
      </aside>
    </div>
  </section>`;
}

const COMMITTEE_STYLES = ["mork", "gul", "ljusa", "karusell"] as const;

function committeesSection(s: Settings, committees: CommitteeRow[]): SafeHtml {
  const monogram = (name: string) => name.replace(/utskottet$/i, "").trim().charAt(0).toUpperCase() || name.charAt(0);
  const style = (COMMITTEE_STYLES as readonly string[]).includes(s.committees_style) ? s.committees_style : "mork";
  const showImage = Boolean(s.committees_image) && (style === "mork" || style === "karusell");
  const carousel = style === "karusell";
  return html`<section class="committees committees--${style}${showImage ? " has-image" : ""}" aria-labelledby="utskotten">
    ${showImage ? html`<div class="committees-bg" aria-hidden="true"${ek(s, "committees_image")}>${picture(s.committees_image, { alt: "", sizes: "100vw", width: 2000, height: 1200 })}</div>` : ""}
    <div class="container">
      <div class="committees-head">
        <h2 class="section-title" id="utskotten"${ek(s, "committees_title")}>${s.committees_title}</h2>
        <p class="section-lead"${ek(s, "committees_lead")}>${s.committees_lead}</p>
      </div>
      <ul class="committee-grid"${carousel ? html` tabindex="0" aria-label="${s.committees_title} – bläddra i sidled"` : ""}>
        ${committees.map(
          (cm) => html`<li class="committee-card is-link"${ec(s, `/admin/utskott/${cm.id}`, `Utskott › ${cm.name}`)}>
            <span class="committee-mark" aria-hidden="true">${monogram(cm.name)}</span>
            <h3 class="committee-name"><a class="committee-link" href="/engagera-dig#utskott-${cm.slug}">${softHyphen(cm.name)}</a></h3>
            ${cm.summary ? html`<p class="committee-text">${cm.summary}</p>` : ""}
            <span class="committee-more" aria-hidden="true"${ek(s, "committees_read_more")}>${s.committees_read_more}${icon("arrowRight", "icon icon-sm")}</span>
          </li>`,
        )}
        <li class="committee-card committee-cta">
          <h3 class="committee-name"${ek(s, "committees_cta_title")}>${s.committees_cta_title}</h3>
          <p class="committee-text"${ek(s, "committees_cta_text")}>${s.committees_cta_text}</p>
          <a class="btn btn-primary" href="/engagera-dig"${ek(s, "committees_cta_button")}>${s.committees_cta_button}</a>
        </li>
      </ul>
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


function collabCard(s: Settings, k: "juro" | "elsa"): SafeHtml {
  const img = s[`${k}_image` as const];
  return html`<article class="collab-card">
    <div class="collab-media${img ? " has-image" : ""}"${ek(s, `${k}_image` as const)}>
      ${img
        ? picture(img, { alt: s[`${k}_title` as const], sizes: "(min-width: 760px) 45vw, 100vw", width: 900, height: 500 })
        : html`<span class="collab-wordmark" aria-hidden="true">${s[`${k}_title` as const]}</span>`}
    </div>
    <div class="collab-body">
      <p class="partner-kicker"${ek(s, `${k}_kicker` as const)}>${s[`${k}_kicker` as const]}</p>
      <h3 class="info-title"${ek(s, `${k}_title` as const)}>${s[`${k}_title` as const]}</h3>
      <p${ek(s, `${k}_text` as const)}>${s[`${k}_text` as const]}</p>
    </div>
  </article>`;
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
      <div class="two-col">${collabCard(s, "juro")}${collabCard(s, "elsa")}</div>
      ${partners.length
        ? html`<ul class="logo-row">${partners.map((p) => html`<li${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>`
        : ""}
    </div>
  </section>`;
}

/**
 * Mjukt bindestreck före "utskott" i sammansatta namn ("Kommunikations­utskottet"), så att långa namn bryts
 * snyggt i smala kort. Webbläsarnas automatiska avstavning saknar ofta svenska.
 */
function softHyphen(name: string): string {
  return name.replace(/([a-zåäö])(utskott)/giu, "$1­$2");
}
