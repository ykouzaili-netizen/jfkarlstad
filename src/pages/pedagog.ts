import { html, paragraphs, type SafeHtml } from "../lib/html.js";
import type { HonorRow } from "../lib/content.js";
import { ec, ek, type Settings } from "../lib/settings.js";
import { fill } from "../lib/texts.js";
import { emptyState } from "../views/components.js";
import { icon } from "../views/icons.js";
import { picture } from "../views/layout.js";
import { avatar } from "../views/page.js";

/**
 * Årets pedagog på Om oss. Två utseenden (Texter och sidor → Om oss → Årets pedagog → Utseende):
 *  - Plaketterna: runda porträtt med årtalet som en plakett på en tunn linje (som på den gamla sajten).
 *    Den som fått priset flera gånger visas en gång med en plakett per år. Motiveringen är ett diplom (popover –
 *    öppnas, stängs och bläddras utan JavaScript). Årsvalet och porträttens lutning kommer från site.js.
 *  - Korten: den enkla listan med hela motiveringen på sidan.
 */
export function pedagogSection(s: Settings, honors: HonorRow[]): SafeHtml {
  const winners = honors.filter((h) => h.kind === "arets_pedagog");
  return s.pedagog_style === "kort" ? cards(s, winners) : plaques(s, winners);
}

const editWinner = (s: Settings, h: HonorRow) => ec(s, `/admin/utmarkelser/${h.id}`, `Utmärkelser › ${h.name}`);

function head(s: Settings, cls = ""): SafeHtml {
  return html`<div class="section-head${cls}">
    <div>
      <h2 class="section-title" id="arets-pedagog"${ek(s, "pedagog_title")}>${s.pedagog_title}</h2>
      <p class="section-lead"${ek(s, "pedagog_text")}>${s.pedagog_text}</p>
    </div>
  </div>`;
}

// ───────────── Korten ─────────────

function cards(s: Settings, winners: HonorRow[]): SafeHtml {
  return html`<section class="section" aria-labelledby="arets-pedagog">
    <div class="container">
      ${head(s)}
      ${winners.length
        ? html`<ul class="honor-grid">${winners.map(
            (h) => html`<li class="honor-card"${editWinner(s, h)}>
              ${avatar(h.name, h.photo_key, "md")}
              <div>
                ${h.year ? html`<p class="honor-year">${h.year}</p>` : ""}
                <h3 class="honor-name">${h.name}</h3>
                ${h.description ? html`<p class="honor-text">${h.description}</p>` : ""}
              </div>
            </li>`,
          )}</ul>`
        : emptyState(s.pedagog_empty, ek(s, "pedagog_empty"))}
    </div>
  </section>`;
}

// ───────────── Plaketterna ─────────────

interface Person {
  name: string;
  photo: string | null;
  /** Personens pris, nyast först. */
  awards: HonorRow[];
}

/** Samma namn = samma person (t.ex. två gånger pristagare). Ordningen följer det senaste priset. */
function people(winners: HonorRow[]): Person[] {
  const out: Person[] = [];
  for (const h of winners) {
    const p = out.find((x) => x.name === h.name);
    if (p) {
      p.awards.push(h);
      p.photo ??= h.photo_key;
    } else out.push({ name: h.name, photo: h.photo_key, awards: [h] });
  }
  return out;
}

const dialogId = (h: HonorRow) => `pedagog-${h.id}`;

