import { html, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import { ek, lines, loadSettings, type SettingKey, type Settings } from "../lib/settings.js";
import { inline, renderMarkdown } from "../lib/markdown.js";
import { localToIso } from "../lib/format.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import { icsResponse, icsText, icsTime, nowStamp, VTIMEZONE } from "../lib/ics.js";
import {
  clock,
  competitionDates,
  countdownTarget,
  dayMonth,
  dayMonthClock,
  dayMonthShort,
  instants,
  longDateClock,
  period,
  phaseAt,
  progressAt,
  splitDuration,
  unitForms,
  type Phase,
} from "../lib/competition.js";
import type { RequestContext } from "../router.js";
import { entriesSection, kitSection, swatchCss } from "./competition-kit.js";
import { loadEntries, loadResources } from "../lib/competition.js";
import { ASSET_VERSION, layout, picture } from "../views/layout.js";
import { icon, type IconName } from "../views/icons.js";

/**
 * Merch- och märkestävlingen (/tavling). Tre flikar: Om tävlingen, Regler, Delta och rösta.
 *
 * - Alla texter, datum, e-postadressen och länken till röstningen ändras i adminpanelen:
 *   Texter och sidor → Merch- och märkestävlingen (textregistret, src/lib/texts.ts, fälten comp_*).
 *   ⇒ Länken till röstningen (Google Formulär): fältet "Länk till röstningen" (comp_vote_url).
 *   ⇒ Datumen: avsnittet "Datum och tider" (comp_open_at, comp_deadline_at, comp_vote_start_at, comp_vote_end_at).
 *   ⇒ E-posten: fältet "E-post för bidrag" (comp_email).
 * - Sidan har en egen grafisk profil, scopad under .jfk-tavling (public/assets/tavling.css): mörkblått och guld,
 *   Playfair Display + DM Sans (självhostade), ljust och mörkt läge.
 * - Fungerar utan JavaScript: alla flikar visas efter varandra och nedräkningen visar läget när sidan hämtades.
 *   public/assets/tavling.js gör flikarna, nedräkningen (varje sekund), kopieringsknapparna och ämnesraden.
 * - Läget (före/öppen/röstning …) räknas ut både här och i tavling.js, så att sidan byter läge av sig själv
 *   när tiden passerar. Element med data-states="läge:tillstånd …" får data-state, och deras barn med
 *   data-when="tillstånd …" visas bara i de tillstånden.
 */

type StateMap = Partial<Record<Phase, string>>;

/** data-states + data-state för ett element (se tavling.js). */
function states(map: StateMap, phase: Phase): SafeHtml {
  const spec = (Object.entries(map) as [Phase, string][]).map(([p, st]) => `${p}:${st}`).join(" ");
  return html` data-states="${spec}" data-state="${map[phase] ?? ""}"`;
}

/** data-when för ett barn: visas bara när föräldern har ett av tillstånden. */
function when(list: string, current: string | undefined): SafeHtml {
  return html` data-when="${list}"${list.split(" ").includes(current ?? "") ? "" : html` hidden`}`;
}

const PHASE_STATES: StateMap = { before: "before", open: "open", between: "between", voting: "voting", done: "done" };
const SUBMIT_STATES: StateMap = { before: "soon", open: "open", between: "closed", voting: "closed", done: "closed" };
const VOTE_STATES: StateMap = { before: "soon", open: "soon", between: "soon", voting: "open", done: "closed" };
/** Tidslinjens fyra steg: "now" = pågår, "next" = nästa, "done" = klart, "" = senare. */
const STEP_STATES: StateMap[] = [
  { before: "next", open: "now", between: "done", voting: "done", done: "done" },
  { before: "", open: "next", between: "done", voting: "done", done: "done" },
  { before: "", open: "", between: "next", voting: "now", done: "done" },
  { before: "", open: "", between: "", voting: "next", done: "now" },
];

const newTab = html`<span class="sr-only"> (öppnas i ny flik)</span>`;

/** Rubriken med "&" i guld. Texten escapas som vanligt – bara spannet runt tecknet är kod. */
function titleWithAmp(title: string): SafeHtml {
  const parts = title.split("&");
  return html`${parts.map((p, i) => html`${i ? html`<span class="t-amp">&amp;</span>` : ""}${p}`)}`;
}

/** Fyrkantiga ikonrutor i guld. */
const badge = (name: IconName, cls = "t-ico") => html`<span class="${cls}" aria-hidden="true">${icon(name, "icon")}</span>`;

export async function competitionPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const d = competitionDates(s);
  const t = instants(d);
  const now = Date.now();
  const phase = phaseAt(t, now);
  const target = countdownTarget(t, phase);
  const left = splitDuration(target === null ? 0 : target - now);
  const progress = progressAt(t, now);
  // Upphovspersonerna hämtas bara när röstningen är klar – innan dess finns namnen aldrig i sidan.
  const [entries, resources] = await Promise.all([loadEntries(c.env.DB, phase === "done"), loadResources(c.env.DB)]);

  const email = s.comp_email;
  const vars = {
    datum: "",
    epost: email,
    deadline: dayMonthClock(d.deadline),
    period: period(d.voteStart, d.voteEnd),
    tid: clock(d.deadline),
  };
  const iso = (ms: number) => new Date(ms).toISOString();

  // ───────────── Toppen ─────────────

  const phaseChip = html`<p class="t-chip" aria-live="polite">
    <span class="t-chip-dot" aria-hidden="true"></span>
    <span${when("before", PHASE_STATES[phase])}${ek(s, "comp_phase_before")}>${fill(s.comp_phase_before, { datum: dayMonth(d.open) })}</span>
    <span${when("open", PHASE_STATES[phase])}${ek(s, "comp_phase_open")}>${fill(s.comp_phase_open, { datum: dayMonthClock(d.deadline) })}</span>
    <span${when("between", PHASE_STATES[phase])}${ek(s, "comp_phase_between")}>${fill(s.comp_phase_between, { datum: dayMonth(d.voteStart) })}</span>
    <span${when("voting", PHASE_STATES[phase])}${ek(s, "comp_phase_voting")}>${fill(s.comp_phase_voting, { datum: dayMonthClock(d.voteEnd) })}</span>
    <span${when("done", PHASE_STATES[phase])}${ek(s, "comp_phase_done")}>${s.comp_phase_done}</span>
  </p>`;

  const units: [string, SettingKey, number][] = [
    ["d", "comp_unit_days", left.d],
    ["h", "comp_unit_hours", left.h],
    ["m", "comp_unit_minutes", left.m],
    ["s", "comp_unit_seconds", left.s],
  ];
  const countdown = html`<div class="t-countdown"${states(PHASE_STATES, phase)}>
    <p class="t-countdown-label">
      <span${when("before open", phase)}${ek(s, "comp_countdown_deadline")}>${s.comp_countdown_deadline}</span>
      <span${when("between", phase)}${ek(s, "comp_countdown_vote_start")}>${s.comp_countdown_vote_start}</span>
      <span${when("voting", phase)}${ek(s, "comp_countdown_vote_end")}>${s.comp_countdown_vote_end}</span>
      <span${when("done", phase)}${ek(s, "comp_countdown_done")}>${s.comp_countdown_done}</span>
    </p>
    <div class="t-clock" role="timer" aria-live="off" data-countdown${when("before open between voting", phase)}>
      ${units.map(([u, key, n]) => {
        const [one, many] = unitForms(s[key]);
        return html`<div class="t-clock-cell">
          <span class="t-clock-num" data-unit="${u}">${u === "d" ? String(n) : String(n).padStart(2, "0")}</span>
          <span class="t-clock-unit" data-one="${one}" data-many="${many}"${ek(s, key)}>${n === 1 ? one : many}</span>
        </div>`;
      })}
    </div>
    <p class="t-countdown-when">
      <span${when("before open", phase)}>${icon("hourglass", "icon icon-sm")}<time datetime="${localToIso(d.deadline) ?? d.deadline}">${capitalize(longDateClock(d.deadline))}</time></span>
      <span${when("between", phase)}>${icon("ballot", "icon icon-sm")}<time datetime="${localToIso(d.voteStart) ?? d.voteStart}">${capitalize(longDateClock(d.voteStart))}</time></span>
      <span${when("voting", phase)}>${icon("ballot", "icon icon-sm")}<time datetime="${localToIso(d.voteEnd) ?? d.voteEnd}">${capitalize(longDateClock(d.voteEnd))}</time></span>
    </p>
    <a class="t-cal-link" href="/tavling/kalender.ics" download${ek(s, "comp_calendar")}>${icon("calendar", "icon icon-sm")}${s.comp_calendar}</a>
  </div>`;

  const hero = html`<section class="t-hero${s.comp_hero_image ? " has-photo" : ""}" aria-labelledby="t-title">
    ${s.comp_hero_image ? html`<div class="t-hero-photo" aria-hidden="true"${ek(s, "comp_hero_image")}>${picture(s.comp_hero_image, { alt: "", sizes: "100vw", width: 1600, height: 900, eager: true })}</div>` : ""}
    ${heroArt()}
    <div class="container t-hero-grid">
      <div class="t-hero-copy">
        <p class="t-kicker"${ek(s, "comp_kicker")}>${s.comp_kicker}</p>
        <h1 class="t-title" id="t-title"${ek(s, "comp_title")}>${titleWithAmp(s.comp_title)}</h1>
        ${phaseChip}
        <p class="t-lead"${ek(s, "comp_lead")}>${s.comp_lead}</p>
        <div class="t-actions">
          <a class="t-btn t-btn-gold" href="#delta" data-tab-link${ek(s, "comp_cta_take")}>${s.comp_cta_take}${icon("arrowRight", "icon icon-sm")}</a>
          <a class="t-btn t-btn-ghost" href="#regler" data-tab-link${ek(s, "comp_cta_rules")}>${s.comp_cta_rules}</a>
        </div>
      </div>
      ${countdown}
    </div>
  </section>`;

  // ───────────── Flikarna ─────────────

  const tabs = [
    { id: "om", label: s.comp_tab_about, key: "comp_tab_about" as const },
    { id: "regler", label: s.comp_tab_rules, key: "comp_tab_rules" as const },
    { id: "delta", label: s.comp_tab_take, key: "comp_tab_take" as const },
  ];
  const tabBar = html`<div class="t-tabs-bar">
    <div class="container">
      <nav class="t-tabs" aria-label="${s.comp_title}" data-tabs>
        ${tabs.map(
          (tb, i) => html`<a class="t-tab" href="#${tb.id}" id="flik-${tb.id}" data-tab="${tb.id}"><span class="t-tab-num" aria-hidden="true">0${i + 1}</span><span${ek(s, tb.key)}>${tb.label}</span></a>`,
        )}
      </nav>
    </div>
  </div>`;
  const nextLink = (i: number) => {
    const n = tabs[i + 1];
    return n
      ? html`<p class="t-next"><a href="#${n.id}" data-tab-link${ek(s, "comp_next")}>${fill(s.comp_next, { flik: n.label })}${icon("arrowRight", "icon icon-sm")}</a></p>`
      : "";
  };

  // ── Flik 1: Om tävlingen ──

  const winners = s.comp_winners_text || s.comp_winner_1 || s.comp_winner_2
    ? html`<section class="t-winners" aria-labelledby="vinnare">
        <div class="t-winners-head">
          ${badge("trophy", "t-ico t-ico-lg")}
          <h2 class="t-h2" id="vinnare"${ek(s, "comp_winners_title")}>${s.comp_winners_title}</h2>
        </div>
        ${s.comp_winners_text ? html`<div class="t-prose"${ek(s, "comp_winners_text")}>${renderMarkdown(s.comp_winners_text)}</div>` : ""}
        ${s.comp_winner_1 || s.comp_winner_2
          ? html`<div class="t-winners-grid">
              ${(
                [
                  ["comp_winner_1", "comp_winner_1_caption"],
                  ["comp_winner_2", "comp_winner_2_caption"],
                ] as const
              ).map(([img, cap]) =>
                s[img]
                  ? html`<figure class="t-winner"${ek(s, img)}>
                      ${picture(s[img], { alt: s[cap], sizes: "(min-width: 760px) 40vw, 100vw", width: 800, height: 800 })}
                      ${s[cap] ? html`<figcaption${ek(s, cap)}>${s[cap]}</figcaption>` : ""}
                    </figure>`
                  : "",
              )}
            </div>`
          : ""}
      </section>`
    : "";

  const why: [IconName, SettingKey, SettingKey][] = [
    ["ballot", "comp_why_1_title", "comp_why_1_text"],
    ["sparkle", "comp_why_2_title", "comp_why_2_text"],
    ["users", "comp_why_3_title", "comp_why_3_text"],
  ];

  const category = (kind: "badge" | "merch") => {
    const [title, text, facts, img, alt] =
      kind === "badge"
        ? (["comp_cat_badge_title", "comp_cat_badge_text", "comp_cat_badge_facts", "comp_cat_badge_image", "comp_cat_badge_image_alt"] as const)
        : (["comp_cat_merch_title", "comp_cat_merch_text", "comp_cat_merch_facts", "comp_cat_merch_image", "comp_cat_merch_image_alt"] as const);
    // Med en egen bild (Texter och sidor) visas den i stället för teckningen.
    const art = s[img]
      ? html`<div class="t-cat-art has-photo"${ek(s, img)}>${picture(s[img], { alt: s[alt], sizes: "(min-width: 760px) 45vw, 100vw", width: 900, height: 500 })}</div>`
      : html`<div class="t-cat-art" aria-hidden="true">${kind === "badge" ? patchArt() : shirtArt()}</div>`;
    return html`<article class="t-cat t-cat--${kind}">
      ${art}
      <div class="t-cat-body">
        <h3 class="t-h3"${ek(s, title)}>${s[title]}</h3>
        <p${ek(s, text)}>${s[text]}</p>
        <ul class="t-facts"${ek(s, facts)}>${lines(s[facts]).map((f) => html`<li>${icon("check", "icon icon-sm")}<span>${f}</span></li>`)}</ul>
      </div>
    </article>`;
  };

  const steps: { icon: IconName; title: SettingKey; text: SettingKey; when: SafeHtml; datetime: string }[] = [
    { icon: "flag", title: "comp_step_1", text: "comp_step_1_text", when: html`${dayMonthShort(d.open)}`, datetime: localToIso(d.open) ?? d.open },
    { icon: "hourglass", title: "comp_step_2", text: "comp_step_2_text", when: html`${dayMonthShort(d.deadline)} <span class="t-step-time">kl. ${clock(d.deadline)}</span>`, datetime: localToIso(d.deadline) ?? d.deadline },
    { icon: "ballot", title: "comp_step_3", text: "comp_step_3_text", when: html`${period(d.voteStart, d.voteEnd, true)}`, datetime: localToIso(d.voteStart) ?? d.voteStart },
    { icon: "trophy", title: "comp_step_4", text: "comp_step_4_text", when: html`<span${ek(s, "comp_step_4_when")}>${fill(s.comp_step_4_when, { datum: dayMonthShort(d.voteEnd) })}</span>`, datetime: localToIso(d.voteEnd) ?? d.voteEnd },
  ];
  const timeline = html`<section class="t-block" aria-labelledby="tidslinje">
    <h2 class="t-h2" id="tidslinje"${ek(s, "comp_timeline_title")}>${s.comp_timeline_title}</h2>
    <ol class="t-timeline" data-timeline>
      <li class="t-track" aria-hidden="true"><span class="t-track-fill"></span></li>
      ${steps.map((st, i) => {
        const state = STEP_STATES[i]![phase];
        return html`<li class="t-step t-step--${i + 1}"${states(STEP_STATES[i]!, phase)}>
          <span class="t-step-dot" aria-hidden="true">${icon(st.icon, "icon")}</span>
          <div class="t-step-body">
            <p class="t-step-when"><time datetime="${st.datetime}">${st.when}</time></p>
            <h3 class="t-step-title"${ek(s, st.title)}>${s[st.title]}</h3>
            <p class="t-step-text"${ek(s, st.text)}>${fill(s[st.text], { tid: clock(d.deadline) })}</p>
            <p class="t-step-status">
              <span class="t-pill t-pill--done"${when("done", state)}${ek(s, "comp_status_done")}>${icon("check", "icon icon-sm")}${s.comp_status_done}</span>
              <span class="t-pill t-pill--now"${when("now", state)}${ek(s, "comp_status_now")}><span class="t-live" aria-hidden="true"></span>${s.comp_status_now}</span>
              <span class="t-pill t-pill--next"${when("next", state)}${ek(s, "comp_status_next")}>${s.comp_status_next}</span>
            </p>
          </div>
        </li>`;
      })}
    </ol>
  </section>`;

  const aboutPanel = html`<section class="t-panel" id="om" aria-labelledby="flik-om" data-panel>
    ${winners}
    <div class="t-intro">
      <div>
        <h2 class="t-h2"${ek(s, "comp_about_title")}>${s.comp_about_title}</h2>
        <p class="t-text-lg"${ek(s, "comp_about_text")}>${s.comp_about_text}</p>
      </div>
      <ul class="t-why">
        ${why.map(
          ([ic, title, text]) => html`<li>
            ${badge(ic)}
            <div><h3 class="t-h4"${ek(s, title)}>${s[title]}</h3><p${ek(s, text)}>${s[text]}</p></div>
          </li>`,
        )}
      </ul>
    </div>
    <section class="t-block" aria-labelledby="kategorier">
      <h2 class="t-h2" id="kategorier"${ek(s, "comp_cat_title")}>${s.comp_cat_title}</h2>
      <div class="t-cats">${category("badge")}${category("merch")}</div>
    </section>
    ${photosSection(s)}
    ${timeline}
    ${nextLink(0)}
  </section>`;

  // ── Flik 2: Regler ──

  const rule = (n: number, ic: IconName, title: SettingKey, body: SafeHtml, wide = false) => html`<article class="t-rule${wide ? " t-rule--wide" : ""}" id="regel-${n}">
    <header class="t-rule-head">
      <span class="t-rule-num" aria-hidden="true">§ ${n}</span>
      ${badge(ic)}
      <h3 class="t-h3"><span class="sr-only">Regel ${n}: </span><span${ek(s, title)}>${s[title]}</span></h3>
    </header>
    ${body}
  </article>`;
  const md = (key: SettingKey) => html`<div class="t-prose"${ek(s, key)}>${renderMarkdown(fill(s[key], vars))}</div>`;
  const doDont = html`<div class="t-dodont">
    <div class="t-do">
      <h4 class="t-h5"${ek(s, "comp_rule_3_ok_title")}>${icon("heart", "icon icon-sm")}${s.comp_rule_3_ok_title}</h4>
      <ul${ek(s, "comp_rule_3_ok")}>${lines(s.comp_rule_3_ok).map((l) => html`<li>${icon("check", "icon icon-sm")}<span>${l}</span></li>`)}</ul>
    </div>
    <div class="t-dont">
      <h4 class="t-h5"${ek(s, "comp_rule_3_no_title")}>${icon("ban", "icon icon-sm")}${s.comp_rule_3_no_title}</h4>
      <ul${ek(s, "comp_rule_3_no")}>${lines(s.comp_rule_3_no).map((l) => html`<li>${icon("close", "icon icon-sm")}<span>${l}</span></li>`)}</ul>
    </div>
  </div>`;

  const rulesPanel = html`<section class="t-panel" id="regler" aria-labelledby="flik-regler" data-panel>
    <header class="t-panel-head">
      <h2 class="t-h2"${ek(s, "comp_rules_title")}>${s.comp_rules_title}</h2>
      <p class="t-text-lg"${ek(s, "comp_rules_lead")}>${s.comp_rules_lead}</p>
    </header>
    <aside class="t-summary" aria-labelledby="kort-sagt">
      <h3 class="t-h4" id="kort-sagt"${ek(s, "comp_summary_title")}>${icon("checklist", "icon icon-sm")}${s.comp_summary_title}</h3>
      <ul${ek(s, "comp_summary")}>${lines(s.comp_summary).map((l) => html`<li>${l}</li>`)}</ul>
    </aside>
    <div class="t-rules">
      ${rule(1, "users", "comp_rule_1_title", md("comp_rule_1"))}
      ${rule(2, "fileUp", "comp_rule_2_title", md("comp_rule_2"))}
      ${rule(3, "palette", "comp_rule_3_title", html`${md("comp_rule_3")}${doDont}`, true)}
      ${rule(4, "eyeOff", "comp_rule_4_title", md("comp_rule_4"))}
      ${rule(5, "ballot", "comp_rule_5_title", md("comp_rule_5"))}
      ${rule(6, "trophy", "comp_rule_6_title", md("comp_rule_6"), true)}
    </div>
    <p class="t-contact"${ek(s, "comp_rules_contact")}>${icon("mail", "icon icon-sm")}<span>${mailInline(fill(s.comp_rules_contact, { epost: "\u0000" }), email)}</span></p>
    ${nextLink(1)}
  </section>`;

  // ── Flik 3: Delta och rösta ──

  const submitState = SUBMIT_STATES[phase];
  const voteState = VOTE_STATES[phase];
  const cardBadge = (key: SettingKey, list: string, current: string | undefined, cls: string, datum = "") =>
    html`<span class="t-status ${cls}"${when(list, current)}${ek(s, key)}><span class="t-status-dot" aria-hidden="true"></span>${fill(s[key], { datum })}</span>`;

  const catOptions = [s.comp_cat_badge_title, s.comp_cat_merch_title];
  const fallbackSubject = fill(s.comp_subject_pattern, { kategori: `[${catOptions.join("/")}]`, namn: `[${s.comp_subject_name_label}]` });
  const mailto = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

  const submitCard = html`<article class="t-card t-card--submit" aria-labelledby="delta-rubrik"${states(SUBMIT_STATES, phase)}>
    <header class="t-card-head">
      ${badge("fileUp", "t-ico t-ico-lg")}
      <div>
        <p class="t-card-kicker">${period(d.open, d.deadline)}</p>
        <h3 class="t-h3" id="delta-rubrik"${ek(s, "comp_submit_title")}>${s.comp_submit_title}</h3>
      </div>
      <p class="t-card-status">
        ${cardBadge("comp_submit_before", "soon", submitState, "is-soon", dayMonth(d.open))}
        ${cardBadge("comp_submit_open", "open", submitState, "is-open")}
        ${cardBadge("comp_submit_closed", "closed", submitState, "is-closed")}
      </p>
    </header>
    <p${ek(s, "comp_submit_text")}>${s.comp_submit_text}</p>

    <div class="t-field">
      <p class="t-field-label" id="t-email-label"${ek(s, "comp_email_label")}>${s.comp_email_label}</p>
      <div class="t-copy-row">
        <a class="t-email" href="mailto:${email}" aria-describedby="t-email-label" data-copy-source="email"${ek(s, "comp_email")}>${breakableEmail(email)}</a>
        ${copyButton(s, "email", s.comp_email_label)}
      </div>
    </div>

    <div class="t-subject" data-subject data-pattern="${s.comp_subject_pattern}" data-email="${email}" data-name-fallback="[${s.comp_subject_name_label}]"${when("soon open", submitState)}>
      <fieldset class="t-seg">
        <legend class="t-field-label"${ek(s, "comp_subject_cat_label")}>${s.comp_subject_cat_label}</legend>
        ${catOptions.map(
          (o, i) => html`<label class="t-seg-opt"><input type="radio" name="t-kategori" value="${o}"${i === 0 ? html` checked` : ""}><span>${o}</span></label>`,
        )}
      </fieldset>
      <div class="t-field">
        <label class="t-field-label" for="t-namn"${ek(s, "comp_subject_name_label")}>${s.comp_subject_name_label}</label>
        <input class="t-input" id="t-namn" type="text" autocomplete="name" maxlength="80" placeholder="${s.comp_subject_name_placeholder}" data-subject-name>
      </div>
      <div class="t-field">
        <p class="t-field-label" id="t-subject-label"${ek(s, "comp_subject_label")}>${s.comp_subject_label}</p>
        <div class="t-copy-row">
          <output class="t-subject-out" aria-labelledby="t-subject-label" data-copy-source="subject" data-subject-out${ek(s, "comp_subject_pattern")}>${fallbackSubject}</output>
          ${copyButton(s, "subject", s.comp_subject_label)}
        </div>
        <p class="t-hint"${ek(s, "comp_subject_hint")}>${icon("lock", "icon icon-sm")}<span>${s.comp_subject_hint}</span></p>
      </div>
    </div>

    <div class="t-card-foot">
      <a class="t-btn t-btn-navy t-btn-block" href="${mailto(fallbackSubject)}" data-subject-link${when("open", submitState)}${ek(s, "comp_submit_button")}>${icon("mail", "icon icon-sm")}${s.comp_submit_button}</a>
      <p class="t-note"${when("soon", submitState)}${ek(s, "comp_submit_before_text")}>${fill(s.comp_submit_before_text, { datum: dayMonth(d.open) })}</p>
      <p class="t-note"${when("closed", submitState)}${ek(s, "comp_submit_closed_text")}>${fill(s.comp_submit_closed_text, { datum: dayMonthClock(d.deadline) })}</p>
    </div>

    <details class="t-check" open>
      <summary class="t-h5"${ek(s, "comp_check_title")}>${icon("checklist", "icon icon-sm")}${s.comp_check_title}</summary>
      <ul${ek(s, "comp_check")}>${lines(s.comp_check).map((l) => html`<li>${icon("check", "icon icon-sm")}<span>${l}</span></li>`)}</ul>
    </details>
  </article>`;

  const voteUrl = safeUrl(s.comp_vote_url);
  const hasVoteUrl = Boolean(s.comp_vote_url && voteUrl && voteUrl !== "#");
  const voteFacts = s.comp_vote_facts.split("|").map((x) => x.trim()).filter(Boolean);
  const voteCard = html`<article class="t-card t-card--vote" aria-labelledby="rosta-rubrik"${states(VOTE_STATES, phase)}>
    <header class="t-card-head">
      ${badge("ballot", "t-ico t-ico-lg")}
      <div>
        <p class="t-card-kicker">${period(d.voteStart, d.voteEnd)}</p>
        <h3 class="t-h3" id="rosta-rubrik"${ek(s, "comp_vote_title")}>${s.comp_vote_title}</h3>
      </div>
      <p class="t-card-status">
        ${cardBadge("comp_vote_before", "soon", voteState, "is-soon", dayMonth(d.voteStart))}
        ${cardBadge("comp_vote_open", "open", voteState, "is-open")}
        ${cardBadge("comp_vote_closed", "closed", voteState, "is-closed")}
      </p>
    </header>
    <p${ek(s, "comp_vote_text")}>${s.comp_vote_text}</p>
    ${voteFacts.length ? html`<ul class="t-vote-facts"${ek(s, "comp_vote_facts")}>${voteFacts.map((f) => html`<li>${f}</li>`)}</ul>` : ""}
    <div class="t-ballot-art" aria-hidden="true">${ballotArt()}</div>
    <div class="t-card-foot">
      ${hasVoteUrl
        ? html`<a class="t-btn t-btn-gold t-btn-block" href="${voteUrl}" target="_blank" rel="noopener"${when("open", voteState)}${ek(s, "comp_vote_url")}>${s.comp_vote_button}${icon("external", "icon icon-sm")}${newTab}</a>`
        : html`<p class="t-note"${when("open", voteState)}${ek(s, "comp_vote_missing")}>${s.comp_vote_missing}</p>`}
      <p class="t-note"${when("soon", voteState)}${ek(s, "comp_vote_before_text")}>${fill(s.comp_vote_before_text, { datum: dayMonth(d.voteStart) })}</p>
      <a class="t-btn t-btn-outline t-btn-block" href="/tavling/kalender.ics" download${when("soon", voteState)}${ek(s, "comp_calendar")}>${icon("calendar", "icon icon-sm")}${s.comp_calendar}</a>
      <p class="t-note"${when("closed", voteState)}${ek(s, "comp_vote_closed_text")}>${s.comp_vote_closed_text}</p>
    </div>
  </article>`;

  const takePanel = html`<section class="t-panel" id="delta" aria-labelledby="flik-delta" data-panel>
    <header class="t-panel-head">
      <h2 class="t-h2"${ek(s, "comp_take_title")}>${s.comp_take_title}</h2>
    </header>
    <div class="t-cards">${submitCard}${voteCard}</div>
    ${entriesSection(s, entries, phase)}
    ${kitSection(s, resources, phase, entries)}
  </section>`;

  const content = html`<div class="jfk-tavling" data-tavling
      data-open="${iso(t.open)}" data-deadline-end="${iso(t.deadlineEnd)}" data-vote-start="${iso(t.voteStart)}" data-vote-end-end="${iso(t.voteEndEnd)}"
      data-now="${iso(now)}" data-copied="${s.comp_copied}"${states(PHASE_STATES, phase)}>
    <style nonce="${c.nonce}">${raw(`.jfk-tavling{--t-progress:${progress.toFixed(4)}}${swatchCss(s)}`)}</style>
    ${hero}
    ${tabBar}
    <div class="container t-panels">
      ${aboutPanel}
      ${rulesPanel}
      ${takePanel}
    </div>
  </div>`;

  return htmlResponse(
    c,
    layout(
      c,
      s,
      {
        title: s.comp_title,
        description: s.comp_lead,
        pageId: "tavling",
        assets: { css: ["tavling.css"], js: ["tavling.js"], fonts: ["fonts/dm-sans.woff2"] },
      },
      content,
    ),
  );
}

