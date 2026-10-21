import { html, raw, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { formatDateTimeShort } from "../lib/format.js";
import { qrSvg } from "../lib/qrcode.js";
import {
  decryptSecret,
  encryptSecret,
  groupedSecret,
  hashRecoveryCodes,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
  recoveryCount,
  verifyTotp,
} from "../lib/totp.js";
import type { RequestContext } from "../router.js";
import { audit, checkCsrf, destroyUserSessions, verifyPassword, type Session, type User } from "./auth.js";
import { saveSettings } from "./texts.js";
import { adminHead, adminLayout, csrfField, newMessageCount } from "./layout.js";

/**
 * Tvåstegsverifiering i adminpanelen: slå på (QR-kod + första koden), reservkoder, stäng av, och för
 * administratörer: stäng av för någon som har tappat telefonen, och kräv tvåstegsverifiering för alla.
 * Inloggningens andra steg finns i auth-pages.ts, kodlogiken i lib/totp.ts.
 */

const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** Rutan på Mitt konto. */
export function twoFactorCard(session: Session): SafeHtml {
  const u = session.user;
  const on = Boolean(u.totp_secret);
  const left = recoveryCount(u.recovery_codes);
  return html`<section class="admin-card narrow-card tfa-card" id="tvastegs" aria-labelledby="tvastegs-rubrik">
    <div class="tfa-head">
      <h2 class="card-heading" id="tvastegs-rubrik">Tvåstegsverifiering</h2>
      <span class="pill ${on ? "pill-on" : "pill-warn"}">${on ? "På" : "Av"}</span>
    </div>
    ${on
      ? html`<p>När du loggar in behöver du både lösenordet och en kod från autentiseringsappen. Påslagen ${formatDateTimeShort(u.totp_enabled_at)}.</p>
          <p class="${left <= 3 ? "tfa-warn" : "muted"}">${left === 0 ? "Du har inga reservkoder kvar – skapa nya nu." : `${left} reservkoder kvar.`}</p>
          <div class="tfa-actions">
            <a class="btn btn-outline btn-sm" href="/admin/konto/tvastegs">Nya reservkoder eller stäng av</a>
          </div>`
      : html`<p>Skydda kontot med en kod från en app i telefonen, utöver lösenordet. Då räcker det inte att någon kommer över ditt lösenord, till exempel via ett falskt inloggningsmejl.</p>
          <a class="btn btn-primary" href="/admin/konto/tvastegs">Slå på tvåstegsverifiering</a>`}
  </section>`;
}

/** Påminnelsen på Översikt för den som inte har slagit på det än. */
export function twoFactorNudge(session: Session): SafeHtml | string {
  if (session.user.totp_secret) return "";
  return html`<div class="alert alert-warn tfa-nudge" role="status">
    <p><strong>Skydda ditt konto med tvåstegsverifiering.</strong> Det tar två minuter och gör att ett stulet lösenord inte räcker för att komma in.</p>
    <a class="btn btn-primary btn-sm" href="/admin/konto/tvastegs">Slå på nu</a>
  </div>`;
}

function page(c: RequestContext, session: Session, content: SafeHtml, status = 200): Promise<Response> {
  return newMessageCount(c.env.DB).then((newCount) =>
    adminLayout(c, session, { title: "Tvåstegsverifiering", active: "/admin/konto", newCount, narrow: true }, content, status),
  );
}

function recoveryList(codes: string[]): SafeHtml {
  return html`<div class="tfa-codes">
    <ol class="tfa-code-list">${codes.map((code) => html`<li class="mono">${code}</li>`)}</ol>
    <div class="copy-row">
      <input type="text" readonly value="${codes.join(" ")}" aria-label="Alla reservkoder" data-copy-source>
      <button class="btn btn-outline btn-sm" type="button" data-copy>Kopiera alla</button>
    </div>
  </div>`;
}

/** GET /admin/konto/tvastegs – slå på (QR-kod), eller hantera när det redan är på. */
export async function twoFactorPage(c: RequestContext, session: Session, error?: string, status = 200): Promise<Response> {
  const u = session.user;
  const required = c.url.searchParams.get("krav") === "1" || session.mustSetUpTwoFactor;
  const flash = c.url.searchParams.get("klart");

  if (u.totp_secret) {
    const left = recoveryCount(u.recovery_codes);
    const kvar = Number(c.url.searchParams.get("kvar") ?? "");
    const content = html`
      ${adminHead("Tvåstegsverifiering", { back: { href: "/admin/konto", label: "Mitt konto" }, lead: "På. När du loggar in behöver du både lösenordet och en kod från appen." })}
      ${flash === "reservkod" ? html`<div class="alert alert-warn" role="status">Du loggade in med en reservkod. ${Number.isInteger(kvar) && kvar >= 0 ? `Du har ${kvar} kvar.` : ""} Skapa nya reservkoder nedan om du börjar få slut.</div>` : ""}
      ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ""}
      <section class="admin-card">
        <h2 class="card-heading">Reservkoder</h2>
        <p>${left === 0 ? "Du har inga reservkoder kvar." : `Du har ${left} oanvända reservkoder.`} Reservkoderna används om du inte har telefonen med dig. Nya koder ersätter de gamla.</p>
        <form class="admin-form" method="post" action="/admin/konto/tvastegs/reservkoder">
          ${csrfField(session)}
          <div class="field"><label class="field-label" for="falt-kod-r">Kod från appen</label><input class="code-input" type="text" id="falt-kod-r" name="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></div>
          <button class="btn btn-primary" type="submit">Skapa nya reservkoder</button>
        </form>
      </section>
      <section class="admin-card">
        <h2 class="card-heading">Stäng av</h2>
        <p>Då räcker lösenordet igen för att logga in.</p>
        <form class="admin-form" method="post" action="/admin/konto/tvastegs/av">
          ${csrfField(session)}
          <input type="hidden" name="anvandarnamn" value="${u.email}" autocomplete="username">
          <div class="field"><label class="field-label" for="falt-losen-av">Ditt lösenord</label><input type="password" id="falt-losen-av" name="losenord" autocomplete="current-password" required></div>
          <button class="btn btn-danger-ghost" type="submit">Stäng av tvåstegsverifiering</button>
        </form>
      </section>`;
    return page(c, session, content, status);
  }

  // Inte på än: en ny hemlighet skapas och sparas som "väntande" tills första koden har stämt.
  let secret = await decryptSecret(c.env, u.totp_pending);
  if (!secret || c.url.searchParams.get("ny") === "1") {
    secret = newTotpSecret();
    await c.env.DB.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").bind(await encryptSecret(c.env, secret), u.id).run();
  }
  const url = otpauthUrl(secret, u.email);
  const content = html`
    ${adminHead("Slå på tvåstegsverifiering", { back: required ? undefined : { href: "/admin/konto", label: "Mitt konto" }, lead: "Tre steg. Du behöver telefonen." })}
    ${required ? html`<div class="alert alert-warn" role="status"><strong>Föreningen kräver tvåstegsverifiering.</strong> Slå på den för att fortsätta använda adminpanelen.</div>` : ""}
    ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ""}
    <ol class="tfa-steps">
      <li class="admin-card">
        <h2 class="card-heading">Installera en autentiseringsapp</h2>
        <p>Till exempel <strong>Google Authenticator</strong> eller <strong>Microsoft Authenticator</strong> (gratis i App Store och Google Play). Har du en iPhone kan du också använda appen Lösenord, och 1Password och Bitwarden fungerar också.</p>
      </li>
      <li class="admin-card">
        <h2 class="card-heading">Skanna QR-koden</h2>
        <div class="tfa-qr-row">
          <div class="tfa-qr">${raw(qrSvg(url, { size: 200, label: "QR-kod för JFK Adminpanel i autentiseringsappen" }))}</div>
          <div class="tfa-manual">
            <p>Välj ”Lägg till konto” eller ”+” i appen och skanna koden med kameran.</p>
            <details>
              <summary>Kan du inte skanna? Skriv in nyckeln</summary>
              <p>Konto: <strong>JFK Adminpanel</strong><br>Nyckel: <span class="mono tfa-secret">${groupedSecret(secret)}</span><br>Typ: tidsbaserad</p>
            </details>
            <p class="muted"><a href="/admin/konto/tvastegs?ny=1${required ? "&krav=1" : ""}">Visa en ny QR-kod</a></p>
          </div>
        </div>
      </li>
      <li class="admin-card">
        <h2 class="card-heading">Skriv in koden från appen</h2>
        <form class="admin-form" method="post" action="/admin/konto/tvastegs">
          ${csrfField(session)}
          <div class="field">
            <label class="field-label" for="falt-kod">Sex siffror</label>
            <input class="code-input" type="text" id="falt-kod" name="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required>
          </div>
          <button class="btn btn-primary btn-lg" type="submit">Slå på</button>
        </form>
      </li>
    </ol>
    ${required ? html`<form class="inline-form" method="post" action="/admin/logga-ut">${csrfField(session)}<button class="link-btn" type="submit">Logga ut</button></form>` : ""}`;
  return page(c, session, content, status);
}

/** POST /admin/konto/tvastegs – första koden stämmer: slå på och visa reservkoderna en gång. */
export async function twoFactorEnable(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/konto/tvastegs?fel=csrf", 303);
  const u = session.user;
  if (u.totp_secret) return redirect("/admin/konto/tvastegs", 303);
  const secret = await decryptSecret(c.env, u.totp_pending);
  if (!secret) return redirect("/admin/konto/tvastegs", 303);
  const step = await verifyTotp(secret, String(form.get("kod") ?? ""), 0);
  if (step === null) return twoFactorPage(c, session, "Koden stämmer inte. Skriv in de sex siffror som visas just nu för JFK Adminpanel – och kontrollera att telefonens klocka går rätt.", 422);
  const codes = newRecoveryCodes();
  await c.env.DB.prepare(
    "UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled_at = ?, totp_last_step = ?, recovery_codes = ? WHERE id = ? AND totp_pending IS NOT NULL",
  )
    .bind(nowSql(), step, await hashRecoveryCodes(codes), u.id)
    .run();
  // Andra inloggningar (t.ex. en bortglömd dator) loggas ut – de har inte gått igenom det nya steget.
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(u.id, session.sessionId).run();
  await audit(c.env, session, "slog på tvåstegsverifiering", "", u.id);
  return showRecoveryCodes(c, session, codes, true);
}

function showRecoveryCodes(c: RequestContext, session: Session, codes: string[], first: boolean): Promise<Response> {
  const content = html`
    ${adminHead(first ? "Tvåstegsverifiering är på" : "Nya reservkoder", { lead: "Spara reservkoderna nu. De visas bara den här gången." })}
    <section class="admin-card">
      <h2 class="card-heading">Dina reservkoder</h2>
      <p>Om du inte har telefonen med dig kan du logga in med en av de här koderna i stället. Varje kod fungerar en gång. Spara dem i din lösenordshanterare eller skriv ut dem – inte i samma telefon som appen.${first ? "" : " De gamla reservkoderna fungerar inte längre."}</p>
      ${recoveryList(codes)}
      <a class="btn btn-primary" href="/admin/konto">Jag har sparat koderna</a>
    </section>`;
  return page(c, session, content);
}

/** POST /admin/konto/tvastegs/reservkoder – nya reservkoder (kräver en kod från appen). */
export async function twoFactorNewCodes(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/konto/tvastegs?fel=csrf", 303);
  const u = session.user;
  const secret = await decryptSecret(c.env, u.totp_secret);
  const step = secret ? await verifyTotp(secret, String(form.get("kod") ?? ""), u.totp_last_step ?? 0) : null;
  if (step === null) return twoFactorPage(c, session, "Koden stämmer inte. Vänta på nästa kod i appen och försök igen.", 422);
  const codes = newRecoveryCodes();
  await c.env.DB.prepare("UPDATE users SET recovery_codes = ?, totp_last_step = ? WHERE id = ?").bind(await hashRecoveryCodes(codes), step, u.id).run();
  await audit(c.env, session, "skapade nya reservkoder", "", u.id);
  return showRecoveryCodes(c, session, codes, false);
}

/** POST /admin/konto/tvastegs/av – stäng av (kräver lösenordet). Går inte när föreningen kräver det. */
export async function twoFactorDisable(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/konto/tvastegs?fel=csrf", 303);
  if (!(await verifyPassword(String(form.get("losenord") ?? ""), session.user.password_hash))) {
    return twoFactorPage(c, session, "Lösenordet stämmer inte.", 422);
  }
  const required = (await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'require_2fa'").first<{ value: string }>())?.value === "pa";
  if (required) return twoFactorPage(c, session, "Föreningen kräver tvåstegsverifiering, så den kan inte stängas av. Har du fått en ny telefon? Stäng av och slå på igen med hjälp av en administratör under Användare.", 422);
  await c.env.DB.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, recovery_codes = '' WHERE id = ?").bind(session.user.id).run();
  await audit(c.env, session, "stängde av tvåstegsverifiering", "", session.user.id);
  return redirect("/admin/konto?klart=tvastegs-av", 303);
}

// ───────────── För administratörer (Användare) ─────────────

/** Rutan på Användare: hur många som har det påslaget och valet att kräva det. */
export function twoFactorAdminCard(session: Session, users: User[], required: boolean): SafeHtml {
  const active = users.filter((u) => u.active && u.password_hash !== "!");
  const without = active.filter((u) => !u.totp_secret);
  return html`<section class="admin-card tfa-admin" id="tvastegs" aria-labelledby="tfa-admin-rubrik">
    <div class="tfa-head">
      <h2 class="card-heading" id="tfa-admin-rubrik">Tvåstegsverifiering</h2>
      <span class="pill ${required ? "pill-on" : "pill-off"}">${required ? "Krävs för alla" : "Frivilligt"}</span>
    </div>
    <p>${active.length - without.length} av ${active.length} har slagit på tvåstegsverifiering.${without.length ? html` Saknas för: ${without.map((u, i) => html`${i ? ", " : ""}<strong>${u.name}</strong>`)}.` : ""}</p>
    <form class="admin-form" method="post" action="/admin/anvandare/tvastegs-krav">
      ${csrfField(session)}
      <input type="hidden" name="krav" value="${required ? "av" : "pa"}">
      ${required
        ? html`<p class="muted">Alla måste ha tvåstegsverifiering påslagen för att kunna använda adminpanelen.</p>
            <button class="btn btn-outline btn-sm" type="submit" data-confirm-click="Göra tvåstegsverifiering frivilligt igen?">Gör det frivilligt</button>`
        : html`<p class="muted">Rekommenderas. Den som saknar tvåstegsverifiering får slå på den nästa gång hen öppnar adminpanelen – innan hen kan göra något annat.</p>
            <button class="btn btn-primary btn-sm" type="submit" data-confirm-click="Kräva tvåstegsverifiering för alla? ${without.length ? `${without.length} ${without.length === 1 ? "person" : "personer"} får slå på den nästa gång de öppnar adminpanelen.` : ""}">Kräv för alla</button>`}
    </form>
  </section>`;
}

/** POST /admin/anvandare/tvastegs-krav (administratör) */
export async function twoFactorRequire(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/anvandare?fel=csrf", 303);
  const on = form.get("krav") === "pa";
  // Den som slår på kravet måste själv ha det påslaget – annars låser man ut sig själv på nästa sida.
  if (on && !session.user.totp_secret) return redirect("/admin/konto/tvastegs?krav=1", 303);
  await saveSettings(c.env.DB, session, [["require_2fa", on ? "pa" : "av"]]);
  await audit(c.env, session, on ? "krävde tvåstegsverifiering för alla" : "gjorde tvåstegsverifiering frivillig", "", null);
  return redirect(`/admin/anvandare?klart=${on ? "tvastegs-krav" : "tvastegs-frivilligt"}#tvastegs`, 303);
}

/** POST /admin/anvandare/:id/tvastegs-av (administratör) – för den som har tappat telefonen och reservkoderna. */
export async function twoFactorResetUser(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/anvandare?fel=csrf", 303);
  const u = await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND active = 1").bind(Number(c.params.id)).first<User>();
  if (!u || u.id === session.user.id) return redirect("/admin/anvandare", 303);
  await c.env.DB.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, recovery_codes = '' WHERE id = ?").bind(u.id).run();
  await destroyUserSessions(c.env, u.id);
  await audit(c.env, session, "stängde av tvåstegsverifiering för", "användare", u.id, u.name);
  return redirect("/admin/anvandare?klart=tvastegs-aterstallt", 303);
}
