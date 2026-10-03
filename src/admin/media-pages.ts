import { html } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { formatDate } from "../lib/format.js";
import { formatBytes, mediaUsage, purgeMedia, type MediaRow } from "../lib/media.js";
import type { RequestContext } from "../router.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";
import { audit, checkCsrf, type Session } from "./auth.js";
import { adminHead, adminLayout, csrfField, newMessageCount, postButton } from "./layout.js";
import { handleUpload, uploadInput } from "./uploads.js";

/**
 * Bildbanken: alla uppladdade bilder på ett ställe. Visar var varje bild används, och bilder som inte
 * används kan tas bort. Väljaren (/admin/bildbank/valj) används av "Välj från bildbanken" i alla bildfält.
 */

const IMAGES = "SELECT * FROM media WHERE kind = 'image' ORDER BY created_at DESC, key LIMIT 500";

export async function mediaLibraryPage(c: RequestContext, session: Session, error?: string, status = 200): Promise<Response> {
  const db = c.env.DB;
  const filter = c.url.searchParams.get("visa") === "oanvanda" ? "oanvanda" : "alla";
  const [{ results }, usage] = await Promise.all([db.prepare(IMAGES).all<MediaRow>(), mediaUsage(db)]);
  const unused = results.filter((m) => !usage.has(m.key));
  const shown = filter === "oanvanda" ? unused : results;
  const totalSize = results.reduce((n, m) => n + (m.size || 0), 0);

  const content = html`
    ${adminHead("Bildbank", {
      lead: "Alla bilder som har laddats upp till webbplatsen. En bild kan användas på flera ställen – välj den med ”Välj från bildbanken” när du redigerar något. Bilder som byts ut sparas här, så du kan alltid gå tillbaka.",
    })}
    <section class="admin-card bank-upload" aria-labelledby="ladda-upp">
      <h2 class="card-heading" id="ladda-upp">Ladda upp en bild</h2>
      ${error ? html`<div class="alert alert-error" role="alert">${error}</div>` : ""}
      <form class="bank-upload-form" method="post" action="/admin/bildbank" enctype="multipart/form-data">
        ${csrfField(session)}
        <div>${uploadInput({ id: "falt-bild", name: "bild", kind: "image", bank: false })}</div>
        <button class="btn btn-primary" type="submit">Ladda upp</button>
      </form>
    </section>
    <div class="filter-bar">
      <nav class="tabs tabs-compact" aria-label="Filter">
        <ul>
          <li><a href="/admin/bildbank"${filter === "alla" ? html` aria-current="page"` : ""}>Alla (${results.length})</a></li>
          <li><a href="/admin/bildbank?visa=oanvanda"${filter === "oanvanda" ? html` aria-current="page"` : ""}>Används inte (${unused.length})</a></li>
        </ul>
      </nav>
      <p class="muted">${results.length} bilder · ${formatBytes(totalSize) || "0 kB"} totalt</p>
    </div>
    ${shown.length
      ? html`<ul class="media-grid">
          ${shown.map((m) => {
            const uses = usage.get(m.key) ?? [];
            return html`<li class="media-card${uses.length ? "" : " is-unused"}">
              <a class="media-thumb" href="${mediaUrl(m.key)}" target="_blank" rel="noopener"><img src="${mediaUrl(m.key, "sm")}" alt="" loading="lazy"><span class="sr-only">Öppna ${m.filename || "bilden"} i full storlek</span></a>
              <div class="media-body">
                <p class="media-name" title="${m.filename}">${m.filename || "Bild"}</p>
                <p class="media-meta">${[m.width && m.height ? `${m.width} × ${m.height}` : "", formatBytes(m.size), m.created_at ? formatDate(m.created_at) : ""].filter(Boolean).join(" · ")}</p>
                ${uses.length
                  ? html`<ul class="media-uses">${uses.slice(0, 3).map((u) => html`<li><a href="${u.href}">${u.label}</a></li>`)}${uses.length > 3 ? html`<li class="muted">… och ${uses.length - 3} till</li>` : ""}</ul>`
                  : html`<p class="media-unused">Används inte</p>`}
              </div>
              ${!uses.length
                ? postButton(session, "/admin/bildbank/radera", "Ta bort", {
                    confirm: "Ta bort bilden för gott? Det går inte att ångra.",
                    className: "btn btn-danger-ghost btn-sm",
                    hidden: filter === "oanvanda" ? { nyckel: m.key, visa: "oanvanda" } : { nyckel: m.key },
                  })
                : ""}
            </li>`;
          })}
        </ul>`
      : html`<div class="admin-empty"><p>${filter === "oanvanda" ? "Alla bilder används någonstans. Snyggt!" : "Inga bilder ännu. Ladda upp en ovan, eller lägg till bilder när du skriver nyheter och event."}</p></div>`}`;
  return adminLayout(c, session, { title: "Bildbank", active: "/admin/bildbank", newCount: await newMessageCount(db), wide: true }, content, status);
}

export async function mediaUploadSubmit(c: RequestContext, session: Session): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return redirect("/admin/bildbank?fel=uppladdning", 303);
  }
  if (!checkCsrf(c, session, form)) return redirect("/admin/bildbank?fel=csrf", 303);
  const res = await handleUpload(c.env, form, "bild", "image", "bank", session.user.email);
  if (!res.ok) return mediaLibraryPage(c, session, res.error, 422);
  if (!res.key) return mediaLibraryPage(c, session, "Välj en bild att ladda upp.", 422);
  await audit(c.env, session, "laddade upp", "bild", null, "till bildbanken");
  return redirect("/admin/bildbank?klart=skapat", 303);
}

export async function mediaDeleteSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return redirect("/admin/bildbank?fel=csrf", 303);
  const key = String(form.get("nyckel") ?? "");
  const row = await c.env.DB.prepare("SELECT key, filename FROM media WHERE key = ?").bind(key).first<{ key: string; filename: string }>();
  if (!row) return redirect("/admin/bildbank", 303);
  if ((await mediaUsage(c.env.DB)).has(key)) return redirect("/admin/bildbank?fel=anvands", 303);
  await purgeMedia(c.env, key);
  await audit(c.env, session, "tog bort", "bild", null, row.filename || key);
  return redirect(`/admin/bildbank?${form.get("visa") === "oanvanda" ? "visa=oanvanda&" : ""}klart=raderat`, 303);
}

/** Bildväljaren i en dialogruta: bara bilderna som knappar. Hämtas med fetch av admin.js. */
export async function mediaPickerFragment(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [{ results }, usage] = await Promise.all([db.prepare(IMAGES).all<MediaRow>(), mediaUsage(db)]);
  const body = results.length
    ? html`<ul class="bank-grid">
        ${results.map((m) => {
          const uses = usage.get(m.key)?.length ?? 0;
          return html`<li><button type="button" class="bank-pick" data-bank-key="${m.key}" data-bank-src="${mediaUrl(m.key, "sm")}">
            <img src="${mediaUrl(m.key, "sm")}" alt="" loading="lazy">
            <span class="bank-pick-name">${m.filename || "Bild"}</span>
            <span class="bank-pick-meta">${uses ? `Används på ${uses} ${uses === 1 ? "ställe" : "ställen"}` : "Används inte"}</span>
          </button></li>`;
        })}
      </ul>`
    : html`<p class="muted bank-empty">${icon("image", "icon")} Bildbanken är tom. Ladda upp en bild med knappen ”Välj fil” i stället.</p>`;
  return new Response(body.value, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" },
  });
}