function face(name: string, photo: string | null, sizes: string, cls: string): SafeHtml {
  return html`<span class="${cls}">${photo
    ? picture(photo, { alt: "", sizes, className: `${cls}-img`, width: 400, height: 400 })
    : html`<span class="${cls}-initials" aria-hidden="true">${name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>`}</span>`;
}

function plaques(s: Settings, winners: HonorRow[]): SafeHtml {
  const list = people(winners);
  const years = [...new Set(winners.map((h) => h.year).filter((y): y is number => y != null))];
  return html`<section class="section pedagog--plaketter" aria-labelledby="arets-pedagog">
    <div class="container">
      <div class="pd-head">
        <span class="pd-orn" aria-hidden="true"><span>✦ ✦ ✦</span></span>
        ${head(s, " pd-title")}
      </div>
      ${list.length
        ? html`
          ${years.length > 1
            ? html`<div class="pd-filter" role="group" aria-label="${s.pedagog_filter_label}" data-pd-filter hidden>
                <button type="button" aria-pressed="true" data-y=""${ek(s, "pedagog_filter_all")}>${s.pedagog_filter_all}</button>
                ${years.map((y) => html`<button type="button" aria-pressed="false" data-y="${y}">${y}</button>`)}
              </div>`
            : ""}
          <ul class="pd-grid" data-pd-grid>${list.map((p) => card(s, p))}</ul>
          <span class="pd-orn pd-orn--foot" aria-hidden="true"><span>✦ ✦ ✦</span></span>
          ${winners.map((h, i) => diploma(s, h, winners[i - 1], winners[i + 1]))}`
        : emptyState(s.pedagog_empty, ek(s, "pedagog_empty"))}
    </div>
  </section>`;
}

function card(s: Settings, p: Person): SafeHtml {
  const latest = p.awards[0]!;
  const oldestFirst = [...p.awards].reverse();
  return html`<li class="pd-card" data-years="${p.awards.map((h) => h.year ?? "").join(" ")}"${editWinner(s, latest)}>
    <button type="button" class="pd-face" popovertarget="${dialogId(latest)}" aria-label="${s.pedagog_open}: ${p.name}">
      ${face(p.name, p.photo, "(min-width: 900px) 200px, 42vw", "pd-photo")}
    </button>
    <div class="pd-rail">
      ${oldestFirst.map((h) =>
        h.year
          ? html`<button type="button" class="pd-plaque" popovertarget="${dialogId(h)}"><span class="sr-only">${s.pedagog_open}: ${p.name}, </span>${h.year}</button>`
          : "",
      )}
    </div>
    <h3 class="pd-name">${p.name}</h3>
    ${p.awards.length > 1 ? html`<p class="pd-times"${ek(s, "pedagog_times")}>${fill(s.pedagog_times, { antal: p.awards.length })}</p>` : ""}
  </li>`;
}

/** Motiveringen som ett diplom. Pilarna öppnar nästa diplom direkt (popover – en öppen åt gången). */
function diploma(s: Settings, h: HonorRow, newer: HonorRow | undefined, older: HonorRow | undefined): SafeHtml {
  const id = dialogId(h);
  const step = (to: HonorRow | undefined, dir: "prev" | "next", label: string) =>
    html`<button type="button" class="dp-step dp-step--${dir}"${to ? html` popovertarget="${dialogId(to)}" popovertargetaction="show"` : html` disabled`}>${icon(dir === "prev" ? "chevronLeft" : "chevronRight", "icon")}<span class="sr-only">${label}${to ? `: ${to.name}${to.year ? ` ${to.year}` : ""}` : ""}</span></button>`;
  return html`<div class="hg-dialog pd-dialog" id="${id}" popover role="dialog" aria-labelledby="${id}-namn">
    <article class="dp">
      <button type="button" class="dp-close" popovertarget="${id}" popovertargetaction="hide">${icon("close", "icon")}<span class="sr-only">${s.honors_close}</span></button>
      <img class="dp-crest" src="/assets/diplom-logo.webp?v=1" alt="" width="480" height="503" loading="lazy" decoding="async">
      ${face(h.name, h.photo_key, "160px", "dp-photo")}
      <p class="dp-kicker"${ek(s, "pedagog_diploma_kicker")}>${s.pedagog_diploma_kicker}</p>
      <h3 class="dp-name" id="${id}-namn">${h.name}</h3>
      ${h.year ? html`<p class="pd-rail pd-rail--dp"><span class="pd-plaque">${h.year}</span></p>` : html`<p class="dp-orn" aria-hidden="true">§</p>`}
      <div class="dp-text">${paragraphs(h.description)}</div>
      <div class="dp-foot">
        <span class="dp-sign"${ek(s, "pedagog_diploma_sign")}>${s.pedagog_diploma_sign}</span>
        <span class="dp-sign"${ek(s, "pedagog_diploma_vote")}>${s.pedagog_diploma_vote}</span>
      </div>
      ${step(newer, "prev", s.pedagog_newer)}${step(older, "next", s.pedagog_older)}
    </article>
  </div>`;
}