/** Adressen med en möjlig radbrytning efter @ (i stället för mitt i ett ord på smala skärmar). */
function breakableEmail(email: string): SafeHtml {
  const at = email.indexOf("@");
  return at > 0 ? html`${email.slice(0, at + 1)}<wbr>${email.slice(at + 1)}` : html`${email}`;
}

/** Bilder 1–4 under Om tävlingen (Texter och sidor). Visas bara när minst en bild är vald. */
function photosSection(s: Settings): SafeHtml | string {
  const photos = (
    [
      ["comp_photo_1", "comp_photo_1_caption"],
      ["comp_photo_2", "comp_photo_2_caption"],
      ["comp_photo_3", "comp_photo_3_caption"],
      ["comp_photo_4", "comp_photo_4_caption"],
    ] as const
  ).filter(([k]) => s[k]);
  if (!photos.length) return "";
  return html`<section class="t-block" aria-labelledby="bilder">
    <h2 class="t-h2" id="bilder"${ek(s, "comp_photos_title")}>${s.comp_photos_title}</h2>
    ${s.comp_photos_text ? html`<p class="t-text-lg t-photos-lead"${ek(s, "comp_photos_text")}>${s.comp_photos_text}</p>` : ""}
    <ul class="t-photos t-photos--${photos.length}">
      ${photos.map(
        ([k, cap], i) => html`<li><figure${ek(s, k)}>
          ${picture(s[k], { alt: s[cap], sizes: i === 0 && photos.length > 2 ? "(min-width: 900px) 55vw, 100vw" : "(min-width: 900px) 40vw, 100vw", width: 1200, height: 900 })}
          ${s[cap] ? html`<figcaption${ek(s, cap)}>${s[cap]}</figcaption>` : ""}
        </figure></li>`,
      )}
    </ul>
  </section>`;
}

