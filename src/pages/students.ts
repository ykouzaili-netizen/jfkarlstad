import { blockOrder, isBlockHidden } from "../lib/pagelayout.js";
import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, loadSettings, type Settings, arrange, siteLayout, type SettingKey } from "../lib/settings.js";
import { galleryQuery, repQuery, type CourseRepRow, type GalleryRow } from "../lib/content.js";
import { renderInline } from "../lib/markdown.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl, picture } from "../views/layout.js";
import { emptyState } from "../views/components.js";
import { icon } from "../views/icons.js";
import { contentPhoto, pageHeader } from "../views/page.js";

export async function studentsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [repRes, galRes]] = await Promise.all([loadSettings(db, c.preview), db.batch([repQuery.all(db), galleryQuery.all(db)])]);
  const reps = repRes!.results as unknown as CourseRepRow[];
  const gallery = galRes!.results as unknown as GalleryRow[];

  const navItems: { id: string; href: string; labelKey: SettingKey }[] = [
    { id: "studera", href: "#studera-pa-kau", labelKey: "study_title" },
    { id: "jobb", href: "#jobb-och-praktik", labelKey: "students_jobs_title" },
    { id: "kursombud", href: "#kursombud", labelKey: "reps_title" },
    { id: "idrott", href: "#jfk-idrott", labelKey: "sport_title" },
    { id: "galleri", href: "#bildgalleri", labelKey: "gallery_title" },
  ];
  const order = siteLayout(s);
  const nav = blockOrder(order, "for-studenter")
    .filter((id) => !isBlockHidden(order, "for-studenter", id))
    .map((id) => navItems.find((n) => n.id === id)!)
    .map(({ href, labelKey }) => ({ href, labelKey }));

  const content = html`
    ${pageHeader(s, { kickerKey: "students_kicker", hero: "students", titleKey: "students_title", leadKey: "students_lead", nav })}
    ${arrange(s, "for-studenter", {
      studera: (prev) => study(s, prev === null),
      jobb: (prev) => jobs(s, prev === null || prev === "studera"),
      kursombud: () => repsSection(s, reps),
      idrott: () => sport(s),
      galleri: () => gallerySection(s, gallery),
    })}
  `;
  return htmlResponse(c, layout(c, s, { title: s.students_kicker, description: s.students_lead }, content));
}

function study(s: Settings, tight: boolean): SafeHtml {
  return html`<section class="section${tight ? " section-tight-top" : ""}" aria-labelledby="studera-pa-kau">
    <div class="container split">
      <div>
        <h2 class="section-title" id="studera-pa-kau"${ek(s, "study_title")}>${s.study_title}</h2>
        <div class="prose"${ek(s, "study_text")}>${paragraphs(s.study_text)}</div>
        ${s.study_link
          ? html`<p class="after-list"><a class="btn btn-outline" href="${safeUrl(s.study_link)}" target="_blank" rel="noopener"${ek(s, "study_link_label")}>${s.study_link_label}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a></p>`
          : ""}
      </div>
      <div class="stack">
        ${contentPhoto(s, "study_image", "study_image_alt")}
        <aside class="aside-card">
          <h3 class="aside-title"${ek(s, "study_aside_title")}>${s.study_aside_title}</h3>
          <p${ek(s, "study_aside_text")}>${s.study_aside_text}</p>
          <a class="btn btn-primary" href="/jf-paverka"${ek(s, "study_aside_button")}>${s.study_aside_button}</a>
        </aside>
      </div>
    </div>
  </section>`;
}

function jobs(s: Settings, tight: boolean): SafeHtml {
  return html`<section class="section${tight ? " section-tight-top" : ""}" aria-labelledby="jobb-och-praktik">
    <div class="container">
      <div class="cta-inline cta-inline-soft">
        <div>
          <h2 class="cta-inline-title" id="jobb-och-praktik"${ek(s, "students_jobs_title")}>${s.students_jobs_title}</h2>
          <p${ek(s, "students_jobs_text")}>${s.students_jobs_text}</p>
        </div>
        <a class="btn btn-primary" href="/karriar"${ek(s, "students_jobs_button")}>${s.students_jobs_button}</a>
      </div>
    </div>
  </section>`;
}

function repsSection(s: Settings, reps: CourseRepRow[]): SafeHtml {
  return html`<section class="section section-surface" aria-labelledby="kursombud">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="kursombud"${ek(s, "reps_title")}>${s.reps_title}</h2>
          <p class="section-lead"${ek(s, "reps_text")}>${s.reps_text}</p>
        </div>
      </div>
      ${reps.length
        ? html`<ul class="rep-grid">
            ${reps.map(
              (r) => html`<li class="rep-card"${ec(s, `/admin/kursombud/${r.id}`, `Kursombud › ${r.term}`)}>
                <span class="rep-term">${r.term}</span>
                <div>
                  <p class="rep-name">${r.name || s.reps_tbd}</p>
                  ${r.email ? html`<a href="mailto:${r.email}">${r.email}</a>` : html`<p class="muted">${s.reps_contact_tbd}</p>`}
                </div>
              </li>`,
            )}
          </ul>`
        : emptyState(s.reps_empty, ek(s, "reps_empty"))}
    </div>
  </section>`;
}

