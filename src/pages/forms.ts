import { html, paragraphs, raw, safeUrl, type SafeHtml } from "../lib/html.js";
import { lines, loadSettings, type Settings } from "../lib/settings.js";
import { boardQuery, partnerQuery, rows, type BoardRow, type PartnerRow } from "../lib/content.js";
import { errorSummary, renderField, validate, type Errors, type FieldSpec, type Values } from "../lib/forms.js";
import { checkFormToken, clientIp, formToken, rateLimit, turnstileEnabled, verifyTurnstile } from "../lib/security.js";
import { mailConfigured, sendMail } from "../lib/mail.js";
import { htmlResponse, redirect } from "../lib/http.js";
import { telHref } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import type { Env } from "../env.js";
import { layout } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { checkList, pageHeader } from "../views/page.js";
import { partnerLogo } from "../views/components.js";

type FormId = "kontakt" | "foretag" | "paverka";

const CONTACT_FIELDS: FieldSpec[] = [
  { name: "namn", label: "Namn", type: "text", required: true, max: 100, autocomplete: "name" },
  { name: "epost", label: "E-post", type: "email", required: true, max: 200, autocomplete: "email" },
  {
    name: "amne",
    label: "Vad gäller det?",
    type: "select",
    options: [
      { value: "Medlemskap", label: "Medlemskap" },
      { value: "Evenemang", label: "Evenemang" },
      { value: "Samarbete", label: "Samarbete" },
      { value: "Annat", label: "Annat" },
    ],
  },
  { name: "meddelande", label: "Meddelande", type: "textarea", required: true, max: 5000, rows: 7 },
];

const COMPANY_FIELDS: FieldSpec[] = [
  { name: "foretag", label: "Företag eller organisation", type: "text", required: true, max: 150, autocomplete: "organization" },
  { name: "namn", label: "Kontaktperson", type: "text", required: true, max: 100, autocomplete: "name" },
  { name: "epost", label: "E-post", type: "email", required: true, max: 200, autocomplete: "email" },
  { name: "telefon", label: "Telefon", type: "tel", max: 30, autocomplete: "tel" },
  {
    name: "intresse",
    label: "Intresserad av",
    type: "select",
    options: [
      { value: "Huvudsamarbetspartner", label: "Huvudsamarbetspartner" },
      { value: "Samarbetspartner", label: "Samarbetspartner" },
      { value: "Enskilt evenemang", label: "Enskilt evenemang" },
      { value: "Vet inte än", label: "Vet inte än – berätta mer" },
    ],
  },
  { name: "meddelande", label: "Berätta kort om er och vad ni vill uppnå", type: "textarea", required: true, max: 5000, rows: 6 },
];

const PAVERKA_TYPES = [
  { value: "utbildning", label: "JF Åsikt – utbildning", hint: "Kurser, examinationer, lärare eller annat i utbildningen" },
  { value: "forening", label: "JF Åsikt – förening", hint: "Föreningens verksamhet, styrelsens arbete eller medlemmars uppträdande" },
  { value: "initiativ", label: "JF Initiativ", hint: "Förslag på ett nytt projekt, en aktivitet eller ett initiativ" },
];

const PAVERKA_FIELDS: FieldSpec[] = [
  { name: "typ", label: "Vad vill du lämna?", type: "radio", required: true, options: PAVERKA_TYPES },
  { name: "rubrik", label: "Rubrik", type: "text", required: true, max: 150, help: "En kort sammanfattning, t.ex. ”Sen återkoppling på tentan i T3”." },
  {
    name: "meddelande",
    label: "Beskriv",
    type: "textarea",
    required: true,
    max: 5000,
    rows: 8,
    help: "Skriv bara det som behövs för ärendet. Undvik känsliga uppgifter, som hälsa, och namnge inte andra personer om det inte är nödvändigt.",
  },
  {
    name: "anonym",
    label: "Skicka anonymt",
    type: "checkbox",
    help: "Då sparar vi varken namn, e-post eller IP-adress, och styrelsen kan inte svara dig. Tänk på att det du skriver kan avslöja vem du är.",
  },
  { name: "namn", label: "Namn", type: "text", max: 100, autocomplete: "name", wrapClass: "js-identity" },
  { name: "epost", label: "E-post", type: "email", max: 200, autocomplete: "email", wrapClass: "js-identity", help: "Fyll i om du vill att vi återkopplar till dig." },
];

