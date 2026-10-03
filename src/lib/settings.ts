import { isHex, readableOn } from "./color.js";

/**
 * Alla redigerbara texter och inställningar med standardvärden.
 * Databasen (tabellen settings) skriver över dessa. En nyckel som saknas i databasen
 * får alltså alltid ett vettigt värde härifrån.
 *
 * Ny text på sajten? Lägg till en nyckel här OCH ett fält i SETTINGS_GROUPS nedan,
 * så blir den redigerbar i adminpanelen under "Redigera texter".
 */
export const DEFAULT_SETTINGS = {
  // ── Allmänt ──
  site_name: "Juridiska Föreningen i Karlstad",
  site_short_name: "JFK",
  site_description:
    "Juridiska Föreningen i Karlstad (JFK) är studentföreningen för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.",
  logo_key: "",

  // ── Länkar ──
  hitract_url: "https://open.hitract.se/HitClub/645",
  instagram_url: "https://www.instagram.com/jfkarlstad/",
  instagram_handle: "@jfkarlstad",
  instagram_sport_url: "https://www.instagram.com/jfk_idrott/",
  instagram_sport_handle: "@jfk_idrott",

  // ── Kontakt ──
  contact_email: "informationsansvarig@jfkarlstad.se",
  contact_phone: "073-523 56 89",
  address_street: "Universitetsgatan 2",
  address_city: "651 88 Karlstad",
  org_number: "",

  // ── Startsidan ──
  hero_title: "Välkommen till Juridiska Föreningen i Karlstad",
  hero_subtitle:
    "Studentföreningen för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.",
  hero_button_label: "Bli medlem",
  hero_secondary_label: "Läs mer om oss",
  hero_image_key: "",
  hero_image_alt: "",
  partners_lead:
    "Tack vare våra partners kan vi erbjuda föreläsningar, arbetsmarknadsdagar och evenemang som för dig närmare arbetslivet.",
  values_title: "Mer än en studentförening",
  value_1_title: "Nätverk",
  value_1_text: "Lär känna studenter från alla terminer – och jurister som redan är där du vill vara.",
  value_2_title: "Karriär",
  value_2_text: "Arbetsmarknadsdagar, lunchföreläsningar och nära kontakt med några av Sveriges ledande byråer.",
  value_3_title: "Studentliv",
  value_3_text: "Inspark, sittningar, banketter och idrott. Det som gör studietiden till mer än tentor.",
  intro_title: "Vilka är JFK?",
  intro_text:
    "Juridiska Föreningen i Karlstad är en partipolitiskt och religiöst obunden ideell studentförening, grundad 2011. Vi finns till för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Handelshögskolan på Karlstads universitet.\n\nVi bevakar utbildningens kvalitet, skapar kontakter med framtida arbetsgivare och ordnar allt från föreläsningar och arbetsmarknadsdagar till sittningar och idrott – så att du får de bästa förutsättningarna både i studierna och i studentlivet.",
  intro_image_key: "",
  intro_image_alt: "",
  stat_1_value: "2011",
  stat_1_label: "grundades JFK",
  stat_2_value: "ca 400",
  stat_2_label: "medlemmar",
  stat_3_value: "13",
  stat_3_label: "i styrelsen",
  stat_4_value: "6",
  stat_4_label: "utskott",
  paverka_title: "Något som borde bli bättre?",
  paverka_text:
    "Med JF Påverka kan du lämna synpunkter på utbildningen och föreningen, rapportera problem eller föreslå ett eget initiativ. Allt tas upp på nästa styrelsemöte – och du kan vara anonym.",

  // ── Om oss ──
  about_lead: "En ideell studentförening av och för juriststudenter vid Karlstads universitet – sedan 2011.",
  about_text:
    "Juridiska Föreningen i Karlstad (JFK) är en partipolitiskt och religiöst obunden ideell studentförening som grundades 2011. Med omkring 400 medlemmar är vi föreningen för alla som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.\n\nVi har tre huvuduppgifter: att bevaka och utveckla utbildningens kvalitet, att skapa kontakter mellan studenter och framtida arbetsgivare och att erbjuda ett rikt studentliv – med allt från idrott och föreläsningar till sittningar och banketter.",
  governance_text:
    "Föreningen leds av en styrelse med 13 ledamöter som väljs av medlemmarna på årsmötet varje år. Styrelsen ansvarar för föreningens löpande arbete och ekonomi och företräder JFK mot universitetet, samarbetspartners och andra föreningar.\n\nFör att arbetet ska bli effektivt – och för att fler medlemmar ska kunna engagera sig – kan styrelsen inrätta utskott. Alla ordinarie medlemmar kan väljas in i ett utskott.",
  committees:
    "Utbildningsutskottet\nArbetsmarknadsutskottet\nKommunikationsutskottet\nEvenemangsutskottet\nEkonomiutskottet\nIdrottsutskottet",
  inspector_text:
    "Föreningens inspektor är Nick Dimitrievski, universitetslektor i skatterätt. Inspektorn är en länk mellan föreningen och universitetet och ska vara disputerad jurist och anställd vid Karlstads universitet. Uppdraget gäller normalt i tre år.",
  honors_text:
    "Hedersmedlemskap är en särskild utmärkelse som tilldelas personer som genom sitt engagemang och sina insatser har haft en djupgående påverkan på föreningen.",
  rewards_text:
    "År 2025 införde JFK ett akademiskt belöningssystem, inspirerat av andra juridiska föreningar och av europeiska kungahus. Systemet består av ordnar och medaljer som uppmärksammar medlemmar som har gjort betydande insatser för föreningen.",
  pedagog_text:
    "Varje år delar JFK ut priset Årets pedagog till en lärare vid Karlstads universitet som på ett föredömligt sätt har främjat studenternas lärande.",
  collab_text:
    "Utöver våra samarbetspartners i näringslivet är JFK en del av två nätverk för juriststudenter – nationellt och internationellt.",
  juro_text:
    "Juridiska Studentföreningars Riksorganisation grundades den 2 oktober 1993 och samlar de juridiska studentföreningarna vid lärosäten som ger juristexamen. JURO samordnar studentfrågor och driver utbildningspolitiska frågor på nationell nivå.",
  elsa_text:
    "Den lokala avdelningen av European Law Students' Association. ELSA ordnar bland annat föreläsningar i juridisk engelska, ELSA Law Schools – sommar- och vinterkurser på en till två veckor – och STEP, ett utbytesprogram för praktik utomlands.",

  // ── Bli medlem ──
  member_lead: "Som medlem får du en stark social och professionell gemenskap under hela studietiden.",
  member_benefits:
    "Sittningar, banketter och andra sociala evenemang\nArbetsmarknadsdagar och lunchföreläsningar med byråer och myndigheter\nStudiestödjande aktiviteter och inspirerande föreläsningar\nEtt nätverk av studenter och jurister som håller långt efter examen\nMöjlighet att engagera dig i styrelsen och utskotten\nInflytande över din utbildning",
  member_price: "",

  // ── För studenter ──
  students_lead: "Allt du behöver veta om studierna, kursombuden, idrotten och livet runt omkring.",
  study_text:
    "Juristprogrammet och masterprogrammet i skatterätt ges vid Handelshögskolan på Karlstads universitet. Kursplaner, scheman och information om tentor hittar du på universitetets webbplats och i lärplattformen.\n\nHar du frågor om dina studier kan du alltid vända dig till studievägledningen. Vill du påverka utbildningen är JFK:s utbildningsansvariga och kursombuden din väg in.",
  study_link: "https://www.kau.se",
  reps_text:
    "Kursombuden är studenternas röst i varje termin. De samlar in synpunkter på kurser och examinationer och för dem vidare till lärare och programledning. Vill du bli kursombud? Hör av dig till utbildningsansvarig.",
  sport_text:
    "Som student är det viktigt att hitta en balans mellan studier och en aktiv livsstil. JFK Idrott vill göra det enkelt och roligt att röra på sig – oavsett nivå. Det viktigaste är gemenskapen, inte prestationen.",
  sport_items:
    "Halltider|Olika sporter varje söndag kl. 16.45–18.00 i universitetshallen.\nSkidresa|Varje vår åker vi på skidresa, oftast till Åre.\nTurneringar|Futsal, fotboll och innebandy mot andra föreningar.\nKAU IF|Studentidrottsföreningen med träning i flera olika idrotter.\nNordic Wellness|Gym på campus med studentpris.",
  gallery_text:
    "Bilder från våra evenemang. Vill du att en bild på dig tas bort? Mejla informationsansvarig@jfkarlstad.se så hjälper vi dig.",

  // ── För företag ──
  companies_lead: "Nå framtidens jurister tidigt – på campus, på våra evenemang och i våra kanaler.",
  companies_text:
    "JFK samlar omkring 400 juriststudenter och masterstudenter i skatterätt vid Karlstads universitet. Som samarbetspartner blir ni en naturlig del av deras studietid – från första terminens inspark till sista terminens examensbankett.",
  companies_benefits:
    "Synlighet på hemsidan, i sociala medier och på våra evenemang\nLunchföreläsningar och case-kvällar på campus\nPlats på vår arbetsmarknadsdag\nSittningar och nätverksträffar med studenter\nAnnonsering av praktikplatser, notarietjänster och jobb",
  package_1_name: "Huvudsamarbetspartner",
  package_1_text: "Vårt mest omfattande samarbete med störst synlighet, flera evenemang per år och en framträdande plats på hemsidan.",
  package_2_name: "Samarbetspartner",
  package_2_text: "Ett långsiktigt samarbete med synlighet i våra kanaler och möjlighet till evenemang under året.",
  package_3_name: "Enskilt evenemang",
  package_3_text: "Lunchföreläsning, case-kväll eller plats på arbetsmarknadsdagen – utan längre åtagande.",
  packages_note: "Kontakta oss för pris och upplägg. Vi anpassar gärna samarbetet efter era mål.",

  // ── JF Påverka ──
  paverka_lead: "Gör din röst hörd i JFK. Lämna synpunkter, rapportera problem eller föreslå ett eget initiativ.",
  paverka_page_text:
    "Allt som skickas in tas upp på nästa styrelsemöte. Du kan välja att vara anonym – då sparar vi varken namn, e-post eller IP-adress.\n\nMed JF Initiativ kan du föreslå ett nytt projekt eller en aktivitet. Om det finns en genomförbar plan och någon som vill leda projektet hjälper styrelsen till med planering och marknadsföring, medan du och ditt team står för det dagliga arbetet.",

  // ── Kontakt ──
  contact_lead: "Har du en fråga om medlemskap, evenemang eller samarbeten? Fyll i formuläret så återkommer vi så snart vi kan.",

  // ── Sidfot ──
  footer_text: "Studentföreningen för juriststudenter och masterstudenter i skatterätt vid Karlstads universitet.",

  // ── Utseende ──
  font_heading: "playfair",
  color_background: "#fff7d6",
  color_accent: "#f1cc4d",
  color_button: "#f1cc4d",
  color_primary: "#141414",
  color_text: "#141414",
  color_surface: "#ffffff",
};

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

