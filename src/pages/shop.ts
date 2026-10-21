import { html, raw, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, loadSettings, type Settings } from "../lib/settings.js";
import { renderMarkdown } from "../lib/markdown.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import { luminance } from "../lib/color.js";
import { stockholmNow } from "../lib/format.js";
import {
  dropDay,
  findProduct,
  garmentSvg,
  kr,
  loadShop,
  logoSpot,
  parseColors,
  parseSizes,
  productImages,
  type DropRow,
  type ProductRow,
  type ShopData,
} from "../lib/shop.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl, picture } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { notFoundPage } from "./errors.js";

/**
 * JFK Butik: /butik (alla produkter), /butik/:slug (en produkt) och /butik/varukorg.
 *
 * - Utseendet ("Ett plagg i taget"): varje utvald produkt får ett eget avsnitt som växlar mellan primärfärgen,
 *   accentfärgen och bakgrunden; övriga produkter visas som kort under "Också i butiken". Allt följer Utseende.
 * - Medan ett släpp pågår visas släppets produkter först. Annars visas sortimentet och en rad om nästa släpp.
 * - Varukorgen finns i webbläsaren (public/assets/butik.js, localStorage). Betalningen och beställningen till
 *   leverantören kopplas på när leverantören är vald – fram till dess säger kassan det (shop_checkout_soon).
 * - Fungerar utan JavaScript: knapparna leder då till produktens sida, där samma information finns.
 */

const ASSETS = { css: ["butik.css"], js: ["butik.js"] };

/** Logotyperna på de tecknade plaggen: ljus logotyp på mörkt tyg, mörk på ljust. */
const LOGO_DARK = "/assets/tavling/jfk-logotyp-liten.webp";
const LOGO_LIGHT = "/assets/tavling/jfk-logotyp-ljus-liten.webp";

const nr = (i: number) => String(i + 1).padStart(2, "0");

/** Plaggets färg och färgrutorna – som CSS i en style-tagg med nonce (inga style-attribut, se CSP). */
function shopCss(c: RequestContext, products: ProductRow[]): SafeHtml {
  const rules = products
    .map((p) => {
      const colors = parseColors(p.colors);
      const first = colors[0]?.hex ?? "#ece4d0";
      return [`.shop-p-${p.id}{--g:${first}}`, ...colors.map((col, i) => `.shop-sw-${p.id}-${i}{--sw:${col.hex}}`)].join("");
    })
    .join("");
  return html`<style nonce="${c.nonce}">${raw(rules)}</style>`;
}

/** Bilden av produkten: foto om det finns, annars den tecknade bilden med logotypen. */
function productMedia(p: ProductRow, opts: { sizes: string; eager?: boolean; large?: boolean }): SafeHtml {
  const images = productImages(p);
  if (images[0]) {
    return picture(images[0].key, { alt: images[0].alt, sizes: opts.sizes, width: 900, height: 1000, eager: opts.eager, className: "shop-photo" });
  }
  const hex = parseColors(p.colors)[0]?.hex ?? "#ece4d0";
  const dark = luminance(hex) < 0.35;
  const logo = p.garment === "mossa" ? "" : html`<img class="shop-logo ${logoSpot(p.garment)}" src="${p.garment === "marke" || dark ? LOGO_LIGHT : LOGO_DARK}" alt="" width="120" height="121" loading="lazy" decoding="async"${p.garment === "marke" ? "" : html` data-logo-dark="${LOGO_DARK}" data-logo-light="${LOGO_LIGHT}"`}>`;
  return html`<span class="shop-drawing shop-p-${p.id}${dark && p.garment !== "marke" ? " is-dark" : ""}" role="img" aria-label="${p.name} (teckning – foto kommer)" data-shop-drawing="${String(p.id)}">${garmentSvg(p.garment)}${logo}</span>`;
}

function labelFor(s: Settings, p: ProductRow, index: number, drop: DropRow | null): SafeHtml {
  const text = p.kind === "slapp" && drop ? fill(s.shop_label_drop, { nr: nr(index), slapp: drop.label || drop.title }) : fill(s.shop_label_always, { nr: nr(index) });
  return html`<p class="shop-label"${ek(s, p.kind === "slapp" ? "shop_label_drop" : "shop_label_always")}>${text}</p>`;
}

