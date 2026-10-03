import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { ek, loadSettings, type Settings } from "../lib/settings.js";
import { eventQuery, jobQuery, newsQuery, partnerQuery, type EventRow, type NewsRow, type PartnerRow } from "../lib/content.js";
import { eventDate, stockholmNow, stockholmToday, telHref } from "../lib/format.js";
import { renderInline } from "../lib/markdown.js";
import type { RequestContext } from "../router.js";
import { icon, type IconName } from "../views/icons.js";
import { joinButton, layout, mediaUrl, picture } from "../views/layout.js";
import { arrowLink, emptyState, eventCard, newsCard, partnerCard, partnerLogo, sectionHead } from "../views/components.js";
import { htmlResponse } from "../lib/http.js";
import { ec } from "../lib/settings.js";

export async function homePage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [eventsRes, newsRes, partnersRes, jobsRes]] = await Promise.all([
    loadSettings(db, c.preview),
    db.batch([eventQuery.upcoming(db, stockholmNow(), 3), newsQuery.latest(db, 3), partnerQuery.all(db), jobQuery.openCount(db, stockholmToday())]),
  ]);
  const events = eventsRes!.results as unknown as EventRow[];
  const news = newsRes!.results as unknown as NewsRow[];
  const partners = partnersRes!.results as unknown as PartnerRow[];
  const openJobs = ((jobsRes!.results[0] as { n?: number } | undefined)?.n ?? 0) as number;

  const content = html`
    ${hero(s, events[0])}
    ${partnersSection(s, partners, openJobs)}
    ${values(s)}
    ${intro(s)}
    ${eventsSection(s, events)}
    ${newsSection(s, news)}
    ${paverka(s)}
    ${instagram(s)}
  `;

  const site = c.env.SITE_URL.replace(/\/$/, "");
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.site_name,
    alternateName: s.site_short_name,
    url: site + "/",
    logo: site + (mediaUrl(s.logo_key) ?? "/assets/favicon.svg"),
    email: s.contact_email,
    telephone: telHref(s.contact_phone).replace("tel:", ""),
    address: {
      "@type": "PostalAddress",
      streetAddress: s.address_street,
      postalCode: s.address_city.match(/\d{3}\s?\d{2}/)?.[0] ?? "",
      addressLocality: "Karlstad",
      addressCountry: "SE",
    },
    sameAs: [s.instagram_url],
  };

  return htmlResponse(c, layout(c, s, { title: s.site_name, path: "/", jsonLd: [organization], overlayHeader: true }, content));
}

function hero(s: Settings, next: EventRow | undefined): SafeHtml {
  const d = next ? eventDate(next.starts_at, next.ends_at) : null;
  const pos = ["top", "center", "bottom"].includes(s.hero_image_position) ? s.hero_image_position : "center";
  const tone = ["svag", "medel", "stark"].includes(s.hero_overlay) ? s.hero_overlay : "medel";
  const img = s.hero_image_key;
  return html`<section class="hero hero-pos-${pos} hero-tone-${tone}${img ? " has-image" : ""}" aria-labelledby="hero-titel">
    <div class="hero-media"${ek(s, "hero_image_key")}>
      ${img
        ? picture(img, { alt: s.hero_image_alt, className: "hero-bg", sizes: "100vw", width: 2560, height: 1440, eager: true })
        : html`<div class="hero-fallback" aria-hidden="true"><span class="hero-fallback-glyph">§</span></div>`}
    </div>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="container hero-inner">
      <div class="hero-copy">
        ${s.hero_eyebrow ? html`<p class="eyebrow"${ek(s, "hero_eyebrow")}><span class="eyebrow-dot" aria-hidden="true"></span>${s.hero_eyebrow}</p>` : ""}
        <h1 class="hero-title" id="hero-titel"${ek(s, "hero_title")}>${s.hero_title}</h1>
        <p class="hero-lead"${ek(s, "hero_subtitle")}>${s.hero_subtitle}</p>
        <div class="hero-actions">
          ${joinButton(s, { className: "btn btn-primary btn-lg", labelKey: "hero_button_label" })}
          <a class="btn btn-light btn-lg" href="/om-oss"${ek(s, "hero_secondary_label")}>${s.hero_secondary_label}</a>
        </div>
      </div>
      ${next && d
        ? html`<a class="hero-next" href="/kalender/${next.slug}"${ec(s, `/admin/event/${next.id}`, `Event › ${next.title}`)}>
            <span class="float-date" aria-hidden="true"><span>${d.day}</span><span>${d.monthShort}</span></span>
            <span class="float-text"><span class="float-label"${ek(s, "hero_next_label")}>${s.hero_next_label}</span><span class="float-title">${next.title}</span><span class="sr-only">, ${d.dateLong}</span></span>
          </a>`
        : ""}
    </div>
    <a class="hero-scroll" href="#partner-titel"${ek(s, "hero_scroll")}><span class="hero-scroll-label">${s.hero_scroll}</span><span class="hero-scroll-icon" aria-hidden="true">${icon("arrowDown", "icon icon-sm")}</span></a>
  </section>`;
}

function values(s: Settings): SafeHtml {
  const items = [
    { icon: "network" as IconName, t: "value_1_title", x: "value_1_text" },
    { icon: "briefcase" as IconName, t: "value_2_title", x: "value_2_text" },
    { icon: "sparkle" as IconName, t: "value_3_title", x: "value_3_text" },
  ] as const;
  return html`<section class="section" aria-labelledby="varden-titel">
    <div class="container">
      <h2 class="section-title section-title-center" id="varden-titel"${ek(s, "values_title")}>${s.values_title}</h2>
      <ul class="value-grid">
        ${items.map(
          (v) => html`<li class="value-card">
            <span class="value-icon">${icon(v.icon)}</span>
            <h3 class="value-title"${ek(s, v.t)}>${s[v.t]}</h3>
            <p${ek(s, v.x)}>${s[v.x]}</p>
          </li>`,
        )}
      </ul>
    </div>
  </section>`;
}