const FORMS: Record<FormId, { fields: FieldSpec[]; path: string; label: string }> = {
  kontakt: { fields: CONTACT_FIELDS, path: "/kontakt", label: "Kontaktformuläret" },
  foretag: { fields: COMPANY_FIELDS, path: "/for-foretag", label: "Företagsformuläret" },
  paverka: { fields: PAVERKA_FIELDS, path: "/jf-paverka", label: "JF Påverka" },
};

// ───────────────────────── Rendering ─────────────────────────

async function formBlock(c: RequestContext, id: FormId, values: Values = {}, errors: Errors = {}, topError?: string): Promise<SafeHtml> {
  const def = FORMS[id];
  const token = await formToken(c.env);
  const ts = turnstileEnabled(c.env);
  return html`<form class="form-card" method="post" action="${def.path}" novalidate data-form="${id}">
    ${errorSummary(errors, def.fields, topError)}
    ${def.fields.map((f) => renderField(f, values[f.name] ?? "", errors[f.name]))}
    <div class="hp-field" aria-hidden="true">
      <label for="falt-webbplats">Lämna detta fält tomt</label>
      <input type="text" id="falt-webbplats" name="webbplats" tabindex="-1" autocomplete="off">
    </div>
    <input type="hidden" name="_t" value="${token}">
    ${ts ? html`<div class="cf-turnstile" data-sitekey="${c.env.TURNSTILE_SITE_KEY}" data-language="sv"></div>` : ""}
    <div class="form-footer">
      <button class="btn btn-primary btn-lg" type="submit">Skicka</button>
      <p class="fine-print">Vi behandlar dina uppgifter enligt vår <a href="/integritetspolicy">integritetspolicy</a>.</p>
    </div>
  </form>
  ${ts ? raw('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>') : ""}`;
}

