import { html, raw, type SafeHtml } from "../lib/html.js";
import { eventDate, formatDate, isoDate, truncate } from "../lib/format.js";
import type { EventRow, NewsRow, PartnerRow } from "../lib/content.js";
import { ec, ek, type SettingKey, type Settings } from "../lib/settings.js";
import { icon } from "./icons.js";
import { mediaUrl, picture } from "./layout.js";

export function arrowLink(href: string, label: string, className = "arrow-link", attrs?: SafeHtml): SafeHtml {
  return html`<a class="${className}" href="${href}"${attrs ?? ""}>${label}${icon("arrowRight", "icon icon-sm")}</a>`;
}

/** Rubrik (+ ingress och länk) för en sektion. Texterna kommer från textregistret. */
export function sectionHead(
  s: Settings,
  opts: { titleKey: SettingKey; id?: string; leadKey?: SettingKey; lead?: string; link?: { href: string; labelKey: SettingKey }; extra?: SafeHtml },
): SafeHtml {
  const lead = opts.leadKey ? s[opts.leadKey] : opts.lead;
  return html`<div class="section-head">
    <div>
      <h2 class="section-title"${opts.id ? html` id="${opts.id}"` : ""}${ek(s, opts.titleKey)}>${s[opts.titleKey]}</h2>
      ${lead ? html`<p class="section-lead"${opts.leadKey ? ek(s, opts.leadKey) : ""}>${lead}</p>` : ""}
    </div>
    ${opts.link ? arrowLink(opts.link.href, s[opts.link.labelKey], "arrow-link section-link", ek(s, opts.link.labelKey)) : ""}
    ${opts.extra ?? ""}
  </div>`;
}

export function eventCard(s: Settings, e: EventRow, headingLevel: 2 | 3 = 3): SafeHtml {
  const d = eventDate(e.starts_at, e.ends_at);
  const heading = html`<a class="card-link" href="/kalender/${e.slug}">${e.title}</a>`;
  return html`<article class="card event-card"${ec(s, `/admin/event/${e.id}`, `Event › ${e.title}`)}>
    ${d
      ? html`<time class="date-badge" datetime="${d.iso}">
          <span class="date-day">${d.day}</span><span class="date-month">${d.monthShort}</span>
        </time>`
      : ""}
    <div class="event-body">
      ${headingLevel === 2 ? html`<h2 class="card-title">${heading}</h2>` : html`<h3 class="card-title">${heading}</h3>`}
      <ul class="meta-list">
        ${d ? html`<li>${icon("clock", "icon icon-sm")}<span><span class="capitalize">${d.weekday}</span> ${d.time}</span></li>` : ""}
        ${e.location ? html`<li>${icon("pin", "icon icon-sm")}<span>${e.location}</span></li>` : ""}
      </ul>
      ${e.members_only ? html`<span class="tag">${s.members_tag}</span>` : ""}
    </div>
  </article>`;
}

export function newsCard(s: Settings, n: NewsRow, headingLevel: 2 | 3 = 3): SafeHtml {
  const heading = html`<a class="card-link" href="/aktuellt/${n.slug}">${n.title}</a>`;
  return html`<article class="card news-card"${ec(s, `/admin/nyheter/${n.id}`, `Nyhet › ${n.title}`)}>
    <div class="news-media${n.image_key ? "" : " news-media-empty"}">
      ${n.image_key
        ? picture(n.image_key, { alt: n.image_alt, sizes: "(min-width: 1020px) 380px, (min-width: 700px) 50vw, 100vw", width: 640, height: 400 })
        : html`<span class="news-media-mark" aria-hidden="true">§</span>`}
    </div>
    <div class="news-body">
      <time class="news-date" datetime="${isoDate(n.published_at)}">${formatDate(n.published_at)}</time>
      ${headingLevel === 2 ? html`<h2 class="card-title">${heading}</h2>` : html`<h3 class="card-title">${heading}</h3>`}
      <p class="news-excerpt">${truncate(n.excerpt || n.body, 150)}</p>
    </div>
  </article>`;
}

/** Partnerns logotyp – eller namnet satt typografiskt om ingen logotyp laddats upp. */
export function partnerLogo(p: PartnerRow, size: "lg" | "sm" = "lg"): SafeHtml {
  const src = mediaUrl(p.logo_key, "sm");
  return src
    ? html`<img class="partner-logo partner-logo-${size}" src="${src}" alt="${p.name}" loading="lazy" decoding="async">`
    : html`<span class="partner-wordmark partner-wordmark-${size}">${p.name}</span>`;
}

/** Partnerkort (startsidan och partnersidan). */
export function partnerCard(s: Settings, p: PartnerRow): SafeHtml {
  const kickerKey = p.tier === "huvud" ? "partner_main_kicker" : "partner_kicker";
  return html`<li class="partner-card"${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}>
    <span class="partner-kicker"${ek(s, kickerKey)}>${s[kickerKey]}</span>
    <div class="partner-logo-wrap">${partnerLogo(p, "lg")}</div>
    <p class="partner-tagline">${p.tagline}</p>
    <a class="card-link arrow-link" href="/partners/${p.slug}">${s.read_more}<span class="sr-only"> om ${p.name}</span>${icon("arrowRight", "icon icon-sm")}</a>
  </li>`;
}

export function emptyState(text: SafeHtml | string, attrs?: SafeHtml): SafeHtml {
  return html`<div class="empty-state"${attrs ?? raw("")}><p>${text}</p></div>`;
}