type SportImage = { key: string; alt: string; setting: SettingKey };

/** Bilderna till JFK Idrott (Bild 1–8 i Texter och sidor), i ordning. */
function sportImages(s: Settings): SportImage[] {
  const keys = ["sport_image", "sport_image_2", "sport_image_3", "sport_image_4", "sport_image_5", "sport_image_6", "sport_image_7", "sport_image_8"] as const;
  return keys
    .map((k) => ({ key: s[k], alt: s[`${k}_alt` as const], setting: k as SettingKey }))
    .filter((img) => img.key);
}

/** Upprepa listan tills den har minst `min` poster – ett rullande band måste vara bredare än skärmen. */
function fill<T>(items: T[], min: number): T[] {
  const out = [...items];
  while (out.length < min) out.push(items[out.length % items.length]!);
  return out;
}

/**
 * JFK Idrott med fyra utseenden (Texter och sidor → För studenter → JFK Idrott):
 * rullande bildband, stort bildspel, text och bildspel bredvid varandra, och aktivitetskort med bild.
 * Rörliga delar har en paus-knapp och står still för den som valt minskad rörelse (site.js + site.css).
 */
function sport(s: Settings): SafeHtml {
  const items = lines(s.sport_items)
    .map((l) => {
      const [title, ...rest] = l.split("|");
      return { title: (title ?? "").trim(), text: rest.join("|").trim() };
    })
    .filter((it) => it.title);
  const images = sportImages(s);
  const style = (["band", "bildspel", "delad", "kort"] as const).find((v) => v === s.sport_style) ?? "band";
  const speed = (["lugn", "medel", "snabb"] as const).find((v) => v === s.sport_speed) ?? "medel";
  const bandSeconds = { lugn: 8, medel: 6, snabb: 4 }[speed];
  const fadeSeconds = { lugn: 8, medel: 5.5, snabb: 3.5 }[speed];

  const insta = s.instagram_sport_url
    ? html`<a class="btn btn-outline sport-insta" href="${safeUrl(s.instagram_sport_url)}" target="_blank" rel="noopener"${ek(s, "instagram_sport_handle")}>${icon("instagram", "icon icon-sm")}${s.instagram_sport_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>`
    : "";
  const heading = html`<h2 class="section-title" id="jfk-idrott"${ek(s, "sport_title")}>${s.sport_title}</h2>
    <p class="section-lead"${ek(s, "sport_text")}>${s.sport_text}</p>`;
  const head = html`<div class="section-head"><div>${heading}</div>${insta}</div>`;
  const pauseButton = (what: string) =>
    html`<button type="button" class="motion-pause" data-motion-toggle aria-pressed="false" data-pause-label="${s.sport_pause}" data-play-label="${s.sport_play}">
      <span class="motion-pause-icon" aria-hidden="true"></span><span data-motion-label${ek(s, "sport_pause")}>${s.sport_pause}</span><span class="sr-only"> ${what}</span>
    </button>`;
  const cards = (cls = "feature-grid") =>
    html`<ul class="${cls}"${ek(s, "sport_items")}>
      ${items.map((it) => html`<li class="feature-card"><h3 class="feature-title">${it.title}</h3>${it.text ? html`<p>${it.text}</p>` : ""}</li>`)}
    </ul>`;
  const photo = (img: SportImage, sizes: string, copy = false, eager = false) =>
    html`<figure class="sport-photo"${copy ? "" : ek(s, img.setting)}>${picture(img.key, { alt: copy ? "" : img.alt, sizes, width: 1200, height: 900, eager })}</figure>`;

  // Rullande band: två lika halvor, den andra dold för skärmläsare (animationen flyttar −50 %).
  const band = (list: (SafeHtml | string)[], copies: (SafeHtml | string)[], label: string, cls: string) =>
    html`<div class="marquee ${cls}" data-marquee data-seconds="${bandSeconds}">
      <div class="marquee-viewport">
        <ul class="marquee-track" aria-label="${label}" data-marquee-track>
          ${list.map((x) => html`<li class="marquee-item">${x}</li>`)}
          ${copies.map((x) => html`<li class="marquee-item" aria-hidden="true">${x}</li>`)}
        </ul>
      </div>
      ${pauseButton("bilderna som rullar")}
    </div>`;

  // Bildspel som tonar mellan bilderna. Utan JS syns den första bilden.
  const fader = (cls: string, overlay?: SafeHtml) =>
    html`<div class="fader ${cls}" data-fader data-seconds="${fadeSeconds}">
      <div class="fader-slides">
        ${images.map((img, i) => html`<div class="fader-slide${i === 0 ? " is-active" : ""}"${i === 0 ? "" : html` aria-hidden="true"`}>${photo(img, "(min-width: 920px) 70vw, 100vw", false, i === 0)}</div>`)}
      </div>
      ${overlay ?? ""}
      <div class="fader-controls">
        <div class="fader-dots" role="group" aria-label="Välj bild">
          ${images.map((_, i) => html`<button type="button" class="fader-dot${i === 0 ? " is-active" : ""}" data-fader-dot="${i}" aria-label="Bild ${i + 1} av ${images.length}"${i === 0 ? html` aria-current="true"` : ""}></button>`)}
        </div>
        ${pauseButton("bildspelet")}
      </div>
    </div>`;

  let body: SafeHtml;
  if (style === "kort") {
    // Varje aktivitet med sin bild (bild 1 till första aktiviteten osv.), korten rullar i sidled.
    const card = (it: { title: string; text: string }, i: number, copy = false) => {
      const img = images.length ? images[i % images.length] : null;
      return html`<article class="sport-card${img ? " has-image" : ""}">
        ${img ? photo(img, "320px", copy) : html`<span class="sport-card-mark" aria-hidden="true">${it.title.charAt(0)}</span>`}
        <div class="sport-card-body"><h3 class="feature-title">${it.title}</h3>${it.text ? html`<p>${it.text}</p>` : ""}</div>
      </article>`;
    };
    const many = items.length >= 3;
    body = html`${head}${many
      ? band(items.map((it, i) => card(it, i)), fill(items.map((it, i) => ({ it, i })), 8).slice(items.length).concat(fill(items.map((it, i) => ({ it, i })), 8)).map(({ it, i }) => card(it, i, true)), s.sport_title, "marquee-cards")
      : cards()}`;
  } else if (images.length < 2) {
    // För få bilder för ett bildspel: en stor bild (om den finns) och aktiviteterna.
    body = html`${head}${images[0] ? html`<figure class="content-photo content-photo-wide"${ek(s, images[0].setting)}>${picture(images[0].key, { alt: images[0].alt, sizes: "(min-width: 1280px) 1200px, 100vw", width: 1600, height: 640 })}</figure>` : ""}${cards()}`;
  } else if (style === "bildspel") {
    body = html`${fader("fader-hero", html`<div class="fader-overlay"><div>${heading}</div>${insta}</div>`)}${cards("feature-grid sport-after-hero")}`;
  } else if (style === "delad") {
    body = html`<div class="sport-split">
      <div class="sport-split-text">${heading}${insta ? html`<p class="after-list">${insta}</p>` : ""}${cards("sport-list")}</div>
      ${fader("fader-split")}
    </div>`;
  } else {
    const half = fill(images, 8);
    body = html`${head}${band(
      images.map((img) => photo(img, "(min-width: 900px) 380px, 75vw")),
      half.slice(images.length).concat(half).map((img) => photo(img, "(min-width: 900px) 380px, 75vw", true)),
      `Bilder från ${s.sport_title}`,
      "marquee-photos",
    )}${cards("feature-grid sport-after-band")}`;
  }

  return html`<section class="section sport sport--${style}" aria-labelledby="jfk-idrott">
    <div class="container">${body}</div>
  </section>`;
}

