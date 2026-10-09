import { html, paragraphs, raw, type SafeHtml } from "../lib/html.js";
import type { HonorRow } from "../lib/content.js";
import { MEDAL_DESIGNS, medalDesign, medalImageUrl, type MedalRow } from "../lib/medals.js";
import { ec, ek, type Settings } from "../lib/settings.js";
import { fill } from "../lib/texts.js";
import { picture } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { initials } from "../views/page.js";
import { emptyState } from "../views/components.js";

/**
 * Om oss → Hedersmedlemmar och utmärkelser.
 *
 * Samma innehåll i tre utseenden (Texter och sidor → Om oss → Utseende):
 *  - kabinett  Mörk museimonter: medaljerna i strålkastarljus, porträttgalleri med mässingsskyltar.
 *  - band      Varje medaljs band är en flik; medaljen svänger fram med sina mottagare.
 *  - kortlek   Hedersmedlemmarna som en kortlek, medaljerna som mynt med en baksida.
 *
 * Allt fungerar utan JavaScript (site.js gör bläddring, flikar och vändning smidigare).
 */

export const HONOR_STYLES = ["kabinett", "band", "kortlek"] as const;
export type HonorStyle = (typeof HONOR_STYLES)[number];

export interface MedalWithRecipients extends MedalRow {
  recipients: HonorRow[];
}

export interface HonorsData {
  members: HonorRow[];
  medals: MedalWithRecipients[];
  /** Utmärkelser utan vald (eller publicerad) medalj – visas som en enkel lista. */
  loose: HonorRow[];
}

export function honorsData(honors: HonorRow[], medals: MedalRow[]): HonorsData {
  const byId = new Map(medals.map((m) => [m.id, { ...m, recipients: [] as HonorRow[] }]));
  const loose: HonorRow[] = [];
  for (const h of honors) {
    if (h.kind !== "utmarkelse") continue;
    const m = h.medal_id ? byId.get(h.medal_id) : undefined;
    if (m) m.recipients.push(h);
    else loose.push(h);
  }
  return { members: honors.filter((h) => h.kind === "hedersmedlem"), medals: [...byId.values()], loose };
}

export function honorsSection(s: Settings, data: HonorsData): SafeHtml {
  const style = (HONOR_STYLES as readonly string[]).includes(s.honors_style) ? (s.honors_style as HonorStyle) : "kabinett";
  return style === "kortlek" ? kortlek(s, data) : style === "band" ? band(s, data) : kabinett(s, data);
}

// ───────────────────────── Gemensamt ─────────────────────────

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const roman = (i: number) => ROMAN[i] ?? String(i + 1);


function title(s: Settings): SafeHtml {
  return html`<h2 class="section-title" id="utmarkelser"${ek(s, "honors_title")}>${s.honors_title}</h2>`;
}

/** Medaljen: ett uppladdat foto om det finns, annars föreningens medaljbild. Dekorativ – namnet står bredvid. */
function medalArt(m: MedalRow, sizes: string, cls = "medal-img"): SafeHtml {
  if (m.image_key) return picture(m.image_key, { alt: "", sizes, className: cls, width: 480, height: 1000 });
  const d = MEDAL_DESIGNS[medalDesign(m.design)];
  return html`<img class="${cls}" src="${medalImageUrl(m.design)}" alt="" width="${d.width}" height="${d.height}" loading="lazy" decoding="async">`;
}

function kindWord(s: Settings, m: MedalRow): string {
  return m.kind === "orden" ? s.honors_kind_orden : s.honors_kind_medalj;
}

function medalMeta(s: Settings, m: MedalRow): string {
  return [kindWord(s, m), m.founded ? fill(s.honors_founded, { år: m.founded }) : ""].filter(Boolean).join(" · ");
}

function countText(s: Settings, n: number): string {
  return n ? fill(s.honors_count, { antal: n }) : s.honors_not_awarded;
}

function since(s: Settings, h: HonorRow): string {
  return h.year ? fill(s.honors_member_since, { år: h.year }) : "";
}

/** Porträtt i given storlek; utan foto en monogramplatta. */
function portrait(h: HonorRow, sizes: string, cls: string): SafeHtml {
  return h.photo_key
    ? picture(h.photo_key, { alt: "", sizes, className: `${cls}-img`, width: 600, height: 750 })
    : html`<span class="${cls}-initials" aria-hidden="true">${initials(h.name)}</span>`;
}


const editMember = (s: Settings, h: HonorRow) => ec(s, `/admin/utmarkelser/${h.id}`, `Utmärkelser › ${h.name}`);
const editMedal = (s: Settings, m: MedalRow) => ec(s, `/admin/medaljer/${m.id}`, `Ordnar och medaljer › ${m.name}`);

