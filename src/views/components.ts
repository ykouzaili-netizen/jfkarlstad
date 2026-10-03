import { html, type SafeHtml } from "../lib/html.js";
import { eventDate, formatDate, isoDate, truncate } from "../lib/format.js";
import type { EventRow, NewsRow, PartnerRow } from "../lib/content.js";
import { icon } from "./icons.js";
import { mediaUrl } from "./layout.js";

export function arrowLink(href: string, label: string, className = "arrow-link"): SafeHtml {
  return html`<a class="${className}" href="${href}">${label}${icon("arrowRight", "icon icon-sm")}</a>`;
}

export function sectionHead(opts: { title: string; id?: string; lead?: string; link?: { href: string; label: string } }): SafeHtml {
  return html`<div class="section-head">
    <div>
      <h2 class="section-title"${opts.id ? html` id="${opts.id}"` : ""}>${opts.title}</h2>
      ${opts.lead ? html`<p class="section-lead">${opts.lead}</p>` : ""}
    </div>
    ${opts.link ? arrowLink(opts.link.href, opts.link.label, "arrow-link section-link") : ""}
  </div>`;
}

export function eventCard(e: EventRow, headingLevel: 2 | 3 = 3): SafeHtml {
  const d = eventDate(e.starts_at, e.ends_at);
  const heading = html`<a class="card-link" href="/kalender/${e.slug}">${e.title}</a>`;
  return html`<article class="card event-card">
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
      ${e.members_only ? html`<span class="tag">Endast medlemmar</span>` : ""}
    </div>
  </article>`;
}

export function newsCard(n: NewsRow, headingLevel: 2 | 3 = 3): SafeHtml {
  const img = mediaUrl(n.image_key);
  const heading = html`<a class="card-link" href="/aktuellt/${n.slug}">${n.title}</a>`;
  return html`<article class="card news-card">
    <div class="news-media${img ? "" : " news-media-empty"}">
      ${img
        ? html`<img src="${img}" alt="${n.image_alt}" loading="lazy" decoding="async" width="640" height="400">`
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
  const src = mediaUrl(p.logo_key);
  return src
    ? html`<img class="partner-logo partner-logo-${size}" src="${src}" alt="${p.name}" loading="lazy" decoding="async">`
    : html`<span class="partner-wordmark partner-wordmark-${size}">${p.name}</span>`;
}

export function emptyState(text: SafeHtml | string): SafeHtml {
  return html`<div class="empty-state"><p>${text}</p></div>`;
}
