/**
 * Säker HTML-mallning. Allt som interpoleras i html`` escapas automatiskt,
 * utom värden som redan är SafeHtml (t.ex. andra html``-fragment eller raw()).
 */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(input: unknown): string {
  return String(input ?? "").replace(/[&<>"'`]/g, (c) => ESCAPES[c] ?? c);
}

type Renderable = SafeHtml | string | number | boolean | null | undefined | Renderable[];

function render(value: Renderable): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: Renderable[]): SafeHtml {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i] as Renderable);
  });
  return new SafeHtml(out);
}

/** Markera en sträng som redan säker HTML. Använd bara för kod-genererad markup (t.ex. SVG-ikoner). */
export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

/** Gör om fritext med tomrader till <p>-stycken och enkla radbrytningar. Escapar allt. */
export function paragraphs(text: string | null | undefined): SafeHtml {
  const parts = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return raw(parts.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join(""));
}

/** Tillåt bara http(s)-, mailto- och tel-länkar samt interna sökvägar. Allt annat blir "#". */
export function safeUrl(url: string | null | undefined): string {
  const u = String(url ?? "").trim();
  if (!u) return "#";
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  return "#";
}

export function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
