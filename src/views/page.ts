import { html, type SafeHtml } from "../lib/html.js";
import type { BoardRow } from "../lib/content.js";
import { ec, ek, type SettingKey, type Settings } from "../lib/settings.js";
import { icon } from "./icons.js";
import { picture } from "./layout.js";

/** Sidhuvud för undersidor: liten etikett, stor rubrik och ingress – alla från textregistret. */
export function pageHeader(
  s: Settings,
  opts: { kickerKey?: SettingKey; titleKey: SettingKey; leadKey?: SettingKey; actions?: SafeHtml; nav?: { href: string; labelKey: SettingKey }[] },
): SafeHtml {
  const lead = opts.leadKey ? s[opts.leadKey] : "";
  return html`<section class="page-hero">
    <div class="container">
      ${opts.kickerKey ? html`<p class="page-kicker"${ek(s, opts.kickerKey)}>${s[opts.kickerKey]}</p>` : ""}
      <h1 class="page-title"${ek(s, opts.titleKey)}>${s[opts.titleKey]}</h1>
      ${lead ? html`<p class="page-lead"${ek(s, opts.leadKey!)}>${lead}</p>` : ""}
      ${opts.actions ? html`<div class="page-actions">${opts.actions}</div>` : ""}
      ${opts.nav?.length
        ? html`<nav class="chip-nav" aria-label="På den här sidan">
            <ul>${opts.nav.map((n) => html`<li><a class="chip" href="${n.href}">${s[n.labelKey]}</a></li>`)}</ul>
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
  return photoKey
    ? picture(photoKey, { alt: "", sizes: size === "lg" ? "88px" : "64px", className: `avatar avatar-${size}`, width: 160, height: 160 })
    : html`<span class="avatar avatar-${size} avatar-initials" aria-hidden="true">${initials(name)}</span>`;
}

/** Porträttkort för styrelsen. Utan foto visas initialerna. */
export function personCard(s: Settings, p: BoardRow): SafeHtml {
  return html`<li class="person-card${p.photo_key ? " has-photo" : ""}"${ec(s, `/admin/styrelsen/${p.id}`, `Styrelsen › ${p.name}`)}>
    <div class="person-photo">
      ${p.photo_key
        ? picture(p.photo_key, { alt: "", sizes: "(min-width: 1000px) 280px, (min-width: 600px) 33vw, 50vw", className: "person-img", width: 600, height: 750 })
        : html`<span class="person-initials" aria-hidden="true">${initials(p.name)}</span>`}
    </div>
    <div class="person-body">
      <h3 class="person-name">${p.name}</h3>
      <p class="person-role">${p.role}</p>
      ${p.email ? html`<a class="person-email" href="mailto:${p.email}">${icon("mail", "icon icon-sm")}<span>${p.email}</span></a>` : ""}
    </div>
  </li>`;
}

export function faqList(s: Settings, items: { id: number; question: string; answer: string }[], headingLevel: 2 | 3 = 3): SafeHtml {
  return html`<div class="faq-list">
    ${items.map(
      (f) => html`<details class="faq-item" id="fraga-${f.id}"${ec(s, `/admin/faq/${f.id}`, `Vanliga frågor › ${f.question}`)}>
        <summary>${headingLevel === 2 ? html`<h2 class="faq-q">${f.question}</h2>` : html`<h3 class="faq-q">${f.question}</h3>`}<span class="faq-icon" aria-hidden="true"></span></summary>
        <div class="faq-a">${f.answer.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>
      </details>`,
    )}
  </div>`;
}

export function checkList(items: string[], attrs?: SafeHtml): SafeHtml {
  return html`<ul class="check-list"${attrs ?? ""}>${items.map((i) => html`<li><span class="check" aria-hidden="true"></span>${i}</li>`)}</ul>`;
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
