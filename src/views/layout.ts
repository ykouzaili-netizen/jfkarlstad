import { html, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import { blockColorCss, ek, HEADING_FONTS, headingFont, imageFits, introStyle, isMarked, motionLevel, siteLayout, themeCss, type Settings } from "../lib/settings.js";
import { textStyleCss } from "../lib/pagelayout.js";
import { imageFitCss } from "../lib/imagefit.js";
import { telHref } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { icon } from "./icons.js";
import { isActive, visibleMenu } from "./nav.js";

/** Höj när CSS/JS ändras, så att webbläsare hämtar nya filer (de cachas ett år). */
export const ASSET_VERSION = "47";

export interface PageMeta {
  title: string;
  description?: string;
  /** Kanonisk sökväg, t.ex. "/kalender". Standard: aktuell sökväg. */
  path?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noindex?: boolean;
  jsonLd?: object[];
  /** Sidhuvudet ligger genomskinligt ovanpå en helskärmsbild (startsidan). */
  overlayHeader?: boolean;
}

/** Prefix för bilder som valts i adminpanelen men inte sparats ännu (bara i förhandsvisningen). */
export const PREVIEW_IMAGE_PREFIX = "__fh__";

/**
 * Adress till en uppladdad bild. `sm` = den mindre versionen (max 800 px) som skapas vid uppladdning;
 * finns den inte (äldre bilder, SVG) svarar servern med originalet.
 */
/** Flikens ikon: den uppladdade logotypen (Utseende → Logotyp), annars §-ikonen. */
export function favicon(s: Settings): SafeHtml {
  const src = s.logo_key && !s.logo_key.startsWith(PREVIEW_IMAGE_PREFIX) ? mediaUrl(s.logo_key) : null;
  return src
    ? html`<link rel="icon" href="${src}"><link rel="apple-touch-icon" href="${src}">`
    : html`<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">`;
}

export function mediaUrl(key: string | null | undefined, size: "full" | "sm" = "full"): string | null {
  // Ett bildfält med bildspel innehåller flera nycklar ("a|b|c") – adressen gäller huvudbilden.
  if (key && key.includes("|")) key = key.split("|")[0];
  if (!key) return null;
  if (key.startsWith(PREVIEW_IMAGE_PREFIX)) {
    // Genomskinlig platshållare som adminpanelens skript byter mot den valda bilden.
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10'%3E%3C!--fh:${encodeURIComponent(key.slice(PREVIEW_IMAGE_PREFIX.length))}--%3E%3C/svg%3E`;
  }
  return `/media/${encodeURI(key)}${size === "sm" ? ".sm" : ""}`;
}

/**
 * Bild med srcset: webbläsaren väljer den lilla versionen (800 px) på mobil och i kort,
 * och originalet bara när det behövs. `sizes` beskriver hur bred bilden visas.
 */
export function picture(
  key: string,
  opts: { alt: string; sizes: string; className?: string; width: number; height: number; eager?: boolean; attrs?: SafeHtml },
): SafeHtml {
  // Bildspel (Texter och sidor → bildfältet → Visa som: Bildspel): bilderna ligger på varandra och tonar över
  // (site.js). Bara den första beskrivs för skärmläsare; de andra är variationer av samma motiv.
  if (key.includes("|")) {
    const keys = key.split("|").filter(Boolean);
    if (keys.length > 1) {
      return html`<span class="slides" data-slides>${keys.map((k, i) =>
        picture(k, {
          ...opts,
          alt: i === 0 ? opts.alt : "",
          className: `${opts.className ? opts.className + " " : ""}slide${i === 0 ? " is-active" : ""}`,
          eager: i === 0 ? opts.eager : false,
          attrs: i === 0 ? opts.attrs : undefined,
        }),
      )}<button class="slides-pause" type="button" hidden data-slides-pause aria-pressed="false"><span class="slides-pause-icon" aria-hidden="true"></span><span class="sr-only">Pausa bildspelet</span></button></span>`;
    }
    key = keys[0] ?? "";
  }
  const full = mediaUrl(key)!;
  const isPlaceholder = key.startsWith(PREVIEW_IMAGE_PREFIX);
  const isSvg = /\.svg$/i.test(key);
  const loading = opts.eager ? html` fetchpriority="high"` : html` loading="lazy" decoding="async"`;
  const cls = opts.className ? html` class="${opts.className}"` : "";
  if (isPlaceholder || isSvg) {
    return html`<img${cls} src="${full}" alt="${opts.alt}" width="${opts.width}" height="${opts.height}"${isPlaceholder ? "" : html` data-img="${key}"`}${loading}${opts.attrs ?? ""}>`;
  }
  const sm = mediaUrl(key, "sm")!;
  return html`<img${cls} src="${sm}" srcset="${sm} 800w, ${full} 2560w" sizes="${opts.sizes}" alt="${opts.alt}" width="${opts.width}" height="${opts.height}" data-img="${key}"${loading}${opts.attrs ?? ""}>`;
}

/** "Bli medlem"-knappen. Länkar alltid till Hitract i ny flik. */
export function joinButton(s: Settings, opts: { className?: string; label?: string; labelKey?: "join_label" | "hero_button_label" | "event_join" } = {}): SafeHtml {
  const key = opts.labelKey ?? "join_label";
  const label = opts.label ?? s[key];
  return html`<a class="${opts.className ?? "btn btn-primary"}" href="${safeUrl(s.hitract_url)}" target="_blank" rel="noopener"${ek(s, key)}>${label}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a>`;
}

export function logo(s: Settings, variant: "header" | "footer" = "header"): SafeHtml {
  const src = mediaUrl(s.logo_key);
  const mark = src
    ? html`<img class="brand-logo" src="${src}" alt="" width="48" height="48" data-img="${s.logo_key}"${ek(s, "logo_key")}>`
    : html`<span class="brand-mark" aria-hidden="true"${ek(s, "logo_key")}>§</span>`;
  return html`<a class="brand brand-${variant}" href="/" aria-label="${s.site_name} – till startsidan">
    ${mark}
    <span class="brand-short" aria-hidden="true"${ek(s, "brand_short")}>${s.brand_short}</span>
    <span class="brand-text"><span class="brand-line1"${ek(s, "brand_line1")}>${s.brand_line1}</span><span class="brand-line2"${ek(s, "brand_line2")}>${s.brand_line2}</span></span>
  </a>`;
}

/** Märkning av menypunkter i förhandsvisningen (klick → menyredigeraren). */
function menuMark(s: Settings, label: string): SafeHtml {
  if (!isMarked(s)) return raw("");
  return raw(` data-eu="/admin/texter?sida=meny" data-el="Menyn › ${label.replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`);
}

function header(c: RequestContext, s: Settings): SafeHtml {
  const path = c.url.pathname;
  const items = visibleMenu(s).map((item) => {
    const active = isActive(item, path);
    if (!item.children) {
      return html`<li class="nav-item"><a class="nav-link" href="${item.href}"${raw(active ? ' aria-current="page"' : "")}${menuMark(s, item.label)}>${item.label}</a></li>`;
    }
    const subId = `undermeny-${item.id}`;
    return html`<li class="nav-item has-sub" data-sub>
      <a class="nav-link${active ? " is-active" : ""}" href="${item.href}"${menuMark(s, item.label)}>${item.label}</a>
      <button class="sub-toggle" type="button" aria-expanded="false" aria-controls="${subId}">
        ${icon("chevronDown", "icon icon-sm")}<span class="sr-only">Visa undermeny för ${item.label}</span>
      </button>
      <ul class="sub-menu" id="${subId}">
        ${item.children.map(
          (ch) => html`<li><a href="${ch.href}"${raw(path === ch.href ? ' aria-current="page"' : "")}${menuMark(s, ch.label)}>${ch.label}</a></li>`,
        )}
      </ul>
    </li>`;
  });

  return html`<header class="site-header" data-header>
    <div class="container header-inner">
      ${logo(s)}
      <nav class="main-nav" id="huvudmeny" aria-label="Huvudmeny" data-nav>
        <form class="nav-search" action="/sok" method="get" role="search">
          <label class="sr-only" for="meny-sok">${s.search_label}</label>
          <input type="search" id="meny-sok" name="q" placeholder="${s.search_placeholder}" autocomplete="off">
          <button class="nav-search-btn" type="submit">${icon("search", "icon icon-sm")}<span class="sr-only">${s.search_label}</span></button>
        </form>
        <ul class="nav-list">${items}</ul>
        <div class="nav-mobile-cta">${joinButton(s, { className: "btn btn-primary btn-block" })}</div>
      </nav>
      <div class="header-actions">
        <a class="search-toggle${path === "/sok" ? " is-active" : ""}" href="/sok"${ek(s, "search_label")}>${icon("search")}<span class="sr-only">${s.search_label}</span></a>
        ${joinButton(s, { className: "btn btn-primary btn-sm header-cta" })}
        <a class="menu-toggle" href="#sidkarta" data-menu-toggle aria-controls="huvudmeny" data-label-open="${s.menu_label}" data-label-close="${s.menu_close}">
          <span class="menu-icon-open">${icon("menu")}</span><span class="menu-icon-close">${icon("close")}</span>
          <span class="menu-label"${ek(s, "menu_label")}>${s.menu_label}</span>
        </a>
      </div>
    </div>
  </header>`;
}

function footer(s: Settings): SafeHtml {
  const year = new Date().getUTCFullYear();
  const menu = visibleMenu(s);
  const cols = menu.filter((n) => n.children).map(
    (n) => html`<div class="footer-col">
      <h2 class="footer-heading"${menuMark(s, n.label)}>${n.label}</h2>
      <ul>${n.children!.map((ch) => html`<li><a href="${ch.href}"${menuMark(s, ch.label)}>${ch.label}</a></li>`)}</ul>
    </div>`,
  );
  const leaves = menu.filter((n) => !n.children);
  return html`<footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          ${logo(s, "footer")}
          <p class="footer-text"${ek(s, "footer_text")}>${s.footer_text}</p>
          ${joinButton(s)}
        </div>
        <div class="footer-contact">
          <h2 class="footer-heading"${ek(s, "footer_contact_title")}>${s.footer_contact_title}</h2>
          <address>
            <p class="contact-row"${ek(s, "address_street")}>${icon("pin", "icon icon-sm")}<span>${s.address_street}<br>${s.address_city}</span></p>
            <p class="contact-row"${ek(s, "contact_email")}>${icon("mail", "icon icon-sm")}<a href="mailto:${s.contact_email}">${s.contact_email}</a></p>
            ${s.contact_phone ? html`<p class="contact-row"${ek(s, "contact_phone")}>${icon("phone", "icon icon-sm")}<a href="${telHref(s.contact_phone)}">${s.contact_phone}</a></p>` : ""}
            <p class="contact-row"${ek(s, "instagram_handle")}>${icon("instagram", "icon icon-sm")}<a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a></p>
          </address>
        </div>
      </div>
      <nav class="footer-sitemap" id="sidkarta" aria-label="Sidkarta">
        ${cols}
        <div class="footer-col">
          <h2 class="footer-heading"${ek(s, "footer_more_title")}>${s.footer_more_title}</h2>
          <ul>
            ${leaves.map((l) => html`<li><a href="${l.href}"${menuMark(s, l.label)}>${l.label}</a></li>`)}
            <li><a href="/sok"${ek(s, "search_label")}>${s.search_label}</a></li>
          </ul>
        </div>
      </nav>
      <div class="footer-bottom">
        <p${ek(s, "site_name")}>© ${year} ${s.site_name}${s.org_number ? ` · ${s.footer_orgnr} ${s.org_number}` : ""}</p>
        <ul class="footer-legal">
          <li><a href="/integritetspolicy"${ek(s, "footer_privacy")}>${s.footer_privacy}</a></li>
          <li><a href="/cookies"${ek(s, "footer_cookies")}>${s.footer_cookies}</a></li>
          <li><a class="footer-login" href="/admin" rel="nofollow"${ek(s, "footer_login")}>${icon("lock", "icon icon-sm")}${s.footer_login}</a></li>
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
  const fullTitle = isHome ? `${s.site_name} – ${s.site_short_name}` : `${meta.title} | ${s.site_short_name}`;
  const description = meta.description ?? s.site_description;
  const ogImage = meta.ogImage ? (meta.ogImage.startsWith("http") ? meta.ogImage : site + meta.ogImage) : `${site}/assets/og-image.png`;

  const ld = (meta.jsonLd ?? []).map(
    // JSON i <script> – escapa "<" så att ingen sträng kan avsluta script-taggen.
    (obj) => raw(`<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`),
  );
  // Rörelse (Utseende → Rörelse). I adminpanelens förhandsvisning visas allt direkt, så att det går att klicka på texterna.
  const motion = c.preview || c.editMap ? "av" : motionLevel(s);
  // Mjuka sidbyten (View Transitions) går inte att slå av med en klass, så regeln skickas bara med när rörelse är på.
  const transitions = motion === "av" ? "" : "@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}";
  // Introt (Utseende → Rörelse): bara på startsidan, aldrig i förhandsvisningen och inte när rörelse är av.
  const intro = isHome && motion !== "av" && s.intro_enabled !== "av";
  const bodyClass = [c.preview ? "is-preview" : "", c.editMap ? "is-editmap" : "", meta.overlayHeader ? "has-overlay-header" : ""].filter(Boolean).join(" ");

  const doc = html`<!doctype html>
<html lang="sv" data-motion="${motion}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
${meta.noindex || c.preview ? raw('<meta name="robots" content="noindex, nofollow">') : ""}
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
${favicon(s)}
<link rel="alternate" type="text/calendar" title="${s.site_short_name} – kalender" href="/kalender.ics">
<link rel="preload" href="/assets/fonts/montserrat.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${HEADING_FONTS[headingFont(s)].file}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}">
<style nonce="${c.nonce}">${raw(themeCss(s) + blockColorCss(s) + imageFitCss(imageFits(s)) + textStyleCss(siteLayout(s).styles) + transitions)}</style>
${intro ? html`<script src="/assets/intro-check.js?v=${ASSET_VERSION}"></script><script src="/assets/intro.js?v=${ASSET_VERSION}" defer></script>` : ""}
<script src="/assets/site.js?v=${ASSET_VERSION}" defer></script>
${motion === "av" ? "" : html`<script src="/assets/motion.js?v=${ASSET_VERSION}" defer></script>`}
${ld}
</head>
<body${bodyClass ? html` class="${bodyClass}"` : ""}>
${intro ? html`<div class="intro" data-intro="/assets/intro-logo.svg?v=${ASSET_VERSION}" data-style="${introStyle(s)}" aria-hidden="true"></div>` : ""}
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
