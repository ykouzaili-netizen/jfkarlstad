import type { Env } from "../env.js";
import { FIELD_INDEX } from "./texts.js";
import { deleteFile } from "./storage.js";

/**
 * Bildbanken: varje uppladdad fil registreras i tabellen `media`. En bild kan användas på flera ställen,
 * och när den byts ut ligger den kvar i banken så att den kan återanvändas. Personfoton och galleribilder
 * raderas däremot direkt när de tas bort (GDPR – samtycke kan återkallas).
 */

export interface MediaRow {
  key: string;
  kind: "image" | "pdf";
  filename: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  has_small: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface Usage {
  label: string;
  href: string;
}

/** Var används varje fil? Nyckel → lista med platser (med länk till redigeringen). */
export async function mediaUsage(db: D1Database): Promise<Map<string, Usage[]>> {
  const map = new Map<string, Usage[]>();
  const add = (key: unknown, u: Usage) => {
    if (typeof key !== "string" || !key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  };
  const [news, events, partners, board, honors, gallery, docs, settings, insta, cm1, cm2, cm3, companies, medals] = await db.batch([
    db.prepare("SELECT id, title, image_key AS k FROM news WHERE image_key IS NOT NULL AND image_key != ''"),
    db.prepare("SELECT id, title, image_key AS k FROM events WHERE image_key IS NOT NULL AND image_key != ''"),
    db.prepare("SELECT id, name AS title, logo_key AS k FROM partners WHERE logo_key IS NOT NULL AND logo_key != ''"),
    db.prepare("SELECT id, name AS title, photo_key AS k FROM board_members WHERE photo_key IS NOT NULL AND photo_key != ''"),
    db.prepare("SELECT id, name AS title, photo_key AS k FROM honors WHERE photo_key IS NOT NULL AND photo_key != ''"),
    db.prepare("SELECT id, alt AS title, image_key AS k FROM gallery_images"),
    db.prepare("SELECT id, title, file_key AS k FROM documents WHERE file_key IS NOT NULL AND file_key != ''"),
    db.prepare("SELECT key, value AS k FROM settings WHERE value != ''"),
    db.prepare("SELECT id, caption AS title, image_key AS k FROM instagram_posts"),
    db.prepare("SELECT id, name AS title, image_1_key AS k FROM committees WHERE image_1_key IS NOT NULL"),
    db.prepare("SELECT id, name AS title, image_2_key AS k FROM committees WHERE image_2_key IS NOT NULL"),
    db.prepare("SELECT id, name AS title, image_3_key AS k FROM committees WHERE image_3_key IS NOT NULL"),
    db.prepare("SELECT id, name AS title, logo_key AS k FROM companies WHERE logo_key IS NOT NULL AND logo_key != ''"),
    db.prepare("SELECT id, name AS title, image_key AS k FROM medals WHERE image_key IS NOT NULL AND image_key != ''"),
  ]);
  type R = { id: number; title: string; k: string };
  const each = (res: D1Result | undefined, label: string, path: string) =>
    ((res?.results ?? []) as R[]).forEach((r) => add(r.k, { label: `${label}: ${r.title || "utan namn"}`, href: `/admin/${path}/${r.id}` }));
  each(news, "Nyhet", "nyheter");
  each(events, "Event", "event");
  each(partners, "Partner", "partners");
  each(companies, "Arbetsgivare", "arbetsgivare");
  each(board, "Styrelsen", "styrelsen");
  each(honors, "Utmärkelse", "utmarkelser");
  each(medals, "Orden/medalj", "medaljer");
  each(gallery, "Bildgalleri", "galleri");
  each(docs, "Dokument", "dokument");
  each(insta, "Instagram", "instagram");
  for (const r of [cm1, cm2, cm3]) each(r, "Utskott", "utskott");
  for (const r of (settings?.results ?? []) as { key: string; k: string }[]) {
    if (r.key === "ig:profil") {
      try {
        add((JSON.parse(r.k) as { pictureKey?: string }).pictureKey, { label: "Instagram: profilbild", href: "/admin/instagram" });
      } catch {
        /* ogiltig rad */
      }
      continue;
    }
    if (r.key.startsWith("bildspel:")) {
      // Bilderna i ett bildspel (efter huvudbilden) används lika mycket som huvudbilden.
      const field = r.key.slice("bildspel:".length);
      const loc = FIELD_INDEX.get(field);
      for (const k of r.k.split(",").filter(Boolean)) {
        add(k, loc ? { label: `${loc.page.title}: ${loc.field.label} (bildspel)`, href: `/admin/texter?sida=${loc.page.id}&falt=${field}` } : { label: "Bildspel", href: "/admin/texter" });
      }
      continue;
    }
    if (!isImageSetting(r.key)) continue;
    if (r.key === "logo_key") add(r.k, { label: "Logotypen", href: "/admin/utseende#logotyp" });
    else {
      const loc = FIELD_INDEX.get(r.key);
      add(r.k, loc ? { label: `${loc.page.title}: ${loc.field.label}`, href: `/admin/texter?sida=${loc.page.id}&falt=${r.key}` } : { label: r.key, href: "/admin/texter" });
    }
  }
  return map;
}

/** Inställningar som innehåller en bild: logotypen och alla bildfält i textregistret (oavsett namn). */
export function isImageSetting(key: string): boolean {
  return key === "logo_key" || key.endsWith("_key") || FIELD_INDEX.get(key)?.field.type === "image";
}

export async function isInUse(db: D1Database, key: string): Promise<boolean> {
  return (await mediaUsage(db)).has(key);
}

export async function registerMedia(
  db: D1Database,
  m: { key: string; kind: "image" | "pdf"; filename: string; contentType: string; size: number; width?: number | null; height?: number | null; hasSmall: boolean; user?: string | null },
): Promise<void> {
  try {
    await db
      .prepare("INSERT OR REPLACE INTO media (key, kind, filename, content_type, size, width, height, has_small, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(m.key, m.kind, m.filename, m.contentType, m.size, m.width ?? null, m.height ?? null, m.hasSmall ? 1 : 0, m.user ?? null)
      .run();
  } catch (err) {
    // Bildbanken är en bekvämlighet – uppladdningen ska inte misslyckas för att registreringen gör det.
    console.error("Kunde inte registrera fil i bildbanken", err instanceof Error ? err.message : err);
  }
}

/** Radera filen (och den lilla versionen) helt – från lagringen och bildbanken. */
export async function purgeMedia(env: Env, key: string | null | undefined): Promise<void> {
  if (!key) return;
  await deleteFile(env, key);
  await deleteFile(env, `${key}.sm`);
  try {
    await env.DB.prepare("DELETE FROM media WHERE key = ?").bind(key).run();
  } catch {
    /* tabellen kan saknas i en gammal databas */
  }
}

/** Radera filen om den inte längre används någonstans. */
export async function purgeIfUnused(env: Env, key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  if (await isInUse(env.DB, key)) return false;
  await purgeMedia(env, key);
  return true;
}

export function formatBytes(b: number | null | undefined): string {
  if (!b) return "";
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`;
}