function recipientList(s: Settings, m: MedalWithRecipients, cls: string): SafeHtml {
  if (!m.recipients.length) return html`<p class="${cls}-none"${ek(s, "honors_not_awarded")}>${s.honors_not_awarded}</p>`;
  return html`<ul class="${cls}">${m.recipients.map(
    (r) => html`<li${editMember(s, r)}><span class="${cls}-name">${r.name}</span>${r.year ? html`<span class="${cls}-year">${r.year}</span>` : ""}</li>`,
  )}</ul>`;
}

/** Utmärkelser utan medalj (från tiden före belöningssystemet) – en enkel lista i alla utseenden. */
function looseAwards(s: Settings, data: HonorsData): SafeHtml | string {
  if (!data.loose.length) return "";
  return html`<div class="honors-loose">
    <h3 class="honors-subtitle"${ek(s, "honors_awards_title")}>${s.honors_awards_title}</h3>
    <ul class="honors-loose-list">${data.loose.map(
      (h) => html`<li${editMember(s, h)}>
        <span class="honors-loose-name">${h.name}</span>${h.year ? html`<span class="honors-loose-year">${h.year}</span>` : ""}
        ${h.description ? html`<div class="honors-loose-text">${paragraphs(h.description)}</div>` : ""}
      </li>`,
    )}</ul>
  </div>`;
}

function prevNext(s: Settings, attr: string): SafeHtml {
  return html`<div class="honors-arrows" ${raw(attr)} hidden>
    <button type="button" class="honors-arrow" data-dir="-1">${icon("chevronLeft", "icon")}<span class="sr-only">${s.honors_prev}</span></button>
    <button type="button" class="honors-arrow" data-dir="1">${icon("chevronRight", "icon")}<span class="sr-only">${s.honors_next}</span></button>
  </div>`;
}

// ───────────────────────── 1. Kabinettet ─────────────────────────

function kabinett(s: Settings, d: HonorsData): SafeHtml {
  return html`<section class="honors honors--kabinett" aria-labelledby="utmarkelser">
    <div class="container">
      <header class="hk-head">
        ${title(s)}
        <div class="prose"${ek(s, "honors_text")}>${paragraphs(s.honors_text)}</div>
      </header>

      <div class="hk-orders">
        <div class="hk-intro">
          <h3 class="hk-title"${ek(s, "rewards_title")}>${s.rewards_title}</h3>
          <div class="prose"${ek(s, "rewards_text")}>${paragraphs(s.rewards_text)}</div>
        </div>
        ${d.medals.length
          ? html`<ol class="hk-vitrine">${d.medals.map((m, i) => kabinettMedal(s, m, i))}</ol>`
          : emptyState(s.honors_medals_empty, ek(s, "honors_medals_empty"))}
      </div>

      <div class="hk-members">
        <div class="hk-members-head">
          <h3 class="hk-title"${ek(s, "honors_members_title")}>${s.honors_members_title}</h3>
          ${d.members.length > 1 ? prevNext(s, `data-scroller-nav`) : ""}
        </div>
        ${d.members.length
          ? html`<ul class="hk-gallery" data-scroller tabindex="0" aria-label="${s.honors_members_title}">${d.members.map((h) => kabinettPortrait(s, h))}</ul>`
          : emptyState(s.honors_members_empty, ek(s, "honors_members_empty"))}
      </div>
      ${looseAwards(s, d)}
    </div>
  </section>`;
}

function kabinettMedal(s: Settings, m: MedalWithRecipients, i: number): SafeHtml {
  const id = `medalj-${m.id}`;
  return html`<li class="hk-item"${editMedal(s, m)}>
    <button type="button" class="hk-case" popovertarget="${id}">
      <span class="hk-light" aria-hidden="true"></span>
      <span class="hk-art">${medalArt(m, "(min-width: 900px) 150px, 35vw")}</span>
      <span class="hk-label">
        <span class="hk-no">${roman(i)}</span>
        <span class="hk-name">${m.name}</span>
        <span class="hk-meta">${medalMeta(s, m)}</span>
        <span class="hk-count">${countText(s, m.recipients.length)}</span>
      </span>
    </button>
    <div class="hk-pop" id="${id}" popover role="dialog" aria-labelledby="${id}-namn">
      <button type="button" class="hk-close" popovertarget="${id}" popovertargetaction="hide">${icon("close", "icon")}<span class="sr-only">${s.honors_close}</span></button>
      <div class="hk-pop-art">${medalArt(m, "260px")}</div>
      <div class="hk-pop-body">
        <p class="hk-no">${roman(i)} · ${medalMeta(s, m)}</p>
        <h4 class="hk-pop-name" id="${id}-namn">${m.name}</h4>
        ${m.description ? html`<div class="prose">${paragraphs(m.description)}</div>` : ""}
        <h5 class="hk-pop-sub"${ek(s, "honors_recipients_title")}>${s.honors_recipients_title}</h5>
        ${recipientList(s, m, "hk-recipients")}
      </div>
    </div>
  </li>`;
}

