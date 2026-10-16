import { html, type SafeHtml } from "./html.js";

/**
 * Fler länkar på en partners egen sida (t.ex. LinkedIn, trainee­program, podd). Sparas som JSON i partners.links
 * (migrering 0014): [{ "label": "LinkedIn", "url": "https://…" }, …]. Länkarna går via /ut/lank/:id?nr=N så att
 * adressen alltid hämtas från databasen (ingen öppen omdirigering) och klicken räknas i partnerstatistiken.
 */
export interface PartnerLink {
  label: string;
  url: string;
}

export const MAX_PARTNER_LINKS = 10;
const LABEL_MAX = 60;
const URL_MAX = 300;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

/** Tål saknad kolumn, trasig JSON och konstiga värden – det som inte är en giltig länk hoppas över. */
export function parsePartnerLinks(raw: unknown): PartnerLink[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((l): l is PartnerLink => !!l && typeof l.label === "string" && typeof l.url === "string" && URL_RE.test(l.url))
      .slice(0, MAX_PARTNER_LINKS);
  } catch {
    return [];
  }
}

/** "linkedin.com/company/x" → "https://linkedin.com/company/x". Allt annat lämnas som det är. */
function withScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\.|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url)) return `https://${url}`;
  return url;
}

/**
 * Läser raderna från formuläret (fälten link_label och link_url, en per rad). Tomma rader hoppas över.
 * value = JSON för det som skrevs (även felaktiga rader, så att inget försvinner när felet visas).
 */
export function readPartnerLinks(form: FormData): { value: string; error?: string } {
  const labels = form.getAll("link_label").map((v) => String(v).trim());
  const urls = form.getAll("link_url").map((v) => String(v).trim());
  const rows: PartnerLink[] = [];
  const problems: string[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = labels[i] ?? "";
    const url = withScheme(urls[i] ?? "");
    if (!label && !url) continue;
    const n = rows.length + 1;
    rows.push({ label: label.slice(0, LABEL_MAX), url: url.slice(0, URL_MAX) });
    if (!label) problems.push(`länk ${n} saknar text`);
    else if (!url) problems.push(`länk ${n} saknar adress`);
    else if (!URL_RE.test(url)) problems.push(`adressen i länk ${n} ser inte ut som en webbadress`);
  }
  if (rows.length > MAX_PARTNER_LINKS) problems.push(`högst ${MAX_PARTNER_LINKS} länkar`);
  const value = JSON.stringify(rows.slice(0, MAX_PARTNER_LINKS));
  if (!problems.length) return { value };
  const text = problems.join(", ");
  return { value, error: `${text[0]!.toUpperCase()}${text.slice(1)}. Fyll i både text och adress (t.ex. https://linkedin.com/company/…), eller töm raden.` };
}

/** Raderna i adminformuläret. Utan JavaScript: alla sparade länkar plus två tomma rader. admin.js lägger till och tar bort rader. */
export function partnerLinksField(value: string, error?: string): SafeHtml {
  let saved: PartnerLink[] = [];
  try {
    const list = JSON.parse(value || "[]") as unknown;
    if (Array.isArray(list)) saved = list.filter((l) => l && typeof l === "object").map((l) => ({ label: String(l.label ?? ""), url: String(l.url ?? "") }));
  } catch {
    saved = [];
  }
  const rows = [...saved, ...Array.from({ length: Math.min(2, MAX_PARTNER_LINKS - saved.length) }, () => ({ label: "", url: "" }))];
  const row = (l: PartnerLink, i: number, template = false) => {
    const n = template ? "__N__" : String(i + 1);
    return html`<div class="link-row" data-repeater-row>
      <span class="link-row-num" aria-hidden="true">${n}</span>
      <div class="link-row-field">
        <label class="field-label" for="${i === 0 && !template ? "falt-links" : `falt-link-label-${n}`}">Text på länken <span class="sr-only">(länk ${n})</span></label>
        <input type="text" id="${i === 0 && !template ? "falt-links" : `falt-link-label-${n}`}" name="link_label" value="${l.label}" maxlength="${LABEL_MAX}" placeholder="T.ex. LinkedIn" autocomplete="off">
      </div>
      <div class="link-row-field link-row-url">
        <label class="field-label" for="falt-link-url-${n}">Adress <span class="sr-only">(länk ${n})</span></label>
        <input type="url" id="falt-link-url-${n}" name="link_url" value="${l.url}" maxlength="${URL_MAX}" placeholder="https://" inputmode="url" autocomplete="off" spellcheck="false">
      </div>
      <button class="btn btn-ghost btn-sm link-row-remove" type="button" data-repeater-remove hidden>Ta bort<span class="sr-only"> länken</span></button>
    </div>`;
  };
  return html`<fieldset class="field field-links${error ? " has-error" : ""}" data-repeater data-repeater-max="${MAX_PARTNER_LINKS}" aria-describedby="links-hjalp${error ? " links-fel" : ""}">
    <legend class="field-label">Fler länkar <span class="optional">(valfritt)</span></legend>
    <p class="field-help" id="links-hjalp">Visas i rutan bredvid presentationen, under knapparna till karriärsidan och webbplatsen. T.ex. LinkedIn, Instagram, traineeprogram eller en podd. Högst ${MAX_PARTNER_LINKS} länkar – töm en rad för att ta bort länken.</p>
    <div class="link-rows" data-repeater-list>${rows.map((l, i) => row(l, i))}</div>
    <template data-repeater-template>${row({ label: "", url: "" }, 0, true)}</template>
    <button class="btn btn-outline btn-sm link-add" type="button" data-repeater-add hidden>+ Lägg till länk</button>
    ${error ? html`<p class="field-error" id="links-fel">${error}</p>` : ""}
  </fieldset>`;
}
