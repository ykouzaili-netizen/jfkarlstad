import { html, type SafeHtml } from "../lib/html.js";
import { FORM_RECIPIENT_PREFIX, mailConfig, parseAddresses, sendMail, SmtpError, type SmtpStep } from "../lib/mail.js";
import { FORM_LABELS, type FormId } from "../pages/forms.js";
import { rateLimit } from "../lib/security.js";
import type { Env } from "../env.js";
import type { RequestContext } from "../router.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";

/**
 * E-post: visar om notiserna är inställda och låter en administratör skicka ett testmejl.
 * Går något fel förklaras det i klartext (vilken inställning som troligen är fel), så att styrelsen
 * kan rätta det i Cloudflare utan att behöva läsa loggar. Lösenordet visas aldrig – bara att det finns.
 */

const SETTINGS_PATH = "Workers & Pages → jfkarlstad → Settings → Variables and Secrets";

interface Row {
  name: string;
  value: string | null;
  shown: string;
  hint: string;
  warn?: string;
}

function settingRows(env: Env): Row[] {
  const raw = (v: string | undefined) => (v ?? "").trim() || null;
  const pass = env.SMTP_PASS ?? "";
  return [
    { name: "SMTP_HOST", value: raw(env.SMTP_HOST), shown: raw(env.SMTP_HOST) ?? "", hint: "send.one.com" },
    { name: "SMTP_PORT", value: raw(env.SMTP_PORT), shown: raw(env.SMTP_PORT) ?? "465 (standard)", hint: "465" },
    { name: "SMTP_USER", value: raw(env.SMTP_USER), shown: raw(env.SMTP_USER) ?? "", hint: "hela e-postadressen, t.ex. informationsansvarig@jfkarlstad.se" },
    {
      name: "SMTP_PASS",
      value: pass.trim() ? "x" : null,
      shown: pass.trim() ? `Inlagt (${pass.replace(/^[\r\n]+|[\r\n]+$/g, "").length} tecken – visas aldrig)` : "",
      hint: "lösenordet till brevlådan hos One.com",
      warn: pass.trim() && /^[ \t]|[ \t]$/.test(pass.replace(/^[\r\n]+|[\r\n]+$/g, "")) ? "Lösenordet börjar eller slutar med ett mellanslag. Det följer ofta med när man klistrar in – lägg in det igen utan mellanslaget." : undefined,
    },
    { name: "MAIL_TO", value: raw(env.MAIL_TO), shown: raw(env.MAIL_TO) ?? `${raw(env.SMTP_USER) ?? "–"} (samma som SMTP_USER)`, hint: "adressen som ska få notiserna" },
  ];
}

/** Begriplig förklaring av ett SMTP-fel, utifrån vilket steg som gick fel och serverns svarskod. */
function explain(step: SmtpStep | null, message: string, env: Env): { title: string; text: SafeHtml } {
  const cfg = mailConfig(env);
  const where = cfg ? `${cfg.host}:${cfg.port}` : "";
  const code = /\b([45]\d\d)\b/.exec(message)?.[1] ?? "";
  if (/tidsgräns/i.test(message) && (step === "anslutning" || step === null)) {
    return {
      title: "Sajten fick inget svar från e-postservern.",
      text: html`Kontrollera att <code>SMTP_HOST</code> är <code>send.one.com</code> och <code>SMTP_PORT</code> är <code>465</code>. Just nu används <code>${where}</code>.`,
    };
  }
  switch (step) {
    case "anslutning":
      return {
        title: `Sajten kunde inte ansluta till e-postservern ${where}.`,
        text: html`Kontrollera att <code>SMTP_HOST</code> är <code>send.one.com</code> (utan https:// eller mellanslag) och att <code>SMTP_PORT</code> är <code>465</code>.`,
      };
    case "kryptering":
      return {
        title: "Den krypterade anslutningen till e-postservern misslyckades.",
        text: html`Sätt <code>SMTP_PORT</code> till <code>465</code> – det är den port One.com använder för krypterad e-post.`,
      };
    case "inloggning":
      return {
        title: "One.com godkände inte inloggningen.",
        text: html`Användarnamnet eller lösenordet stämmer inte. Kontrollera att <code>SMTP_USER</code> är hela adressen (<code>${cfg?.user ?? ""}</code>) och lägg in lösenordet i <code>SMTP_PASS</code> på nytt – samma lösenord som du loggar in i webbmejlen hos One.com med. Testa gärna att logga in i webbmejlen först, så vet du att lösenordet är rätt.`,
      };
    case "avsandare":
      return {
        title: "E-postservern vägrade skicka från avsändaradressen.",
        text: html`Inloggningen gick bra, men <code>${cfg?.user ?? ""}</code> får inte användas som avsändare. Kontrollera att <code>SMTP_USER</code> är exakt samma adress som brevlådan.`,
      };
    case "mottagare":
      return {
        title: "Mottagaradressen godtogs inte.",
        text: html`Kontrollera att <code>MAIL_TO</code> är en giltig e-postadress (just nu <code>${cfg?.to ?? ""}</code>).`,
      };
    case "meddelande":
      return {
        title: "E-postservern tog inte emot meddelandet.",
        text: html`Inloggningen fungerade, men servern stoppade själva mejlet${code ? html` (kod ${code})` : ""}. Det kan vara ett tillfälligt fel – prova igen om en stund. Fortsätter det kan One.com:s support se varför.`,
      };
    default:
      return { title: "Testmejlet kunde inte skickas.", text: html`Prova igen om en stund.` };
  }
}

