import { html, type SafeHtml } from "./html.js";
import { plainText } from "./markdown.js";

/**
 * Enkel fritextsökning för en liten webbplats: alla sökord måste finnas någonstans i texten.
 * Jämförelsen görs i JavaScript (inte SQL) så att å, ä och ö fungerar oavsett versaler.
 */

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

export function normalizeQuery(q: string | null | undefined): string {
  return (q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

export function terms(q: string): string[] {
  return [...new Set(q.toLocaleLowerCase("sv").split(" ").filter(Boolean))].slice(0, 8);
}

const lower = (t: string) => t.toLocaleLowerCase("sv");

/** Matchar alla sökord i någon av texterna (tillsammans)? */
export function matches(ts: string[], ...texts: (string | null | undefined)[]): boolean {
  const hay = lower(texts.filter(Boolean).join(" \n "));
  return ts.every((t) => hay.includes(t));
}

/** Ett utdrag på ca `len` tecken runt den första träffen, som ren text (markdown borttagen). */
export function snippet(ts: string[], text: string | null | undefined, len = 160): string {
  const t = plainText(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const l = lower(t);
  let pos = -1;
  for (const term of ts) {
    const i = l.indexOf(term);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1 || t.length <= len) return t.length <= len ? t : t.slice(0, len).replace(/\s+\S*$/, "") + " …";
  let start = Math.max(0, pos - Math.floor(len / 3));
  if (start > 0) {
    const space = t.indexOf(" ", start);
    start = space !== -1 && space < pos ? space + 1 : start;
  }
  let end = Math.min(t.length, start + len);
  if (end < t.length) {
    const space = t.lastIndexOf(" ", end);
    end = space > pos ? space : end;
  }
  return (start > 0 ? "… " : "") + t.slice(start, end) + (end < t.length ? " …" : "");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Markera sökorden med <mark>. Allt annat escapas som vanligt. */
export function highlight(text: string, ts: string[]): SafeHtml {
  if (!ts.length || !text) return html`${text}`;
  const re = new RegExp(`(${ts.map(escapeRe).join("|")})`, "giu");
  const parts = text.split(re);
  return html`${parts.map((p, i) => (i % 2 === 1 ? html`<mark>${p}</mark>` : p))}`;
}
