import { html, type SafeHtml } from "./html.js";
import { icon, type IconName } from "../views/icons.js";

/**
 * Fler länkar på en partners egen sida (t.ex. LinkedIn, trainee­program, podd). Sparas som JSON i partners.links
 * (migrering 0014): [{ "id": "k3x9q2", "label": "LinkedIn", "url": "https://…" }, …]. Länkarna går via
 * /ut/lank/:id?l=<länkens id> så att adressen alltid hämtas från databasen (ingen öppen omdirigering) och klicken
 * räknas i partnerstatistiken – totalt och per länk (stats_links). Id:t följer länken när ordningen ändras.
 */
export interface PartnerLink {
  id: string;
  label: string;
  url: string;
}

const ID_RE = /^[a-z0-9]{4,12}$/;

/** Stabilt id för äldre länkar som sparades utan id (samma adress ger samma id). */
function idFromUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return ("l" + h.toString(36)).slice(0, 8).padEnd(4, "0");
}

function newId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join("");
}

/** Ikon efter vilken sorts länk det är (adressen) – generiska ikoner, inga varumärkeslogotyper. */
export function linkIcon(url: string): IconName {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return "external";
  }
  if (/(^|\.)linkedin\.com$/.test(host)) return "users";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(host)) return "play";
  if (/(^|\.)(spotify\.com|podcasts\.apple\.com|acast\.com|podbean\.com)$/.test(host) || /podd|podcast/.test(path)) return "mic";
  if (/(^|\.)(facebook\.com|fb\.me|x\.com|twitter\.com|threads\.net)$/.test(host)) return "megaphone";
  if (/karriar|career|jobs?|teamtailor|jobb|trainee|rekryt/.test(host + path)) return "briefcase";
  if (/\.pdf$/.test(path)) return "fileUp";
  return "external";
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
      .slice(0, MAX_PARTNER_LINKS)
      .map((l) => ({ id: typeof l.id === "string" && ID_RE.test(l.id) ? l.id : idFromUrl(l.url), label: l.label, url: l.url }));
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
  const ids = form.getAll("link_id").map((v) => String(v).trim());
  const used = new Set<string>();
  const rows: PartnerLink[] = [];
  const problems: string[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = labels[i] ?? "";
    const url = withScheme(urls[i] ?? "");
    if (!label && !url) continue;
    const n = rows.length + 1;
    // Länkens id följer med när raderna flyttas – så att klicken per länk räknas rätt. Nya rader får ett nytt id.
    let id = ids[i] && ID_RE.test(ids[i]!) && !used.has(ids[i]!) ? ids[i]! : newId();
    while (used.has(id)) id = newId();
    used.add(id);
    rows.push({ id, label: label.slice(0, LABEL_MAX), url: url.slice(0, URL_MAX) });
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
export function partnerLinksField(value: string, error?: string, help = "Visas i rutan bredvid presentationen, under knapparna till karriärsidan och webbplatsen. T.ex. LinkedIn, Instagram, traineeprogram eller en podd."): SafeHtml {
  let saved: PartnerLink[] = [];
  try {
    const list = JSON.parse(value || "[]") as unknown;
    if (Array.isArray(list))
      saved = list
        .filter((l) => l && typeof l === "object")
        .map((l) => ({ id: typeof l.id === "string" && ID_RE.test(l.id) ? l.id : l.url ? idFromUrl(String(l.url)) : "", label: String(l.label ?? ""), url: String(l.url ?? "") }));
  } catch {
    saved = [];
  }
  const rows = [...saved, ...Array.from({ length: Math.min(2, MAX_PARTNER_LINKS - saved.length) }, () => ({ id: "", label: "", url: "" }))];
  const row = (l: PartnerLink, i: number, template = false) => {
    const n = template ? "__N__" : String(i + 1);
    return html`<div class="link-row" data-repeater-row data-sort-id="${l.id || n}">
      <button class="link-row-handle" type="button" data-sort-handle hidden aria-label="Dra för att flytta länken (eller använd piltangenterna)" title="Dra för att flytta">${icon("grip", "icon icon-sm")}</button>
      <span class="link-row-num" aria-hidden="true">${n}</span>
      <input type="hidden" name="link_id" value="${l.id}">
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
    <p class="field-help" id="links-hjalp">${help} Högst ${MAX_PARTNER_LINKS} länkar – töm en rad för att ta bort länken. Dra i handtaget till vänster för att ändra ordning.</p>
    <div class="link-rows" data-repeater-list data-sortable>${rows.map((l, i) => row(l, i))}</div>
    <template data-repeater-template>${row({ id: "", label: "", url: "" }, 0, true)}</template>
    <button class="btn btn-outline btn-sm link-add" type="button" data-repeater-add hidden>+ Lägg till länk</button>
    ${error ? html`<p class="field-error" id="links-fel">${error}</p>` : ""}
  </fieldset>`;
}