export async function contactPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const [s, board] = await Promise.all([loadSettings(db, c.preview), rows<BoardRow>(boardQuery.all(db))]);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address_street}, ${s.address_city}`)}`;
  const content = html`
    ${pageHeader({ kicker: "Kontakt", title: "Hör av dig till oss", lead: s.contact_lead })}
    <section class="section section-tight-top">
      <div class="container form-layout">
        <div>
          <h2 class="form-title">Skicka ett meddelande</h2>
          <p class="form-intro">Har du idéer eller synpunkter på föreningen eller utbildningen? Använd hellre <a href="/jf-paverka">JF Påverka</a> – där kan du vara anonym.</p>
          ${await formBlock(c, "kontakt", values, errors, topError)}
        </div>
        <aside class="stack">
          <div class="info-card">
            <h2 class="info-title">Kontaktuppgifter</h2>
            <ul class="contact-list">
              <li>${icon("pin")}<span>${s.address_street}<br>${s.address_city}<br><a href="${mapUrl}" target="_blank" rel="noopener">Visa på karta<span class="sr-only"> (öppnas i ny flik)</span></a></span></li>
              <li>${icon("mail")}<a href="mailto:${s.contact_email}">${s.contact_email}</a></li>
              ${s.contact_phone ? html`<li>${icon("phone")}<a href="${telHref(s.contact_phone)}">${s.contact_phone}</a></li>` : ""}
              <li>${icon("instagram")}<a href="${safeUrl(s.instagram_url)}" target="_blank" rel="noopener">${s.instagram_handle}<span class="sr-only"> på Instagram (öppnas i ny flik)</span></a></li>
            </ul>
          </div>
          ${board.filter((b) => b.email).length
            ? html`<div class="info-card">
                <h2 class="info-title">Mejla styrelsen direkt</h2>
                <ul class="board-mail-list">
                  ${board.filter((b) => b.email).map((b) => html`<li><span class="muted">${b.role}</span><a href="mailto:${b.email}">${b.email}</a></li>`)}
                </ul>
              </div>`
            : ""}
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "Kontakt", description: s.contact_lead }, content), status);
}

export async function companiesPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const [s, partners] = await Promise.all([loadSettings(db, c.preview), rows<PartnerRow>(partnerQuery.all(db))]);
  const packages = [1, 2, 3]
    .map((n) => ({ name: s[`package_${n}_name` as "package_1_name"], text: s[`package_${n}_text` as "package_1_text"] }))
    .filter((p) => p.name);
  const content = html`
    ${pageHeader({
      kicker: "För företag",
      title: "Samarbeta med JFK",
      lead: s.companies_lead,
      actions: html`<a class="btn btn-primary btn-lg" href="#kontakta-oss">Kontakta oss</a><a class="arrow-link" href="/partners">Våra nuvarande partners${icon("arrowRight", "icon icon-sm")}</a>`,
    })}
    <section class="section section-tight-top">
      <div class="container split split-top">
        <div>
          <h2 class="section-title">Varför JFK?</h2>
          <div class="prose">${paragraphs(s.companies_text)}</div>
        </div>
        <div class="info-card">
          <h2 class="info-title">Det här får ni</h2>
          ${checkList(lines(s.companies_benefits))}
        </div>
      </div>
    </section>

    ${packages.length
      ? html`<section class="section section-surface" aria-labelledby="paket">
          <div class="container">
            <div class="section-head"><div><h2 class="section-title" id="paket">Samarbetsformer</h2><p class="section-lead">${s.packages_note}</p></div></div>
            <ul class="package-grid">
              ${packages.map((p, i) => html`<li class="package-card${i === 0 ? " package-featured" : ""}"><h3 class="package-name">${p.name}</h3><p>${p.text}</p></li>`)}
            </ul>
          </div>
        </section>`
      : ""}

    ${partners.length
      ? html`<section class="section section-tight" aria-label="Nuvarande samarbetspartners">
          <div class="container">
            <p class="partner-strip-title center">De samarbetar redan med oss</p>
            <ul class="logo-row center">${partners.map((p) => html`<li><a href="/partners/${p.slug}">${partnerLogo(p, "sm")}</a></li>`)}</ul>
          </div>
        </section>`
      : ""}

    <section class="section" aria-labelledby="kontakta-oss">
      <div class="container form-layout">
        <div>
          <h2 class="section-title" id="kontakta-oss">Kontakta oss</h2>
          <p class="form-intro">Berätta kort om er, så hör vår arbetsmarknadsansvariga av sig inom några dagar.</p>
          ${await formBlock(c, "foretag", values, errors, topError)}
        </div>
        <aside class="aside-card">
          <h3 class="aside-title">Hellre mejl?</h3>
          <p>Skriv till <a href="mailto:arbetsmarknadsansvarig@jfkarlstad.se">arbetsmarknadsansvarig@jfkarlstad.se</a>.</p>
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "För företag", description: s.companies_lead }, content), status);
}

