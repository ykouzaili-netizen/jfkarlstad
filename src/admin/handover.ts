import { html, type SafeHtml } from "../lib/html.js";
import { loadSettings, type Settings } from "../lib/settings.js";
import { redirect } from "../lib/http.js";
import { formatDateTimeShort } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";

/**
 * Styrelseskifte: en checklista som hjälper en ny styrelse att ta över webbplatsen.
 * Bocka av stegen när de är gjorda. Läget sparas i inställningen `handover_state`.
 */

interface Step {
  id: string;
  title: string;
  text: string;
  link?: { href: string; label: string };
}

const STEPS: Step[] = [
  { id: "styrelse", title: "Lägg in den nya styrelsen", text: "Byt namn, roller och e-postadresser. Ta bort foton på dem som har avgått.", link: { href: "/admin/styrelsen", label: "Styrelsen" } },
  { id: "foton", title: "Fråga om samtycke till foton", text: "Ladda bara upp foton på de nya ledamöterna om de har sagt ja till det (GDPR). Utan foto visas initialerna." },
  { id: "konton", title: "Bjud in de nya till adminpanelen", text: "Varje person får ett eget konto – dela aldrig inloggningar.", link: { href: "/admin/anvandare", label: "Användare" } },
  { id: "gamla-konton", title: "Ta bort konton för dem som slutat", text: "Den som inte sitter kvar i styrelsen ska inte kunna logga in längre." },
  { id: "admins", title: "Se till att minst två är administratörer", text: "Då står ni aldrig utan någon som kan bjuda in nya eller ändra utseendet." },
  { id: "kontakt", title: "Kontrollera kontaktuppgifterna", text: "E-post, telefonnummer, adress och organisationsnummer i sidfoten och på kontaktsidan.", link: { href: "/admin/texter?sida=gemensamt", label: "Gemensamma texter" } },
  { id: "arstal", title: "Leta efter gamla årtal i texterna", text: "Sök efter förra årets årtal och uppdatera det som har blivit inaktuellt." },
  { id: "kursombud", title: "Uppdatera kursombuden", text: "Nya kursombud väljs ofta samtidigt som styrelsen.", link: { href: "/admin/kursombud", label: "Kursombud" } },
  { id: "uppdrag", title: "Uppdatera lediga uppdrag", text: "Lägg upp de poster ni vill fylla och ta bort de som är tillsatta.", link: { href: "/admin/uppdrag", label: "Lediga uppdrag" } },
  { id: "losenord", title: "Byt lösenordet till föreningens e-post", text: "Byt lösenordet hos One.com och lägg in det nya som hemligheten SMTP_PASS i Cloudflare, annars slutar e-postnotiserna fungera (se README:n, avsnitt 4)." },
  { id: "tjanster", title: "För över inloggningar till andra tjänster", text: "Cloudflare (webbplatsen), GitHub (koden), One.com (e-post och domän), Hitract (medlemmar) och Instagram. Lägg till de nya och ta bort de gamla." },
];

interface HandoverState {
  done: string[];
  by?: string;
  at?: string;
}

function parseState(json: string): HandoverState {
  try {
    const data = JSON.parse(json || "{}") as Partial<HandoverState>;
    return { done: Array.isArray(data.done) ? data.done.filter((d) => typeof d === "string") : [], by: data.by, at: data.at };
  } catch {
    return { done: [] };
  }
}

export function handoverProgress(s: Settings): { done: number; total: number } {
  const st = parseState(s.handover_state);
  return { done: STEPS.filter((x) => st.done.includes(x.id)).length, total: STEPS.length };
}