/** Fält som visas i adminpanelens "Redigera texter", grupperade per sida. */
export interface SettingField {
  key: SettingKey;
  label: string;
  type: "text" | "textarea" | "url" | "email" | "lines" | "image";
  help?: string;
  required?: boolean;
  /** Bara administratörer får ändra (t.ex. Hitract-länken). */
  adminOnly?: boolean;
}

export interface SettingGroup {
  id: string;
  title: string;
  description?: string;
  fields: SettingField[];
}

export const SETTINGS_GROUPS: SettingGroup[] = [
  {
    id: "lankar",
    title: "Länkar och kontaktuppgifter",
    description: "Visas i sidhuvudet, sidfoten och på kontaktsidan.",
    fields: [
      { key: "hitract_url", label: "Länk till Hitract (Bli medlem)", type: "url", required: true, help: "Alla ”Bli medlem”-knappar går hit och öppnas i en ny flik." },
      { key: "instagram_url", label: "Instagram – länk", type: "url", required: true },
      { key: "instagram_handle", label: "Instagram – visningsnamn", type: "text", required: true },
      { key: "instagram_sport_url", label: "JFK Idrott på Instagram – länk", type: "url" },
      { key: "instagram_sport_handle", label: "JFK Idrott på Instagram – visningsnamn", type: "text" },
      { key: "contact_email", label: "E-postadress", type: "email", required: true },
      { key: "contact_phone", label: "Telefonnummer", type: "text" },
      { key: "address_street", label: "Gatuadress", type: "text", required: true },
      { key: "address_city", label: "Postnummer och ort", type: "text", required: true },
      { key: "org_number", label: "Organisationsnummer", type: "text", help: "Visas i integritetspolicyn." },
    ],
  },
  {
    id: "startsida",
    title: "Startsidan",
    fields: [
      { key: "hero_title", label: "Rubrik överst", type: "text", required: true },
      { key: "hero_subtitle", label: "Text under rubriken", type: "textarea", required: true },
      { key: "hero_button_label", label: "Text på knappen", type: "text", required: true },
      { key: "hero_secondary_label", label: "Text på länken bredvid knappen", type: "text", required: true },
      { key: "hero_image_key", label: "Bild överst", type: "image", help: "Liggande eller stående foto. Utan bild visas en grafisk paragraf-symbol." },
      { key: "hero_image_alt", label: "Bildbeskrivning (alt-text) för bilden överst", type: "text", help: "Beskriv bilden för den som inte kan se den, t.ex. ”Studenter på JFK:s vårbankett”." },
      { key: "partners_lead", label: "Text om samarbetspartners", type: "textarea" },
      { key: "values_title", label: "Rubrik för värdeorden", type: "text", required: true },
      { key: "value_1_title", label: "Värdeord 1 – rubrik", type: "text", required: true },
      { key: "value_1_text", label: "Värdeord 1 – text", type: "textarea", required: true },
      { key: "value_2_title", label: "Värdeord 2 – rubrik", type: "text", required: true },
      { key: "value_2_text", label: "Värdeord 2 – text", type: "textarea", required: true },
      { key: "value_3_title", label: "Värdeord 3 – rubrik", type: "text", required: true },
      { key: "value_3_text", label: "Värdeord 3 – text", type: "textarea", required: true },
      { key: "intro_title", label: "”Vilka är JFK?” – rubrik", type: "text", required: true },
      { key: "intro_text", label: "”Vilka är JFK?” – text", type: "textarea", required: true, help: "Lämna en tom rad mellan styckena." },
      { key: "intro_image_key", label: "”Vilka är JFK?” – bild", type: "image" },
      { key: "intro_image_alt", label: "”Vilka är JFK?” – bildbeskrivning", type: "text" },
      { key: "stat_1_value", label: "Siffra 1", type: "text" },
      { key: "stat_1_label", label: "Siffra 1 – förklaring", type: "text" },
      { key: "stat_2_value", label: "Siffra 2", type: "text" },
      { key: "stat_2_label", label: "Siffra 2 – förklaring", type: "text" },
      { key: "stat_3_value", label: "Siffra 3", type: "text" },
      { key: "stat_3_label", label: "Siffra 3 – förklaring", type: "text" },
      { key: "stat_4_value", label: "Siffra 4", type: "text" },
      { key: "stat_4_label", label: "Siffra 4 – förklaring", type: "text" },
      { key: "paverka_title", label: "JF Påverka – rubrik", type: "text", required: true },
      { key: "paverka_text", label: "JF Påverka – text", type: "textarea", required: true },
    ],
  },
  {
    id: "om-oss",
    title: "Om oss",
    fields: [
      { key: "about_lead", label: "Ingress", type: "textarea" },
      { key: "about_text", label: "Om JFK", type: "textarea" },
      { key: "governance_text", label: "Så styrs JFK", type: "textarea" },
      { key: "committees", label: "Utskott", type: "lines", help: "Ett utskott per rad." },
      { key: "inspector_text", label: "Inspektorn", type: "textarea" },
      { key: "honors_text", label: "Hedersmedlemmar", type: "textarea" },
      { key: "rewards_text", label: "Belöningssystemet", type: "textarea" },
      { key: "pedagog_text", label: "Årets pedagog", type: "textarea" },
      { key: "collab_text", label: "Samarbeten – ingress", type: "textarea" },
      { key: "juro_text", label: "JURO", type: "textarea" },
      { key: "elsa_text", label: "ELSA Karlstad", type: "textarea" },
    ],
  },
  {
    id: "bli-medlem",
    title: "Bli medlem",
    fields: [
      { key: "member_lead", label: "Ingress", type: "textarea" },
      { key: "member_benefits", label: "Förmåner", type: "lines", help: "En förmån per rad." },
      { key: "member_price", label: "Pris (valfritt)", type: "text", help: "T.ex. ”250 kr för hela utbildningen”. Lämna tomt för att inte visa något pris." },
    ],
  },
  {
    id: "for-studenter",
    title: "För studenter",
    fields: [
      { key: "students_lead", label: "Ingress", type: "textarea" },
      { key: "study_text", label: "Studera på KAU", type: "textarea" },
      { key: "study_link", label: "Länk till mer information om studierna", type: "url" },
      { key: "reps_text", label: "Kursombud", type: "textarea" },
      { key: "sport_text", label: "JFK Idrott – text", type: "textarea" },
      { key: "sport_items", label: "JFK Idrott – aktiviteter", type: "lines", help: "En per rad i formatet: Rubrik|Beskrivning" },
      { key: "gallery_text", label: "Bildgalleri – text", type: "textarea" },
    ],
  },
  {
    id: "for-foretag",
    title: "För företag",
    fields: [
      { key: "companies_lead", label: "Ingress", type: "textarea" },
      { key: "companies_text", label: "Text", type: "textarea" },
      { key: "companies_benefits", label: "Det här får ni", type: "lines", help: "En punkt per rad." },
      { key: "package_1_name", label: "Paket 1 – namn", type: "text" },
      { key: "package_1_text", label: "Paket 1 – beskrivning", type: "textarea" },
      { key: "package_2_name", label: "Paket 2 – namn", type: "text" },
      { key: "package_2_text", label: "Paket 2 – beskrivning", type: "textarea" },
      { key: "package_3_name", label: "Paket 3 – namn", type: "text" },
      { key: "package_3_text", label: "Paket 3 – beskrivning", type: "textarea" },
      { key: "packages_note", label: "Text under paketen", type: "textarea" },
    ],
  },
  {
    id: "jf-paverka",
    title: "JF Påverka och Kontakt",
    fields: [
      { key: "paverka_lead", label: "JF Påverka – ingress", type: "textarea" },
      { key: "paverka_page_text", label: "JF Påverka – text", type: "textarea" },
      { key: "contact_lead", label: "Kontakt – ingress", type: "textarea" },
    ],
  },
  {
    id: "allmant",
    title: "Allmänt och sidfot",
    fields: [
      { key: "site_name", label: "Föreningens namn", type: "text", required: true },
      { key: "site_short_name", label: "Förkortning", type: "text", required: true },
      { key: "site_description", label: "Beskrivning för Google och delningar", type: "textarea", required: true, help: "Visas i sökresultat. Håll den under 160 tecken." },
      { key: "footer_text", label: "Text i sidfoten", type: "textarea" },
    ],
  },
];