/** Datum och minsta antal för ett släpp, eller leveranstiden för sortimentet. */
function deliveryBox(s: Settings, p: ProductRow, drop: DropRow | null): SafeHtml {
  if (p.kind === "slapp" && drop) {
    const rows = [
      html`<strong${ek(s, "shop_deadline")}>${fill(s.shop_deadline, { datum: dropDay(drop.ends_at) })}</strong>`,
      drop.min_qty ? html`<span${ek(s, "shop_min")}>${fill(s.shop_min, { antal: String(drop.min_qty) })}</span>` : "",
      drop.delivery_note ? html`<span>${drop.delivery_note}</span>` : "",
    ];
    return html`<div class="shop-when">${icon("clock", "icon")}<p>${rows.filter(Boolean).map((l, i) => html`${i ? html`<br>` : ""}${l}`)}</p></div>`;
  }
  return html`<p class="shop-ships"${ek(s, "shop_ships")}>${s.shop_ships}</p>`;
}

/** Färg, storlek och "Lägg i korgen". Utan JavaScript leder knappen till produktens sida. */
function buyForm(s: Settings, p: ProductRow, drop: DropRow | null, opts: { more: boolean }): SafeHtml {
  const colors = parseColors(p.colors);
  const sizes = parseSizes(p.sizes);
  const soldOut = new Set(parseSizes(p.sold_out).map((x) => x.toLowerCase()));
  const group = p.kind === "slapp" && drop ? `slapp-${drop.id}` : "alltid";
  const groupLabel = p.kind === "slapp" && drop ? drop.label || drop.title : "";
  const colorField =
    colors.length > 1
      ? html`<fieldset class="shop-field">
          <legend${ek(s, "shop_color")}>${s.shop_color}: <span class="shop-chosen" data-shop-chosen>${colors[0]!.name}</span></legend>
          <div class="shop-swatches">
            ${colors.map(
              (col, i) => html`<label class="shop-swatch shop-sw-${p.id}-${i}">
                <input type="radio" name="farg" value="${col.name}" data-hex="${col.hex}"${i === 0 ? " checked" : ""}>
                <span class="sr-only">${col.name}</span>
              </label>`,
            )}
          </div>
        </fieldset>`
      : colors.length === 1
        ? html`<input type="hidden" name="farg" value="${colors[0]!.name}">`
        : "";
  const sizeField = sizes.length
    ? html`<fieldset class="shop-field">
        <legend><span${ek(s, "shop_size")}>${s.shop_size}</span>${opts.more ? html` <a class="shop-size-help" href="/butik/${p.slug}#matt"${ek(s, "shop_size_help")}>${s.shop_size_help}</a>` : ""}</legend>
        <div class="shop-sizes">
          ${sizes.map((size) => {
            const out = soldOut.has(size.toLowerCase());
            return html`<label class="shop-size${out ? " is-out" : ""}">
              <input type="radio" name="storlek" value="${size}"${out ? " disabled" : ""}>
              <span>${size}</span>${out ? html`<span class="sr-only">, ${s.shop_sold_out}</span>` : ""}
            </label>`;
          })}
        </div>
      </fieldset>`
    : "";
  return html`<form class="shop-buy" action="/butik/${p.slug}" method="get" data-shop-buy data-id="${String(p.id)}" data-name="${p.name}" data-price="${String(p.price)}" data-group="${group}" data-group-label="${groupLabel}" data-needs-size="${sizes.length ? "1" : ""}">
    ${colorField}
    ${sizeField}
    <div class="shop-buy-row">
      <button class="btn btn-primary btn-lg shop-add" type="submit" data-label="${s.shop_add} · ${kr(p.price)}" data-choose="${s.shop_choose}"><span${ek(s, "shop_add")}>${s.shop_add}</span> · ${kr(p.price)}</button>
      ${opts.more ? html`<a class="shop-more" href="/butik/${p.slug}"${ek(s, "shop_more")}>${s.shop_more}${icon("arrowRight", "icon icon-sm")}</a>` : ""}
    </div>
  </form>`;
}

