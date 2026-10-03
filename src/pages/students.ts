import { html, paragraphs, safeUrl, type SafeHtml } from "../lib/html.js";
import { lines, loadSettings, type Settings } from "../lib/settings.js";
import { galleryQuery, repQuery, type CourseRepRow, type GalleryRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl } from "../views/layout.js";
import { emptyState } from "../views/components.js";
import { icon } from "../views/icons.js";
import { pageHeader } from "../views/page.js";

export async function studentsPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, [repRes, galRes]] = await Promise.all([loadSettings(db), db.batch([repQuery.all(db), galleryQuery.all(db)])]);
  const reps = repRes!.results as unknown as CourseRepRow[];
  const gallery = galRes!.results as unknown as GalleryRow[];

  const content = html`
    ${pageHeader({
      kicker: "För studenter",
      title: "Studier och studentliv",
      lead: s.students_lead,
      nav: [
        { href: "#studera-pa-kau", label: "Studera på KAU" },
        { href: "#kursombud", label: "Kursombud" },
        { href: "#jfk-idrott", label: "JFK Idrott" },
        { href: "#bildgalleri", label: "Bildgalleri" },
      ],
    })}
    ${study(s)}
    ${repsSection(s, reps)}
    ${sport(s)}
    ${gallerySection(s, gallery)}
  `;
  return htmlResponse(c, layout(c, s, { title: "För studenter", description: s.students_lead }, content));
}

function study(s: Settings): SafeHtml {
  return html`<section class="section section-tight-top" aria-labelledby="studera-pa-kau">
    <div class="container split">
      <div>
        <h2 class="section-title" id="studera-pa-kau">Studera på KAU</h2>
        <div class="prose">${paragraphs(s.study_text)}</div>
        ${s.study_link
          ? html`<p class="after-list"><a class="btn btn-outline" href="${safeUrl(s.study_link)}" target="_blank" rel="noopener">Karlstads universitet${icon("external", "icon icon-sm")}<span class="sr-only"> (öppnas i ny flik)</span></a></p>`
          : ""}
      </div>
      <aside class="aside-card">
        <h3 class="aside-title">Något i utbildningen som inte fungerar?</h3>
        <p>Lämna en synpunkt via JF Påverka – anonymt om du vill. Allt tas upp på nästa styrelsemöte.</p>
        <a class="btn btn-primary" href="/jf-paverka">Till JF Påverka</a>
      </aside>
    </div>
  </section>`;
}

function repsSection(s: Settings, reps: CourseRepRow[]): SafeHtml {
  return html`<section class="section section-surface" aria-labelledby="kursombud">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="kursombud">Kursombud</h2>
          <p class="section-lead">${s.reps_text}</p>
        </div>
      </div>
      ${reps.length
        ? html`<ul class="rep-grid">
            ${reps.map(
              (r) => html`<li class="rep-card">
                <span class="rep-term">${r.term}</span>
                <div>
                  <p class="rep-name">${r.name || "Meddelas senare"}</p>
                  ${r.email ? html`<a href="mailto:${r.email}">${r.email}</a>` : html`<p class="muted">Kontaktuppgifter kommer</p>`}
                </div>
              </li>`,
            )}
          </ul>`
        : emptyState("Kursombuden presenteras snart.")}
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
          <h2 class="section-title" id="jfk-idrott">JFK Idrott</h2>
          <p class="section-lead">${s.sport_text}</p>
        </div>
        ${s.instagram_sport_url
          ? html`<a class="btn btn-outline" href="${safeUrl(s.instagram_sport_url)}" target="_blank" rel="noopener">${icon("instagram", "icon icon-sm")}${s.instagram_sport_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a>`
          : ""}
      </div>
      <ul class="feature-grid">
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
          <h2 class="section-title" id="bildgalleri">Bildgalleri</h2>
          <p class="section-lead">${s.gallery_text}</p>
        </div>
      </div>
      ${albums.size
        ? [...albums.entries()].map(
            ([album, imgs]) => html`<h3 class="subsection-title">${album}</h3>
              <ul class="gallery-grid">
                ${imgs.map(
                  (img) => html`<li>
                    <a class="gallery-item" href="${mediaUrl(img.image_key)}" target="_blank" rel="noopener">
                      <img src="${mediaUrl(img.image_key)}" alt="${img.alt}" loading="lazy" decoding="async" width="480" height="360">
                      <span class="sr-only"> (öppnas i större format i ny flik)</span>
                    </a>
                    ${img.caption ? html`<p class="gallery-caption">${img.caption}</p>` : ""}
                  </li>`,
                )}
              </ul>`,
          )
        : emptyState(html`Bilderna kommer snart. Under tiden finns massor på <a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}</a>.`)}
    </div>
  </section>`;
}
