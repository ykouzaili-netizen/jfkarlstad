/** Läsfrågor för publikt innehåll. Alla returnerar bara publicerat innehåll. */

export interface NewsRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  image_key: string | null;
  image_alt: string;
  published: number;
  published_at: string | null;
  updated_at: string;
}

export interface EventRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  signup_url: string | null;
  members_only: number;
  image_key: string | null;
  image_alt: string;
  published: number;
}

export interface PartnerRow {
  id: number;
  slug: string;
  name: string;
  tier: "huvud" | "partner";
  tagline: string;
  description: string;
  logo_key: string | null;
  website_url: string | null;
  career_url: string | null;
  sort_order: number;
  published: number;
}

export interface BoardRow {
  id: number;
  name: string;
  role: string;
  email: string | null;
  photo_key: string | null;
  sort_order: number;
  published: number;
}

export interface HonorRow {
  id: number;
  kind: "hedersmedlem" | "arets_pedagog" | "utmarkelse";
  name: string;
  year: number | null;
  description: string;
  photo_key: string | null;
  sort_order: number;
  published: number;
}

export interface CourseRepRow {
  id: number;
  term: string;
  name: string | null;
  email: string | null;
  sort_order: number;
}

export interface GalleryRow {
  id: number;
  album: string;
  image_key: string;
  alt: string;
  caption: string;
  sort_order: number;
}

export interface FaqRow {
  id: number;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  published: number;
}

export interface DocumentRow {
  id: number;
  title: string;
  category: "stadgar" | "styrdokument" | "protokoll" | "ovrigt";
  year: number;
  file_key: string | null;
  file_size: number | null;
  published: number;
  updated_at: string;
}

export const DOCUMENT_CATEGORIES: Record<DocumentRow["category"], string> = {
  stadgar: "Stadgar",
  styrdokument: "Styrdokument",
  protokoll: "Protokoll",
  ovrigt: "Övrigt",
};

export const HONOR_KINDS: Record<HonorRow["kind"], string> = {
  hedersmedlem: "Hedersmedlem",
  utmarkelse: "Utmärkelse",
  arets_pedagog: "Årets pedagog",
};

export const GALLERY_ALBUMS = ["Banketter", "Arbetsmarknadsmässor", "Halvtidsmiddagar", "Inspark", "Övriga evenemang"];

/** Visas ett evenemang utan sluttid till dagens slut. */
const EVENT_END = "COALESCE(ends_at, substr(starts_at, 1, 10) || 'T23:59')";

export const newsQuery = {
  latest: (db: D1Database, limit: number, offset = 0) =>
    db
      .prepare("SELECT * FROM news WHERE published = 1 ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?")
      .bind(limit, offset),
  count: (db: D1Database) => db.prepare("SELECT COUNT(*) AS n FROM news WHERE published = 1"),
  bySlug: (db: D1Database, slug: string) => db.prepare("SELECT * FROM news WHERE published = 1 AND slug = ?").bind(slug),
};

export const eventQuery = {
  upcoming: (db: D1Database, nowLocal: string, limit: number) =>
    db.prepare(`SELECT * FROM events WHERE published = 1 AND ${EVENT_END} >= ? ORDER BY starts_at ASC LIMIT ?`).bind(nowLocal, limit),
  past: (db: D1Database, nowLocal: string, limit: number) =>
    db.prepare(`SELECT * FROM events WHERE published = 1 AND ${EVENT_END} < ? ORDER BY starts_at DESC LIMIT ?`).bind(nowLocal, limit),
  bySlug: (db: D1Database, slug: string) => db.prepare("SELECT * FROM events WHERE published = 1 AND slug = ?").bind(slug),
};

export const partnerQuery = {
  all: (db: D1Database) =>
    db.prepare("SELECT * FROM partners WHERE published = 1 ORDER BY CASE tier WHEN 'huvud' THEN 0 ELSE 1 END, sort_order, name"),
  bySlug: (db: D1Database, slug: string) => db.prepare("SELECT * FROM partners WHERE published = 1 AND slug = ?").bind(slug),
};

export const boardQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM board_members WHERE published = 1 ORDER BY sort_order, name"),
};

export const honorQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM honors WHERE published = 1 ORDER BY year DESC, sort_order, name"),
};

export const repQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM course_reps ORDER BY sort_order, term"),
};

export const galleryQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM gallery_images ORDER BY album, sort_order, id DESC"),
};

export const faqQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM faq WHERE published = 1 ORDER BY sort_order, id"),
  byCategory: (db: D1Database, category: string) =>
    db.prepare("SELECT * FROM faq WHERE published = 1 AND category = ? ORDER BY sort_order, id").bind(category),
};

export const documentQuery = {
  all: (db: D1Database) => db.prepare("SELECT * FROM documents WHERE published = 1 ORDER BY year DESC, category, title"),
  byId: (db: D1Database, id: number) => db.prepare("SELECT * FROM documents WHERE published = 1 AND id = ?").bind(id),
};

export async function rows<T>(stmt: D1PreparedStatement): Promise<T[]> {
  return (await stmt.all<T>()).results;
}