function capitalize(t: string): string {
  return t.charAt(0).toLocaleUpperCase("sv") + t.slice(1);
}

/** Kopieringsknapp – dold tills tavling.js har kontrollerat att webbläsaren kan kopiera. */
function copyButton(s: Settings, source: string, what: string): SafeHtml {
  return html`<button class="t-copy" type="button" data-copy="${source}" hidden>
    ${icon("copy", "icon icon-sm")}<span class="t-copy-label" data-copy-label${ek(s, "comp_copy")}>${s.comp_copy}</span><span class="sr-only"> ${what.toLocaleLowerCase("sv")}</span>
  </button>`;
}

/** Text där platshållaren \u0000 byts mot en e-postlänk. Resten escapas och får länkar/fetstil som vanligt. */
function mailInline(text: string, email: string): SafeHtml {
  const [before = "", after = ""] = text.split("\u0000");
  return html`${raw(inline(before))}${text.includes("\u0000") ? html`<a href="mailto:${email}">${email}</a>` : ""}${raw(inline(after))}`;
}

// ───────────── Illustrationer (dekorativa, utan text) ─────────────

/** JFK:s logotyp i teckningarna (små versioner, se tools/design/tavling-material.py). */
const LOGO_LIGHT = `/assets/tavling/jfk-logotyp-ljus-liten.webp?v=${ASSET_VERSION}`;
const LOGO_DARK = `/assets/tavling/jfk-logotyp-liten.webp?v=${ASSET_VERSION}`;

