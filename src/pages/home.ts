import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { blockColors, ek, loadSettings, type Settings, arrange } from "../lib/settings.js";
import { eventQuery, instagramQuery, jobQuery, newsQuery, partnerQuery, type EventRow, type InstagramPostRow, type NewsRow, type PartnerRow } from "../lib/content.js";
import { instagramConfigured, parseProfile, parseStatus, PROFILE_SETTING, STATUS_SETTING, syncInstagram, type InstagramProfile, type SyncStatus } from "../lib/instagram.js";
import { eventDate, stockholmNow, stockholmToday, telHref } from "../lib/format.js";
import { renderInline } from "../lib/markdown.js";
import type { RequestContext } from "../router.js";
import { icon, type IconName } from "../views/icons.js";
import { joinButton, layout, mediaUrl, picture, PREVIEW_IMAGE_PREFIX } from "../views/layout.js";
import { arrowLink, emptyState, eventCard, newsCard, partnerCard, partnerLogo, sectionHead } from "../views/components.js";
import { htmlResponse } from "../lib/http.js";
import { ec } from "../lib/settings.js";

export async function homePage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [eventsRes, newsRes, partnersRes, jobsRes], insta] = await Promise.all([
    loadSettings(db, c.preview),
    db.batch([eventQuery.upcoming(db, stockholmNow(), 3), newsQuery.latest(db, 3), partnerQuery.all(db), jobQuery.openCount(db, stockholmToday())]),
    loadInstagram(c),
  ]);
  const events = eventsRes!.results as unknown as EventRow[];
  const news = newsRes!.results as unknown as NewsRow[];
  const partners = partnersRes!.results as unknown as PartnerRow[];
  const openJobs = ((jobsRes!.results[0] as { n?: number } | undefined)?.n ?? 0) as number;

  // Avsnitt med olika bakgrund ska inte ligga tätt intill varandra.
  const plain = (id: string) => !blockColors(s, "startsida", id);
  const content = html`
    ${hero(s, events[0])}
    <span id="efter-toppen" class="scroll-anchor"></span>
    ${arrange(s, "startsida", {
      partners: () => partnersSection(s, partners, openJobs),
      varden: () => values(s),
      ordband: () => wordBand(s),
      intro: () => intro(s),
      evenemang: () => eventsSection(s, events),
      nyheter: (prev) => newsSection(s, news, prev === "evenemang" && plain("evenemang") && plain("nyheter")),
      paverka: () => paverka(s),
      instagram: (prev) => instagram(s, prev === "paverka" && plain("paverka"), insta.posts, insta.profile),
    })}
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
  const align = ["vanster", "mitten", "hoger"].includes(s.hero_text_align) ? s.hero_text_align : "vanster";
  const vertical = s.hero_text_vertical === "mitten" ? "mitten" : "nere";
  // I mobilen (skärm som hålls på höjden): visa hela bilden, eller fyll skärmen med vald del – eller en egen mobilbild.
  // En nyss vald men osparad bild i förhandsvisningen är en platshållare som inte fungerar i <source> – visa den vanliga.
  // Är bakgrundsbilden ett bildspel går det före den egna mobilbilden.
  const slideshow = img.includes("|");
  const mobileImg = img && !slideshow && !s.hero_image_mobile.startsWith(PREVIEW_IMAGE_PREFIX) ? s.hero_image_mobile : "";
  const fit = mobileImg ? "fyll" : s.hero_mobile_fit === "fyll" ? "fyll" : "hela";
  const focus = ["vanster", "mitten", "hoger"].includes(s.hero_mobile_focus) ? s.hero_mobile_focus : "mitten";
  return html`<section class="hero hero-pos-${pos} hero-tone-${tone} hero-align-${align} hero-valign-${vertical}${img ? ` has-image hero-fit-${fit} hero-mfocus-${focus}` : ""}" aria-labelledby="hero-titel">
    ${img && fit === "hela"
      ? // Samma bildadresser som huvudbilden (ingen extra nedladdning) men utan data-img, så att Bildbankens
        // beskärning av huvudbilden inte påverkar den suddiga bakgrunden.
        html`<div class="hero-backdrop" aria-hidden="true"><img class="hero-backdrop-img" src="${mediaUrl(img, "sm")}" srcset="${mediaUrl(img, "sm")} 800w, ${mediaUrl(img)} 2560w" sizes="100vw" alt="" width="2560" height="1440" decoding="async"></div>`
      : ""}
    <div class="hero-media"${ek(s, "hero_image_key")}>
      ${img
        ? mobileImg
          ? html`<picture class="hero-picture"><source media="(max-aspect-ratio: 1/1) and (max-width: 1023px)" srcset="${mediaUrl(mobileImg, "sm")} 800w, ${mediaUrl(mobileImg)} 2000w" sizes="100vw">${picture(img, { alt: s.hero_image_alt || s.hero_image_mobile_alt, className: "hero-bg", sizes: "100vw", width: 2560, height: 1440, eager: true })}</picture>`
          : picture(img, { alt: s.hero_image_alt, className: "hero-bg", sizes: "100vw", width: 2560, height: 1440, eager: true })
        : html`<div class="hero-fallback" aria-hidden="true"><span class="hero-fallback-glyph">§</span></div>`}
    </div>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="container hero-inner">
      <div class="hero-copy">
        ${s.hero_eyebrow ? html`<p class="eyebrow"${ek(s, "hero_eyebrow")}><span class="eyebrow-dot" aria-hidden="true"></span>${s.hero_eyebrow}</p>` : ""}
        <h1 class="hero-title" id="hero-titel"${ek(s, "hero_title")}>${splitWords(s.hero_title)}</h1>
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
    ${slideshow
      ? html`<button class="hero-slides-pause" type="button" hidden data-slides-control aria-pressed="false"><span class="slides-pause-icon" aria-hidden="true"></span><span class="sr-only">Pausa bildspelet</span></button>`
      : ""}
    <a class="hero-scroll" href="#efter-toppen"${ek(s, "hero_scroll")}><span class="hero-scroll-label">${s.hero_scroll}</span><span class="hero-scroll-icon" aria-hidden="true">${icon("arrowDown", "icon icon-sm")}</span></a>
  </section>`;
}

/**
 * Rubriken ord för ord, så att orden kan glida upp ett i taget när sidan öppnas (se "Rörelse" i site.css).
 * Mellanslagen ligger kvar mellan orden, så skärmläsare och kopiering läser rubriken som vanligt.
 */
function splitWords(text: string): SafeHtml[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w, i) => html`${i ? " " : ""}<span class="hw"><span>${w}</span></span>`);
}

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(value) ? (value as T) : fallback);

/** "Juridik" → "juridik" mitt i en mening, men förkortningar som "KAU" lämnas orörda. */
function lowerFirst(w: string): string {
  return /^\p{Lu}\p{Ll}/u.test(w) ? w[0]!.toLocaleLowerCase("sv") + w.slice(1) : w;
}

const WORDBAND_STYLES = ["rullband", "ordbyte", "stralkastare", "paragraf"] as const;

/**
 * Rullande ord – stora ord som blickfång, i ett av fem utseenden (Texter och sidor → Startsidan → Rullande ord).
 * Rörelsen sköts av motion.js och bara på nivån Full. Utan den (Lugn, Av, minska rörelse, ingen JS) visas
 * varje utseende som en snygg stillbild. Avsnittet är dekor – orden står redan i texterna runt omkring –
 * så det döljs för skärmläsare.
 */
function wordBand(s: Settings): SafeHtml {
  const words = s.wordband_words.split("\n").map((w) => w.trim()).filter(Boolean);
  if (!words.length) return html``;
  const style = pick(s.wordband_style, WORDBAND_STYLES, "rullband");
  const two = (i: number) => String(i + 1).padStart(2, "0");
  // Upprepar orden så att ett band alltid är bredare än skärmen.
  const repeated = (offset: number, min: number) => {
    const list = [...words.slice(offset), ...words.slice(0, offset)];
    return Array.from({ length: Math.max(2, Math.ceil(min / words.length)) }, () => list).flat();
  };
  const sepWords = (list: string[], cls: string) => list.map((w) => html`<span class="${cls}">${w}</span><span class="wb-sep">§</span>`);

  let inner: SafeHtml;
  switch (style) {
    case "ordbyte":
      inner = html`<div class="container wb-swap" data-wb-swap>
        <p class="wb-swap-lead"${ek(s, "wordband_lead")}>${s.wordband_lead}</p>
        <p class="wb-swap-slot"><span class="wb-swap-window"><span class="wb-swap-track">${words.map((w) => html`<span class="wb-swap-word">${w}</span>`)}</span></span></p>
        <p class="wb-swap-count"><span data-wb-swap-n>01</span> / ${two(words.length - 1)}</p>
      </div>`;
      break;
    case "stralkastare":
      inner = html`<div class="wb-spot-stage"><ol class="wb-spot-list" data-wb-spot>${words.map(
        (w, i) => html`<li class="wb-spot-word"><span class="wb-spot-n">${two(i)}</span><span class="wb-spot-text">${w}</span></li>`,
      )}</ol></div>`;
      break;
    case "paragraf":
      inner = html`<div class="container wb-law" data-wb-law data-words="${words.join("\n")}">
        <p class="wb-law-line"><span class="wb-law-n"><span data-wb-law-n>1</span> §</span> <span${ek(s, "wordband_lead")}>${s.wordband_lead}</span> <span class="wb-law-word" data-wb-law-word>${lowerFirst(words[0]!)}</span><span class="wb-law-caret"></span>.</p>
      </div>`;
      break;
    default:
      inner = html`<div class="wb-row" data-wordband="-1"><div class="wb-track">${sepWords(repeated(0, 18), "wb-word")}</div></div>
        <div class="wb-row wb-row-outline" data-wordband="1"><div class="wb-track">${sepWords(repeated(Math.floor(words.length / 2), 18), "wb-word")}</div></div>`;
  }
  const size = pick(s.wordband_size, ["liten", "mindre", "standard", "storre", "stor"] as const, "standard");
  return html`<section class="wordband wb--${style} wb-size-${size}" aria-hidden="true"${ek(s, "wordband_words")}>${inner}</section>`;
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

/** `tight` = direkt efter evenemangen (samma bakgrund), annars får avsnittet vanlig luft ovanför. */
function newsSection(s: Settings, news: NewsRow[], tight: boolean): SafeHtml {
  return html`<section class="section${tight ? " section-tight-top" : ""}" aria-labelledby="nyheter-titel">
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