function designerLine(s: Settings, p: ProductRow): SafeHtml | "" {
  if (!p.designer) return "";
  return html`<p class="shop-designer"${ek(s, "shop_designer")}>${fill(s.shop_designer, { namn: p.designer, program: p.designer_program ? `, ${p.designer_program}` : "" })}</p>`;
}

const TONES = ["dark", "accent", "light", "surface"] as const;

/** Ett utvalt plagg med eget avsnitt. */
function feature(s: Settings, p: ProductRow, index: number, tone: (typeof TONES)[number], drop: DropRow | null, first: boolean): SafeHtml {
  return html`<section class="shop-feature shop-tone-${tone}" id="p-${p.slug}" aria-labelledby="h-${p.slug}"${ec(s, `/admin/butik/${p.id}`, `Butik › ${p.name}`)}>
    <div class="container shop-feature-inner">
      <a class="shop-feature-media" href="/butik/${p.slug}" tabindex="-1" aria-hidden="true">${productMedia(p, { sizes: "(min-width: 900px) 46vw, 100vw", eager: first })}</a>
      <div class="shop-feature-body">
        ${labelFor(s, p, index, drop)}
        <h2 class="shop-name" id="h-${p.slug}"><a href="/butik/${p.slug}">${p.name}</a></h2>
        ${p.summary ? html`<p class="shop-summary">${p.summary}</p>` : ""}
        ${designerLine(s, p)}
        ${deliveryBox(s, p, drop)}
        ${buyForm(s, p, drop, { more: true })}
      </div>
    </div>
  </section>`;
}

/** Ett litet kort (Också i butiken och tidigare släpp). */
function card(s: Settings, p: ProductRow, index: number | null, note?: string): SafeHtml {
  return html`<li class="shop-card"${ec(s, `/admin/butik/${p.id}`, `Butik › ${p.name}`)}>
    <a href="/butik/${p.slug}">
      <span class="shop-card-media">${productMedia(p, { sizes: "(min-width: 900px) 22vw, 45vw" })}</span>
      ${index !== null ? html`<span class="shop-card-nr">Nº ${nr(index)}</span>` : ""}
      <span class="shop-card-name">${p.name}</span>
      <span class="shop-card-price">${note ?? kr(p.price)}</span>
    </a>
  </li>`;
}

function shopBar(s: Settings, links: { href: string; label: string }[], opts: { heading: boolean }): SafeHtml {
  const title = html`<span${ek(s, "shop_title")}>${s.shop_title}</span>`;
  return html`<div class="shop-bar">
    <div class="container shop-bar-inner">
      ${opts.heading ? html`<h1 class="shop-bar-title">${title}</h1>` : html`<a class="shop-bar-title" href="/butik">${title}</a>`}
      ${links.length ? html`<nav class="shop-chips" aria-label="Genvägar i butiken">${links.map((l) => html`<a class="shop-chip" href="${l.href}">${l.label}</a>`)}</nav>` : ""}
      <a class="shop-cart-link" href="/butik/varukorg">${icon("bag", "icon icon-sm")}<span${ek(s, "shop_cart")}>${s.shop_cart}</span><span class="shop-count" data-shop-count hidden></span></a>
    </div>
  </div>`;
}

const toast = (s: Settings) => html`<div class="shop-toast" data-shop-toast role="status" aria-live="polite" hidden>
  <span class="shop-toast-check">${icon("check", "icon icon-sm")}</span>
  <span class="shop-toast-text"><strong>${s.shop_added}</strong><span data-shop-toast-item></span></span>
  <a class="btn btn-sm shop-toast-btn" href="/butik/varukorg">${s.shop_to_cart}</a>
</div>`;

