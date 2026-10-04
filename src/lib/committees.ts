import { slugify } from "./slug.js";

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
  sort_order: number;
  published: number;
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
            return { name: n, summary: rest.join("|").trim(), body: d?.body ?? "", commitment: d?.commitment ?? "" };
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