/**
 * Det rullande bandet består av två lika halvor (animationen flyttar −50 %). Varje halva måste vara
 * bredare än skärmen, annars syns ett tomrum – med få inlägg upprepas de tills halvan har minst åtta.
 */
function marqueeFill(posts: InstagramPostRow[]): InstagramPostRow[] {
  const fill: InstagramPostRow[] = [];
  while (posts.length + fill.length < 8) fill.push(posts[fill.length % posts.length]!);
  return fill;
}

/** Har det gått mer än en timme sedan senaste hämtningen (eller har det aldrig hämtats)? */
function isStale(status: SyncStatus | null): boolean {
  if (!status?.at) return true;
  const last = Date.parse(status.at.replace(" ", "T") + "Z");
  return !Number.isFinite(last) || Date.now() - last > 60 * 60 * 1000;
}

/** Inläggen och (om automatisk hämtning är på) profilen. Fel – t.ex. en ännu inte körd migrering – får aldrig fälla startsidan. */
async function loadInstagram(c: RequestContext): Promise<{ posts: InstagramPostRow[]; profile: InstagramProfile | null }> {
  const db = c.env.DB;
  try {
    const [posts, profile, status] = await Promise.all([
      instagramQuery.latest(db, 12).all<InstagramPostRow>(),
      db.prepare("SELECT value FROM settings WHERE key = ?").bind(PROFILE_SETTING).first<{ value: string }>(),
      db.prepare("SELECT value FROM settings WHERE key = ?").bind(STATUS_SETTING).first<{ value: string }>(),
    ]);
    // Så fort Instagram-nyckeln finns hämtas inläggen – utan att vänta på nästa timkörning.
    // Körs i bakgrunden efter svaret (besökaren väntar inte) och högst en gång i timmen.
    if (instagramConfigured(c.env) && !c.preview && isStale(parseStatus(status?.value))) c.exec.waitUntil(syncInstagram(c.env));
    return { posts: posts.results, profile: parseProfile(profile?.value) };
  } catch (err) {
    console.error("Instagram-inläggen kunde inte läsas", err instanceof Error ? err.message : err);
    return { posts: [], profile: null };
  }
}

