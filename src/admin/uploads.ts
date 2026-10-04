import { isFitKey } from "../lib/imagefit.js";
import type { Env } from "../env.js";
import { html, type SafeHtml } from "../lib/html.js";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PDF_BYTES, isSafeSvg, putFile, randomKey, sniffType } from "../lib/storage.js";
import { registerMedia } from "../lib/media.js";
import { mediaUrl } from "../views/layout.js";
import { icon } from "../views/icons.js";

export type UploadResult = { ok: true; key: string; size: number; reused: boolean } | { ok: false; error: string } | { ok: true; key: null; size: 0; reused: false };

/** Den mindre versionen som webbläsaren skapar (max 800 px). */
const MAX_SMALL_BYTES = 1024 * 1024;

function isFile(v: unknown): v is File {
  return typeof v === "object" && v !== null && "arrayBuffer" in v && "size" in v && "name" in v;
}

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,200}$/i;

/**
 * Validera och spara en uppladdad fil från formulärfältet `name`. Kontrollerar storlek och filens
 * faktiska innehåll (inte bara filändelsen). Hanterar också
 * - `${name}__liten`: en mindre version (800 px) som webbläsaren har gjort – sparas som `${key}.sm`,
 * - `${name}__bank`: en bild som valts från bildbanken i stället för en ny fil,
 * - `${name}__matt`: bildens mått ("1600x1000") för bildbanken.
 * Returnerar key: null om inget valdes.
 */
export async function handleUpload(env: Env, form: FormData, name: string, kind: "image" | "pdf", prefix: string, user?: string): Promise<UploadResult> {
  const value = form.get(name);
  if (!isFile(value) || value.size === 0) {
    const bank = String(form.get(`${name}__bank`) ?? "").trim();
    if (bank && KEY_RE.test(bank)) {
      const row = await env.DB.prepare("SELECT key FROM media WHERE key = ? AND kind = ?").bind(bank, kind).first().catch(() => null);
      if (row) return { ok: true, key: bank, size: 0, reused: true };
      return { ok: false, error: "Bilden finns inte längre i bildbanken. Välj en annan." };
    }
    return { ok: true, key: null, size: 0, reused: false };
  }
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  if (value.size > max) {
    const size = (value.size / 1024 / 1024).toFixed(1).replace(".", ",");
    return {
      ok: false,
      error:
        kind === "image"
          ? `Bilden är för stor (${size} MB, max ${max / 1024 / 1024} MB). Normalt komprimeras stora bilder automatiskt – ladda om sidan och välj bilden igen, eller förminska den först.`
          : `PDF:en är för stor (${size} MB, max ${max / 1024 / 1024} MB). Gör den mindre, t.ex. med ”Spara som PDF → Minsta storlek” i Word eller ”Exportera → Reduce File Size” i Förhandsvisning på Mac.`,
    };
  }
  const data = await value.arrayBuffer();
  const type = sniffType(new Uint8Array(data.slice(0, 1024)));
  if (kind === "pdf") {
    if (type !== "application/pdf") return { ok: false, error: "Filen måste vara en PDF." };
  } else {
    if (!type || !(type in IMAGE_TYPES)) return { ok: false, error: "Bilden måste vara JPG, PNG, WebP, GIF eller SVG." };
    if (type === "image/svg+xml" && !isSafeSvg(new TextDecoder().decode(data))) {
      return { ok: false, error: "SVG-filen innehåller skript eller externa länkar och kan inte användas. Exportera den igen eller använd PNG." };
    }
  }
  const ext = kind === "pdf" ? "pdf" : IMAGE_TYPES[type!]!;
  const key = randomKey(prefix, ext);
  const filename = value.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || `fil.${ext}`;
  await putFile(env, key, data, { contentType: type!, size: value.size, filename });

  // Mindre version för mobiler och kort. Bara rasterbilder; tyst om den saknas eller är ogiltig.
  let hasSmall = false;
  const small = form.get(`${name}__liten`);
  if (kind === "image" && type !== "image/svg+xml" && type !== "image/gif" && isFile(small) && small.size > 0 && small.size <= MAX_SMALL_BYTES) {
    const sdata = await small.arrayBuffer();
    const stype = sniffType(new Uint8Array(sdata.slice(0, 64)));
    if (stype === "image/jpeg" || stype === "image/webp" || stype === "image/png") {
      await putFile(env, `${key}.sm`, sdata, { contentType: stype, size: small.size, filename: `liten-${filename}` });
      hasSmall = true;
    }
  }
  const dims = /^(\d{1,5})x(\d{1,5})$/.exec(String(form.get(`${name}__matt`) ?? ""));
  await registerMedia(env.DB, {
    key,
    kind,
    filename,
    contentType: type!,
    size: value.size,
    width: dims ? Number(dims[1]) : null,
    height: dims ? Number(dims[2]) : null,
    hasSmall,
    user,
  });
  return { ok: true, key, size: value.size, reused: false };
}

