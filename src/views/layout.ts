import { html, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import type { Settings } from "../lib/settings.js";
import { HEADING_FONTS, headingFont, themeCss } from "../lib/settings.js";
import { telHref } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { icon } from "./icons.js";
import { NAV, isActive } from "./nav.js";

/** Höj när CSS/JS ändras, så att webbläsare hämtar nya filer (de cachas ett år). */
export const ASSET_VERSION = "6";

export interface PageMeta {
  title: string;
  description?: string;
  /** Kanonisk sökväg, t.ex. "/kalender". Standard: aktuell sökväg. */
  path?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noindex?: boolean;
  jsonLd?: object[];
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/media/${encodeURI(key)}` : null;
}

/** "Bli medlem"-knappen. Länkar alltid till Hitract i ny flik. */
export function joinButton(s: Settings, opts: { className?: string; label?: string } = {}): SafeHtml {
  const label = opts.label ?? "Bli medlem";
  return html`<a class="${opts.className ?? "btn btn-primary"}" href="${safeUrl(s.hitract_url)}" target="_blank" rel="noopener">${label}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>`;
}

export function logo(s: Settings, variant: "header" | "footer" = "header"): SafeHtml {
  const src = mediaUrl(s.logo_key);
  const mark = src
    ? html`<img class="brand-logo" src="${src}" alt="" width="48" height="48">`
    : html`<span class="brand-mark" aria-hidden="true">§</span>`;
  return html`<a class="brand brand-${variant}" href="/" aria-label="${s.site_name} – till startsidan">
    ${mark}
    <span class="brand-short" aria-hidden="true">JFK</span>
    <span class="brand-text"><span class="brand-line1">Juridiska Föreningen</span><span class="brand-line2">i Karlstad</span></span>
  </a>`;
}

function header(c: RequestContext, s: Settings): SafeHtml {
  const path = c.url.pathname;
  const items = NAV.map((item) => {
    const active = isActive(item, path);
    if (!item.children) {
      return html`<li class="nav-item"><a class="nav-link" href="${item.href}"${raw(active ? ' aria-current="page"' : "")}>${item.label}</a></li>`;
    }
    const subId = `undermeny-${item.id}`;
    return html`<li class="nav-item has-sub" data-sub>
      <a class="nav-link${active ? " is-active" : ""}" href="${item.href}">${item.label}</a>
      <button class="sub-toggle" type="button" aria-expanded="false" aria-controls="${subId}">
        ${icon("chevronDown", "icon icon-sm")}<span class="sr-only">Visa undermeny för ${item.label}</span>
      </button>
      <ul class="sub-menu" id="${subId}">
        ${item.children.map(
          (ch) => html`<li><a href="${ch.href}"${raw(path === ch.href ? ' aria-current="page"' : "")}>${ch.label}</a></li>`,
        )}
      </ul>
    </li>`;
  });

  return html`<header class="site-header" data-header>
    <div class="container header-inner">
      ${logo(s)}
      <nav class="main-nav" id="huvudmeny" aria-label="Huvudmeny" data-nav>
        <ul class="nav-list">${items}</ul>
        <div class="nav-mobile-cta">${joinButton(s, { className: "btn btn-primary btn-block" })}</div>
      </nav>
      <div class="header-actions">
        ${joinButton(s, { className: "btn btn-primary btn-sm header-cta" })}
        <a class="menu-toggle" href="#sidkarta" data-menu-toggle aria-controls="huvudmeny">
          <span class="menu-icon-open">${icon("menu")}</span><span class="menu-icon-close">${icon("close")}</span>
          <span class="menu-label">Meny</span>
        </a>
      </div>
    </div>
  </header>`;
}

function footer(s: Settings): SafeHtml {
  const year = new Date().getUTCFullYear();
  const cols = NAV.filter((n) => n.children).map(
    (n) => html`<div class="footer-col">
      <h2 class="footer-heading">${n.label}</h2>
      <ul>${n.children!.map((ch) => html`<li><a href="${ch.href}">${ch.label}</a></li>`)}</ul>
    </div>`,
  );
  return html`<footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          ${logo(s, "footer")}
          <p class="footer-text">${s.footer_text}</p>
          ${joinButton(s)}
        </div>
        <div class="footer-contact">
          <h2 class="footer-heading">Kontakt</h2>
          <address>
            <p class="contact-row">${icon("pin", "icon icon-sm")}<span>${s.address_street}<br>${s.address_city}</span></p>
            <p class="contact-row">${icon("mail", "icon icon-sm")}<a href="mailto:${s.contact_email}">${s.contact_email}</a></p>
            <p class="contact-row">${icon("phone", "icon icon-sm")}<a href="${telHref(s.contact_phone)}">${s.contact_phone}</a></p>
            <p class="contact-row">${icon("instagram", "icon icon-sm")}<a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a></p>
          </address>
        </div>
      </div>
      <nav class="footer-sitemap" id="sidkarta" aria-label="Sidkarta">
        ${cols}
        <div class="footer-col">
          <h2 class="footer-heading">Mer</h2>
          <ul>
            <li><a href="/jf-paverka">JF Påverka</a></li>
            <li><a href="/kontakt">Kontakt</a></li>
            <li><a href="/faq">Vanliga frågor</a></li>
            <li><a href="/dokument">Dokument</a></li>
          </ul>
        </div>
      </nav>
      <div class="footer-bottom">
        <p>© ${year} ${s.site_name}${s.org_number ? ` · Org.nr ${s.org_number}` : ""}</p>
        <ul class="footer-legal">
          <li><a href="/integritetspolicy">Integritetspolicy</a></li>
          <li><a href="/cookies">Cookie-inställningar</a></li>
          <li><a class="footer-login" href="/admin" rel="nofollow">${icon("lock", "icon icon-sm")}Logga in för styrelsen</a></li>
        </ul>
      </div>
    </div>
  </footer>`;
}

export function layout(c: RequestContext, s: Settings, meta: PageMeta, content: SafeHtml): string {
  const site = c.env.SITE_URL.replace(/\/$/, "");
  const path = meta.path ?? c.url.pathname;
  const canonical = site + path;
  const isHome = path === "/";
  const fullTitle = isHome ? `${s.site_name} – JFK` : `${meta.title} | ${s.site_short_name}`;
  const description = meta.description ?? s.site_description;
  const ogImage = meta.ogImage ? (meta.ogImage.startsWith("http") ? meta.ogImage : site + meta.ogImage) : `${site}/assets/og-image.png`;

  const ld = (meta.jsonLd ?? []).map(
    // JSON i <script> – escapa "<" så att ingen sträng kan avsluta script-taggen.
    (obj) => raw(`<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`),
  );

  const doc = html`<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
${meta.noindex ? raw('<meta name="robots" content="noindex, nofollow">') : ""}
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${meta.ogType ?? "website"}">
<meta property="og:site_name" content="${s.site_name}">
<meta property="og:locale" content="sv_SE">
<meta property="og:title" content="${isHome ? s.site_name : meta.title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${s.color_background}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/montserrat.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${HEADING_FONTS[headingFont(s)].file}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}">
<style nonce="${c.nonce}">${raw(themeCss(s))}</style>
<script src="/assets/site.js?v=${ASSET_VERSION}" defer></script>
${ld}
</head>
<body>
<a class="skip-link" href="#innehall">Hoppa till innehållet</a>
${header(c, s)}
<main id="innehall" tabindex="-1">
${content}
</main>
${footer(s)}
</body>
</html>`;
  return doc.value;
}
