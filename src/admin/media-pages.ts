import { html } from "../lib/html.js";
import { redirect } from "../lib/http.js";
import { formatDate } from "../lib/format.js";
import { formatBytes, mediaUsage, purgeMedia, type MediaRow } from "../lib/media.js";
import { DEFAULT_FIT, FIT_PREFIX, isDefaultFit, isFitKey, MAX_ZOOM, parseFit, serializeFit } from "../lib/imagefit.js";
import { imageFits, loadSettings } from "../lib/settings.js";
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
  const [{ results }, usage, settings] = await Promise.all([db.prepare(IMAGES).all<MediaRow>(), mediaUsage(db), loadSettings(db)]);
  const fits = imageFits(settings);
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
              <a class="btn btn-outline btn-sm media-adjust" href="/admin/bildbank/justera?nyckel=${encodeURIComponent(m.key)}">${icon("crop", "icon icon-sm")}Justera${fits.has(m.key) ? html`<span class="sr-only"> (justerad)</span>` : ""}</a>
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

// ───────────────────── Justera bild ─────────────────────

/** Ramar i förhandsvisningen – de vanligaste bildytorna på webbplatsen. */
const FRAMES = [
  { cls: "wide", label: "Bred", hint: "Startsidans topp, Helbild och breda bildband" },
  { cls: "landscape", label: "Liggande", hint: "Nyheter, event och bilder bredvid text" },
  { cls: "square", label: "Kvadrat", hint: "Kollage och logotyper" },
  { cls: "portrait", label: "Stående", hint: "Styrelsens porträtt och kollagets stora bild" },
] as const;

/** Bara adresser i adminpanelen får användas som "tillbaka" – ingen öppen omdirigering. */
function returnPath(value: string | null): string | null {
  return value && /^\/admin(\/[a-z0-9/-]*)?(\?[a-z0-9=&%._-]*)?$/i.test(value) ? value : null;
}

