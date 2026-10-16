import { html, type SafeHtml } from "../lib/html.js";
import { ec, ek, loadSettings, type Settings } from "../lib/settings.js";
import { networkGallery, networkQuery, loadNetworks, type NetworkRow } from "../lib/networks.js";
import { parsePartnerLinks } from "../lib/partner-links.js";
import { renderMarkdown, plainText } from "../lib/markdown.js";
import { truncate } from "../lib/format.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl, picture } from "../views/layout.js";
import { arrowLink } from "../views/components.js";
import { icon } from "../views/icons.js";
import { breadcrumb } from "../views/page.js";
import { notFoundPage } from "./errors.js";

/**
 * Studentnätverkens egna sidor (/om-oss/juro, /om-oss/elsa-karlstad …): presentation, hur JFK samarbetar med
 * nätverket, bilder och länkar. Innehållet ändras under Partners → Studentnätverk, rubrikerna under
 * Texter och sidor → Om oss → Nätverkens egna sidor.
 */

const newTab = html`<span class="sr-only"> (öppnas i ny flik)</span>`;

/** Nätverkets logotyp, eller namnet i rubrikstilen om logotyp saknas. */
export function networkLogo(n: NetworkRow): SafeHtml {
  const src = n.logo_key ? (/\.svg$/i.test(n.logo_key) ? mediaUrl(n.logo_key) : mediaUrl(n.logo_key, "sm")) : null;
  return src
    ? html`<img class="network-logo" src="${src}" alt="${n.name}" data-img="${n.logo_key}" loading="lazy" decoding="async">`
    : html`<span class="partner-wordmark partner-wordmark-lg">${n.name}</span>`;
}

/** Kort för ett nätverk (Om oss och "Fler samarbeten") – hela kortet leder till nätverkets sida. */
export function networkCard(s: Settings, n: NetworkRow): SafeHtml {
  const media = n.image_key
    ? html`${picture(n.image_key, { alt: "", sizes: "(min-width: 760px) 45vw, 100vw", width: 900, height: 500 })}${n.logo_key ? html`<span class="collab-logo-chip">${networkLogo(n)}</span>` : ""}`
    : n.logo_key
      ? html`<span class="collab-logo">${networkLogo(n)}</span>`
      : html`<span class="collab-wordmark" aria-hidden="true">${n.name}</span>`;
  return html`<article class="collab-card"${ec(s, `/admin/natverk/${n.id}`, `Studentnätverk › ${n.name}`)}>
    <div class="collab-media${n.image_key ? " has-image" : n.logo_key ? " has-logo" : ""}">${media}</div>
    <div class="collab-body">
      ${n.kicker ? html`<p class="partner-kicker">${n.kicker}</p>` : ""}
      <h3 class="info-title">${n.name}</h3>
      ${n.summary ? html`<p>${n.summary}</p>` : ""}
      <a class="collab-link arrow-link" href="/om-oss/${n.slug}"${ek(s, "network_card_more")}>${fill(s.network_card_more, { namn: n.name })}${icon("arrowRight", "icon icon-sm")}</a>
    </div>
  </article>`;
}