export async function handoverPage(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const s = await loadSettings(db);
  const state = parseState(s.handover_state);
  const [inactive, admins] = await db.batch([
    db.prepare("SELECT id, name, last_login_at FROM users WHERE active = 1 AND (last_login_at IS NULL OR last_login_at < datetime('now', '-90 days')) ORDER BY name"),
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND role = 'admin'"),
  ]);
  const stale = inactive!.results as { id: number; name: string; last_login_at: string | null }[];
  const adminCount = ((admins!.results[0] as { n?: number } | undefined)?.n ?? 0) as number;
  const lastYear = String(new Date().getFullYear() - 1);
  const { done, total } = handoverProgress(s);

  const extra = (step: Step): SafeHtml | string => {
    if (step.id === "gamla-konton")
      return stale.length
        ? html`<p class="step-note">${icon("users", "icon icon-sm")} Har inte loggat in på 90 dagar: ${stale.map((u, i) => html`${i ? ", " : ""}<strong>${u.name}</strong>`)}. <a href="/admin/anvandare">Hantera användare</a></p>`
        : html`<p class="step-note step-note-ok">${icon("check", "icon icon-sm")} Alla konton har använts de senaste 90 dagarna.</p>`;
    if (step.id === "admins")
      return html`<p class="step-note${adminCount >= 2 ? " step-note-ok" : ""}">${icon(adminCount >= 2 ? "check" : "users", "icon icon-sm")} Just nu ${adminCount === 1 ? "finns 1 administratör" : `finns ${adminCount} administratörer`}.</p>`;
    if (step.id === "arstal") return html`<p class="step-note"><a href="/admin/sok?q=${lastYear}">${icon("search", "icon icon-sm")}Sök efter ”${lastYear}”</a></p>`;
    return "";
  };

  const content = html`
    ${adminHead("Styrelseskifte", { lead: "Checklistan för när en ny styrelse tar över webbplatsen. Bocka av stegen allteftersom – listan sparas, så ni kan dela upp arbetet mellan er." })}
    <div class="handover-progress">
      <progress class="handover-bar" max="${total}" value="${done}" aria-label="Styrelseskiftet: ${done} av ${total} steg klara"></progress>
      <p><strong>${done} av ${total} steg klara</strong>${state.by && state.at ? html` <span class="muted">· senast ändrad av ${state.by}, ${formatDateTimeShort(state.at)}</span>` : ""}</p>
    </div>
    <form class="admin-form" method="post" action="/admin/styrelseskifte" data-dirty-check>
      ${csrfField(session)}
      <ol class="handover-list">
        ${STEPS.map(
          (step, i) => html`<li class="handover-step${state.done.includes(step.id) ? " is-done" : ""}">
            <label class="handover-check">
              <input type="checkbox" name="klart" value="${step.id}"${state.done.includes(step.id) ? html` checked` : ""}>
              <span class="handover-num" aria-hidden="true">${i + 1}</span>
            </label>
            <div class="handover-body">
              <h2 class="handover-title">${step.title}</h2>
              <p class="muted">${step.text}</p>
              ${extra(step)}
              ${step.link ? html`<a class="link-btn" href="${step.link.href}">${step.link.label} →</a>` : ""}
            </div>
          </li>`,
        )}
      </ol>
      <div class="admin-form-actions sticky-actions">
        <button class="btn btn-primary btn-lg" type="submit">Spara</button>
        ${done ? html`<button class="btn btn-outline" type="submit" name="nollstall" value="1" data-confirm-click="Börja om med en tom checklista inför nästa styrelseskifte?">Börja om</button>` : ""}
      </div>
    </form>`;
  return adminLayout(c, session, { title: "Styrelseskifte", active: "/admin/styrelseskifte", newCount: await newMessageCount(db), narrow: true }, content);
}

export async function handoverSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/styrelseskifte?fel=csrf", 303);
  const ids = new Set(STEPS.map((s) => s.id));
  const done = form.get("nollstall") ? [] : form.getAll("klart").map(String).filter((d) => ids.has(d));
  const state: HandoverState = { done, by: session.user.name, at: new Date().toISOString().replace("T", " ").slice(0, 19) };
  await c.env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('handover_state', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(state))
    .run();
  await audit(c.env, session, form.get("nollstall") ? "började om" : "uppdaterade", "checklistan för styrelseskifte", null, `${done.length} av ${STEPS.length} klara`);
  return redirect("/admin/styrelseskifte?klart=sparat", 303);
}
