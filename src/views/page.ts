import { html, type SafeHtml } from "../lib/html.js";
import type { BoardRow } from "../lib/content.js";
import { ec, ek, type SettingKey, type Settings } from "../lib/settings.js";
import { icon, type IconName } from "./icons.js";
import { picture } from "./layout.js";

/** Sidhuvud för undersidor: liten etikett, stor rubrik och ingress – alla från textregistret. */
export interface SectionNavItem {
  href: string;
  labelKey: SettingKey;
  icon?: IconName;
}

/**
 * Genvägarna till sidans avsnitt. Ligger kvar under sidhuvudet när man scrollar och markerar
 * avsnittet man läser (site.js). Utan JS är det vanliga ankarlänkar.
 */
export function sectionNav(s: Settings, items: SectionNavItem[]): SafeHtml {
  return html`<nav class="section-nav" aria-label="På den här sidan" data-section-nav>
    <div class="container">
      <ul>
        ${items.map(
          (n) => html`<li><a href="${n.href}"${ek(s, n.labelKey)}>${n.icon ? html`<span class="sn-icon" aria-hidden="true">${icon(n.icon, "icon icon-sm")}</span>` : ""}<span class="sn-label">${s[n.labelKey]}</span></a></li>`,
        )}
      </ul>
    </div>
  </nav>`;
}

/** Utseendena för sidornas topp. "enkel" = bara text, de andra har bilder (se CSS för .page-top--*). */
export const HERO_STYLES = ["enkel", "kollage", "bildband", "fotostapel", "helbild", "delad"] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

/** Giltigt utseende, annars `fallback`. */
export function heroStyle(value: string, fallback: HeroStyle): HeroStyle {
  return (HERO_STYLES as readonly string[]).includes(value) ? (value as HeroStyle) : fallback;
}

export interface HeroImage {
  key: string;
  alt: string;
  /** Inställningen bilden kommer från – för den klickbara kartan i adminpanelen. */
  setting: SettingKey;
}

/**
 * En ruta i toppens bildkomposition: en bild, eller en grafisk ruta i föreningens färger.
 * Ruta 1 är huvudbilden (hög i kollaget, hela ytan i Helbild).
 */
export function heroTile(s: Settings, n: 1 | 2 | 3, style: HeroStyle, img: HeroImage | null, fallback: SafeHtml): SafeHtml {
  const big = n === 1 && (style === "helbild" || style === "delad");
  const sizes = big ? (style === "helbild" ? "100vw" : "(min-width: 920px) 50vw, 100vw") : n === 1 ? "(min-width: 920px) 28vw, 60vw" : "(min-width: 920px) 22vw, 40vw";
  return html`<figure class="collage-tile collage-tile-${n}${img ? " has-image" : ""}"${img ? ek(s, img.setting) : ""}>
    ${img ? picture(img.key, { alt: img.alt, sizes, width: big ? 1600 : 800, height: big ? 1000 : n === 1 ? 1000 : 640, eager: true }) : fallback}
  </figure>`;
}

/** Grafiska rutor när en sida har färre än tre bilder. */
export const HERO_FALLBACKS: readonly SafeHtml[] = [
  html`<div class="collage-fallback collage-fallback-glyph" aria-hidden="true"><span>§</span></div>`,
  html`<div class="collage-fallback collage-fallback-dark collage-fallback-pattern" aria-hidden="true"></div>`,
  html`<div class="collage-fallback collage-fallback-light collage-fallback-pattern" aria-hidden="true"></div>`,
];

/** Toppen med bilder. `copy` är rubrik, ingress och knappar; `tiles` de tre rutorna från `heroTile()`. */
export function photoTop(opts: { style: HeroStyle; hasPhoto: boolean; copy: SafeHtml; tiles: SafeHtml[]; labelledBy?: string }): SafeHtml {
  return html`<section class="page-top page-top--${opts.style}${opts.hasPhoto ? " has-photo" : ""}"${opts.labelledBy ? html` aria-labelledby="${opts.labelledBy}"` : ""}>
    <div class="container page-top-grid">
      <div class="page-top-copy">${opts.copy}</div>
      <div class="collage">${opts.tiles}</div>
    </div>
  </section>`;
}

/**
 * Sidhuvud för undersidor: liten etikett, stor rubrik och ingress – alla från textregistret.
 * Med `hero` (sidans prefix i registret, t.ex. "member") väljer styrelsen utseende och bilder i adminpanelen:
 * `${hero}_hero_style` ("standard" följer Gemensamt → Sidornas topp) och `${hero}_image_1..3`.
 * Utan bilder visas alltid den enkla varianten med bara text.
 */
export function pageHeader(
  s: Settings,
  opts: { kickerKey?: SettingKey; titleKey: SettingKey; leadKey?: SettingKey; actions?: SafeHtml; nav?: SectionNavItem[]; hero?: string },
): SafeHtml {
  const lead = opts.leadKey ? s[opts.leadKey] : "";
  const copy = html`${opts.kickerKey ? html`<p class="page-kicker"${ek(s, opts.kickerKey)}>${s[opts.kickerKey]}</p>` : ""}
      <h1 class="page-title"${ek(s, opts.titleKey)}>${s[opts.titleKey]}</h1>
      ${lead ? html`<p class="page-lead"${ek(s, opts.leadKey!)}>${lead}</p>` : ""}
      ${opts.actions ? html`<div class="page-actions">${opts.actions}</div>` : ""}`;
  const nav = opts.nav?.length ? sectionNav(s, opts.nav) : "";

  if (opts.hero) {
    const get = (k: string) => (s as Record<string, string>)[k] ?? "";
    const chosen = get(`${opts.hero}_hero_style`);
    const style = chosen === "standard" || !chosen ? heroStyle(s.page_hero_default, "enkel") : heroStyle(chosen, "enkel");
    const images: HeroImage[] = ([1, 2, 3] as const)
      .map((n) => ({ key: get(`${opts.hero}_image_${n}`), alt: get(`${opts.hero}_image_${n}_alt`), setting: `${opts.hero}_image_${n}` as SettingKey }))
      .filter((img) => img.key);
    if (style !== "enkel" && images.length) {
      const tiles = ([1, 2, 3] as const).map((n, i) => heroTile(s, n, style, images[i] ?? null, HERO_FALLBACKS[i]!));
      return html`${photoTop({ style, hasPhoto: true, copy, tiles })}${nav}`;
    }
  }

  return html`<section class="page-hero">
    <div class="container">${copy}</div>
  </section>
  ${nav}`;
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

/**
 * En valfri bild i sidans innehåll (t.ex. bredvid förmånerna på Bli medlem). Visas bara om en bild är uppladdad.
 * "card" = rundad 4:3-bild i en spalt, "wide" = brett bildband över hela innehållsbredden.
 */
export function contentPhoto(s: Settings, key: SettingKey, altKey: SettingKey, variant: "card" | "wide" = "card"): SafeHtml {
  const value = s[key];
  if (!value) return html``;
  return html`<figure class="content-photo content-photo-${variant}"${ek(s, key)}>
    ${picture(value, {
      alt: s[altKey],
      sizes: variant === "wide" ? "(min-width: 1280px) 1200px, 100vw" : "(min-width: 920px) 560px, 100vw",
      width: variant === "wide" ? 1600 : 800,
      height: variant === "wide" ? 640 : 600,
    })}
  </figure>`;
}
