import { slugify } from "./slug.js";
import { splitByYear } from "./years.js";

/**
 * Utskotten: en egen innehållstyp (Styrelse och uppdrag → Utskott) med namn, kort beskrivning, en längre
 * förklaring, tidsåtgång och upp till tre bilder. Visas som kort på Om oss och som klickbara, utfällbara
 * kort på Engagera dig, och namnen finns som val i intresseformuläret.
 *
 * Tabellen skapas av migrering 0004 – och av Workern själv om den saknas (ensureCommitteeSchema), så att
 * inget behöver köras för hand i Cloudflare. Första gången flyttas den gamla textlistan (inställningen
 * `committees`, "Namn | Beskrivning" per rad) över till tabellen.
 */

export interface CommitteeRow {
  id: number;
  name: string;
  slug: string;
  summary: string;
  body: string;
  commitment: string;
  image_1_key: string | null;
  image_1_alt: string;
  image_2_key: string | null;
  image_2_alt: string;
  image_3_key: string | null;
  image_3_alt: string;
  /** Anslagsbilden (migrering 0026): på kortet under Om oss och överst på utskottets sida. */
  cover_key?: string | null;
  cover_alt?: string;
  /** Vad som alltid ska synas när bilden beskärs: mitten, upptill, nertill, vanster, hoger. */
  cover_focus?: string;
  email?: string | null;
  /** Hur medlemmarna visas på utskottets sida: "portratt" (standard) eller "lagbild" (gruppbilden med siffror). */
  meet_style?: string;
  sort_order: number;
  published: number;
}

/** En medlem i ett utskott ett visst verksamhetsår (migrering 0026). Den som står först visas störst. */
export interface CommitteeMemberRow {
  id: number;
  committee_id: number;
  year: string;
  name: string;
  role: string;
  program: string;
  quote: string;
  photo_key: string | null;
  /** Var personen står på årets lagbild, i procent av bildens bredd och höjd. null = inte utplacerad. */
  marker_x?: number | null;
  marker_y?: number | null;
  sort_order: number;
  published: number;
}

/** Gruppbild för ett verksamhetsår: för ett utskott, eller styrelsen (committee_id = 0). Migrering 0026. */
export interface GroupPhotoRow {
  id: number;
  committee_id: number;
  year: string;
  image_key: string;
  image_alt: string;
}

/** Styrelsens gruppbilder har committee_id 0. */
export const BOARD_GROUP = 0;

/** Gruppbilderna för ett utskott (eller styrelsen) per år. Tål att tabellen saknas. */
export async function loadGroupPhotos(db: D1Database, committeeId: number): Promise<Map<string, GroupPhotoRow>> {
  try {
    const { results } = await db.prepare("SELECT * FROM group_photos WHERE committee_id = ? ORDER BY year DESC").bind(committeeId).all<GroupPhotoRow>();
    return new Map(results.map((r) => [r.year, r]));
  } catch {
    return new Map();
  }
}

/** Visas medlemmarna som lagbild? Bara om utskottet valt det och årets gruppbild finns. */
export function usesTeamPhoto(c: CommitteeRow, photo: GroupPhotoRow | undefined): photo is GroupPhotoRow {
  return c.meet_style === "lagbild" && !!photo;
}

/** En position i procent (0–100), eller null. */
export function markerValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null;
}

const IMPORTED = "utskott:importerat";

