import { escapeHtml, raw, safeUrl, type SafeHtml } from "./html.js";

/**
 * Mycket enkel och säker textformatering för nyheter och evenemang.
 * Stöder: tom rad = nytt stycke, "## Rubrik", "- punkt", **fet**, *kursiv*, [länktext](https://...).
 * All text escapas först – det går inte att skriva in egen HTML.
 */
export function renderMarkdown(source: string | null | undefined): SafeHtml {
  const blocks = String(source ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const block of blocks) {
    const linesInBlock = block.split("\n");
    if (/^#{2,3}\s/.test(block) && linesInBlock.length === 1) {
      const level = block.startsWith("###") ? 3 : 2;
      out.push(`<h${level}>${inline(block.replace(/^#{2,3}\s+/, ""))}</h${level}>`);
    } else if (linesInBlock.every((l) => /^[-*•]\s+/.test(l))) {
      out.push(`<ul>${linesInBlock.map((l) => `<li>${inline(l.replace(/^[-*•]\s+/, ""))}</li>`).join("")}</ul>`);
    } else if (linesInBlock.every((l) => /^\d+[.)]\s+/.test(l))) {
      out.push(`<ol>${linesInBlock.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`);
    } else {
      out.push(`<p>${linesInBlock.map(inline).join("<br>")}</p>`);
    }
  }
  return raw(out.join("\n"));
}

/** Inline-formatering (länkar, fet, kursiv) för en kort text. Escapar allt. */
export function inline(text: string): string {
  let s = escapeHtml(text);
  // Länkar: [text](url) – URL:en kontrolleras med safeUrl
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    const ext = /^https?:/i.test(href);
    return `<a href="${escapeHtml(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s;
}

/** Ren text utan markdown-tecken (för meta-beskrivningar och utdrag). */
export function plainText(source: string): string {
  return source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*#>`_]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kort text med länkar och fetstil, utan stycken (för meningar som innehåller en länk). */
export function renderInline(source: string | null | undefined): SafeHtml {
  return raw(
    String(source ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => inline(l.trim()))
      .filter(Boolean)
      .join("<br>"),
  );
}
