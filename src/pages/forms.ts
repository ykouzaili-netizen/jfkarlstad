import { html, paragraphs, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import { committeeList, ec, ek, lines, loadSettings, type SettingKey, type Settings } from "../lib/settings.js";
import { boardQuery, partnerQuery, positionQuery, rows, type BoardRow, type PartnerRow, type PositionRow } from "../lib/content.js";
import { errorSummary, renderField, validate, type Errors, type FieldSpec, type FormUiTexts, type Values } from "../lib/forms.js";
import { checkFormToken, clientIp, formToken, rateLimit, turnstileEnabled, verifyTurnstile } from "../lib/security.js";
import { mailConfigured, sendMail } from "../lib/mail.js";
import { renderInline } from "../lib/markdown.js";
import { htmlResponse, redirect } from "../lib/http.js";
import { formatDay, stockholmToday, telHref } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import type { Env } from "../env.js";
import { layout } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { checkList, pageHeader } from "../views/page.js";
import { partnerLogo } from "../views/components.js";

export type FormId = "kontakt" | "foretag" | "paverka" | "engagemang";

/** Namn på formulären i adminpanelen och i mejlen till styrelsen. */
export const FORM_LABELS: Record<FormId, string> = {
  kontakt: "Kontakt",
  foretag: "Företag",
  paverka: "JF Påverka",
  engagemang: "Engagera dig",
};

const PAVERKA_TYPES = [
  { value: "utbildning", label: "pf_type_1_label", hint: "pf_type_1_hint" },
  { value: "forening", label: "pf_type_2_label", hint: "pf_type_2_hint" },
  { value: "initiativ", label: "pf_type_3_label", hint: "pf_type_3_hint" },
] as const;

/** Fält med etiketter från textregistret. `ek` gör etiketterna klickbara i förhandsvisningen. */
function lbl(s: Settings, key: SettingKey): { label: string; labelAttr: SafeHtml } {
  return { label: s[key], labelAttr: ek(s, key) };
}

function optionsFrom(text: string): { value: string; label: string }[] {
  return lines(text).map((l) => ({ value: l.slice(0, 120), label: l.slice(0, 120) }));
}

/** Formulärens fält byggs från inställningarna, så att etiketter och val kan ändras i adminpanelen. */
function fieldsFor(id: FormId, s: Settings, positions: PositionRow[] = []): FieldSpec[] {
  switch (id) {
    case "kontakt":
      return [
        { name: "namn", type: "text", required: true, max: 100, autocomplete: "name", ...lbl(s, "kf_name") },
        { name: "epost", type: "email", required: true, max: 200, autocomplete: "email", ...lbl(s, "kf_email") },
        { name: "amne", type: "select", options: optionsFrom(s.kf_subject_options), ...lbl(s, "kf_subject") },
        { name: "meddelande", type: "textarea", required: true, max: 5000, rows: 7, ...lbl(s, "kf_message") },
      ];
    case "foretag":
      return [
        { name: "foretag", type: "text", required: true, max: 150, autocomplete: "organization", ...lbl(s, "cf_company") },
        { name: "namn", type: "text", required: true, max: 100, autocomplete: "name", ...lbl(s, "cf_name") },
        { name: "epost", type: "email", required: true, max: 200, autocomplete: "email", ...lbl(s, "cf_email") },
        { name: "telefon", type: "tel", max: 30, autocomplete: "tel", ...lbl(s, "cf_phone") },
        { name: "intresse", type: "select", options: optionsFrom(s.cf_interest_options), ...lbl(s, "cf_interest") },
        { name: "meddelande", type: "textarea", required: true, max: 5000, rows: 6, ...lbl(s, "cf_message") },
      ];
    case "paverka":
      return [
        {
          name: "typ",
          type: "radio",
          required: true,
          options: PAVERKA_TYPES.map((t) => ({ value: t.value, label: s[t.label], hint: s[t.hint] })),
          ...lbl(s, "pf_type"),
        },
        { name: "rubrik", type: "text", required: true, max: 150, help: s.pf_title_help, ...lbl(s, "pf_title") },
        { name: "meddelande", type: "textarea", required: true, max: 5000, rows: 8, help: s.pf_message_help, ...lbl(s, "pf_message") },
        { name: "anonym", type: "checkbox", help: s.pf_anon_help, ...lbl(s, "pf_anon") },
        { name: "namn", type: "text", max: 100, autocomplete: "name", wrapClass: "js-identity", ...lbl(s, "pf_name") },
        { name: "epost", type: "email", max: 200, autocomplete: "email", wrapClass: "js-identity", help: s.pf_email_help, ...lbl(s, "pf_email") },
      ];
    case "engagemang":
      return [
        { name: "namn", type: "text", required: true, max: 100, autocomplete: "name", ...lbl(s, "ef_name") },
        { name: "epost", type: "email", required: true, max: 200, autocomplete: "email", ...lbl(s, "ef_email") },
        { name: "termin", type: "select", options: optionsFrom(s.ef_term_options), ...lbl(s, "ef_term") },
        {
          name: "uppdrag",
          type: "select",
          required: true,
          options: [...positions.map((p) => ({ value: p.title.slice(0, 120), label: p.title.slice(0, 120) })), { value: s.ef_role_any.slice(0, 120), label: s.ef_role_any.slice(0, 120) }],
          ...lbl(s, "ef_role"),
        },
        { name: "meddelande", type: "textarea", max: 3000, rows: 5, help: s.ef_message_help, ...lbl(s, "ef_message") },
      ];
  }
}

const PATHS: Record<FormId, string> = { kontakt: "/kontakt", foretag: "/for-foretag", paverka: "/jf-paverka", engagemang: "/engagera-dig" };

function uiTexts(s: Settings): FormUiTexts {
  return { optional: s.form_optional, select: s.form_select };
}

// ───────────────────────── Rendering ─────────────────────────

async function formBlock(c: RequestContext, s: Settings, id: FormId, fields: FieldSpec[], values: Values = {}, errors: Errors = {}, topError?: string): Promise<SafeHtml> {
  const token = await formToken(c.env);
  const ts = turnstileEnabled(c.env);
  const ui = uiTexts(s);
  return html`<form class="form-card" method="post" action="${PATHS[id]}${id === "engagemang" ? "#anmalan" : ""}" novalidate data-form="${id}">
    ${errorSummary(errors, fields, topError)}
    ${fields.map((f) => renderField(f, values[f.name] ?? "", errors[f.name], ui))}
    <div class="hp-field" aria-hidden="true">
      <label for="falt-webbplats">Lämna detta fält tomt</label>
      <input type="text" id="falt-webbplats" name="webbplats" tabindex="-1" autocomplete="off">
    </div>
    <input type="hidden" name="_t" value="${token}">
    ${ts ? html`<div class="cf-turnstile" data-sitekey="${c.env.TURNSTILE_SITE_KEY}" data-language="sv"></div>` : ""}
    <div class="form-footer">
      <button class="btn btn-primary btn-lg" type="submit"${ek(s, "form_submit")}>${s.form_submit}</button>
      <p class="fine-print"${ek(s, "form_privacy")}>${renderInline(s.form_privacy)}</p>
    </div>
  </form>
  ${ts ? raw('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>') : ""}`;
}

export async function contactPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const [s, board] = await Promise.all([loadSettings(db, c.preview), rows<BoardRow>(boardQuery.all(db))]);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address_street}, ${s.address_city}`)}`;
  const withMail = board.filter((b) => b.email);
  const content = html`
    ${pageHeader(s, { kickerKey: "contact_kicker", titleKey: "contact_title", leadKey: "contact_lead" })}
    <section class="section section-tight-top">
      <div class="container form-layout">
        <div>
          <h2 class="form-title"${ek(s, "contact_form_title")}>${s.contact_form_title}</h2>
          <p class="form-intro"${ek(s, "contact_form_intro")}>${renderInline(s.contact_form_intro)}</p>
          ${await formBlock(c, s, "kontakt", fieldsFor("kontakt", s), values, errors, topError)}
        </div>
        <aside class="stack">
          <div class="info-card">
            <h2 class="info-title"${ek(s, "contact_details_title")}>${s.contact_details_title}</h2>
            <ul class="contact-list">
              <li${ek(s, "address_street")}>${icon("pin")}<span>${s.address_street}<br>${s.address_city}<br><a href="${mapUrl}" target="_blank" rel="noopener">${s.contact_map}<span class="sr-only"> (öppnas i ny flik)</span></a></span></li>
              <li${ek(s, "contact_email")}>${icon("mail")}<a href="mailto:${s.contact_email}">${s.contact_email}</a></li>
              ${s.contact_phone ? html`<li${ek(s, "contact_phone")}>${icon("phone")}<a href="${telHref(s.contact_phone)}">${s.contact_phone}</a></li>` : ""}
              <li${ek(s, "instagram_handle")}>${icon("instagram")}<a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a></li>
            </ul>
          </div>
          ${withMail.length
            ? html`<div class="info-card">
                <h2 class="info-title"${ek(s, "contact_board_title")}>${s.contact_board_title}</h2>
                <ul class="board-mail-list">
                  ${withMail.map((b) => html`<li${ec(s, `/admin/styrelsen/${b.id}`, `Styrelsen › ${b.name}`)}><span class="muted">${b.role}</span><a href="mailto:${b.email}">${b.email}</a></li>`)}
                </ul>
              </div>`
            : ""}
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.contact_kicker, description: s.contact_lead }, content), status);
}

export async function companiesPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const [s, partners] = await Promise.all([loadSettings(db, c.preview), rows<PartnerRow>(partnerQuery.all(db))]);
  const packages = ([1, 2, 3] as const)
    .map((n) => ({ n, nameKey: `package_${n}_name` as const, textKey: `package_${n}_text` as const }))
    .filter((p) => s[p.nameKey]);
  const content = html`
    ${pageHeader(s, {
      kickerKey: "companies_kicker",
      titleKey: "companies_title",
      leadKey: "companies_lead",
      actions: html`<a class="btn btn-primary btn-lg" href="#kontakta-oss"${ek(s, "companies_cta")}>${s.companies_cta}</a><a class="arrow-link" href="/partners"${ek(s, "companies_partners_link")}>${s.companies_partners_link}${icon("arrowRight", "icon icon-sm")}</a>`,
    })}
    <section class="section section-tight-top">
      <div class="container split split-top">
        <div>
          <h2 class="section-title"${ek(s, "companies_why_title")}>${s.companies_why_title}</h2>
          <div class="prose"${ek(s, "companies_text")}>${paragraphs(s.companies_text)}</div>
        </div>
        <div class="info-card">
          <h2 class="info-title"${ek(s, "companies_benefits_title")}>${s.companies_benefits_title}</h2>
          ${checkList(lines(s.companies_benefits), ek(s, "companies_benefits"))}
        </div>
      </div>
    </section>

    ${packages.length
      ? html`<section class="section section-surface" aria-labelledby="paket">
          <div class="container">
            <div class="section-head"><div><h2 class="section-title" id="paket"${ek(s, "packages_title")}>${s.packages_title}</h2><p class="section-lead"${ek(s, "packages_note")}>${s.packages_note}</p></div></div>
            <ul class="package-grid">
              ${packages.map((p, i) => html`<li class="package-card${i === 0 ? " package-featured" : ""}"><h3 class="package-name"${ek(s, p.nameKey)}>${s[p.nameKey]}</h3><p${ek(s, p.textKey)}>${s[p.textKey]}</p></li>`)}
            </ul>
          </div>
        </section>`
      : ""}

    ${partners.length
      ? html`<section class="section section-tight" aria-label="${s.companies_strip_title}">
          <div class="container">
            <p class="partner-strip-title center"${ek(s, "companies_strip_title")}>${s.companies_strip_title}</p>
            <ul class="logo-row center">${partners.map((p) => html`<li${ec(s, `/admin/partners/${p.id}`, `Partner › ${p.name}`)}><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>
          </div>
        </section>`
      : ""}

    <section class="section" aria-labelledby="kontakta-oss">
      <div class="container form-layout">
        <div>
          <h2 class="section-title" id="kontakta-oss"${ek(s, "companies_form_title")}>${s.companies_form_title}</h2>
          <p class="form-intro"${ek(s, "companies_form_intro")}>${s.companies_form_intro}</p>
          ${await formBlock(c, s, "foretag", fieldsFor("foretag", s), values, errors, topError)}
        </div>
        <aside class="aside-card">
          <h3 class="aside-title"${ek(s, "companies_mail_title")}>${s.companies_mail_title}</h3>
          <p${ek(s, "companies_mail_text")}>${renderInline(s.companies_mail_text)}</p>
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.companies_kicker, description: s.companies_lead }, content), status);
}

export async function paverkaPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const content = html`
    ${pageHeader(s, { kickerKey: "paverka_kicker", titleKey: "paverka_page_title", leadKey: "paverka_lead" })}
    <section class="section section-tight-top">
      <div class="container form-layout">
        <div>
          ${await formBlock(c, s, "paverka", fieldsFor("paverka", s), values, errors, topError)}
        </div>
        <aside class="stack">
          <div class="info-card info-card-accent">
            <h2 class="info-title"${ek(s, "paverka_how_title")}>${s.paverka_how_title}</h2>
            <div class="prose"${ek(s, "paverka_page_text")}>${paragraphs(s.paverka_page_text)}</div>
          </div>
          <div class="info-card">
            <h2 class="info-title"${ek(s, "paverka_anon_title")}>${icon("lock")} ${s.paverka_anon_title}</h2>
            <p${ek(s, "paverka_anon_text")}>${s.paverka_anon_text}</p>
          </div>
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.paverka_kicker, description: s.paverka_lead }, content), status);
}