function gallerySection(s: Settings, images: GalleryRow[]): SafeHtml {
  const albums = new Map<string, GalleryRow[]>();
  for (const img of images) {
    if (!albums.has(img.album)) albums.set(img.album, []);
    albums.get(img.album)!.push(img);
  }
  return html`<section class="section section-surface" aria-labelledby="bildgalleri">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="bildgalleri"${ek(s, "gallery_title")}>${s.gallery_title}</h2>
          <p class="section-lead"${ek(s, "gallery_text")}>${s.gallery_text}</p>
        </div>
      </div>
      ${albums.size
        ? [...albums.entries()].map(
            ([album, imgs]) => html`<h3 class="subsection-title">${album}</h3>
              <ul class="gallery-grid">
                ${imgs.map(
                  (img) => html`<li${ec(s, `/admin/galleri/${img.id}`, `Bildgalleri › ${img.alt || album}`)}>
                    <a class="gallery-item" href="${mediaUrl(img.image_key)}" target="_blank" rel="noopener">
                      ${picture(img.image_key, { alt: img.alt, sizes: "(min-width: 1000px) 280px, 50vw", width: 480, height: 360 })}
                      <span class="sr-only"> (${s.gallery_open})</span>
                    </a>
                    ${img.caption ? html`<p class="gallery-caption">${img.caption}</p>` : ""}
                  </li>`,
                )}
              </ul>`,
          )
        : emptyState(renderInline(s.gallery_empty), ek(s, "gallery_empty"))}
    </div>
  </section>`;
}
