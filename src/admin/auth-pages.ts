import { html, raw, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { rateLimit, safeEqual } from "../lib/security.js";
import { mailConfigured, sendMail } from "../lib/mail.js";
import type { RequestContext } from "../router.js";
import {
  LOCK_MINUTES,
  MAX_FAILED,
  MIN_PASSWORD,
  audit,
  clearSessionCookie,
  createResetToken,
  createSession,
  destroySession,
  destroyUserSessions,
  getSession,
  hashPassword,
  lookupResetToken,
  passwordProblem,
  verifyPassword,
  checkCsrf,
  type User,
} from "./auth.js";
import { adminLayout, BRAND_SLOT } from "./layout.js";

function guestCard(title: string, lead: string, body: SafeHtml): SafeHtml {
  return html`<div class="guest-wrap">
    <div class="guest-card">
      <a class="guest-brand" href="/">${raw(BRAND_SLOT)}<span>Juridiska Föreningen i Karlstad</span></a>
      <h1 class="admin-title">${title}</h1>
      <p class="admin-lead">${lead}</p>
      ${body}
    </div>
  </div>`;
}

function errorBox(msg?: string): SafeHtml {
  return msg ? html`<div class="alert alert-error" role="alert">${msg}</div>` : html``;
}

/** Bara interna adminlänkar får användas som "nästa sida" efter inloggning. */
function safeNext(next: string | null): string {
  return next && /^\/admin(\/[\w\-/?=&%.]*)?$/.test(next) && !next.startsWith("//") ? next : "/admin";
}

// ───────────────────────── Logga in ─────────────────────────

export async function loginPage(c: RequestContext, error?: string, email = "", status = 200): Promise<Response> {
  if (!error && (await getSession(c))) return redirect("/admin", 303);
  const next = safeNext(c.url.searchParams.get("nasta"));
  const userCount = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
  const body = html`
    ${errorBox(error)}
    ${c.url.searchParams.get("klart") === "utloggad" ? html`<div class="alert alert-ok" role="status">Du är utloggad.</div>` : ""}
    ${c.url.searchParams.get("klart") === "losenord" ? html`<div class="alert alert-ok" role="status">Ditt lösenord är sparat. Logga in med det nya lösenordet.</div>` : ""}
    ${userCount === 0 ? html`<div class="alert alert-warn" role="status">Det finns inga användare ännu. Använd inbjudningslänken du har fått för att skapa det första kontot.</div>` : ""}
    <form class="admin-form" method="post" action="/admin/logga-in?nasta=${encodeURIComponent(next)}" novalidate>
      <div class="field">
        <label class="field-label" for="falt-epost">E-post</label>
        <input type="email" id="falt-epost" name="epost" value="${email}" autocomplete="username" required autofocus>
      </div>
      <div class="field">
        <label class="field-label" for="falt-losenord">Lösenord</label>
        <div class="password-wrap">
          <input type="password" id="falt-losenord" name="losenord" autocomplete="current-password" required>
          <button class="password-toggle" type="button" data-toggle-password="falt-losenord" aria-pressed="false">Visa</button>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Logga in</button>
    </form>
    <p class="guest-links"><a href="/admin/glomt-losenord">Glömt lösenordet?</a> · <a href="/">Till webbplatsen</a></p>`;
  return adminLayout(c, null, { title: "Logga in" }, guestCard("Logga in", "Adminpanelen för styrelsen i JFK.", body), status);
}

export async function loginSubmit(c: RequestContext): Promise<Response> {
  const form = await c.req.formData();
  const email = String(form.get("epost") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("losenord") ?? "");
  const generic = "Fel e-post eller lösenord.";

  const origin = c.req.headers.get("Origin");
  if (origin && origin !== c.url.origin) return loginPage(c, "Ogiltig förfrågan.", email, 403);

  if (!(await rateLimit(c.env, c.req, "login", 10, 15 * 60))) {
    return loginPage(c, "För många inloggningsförsök. Vänta en kvart och försök igen.", email, 429);
  }
  if (!email || !password) return loginPage(c, "Fyll i både e-post och lösenord.", email, 422);

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ? AND active = 1").bind(email).first<User>();
  if (user?.locked_until && user.locked_until > new Date().toISOString().replace("T", " ").slice(0, 19)) {
    await verifyPassword(password, null); // jämn svarstid
    return loginPage(c, `Kontot är tillfälligt låst efter för många felaktiga försök. Försök igen om ${LOCK_MINUTES} minuter, eller be en administratör om en ny lösenordslänk.`, email, 423);
  }
  const ok = await verifyPassword(password, user?.password_hash);
  if (!user || !ok) {
    if (user) {
      const failed = user.failed_logins + 1;
      await c.env.DB.prepare(
        `UPDATE users SET failed_logins = ?, locked_until = CASE WHEN ? >= ${MAX_FAILED} THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE locked_until END WHERE id = ?`,
      )
        .bind(failed >= MAX_FAILED ? 0 : failed, failed, user.id)
        .run();
      if (failed >= MAX_FAILED) await audit(c.env, null, "låste kontot efter för många misslyckade inloggningar för", "", user.id, user.email);
    }
    return loginPage(c, generic, email, 401);
  }

  await c.env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();
  const cookie = await createSession(c.env, user.id);
  await audit(c.env, { user, csrf: "", sessionId: "" }, "loggade in", "", user.id);
  const next = safeNext(c.url.searchParams.get("nasta"));
  return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": cookie } });
}

export async function logoutSubmit(c: RequestContext): Promise<Response> {
  const session = await getSession(c);
  if (session) {
    const form = await c.req.formData();
    if (checkCsrf(c, session, form)) await destroySession(c.env, session.sessionId);
  }
  return new Response(null, { status: 303, headers: { Location: "/admin/logga-in?klart=utloggad", "Set-Cookie": clearSessionCookie() } });
}

// ───────────────────────── Glömt lösenord ─────────────────────────

export async function forgotPage(c: RequestContext, sent = false): Promise<Response> {
  const smtp = mailConfigured(c.env);
  const body = sent
    ? html`<div class="alert alert-ok" role="status">Om adressen finns hos oss har vi skickat en länk dit. Länken gäller i en timme. Kolla även skräpposten.</div>
        <p class="guest-links"><a href="/admin/logga-in">Tillbaka till inloggningen</a></p>`
    : html`${!smtp ? html`<div class="alert alert-warn" role="status">E-post är inte inställt ännu. Be en administratör skapa en ny lösenordslänk åt dig under <strong>Användare</strong>.</div>` : ""}
        <form class="admin-form" method="post" action="/admin/glomt-losenord" novalidate>
          <div class="field">
            <label class="field-label" for="falt-epost">Din e-postadress</label>
            <input type="email" id="falt-epost" name="epost" autocomplete="username" required>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit"${smtp ? "" : html` disabled`}>Skicka länk</button>
        </form>
        <p class="guest-links"><a href="/admin/logga-in">Tillbaka till inloggningen</a></p>`;
  return adminLayout(c, null, { title: "Glömt lösenordet" }, guestCard("Glömt lösenordet?", "Vi skickar en länk där du kan välja ett nytt lösenord.", body));
}

export async function forgotSubmit(c: RequestContext): Promise<Response> {
  const form = await c.req.formData();
  const email = String(form.get("epost") ?? "").trim().toLowerCase().slice(0, 200);
  if (mailConfigured(c.env) && email && (await rateLimit(c.env, c.req, "reset", 5, 3600))) {
    const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ? AND active = 1").bind(email).first<User>();
    if (user) {
      const token = await createResetToken(c.env, user.id, 1);
      const link = `${c.env.SITE_URL.replace(/\/$/, "")}/admin/losenord/${token}`;
      c.exec.waitUntil(
        sendMail(c.env, {
          to: [user.email],
          subject: "Nytt lösenord till JFK:s adminpanel",
          text: `Hej ${user.name}!\n\nNågon (förhoppningsvis du) har bett om att få byta lösenord till JFK:s adminpanel.\n\nVälj ett nytt lösenord här (länken gäller i en timme):\n${link}\n\nOm du inte bad om detta kan du ignorera mejlet – ditt lösenord är oförändrat.\n\n/ JFK:s webbplats`,
        }).catch((err) => console.error("Kunde inte skicka återställningsmejl", err)),
      );
      await audit(c.env, null, "ny lösenordslänk begärdes för", "", user.id, user.email);
    }
  }
  // Samma svar oavsett om adressen finns (avslöjar inte vilka konton som finns)
  return forgotPage(c, true);
}

// ───────────────────────── Välj lösenord (inbjudan/återställning) ─────────────────────────

export async function resetPage(c: RequestContext, error?: string, status = 200): Promise<Response> {
  const user = await lookupResetToken(c.env, c.params.token ?? "");
  if (!user) {
    return adminLayout(
      c,
      null,
      { title: "Länken fungerar inte" },
      guestCard("Länken fungerar inte", "Länken har redan använts eller gått ut. Be en administratör om en ny länk, eller använd ”Glömt lösenordet?”.", html`<p class="guest-links"><a href="/admin/logga-in">Till inloggningen</a></p>`),
      410,
    );
  }
  const first = user.password_hash === "!";
  const body = html`
    ${errorBox(error)}
    <form class="admin-form" method="post" action="/admin/losenord/${c.params.token}" novalidate>
      <div class="field">
        <span class="field-label">Konto</span>
        <p class="readonly-value">${user.name} (${user.email})</p>
        <input type="hidden" name="anvandarnamn" value="${user.email}" autocomplete="username">
      </div>
      <div class="field">
        <label class="field-label" for="falt-nytt">Nytt lösenord</label>
        <p class="field-help" id="nytt-hjalp">Minst ${MIN_PASSWORD} tecken. Tips: använd tre–fyra slumpade ord, t.ex. ”paragraf-cykel-vårsol-kaffe”.</p>
        <div class="password-wrap">
          <input type="password" id="falt-nytt" name="losenord" autocomplete="new-password" minlength="${MIN_PASSWORD}" required aria-describedby="nytt-hjalp">
          <button class="password-toggle" type="button" data-toggle-password="falt-nytt" aria-pressed="false">Visa</button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="falt-igen">Upprepa lösenordet</label>
        <input type="password" id="falt-igen" name="losenord2" autocomplete="new-password" required>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Spara lösenord</button>
    </form>`;
  return adminLayout(
    c,
    null,
    { title: "Välj lösenord" },
    guestCard(first ? `Välkommen, ${user.name.split(" ")[0]}!` : "Välj ett nytt lösenord", first ? "Välj ett lösenord för ditt konto i JFK:s adminpanel." : "Det gamla lösenordet slutar fungera när du sparar.", body),
    status,
  );
}

export async function resetSubmit(c: RequestContext): Promise<Response> {
  const token = c.params.token ?? "";
  const user = await lookupResetToken(c.env, token);
  if (!user) return resetPage(c);
  const form = await c.req.formData();
  const p1 = String(form.get("losenord") ?? "");
  const p2 = String(form.get("losenord2") ?? "");
  const problem = passwordProblem(p1, user.email) ?? (p1 !== p2 ? "Lösenorden matchar inte." : null);
  if (problem) return resetPage(c, problem, 422);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").bind(await hashPassword(p1), user.id),
    c.env.DB.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?").bind(user.token_hash),
  ]);
  await destroyUserSessions(c.env, user.id);
  await audit(c.env, { user, csrf: "", sessionId: "" }, user.password_hash === "!" ? "aktiverade sitt konto" : "bytte lösenord via länk", "", user.id);
  return redirect("/admin/logga-in?klart=losenord", 303);
}