export async function paverkaPage(c: RequestContext, values?: Values, errors?: Errors, topError?: string, status = 200): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const content = html`
    ${pageHeader({ kicker: "JF Påverka", title: "Gör din röst hörd", lead: s.paverka_lead })}
    <section class="section section-tight-top">
      <div class="container form-layout">
        <div>
          ${await formBlock(c, "paverka", values, errors, topError)}
        </div>
        <aside class="stack">
          <div class="info-card info-card-accent">
            <h2 class="info-title">Så fungerar det</h2>
            <div class="prose">${paragraphs(s.paverka_page_text)}</div>
          </div>
          <div class="info-card">
            <h2 class="info-title">${icon("lock")} Anonymt på riktigt</h2>
            <p>När du skickar anonymt sparas bara det du skriver i rubriken och beskrivningen. Ingen IP-adress, inget namn, ingen e-post – varken i databasen, i våra loggar eller i mejlet till styrelsen.</p>
          </div>
        </aside>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: "JF Påverka", description: s.paverka_lead }, content), status);
}

const RENDER: Record<FormId, typeof contactPage> = { kontakt: contactPage, foretag: companiesPage, paverka: paverkaPage };

// ───────────────────────── Inskick ─────────────────────────

export function submitHandler(id: FormId) {
  return async (c: RequestContext): Promise<Response> => {
    const def = FORMS[id];
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return RENDER[id](c, {}, {}, "Formuläret kunde inte läsas. Försök igen.", 400);
    }

    // Honungsfälla: robotar fyller i alla fält. Låtsas att det gick bra.
    if (String(form.get("webbplats") ?? "").trim()) return redirect(`${def.path}/tack`, 303);

    const { values, errors } = validate(def.fields, form);
    const anonymous = id === "paverka" && values.anonym === "1";
    if (anonymous) {
      values.namn = "";
      values.epost = "";
      delete errors.namn;
      delete errors.epost;
    }
    if (Object.keys(errors).length) return RENDER[id](c, values, errors, undefined, 422);

    const humanOk = (await checkFormToken(c.env, String(form.get("_t") ?? ""))) &&
      (await verifyTurnstile(c.env, form.get("cf-turnstile-response") as string | null, anonymous ? "" : clientIp(c.req)));
    if (!humanOk) {
      return RENDER[id](c, values, {}, "Vi kunde inte bekräfta att du inte är en robot. Vänta några sekunder och försök igen.", 422);
    }
    if (!(await rateLimit(c.env, c.req, `form:${id}`, 5, 3600))) {
      return RENDER[id](c, values, {}, "Du har skickat många meddelanden på kort tid. Vänta en stund och försök igen.", 429);
    }

    const { subject, message, data } = summarize(id, values);
    const result = await c.env.DB.prepare(
      "INSERT INTO submissions (form, name, email, subject, message, data, anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, values.namn || null, values.epost || null, subject, message, JSON.stringify(data), anonymous ? 1 : 0)
      .run();
    const submissionId = result.meta.last_row_id;

    // E-post är best effort och får aldrig blockera eller fälla inskicket.
    c.exec.waitUntil(notifyBoard(c.env, submissionId, id, values, subject, message, data, anonymous));

    return redirect(`${def.path}/tack`, 303);
  };
}

function summarize(id: FormId, v: Values): { subject: string; message: string; data: Record<string, string> } {
  if (id === "kontakt") return { subject: v.amne || "Kontakt", message: v.meddelande!, data: {} };
  if (id === "foretag") {
    return {
      subject: `${v.foretag} – ${v.intresse || "Samarbete"}`,
      message: v.meddelande!,
      data: { Företag: v.foretag!, Telefon: v.telefon ?? "", Intresse: v.intresse ?? "" },
    };
  }
  const typ = PAVERKA_TYPES.find((t) => t.value === v.typ)?.label ?? "JF Påverka";
  return { subject: `${typ}: ${v.rubrik}`, message: v.meddelande!, data: { Typ: typ } };
}

async function notifyBoard(
  env: Env,
  submissionId: number,
  id: FormId,
  v: Values,
  subject: string,
  message: string,
  data: Record<string, string>,
  anonymous: boolean,
): Promise<void> {
  if (!mailConfigured(env)) return;
  const to = env.MAIL_TO || env.SMTP_USER!;
  const site = env.SITE_URL.replace(/\/$/, "");
  const label = FORMS[id].label;
  const parts = [
    `Nytt meddelande via ${label} på webbplatsen.`,
    "",
    anonymous ? "Avsändare: anonym" : `Från: ${v.namn || "–"}${v.epost ? ` <${v.epost}>` : ""}`,
    ...Object.entries(data).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`),
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

export function thanksPage(id: FormId) {
  return async (c: RequestContext): Promise<Response> => {
    const s: Settings = await loadSettings(c.env.DB, c.preview);
    const text: Record<FormId, { title: string; body: string }> = {
      kontakt: { title: "Tack för ditt meddelande!", body: "Vi har tagit emot det och återkommer så snart vi kan, oftast inom några dagar." },
      foretag: { title: "Tack för ert intresse!", body: "Vår arbetsmarknadsansvariga hör av sig inom några dagar för att prata vidare om ett samarbete." },
      paverka: { title: "Tack för att du gör din röst hörd!", body: "Ditt inskick tas upp på nästa styrelsemöte. Om du lämnade kontaktuppgifter kan vi återkoppla till dig." },
    };
    const t = text[id];
    const content = html`<section class="section">
      <div class="container narrow thanks">
        <span class="thanks-icon" aria-hidden="true">${icon("mail")}</span>
        <h1 class="page-title">${t.title}</h1>
        <p class="page-lead">${t.body}</p>
        <div class="page-actions"><a class="btn btn-primary" href="/">Till startsidan</a><a class="arrow-link" href="/kalender">Se kommande evenemang${icon("arrowRight", "icon icon-sm")}</a></div>
      </div>
    </section>`;
    return htmlResponse(c, layout(c, s, { title: t.title, noindex: true }, content));
  };
}
