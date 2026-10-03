import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { loadSettings, type Settings } from "../lib/settings.js";
import { eventQuery, newsQuery, partnerQuery, type EventRow, type NewsRow, type PartnerRow } from "../lib/content.js";
import { eventDate, stockholmNow, telHref } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { icon, type IconName } from "../views/icons.js";
import { joinButton, layout, mediaUrl } from "../views/layout.js";
import { arrowLink, emptyState, eventCard, newsCard, partnerLogo, sectionHead } from "../views/components.js";
import { htmlResponse } from "../lib/http.js";

export async function homePage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [eventsRes, newsRes, partnersRes]] = await Promise.all([
    loadSettings(db),
    db.batch([eventQuery.upcoming(db, stockholmNow(), 3), newsQuery.latest(db, 3), partnerQuery.all(db)]),
  ]);
  const events = eventsRes!.results as unknown as EventRow[];
  const news = newsRes!.results as unknown as NewsRow[];
  const partners = partnersRes!.results as unknown as PartnerRow[];

  const content = html`
    ${hero(s, events[0])}
    ${partnersSection(s, partners)}
    ${values(s)}
    ${intro(s)}
    ${eventsSection(events)}
    ${newsSection(news)}
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

  return htmlResponse(
    c,
    layout(c, s, { title: s.site_name, path: "/", jsonLd: [organization] }, content),
  );
}

function hero(s: Settings, next: EventRow | undefined): SafeHtml {
  const img = mediaUrl(s.hero_image_key);
  const d = next ? eventDate(next.starts_at, next.ends_at) : null;
  return html`<section class="hero" aria-labelledby="hero-titel">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span>Juridik &amp; skatterätt vid Karlstads universitet</p>
        <h1 class="hero-title" id="hero-titel">${s.hero_title}</h1>
        <p class="hero-lead">${s.hero_subtitle}</p>
        <div class="hero-actions">
          ${joinButton(s, { className: "btn btn-primary btn-lg", label: s.hero_button_label })}
          ${arrowLink("/om-oss", s.hero_secondary_label, "arrow-link hero-secondary")}
        </div>
      </div>
      <div class="hero-visual${img ? " has-image" : ""}">
        ${img
          ? html`<img class="hero-image" src="${img}" alt="${s.hero_image_alt}" width="720" height="880" fetchpriority="high">`
          : html`<div class="hero-art" aria-hidden="true"><span class="hero-art-glyph">§</span><span class="hero-art-ring"></span></div>`}
        <div class="float-card float-card-top" aria-hidden="true">
          <span class="float-avatars"><span></span><span></span><span></span></span>
          <span><strong>${s.stat_2_value}</strong> ${s.stat_2_label}</span>
        </div>
        ${next && d
          ? html`<a class="float-card float-card-bottom" href="/kalender/${next.slug}">
              <span class="float-date"><span>${d.day}</span><span>${d.monthShort}</span></span>
              <span class="float-text"><span class="float-label">Nästa evenemang</span><span class="float-title">${next.title}</span></span>
            </a>`
          : ""}
      </div>
    </div>
  </section>`;
}

function values(s: Settings): SafeHtml {
  const items: { icon: IconName; title: string; text: string }[] = [
    { icon: "network", title: s.value_1_title, text: s.value_1_text },
    { icon: "briefcase", title: s.value_2_title, text: s.value_2_text },
    { icon: "sparkle", title: s.value_3_title, text: s.value_3_text },
  ];
  return html`<section class="section" aria-labelledby="varden-titel">
    <div class="container">
      <h2 class="section-title section-title-center" id="varden-titel">${s.values_title}</h2>
      <ul class="value-grid">
        ${items.map(
          (v) => html`<li class="value-card">
            <span class="value-icon">${icon(v.icon)}</span>
            <h3 class="value-title">${v.title}</h3>
            <p>${v.text}</p>
          </li>`,
        )}
      </ul>
    </div>
  </section>`;
}

function intro(s: Settings): SafeHtml {
  const img = mediaUrl(s.intro_image_key);
  const stats = [
    [s.stat_1_value, s.stat_1_label],
    [s.stat_2_value, s.stat_2_label],
    [s.stat_3_value, s.stat_3_label],
    [s.stat_4_value, s.stat_4_label],
  ] as const;
  return html`<section class="section section-surface" aria-labelledby="intro-titel">
    <div class="container intro-grid">
      <div class="intro-copy">
        <h2 class="section-title" id="intro-titel">${s.intro_title}</h2>
        <div class="prose">${paragraphs(s.intro_text)}</div>
        ${arrowLink("/om-oss", "Läs mer om oss")}
      </div>
      <div class="intro-media">
        ${img ? html`<img class="intro-image" src="${img}" alt="${s.intro_image_alt}" loading="lazy" decoding="async" width="720" height="540">` : ""}
        <dl class="stat-grid${img ? " stat-grid-compact" : ""}">
          ${stats.map(([value, label]) => html`<div class="stat"><dt class="stat-label">${label}</dt><dd class="stat-value">${value}</dd></div>`)}
        </dl>
      </div>
    </div>
  </section>`;
}

function eventsSection(events: EventRow[]): SafeHtml {
  return html`<section class="section" aria-labelledby="event-titel">
    <div class="container">
      ${sectionHead({ title: "Kommande evenemang", id: "event-titel", link: { href: "/kalender", label: "Se hela kalendern" } })}
      ${events.length
        ? html`<div class="card-grid">${events.map((e) => eventCard(e))}</div>`
        : emptyState(html`Inga evenemang är inlagda just nu. Följ oss på Instagram så missar du inget.`)}
    </div>
  </section>`;
}

function newsSection(news: NewsRow[]): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="nyheter-titel">
    <div class="container">
      ${sectionHead({ title: "Senaste nytt", id: "nyheter-titel", link: { href: "/aktuellt", label: "Alla nyheter" } })}
      ${news.length ? html`<div class="card-grid">${news.map((n) => newsCard(n))}</div>` : emptyState("Inga nyheter ännu.")}
    </div>
  </section>`;
}

