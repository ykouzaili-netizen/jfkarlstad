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
  publish_at: string | null;
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

export interface InstagramPostRow {
  id: number;
  ig_id: string | null;
  source: "manuell" | "auto";
  image_key: string;
  permalink: string;
  caption: string;
  posted_at: string | null;
  sort_order: number;
  published: number;
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
  /** Länk till dokumentet, t.ex. Google Dokument. Går före file_key. */
  link_url: string | null;
  published: number;
  updated_at: string;
}

export type DocumentLinkKind = "gdoc" | "gsheet" | "gslides" | "gfolder" | "gdrive" | "link";

/** Vilken sorts länk ett dokument har – styr ikonens etikett och texten under titeln. */
export function documentLinkKind(url: string): DocumentLinkKind {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "link";
  }
  const host = u.hostname.toLowerCase();
  if (host === "docs.google.com") {
    if (u.pathname.startsWith("/document/")) return "gdoc";
    if (u.pathname.startsWith("/spreadsheets/")) return "gsheet";
    if (u.pathname.startsWith("/presentation/")) return "gslides";
  }
  if (host === "drive.google.com") return u.pathname.includes("/folders/") ? "gfolder" : "gdrive";
  return "link";
}

/** Kort etikett i dokumentikonen (samma stil som "PDF"). */
export const DOCUMENT_BADGE: Record<DocumentLinkKind | "pdf", string> = {
  pdf: "PDF",
  gdoc: "DOC",
  gsheet: "XLS",
  gslides: "PPT",
  gfolder: "MAPP",
  gdrive: "FIL",
  link: "LÄNK",
};

/** Är det en Google-länk vars delning går att kontrollera? */
export const isGoogleLink = (url: string) => /^https:\/\/(docs|drive)\.google\.com\//i.test(url);

export type JobKind = "praktik" | "sommarnotarie" | "trainee" | "jobb" | "uppsats" | "annat";
export const JOB_KINDS: JobKind[] = ["praktik", "sommarnotarie", "trainee", "jobb", "uppsats", "annat"];

export interface JobRow {
  id: number;
  slug: string;
  title: string;
  employer: string;
  partner_id: number | null;
  company_id?: number | null;
  kind: JobKind;
  location: string;
  summary: string;
  body: string;
  apply_url: string | null;
  deadline: string | null;
  publish_at: string | null;
  published: number;
  updated_at: string;
  /** Från JOIN mot partners (kan saknas). */
  partner_slug?: string | null;
  /** Arbetsgivarens logotyp: partnerns eller, för andra arbetsgivare, den i arbetsgivarregistret. */
  partner_logo?: string | null;
}

export interface PositionRow {
  id: number;
  title: string;
  committee: string;
  description: string;
  commitment: string;
  contact_email: string | null;
  open_until: string | null;
  sort_order: number;
  published: number;
}

/** Standardnamn – på webbplatsen används texterna doc_cat_* från textregistret. */
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

/** Schemalagd publicering: syns först när publiceringstiden (UTC) har passerat. */
const NEWS_LIVE = "published = 1 AND (published_at IS NULL OR published_at <= datetime('now'))";
const EVENT_LIVE = "published = 1 AND (publish_at IS NULL OR publish_at <= datetime('now'))";
const JOB_LIVE = "j.published = 1 AND (j.publish_at IS NULL OR j.publish_at <= datetime('now'))";

export const newsQuery = {
  latest: (db: D1Database, limit: number, offset = 0) =>
    db.prepare(`SELECT * FROM news WHERE ${NEWS_LIVE} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`).bind(limit, offset),
  count: (db: D1Database) => db.prepare(`SELECT COUNT(*) AS n FROM news WHERE ${NEWS_LIVE}`),
  bySlug: (db: D1Database, slug: string) => db.prepare(`SELECT * FROM news WHERE ${NEWS_LIVE} AND slug = ?`).bind(slug),
};

