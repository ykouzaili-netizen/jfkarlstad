import { html, type SafeHtml } from "../lib/html.js";
import type { VideoRow } from "../lib/content.js";
import { ec, ek, type Settings } from "../lib/settings.js";
import { embedUrl, thumbUrl, watchUrl } from "../lib/youtube.js";
import { icon } from "../views/icons.js";
import { mediaUrl } from "../views/layout.js";

/**
 * Biografen: galleriets filmer (YouTube) som en liten biograf. En film visas åt gången – liggande i bredbild,
 * stående som en hög duk med en suddig kopia av stillbilden bakom – och under den ett program med alla filmer.
 *
 * Integritet: besökaren kontaktar aldrig YouTube förrän hen själv trycker på play. Stillbilden kommer från
 * sajten (/film/bild/… eller en egen bild), och spelaren (youtube-nocookie.com) laddas först vid klick av site.js.
 * Utan JS är knappen en vanlig länk till filmen på YouTube, och programmet byter film med ?film=…
 */
export function filmsSection(s: Settings, films: VideoRow[], url: URL): SafeHtml | string {
  if (!films.length) return "";
  const wanted = Number(url.searchParams.get("film"));
  const current = films.find((f) => f.id === wanted) ?? films[0]!;
  const poster = (f: VideoRow) => (f.poster_key ? mediaUrl(f.poster_key, "md") : thumbUrl(f.youtube_id)) ?? "";
  const meta = (f: VideoRow) => [f.album, f.year ? String(f.year) : "", f.description].filter(Boolean).join(" · ");

  const screen = (f: VideoRow) => html`<figure class="cine-screen${f.vertical ? " is-vertical" : ""}" data-cine-screen="${f.id}"${f === current ? "" : html` hidden`}${ec(s, `/admin/filmer/${f.id}`, `Filmer › ${f.title}`)}>
    ${f.vertical ? html`<img class="cine-blur${f.poster_key ? "" : " cine-blur--yt"}" src="${poster(f)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ""}
    <div class="cine-frame" data-cine-frame>
      <img class="cine-poster" src="${poster(f)}" alt="" loading="${f === current ? "eager" : "lazy"}" decoding="async">
      <a class="cine-play" href="${watchUrl(f.youtube_id)}" target="_blank" rel="noopener" data-embed="${embedUrl(f.youtube_id)}" data-title="${f.title}">
        <span class="cine-play-ring" aria-hidden="true">${icon("play", "icon")}</span>
        <span class="cine-play-label"${ek(s, "films_play")}>${s.films_play}</span><span class="sr-only">: ${f.title} (${s.films_newtab})</span>
      </a>
    </div>
    <figcaption class="cine-card">
      <p class="cine-kicker"${ek(s, "films_kicker")}>${s.films_kicker}</p>
      <h3 class="cine-title">${f.title}</h3>
      ${meta(f) ? html`<p class="cine-meta">${meta(f)}</p>` : ""}
      <p class="cine-note"${ek(s, "films_note")}>${s.films_note}</p>
    </figcaption>
  </figure>`;

  return html`<section class="section cine" aria-labelledby="biografen">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="biografen"${ek(s, "films_title")}>${s.films_title}</h2>
          ${s.films_text ? html`<p class="section-lead"${ek(s, "films_text")}>${s.films_text}</p>` : ""}
        </div>
      </div>
      <div class="cine-hall" data-cine>
        ${films.map(screen)}
        ${films.length > 1
          ? html`<nav class="cine-prog" aria-label="${s.films_program}">
              <p class="cine-prog-title"${ek(s, "films_program")}>${s.films_program}</p>
              <ol>
                ${films.map(
                  (f) => html`<li><a class="cine-item" href="?film=${f.id}#biografen" data-cine-pick="${f.id}"${f === current ? html` aria-current="true"` : ""}>
                    <span class="cine-item-year">${f.year ?? "–"}</span>
                    <span class="cine-item-text"><b>${f.title}</b>${f.album ? html`<span>${f.album}</span>` : ""}</span>
                    ${f.vertical ? html`<span class="cine-item-tag"${ek(s, "films_vertical")}>${s.films_vertical}</span>` : ""}
                  </a></li>`,
                )}
              </ol>
            </nav>`
          : ""}
      </div>
    </div>
  </section>`;
}
