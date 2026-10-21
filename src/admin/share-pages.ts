import { html, type SafeHtml } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { formatDay } from "../lib/format.js";
import { createShare, loadShare, removeShare, SHARE_DAYS, shareUrl } from "../lib/share.js";
import type { RequestContext } from "../router.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { csrfField } from "./layout.js";

/** Sidor som kan delas med en privat länk medan de är dolda: sid-id → adress och var man kommer tillbaka. */
const SHAREABLE: Record<string, { path: string; back: string; label: string }> = {
  butik: { path: "/butik", back: "/admin/butik", label: "butiken" },
};

/** Rutan "Dela förhandsvisning" (bara när sidan är dold). */
export async function sharePanel(c: RequestContext, session: Session, pageId: string): Promise<SafeHtml> {
  const def = SHAREABLE[pageId];
  if (!def) return html``;
  const share = await loadShare(c.env.DB, pageId);
  const action = `/admin/dela/${pageId}`;
  const button = (value: string, label: string, cls: string, confirm?: string) =>
    html`<form class="inline-form" method="post" action="${action}"${confirm ? html` data-confirm="${confirm}"` : ""}>${csrfField(session)}<input type="hidden" name="gora" value="${value}"><button class="${cls}" type="submit">${label}</button></form>`;
  return html`<div class="share-box" id="dela">
    <h2 class="share-title">Dela förhandsvisning</h2>
    ${share
      ? html`<p>Den som har länken kan se ${def.label} som den ser ut nu – men inte ändra något, och inte komma in i adminpanelen. Länken gäller till <strong>${formatDay(share.expires.slice(0, 10))}</strong>.</p>
          <div class="copy-row"><input type="text" readonly value="${shareUrl(c.url.origin, def.path, share)}" aria-label="Länk till förhandsvisningen" data-copy-source><button class="btn btn-outline btn-sm" type="button" data-copy>Kopiera</button></div>
          <div class="share-actions">
            ${button("stang", "Stäng av länken", "btn btn-danger-ghost btn-sm", "Stäng av länken? Den som redan har den kommer inte längre åt sidan.")}
            ${button("ny", "Skapa en ny länk", "btn btn-outline btn-sm", "Skapa en ny länk? Den gamla slutar fungera.")}
          </div>`
      : html`<p>Vill du visa ${def.label} för någon innan den publiceras – t.ex. leverantören eller resten av styrelsen? Skapa en privat länk. Den som har länken kan se sidan men inte ändra något. Länken gäller i ${SHARE_DAYS} dagar och kan stängas av när som helst.</p>
          <div class="share-actions">${button("ny", "Skapa en länk", "btn btn-primary btn-sm")}</div>`}
  </div>`;
}

/** POST /admin/dela/:sida – skapa en ny länk eller stäng av den. */
export async function shareSubmit(c: RequestContext, session: Session): Promise<Response> {
  const pageId = c.params.sida ?? "";
  const def = SHAREABLE[pageId];
  if (!def) return redirect("/admin", 303);
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect(`${def.back}?fel=csrf`, 303);
  if (form.get("gora") === "stang") {
    await removeShare(c.env.DB, pageId);
    await audit(c.env, session, "stängde av delningslänken till", def.label);
    return redirect(`${def.back}?klart=delning-av#dela`, 303);
  }
  await createShare(c.env.DB, pageId);
  await audit(c.env, session, "skapade en delningslänk till", def.label);
  return redirect(`${def.back}?klart=delning-ny#dela`, 303);
}
