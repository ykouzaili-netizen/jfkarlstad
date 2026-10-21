/**
 * D1 tillåter högst 100 bundna parametrar per fråga (SQLite lokalt tillåter tusentals – så felet syns bara i
 * produktion). Frågor med en lista (`IN (?, ?, …)`) delas därför upp i bitar om högst 90.
 */
export const D1_CHUNK = 90;

export function chunked<T>(list: readonly T[], size = D1_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** "?,?,?" för en lista. */
export const placeholders = (list: readonly unknown[]) => list.map(() => "?").join(",");

/** Kör en SELECT med `IN (…)` bit för bit och slår ihop raderna. `sql` får `{in}` där listan ska stå. */
export async function selectIn<R>(db: D1Database, sql: string, list: readonly (string | number)[], after: readonly (string | number)[] = []): Promise<R[]> {
  const rows: R[] = [];
  for (const part of chunked(list)) {
    const { results } = await db.prepare(sql.replace("{in}", placeholders(part))).bind(...part, ...after).all<R>();
    rows.push(...results);
  }
  return rows;
}