function whySection(s: Settings): SafeHtml {
  const points = lines(s.shop_why_points);
  return html`<section class="shop-why" aria-labelledby="shop-why-title">
    <div class="container shop-why-inner">
      <div>
        <p class="shop-label" id="shop-why-title"${ek(s, "shop_why_kicker")}>${s.shop_why_kicker}</p>
        <p class="shop-why-text"${ek(s, "shop_why_text")}>${s.shop_why_text}</p>
        ${points.length ? html`<ul class="shop-why-points"${ek(s, "shop_why_points")}>${points.map((pt) => html`<li>${pt}</li>`)}</ul>` : ""}
      </div>
      <p class="shop-zero"><span class="shop-zero-amount">0 kr</span> <span${ek(s, "shop_zero")}>${s.shop_zero}</span></p>
    </div>
  </section>`;
}

function termsLine(s: Settings): SafeHtml {
  const ask = s.shop_email ? `mailto:${s.shop_email}` : "/kontakt";
  return html`<div class="container shop-terms">
    <p${ek(s, "shop_terms_line")}>${fill(s.shop_terms_line, { leverantor: s.shop_supplier })}</p>
    <a href="${ask}"${ek(s, "shop_questions")}>${s.shop_questions}</a>
  </div>`;
}

function archiveSection(s: Settings, data: ShopData): SafeHtml | "" {
  if (!data.drops.length) return "";
  return html`<section class="shop-archive" id="arkiv" aria-labelledby="shop-archive-title">
    <div class="container">
      <h2 class="shop-section-title" id="shop-archive-title"${ek(s, "shop_archive_title")}>${s.shop_archive_title}</h2>
      ${data.past.length
        ? data.past.map((d) => {
            const items = data.products.filter((p) => p.drop_id === d.id);
            return html`<div class="shop-archive-drop">
              <p class="shop-archive-head"><strong>${d.label ? `${d.label} · ` : ""}${d.title}</strong> <span${ek(s, "shop_archive_closed")}>${fill(s.shop_archive_closed, { datum: dropDay(d.ends_at) })}</span></p>
              ${d.summary ? html`<p class="muted">${d.summary}</p>` : ""}
              ${items.length ? html`<ul class="shop-cards">${items.map((p) => card(s, p, null, ""))}</ul>` : ""}
            </div>`;
          })
        : html`<p class="shop-archive-empty"${ek(s, "shop_archive_empty")}>${s.shop_archive_empty}</p>`}
    </div>
  </section>`;
}

export async function shopPage(c: RequestContext): Promise<Response> {
  const now = stockholmNow();
  const [s, data] = await Promise.all([loadSettings(c.env.DB, c.preview), loadShop(c.env.DB, now)]);
  const live = data.live;
  let features = live.filter((p) => p.kind === "slapp" || p.featured);
  if (!features.length) features = live.slice(0, 1);
  const rest = live.filter((p) => !features.includes(p));
  const dropOf = (p: ProductRow) => (p.kind === "slapp" ? data.drops.find((d) => d.id === p.drop_id) ?? null : null);
  const indexOf = (p: ProductRow) => live.indexOf(p);

  const links = [
    ...features.map((p) => ({ href: `#p-${p.slug}`, label: p.name })),
    ...(rest.length ? [{ href: "#allt", label: s.shop_nav_all }] : []),
    ...(data.past.length ? [{ href: "#arkiv", label: s.shop_nav_archive }] : []),
  ];

  // Raden om nästa släpp – bara när inget släpp pågår.
  let nextLine: SafeHtml | "" = "";
  if (!data.current) {
    if (data.next) nextLine = html`<p class="shop-next"><span${ek(s, "shop_next_date")}>${fill(s.shop_next_date, { datum: dropDay(data.next.starts_at, now) })}</span></p>`;
    else if (s.shop_next_month.trim()) nextLine = html`<p class="shop-next"><strong${ek(s, "shop_next_title")}>${s.shop_next_title}:</strong> <span${ek(s, "shop_next_month")}>${s.shop_next_month}</span></p>`;
  }

  const body = live.length
    ? html`${features.map((p, i) => feature(s, p, indexOf(p), TONES[i % TONES.length]!, dropOf(p), i === 0))}
      ${rest.length
        ? html`<section class="shop-rest" id="allt" aria-labelledby="shop-rest-title">
            <div class="container">
              <h2 class="shop-section-title" id="shop-rest-title"${ek(s, "shop_also")}>${s.shop_also}</h2>
              <ul class="shop-cards">${rest.map((p) => card(s, p, indexOf(p)))}</ul>
            </div>
          </section>`
        : ""}`
    : html`<div class="container shop-empty"><p${ek(s, "shop_empty")}>${s.shop_empty}</p></div>`;

  const content = html`<div class="jfk-butik">
    ${shopCss(c, data.products)}
    ${shopBar(s, links, { heading: true })}
    ${nextLine ? html`<div class="shop-next-band"><div class="container">${nextLine}</div></div>` : ""}
    ${body}
    ${whySection(s)}
    ${archiveSection(s, data)}
    ${termsLine(s)}
    ${toast(s)}
  </div>`;
  return htmlResponse(c, layout(c, s, { title: s.shop_title, description: s.shop_lead, pageId: "butik", assets: ASSETS }, content));
}