export async function mediaAdjustPage(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const key = c.url.searchParams.get("nyckel") ?? "";
  const media = isFitKey(key) ? await db.prepare("SELECT * FROM media WHERE key = ? AND kind = 'image'").bind(key).first<MediaRow>() : null;
  if (!media) return redirect("/admin/bildbank?fel=saknas", 303);
  const [stored, usage] = await Promise.all([
    db.prepare("SELECT value FROM settings WHERE key = ?").bind(FIT_PREFIX + key).first<{ value: string }>(),
    mediaUsage(db),
  ]);
  const fit = parseFit(stored?.value) ?? DEFAULT_FIT;
  const uses = usage.get(key) ?? [];
  const back = returnPath(c.url.searchParams.get("tillbaka"));
  const newTab = c.url.searchParams.get("flik") === "ny";
  const full = mediaUrl(key)!;

  const content = html`
    ${adminHead("Justera bild", {
      back: newTab ? undefined : { href: back ?? "/admin/bildbank", label: back ? "Tillbaka" : "Bildbanken" },
      lead: "Välj vilken del av bilden som alltid ska synas, hur inzoomad den ska vara och om den ska fylla sin ruta. Ändringen gäller överallt där bilden används.",
    })}
    ${newTab ? html`<p class="field-help fit-tab-note">${icon("external", "icon icon-sm")} Öppnades i en ny flik. Spara och stäng sedan fliken – sidan du redigerade ligger kvar i den andra fliken.</p>` : ""}
    <form class="fit-editor" method="post" action="/admin/bildbank/justera" data-fit-editor>
      ${csrfField(session)}
      <input type="hidden" name="nyckel" value="${key}">
      ${back ? html`<input type="hidden" name="tillbaka" value="${back}">` : ""}
      ${newTab ? html`<input type="hidden" name="flik" value="ny">` : ""}
      <div class="fit-layout">
        <section class="admin-card fit-source" aria-labelledby="fit-hela">
          <h2 class="card-heading" id="fit-hela">Hela bilden</h2>
          <p class="field-help" id="fit-hjalp">Klicka (eller dra) i bilden på det som är viktigast – t.ex. ansiktena. Den punkten hålls kvar i bild när bilden beskärs.</p>
          <div class="fit-canvas" data-fit-canvas>
            <img src="${full}" alt="${media.filename || "Bilden"}" draggable="false">
            <button type="button" class="fit-marker" data-fit-marker aria-describedby="fit-hjalp" aria-label="Fokuspunkt. Flytta med piltangenterna."></button>
          </div>
          <details class="fit-numbers">
            <summary>Ange fokuspunkten med siffror</summary>
            <div class="field-row">
              <label class="field"><span class="field-label">Från vänster (%)</span><input type="number" name="x" min="0" max="100" step="1" value="${fit.x}" data-fit-x></label>
              <label class="field"><span class="field-label">Uppifrån (%)</span><input type="number" name="y" min="0" max="100" step="1" value="${fit.y}" data-fit-y></label>
            </div>
          </details>
        </section>

        <div class="fit-side">
          <section class="admin-card" aria-labelledby="fit-installningar">
            <h2 class="card-heading" id="fit-installningar">Passform och storlek</h2>
            <fieldset class="field field-choices">
              <legend class="field-label">Passform</legend>
              <div class="choice-grid">
                <label class="choice"><input type="radio" name="passform" value="fyll"${fit.fit === "fyll" ? html` checked` : ""} data-fit-mode><span class="choice-body"><span class="choice-label">Fyll rutan</span><span class="choice-hint">Bilden täcker hela ytan och beskärs vid kanterna vid behov.</span></span></label>
                <label class="choice"><input type="radio" name="passform" value="hela"${fit.fit === "hela" ? html` checked` : ""} data-fit-mode><span class="choice-body"><span class="choice-label">Visa hela bilden</span><span class="choice-hint">Inget beskärs – det blir en ljus kant där bilden inte räcker. Bra för logotyper och affischer.</span></span></label>
              </div>
            </fieldset>
            <div class="field" data-fit-zoom-field>
              <label class="field-label" for="fit-zoom">Storlek (zoom)</label>
              <div class="fit-zoom">
                <input type="range" id="fit-zoom" name="zoom" min="1" max="${MAX_ZOOM}" step="0.05" value="${fit.zoom}" data-fit-zoom aria-describedby="fit-zoom-hjalp">
                <output for="fit-zoom" data-fit-zoom-out>${Math.round(fit.zoom * 100)} %</output>
              </div>
              <p class="field-help" id="fit-zoom-hjalp">100 % visar så mycket av bilden som möjligt. Dra åt höger för att zooma in mot fokuspunkten.</p>
            </div>
          </section>

          <section class="admin-card" aria-labelledby="fit-forhands">
            <h2 class="card-heading" id="fit-forhands">Så här blir det</h2>
            <ul class="fit-previews">
              ${FRAMES.map(
                (f) => html`<li>
                  <div class="fit-frame fit-frame-${f.cls}"><img src="${mediaUrl(key, "sm")}" alt="" data-fit-preview></div>
                  <p class="fit-frame-label"><strong>${f.label}</strong> ${f.hint}</p>
                </li>`,
              )}
            </ul>
          </section>

          ${uses.length
            ? html`<section class="admin-card" aria-labelledby="fit-anvands">
                <h2 class="card-heading" id="fit-anvands">Bilden används på</h2>
                <ul class="media-uses">${uses.map((u) => html`<li><a href="${u.href}">${u.label}</a></li>`)}</ul>
              </section>`
            : ""}
        </div>
      </div>
      <div class="admin-form-actions sticky-actions">
        <button class="btn btn-primary" type="submit">Spara</button>
        <button class="btn btn-outline" type="submit" name="aterstall" value="1">Återställ till original</button>
      </div>
    </form>`;
  return adminLayout(c, session, { title: "Justera bild", active: "/admin/bildbank", newCount: await newMessageCount(db), wide: true }, content);
}

export async function mediaAdjustSubmit(c: RequestContext, session: Session): Promise<Response> {
  const form = await c.req.formData();
  if (!checkCsrf(c, session, form)) return new Response("Ogiltig förfrågan", { status: 403 });
  const db = c.env.DB;
  const key = String(form.get("nyckel") ?? "");
  const exists = isFitKey(key) && (await db.prepare("SELECT 1 FROM media WHERE key = ? AND kind = 'image'").bind(key).first());
  if (!exists) return redirect("/admin/bildbank?fel=saknas", 303);
  const back = returnPath(String(form.get("tillbaka") ?? ""));
  const newTab = form.get("flik") === "ny";

  const fit = parseFit([form.get("x"), form.get("y"), form.get("zoom"), form.get("passform")].map((v) => String(v ?? "")).join(","));
  const reset = form.get("aterstall") === "1" || !fit || isDefaultFit(fit);
  if (reset) {
    await db.prepare("DELETE FROM settings WHERE key = ?").bind(FIT_PREFIX + key).run();
  } else {
    await db
      .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(FIT_PREFIX + key, serializeFit(fit))
      .run();
  }
  await audit(c.env, session, reset ? "återställde" : "justerade", "bild", key, reset ? "Bildens passform återställd" : `Passform: ${fit!.fit === "hela" ? "visa hela" : `fyll, fokus ${fit!.x} % / ${fit!.y} %, zoom ${Math.round(fit!.zoom * 100)} %`}`);

  const code = reset ? "aterstallt_bild" : "justerat";
  if (newTab) return redirect(`/admin/bildbank/justera?nyckel=${encodeURIComponent(key)}&flik=ny&klart=${code}`, 303);
  const target = back ?? "/admin/bildbank";
  return redirect(`${target}${target.includes("?") ? "&" : "?"}klart=${code}`, 303);
}