export const THEME_KEYS = [
  "color_background",
  "color_surface",
  "color_text",
  "color_primary",
  "color_accent",
  "color_button",
] as const satisfies readonly SettingKey[];

/** Valbara rubriktypsnitt. Cormorant har lägre x-höjd och behöver lite större storlek. */
export const HEADING_FONTS = {
  playfair: {
    label: "Playfair Display",
    file: "/assets/fonts/playfair-display.woff2",
    stack: '"Playfair Display","Cormorant Garamond",Georgia,serif',
    scale: "1",
    weight: "600",
  },
  cormorant: {
    label: "Cormorant Garamond",
    file: "/assets/fonts/cormorant-garamond.woff2",
    stack: '"Cormorant Garamond","Playfair Display",Georgia,serif',
    scale: "1.14",
    weight: "600",
  },
} as const;
export type HeadingFont = keyof typeof HEADING_FONTS;

export function headingFont(s: Settings): HeadingFont {
  return s.font_heading === "cormorant" ? "cormorant" : "playfair";
}

export async function loadSettings(db: D1Database): Promise<Settings> {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  try {
    const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
    for (const row of results) {
      if (row.key in settings) settings[row.key as SettingKey] = row.value;
    }
  } catch (err) {
    // Databasen ska aldrig kunna fälla hela sajten – standardvärden räcker för att rendera.
    console.error("Kunde inte läsa inställningar", err);
  }
  return settings;
}

/** Rader ur ett "lines"-fält, utan tomma rader. */
export function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Bygg CSS-variablerna för temat. Ogiltiga färger ersätts med standardvärdet, så inget kan injiceras i CSS. */
export function themeCss(s: Settings): string {
  const pick = (key: (typeof THEME_KEYS)[number]) => (isHex(s[key]) ? s[key] : DEFAULT_SETTINGS[key]).toLowerCase();
  const bg = pick("color_background");
  const surface = pick("color_surface");
  const text = pick("color_text");
  const primary = pick("color_primary");
  const accent = pick("color_accent");
  const button = pick("color_button");
  const font = HEADING_FONTS[headingFont(s)];
  return `:root{--c-bg:${bg};--c-surface:${surface};--c-text:${text};--c-primary:${primary};--c-on-primary:${readableOn(primary)};--c-accent:${accent};--c-on-accent:${readableOn(accent)};--c-button:${button};--c-on-button:${readableOn(button)};--font-display:${font.stack};--display-scale:${font.scale};--display-weight:${font.weight}}`;
}