/** Standardutskotten (platshållare – styrelsen fyller i den riktiga texten i adminpanelen). */
const DEFAULTS: { name: string; summary: string; body: string; commitment: string }[] = [
  {
    name: "Utbildningsutskottet",
    summary: "Bevakar utbildningens kvalitet, tar tillvara synpunkter från kursombuden och driver studenternas frågor gentemot universitetet.",
    body: "I utbildningsutskottet arbetar du med det som rör själva utbildningen. Ni samlar in synpunkter från kursombuden och från JF Påverka, tar upp dem med programansvariga och följer upp att något händer.\n\n- Möten med kursombuden varje termin\n- Representation i programråd och andra organ på universitetet\n- Pluggstugor och studieteknikkvällar tillsammans med ELSA\n\nPerfekt för dig som vill påverka hur utbildningen ser ut – för dig själv och för dem som kommer efter.",
    commitment: "Ett möte varannan vecka och några timmar runt varje kursutvärdering",
  },
  {
    name: "Arbetsmarknadsutskottet",
    summary: "Bygger kontakter med byråer, myndigheter och företag – från lunchföreläsningar till arbetsmarknadsdagen.",
    body: "Arbetsmarknadsutskottet är länken mellan studenterna och arbetslivet. Ni håller kontakten med samarbetspartnerna, planerar lunchföreläsningar och case-kvällar och står bakom föreningens största evenemang: arbetsmarknadsdagen.\n\n- Kontakt med byråer, domstolar och myndigheter\n- Lunchföreläsningar, frukostar och case-kvällar\n- Planering av arbetsmarknadsdagen\n\nDu får ett nätverk redan under studietiden och erfarenhet som syns i cv:t.",
    commitment: "Ett par timmar i veckan, mer inför arbetsmarknadsdagen",
  },
  {
    name: "Kommunikationsutskottet",
    summary: "Ansvarar för Instagram, webbplatsen och allt som syns utåt: foto, film och grafik.",
    body: "Kommunikationsutskottet gör att alla vet vad som händer i JFK. Ni fotograferar på evenemang, gör grafik och filmer till Instagram och håller webbplatsen uppdaterad.\n\n- Instagram, stories och reels\n- Foto och film på sittningar och evenemang\n- Affischer, grafik och nyheter på webbplatsen\n\nInga förkunskaper krävs – lust att skapa räcker långt.",
    commitment: "Flexibelt – mest kring evenemangen",
  },
  {
    name: "Evenemangsutskottet",
    summary: "Planerar sittningar, banketter, inspark och fester så att studietiden blir minnesvärd.",
    body: "Evenemangsutskottet ligger bakom föreningens sittningar, banketter och fester. Ni bestämmer teman, bokar lokaler, planerar menyer och ser till att kvällen blir av.\n\n- Sittningar och halvtidsmiddagar\n- Vårbanketten och höstens inspark\n- Samarbete med andra föreningar och nationer\n\nHär lär du dig projektledning på riktigt – och får vara med och skapa minnen för hela programmet.",
    commitment: "Ett möte i veckan, mer inför större evenemang",
  },
  {
    name: "Ekonomiutskottet",
    summary: "Håller ordning på budget och bokföring och hjälper styrelsen att använda föreningens pengar klokt.",
    body: "Ekonomiutskottet hjälper kassören med föreningens ekonomi. Ni stämmer av kvitton, följer upp budgeten för evenemangen och tar fram underlag inför styrelsemöten och årsmöte.\n\n- Bokföring och kvittohantering\n- Budget och uppföljning av evenemang\n- Underlag till årsmötet\n\nBra erfarenhet för dig som är intresserad av skatterätt, bolagsrätt eller ekonomi.",
    commitment: "Ett par timmar i månaden",
  },
  {
    name: "Idrottsutskottet",
    summary: "Ordnar träningar, turneringar och idrottsevenemang för alla nivåer.",
    body: "Idrottsutskottet (JFK Idrott) gör det enkelt och roligt att röra på sig. Ni bokar halltider, ordnar turneringar mot andra föreningar och planerar vårens skidresa.\n\n- Halltider varje söndag\n- Turneringar i futsal, fotboll och innebandy\n- Skidresan, oftast till Åre\n\nGemenskapen är viktigare än prestationen – alla nivåer är välkomna.",
    commitment: "Ett par timmar i veckan",
  },
];

let ready = false;

export async function ensureCommitteeSchema(db: D1Database): Promise<void> {
  if (ready) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS committees (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        summary     TEXT NOT NULL DEFAULT '',
        body        TEXT NOT NULL DEFAULT '',
        commitment  TEXT NOT NULL DEFAULT '',
        image_1_key TEXT,
        image_1_alt TEXT NOT NULL DEFAULT '',
        image_2_key TEXT,
        image_2_alt TEXT NOT NULL DEFAULT '',
        image_3_key TEXT,
        image_3_alt TEXT NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        published   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_committees_order ON committees(published, sort_order, id)"),
    ]);
    await importOldList(db);
    ready = true;
  } catch (err) {
    console.error("Kunde inte förbereda tabellen för utskott", err instanceof Error ? err.message : err);
  }
}