function kabinettPortrait(s: Settings, h: HonorRow): SafeHtml {
  return html`<li class="hk-portrait"${editMember(s, h)}>
    <figure>
      <div class="hk-frame"><div class="hk-canvas">${portrait(h, "(min-width: 900px) 260px, 60vw", "hk-canvas")}</div></div>
      <figcaption class="hk-plaque"><span class="hk-plaque-name">${h.name}</span>${h.year ? html`<span class="hk-plaque-year">${since(s, h)}</span>` : ""}</figcaption>
    </figure>
    ${h.description
      ? html`<details class="hk-why"><summary${ek(s, "honors_read_more")}>${s.honors_read_more}</summary>${paragraphs(h.description)}</details>`
      : ""}
  </li>`;
}

// ───────────────────────── 2. Ordensbandet ─────────────────────────

function band(s: Settings, d: HonorsData): SafeHtml {
  const tabs = [
    ...(d.members.length || !d.medals.length ? [{ id: "heder", label: s.honors_members_title, medal: null as MedalRow | null }] : []),
    ...d.medals.map((m) => ({ id: `m${m.id}`, label: m.name, medal: m as MedalRow | null })),
  ];
  return html`<section class="honors honors--band" aria-labelledby="utmarkelser">
    <div class="container">
      <header class="hb-head">
        <div>
          ${title(s)}
          <div class="prose prose-lg"${ek(s, "honors_text")}>${paragraphs(s.honors_text)}</div>
        </div>
        <aside class="hb-aside">
          <h3 class="hb-aside-title"${ek(s, "rewards_title")}>${s.rewards_title}</h3>
          <div class="prose"${ek(s, "rewards_text")}>${paragraphs(s.rewards_text)}</div>
        </aside>
      </header>

      <nav class="hb-rack" aria-label="${s.honors_title}" data-tabs>
        ${tabs.map(
          (t, i) => html`<a class="hb-tab" href="#band-${t.id}" data-tab="band-${t.id}"${i === 0 ? html` aria-current="true"` : ""}>
            <span class="hb-ribbon${t.medal ? "" : " hb-ribbon--heder"}">${t.medal ? medalArt(t.medal, "120px", "hb-ribbon-img") : ""}</span>
            <span class="hb-tab-label">${t.label}</span>
          </a>`,
        )}
      </nav>

      <div class="hb-panels">
        ${tabs.some((t) => t.id === "heder") ? bandMembers(s, d) : ""}
        ${d.medals.map((m) => bandMedal(s, m))}
      </div>
      ${d.medals.length ? "" : emptyState(s.honors_medals_empty, ek(s, "honors_medals_empty"))}
      ${looseAwards(s, d)}
    </div>
  </section>`;
}

function bandMembers(s: Settings, d: HonorsData): SafeHtml {
  return html`<div class="hb-panel" id="band-heder" data-panel>
    <div class="hb-stage" aria-hidden="true"><div class="hb-seal"><span>§</span></div></div>
    <div class="hb-info">
      <h3 class="hb-name"${ek(s, "honors_members_title")}>${s.honors_members_title}</h3>
      ${d.members.length
        ? html`<ul class="hb-people">${d.members.map(
            (h) => html`<li class="hb-person"${editMember(s, h)}>
              <span class="hb-face">${portrait(h, "72px", "hb-face")}</span>
              <span class="hb-person-body">
                <span class="hb-person-name">${h.name}</span>
                ${h.year ? html`<span class="hb-person-year">${since(s, h)}</span>` : ""}
                ${h.description ? html`<details class="hb-why"><summary${ek(s, "honors_read_more")}>${s.honors_read_more}</summary>${paragraphs(h.description)}</details>` : ""}
              </span>
            </li>`,
          )}</ul>`
        : emptyState(s.honors_members_empty, ek(s, "honors_members_empty"))}
    </div>
  </div>`;
}

function bandMedal(s: Settings, m: MedalWithRecipients): SafeHtml {
  return html`<div class="hb-panel" id="band-m${m.id}" data-panel${editMedal(s, m)}>
    <div class="hb-stage"><div class="hb-swing">${medalArt(m, "(min-width: 900px) 220px, 50vw")}</div></div>
    <div class="hb-info">
      <p class="hb-kicker">${medalMeta(s, m)}</p>
      <h3 class="hb-name">${m.name}</h3>
      ${m.description ? html`<div class="prose">${paragraphs(m.description)}</div>` : ""}
      <h4 class="hb-sub"${ek(s, "honors_recipients_title")}>${s.honors_recipients_title}</h4>
      ${recipientList(s, m, "hb-tags")}
    </div>
  </div>`;
}