/** Bildtyper som webbläsaren får välja. HEIC (iPhone) konverteras till JPG i webbläsaren om den kan läsa formatet. */
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/heic,image/heif,.heic,.heif";

/**
 * Filfält för uppladdning. admin.js läser data-attributen: bilder som är större än data-max
 * (eller onödigt stora i pixlar) skalas ned och komprimeras i webbläsaren innan formuläret skickas,
 * och en mindre version (800 px) skapas till det dolda fältet `__liten`.
 */
export function uploadInput(opts: { id: string; name: string; kind: "image" | "pdf"; labelledBy?: string; describedBy?: string; setting?: string; bank?: boolean }): SafeHtml {
  const max = opts.kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  const statusId = `${opts.id}-status`;
  const describedBy = [opts.describedBy, statusId].filter(Boolean).join(" ");
  const image = opts.kind === "image";
  return html`<div class="upload-row">
      <input class="upload-input" type="file" id="${opts.id}" name="${opts.name}"
        accept="${image ? IMAGE_ACCEPT : "application/pdf,.pdf"}"
        ${opts.labelledBy ? html`aria-labelledby="${opts.labelledBy}"` : ""} aria-describedby="${describedBy}"
        data-upload="${opts.name}" data-kind="${opts.kind}" data-max="${max}"${opts.setting ? html` data-setting="${opts.setting}"` : ""}>
      ${image && opts.bank !== false
        ? html`<button class="btn btn-outline btn-sm bank-open" type="button" hidden data-bank-open="${opts.name}">${icon("image", "icon icon-sm")}Välj från bildbanken</button>`
        : ""}
    </div>
    ${image
      ? html`<input type="file" name="${opts.name}__liten" hidden tabindex="-1" aria-hidden="true" data-small-for="${opts.name}">
          <input type="hidden" name="${opts.name}__matt" value="" data-dims-for="${opts.name}">
          <input type="hidden" name="${opts.name}__bank" value="" data-bank-for="${opts.name}">`
      : ""}
    <p class="upload-status" id="${statusId}" aria-live="polite" data-upload-status="${opts.name}"></p>`;
}

export function uploadHint(kind: "image" | "pdf"): string {
  return kind === "image"
    ? "Större bilder än 5 MB komprimeras automatiskt när du väljer dem."
    : `PDF, max ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
}

/** Komplett bildfält: nuvarande bild, välj ny fil eller från bildbanken, och ta bort. */
export function imageUploadField(opts: {
  name: string;
  label: string;
  current: string;
  help?: string;
  error?: string;
  required?: boolean;
  setting?: string;
  removable?: boolean;
  kind?: "image" | "pdf";
}): SafeHtml {
  const kind = opts.kind ?? "image";
  const id = `falt-${opts.name}`;
  const src = kind === "image" ? mediaUrl(opts.current || null, "sm") : null;
  const describedBy = [opts.help ? `${opts.name}-hjalp` : "", opts.error ? `${opts.name}-fel` : ""].filter(Boolean).join(" ");
  return html`<div class="field field-upload${opts.error ? " has-error" : ""}" data-field="${opts.setting ?? opts.name}">
    <span class="field-label" id="${id}-etikett">${opts.label}${opts.required && !opts.current ? html` <span class="req" aria-hidden="true">*</span>` : html` <span class="optional">(valfritt)</span>`}</span>
    ${opts.help ? html`<p class="field-help" id="${opts.name}-hjalp">${opts.help}</p>` : ""}
    <div class="upload-box">
      ${src
        ? html`<img class="upload-preview" src="${src}" alt="Nuvarande bild" data-preview="${opts.name}">`
        : kind === "pdf" && opts.current
          ? html`<p class="upload-current">${icon("lock", "icon icon-sm")} En PDF är uppladdad.</p>`
          : html`<img class="upload-preview" alt="" data-preview="${opts.name}" hidden>`}
      <div class="upload-controls">
        ${uploadInput({ id, name: opts.name, kind, labelledBy: `${id}-etikett`, describedBy, setting: opts.setting })}
        <p class="field-help">${opts.current ? "Välj en ny fil för att ersätta den nuvarande. " : ""}${kind === "image" ? uploadHint("image") : uploadHint("pdf")}</p>
        ${kind === "image" && opts.current && isFitKey(opts.current)
          ? html`<p class="fit-link"><a href="/admin/bildbank/justera?nyckel=${encodeURIComponent(opts.current)}&amp;flik=ny" target="_blank" rel="noopener">${icon("crop", "icon icon-sm")}Justera utsnitt och storlek<span class="sr-only"> (öppnas i ny flik)</span></a></p>`
          : ""}
        ${opts.current && opts.removable !== false
          ? html`<label class="check-field check-small"><input type="checkbox" name="${opts.name}__ta_bort" value="1"><span>Ta bort ${kind === "pdf" ? "filen" : "bilden"}</span></label>`
          : ""}
      </div>
    </div>
    ${opts.error ? html`<p class="field-error" id="${opts.name}-fel">${opts.error}</p>` : ""}
  </div>`;
}