async function unsentCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM submissions WHERE email_sent = 0 AND created_at >= datetime('now', '-30 days') AND created_at <= datetime('now', '-2 minutes')")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

type RecipientState = { values: Record<string, string>; errors: Record<string, string>; saved?: boolean };

/** Formulärens egna mottagare (tomt = standardadressen). */
async function loadRecipients(db: D1Database): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const { results } = await db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").bind(FORM_RECIPIENT_PREFIX + "%").all<{ key: string; value: string }>();
    for (const r of results) out[r.key.slice(FORM_RECIPIENT_PREFIX.length)] = r.value;
  } catch {
    /* tom lista */
  }
  return out;
}

async function render(c: RequestContext, session: Session, result?: { ok: true; to: string } | { ok: false; title: string; text: SafeHtml; detail: string } | { limited: true }, recipients?: RecipientState): Promise<Response> {
  const rows = settingRows(c.env);
  const rec: RecipientState = recipients ?? { values: await loadRecipients(c.env.DB), errors: {} };
  const cfg = mailConfig(c.env);
  const missing = rows.filter((r) => !r.value && (r.name === "SMTP_HOST" || r.name === "SMTP_USER" || r.name === "SMTP_PASS"));
  const unsent = await unsentCount(c.env.DB);

  const status = !cfg
    ? html`<div class="alert alert-warn"><strong>E-postnotiserna är inte påslagna.</strong> Sajten hittar inte ${missing.map((r, i) => html`${i ? (i === missing.length - 1 ? " och " : ", ") : ""}<code>${r.name}</code>`)}.
        Lägg in ${missing.length === 1 ? "den" : "dem"} i Cloudflare under <em>${SETTINGS_PATH}</em> (välj typen <strong>Secret</strong>). Kontrollera stavningen – namnet måste vara exakt som i tabellen nedan.</div>`
    : "";

  const resultBox = !result
    ? ""
    : "limited" in result
      ? html`<div class="alert alert-error" role="alert">Du har skickat många testmejl på kort tid. Vänta en stund och prova igen.</div>`
      : result.ok
        ? html`<div class="alert alert-ok" role="status"><strong>Testmejlet är skickat till ${result.to}.</strong> Det brukar komma fram inom någon minut – kolla även skräpposten. Kommer det fram fungerar notiserna för alla formulär.</div>`
        : html`<div class="alert alert-error" role="alert">
            <strong>${result.title}</strong> ${result.text}
            <details class="mail-detail"><summary>Tekniskt felmeddelande</summary><code>${result.detail}</code></details>
          </div>`;

  const content = html`
    ${adminHead("E-post", {
      lead: "Notiser till styrelsen när någon skickar in ett formulär, påminnelser om obesvarade meddelanden och lösenordslänkar till adminpanelen skickas härifrån.",
    })}
    ${resultBox}
    ${status}
    ${cfg && unsent && !(result && "ok" in result && result.ok)
      ? html`<div class="alert alert-warn">${unsent === 1 ? "Ett meddelande" : `${unsent} meddelanden`} från de senaste 30 dagarna kunde inte mejlas ut. De finns sparade under <a href="/admin/meddelanden">Meddelanden</a>. Skicka ett testmejl nedan för att se vad som är fel.</div>`
      : ""}
    <section class="admin-card">
      <h2 class="card-heading">Inställningar i Cloudflare</h2>
      <p class="muted">Ändras i Cloudflare under <em>${SETTINGS_PATH}</em>. Välj typen <strong>Secret</strong> för alla – värden av typen Text kan skrivas över när sajten publiceras.</p>
      <table class="admin-table mail-table">
        <thead><tr><th scope="col">Namn</th><th scope="col">Just nu</th><th scope="col">Ska vara</th></tr></thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr>
              <td data-label="Namn"><code>${r.name}</code></td>
              <td data-label="Just nu">${r.shown ? r.shown : html`<span class="pill pill-warn">Saknas</span>`}${r.warn ? html`<p class="field-error">${r.warn}</p>` : ""}</td>
              <td data-label="Ska vara" class="muted">${r.hint}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </section>
    <section class="admin-card" id="mottagare">
      <h2 class="card-heading">Vart skickas notiserna?</h2>
      <p class="muted">Varje formulär kan ha egna mottagare. Lämna tomt så går notisen till standardadressen${cfg ? html` (<strong>${cfg.to}</strong>)` : ""}. Flera adresser skiljs åt med komma.</p>
      ${rec.saved ? html`<div class="alert alert-ok" role="status">Mottagarna är sparade. Nästa inskick mejlas till de nya adresserna.</div>` : ""}
      <form class="admin-form" method="post" action="/admin/e-post/mottagare" novalidate>
        ${csrfField(session)}
        ${(Object.keys(FORM_LABELS) as FormId[]).map((id) => {
          const err = rec.errors[id];
          return html`<div class="field${err ? " has-error" : ""}">
            <label class="field-label" for="mottagare-${id}">${FORM_LABELS[id]}</label>
            ${id === "paverka" ? html`<p class="field-help" id="mottagare-${id}-hjalp">Inskicken är anonyma – mejlet innehåller aldrig namn, e-post eller IP-adress.</p>` : ""}
            <input type="text" inputmode="email" id="mottagare-${id}" name="${id}" value="${rec.values[id] ?? ""}" placeholder="${cfg?.to ?? "Standardadressen"}" autocomplete="off" spellcheck="false" maxlength="300"${err ? html` aria-invalid="true" aria-describedby="mottagare-${id}-fel"` : id === "paverka" ? html` aria-describedby="mottagare-${id}-hjalp"` : ""}>
            ${err ? html`<p class="field-error" id="mottagare-${id}-fel">${err}</p>` : ""}
          </div>`;
        })}
        <button class="btn btn-primary" type="submit">Spara mottagare</button>
      </form>
    </section>
    <section class="admin-card">
      <h2 class="card-heading">Skicka ett testmejl</h2>
      ${cfg
        ? html`<p>Ett kort testmejl skickas till <strong>${cfg.to}</strong>. Går något fel får du veta vad och hur du rättar det.</p>
            <form method="post" action="/admin/e-post/test">
              ${csrfField(session)}
              <button class="btn btn-primary" type="submit">${icon("mail", "icon icon-sm")}Skicka testmejl</button>
            </form>`
        : html`<p class="muted">Lägg först in uppgifterna ovan i Cloudflare. Ladda sedan om den här sidan.</p>`}
    </section>`;
  return adminLayout(c, session, { title: "E-post", active: "/admin/e-post", newCount: await newMessageCount(c.env.DB), narrow: true }, content);
}

