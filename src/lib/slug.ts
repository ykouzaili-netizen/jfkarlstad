/** "Årets pedagog 2026" → "arets-pedagog-2026" (för adresser). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/å/g, "a")
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "inlagg"
  );
}