/** Broderat tygmärke: tjock kantsöm, stygn och JFK:s logotyp i mitten. */
function patchArt(): SafeHtml {
  return raw(`<svg class="t-art t-art-patch" viewBox="0 0 200 200" width="200" height="200" focusable="false">
    <circle class="pa-shadow" cx="104" cy="106" r="86"/>
    <circle class="pa-edge" cx="100" cy="100" r="86"/>
    <circle class="pa-merrow" cx="100" cy="100" r="80"/>
    <circle class="pa-face" cx="100" cy="100" r="72"/>
    <circle class="pa-stitch" cx="100" cy="100" r="64"/>
    <image href="${LOGO_LIGHT}" x="50" y="49" width="100" height="101" preserveAspectRatio="xMidYMid meet"/>
  </svg>`);
}

/** T-tröja med en streckad tryckyta och JFK:s logotyp. */
function shirtArt(): SafeHtml {
  return raw(`<svg class="t-art t-art-shirt" viewBox="0 0 200 200" width="200" height="200" focusable="false">
    <path class="sh-shadow" d="M74 34 52 42 22 64l16 30 18-10v86h96V84l18 10 16-30-30-22-22-8c-4 10-16 16-30 16S78 44 74 34Z" transform="translate(4 6)"/>
    <path class="sh-body" d="M74 34 52 42 22 64l16 30 18-10v86h96V84l18 10 16-30-30-22-22-8c-4 10-16 16-30 16S78 44 74 34Z"/>
    <path class="sh-collar" d="M74 34c4 10 16 16 30 16s26-6 30-16"/>
    <rect class="sh-print" x="74" y="72" width="60" height="60" rx="6"/>
    <image href="${LOGO_DARK}" x="78" y="76" width="52" height="52" preserveAspectRatio="xMidYMid meet"/>
  </svg>`);
}