export async function mailPage(c: RequestContext, session: Session): Promise<Response> {
  return render(c, session);
}

export async function mailTestSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return render(c, session, { ok: false, title: "Sidan hade hunnit bli för gammal.", text: html`Ladda om sidan och prova igen.`, detail: "csrf" });
  const cfg = mailConfig(c.env);
  if (!cfg) return render(c, session);
  if (!(await rateLimit(c.env, c.req, "testmejl", 10, 3600))) return render(c, session, { limited: true });
  const site = c.env.SITE_URL.replace(/\/$/, "");
  try {
    await sendMail(c.env, {
      to: [cfg.to],
      subject: "Testmejl från JFK:s webbplats",
      text: `Hej!\n\nDet här är ett testmejl som ${session.user.name} skickade från adminpanelen.\n\nKom det fram fungerar e-postnotiserna: när någon skickar in ett formulär på webbplatsen får ni ett mejl hit.\n\n${site}/admin/meddelanden\n\n/ JFK:s webbplats`,
    });
    await audit(c.env, session, "skickade", "testmejl", null, cfg.to);
    return render(c, session, { ok: true, to: cfg.to });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const step = err instanceof SmtpError ? err.step : null;
    console.error("Testmejlet misslyckades", step ?? "", message);
    return render(c, session, { ok: false, ...explain(step, message, c.env), detail: message });
  }
}

/** Spara formulärens egna mottagare. Tomt fält = standardadressen (raden tas bort). */
export async function mailRecipientsSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return render(c, session, { ok: false, title: "Sidan hade hunnit bli för gammal.", text: html`Ladda om sidan och prova igen.`, detail: "csrf" });
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const id of Object.keys(FORM_LABELS)) {
    const v = String(form.get(id) ?? "").trim().slice(0, 300);
    values[id] = v;
    if (v && !parseAddresses(v)) errors[id] = "Skriv hela e-postadresser, t.ex. viceordforande@jfkarlstad.se. Flera adresser skiljs åt med komma.";
  }
  if (Object.keys(errors).length) return render(c, session, undefined, { values, errors });
  const db = c.env.DB;
  const before = await loadRecipients(db);
  const changed = Object.keys(values).filter((id) => (before[id] ?? "") !== (parseAddresses(values[id]!) ?? []).join(", "));
  await db.batch(
    Object.keys(values).map((id) => {
      const list = parseAddresses(values[id]!) ?? [];
      return list.length
        ? db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(FORM_RECIPIENT_PREFIX + id, list.join(", "))
        : db.prepare("DELETE FROM settings WHERE key = ?").bind(FORM_RECIPIENT_PREFIX + id);
    }),
  );
  if (changed.length) await audit(c.env, session, "ändrade", "e-postmottagare", null, changed.map((id) => FORM_LABELS[id as FormId]).join(", "));
  return render(c, session, undefined, { values: await loadRecipients(db), errors: {}, saved: true });
}