export const eventQuery = {
  upcoming: (db: D1Database, nowLocal: string, limit: number) =>
    db.prepare(`SELECT * FROM events WHERE ${EVENT_LIVE} AND ${EVENT_END} >= ? ORDER BY starts_at ASC LIMIT ?`).bind(nowLocal, limit),
  past: (db: D1Database, nowLocal: string, limit: number) =>
    db.prepare(`SELECT * FROM events WHERE ${EVENT_LIVE} AND ${EVENT_END} < ? ORDER BY starts_at DESC LIMIT ?`).bind(nowLocal, limit),
  /** Evenemang som pågår någon gång mellan två tidpunkter (månadsvyn). `toLocal` är exklusiv. */
  between: (db: D1Database, fromLocal: string, toLocal: string) =>
    db.prepare(`SELECT * FROM events WHERE ${EVENT_LIVE} AND starts_at < ? AND ${EVENT_END} >= ? ORDER BY starts_at ASC LIMIT 300`).bind(toLocal, fromLocal),
  /** För kalenderprenumerationen: från ett datum och framåt. */
  since: (db: D1Database, fromLocal: string) =>
    db.prepare(`SELECT * FROM events WHERE ${EVENT_LIVE} AND ${EVENT_END} >= ? ORDER BY starts_at ASC LIMIT 300`).bind(fromLocal),
  bySlug: (db: D1Database, slug: string) => db.prepare(`SELECT * FROM events WHERE ${EVENT_LIVE} AND slug = ?`).bind(slug),
};

/** Logotypen kommer från partnern (om den är publicerad) eller från arbetsgivarregistret (companies). */
const JOB_SELECT =
  "SELECT j.*, p.slug AS partner_slug, COALESCE(p.logo_key, co.logo_key) AS partner_logo FROM jobs j " +
  "LEFT JOIN partners p ON p.id = j.partner_id AND p.published = 1 LEFT JOIN companies co ON co.id = j.company_id";

export const jobQuery = {
  /** Öppna tjänster: publicerade och sista ansökningsdag inte passerad. `today` = 'YYYY-MM-DD' i svensk tid. */
  open: (db: D1Database, today: string) =>
    db.prepare(`${JOB_SELECT} WHERE ${JOB_LIVE} AND (j.deadline IS NULL OR j.deadline >= ?) ORDER BY j.deadline IS NULL, j.deadline, j.id DESC`).bind(today),
  openCount: (db: D1Database, today: string) =>
    db.prepare(`SELECT COUNT(*) AS n FROM jobs j WHERE ${JOB_LIVE} AND (j.deadline IS NULL OR j.deadline >= ?)`).bind(today),
  openForPartner: (db: D1Database, partnerId: number, today: string) =>
    db.prepare(`${JOB_SELECT} WHERE ${JOB_LIVE} AND j.partner_id = ? AND (j.deadline IS NULL OR j.deadline >= ?) ORDER BY j.deadline IS NULL, j.deadline`).bind(partnerId, today),
  /** Även tjänster som gått ut, så att gamla länkar fungerar (sidan visar att tiden gått ut). */
  bySlug: (db: D1Database, slug: string) => db.prepare(`${JOB_SELECT} WHERE ${JOB_LIVE} AND j.slug = ?`).bind(slug),
  byId: (db: D1Database, id: number) => db.prepare(`${JOB_SELECT} WHERE ${JOB_LIVE} AND j.id = ?`).bind(id),
};

/** Underlag för sidans sökfunktion. Innehållet är litet, så vi filtrerar i koden (klarar å, ä och ö). */
export const searchQuery = {
  news: (db: D1Database) =>
    db.prepare(`SELECT id, slug, title, excerpt, body, published_at FROM news WHERE ${NEWS_LIVE} ORDER BY published_at DESC LIMIT 500`),
  events: (db: D1Database) =>
    db.prepare(`SELECT id, slug, title, summary, body, location, starts_at, ends_at FROM events WHERE ${EVENT_LIVE} ORDER BY starts_at DESC LIMIT 500`),
};

export const positionQuery = {
  open: (db: D1Database, today: string) =>
    db.prepare("SELECT * FROM positions WHERE published = 1 AND (open_until IS NULL OR open_until >= ?) ORDER BY sort_order, id").bind(today),
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

/** Startsidans Instagram-avsnitt: de senaste publicerade inläggen (fastnålade först via sortering). */
export const instagramQuery = {
  latest: (db: D1Database, limit: number) =>
    db
      .prepare("SELECT * FROM instagram_posts WHERE published = 1 ORDER BY sort_order DESC, COALESCE(posted_at, created_at) DESC, id DESC LIMIT ?")
      .bind(Math.min(24, Math.max(1, limit))),
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