/** Valurna med en röstsedel på väg ned genom springan. */
function ballotArt(): SafeHtml {
  return raw(`<svg class="t-art t-art-ballot" viewBox="0 0 240 140" width="240" height="140" focusable="false">
    <g class="ba-sheet"><rect class="ba-paper" x="94" y="4" width="52" height="64" rx="4"/><path class="ba-tick" d="m107 34 9 9 17-20"/></g>
    <rect class="ba-box" x="44" y="58" width="152" height="78" rx="10"/>
    <rect class="ba-slot" x="82" y="52" width="76" height="10" rx="5"/>
    <rect class="ba-front" x="70" y="84" width="100" height="30" rx="6"/>
  </svg>`);
}

/** Toppens dekor: rutnät som på ett skissblock och söm i guld. */
function heroArt(): SafeHtml {
  return raw(`<svg class="t-hero-art" viewBox="0 0 600 600" width="600" height="600" aria-hidden="true" focusable="false">
    <circle class="ha-ring" cx="300" cy="300" r="280"/>
    <circle class="ha-ring ha-ring-2" cx="300" cy="300" r="250"/>
    <circle class="ha-stitch" cx="300" cy="300" r="265"/>
  </svg>`);
}

// ───────────── Kalenderfil ─────────────

/** /tavling/kalender.ics – tävlingens datum att lägga in i kalendern (med påminnelse dagen före sista inlämning). */
export async function competitionIcsHandler(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  const d = competitionDates(s);
  const site = c.env.SITE_URL.replace(/\/$/, "");
  const url = `${site}/tavling`;
  const stamp = nowStamp();
  const title = s.comp_title;
  const dateOnly = (local: string) => local.slice(0, 10).replace(/-/g, "");
  const nextDay = (local: string) => {
    const [y, m, day] = local.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, day! + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  };
  const event = (uid: string, summary: string, timing: string[], extra: string[] = []) => [
    "BEGIN:VEVENT",
    `UID:tavling-${uid}@jfkarlstad`,
    `DTSTAMP:${stamp}`,
    ...timing,
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(`${s.comp_lead}\n\n${url}`)}`,
    `URL:${url}`,
    ...extra,
    "END:VEVENT",
  ];
  // Händelsen för sista dagen är timmen före stängning (23:00–23:59), så att den syns i dagsvyn.
  const [dh, dm] = clock(d.deadline).split(":").map(Number);
  const deadlineStart = `${d.deadline.slice(0, 11)}${String(Math.max(0, (dh ?? 0) - 1)).padStart(2, "0")}:${String(dm ?? 0).padStart(2, "0")}`;
  return icsResponse(
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Juridiska Foreningen i Karlstad//Tavling//SV",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsText(title)}`,
      ...VTIMEZONE,
      ...event("oppnar", `${s.comp_step_1} – ${title}`, [`DTSTART;VALUE=DATE:${dateOnly(d.open)}`, `DTEND;VALUE=DATE:${nextDay(d.open)}`], ["TRANSP:TRANSPARENT"]),
      ...event(
        "sista-dag",
        `${s.comp_step_2} – ${title}`,
        [`DTSTART;TZID=Europe/Stockholm:${icsTime(deadlineStart)}`, `DTEND;TZID=Europe/Stockholm:${icsTime(d.deadline)}`],
        ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(s.comp_step_2)}`, "TRIGGER:-P1D", "END:VALARM"],
      ),
      ...event("rostning", `${s.comp_step_3} – ${title}`, [`DTSTART;VALUE=DATE:${dateOnly(d.voteStart)}`, `DTEND;VALUE=DATE:${nextDay(d.voteEnd)}`], [
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(s.comp_step_3)}`,
        "TRIGGER;VALUE=DURATION:PT9H",
        "END:VALARM",
      ]),
      "END:VCALENDAR",
    ],
    "jfk-tavling.ics",
  );
}