/**
 * Mosaiken ska fylla hela rader: det stora inlägget tar 2×2 rutor, de andra en var. Kolumner på dator:
 * 5 (små), 4 (mellan) eller 3 (stora); i mobilen 2. Välj största antalet (högst ett fler än valt) som går jämnt ut.
 */
function mosaicCount(wanted: number, available: number, size: string): number {
  const cols = size === "liten" ? 5 : size === "stor" ? 3 : 4;
  for (let n = Math.min(wanted + 1, available); n >= 2; n--) {
    if ((4 + n - 1) % cols === 0 && (n - 1) % 2 === 0) return n;
  }
  return Math.min(wanted, available);
}


/**
 * Instagram-avsnittet: profilruta (profilbild, namn, presentation, siffror och Följ-knapp) och de senaste
 * inläggen i fyra utseenden. Allt ställs in under Texter och sidor → Startsidan → Instagram.
 */
function instagram(s: Settings, tight: boolean, allPosts: InstagramPostRow[], profile: InstagramProfile | null): SafeHtml {
  const style = pick(s.insta_style, ["karusell", "band", "rutnat", "mosaik"] as const, "karusell");
  const size = pick(s.insta_size, ["liten", "medel", "stor"] as const, "medel");
  const shape = pick(s.insta_shape, ["kvadrat", "staende"] as const, "kvadrat");
  const bg = style === "band" ? "ljus" : pick(s.insta_background, ["ljus", "yta", "gul", "mork"] as const, "ljus");
  const captions = pick(s.insta_captions, ["hover", "under", "dolda"] as const, "hover");
  const count = Number(pick(s.insta_count, ["4", "6", "8", "12"] as const, "8"));
  const posts = allPosts.slice(0, style === "mosaik" ? mosaicCount(count, allPosts.length, size) : count);
  const showProfile = s.insta_profile !== "dolj";
  const scrolls = style === "karusell" || style === "band";
  const motion = !scrolls ? "av" : pick(s.insta_autoplay, ["rullar", "av", "pa"] as const, "rullar");
  const autoplay = motion === "pa";
  // Rullande band: inläggen visas två gånger efter varandra så att rörelsen kan loopa sömlöst.
  const marquee = motion === "rullar" && posts.length >= 2;
  const secondsPerPost = { lugn: 7, medel: 5, snabb: 3 }[pick(s.insta_speed, ["lugn", "medel", "snabb"] as const, "medel")];
  const url = safeUrl(s.instagram_url);
  const handle = s.instagram_handle;
  const avatarKey = profile?.pictureKey || s.insta_avatar || "";
  const fmt = (n: number) => new Intl.NumberFormat("sv-SE").format(n);

  const followBtn = (cls: string) =>
    html`<a class="btn ${cls} insta-follow" href="${url}" target="_blank" rel="noopener">${icon("instagram", "icon icon-sm")}<span${ek(s, "insta_follow_label")}>${s.insta_follow_label}</span> <span class="insta-follow-handle">${handle}</span><span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>`;

  const profileCard = html`<div class="insta-profile">
    <a class="insta-avatar" href="${url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"${ek(s, "insta_avatar")}>
      ${avatarKey ? picture(avatarKey, { alt: "", sizes: "96px", width: 160, height: 160 }) : html`<span class="insta-avatar-mark">${s.site_short_name}</span>`}
    </a>
    <div class="insta-profile-text">
      <p class="insta-handle"${ek(s, "instagram_handle")}>${handle}</p>
      <p class="insta-name"${ek(s, "insta_profile_name")}>${s.insta_profile_name}</p>
      ${profile && (profile.posts !== null || profile.followers !== null)
        ? html`<p class="insta-stats">
            ${profile.posts !== null ? html`<span><strong>${fmt(profile.posts)}</strong> <span${ek(s, "insta_posts_label")}>${s.insta_posts_label}</span></span>` : ""}
            ${profile.followers !== null ? html`<span><strong>${fmt(profile.followers)}</strong> <span${ek(s, "insta_followers_label")}>${s.insta_followers_label}</span></span>` : ""}
          </p>`
        : ""}
      ${s.insta_profile_bio ? html`<p class="insta-bio"${ek(s, "insta_profile_bio")}>${s.insta_profile_bio}</p>` : ""}
    </div>
  </div>`;

  const head = html`<div class="insta-head">
    <div class="insta-intro">
      <h2 class="section-title insta-title" id="insta-titel"${ek(s, "home_insta_title")}>${s.home_insta_title}</h2>
      ${s.home_insta_text ? html`<p class="section-lead"${ek(s, "home_insta_text")}>${s.home_insta_text}</p>` : ""}
    </div>
    ${showProfile ? profileCard : ""}
    <div class="insta-actions">${followBtn(style === "band" || bg === "mork" ? "btn-light" : "btn-primary")}</div>
  </div>`;

  const postItem = (p: InstagramPostRow, i: number, copy = false) => {
    const label = p.caption ? p.caption.replace(/\s+/g, " ").slice(0, 140) : `Inlägg från ${handle}`;
    const big = style === "mosaik" && i === 0;
    // Kopian i det rullande bandet är bara utfyllnad: dold för skärmläsare och tangentbord.
    return html`<li class="insta-post${big ? " insta-post-big" : ""}"${copy ? html` aria-hidden="true"` : ec(s, `/admin/instagram/${p.id}`, `Instagram › ${label.slice(0, 40)}`)}>
      <a href="${p.permalink ? safeUrl(p.permalink) : url}" target="_blank" rel="noopener"${copy ? html` tabindex="-1"` : ""}>
        <span class="insta-media">
          ${picture(p.image_key, { alt: p.caption || copy ? "" : `Inlägg från ${handle}`, sizes: big ? "(min-width: 900px) 600px, 90vw" : size === "stor" ? "(min-width: 900px) 420px, 80vw" : "(min-width: 900px) 300px, 60vw", width: 800, height: shape === "staende" ? 1000 : 800 })}
          <span class="insta-glyph" aria-hidden="true">${icon("instagram", "icon icon-sm")}</span>
          ${captions === "hover" && p.caption ? html`<span class="insta-overlay" aria-hidden="true"><span>${p.caption.slice(0, 220)}</span></span>` : ""}
        </span>
        ${captions === "under" && p.caption ? html`<span class="insta-caption" aria-hidden="true">${p.caption.slice(0, 220)}</span>` : ""}
        ${copy ? "" : html`<span class="sr-only">${label} (öppnas på Instagram i ny flik)</span>`}
      </a>
    </li>`;
  };

  const feed = posts.length
    ? marquee
      ? html`<div class="insta-feed insta-marquee" data-marquee data-seconds="${secondsPerPost}">
          <div class="insta-marquee-viewport">
            <ul class="insta-track" aria-label="Senaste inläggen från ${handle}">
              ${posts.map((p, i) => postItem(p, i))}
              ${marqueeFill(posts).map((p, i) => postItem(p, i, true))}
              ${[...posts, ...marqueeFill(posts)].map((p, i) => postItem(p, i, true))}
            </ul>
          </div>
          <button type="button" class="insta-pause" data-marquee-toggle aria-pressed="false" data-pause-label="${s.insta_pause}" data-play-label="${s.insta_play}">
            <span class="insta-pause-icon" aria-hidden="true"></span><span data-marquee-label${ek(s, "insta_pause")}>${s.insta_pause}</span><span class="sr-only"> inläggen som rullar</span>
          </button>
        </div>`
      : html`<div class="insta-feed"${scrolls ? html` data-carousel${autoplay ? html` data-autoplay` : ""}` : ""}>
        ${scrolls ? html`<button type="button" class="insta-nav insta-prev" data-carousel-prev aria-label="Föregående inlägg">${icon("chevronLeft", "icon")}</button>` : ""}
        <ul class="insta-track"${scrolls ? html` tabindex="0" aria-label="Senaste inläggen från ${handle} – bläddra i sidled" data-carousel-track` : html` aria-label="Senaste inläggen från ${handle}"`}>
          ${posts.map((p, i) => postItem(p, i))}
        </ul>
        ${scrolls ? html`<button type="button" class="insta-nav insta-next" data-carousel-next aria-label="Nästa inlägg">${icon("chevronRight", "icon")}</button>` : ""}
      </div>`
    : html`<p class="insta-empty"${ek(s, "insta_empty")}>${s.insta_empty}</p>`;

  return html`<section class="section insta insta--${style}${marquee ? " has-marquee" : ""} insta-size-${size} insta-shape-${shape} insta-bg-${bg} insta-cap-${captions}${tight && bg === "ljus" ? " section-tight-top" : ""}" aria-labelledby="insta-titel">
    <div class="container">
      ${style === "band" ? html`<div class="insta-band-wrap">${head}${feed}</div>` : html`${head}${feed}`}
    </div>
  </section>`;
}