export async function shopProductPage(c: RequestContext): Promise<Response> {
  const now = stockholmNow();
  const [s, data] = await Promise.all([loadSettings(c.env.DB, c.preview), loadShop(c.env.DB, now)]);
  const hit = findProduct(data, c.params.slug ?? "", now);
  if (!hit) return notFoundPage(c);
  const { product: p, drop, orderable } = hit;
  const index = Math.max(0, data.live.indexOf(p));
  const images = productImages(p);
  const sizes = parseSizes(p.sizes);

  // Bilderna öppnas i helbild (bildrutan nedan, butik.js). Utan JS öppnas bilden som en vanlig länk.
  const zoom = (i: number, inner: SafeHtml, cls: string) => {
    const im = images[i]!;
    return html`<a class="${cls}" href="${mediaUrl(im.key)}" data-shop-lb-item data-caption="${im.caption}" aria-label="${fill(s.shop_zoom, { nr: String(i + 1), antal: String(images.length) })}">${inner}</a>`;
  };
  const mainMedia = images.length
    ? zoom(
        0,
        html`${picture(images[0]!.key, { alt: images[0]!.alt, sizes: "(min-width: 900px) 46vw, 100vw", width: 900, height: 1000, eager: true, className: "shop-photo" })}<span class="shop-zoom-badge" aria-hidden="true">${icon("expand", "icon icon-sm")}<span${ek(s, "shop_zoom_hint")}>${images.length > 1 ? `1 / ${images.length}` : s.shop_zoom_hint}</span></span>`,
        "shop-feature-media shop-zoom",
      )
    : html`<div class="shop-feature-media">${productMedia(p, { sizes: "(min-width: 900px) 46vw, 100vw", eager: true })}</div>`;
  const gallery = images.length > 1
    ? html`<ul class="shop-gallery-thumbs${images.length > 4 ? " is-many" : ""}">${images.slice(1).map(
        (im, k) => html`<li><figure>${zoom(k + 1, picture(im.key, { alt: im.alt, sizes: "(min-width: 900px) 12vw, 30vw", width: 400, height: 440 }), "shop-zoom")}${im.caption ? html`<figcaption>${im.caption}</figcaption>` : ""}</figure></li>`,
      )}</ul>`
    : "";
  const lightbox = images.length
    ? html`<dialog class="gal-lb shop-lb" data-shop-lb aria-label="${fill(s.gallery_lb_count, { nr: "1", antal: String(images.length) })}" data-count="${s.gallery_lb_count}">
        <div class="gal-lb-inner" data-shop-lb-inner>
          <div class="gal-lb-bar">
            <p class="gal-lb-count"><span data-shop-lb-count aria-live="polite"></span></p>
            <div class="gal-lb-actions">
              <button class="gal-lb-btn gal-lb-fs" type="button" data-shop-lb-fs hidden aria-pressed="false" data-enter="${s.gallery_lb_fullscreen}" data-exit="${s.gallery_lb_fullscreen_exit}" title="${s.gallery_lb_fullscreen}">${icon("expand", "icon icon-sm gal-lb-i-expand")}${icon("shrink", "icon icon-sm gal-lb-i-shrink")}<span data-shop-lb-fs-label>${s.gallery_lb_fullscreen}</span></button>
              <button class="gal-lb-close" type="button" data-shop-lb-close autofocus aria-label="${s.gallery_lb_close}">${icon("close", "icon")}</button>
            </div>
          </div>
          <figure class="gal-lb-stage">
            <img class="gal-lb-img" alt="" data-shop-lb-img>
            <figcaption class="gal-lb-caption" data-shop-lb-caption hidden></figcaption>
          </figure>
          <button class="gal-lb-nav gal-lb-prev" type="button" data-shop-lb-step="-1" aria-label="${s.gallery_lb_prev}">${icon("chevronLeft", "icon")}</button>
          <button class="gal-lb-nav gal-lb-next" type="button" data-shop-lb-step="1" aria-label="${s.gallery_lb_next}">${icon("chevronRight", "icon")}</button>
        </div>
      </dialog>`
    : "";

  const closedNote = drop && !orderable ? html`<p class="shop-closed">${fill(s.shop_archive_closed, { datum: dropDay(drop.ends_at, now) })}</p>` : "";

  const design = p.designer || p.designer_quote || p.sketch_key
    ? html`<section class="shop-design shop-tone-accent" aria-labelledby="shop-design-title">
        <div class="container shop-design-inner">
          <div>
            <h2 class="shop-label" id="shop-design-title"${ek(s, "shop_about_design")}>${s.shop_about_design}</h2>
            ${p.designer_quote ? html`<blockquote class="shop-quote"><p>”${p.designer_quote}”</p>${p.designer ? html`<footer>${p.designer}${p.designer_program ? `, ${p.designer_program}` : ""}</footer>` : ""}</blockquote>` : designerLine(s, p)}
          </div>
          ${p.sketch_key
            ? html`<figure class="shop-sketch">
                <span class="shop-sketch-pair">${picture(p.sketch_key, { alt: `Skissen till ${p.name}`, sizes: "(min-width: 900px) 20vw, 45vw", width: 400, height: 400 })}${icon("arrowRight", "icon")}<span class="shop-sketch-final">${productMedia(p, { sizes: "(min-width: 900px) 20vw, 45vw" })}</span></span>
              </figure>`
            : ""}
        </div>
      </section>`
    : "";

  const details = [
    p.description ? html`<div class="prose shop-description">${renderMarkdown(p.description)}</div>` : "",
    html`<div class="shop-details">
      ${sizes.length ? html`<details id="matt"${p.model_note ? " open" : ""}><summary${ek(s, "shop_size_help")}>${s.shop_size_help}</summary>${p.model_note ? html`<p>${p.model_note}</p>` : ""}<p class="muted">${sizes.join(" · ")}</p></details>` : ""}
      ${p.material ? html`<details><summary${ek(s, "shop_material_title")}>${s.shop_material_title}</summary><p>${p.material}</p></details>` : ""}
      ${p.care ? html`<details><summary${ek(s, "shop_care_title")}>${s.shop_care_title}</summary><p>${p.care}</p></details>` : ""}
      <details><summary${ek(s, "shop_delivery_title")}>${s.shop_delivery_title}</summary><div class="prose"${ek(s, "shop_delivery_text")}>${renderMarkdown(fill(s.shop_delivery_text, { leverantor: s.shop_supplier }))}</div></details>
    </div>`,
  ];

  const content = html`<div class="jfk-butik">
    ${shopCss(c, data.products)}
    ${shopBar(s, [], { heading: false })}
    <section class="shop-product shop-tone-dark" aria-labelledby="h-${p.slug}"${ec(s, `/admin/butik/${p.id}`, `Butik › ${p.name}`)}>
      <div class="container shop-feature-inner">
        <div class="shop-product-gallery">
          ${mainMedia}
          ${gallery}
        </div>
        <div class="shop-feature-body">
          <a class="shop-back" href="/butik">${icon("arrowLeft", "icon icon-sm")}<span${ek(s, "shop_back")}>${s.shop_back}</span></a>
          ${labelFor(s, p, index, drop)}
          <h1 class="shop-name" id="h-${p.slug}">${p.name}</h1>
          <p class="shop-price">${kr(p.price)}</p>
          ${p.summary ? html`<p class="shop-summary">${p.summary}</p>` : ""}
          ${orderable ? html`${deliveryBox(s, p, drop)}${buyForm(s, p, drop, { more: false })}` : closedNote}
          ${p.model_note ? html`<p class="shop-model">${p.model_note}</p>` : ""}
        </div>
      </div>
    </section>
    ${design}
    <section class="shop-info"><div class="container shop-info-inner">${details}</div></section>
    ${whySection(s)}
    ${termsLine(s)}
    ${toast(s)}
    ${lightbox}
  </div>`;
  const ogImage = images[0] ? `/media/${encodeURI(images[0].key)}` : undefined;
  return htmlResponse(c, layout(c, s, { title: `${p.name} – ${s.shop_title}`, description: p.summary || s.shop_lead, pageId: "butik", assets: ASSETS, ogImage }, content));
}

