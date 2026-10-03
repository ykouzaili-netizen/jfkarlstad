import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, loadSettings, type Settings } from "../lib/settings.js";
import { galleryQuery, repQuery, type CourseRepRow, type GalleryRow } from "../lib/content.js";
import { renderInline } from "../lib/markdown.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl, picture } from "../views/layout.js";
import { emptyState } from "../views/components.js";
import { icon } from "../views/icons.js";
import { pageHeader } from "../views/page.js";

export async function studentsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [repRes, galRes]] = await Promise.all([loadSettings(db, c.preview), db.batch([repQuery.all(db), galleryQuery.all(db)])]);
  const reps = repRes!.results as unknown as CourseRepRow[];
  const gallery = galRes!.results as unknown as GalleryRow[];

  const content = html`
    ${pageHeader(s, {
      kickerKey: "students_kicker",
      titleKey: "students_title",
      leadKey: "students_lead",
      nav: [
        { href: "#studera-pa-kau", labelKey: "study_title" },
        { href: "#jobb-och-praktik", labelKey: "students_jobs_title" },
        { href: "#kursombud", labelKey: "reps_title" },
        { href: "#jfk-idrott", labelKey: "sport_title" },
        { href: "#bildgalleri", labelKey: "gallery_title" },
      ],
    })}
    ${study(s)}
    ${jobs(s)}
    ${repsSection(s, reps)}
    ${sport(s)}
    ${gallerySection(s, gallery)}
  `;
  return htmlResponse(c, layout(c, s, { title: s.students_kicker, description: s.students_lead }, content));
}

function study(s: Settings): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="studera-pa-kau">
    <div class="container split">
      <div>
        <h2 class="section-title" id="studera-pa-kau"${ek(s, "study_title")}>${s.study_title}</h2>
        <div class="prose"${ek(s, "study_text")}>${paragraphs(s.study_text)}</div>
        ${s.study_link
          ? html`<p class="after-list"><a class="btn btn-outline" href="${safeUrl(s.study_link)}" target="_blank" rel="noopener"${ek(s, "study_link_label")}>${s.study_link_label}${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a></p>`
          : ""}
      </div>
      <aside class="aside-card">
        <h3 class="aside-title"${ek(s, "study_aside_title")}>${s.study_aside_title}</h3>
        <p${ek(s, "study_aside_text")}>${s.study_aside_text}</p>
        <a class="btn btn-primary" href="/jf-paverka"${ek(s, "study_aside_button")}>${s.study_aside_button}</a>
      </aside>
    </div>
  </section>`;
}

function jobs(s: Settings): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="jobb-och-praktik">
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

function sport(s: Settings): SafeHtml {
  const items = lines(s.sport_items).map((l) => {
    const [title, ...rest] = l.split("|");
    return { title: (title ?? "").trim(), text: rest.join("|").trim() };
  });
  return html`<section class="section" aria-labelledby="jfk-idrott">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="jfk-idrott"${ek(s, "sport_title")}>${s.sport_title}</h2>
          <p class="section-lead"${ek(s, "sport_text")}>${s.sport_text}</p>
        </div>
        ${s.instagram_sport_url
          ? html`<a class="btn btn-outline" href="${safeUrl(s.instagram_sport_url)}" target="_blank" rel="noopener"${ek(s, "instagram_sport_handle")}>${icon("instagram", "icon icon-sm")}${s.instagram_sport_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>`
          : ""}
      </div>
      <ul class="feature-grid"${ek(s, "sport_items")}>
        ${items.map((it) => html`<li class="feature-card"><h3 class="feature-title">${it.title}</h3>${it.text ? html`<p>${it.text}</p>` : ""}</li>`)}
      </ul>
    </div>
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