// ───────────────────────── 3. Kortleken ─────────────────────────

function kortlek(s: Settings, d: HonorsData): SafeHtml {
  const n = d.members.length;
  return html`<section class="honors honors--kortlek" aria-labelledby="utmarkelser">
    <div class="container">
      <header class="hd-head">
        ${title(s)}
        <div class="prose prose-lg"${ek(s, "honors_text")}>${paragraphs(s.honors_text)}</div>
      </header>

      ${n
        ? html`<div class="hd-table">
            <div class="hd-deck" data-deck>
              <ol class="hd-cards" aria-label="${s.honors_members_title}" data-deck-cards>
                ${d.members.map((h, i) => html`<li class="hd-card" id="hedersmedlem-${h.id}" data-deck-card${editMember(s, h)}>
                  <article class="hd-card-inner" aria-label="${h.name}">
                    <span class="hd-corner hd-corner--tl" aria-hidden="true">§<small>${h.year ?? ""}</small></span>
                    <span class="hd-corner hd-corner--br" aria-hidden="true">§<small>${h.year ?? ""}</small></span>
                    <div class="hd-photo">${portrait(h, "(min-width: 600px) 340px, 80vw", "hd-photo")}</div>
                    <div class="hd-card-body">
                      <h4 class="hd-name">${h.name}</h4>
                      ${h.year ? html`<p class="hd-since">${since(s, h)}</p>` : ""}
                      ${h.description ? html`<div class="hd-why">${paragraphs(h.description)}</div>` : ""}
                    </div>
                    <span class="sr-only">${i + 1} / ${n}</span>
                  </article>
                </li>`)}
              </ol>
              ${n > 1
                ? html`<div class="hd-controls" data-deck-controls hidden>
                    <button type="button" class="hd-btn" data-deck-prev>${icon("arrowRight", "icon icon-flip")}<span${ek(s, "honors_prev")}>${s.honors_prev}</span></button>
                    <span class="hd-count" aria-hidden="true"><b data-deck-current>1</b> / ${n}</span>
                    <button type="button" class="hd-btn" data-deck-next><span${ek(s, "honors_next")}>${s.honors_next}</span>${icon("arrowRight", "icon")}</button>
                  </div>`
                : ""}
            </div>
            <div class="hd-index">
              <h3 class="hd-index-title"${ek(s, "honors_members_title")}>${s.honors_members_title}</h3>
              <ol class="hd-index-list">${d.members.map(
                (h, i) => html`<li><a href="#hedersmedlem-${h.id}" data-deck-go="${i}"${i === 0 ? html` aria-current="true"` : ""}><span>${h.name}</span>${h.year ? html`<span class="hd-index-year">${h.year}</span>` : ""}</a></li>`,
              )}</ol>
            </div>
          </div>`
        : emptyState(s.honors_members_empty, ek(s, "honors_members_empty"))}

      <div class="hd-orders">
        <div class="hd-orders-intro">
          <h3 class="hd-orders-title"${ek(s, "rewards_title")}>${s.rewards_title}</h3>
          <div class="prose"${ek(s, "rewards_text")}>${paragraphs(s.rewards_text)}</div>
        </div>
        ${d.medals.length
          ? html`<ul class="hd-coins">${d.medals.map((m) => kortlekCoin(s, m))}</ul>`
          : emptyState(s.honors_medals_empty, ek(s, "honors_medals_empty"))}
      </div>
      ${looseAwards(s, d)}
    </div>
  </section>`;
}

function kortlekCoin(s: Settings, m: MedalWithRecipients): SafeHtml {
  return html`<li class="hd-coin"${editMedal(s, m)}>
    <div class="hd-coin-inner" data-flip>
      <div class="hd-face hd-front">
        <span class="hd-coin-art">${medalArt(m, "130px")}</span>
        <h4 class="hd-coin-name">${m.name}</h4>
        <p class="hd-coin-meta">${medalMeta(s, m)}</p>
      </div>
      <div class="hd-face hd-back" id="mynt-${m.id}">
        <h4 class="hd-coin-name">${m.name}</h4>
        ${m.description ? html`<div class="hd-back-text">${paragraphs(m.description)}</div>` : ""}
        <h5 class="hd-back-sub"${ek(s, "honors_recipients_title")}>${s.honors_recipients_title}</h5>
        ${recipientList(s, m, "hd-names")}
      </div>
    </div>
    <button type="button" class="hd-flip" data-flip-btn aria-expanded="false" aria-controls="mynt-${m.id}" hidden>
      <span class="hd-flip-icon" aria-hidden="true">${icon("history", "icon icon-sm")}</span><span${ek(s, "honors_flip")}>${s.honors_flip}</span><span class="sr-only">: ${m.name}</span>
    </button>
  </li>`;
}
