import { html, type SafeHtml } from "../lib/html.js";
import type { BoardRow } from "../lib/content.js";
import { icon } from "./icons.js";
import { mediaUrl } from "./layout.js";

/** Sidhuvud för undersidor: liten etikett, stor rubrik och ingress. */
export function pageHeader(opts: { kicker?: string; title: string; lead?: string; actions?: SafeHtml; nav?: { href: string; label: string }[] }): SafeHtml {
  return html`<section class="page-hero">
    <div class="container">
      ${opts.kicker ? html`<p class="page-kicker">${opts.kicker}</p>` : ""}
      <h1 class="page-title">${opts.title}</h1>
      ${opts.lead ? html`<p class="page-lead">${opts.lead}</p>` : ""}
      ${opts.actions ? html`<div class="page-actions">${opts.actions}</div>` : ""}
      ${opts.nav?.length
        ? html`<nav class="chip-nav" aria-label="På den här sidan">
            <ul>${opts.nav.map((n) => html`<li><a class="chip" href="${n.href}">${n.label}</a></li>`)}</ul>
          </nav>`
        : ""}
    </div>
  </section>`;
}

/** Initialer som ersättning när en person saknar foto. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function avatar(name: string, photoKey: string | null, size: "md" | "lg" = "lg"): SafeHtml {
  const src = mediaUrl(photoKey);
  return src
    ? html`<img class="avatar avatar-${size}" src="${src}" alt="" loading="lazy" decoding="async" width="160" height="160">`
    : html`<span class="avatar avatar-${size} avatar-initials" aria-hidden="true">${initials(name)}</span>`;
}

export function personCard(p: BoardRow): SafeHtml {
  return html`<li class="person-card">
    ${avatar(p.name, p.photo_key)}
    <div class="person-body">
      <h3 class="person-name">${p.name}</h3>
      <p class="person-role">${p.role}</p>
      ${p.email ? html`<a class="person-email" href="mailto:${p.email}">${icon("mail", "icon icon-sm")}<span>${p.email}</span></a>` : ""}
    </div>
  </li>`;
}

export function faqList(items: { question: string; answer: string }[], headingLevel: 2 | 3 = 3): SafeHtml {
  return html`<div class="faq-list">
    ${items.map(
      (f) => html`<details class="faq-item">
        <summary>${headingLevel === 2 ? html`<h2 class="faq-q">${f.question}</h2>` : html`<h3 class="faq-q">${f.question}</h3>`}<span class="faq-icon" aria-hidden="true"></span></summary>
        <div class="faq-a">${f.answer.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>
      </details>`,
    )}
  </div>`;
}

export function checkList(items: string[]): SafeHtml {
  return html`<ul class="check-list">${items.map((i) => html`<li><span class="check" aria-hidden="true"></span>${i}</li>`)}</ul>`;
}

export function breadcrumb(items: { href?: string; label: string }[]): SafeHtml {
  return html`<nav class="breadcrumb" aria-label="Brödsmulor">
    <ol>
      ${items.map((it, i) =>
        it.href && i < items.length - 1
          ? html`<li><a href="${it.href}">${it.label}</a></li>`
          : html`<li aria-current="page">${it.label}</li>`,
      )}
    </ol>
  </nav>`;
}