/** Varukorgen. Innehållet ritas av butik.js från webbläsarens sparade korg och produkterna nedan (som kontroll). */
export async function shopCartPage(c: RequestContext): Promise<Response> {
  const now = stockholmNow();
  const [s, data] = await Promise.all([loadSettings(c.env.DB, c.preview), loadShop(c.env.DB, now)]);
  const catalog = data.live.map((p) => {
    const drop = p.kind === "slapp" ? data.drops.find((d) => d.id === p.drop_id) : null;
    return { id: p.id, name: p.name, slug: p.slug, price: p.price, group: drop ? `slapp-${drop.id}` : "alltid", groupLabel: drop ? drop.label || drop.title : "" };
  });
  const texts = {
    groupDrop: s.shop_cart_group_drop,
    groupAlways: s.shop_cart_group_always,
    remove: s.shop_cart_remove,
    total: s.shop_cart_total,
    color: s.shop_color,
    size: s.shop_size,
  };
  // JSON i en datatagg (körs aldrig). "<" escapas så att ingen sträng kan avsluta taggen.
  const json = JSON.stringify({ catalog, texts }).replace(/</g, "\\u003c");
  const content = html`<div class="jfk-butik">
    ${shopBar(s, [], { heading: false })}
    <section class="shop-cart-page">
      <div class="container shop-cart-inner">
        <h1 class="shop-cart-title"${ek(s, "shop_cart_title")}>${s.shop_cart_title}</h1>
        <div class="shop-cart-list" data-shop-cart aria-live="polite">
          <p class="shop-cart-empty" data-shop-cart-empty${ek(s, "shop_cart_empty")}>${s.shop_cart_empty}</p>
        </div>
        <noscript><p class="shop-notice">Varukorgen behöver JavaScript. Slå på det i webbläsaren och ladda om sidan.</p></noscript>
        <div class="shop-cart-sum" data-shop-cart-sum hidden>
          <p><span${ek(s, "shop_cart_total")}>${s.shop_cart_total}</span> <strong data-shop-cart-total></strong></p>
          <p class="muted"${ek(s, "shop_cart_shipping")}>${s.shop_cart_shipping}</p>
        </div>
        <div class="shop-checkout-soon">
          ${icon("clock", "icon")}
          <p${ek(s, "shop_checkout_soon")}>${s.shop_checkout_soon}</p>
        </div>
        <a class="shop-more" href="/butik"${ek(s, "shop_cart_continue")}>${s.shop_cart_continue}${icon("arrowRight", "icon icon-sm")}</a>
      </div>
    </section>
    ${termsLine(s)}
    <script type="application/json" id="shop-data" nonce="${c.nonce}">${raw(json)}</script>
  </div>`;
  return htmlResponse(c, layout(c, s, { title: `${s.shop_cart_title} – ${s.shop_title}`, pageId: "butik", assets: ASSETS, noindex: true }, content));
}