export async function networkPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  let n: NetworkRow | null = null;
  try {
    n = await networkQuery.bySlug(db, c.params.slug ?? "").first<NetworkRow>();
  } catch {
    n = null; // tabellen finns inte än
  }
  if (!n) return notFoundPage(c);
  const [s, all] = await Promise.all([loadSettings(db, c.preview), loadNetworks(db)]);
  const vars = { namn: n.name };
  const edit = ec(s, `/admin/natverk/${n.id}`, `Studentnätverk › ${n.name}`);
  const links = parsePartnerLinks(n.links);
  const gallery = networkGallery(n);
  const others = all.filter((o) => o.id !== n!.id);
  const hasAside = !!(n.website_url || n.email || links.length);

  const aside = hasAside
    ? html`<aside class="aside-card">
        <h2 class="aside-title"${ek(s, "network_aside_title")}>${fill(s.network_aside_title, vars)}</h2>
        ${n.website_url
          ? html`<a class="btn btn-primary btn-block" href="${n.website_url}" target="_blank" rel="noopener"${ek(s, "network_website")}>${s.network_website}${icon("external", "icon icon-sm")}${newTab}</a>`
          : ""}
        ${n.email
          ? html`<p class="network-email"><span class="network-email-label"${ek(s, "network_email")}>${s.network_email}</span><a href="mailto:${n.email}">${icon("mail", "icon icon-sm")}<span>${n.email}</span></a></p>`
          : ""}
        ${links.length
          ? html`<ul class="partner-links${n.website_url || n.email ? " has-buttons" : ""}">
              ${links.map(
                (l) => html`<li><a href="${l.url}" target="_blank" rel="noopener"><span class="partner-link-text">${l.label}<span class="partner-link-host">${hostOf(l.url)}</span></span>${icon("external", "icon icon-sm")}${newTab}</a></li>`,
              )}
            </ul>`
          : ""}
      </aside>`
    : "";

  const content = html`
    <section class="page-hero network-top">
      <div class="container">
        ${breadcrumb([{ href: "/om-oss", label: s.about_kicker }, { href: "/om-oss#samarbeten", label: s.network_breadcrumb }, { label: n.name }])}
        <div class="network-hero"${edit}>
          <div class="network-hero-copy">
            ${n.kicker ? html`<p class="page-kicker">${n.kicker}</p>` : ""}
            <h1 class="page-title">${n.name}</h1>
            ${n.summary ? html`<p class="page-lead">${n.summary}</p>` : ""}
          </div>
          <div class="network-hero-logo${n.logo_key ? " has-logo" : ""}">${networkLogo(n)}</div>
        </div>
      </div>
    </section>
    ${n.image_key
      ? html`<div class="container"><figure class="partner-photo partner-photo--banner">${picture(n.image_key, { alt: n.image_alt, sizes: "(min-width: 1280px) 1200px, 100vw", width: 1600, height: 686, eager: true })}</figure></div>`
      : ""}
    ${n.description || hasAside
      ? html`<section class="section section-tight-top">
          <div class="container split split-top">
            <div class="partner-body"${edit}>
              ${n.description
                ? html`<h2 class="section-title"${ek(s, "network_about_title")}>${fill(s.network_about_title, vars)}</h2>
                    <div class="prose prose-lg">${renderMarkdown(n.description)}</div>`
                : ""}
            </div>
            ${aside}
          </div>
        </section>`
      : ""}
    ${n.collaboration
      ? html`<section class="section network-collab" aria-labelledby="samarbetet">
          <div class="container">
            <div class="network-collab-panel"${edit}>
              <div class="network-lockup" aria-hidden="true">
                ${s.logo_key
                  ? html`<img class="network-lockup-jfk" src="${/\.svg$/i.test(s.logo_key) ? mediaUrl(s.logo_key) : mediaUrl(s.logo_key, "sm")}" alt="">`
                  : html`<span class="network-lockup-jfk network-lockup-mark">§</span>`}
                <span class="network-lockup-x">×</span>
                <span class="network-lockup-them">${networkLogo(n)}</span>
              </div>
              <div class="network-collab-copy">
                <p class="page-kicker"${ek(s, "network_collab_kicker")}>${fill(s.network_collab_kicker, vars)}</p>
                <h2 class="section-title" id="samarbetet"${ek(s, "network_collab_title")}>${fill(s.network_collab_title, vars)}</h2>
                <div class="prose prose-lg">${renderMarkdown(n.collaboration)}</div>
              </div>
            </div>
          </div>
        </section>`
      : ""}
    ${gallery.length
      ? html`<section class="section section-tight-top" aria-labelledby="bilder">
          <div class="container">
            <h2 class="section-title network-section-title" id="bilder"${ek(s, "network_gallery_title")}>${s.network_gallery_title}</h2>
            <ul class="network-gallery network-gallery--${gallery.length}"${edit}>
              ${gallery.map(
                (g, i) => html`<li><figure>
                  ${picture(g.key, { alt: g.caption, sizes: i === 0 && gallery.length > 1 ? "(min-width: 900px) 60vw, 100vw" : "(min-width: 900px) 40vw, 100vw", width: 1200, height: 900 })}
                  ${g.caption ? html`<figcaption>${g.caption}</figcaption>` : ""}
                </figure></li>`,
              )}
            </ul>
          </div>
        </section>`
      : ""}
    ${others.length
      ? html`<section class="section section-surface" aria-labelledby="fler-samarbeten">
          <div class="container">
            <h2 class="section-title network-section-title" id="fler-samarbeten"${ek(s, "network_more_title")}>${s.network_more_title}</h2>
            <div class="two-col collab-grid">${others.map((o) => networkCard(s, o))}</div>
          </div>
        </section>`
      : ""}
    <div class="container"><p class="after-list after-list-page">${arrowLink("/om-oss#samarbeten", s.network_back, "arrow-link", ek(s, "network_back"))}</p></div>`;

  return htmlResponse(
    c,
    layout(c, s, { title: n.name, description: n.summary ? truncate(n.summary, 155) : truncate(plainText(n.description), 155) }, content),
  );
}

/** "https://www.linkedin.com/company/x" → "linkedin.com" */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