export async function engagePage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const [s, positions] = await Promise.all([loadSettings(db, c.preview), rows<PositionRow>(positionQuery.open(db, stockholmToday()))]);
  // "Jag är intresserad" på ett uppdrag förväljer det i formuläret.
  const chosen = positions.find((p) => String(p.id) === c.url.searchParams.get("uppdrag"));
  const formValues = values ?? (chosen ? { uppdrag: chosen.title.slice(0, 120) } : {});
  const committees = committeeList(s).map((c) => c.name);
  const content = html`
    ${pageHeader(s, { kickerKey: "engage_kicker", titleKey: "engage_title", leadKey: "engage_lead" })}
    <section class="section section-tight-top" aria-labelledby="lediga-uppdrag">
      <div class="container">
        <div class="section-head">
          <div>
            <h2 class="section-title" id="lediga-uppdrag"${ek(s, "engage_positions_title")}>${s.engage_positions_title}</h2>
            ${positions.length && s.engage_positions_lead ? html`<p class="section-lead"${ek(s, "engage_positions_lead")}>${s.engage_positions_lead}</p>` : ""}
          </div>
        </div>
        ${positions.length
          ? html`<ul class="position-grid">
              ${positions.map(
                (p) => html`<li class="position-card"${ec(s, `/admin/uppdrag/${p.id}`, `Lediga uppdrag › ${p.title}`)}>
                  ${p.committee ? html`<span class="tag">${p.committee}</span>` : ""}
                  <h3 class="position-title">${p.title}</h3>
                  ${p.description ? html`<div class="position-text">${paragraphs(p.description)}</div>` : ""}
                  <dl class="position-meta">
                    ${p.commitment ? html`<div><dt>${s.engage_commitment_label}</dt><dd>${p.commitment}</dd></div>` : ""}
                    ${p.open_until ? html`<div><dt>${icon("calendar", "icon icon-sm")}</dt><dd>${formatDay(p.open_until)}</dd></div>` : ""}
                  </dl>
                  <a class="btn btn-outline btn-sm" href="/engagera-dig?uppdrag=${p.id}#anmalan"${ek(s, "engage_interest_button")}>${s.engage_interest_button}</a>
                </li>`,
              )}
            </ul>`
          : html`<div class="empty-state empty-state-soft"${ek(s, "engage_positions_empty")}>${paragraphs(s.engage_positions_empty)}</div>`}
      </div>
    </section>
    ${committees.length
      ? html`<section class="section section-surface" aria-labelledby="utskotten">
          <div class="container split split-top">
            <div>
              <h2 class="section-title" id="utskotten"${ek(s, "engage_committees_title")}>${s.engage_committees_title}</h2>
              <div class="prose"${ek(s, "engage_committees_text")}>${paragraphs(s.engage_committees_text)}</div>
            </div>
            <ul class="pill-list pill-list-lg"${ek(s, "committees")}>${committees.map((cm) => html`<li>${cm}</li>`)}</ul>
          </div>
        </section>`
      : ""}
    <section class="section" aria-labelledby="anmalan">
      <div class="container form-layout">
        <div>
          <h2 class="section-title" id="anmalan"${ek(s, "engage_form_title")}>${s.engage_form_title}</h2>
          <p class="form-intro"${ek(s, "engage_form_intro")}>${s.engage_form_intro}</p>
          ${await formBlock(c, s, "engagemang", fieldsFor("engagemang", s, positions), formValues, errors, topError)}
        </div>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.engage_title, description: s.engage_lead }, content), status);
}

const RENDER: Record<FormId, typeof contactPage> = { kontakt: contactPage, foretag: companiesPage, paverka: paverkaPage, engagemang: engagePage };

// ───────────────────────── Inskick ─────────────────────────

export function submitHandler(id: FormId) {
  return async (c: RequestContext): Promise<Response> => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return RENDER[id](c, {}, {}, "Formuläret kunde inte läsas. Försök igen.", 400);
    }

    // Honungsfälla: robotar fyller i alla fält. Låtsas att det gick bra.
    if (String(form.get("webbplats") ?? "").trim()) return redirect(`${PATHS[id]}/tack`, 303);

    const s = await loadSettings(c.env.DB);
    const positions = id === "engagemang" ? await rows<PositionRow>(positionQuery.open(c.env.DB, stockholmToday())) : [];
    const { values, errors } = validate(fieldsFor(id, s, positions), form);
    const anonymous = id === "paverka" && values.anonym === "1";
    if (anonymous) {
      values.namn = "";
      values.epost = "";
      delete errors.namn;
      delete errors.epost;
    }
    if (Object.keys(errors).length) return RENDER[id](c, values, errors, undefined, 422);

    const humanOk =
      (await checkFormToken(c.env, String(form.get("_t") ?? ""))) &&
      (await verifyTurnstile(c.env, form.get("cf-turnstile-response") as string | null, anonymous ? "" : clientIp(c.req)));
    if (!humanOk) {
      return RENDER[id](c, values, {}, "Vi kunde inte bekräfta att du inte är en robot. Vänta några sekunder och försök igen.", 422);
    }
    if (!(await rateLimit(c.env, c.req, `form:${id}`, 5, 3600))) {
      return RENDER[id](c, values, {}, "Du har skickat många meddelanden på kort tid. Vänta en stund och försök igen.", 429);
    }

    const { subject, message, data } = summarize(id, s, values);
    const result = await c.env.DB.prepare("INSERT INTO submissions (form, name, email, subject, message, data, anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, values.namn || null, values.epost || null, subject, message, JSON.stringify(data), anonymous ? 1 : 0)
      .run();
    const submissionId = result.meta.last_row_id;

    // E-post är best effort och får aldrig blockera eller fälla inskicket.
    c.exec.waitUntil(notifyBoard(c.env, submissionId, id, values, subject, message, data, anonymous));

    return redirect(`${PATHS[id]}/tack`, 303);
  };
}

function summarize(id: FormId, s: Settings, v: Values): { subject: string; message: string; data: Record<string, string> } {
  if (id === "kontakt") return { subject: v.amne || "Kontakt", message: v.meddelande!, data: {} };
  if (id === "foretag") {
    return {
      subject: `${v.foretag} – ${v.intresse || "Samarbete"}`,
      message: v.meddelande!,
      data: { Företag: v.foretag!, Telefon: v.telefon ?? "", Intresse: v.intresse ?? "" },
    };
  }
  if (id === "engagemang") {
    return {
      subject: `Intresseanmälan: ${v.uppdrag}`,
      message: v.meddelande || "(Inget meddelande)",
      data: { Uppdrag: v.uppdrag ?? "", Termin: v.termin ?? "" },
    };
  }
  const t = PAVERKA_TYPES.find((x) => x.value === v.typ);
  const typ = t ? s[t.label] : "JF Påverka";
  return { subject: `${typ}: ${v.rubrik}`, message: v.meddelande!, data: { Typ: typ } };
}

async function notifyBoard(env: Env, submissionId: number, id: FormId, v: Values, subject: string, message: string, data: Record<string, string>, anonymous: boolean): Promise<void> {
  if (!mailConfigured(env)) return;
  const to = env.MAIL_TO || env.SMTP_USER!;
  const site = env.SITE_URL.replace(/\/$/, "");
  const label = FORM_LABELS[id];
  const parts = [
    `Nytt meddelande via formuläret ”${label}” på webbplatsen.`,
    "",
    anonymous ? "Avsändare: anonym" : `Från: ${v.namn || "–"}${v.epost ? ` <${v.epost}>` : ""}`,
    ...Object.entries(data)
      .filter(([, val]) => val)
      .map(([k, val]) => `${k}: ${val}`),
    `Ämne: ${subject}`,
    "",
    message,
    "",
    "—",
    `Hantera meddelandet i adminpanelen: ${site}/admin/meddelanden/${submissionId}`,
  ];
  try {
    await sendMail(env, {
      to: [to],
      subject: `[JFK] ${label}: ${subject}`.slice(0, 180),
      text: parts.join("\n"),
      replyTo: anonymous ? undefined : v.epost || undefined,
    });
    await env.DB.prepare("UPDATE submissions SET email_sent = 1 WHERE id = ?").bind(submissionId).run();
  } catch (err) {
    console.error("E-postnotis misslyckades (meddelandet finns sparat i adminpanelen)", err instanceof Error ? err.message : err);
  }
}

// ───────────────────────── Tack-sidor ─────────────────────────

const THANKS: Record<FormId, [SettingKey, SettingKey]> = {
  kontakt: ["contact_thanks_title", "contact_thanks_text"],
  foretag: ["companies_thanks_title", "companies_thanks_text"],
  paverka: ["paverka_thanks_title", "paverka_thanks_text"],
  engagemang: ["engage_thanks_title", "engage_thanks_text"],
};

export function thanksPage(id: FormId) {
  return async (c: RequestContext): Promise<Response> => {
    const s = await loadSettings(c.env.DB, c.preview);
    const [titleKey, textKey] = THANKS[id];
    const content = html`<section class="section">
      <div class="container narrow thanks">
        <span class="thanks-icon" aria-hidden="true">${icon("check")}</span>
        <h1 class="page-title"${ek(s, titleKey)}>${s[titleKey]}</h1>
        <p class="page-lead"${ek(s, textKey)}>${s[textKey]}</p>
        <div class="page-actions">
          <a class="btn btn-primary" href="/"${ek(s, "thanks_home")}>${s.thanks_home}</a>
          <a class="arrow-link" href="/kalender"${ek(s, "thanks_events")}>${s.thanks_events}${icon("arrowRight", "icon icon-sm")}</a>
        </div>
      </div>
    </section>`;
    return htmlResponse(c, layout(c, s, { title: s[titleKey], noindex: true }, content));
  };
}
