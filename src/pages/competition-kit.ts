import { html, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import { ec, ek, lines, siteLayout, type Settings } from "../lib/settings.js";
import { isLinkVisible } from "../lib/pagelayout.js";
import { fill } from "../lib/texts.js";
import { slugify } from "../lib/slug.js";
import { competitionDates, countdownTarget, dayMonth, instants, phaseAt, timeLeft, type EntryRow, type Phase, type ResourceRow } from "../lib/competition.js";
import { ASSET_VERSION, mediaUrl, picture } from "../views/layout.js";
import { icon } from "../views/icons.js";

/**
 * Tävlingssidans fliken Delta och rösta, del 2: bidragen (under och efter röstningen) och Verktyg och material
 * (program, logotyper och mallar att ladda ned, JFK:s färger, tips, Testa din design och en bild till Instagram).
 * Plus bannern på startsidan. Se competition.ts för resten av sidan.
 */

const newTab = html`<span class="sr-only"> (öppnas i ny flik)</span>`;

// ───────────── Bidragen ─────────────

/**
 * Bidragen visas först när röstningen har öppnat (de renderas inte alls innan dess, inte ens dolda), och
 * upphovspersonerna först när den har stängt (loadEntries hämtar inte namnen innan dess).
 */
export function entriesSection(s: Settings, entries: EntryRow[], phase: Phase): SafeHtml | string {
  if (!entries.length || (phase !== "voting" && phase !== "done")) return "";
  const done = phase === "done";
  const cats: { id: EntryRow["category"]; label: string }[] = [
    { id: "marke", label: s.comp_cat_badge_title },
    { id: "merch", label: s.comp_cat_merch_title },
  ];
  const present = cats.filter((c) => entries.some((e) => e.category === c.id));
  return html`<section class="t-block t-entries" aria-labelledby="bidragen" data-entries>
    <div class="t-entries-head">
      <div>
        <h2 class="t-h2" id="bidragen"${ek(s, "comp_entries_title")}>${s.comp_entries_title}</h2>
        ${done
          ? html`<p class="t-text-lg"${ek(s, "comp_entries_done_text")}>${s.comp_entries_done_text}</p>`
          : html`<p class="t-text-lg"${ek(s, "comp_entries_text")}>${s.comp_entries_text}</p>`}
      </div>
      ${present.length > 1
        ? html`<div class="t-filter" role="group" aria-label="${s.comp_subject_cat_label}" data-entry-filter hidden>
            <button type="button" aria-pressed="true" data-filter=""${ek(s, "comp_entries_all")}>${s.comp_entries_all}</button>
            ${present.map((c) => html`<button type="button" aria-pressed="false" data-filter="${c.id}">${c.label}</button>`)}
          </div>`
        : ""}
    </div>
    <ul class="t-entry-grid">
      ${entries.map((e) => {
        const name = fill(s.comp_entry_code, { kod: e.code });
        const cat = cats.find((c) => c.id === e.category)?.label ?? "";
        const full = e.image_key ? mediaUrl(e.image_key) : null;
        return html`<li class="t-entry${done && e.winner ? " is-winner" : ""}" data-category="${e.category}">
          <a class="t-entry-media" href="${full ?? "#"}" target="_blank" rel="noopener">
            ${e.image_key ? picture(e.image_key, { alt: e.alt || `${name}, ${cat}`, sizes: "(min-width: 900px) 280px, 50vw", width: 600, height: 600 }) : ""}
            <span class="sr-only"> – visa i full storlek (öppnas i ny flik)</span>
          </a>
          <div class="t-entry-body">
            <p class="t-entry-name"><span${ek(s, "comp_entry_code")}>${name}</span><span class="t-entry-cat">${cat}</span></p>
            ${done && e.designer ? html`<p class="t-entry-by"${ek(s, "comp_entry_by")}>${fill(s.comp_entry_by, { namn: e.designer })}</p>` : ""}
            ${done && e.winner ? html`<p class="t-entry-win"${ek(s, "comp_entry_winner")}>${icon("trophy", "icon icon-sm")}${s.comp_entry_winner}</p>` : ""}
          </div>
        </li>`;
      })}
    </ul>
  </section>`;
}

// ───────────── Verktyg och material ─────────────

/** Färdiga filer i public/assets/tavling (byggs av tools/design/tavling-material.py). */
function builtinDownloads(s: Settings): SafeHtml[] {
  const v = `?v=${ASSET_VERSION}`;
  const file = (name: string) => `/assets/tavling/${name}${v}`;
  const fmt = (href: string, label: string, kind: string, filename: string) =>
    html`<a class="t-dl-btn" href="${href}" download="${filename}"><span>${label}</span><span class="t-dl-kind">${kind}</span>${icon("arrowDown", "icon icon-sm")}</a>`;
  const tile = (title: SafeHtml, preview: SafeHtml, dark: boolean, formats: SafeHtml[]) =>
    html`<li class="t-dl"><div class="t-dl-preview${dark ? " is-dark" : ""}" aria-hidden="true">${preview}</div><div class="t-dl-body"><p class="t-dl-title">${title}</p><div class="t-dl-formats">${formats}</div></div></li>`;
  const img = (name: string) => html`<img src="${file(name)}" alt="" width="160" height="160" loading="lazy" decoding="async">`;
  return [
    tile(html`<span${ek(s, "comp_dl_logo_dark")}>${s.comp_dl_logo_dark}</span>`, img("jfk-logotyp.png"), false, [
      fmt(file("jfk-logotyp.svg"), "SVG", s.comp_dl_vector, "jfk-logotyp.svg"),
      fmt(file("jfk-logotyp.png"), "PNG", s.comp_dl_png, "jfk-logotyp.png"),
    ]),
    tile(html`<span${ek(s, "comp_dl_logo_light")}>${s.comp_dl_logo_light}</span>`, img("jfk-logotyp-ljus.png"), true, [
      fmt(file("jfk-logotyp-ljus.svg"), "SVG", s.comp_dl_vector, "jfk-logotyp-ljus.svg"),
      fmt(file("jfk-logotyp-ljus.png"), "PNG", s.comp_dl_png, "jfk-logotyp-ljus.png"),
    ]),
    tile(html`<span${ek(s, "comp_dl_badge")}>${s.comp_dl_badge}</span>`, img("mall-marke.svg"), false, [fmt(file("mall-marke.svg"), "SVG", s.comp_dl_vector, "jfk-mall-marke.svg")]),
    tile(html`<span${ek(s, "comp_dl_print")}>${s.comp_dl_print}</span>`, img("mall-tryck.svg"), false, [fmt(file("mall-tryck.svg"), "SVG", s.comp_dl_vector, "jfk-mall-tryck.svg")]),
  ];
}

function uploadedDownload(s: Settings, r: ResourceRow): SafeHtml {
  const key = r.file_key!;
  const ext = /\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase() ?? "jpg";
  const filename = `${slugify(r.title) || "jfk-material"}.${ext}`;
  return html`<li class="t-dl"${ec(s, `/admin/tavling-material/${r.id}`, `Tävlingen › ${r.title}`)}>
    <div class="t-dl-preview is-photo" aria-hidden="true">${picture(key, { alt: "", sizes: "160px", width: 320, height: 320 })}</div>
    <div class="t-dl-body">
      <p class="t-dl-title">${r.title}</p>
      ${r.description ? html`<p class="t-dl-desc">${r.description}</p>` : ""}
      <div class="t-dl-formats">
        <a class="t-dl-btn" href="${mediaUrl(key)}" download="${filename}"><span${ek(s, "comp_dl_button")}>${s.comp_dl_button}</span><span class="t-dl-kind">${r.label || ext.toUpperCase()}</span>${icon("arrowDown", "icon icon-sm")}</a>
      </div>
    </div>
  </li>`;
}

/** Testa din design: bilden visas på ett märke och en tröja – bara i webbläsaren (tavling.js), inget laddas upp. */
function tryOn(s: Settings): SafeHtml {
  return html`<div class="t-kit-card t-try" data-try hidden>
    <h3 class="t-h3"${ek(s, "comp_try_title")}>${s.comp_try_title}</h3>
    <p class="t-kit-text"${ek(s, "comp_try_text")}>${s.comp_try_text}</p>
    <div class="t-try-stage" data-try-stage="marke">
      ${raw(`<svg class="t-try-svg t-try-patch" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true" focusable="false">
        <defs><clipPath id="t-try-circle"><circle cx="100" cy="100" r="72"/></clipPath></defs>
        <circle class="pa-shadow" cx="104" cy="106" r="86"/>
        <circle class="pa-edge" cx="100" cy="100" r="86"/>
        <circle class="pa-merrow" cx="100" cy="100" r="80"/>
        <circle class="pa-face" cx="100" cy="100" r="72"/>
        <image data-try-img x="28" y="28" width="144" height="144" preserveAspectRatio="xMidYMid slice" clip-path="url(#t-try-circle)"/>
        <circle class="pa-stitch" cx="100" cy="100" r="64"/>
      </svg>`)}
      ${raw(`<svg class="t-try-svg t-try-shirt" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true" focusable="false">
        <path class="sh-shadow" d="M74 34 52 42 22 64l16 30 18-10v86h96V84l18 10 16-30-30-22-22-8c-4 10-16 16-30 16S78 44 74 34Z" transform="translate(4 6)"/>
        <path class="sh-body" d="M74 34 52 42 22 64l16 30 18-10v86h96V84l18 10 16-30-30-22-22-8c-4 10-16 16-30 16S78 44 74 34Z"/>
        <path class="sh-collar" d="M74 34c4 10 16 16 30 16s26-6 30-16"/>
        <rect class="sh-print" x="72" y="68" width="64" height="72" rx="4" data-try-area/>
        <image data-try-img x="74" y="70" width="60" height="68" preserveAspectRatio="xMidYMid meet"/>
      </svg>`)}
    </div>
    <div class="t-try-controls">
      <fieldset class="t-seg">
        <legend class="sr-only">${s.comp_subject_cat_label}</legend>
        <label class="t-seg-opt"><input type="radio" name="t-try-kind" value="marke" checked><span>${s.comp_cat_badge_title}</span></label>
        <label class="t-seg-opt"><input type="radio" name="t-try-kind" value="merch"><span>${s.comp_cat_merch_title}</span></label>
      </fieldset>
      <label class="t-btn t-btn-outline t-try-pick">
        ${icon("image", "icon icon-sm")}<span data-try-label data-again="${s.comp_try_again}"${ek(s, "comp_try_button")}>${s.comp_try_button}</span>
        <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" data-try-input>
      </label>
    </div>
  </div>`;
}

/**
 * Sprid tävlingen: en färdig bild till Instagram – story (1080 × 1920) eller inlägg (1080 × 1350) – med nedräkningen,
 * ritad i webbläsaren (tavling.js). Bakgrunden är styrelsens bild (Texter och sidor) eller en egen som besökaren väljer;
 * den egna bilden stannar i webbläsaren.
 */
function shareCard(s: Settings): SafeHtml {
  const bg = s.comp_share_image ? mediaUrl(s.comp_share_image, "md") : "";
  return html`<div class="t-kit-card t-share" data-share hidden data-format="story" data-site="${s.site_name}" data-kicker="${s.comp_kicker}" data-title="${s.comp_title}" data-left="${s.comp_share_left}"
      data-bg="${bg ?? ""}" data-units="${[s.comp_unit_days, s.comp_unit_hours, s.comp_unit_minutes].join(";")}"${ek(s, "comp_share_image")}>
    <div class="t-share-preview">
      <img data-share-preview alt="Förhandsvisning av bilden till Instagram" width="1080" height="1920">
    </div>
    <div class="t-share-body">
      <h3 class="t-h3"${ek(s, "comp_share_title")}>${s.comp_share_title}</h3>
      <p class="t-kit-text"${ek(s, "comp_share_text")}>${s.comp_share_text}</p>
      <fieldset class="t-seg">
        <legend class="sr-only"${ek(s, "comp_share_format")}>${s.comp_share_format}</legend>
        <label class="t-seg-opt"><input type="radio" name="t-share-format" value="story" checked><span${ek(s, "comp_share_story")}>${s.comp_share_story} <small>9:16</small></span></label>
        <label class="t-seg-opt"><input type="radio" name="t-share-format" value="post"><span${ek(s, "comp_share_post")}>${s.comp_share_post} <small>4:5</small></span></label>
      </fieldset>
      <div class="t-share-own">
        <label class="t-btn t-btn-outline t-try-pick">
          ${icon("image", "icon icon-sm")}<span${ek(s, "comp_share_own")}>${s.comp_share_own}</span>
          <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-share-input>
        </label>
        <button class="t-text-btn" type="button" data-share-reset hidden${ek(s, "comp_share_reset")}>${s.comp_share_reset}</button>
      </div>
      <button class="t-btn t-btn-gold" type="button" data-share-button>${icon("arrowDown", "icon icon-sm")}<span${ek(s, "comp_share_button")}>${s.comp_share_button}</span></button>
    </div>
  </div>`;
}

export function kitSection(s: Settings, resources: ResourceRow[], phase: Phase): SafeHtml {
  const programs = resources.filter((r) => r.kind === "program");
  const files = resources.filter((r) => r.kind === "fil");
  const downloads = [...(s.comp_builtin === "nej" ? [] : builtinDownloads(s)), ...files.map((r) => uploadedDownload(s, r))];
  const names = s.comp_color_names.split("|").map((x) => x.trim());
  const colors = [s.color_accent, s.color_primary, s.color_background].map((hex, i) => ({ hex: hex.toUpperCase(), name: names[i] ?? "" }));
  const tips = (titleKey: "comp_tips_badge_title" | "comp_tips_print_title", listKey: "comp_tips_badge" | "comp_tips_print", ic: "palette" | "image") =>
    lines(s[listKey]).length
      ? html`<div class="t-kit-card t-tips">
          <h3 class="t-h4"${ek(s, titleKey)}>${icon(ic, "icon icon-sm")}${s[titleKey]}</h3>
          <ul${ek(s, listKey)}>${lines(s[listKey]).map((l) => html`<li>${l}</li>`)}</ul>
        </div>`
      : "";
  const showShare = phase !== "done";

  return html`<section class="t-block t-kit" aria-labelledby="material-rubrik" id="material">
    <header class="t-kit-head">
      <h2 class="t-h2" id="material-rubrik"${ek(s, "comp_kit_title")}>${s.comp_kit_title}</h2>
      <p class="t-text-lg"${ek(s, "comp_kit_lead")}>${s.comp_kit_lead}</p>
    </header>

    ${programs.length
      ? html`<h3 class="t-kit-sub"${ek(s, "comp_programs_title")}>${s.comp_programs_title}</h3>
          <ul class="t-programs">
            ${programs.map(
              (p) => html`<li class="t-program"${ec(s, `/admin/tavling-material/${p.id}`, `Tävlingen › ${p.title}`)}>
                <div class="t-program-head">
                  <span class="t-program-mark" aria-hidden="true">${p.title.charAt(0)}</span>
                  <div><p class="t-program-name">${p.title}</p>${p.label ? html`<p class="t-program-label">${p.label}</p>` : ""}</div>
                </div>
                ${p.description ? html`<p class="t-program-desc">${p.description}</p>` : ""}
                <a class="t-program-link" href="${safeUrl(p.url)}" target="_blank" rel="noopener"${ek(s, "comp_program_link")}>${fill(s.comp_program_link, { namn: p.title })}${icon("external", "icon icon-sm")}${newTab}</a>
              </li>`,
            )}
          </ul>`
      : ""}

    ${downloads.length
      ? html`<h3 class="t-kit-sub"${ek(s, "comp_downloads_title")}>${s.comp_downloads_title}</h3>
          <ul class="t-downloads">${downloads}</ul>`
      : ""}

    <div class="t-kit-grid">
      <div class="t-kit-card t-colors">
        <h3 class="t-h4"${ek(s, "comp_colors_title")}>${icon("palette", "icon icon-sm")}${s.comp_colors_title}</h3>
        <p class="t-kit-text"${ek(s, "comp_colors_text")}>${s.comp_colors_text}</p>
        <ul class="t-swatches">
          ${colors.map(
            (c, i) => html`<li>
              <button class="t-swatch" type="button" data-copy-value="${c.hex}" data-swatch="${i}" aria-label="${c.name} ${c.hex} – ${s.comp_copy.toLocaleLowerCase("sv")}">
                <span class="t-swatch-chip t-swatch-chip--${i}" aria-hidden="true"></span>
                <span class="t-swatch-name">${c.name}</span>
                <span class="t-swatch-hex" data-copy-label>${c.hex}</span>
              </button>
            </li>`,
          )}
        </ul>
      </div>
      ${tips("comp_tips_badge_title", "comp_tips_badge", "palette")}
      ${tips("comp_tips_print_title", "comp_tips_print", "image")}
    </div>

    <div class="t-kit-grid t-kit-grid--2">
      ${tryOn(s)}
      ${showShare ? shareCard(s) : ""}
    </div>
  </section>`;
}

/** Färgrutorna i "JFK:s färger" – färgerna kommer från Utseende, därför som CSS i en style-tagg med nonce. */
export function swatchCss(s: Settings): string {
  const hex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#cccccc");
  return [s.color_accent, s.color_primary, s.color_background].map((c, i) => `.jfk-tavling .t-swatch-chip--${i}{background:${hex(c)}}`).join("");
}

// ───────────── Bannern på startsidan ─────────────

/** Liten banner under toppen på startsidan medan tävlingen pågår. Visas bara när tävlingssidan visas. */
export function competitionBanner(s: Settings, now = Date.now()): SafeHtml | string {
  if (s.comp_banner === "nej" || !isLinkVisible(siteLayout(s), "/tavling")) return "";
  const d = competitionDates(s);
  const t = instants(d);
  const phase = phaseAt(t, now);
  if (phase === "done") return "";
  const target = countdownTarget(t, phase);
  const kvar = target ? timeLeft(target - now, { days: s.comp_unit_days, hours: s.comp_unit_hours, minutes: s.comp_unit_minutes }) : "";
  const key = ({ before: "comp_banner_before", open: "comp_banner_open", between: "comp_banner_between", voting: "comp_banner_voting" } as const)[phase];
  const datum = phase === "before" ? dayMonth(d.open) : dayMonth(d.voteStart);
  const live = phase === "open" || phase === "voting";
  return html`<aside class="comp-banner${live ? " is-live" : ""}" aria-label="${s.comp_title}">
    <div class="container comp-banner-inner">
      <span class="comp-banner-dot" aria-hidden="true"></span>
      <p class="comp-banner-text"${ek(s, key)}>${fill(s[key], { datum, kvar })}</p>
      <a class="comp-banner-link" href="/tavling${phase === "voting" ? "#delta" : ""}"${ek(s, "comp_banner_link")}>${s.comp_banner_link}${icon("arrowRight", "icon icon-sm")}</a>
    </div>
  </aside>`;
}