function partnersSection(s: Settings, partners: PartnerRow[]): SafeHtml {
  const main = partners.filter((p) => p.tier === "huvud");
  const others = partners.filter((p) => p.tier !== "huvud");
  return html`<section class="section section-surface" aria-labelledby="partner-titel">
    <div class="container">
      ${sectionHead({
        title: "Våra samarbetspartners",
        id: "partner-titel",
        lead: s.partners_lead,
        link: { href: "/partners", label: "Alla partners" },
      })}
      ${main.length
        ? html`<ul class="partner-main">
            ${main.map(
              (p) => html`<li class="partner-card">
                <span class="partner-kicker">Huvudsamarbetspartner</span>
                <div class="partner-logo-wrap">${partnerLogo(p, "lg")}</div>
                <p class="partner-tagline">${p.tagline}</p>
                <a class="card-link arrow-link" href="/partners/${p.slug}">Läs mer<span class="sr-only"> om ${p.name}</span>${icon("arrowRight", "icon icon-sm")}</a>
              </li>`,
            )}
          </ul>`
        : ""}
      <div class="partner-footer">
        ${others.length
          ? html`<div class="partner-strip">
              <h3 class="partner-strip-title">Samarbetspartners</h3>
              <ul>${others.map((p) => html`<li><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>
            </div>`
          : ""}
        <a class="btn btn-outline" href="/for-foretag">Bli samarbetspartner</a>
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
          <p class="cta-kicker">JF Påverka</p>
          <h2 class="cta-title" id="paverka-titel">${s.paverka_title}</h2>
          <p>${s.paverka_text}</p>
        </div>
        <div class="cta-actions">
          <a class="btn btn-primary btn-lg" href="/jf-paverka">Gör din röst hörd</a>
          <p class="cta-note">${icon("lock", "icon icon-sm")} Du kan vara anonym</p>
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
          <h2 class="insta-title" id="insta-titel">Följ oss på Instagram</h2>
          <p>Bilder från sittningar, inspark och arbetsmarknadsdagar – och alla nyheter först.</p>
        </div>
        <a class="btn btn-outline" href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}${icon("external", "icon icon-sm")}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>
      </div>
    </div>
  </section>`;
}