function intro(s: Settings): SafeHtml {
  const img = s.intro_image_key;
  const stats = [
    ["stat_1_value", "stat_1_label"],
    ["stat_2_value", "stat_2_label"],
    ["stat_3_value", "stat_3_label"],
    ["stat_4_value", "stat_4_label"],
  ] as const;
  return html`<section class="section section-surface" aria-labelledby="intro-titel">
    <div class="container intro-grid">
      <div class="intro-copy">
        <h2 class="section-title" id="intro-titel"${ek(s, "intro_title")}>${s.intro_title}</h2>
        <div class="prose"${ek(s, "intro_text")}>${paragraphs(s.intro_text)}</div>
        ${arrowLink("/om-oss", s.intro_link, "arrow-link", ek(s, "intro_link"))}
      </div>
      <div class="intro-media">
        ${img ? html`<div${ek(s, "intro_image_key")}>${picture(img, { alt: s.intro_image_alt, className: "intro-image", sizes: "(min-width: 920px) 45vw, 100vw", width: 720, height: 540 })}</div>` : ""}
        <dl class="stat-grid${img ? " stat-grid-compact" : ""}">
          ${stats.map(([v, l]) => html`<div class="stat"${ek(s, v)}><dt class="stat-label">${s[l]}</dt><dd class="stat-value">${s[v]}</dd></div>`)}
        </dl>
      </div>
    </div>
  </section>`;
}

function eventsSection(s: Settings, events: EventRow[]): SafeHtml {
  return html`<section class="section" aria-labelledby="event-titel">
    <div class="container">
      ${sectionHead(s, { titleKey: "home_events_title", id: "event-titel", link: { href: "/kalender", labelKey: "home_events_link" } })}
      ${events.length
        ? html`<div class="card-grid">${events.map((e) => eventCard(s, e))}</div>`
        : emptyState(renderInline(s.home_events_empty), ek(s, "home_events_empty"))}
    </div>
  </section>`;
}

function newsSection(s: Settings, news: NewsRow[]): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="nyheter-titel">
    <div class="container">
      ${sectionHead(s, { titleKey: "home_news_title", id: "nyheter-titel", link: { href: "/aktuellt", labelKey: "home_news_link" } })}
      ${news.length ? html`<div class="card-grid">${news.map((n) => newsCard(s, n))}</div>` : emptyState(s.home_news_empty, ek(s, "home_news_empty"))}
    </div>
  </section>`;
}

function partnersSection(s: Settings, partners: PartnerRow[], openJobs: number): SafeHtml {
  const main = partners.filter((p) => p.tier === "huvud");
  const others = partners.filter((p) => p.tier !== "huvud");
  return html`<section class="section section-surface" aria-labelledby="partner-titel">
    <div class="container">
      ${sectionHead(s, { titleKey: "home_partners_title", id: "partner-titel", leadKey: "partners_lead", link: { href: "/partners", labelKey: "home_partners_all" } })}
      ${main.length ? html`<ul class="partner-main">${main.map((p) => partnerCard(s, p))}</ul>` : ""}
      <div class="partner-footer">
        ${others.length
          ? html`<div class="partner-strip">
              <h3 class="partner-strip-title"${ek(s, "home_partners_strip")}>${s.home_partners_strip}</h3>
              <ul>${others.map((p) => html`<li${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>
            </div>`
          : ""}
        <div class="partner-actions">
          ${openJobs
            ? html`<a class="arrow-link" href="/karriar"${ek(s, "home_partners_jobs")}>${s.home_partners_jobs} <span class="count-pill">${openJobs}</span>${icon("arrowRight", "icon icon-sm")}</a>`
            : ""}
          <a class="btn btn-outline" href="/for-foretag"${ek(s, "partners_cta_button")}>${s.partners_cta_button}</a>
        </div>
      </div>
    </div>
  </section>`;
}

function paverka(s: Settings): SafeHtml {
  return html`<section class="section" aria-labelledby="paverka-titel">
    <div class="container">
      <div class="cta-panel">
        <div class="cta-icon">${icon("megaphone")}</div>
        <div class="cta-copy">
          <p class="cta-kicker"${ek(s, "home_paverka_kicker")}>${s.home_paverka_kicker}</p>
          <h2 class="cta-title" id="paverka-titel"${ek(s, "paverka_title")}>${s.paverka_title}</h2>
          <p${ek(s, "paverka_text")}>${s.paverka_text}</p>
        </div>
        <div class="cta-actions">
          <a class="btn btn-primary btn-lg" href="/jf-paverka"${ek(s, "home_paverka_button")}>${s.home_paverka_button}</a>
          ${s.home_paverka_note ? html`<p class="cta-note"${ek(s, "home_paverka_note")}>${icon("lock", "icon icon-sm")} ${s.home_paverka_note}</p>` : ""}
        </div>
      </div>
    </div>
  </section>`;
}

function instagram(s: Settings): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="insta-titel">
    <div class="container">
      <div class="insta-band">
        <span class="insta-icon">${icon("instagram")}</span>
        <div class="insta-copy">
          <h2 class="insta-title" id="insta-titel"${ek(s, "home_insta_title")}>${s.home_insta_title}</h2>
          <p${ek(s, "home_insta_text")}>${s.home_insta_text}</p>
        </div>
        <a class="btn btn-outline" href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener"${ek(s, "instagram_handle")}>${s.instagram_handle}${icon("external", "icon icon-sm")}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>
      </div>
    </div>
  </section>`;
}