// ───────────────────────── Första administratören (engångsnyckel) ─────────────────────────

/**
 * /admin/setup?nyckel=... fungerar BARA när det inte finns några användare och nyckeln
 * matchar Worker-hemligheten SETUP_TOKEN. Skapar en inbjudningslänk för första administratören.
 */
export async function setupPage(c: RequestContext, error?: string, status = 200): Promise<Response> {
  const count = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
  const key = c.url.searchParams.get("nyckel") ?? "";
  if (count > 0 || !c.env.SETUP_TOKEN || !safeEqual(key, c.env.SETUP_TOKEN)) {
    return adminLayout(c, null, { title: "Inte tillgänglig" }, guestCard("Sidan är inte tillgänglig", "Den första administratören är redan skapad, eller så saknas rätt nyckel.", html`<p class="guest-links"><a href="/admin/logga-in">Till inloggningen</a></p>`), 404);
  }
  const body = html`${errorBox(error)}
    <form class="admin-form" method="post" action="/admin/setup?nyckel=${encodeURIComponent(key)}" novalidate>
      <div class="field"><label class="field-label" for="falt-namn">Ditt namn</label><input id="falt-namn" name="namn" autocomplete="name" required></div>
      <div class="field"><label class="field-label" for="falt-epost">Din e-post</label><input type="email" id="falt-epost" name="epost" autocomplete="email" required></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Skapa administratörskonto</button>
    </form>`;
  return adminLayout(c, null, { title: "Skapa första administratören" }, guestCard("Skapa första administratören", "Engångssteg. Därefter bjuder du in övriga i styrelsen från adminpanelen.", body), status);
}

export async function setupSubmit(c: RequestContext): Promise<Response> {
  const count = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
  const key = c.url.searchParams.get("nyckel") ?? "";
  if (count > 0 || !c.env.SETUP_TOKEN || !safeEqual(key, c.env.SETUP_TOKEN)) return setupPage(c);
  if (!(await rateLimit(c.env, c.req, "setup", 5, 3600))) return setupPage(c, "För många försök.", 429);
  const form = await c.req.formData();
  const name = String(form.get("namn") ?? "").trim().slice(0, 100);
  const email = String(form.get("epost") ?? "").trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setupPage(c, "Fyll i namn och en giltig e-postadress.", 422);
  const res = await c.env.DB.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, 'admin', '!')").bind(email, name).run();
  const token = await createResetToken(c.env, res.meta.last_row_id, 2);
  await audit(c.env, null, "första administratören skapades:", "", res.meta.last_row_id, email);
  return redirect(`/admin/losenord/${token}`, 303);
}