/** Flytta över den gamla textlistan en gång. Har styrelsen ändrat listan används deras version. */
async function importOldList(db: D1Database): Promise<void> {
  const done = await db.prepare("SELECT 1 FROM settings WHERE key = ?").bind(IMPORTED).first();
  if (done) return;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM committees").first<{ n: number }>();
  if (!count?.n) {
    const custom = await db.prepare("SELECT value FROM settings WHERE key = 'committees'").first<{ value: string }>();
    const rows = custom?.value
      ? custom.value
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [name, ...rest] = l.split("|");
            const n = (name ?? "").trim();
            const d = DEFAULTS.find((x) => x.name === n);
            // Rader utan beskrivning (bara namnet) får standardtexten om namnet känns igen.
            return { name: n, summary: rest.join("|").trim() || d?.summary || "", body: d?.body ?? "", commitment: d?.commitment ?? "" };
          })
          .filter((r) => r.name)
      : DEFAULTS;
    const used = new Set<string>();
    await db.batch(
      rows.map((r, i) => {
        let slug = slugify(r.name);
        while (used.has(slug)) slug += "-2";
        used.add(slug);
        return db
          .prepare("INSERT OR IGNORE INTO committees (name, slug, summary, body, commitment, sort_order) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(r.name.slice(0, 100), slug, r.summary.slice(0, 300), r.body, r.commitment.slice(0, 120), (i + 1) * 10);
      }),
    );
  }
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").bind(IMPORTED).run();
}

/** Publicerade utskott i vald ordning. Fel (t.ex. en databas som inte svarar) ger en tom lista. */
export async function loadCommittees(db: D1Database): Promise<CommitteeRow[]> {
  await ensureCommitteeSchema(db);
  try {
    const { results } = await db.prepare("SELECT * FROM committees WHERE published = 1 ORDER BY sort_order, id").all<CommitteeRow>();
    return results;
  } catch {
    return [];
  }
}

/** Bilderna för ett utskott, i ordning. */
export function committeeImages(c: CommitteeRow): { key: string; alt: string }[] {
  return [
    { key: c.image_1_key, alt: c.image_1_alt },
    { key: c.image_2_key, alt: c.image_2_alt },
    { key: c.image_3_key, alt: c.image_3_alt },
  ].filter((i): i is { key: string; alt: string } => Boolean(i.key));
}

/** Anslagsbilden – eller bild 1 om ingen anslagsbild är vald. */
export function committeeCover(c: CommitteeRow): { key: string; alt: string } | null {
  if (c.cover_key) return { key: c.cover_key, alt: c.cover_alt ?? "" };
  if (c.image_1_key) return { key: c.image_1_key, alt: c.image_1_alt };
  return null;
}

/** Valen för "Vad ska alltid synas?" och var bilden då beskärs (CSS object-position). */
export const COVER_FOCUS: Record<string, { label: string; position: string }> = {
  mitten: { label: "Mitten av bilden", position: "50% 50%" },
  upptill: { label: "Övre delen (t.ex. ansikten i en gruppbild)", position: "50% 22%" },
  nertill: { label: "Nedre delen", position: "50% 80%" },
  vanster: { label: "Vänster sida", position: "22% 50%" },
  hoger: { label: "Höger sida", position: "78% 50%" },
};

export function coverFocus(c: CommitteeRow): string {
  return COVER_FOCUS[c.cover_focus ?? ""] ? c.cover_focus! : "mitten";
}

/**
 * Publicerade medlemmar för alla utskott (eller ett), i ordning: utskott, år (nyast först), ordning.
 * Tål att tabellen saknas (koden publicerad före migreringen) – då finns inga medlemmar.
 */
export async function loadCommitteeMembers(db: D1Database, committeeId?: number): Promise<CommitteeMemberRow[]> {
  try {
    const where = committeeId ? "WHERE published = 1 AND committee_id = ?" : "WHERE published = 1";
    const stmt = db.prepare(`SELECT * FROM committee_members ${where} ORDER BY committee_id, year DESC, sort_order, id`);
    return (await (committeeId ? stmt.bind(committeeId) : stmt).all<CommitteeMemberRow>()).results;
  } catch {
    return [];
  }
}

/** Ordföranden bland årets medlemmar: den första vars roll är ordförande (inte vice). */
export function chairOf(members: CommitteeMemberRow[]): CommitteeMemberRow | null {
  return members.find((m) => /ordf/i.test(m.role) && !/vice/i.test(m.role)) ?? null;
}

/** Årets medlemmar per utskott (för korten på Om oss). */
export function currentMembersBy(members: CommitteeMemberRow[], year: string): Map<number, CommitteeMemberRow[]> {
  const map = new Map<number, CommitteeMemberRow[]>();
  for (const m of splitByYear(members, year).current) {
    if (!map.has(m.committee_id)) map.set(m.committee_id, []);
    map.get(m.committee_id)!.push(m);
  }
  return map;
}
