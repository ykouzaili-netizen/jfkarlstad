/**
 * Textregistret – alla titlar och texter på webbplatsen, ordnade som webbplatsen själv:
 * sida → avsnitt → fält. Adminpanelens "Texter och sidor" byggs helt från det här registret,
 * så en ny text blir redigerbar genom att den läggs till här och används i sidans mall.
 *
 * - `def` är standardtexten. Databasen (tabellen settings) skriver över den.
 * - `more: true` = sällan ändrade texter (knappar, etiketter, tomma lägen). De döljs bakom
 *   "Visa fler texter" i adminpanelen så att det inte blir plottrigt.
 * - Platshållare i klamrar, t.ex. {namn}, byts ut automatiskt. Se `help` för vilka som finns.
 *
 * Fälttyper:
 *   text      en rad
 *   textarea  stycken (tom rad = nytt stycke)
 *   lines     en sak per rad (listor)
 *   rich      kort text där [länktext](adress) och **fet** fungerar
 *   markdown  längre text med stycken, punktlistor, länkar och underrubriker
 *   url/email länk respektive e-postadress
 *   image     bild (sparas som nyckel till fillagringen)
 *   choice    ett av några fasta val (`options`), t.ex. bildens beskärning
 *   datetime  datum och tid i svensk tid, "ÅÅÅÅ-MM-DDTHH:MM" (tomt = inget datum)
 *   color     en färg "#rrggbb" (tomt = sajtens vanliga färg)
 */

export type FieldType = "text" | "textarea" | "lines" | "rich" | "markdown" | "url" | "email" | "image" | "choice" | "datetime" | "color";

export interface FieldDef<K extends string = string> {
  readonly key: K;
  readonly label: string;
  readonly type: FieldType;
  readonly def: string;
  readonly help?: string;
  readonly required?: boolean;
  readonly more?: boolean;
  /** Valen för typen "choice". */
  readonly options?: readonly { readonly value: string; readonly label: string; readonly hint?: string }[];
}

export interface SectionDef<F extends readonly FieldDef[] = readonly FieldDef[]> {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly fields: F;
}

export interface PageDef<S extends readonly SectionDef[] = readonly SectionDef[]> {
  readonly id: string;
  readonly title: string;
  /** Sidan som visas i förhandsvisningen. */
  readonly path: string;
  readonly hint?: string;
  readonly sections: S;
}

type Opts = { help?: string; required?: boolean; more?: boolean };

const field =
  (type: FieldType) =>
  <const K extends string>(key: K, label: string, def: string, o: Opts = {}): FieldDef<K> => ({ key, label, def, type, ...o });

const text = field("text");
const area = field("textarea");
const list = field("lines");
const rich = field("rich");
const md = field("markdown");
const url = field("url");
const email = field("email");
const image = field("image");
const datetime = field("datetime");
const color = field("color");
const choice = <const K extends string>(key: K, label: string, def: string, options: FieldDef["options"], o: Opts = {}): FieldDef<K> => ({
  key,
  label,
  def,
  type: "choice",
  options,
  ...o,
});

/** Standardinställning för knappar, etiketter och liknande småtexter. */
const small = { more: true, required: true } as const;

function sec<const F extends readonly FieldDef[]>(id: string, title: string, fields: F, hint?: string): SectionDef<F> {
  return { id, title, fields, hint };
}

function page<const S extends readonly SectionDef[]>(id: string, title: string, path: string, sections: S, hint?: string): PageDef<S> {
  return { id, title, path, sections, hint };
}

const RICH_HELP = "Skriv [länktext](adress) för en länk och **text** för fetstil.";
const MD_HELP = "Tom rad = nytt stycke. Rader som börjar med ”- ” blir en punktlista. [länktext](adress) blir en länk.";
const ALT_HELP = "Beskriv vad bilden visar för den som inte kan se den, t.ex. ”Studenter på JFK:s vårbankett”.";

// ───────────────────────────────────────────────────────────────────────────────
//  Sidorna
// ───────────────────────────────────────────────────────────────────────────────

/** Utseendena för toppen på undersidorna (samma som på Om oss, plus "Bara text"). */
const HERO_STYLE_OPTIONS = [
  { value: "enkel", label: "Bara text", hint: "Rubrik och ingress utan bilder – lugnt och tydligt" },
  { value: "kollage", label: "Kollage", hint: "Rubriken till vänster, bilderna i ett kollage till höger" },
  { value: "bildband", label: "Bildband", hint: "Centrerad rubrik med bilderna på rad under" },
  { value: "fotostapel", label: "Fotostapel", hint: "Lutande foton med vit ram, som utlagda kort" },
  { value: "helbild", label: "Helbild", hint: "Bild 1 täcker hela toppen och texten ligger ovanpå" },
  { value: "delad", label: "Delad yta", hint: "Gul halva med texten och bilderna i den andra halvan" },
] as const;

/**
 * Utseende och bilder för toppen på en undersida. `p` är sidans prefix, t.ex. "member" → member_hero_style,
 * member_image_1 … Läses av `pageHeader()` i views/page.ts.
 */
function heroFields<const P extends string>(p: P) {
  return [
    choice(`${p}_hero_style` as `${P}_hero_style`, "Utseende", "standard", [
      { value: "standard", label: "Som de andra sidorna", hint: "Följer valet under Gemensamt → Sidornas topp" },
      ...HERO_STYLE_OPTIONS,
    ], { required: true, help: "Utseenden med bilder kräver minst en bild nedan – annars visas bara texten." }),
    image(`${p}_image_1` as `${P}_image_1`, "Bild 1 (huvudbild)", "", { help: "Används i alla utseenden med bilder. I Helbild täcker den hela toppen – välj gärna en lugn eller mörk bild." }),
    text(`${p}_image_1_alt` as `${P}_image_1_alt`, "Bild 1 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
    image(`${p}_image_2` as `${P}_image_2`, "Bild 2", "", { more: true }),
    text(`${p}_image_2_alt` as `${P}_image_2_alt`, "Bild 2 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
    image(`${p}_image_3` as `${P}_image_3`, "Bild 3", "", { more: true }),
    text(`${p}_image_3_alt` as `${P}_image_3_alt`, "Bild 3 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
  ] as const;
}

export const PAGES = [
  page("startsida", "Startsidan", "/", [
    sec("toppen", "Toppen av sidan", [
      text("hero_eyebrow", "Liten etikett ovanför rubriken", "Juridik & skatterätt vid Karlstads universitet", { more: true }),
      text("hero_title", "Rubrik", "Välkommen till Juridiska Föreningen i Karlstad", { required: true }),
      area("hero_subtitle", "Text under rubriken", "Studentföreningen för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.", { required: true }),
      text("hero_button_label", "Text på den stora knappen", "Bli medlem", small),
      text("hero_secondary_label", "Text på länken bredvid knappen", "Läs mer om oss", small),
      image("hero_image_key", "Bakgrundsbild", "", {
        help: "Fyller hela toppen av startsidan. Välj ett liggande foto med mycket stämning, gärna minst 2000 px brett – t.ex. från en sittning eller campus. Utan bild visas en mörk grafisk bakgrund.",
      }),
      text("hero_image_alt", "Bildbeskrivning", "", { help: ALT_HELP }),
      choice("hero_image_position", "Vilken del av bilden ska synas bäst?", "center", [
        { value: "top", label: "Övre delen", hint: "T.ex. när ansikten är högt upp i bilden" },
        { value: "center", label: "Mitten" },
        { value: "bottom", label: "Nedre delen" },
      ], { required: true, help: "Bilden beskärs olika på dator och mobil. Välj den del som är viktigast." }),
      choice("hero_overlay", "Mörk ton över bilden", "medel", [
        { value: "svag", label: "Svag", hint: "För mörka bilder" },
        { value: "medel", label: "Medel" },
        { value: "stark", label: "Stark", hint: "För ljusa bilder – gör texten lättare att läsa" },
      ], { required: true }),
      choice("hero_text_align", "Textens placering i sidled", "vanster", [
        { value: "vanster", label: "Till vänster" },
        { value: "mitten", label: "I mitten", hint: "Rubrik, text och knappar centreras" },
        { value: "hoger", label: "Till höger" },
      ], { required: true }),
      choice("hero_text_vertical", "Textens placering i höjdled", "nere", [
        { value: "nere", label: "Nere", hint: "Lämnar mer av bilden synlig" },
        { value: "mitten", label: "I mitten av bilden" },
      ], { required: true }),
      text("hero_next_label", "Etikett på rutan med nästa evenemang", "Nästa evenemang", small),
      text("hero_scroll", "Text vid pilen längst ned", "Scrolla vidare", small),
    ]),
    sec("partners", "Samarbetspartners", [
      text("home_partners_title", "Rubrik", "Våra samarbetspartners", { required: true }),
      area("partners_lead", "Text", "Tack vare våra partners kan vi erbjuda föreläsningar, arbetsmarknadsdagar och evenemang som för dig närmare arbetslivet."),
      text("home_partners_all", "Länk till alla partners", "Alla partners", small),
      text("home_partners_strip", "Etikett för övriga partners", "Samarbetspartners", small),
      text("home_partners_jobs", "Länk till lediga jobb", "Lediga jobb och praktik", small),
    ], "Partnerna själva ändrar du under Partners i menyn."),
    sec("varden", "Värdeorden", [
      text("values_title", "Rubrik", "Mer än en studentförening", { required: true }),
      text("value_1_title", "Värdeord 1 – rubrik", "Nätverk", { required: true }),
      area("value_1_text", "Värdeord 1 – text", "Lär känna studenter från alla terminer – och jurister som redan är där du vill vara.", { required: true }),
      text("value_2_title", "Värdeord 2 – rubrik", "Karriär", { required: true }),
      area("value_2_text", "Värdeord 2 – text", "Arbetsmarknadsdagar, lunchföreläsningar och nära kontakt med några av Sveriges ledande byråer.", { required: true }),
      text("value_3_title", "Värdeord 3 – rubrik", "Studentliv", { required: true }),
      area("value_3_text", "Värdeord 3 – text", "Inspark, sittningar, banketter och idrott. Det som gör studietiden till mer än tentor.", { required: true }),
    ]),
    sec("ordband", "Rullande ord", [
      choice("wordband_style", "Utseende", "rullband", [
        { value: "rullband", label: "Rullande rader", hint: "Två rader med stora ord som glider åt var sitt håll när man skrollar" },
        { value: "ordbyte", label: "Ordbyte", hint: "”JFK står för …” – det sista ordet byts ut av sig självt, som på en avgångstavla" },
        { value: "stralkastare", label: "Strålkastare", hint: "Orden står under varandra och lyser upp ett i taget medan man skrollar" },
        { value: "paragraf", label: "Paragrafen", hint: "Som en lagtext: ”1 § JFK står för …” – orden skrivs ut som på en skrivmaskin" },
      ], { required: true, help: "Rörelsen syns på webbplatsen men inte i förhandsvisningen här bredvid." }),
      list("wordband_words", "Orden", "Juridik\nGemenskap\nKarriär\nSkatterätt\nNätverk\nPåverkan", {
        required: true,
        help: "Ett ord eller ett kort uttryck per rad, gärna 4–8 stycken.",
      }),
      choice("wordband_size", "Textstorlek", "standard", [
        { value: "liten", label: "Liten" },
        { value: "mindre", label: "Lite mindre" },
        { value: "standard", label: "Standard" },
        { value: "storre", label: "Lite större" },
        { value: "stor", label: "Stor" },
      ], { required: true }),
      color("wordband_c_bg", "Färg: bakgrund", "", { help: "Alla färgfälten är valfria – tomt (”Standard”) = sajtens vanliga färg. Väljer du bara bakgrund får orden automatiskt svart eller vit färg som syns bra." }),
      color("wordband_c_text", "Färg: orden", ""),
      color("wordband_c_accent", "Färg: §-tecken och detaljer", "", { help: "Paragraftecknen, linjen under ordet i Ordbyte, numren i Strålkastare och markören i Paragrafen." }),
      text("wordband_lead", "Text före orden", "JFK står för", { more: true, help: "Används i Ordbyte och Paragrafen, t.ex. ”JFK står för” eller ”Hos oss hittar du”." }),
    ], "Stora ord som blickfång mellan avsnitten. Vill ni inte ha dem döljer ni avsnittet."),
    sec("intro", "”Vilka är JFK?”", [
      text("intro_title", "Rubrik", "Vilka är JFK?", { required: true }),
      area("intro_text", "Text", "Juridiska Föreningen i Karlstad är en partipolitiskt och religiöst obunden ideell studentförening, grundad 2011. Vi finns till för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Handelshögskolan på Karlstads universitet.\n\nVi bevakar utbildningens kvalitet, skapar kontakter med framtida arbetsgivare och ordnar allt från föreläsningar och arbetsmarknadsdagar till sittningar och idrott – så att du får de bästa förutsättningarna både i studierna och i studentlivet.", { required: true, help: "Lämna en tom rad mellan styckena." }),
      text("intro_link", "Länk under texten", "Läs mer om oss", small),
      image("intro_image_key", "Bild", ""),
      text("intro_image_alt", "Bildbeskrivning", "", { help: ALT_HELP }),
      text("stat_1_value", "Siffra 1", "2011"),
      text("stat_1_label", "Siffra 1 – förklaring", "grundades JFK"),
      text("stat_2_value", "Siffra 2", "ca 400"),
      text("stat_2_label", "Siffra 2 – förklaring", "medlemmar"),
      text("stat_3_value", "Siffra 3", "13"),
      text("stat_3_label", "Siffra 3 – förklaring", "i styrelsen"),
      text("stat_4_value", "Siffra 4", "6"),
      text("stat_4_label", "Siffra 4 – förklaring", "utskott"),
    ]),
    sec("evenemang", "Kommande evenemang", [
      text("home_events_title", "Rubrik", "Kommande evenemang", { required: true }),
      text("home_events_link", "Länk till kalendern", "Se hela kalendern", small),
      rich("home_events_empty", "Text när inga evenemang finns", "Inga evenemang är inlagda just nu. Följ oss på [Instagram](https://www.instagram.com/jfkarlstad/) så missar du inget.", { more: true, help: RICH_HELP }),
    ], "Själva evenemangen lägger du in under Event i menyn."),
    sec("nyheter", "Senaste nytt", [
      text("home_news_title", "Rubrik", "Senaste nytt", { required: true }),
      text("home_news_link", "Länk till alla nyheter", "Alla nyheter", small),
      text("home_news_empty", "Text när inga nyheter finns", "Inga nyheter ännu.", { more: true }),
    ], "Nyheterna skriver du under Nyheter i menyn."),
    sec("paverka", "JF Påverka-rutan", [
      text("home_paverka_kicker", "Liten etikett", "JF Påverka", small),
      text("paverka_title", "Rubrik", "Något som borde bli bättre?", { required: true }),
      area("paverka_text", "Text", "Med JF Påverka kan du lämna synpunkter på utbildningen och föreningen, rapportera problem eller föreslå ett eget initiativ. Allt tas upp på nästa styrelsemöte – och du kan vara anonym.", { required: true }),
      text("home_paverka_button", "Text på knappen", "Gör din röst hörd", small),
      text("home_paverka_note", "Liten text under knappen", "Du kan vara anonym", { more: true }),
    ]),
    sec("instagram", "Instagram", [
      text("home_insta_title", "Rubrik", "Följ oss på Instagram", { required: true }),
      area("home_insta_text", "Text", "Bilder från sittningar, inspark och arbetsmarknadsdagar – och alla nyheter först."),
      text("insta_follow_label", "Knapp", "Följ oss", { ...small, help: "Kontots namn (t.ex. @jfkarlstad) läggs till automatiskt efter texten." }),
      choice("insta_style", "Utseende", "karusell", [
        { value: "karusell", label: "Bildspel", hint: "Profilen överst och inläggen i ett bildspel som man bläddrar i sidled" },
        { value: "band", label: "Mörkt band", hint: "Profil och knapp till vänster, bildspelet till höger på mörk bakgrund" },
        { value: "rutnat", label: "Rutnät", hint: "Som en Instagramprofil: profilen överst och inläggen i tre kolumner" },
        { value: "mosaik", label: "Mosaik", hint: "Det senaste inlägget stort, de andra mindre runt omkring" },
      ], { required: true }),
      choice("insta_size", "Storlek på bilderna", "medel", [
        { value: "liten", label: "Små", hint: "Fler inlägg syns samtidigt" },
        { value: "medel", label: "Mellan" },
        { value: "stor", label: "Stora", hint: "Färre men större bilder" },
      ], { required: true }),
      choice("insta_shape", "Bildformat", "kvadrat", [
        { value: "kvadrat", label: "Kvadratiska", hint: "Som i Instagrams rutnät" },
        { value: "staende", label: "Stående (4:5)", hint: "Som inlägg i flödet" },
      ], { required: true }),
      choice("insta_count", "Antal inlägg", "8", [
        { value: "4", label: "4" },
        { value: "6", label: "6" },
        { value: "8", label: "8" },
        { value: "12", label: "12" },
      ], { required: true }),
      choice("insta_background", "Bakgrund", "ljus", [
        { value: "ljus", label: "Ljus", hint: "Sidans bakgrundsfärg" },
        { value: "yta", label: "Vit yta" },
        { value: "gul", label: "Gul" },
        { value: "mork", label: "Mörk" },
      ], { required: true, help: "Utseendet Mörkt band har alltid mörk bakgrund på själva bandet." }),
      choice("insta_captions", "Bildtexter", "hover", [
        { value: "hover", label: "När man pekar på bilden", hint: "Rent och luftigt – bildtexten syns vid hovring eller fokus" },
        { value: "under", label: "Under bilden", hint: "De första raderna syns alltid" },
        { value: "dolda", label: "Visa inte" },
      ], { required: true }),
      choice("insta_profile", "Profilrutan", "visa", [
        { value: "visa", label: "Visa", hint: "Profilbild, namn, presentation och knappen Följ" },
        { value: "dolj", label: "Visa bara rubrik och text" },
      ], { required: true }),
      choice("insta_autoplay", "Rörelse", "rullar", [
        { value: "rullar", label: "Rullar hela tiden", hint: "Inläggen glider sakta från höger till vänster. Stannar när man pekar på ett inlägg, som då lyfts fram" },
        { value: "av", label: "Står still", hint: "Besökaren bläddrar själv med pilarna" },
        { value: "pa", label: "Bläddrar var 5:e sekund", hint: "Hoppar fram ett steg i taget" },
      ], { required: true, help: "Gäller utseendena Bildspel och Mörkt band. Den som valt minskad rörelse i sin dator eller mobil ser alltid inläggen stilla." }),
      choice("insta_speed", "Hastighet när inläggen rullar", "medel", [
        { value: "lugn", label: "Lugn" },
        { value: "medel", label: "Mellan" },
        { value: "snabb", label: "Snabbare" },
      ], { required: true }),
      text("insta_profile_name", "Profilens namn", "Juridiska Föreningen i Karlstad", { more: true }),
      area("insta_profile_bio", "Profilens presentation", "Studentföreningen för juriststudenter och masterstudenter i skatterätt vid Karlstads universitet.", { more: true }),
      image("insta_avatar", "Profilbild", "", { more: true, help: "Valfri. Hämtas automatiskt från Instagram när den automatiska hämtningen är på – annars visas logotypen." }),
      text("insta_posts_label", "Etikett: inlägg", "inlägg", { ...small, help: "Visas efter antalet inlägg när den automatiska hämtningen är på." }),
      text("insta_followers_label", "Etikett: följare", "följare", small),
      text("insta_empty", "Text när inga inlägg finns", "Inläggen visas här snart.", { more: true }),
      text("insta_pause", "Knapp: pausa", "Pausa", small),
      text("insta_play", "Knapp: spela", "Spela", small),
    ], "Inläggen lägger du till under Instagram i menyn till vänster. Länken och kontonamnet ändrar du under Gemensamt → Kontaktuppgifter och länkar."),
  ]),

  page("om-oss", "Om oss", "/om-oss", [
    sec("topp", "Sidans topp", [
      text("about_kicker", "Liten etikett ovanför rubriken", "Om oss", small),
      text("about_title", "Rubrik", "Om Juridiska Föreningen i Karlstad", { required: true }),
      area("about_lead", "Ingress", "En ideell studentförening av och för juriststudenter vid Karlstads universitet – sedan 2011."),
      text("about_cta_engage", "Knapp till Engagera dig", "Engagera dig", small),
      choice("about_hero_style", "Utseende", "kollage", [
        { value: "kollage", label: "Kollage", hint: "Rubriken till vänster, tre bilder i ett kollage till höger" },
        { value: "bildband", label: "Bildband", hint: "Centrerad rubrik med tre bilder på rad under" },
        { value: "fotostapel", label: "Fotostapel", hint: "Tre lutande foton med vit ram, som utlagda kort" },
        { value: "helbild", label: "Helbild", hint: "Bild 1 täcker hela toppen och texten ligger ovanpå. Välj en mörk eller lugn bild." },
        { value: "delad", label: "Delad yta", hint: "Gul halva med texten och bilderna i den andra halvan" },
      ], { required: true, help: "Bilderna nedan används i alla utseenden. Helbild visar bara bild 1." }),
      image("about_image_1", "Bild 1 (den stora)", "", { help: "Huvudbilden. I kollaget är den hög och smal, i Helbild täcker den hela toppen. Utan bilder visas grafiska rutor i föreningens färger." }),
      text("about_image_1_alt", "Bild 1 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("about_image_2", "Bild 2", ""),
      text("about_image_2_alt", "Bild 2 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("about_image_3", "Bild 3", ""),
      text("about_image_3_alt", "Bild 3 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ]),
    sec("om", "Om JFK", [
      area("about_text", "Text", "Juridiska Föreningen i Karlstad (JFK) är en partipolitiskt och religiöst obunden ideell studentförening som grundades 2011. Med omkring 400 medlemmar är vi föreningen för alla som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.\n\nVi har tre huvuduppgifter: att bevaka och utveckla utbildningens kvalitet, att skapa kontakter mellan studenter och framtida arbetsgivare och att erbjuda ett rikt studentliv – med allt från idrott och föreläsningar till sittningar och banketter."),
      text("about_docs_title", "Rutan om dokument – rubrik", "Dokument och protokoll"),
      area("about_docs_text", "Rutan om dokument – text", "Stadgar, styrdokument och protokoll från styrelsemöten och årsmöten finns samlade på ett ställe."),
      text("about_docs_link", "Rutan om dokument – länk", "Till dokumenten", small),
      text("about_section_title", "Rubrik (syns i menyn under toppen)", "Om JFK", small),
      image("about_image", "Bild bredvid texten", "", { help: "Liggande foto, t.ex. från en föreläsning eller arbetsmarknadsdagen." }),
      text("about_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ], "Siffrorna under texten är samma som på startsidan och ändras under Startsidan › ”Vilka är JFK?”."),
    sec("styrning", "Så styrs JFK", [
      text("governance_title", "Rubrik", "Så styrs JFK", { required: true }),
      area("governance_text", "Text", "Föreningen leds av en styrelse med 13 ledamöter som väljs av medlemmarna på årsmötet varje år. Styrelsen ansvarar för föreningens löpande arbete och ekonomi och företräder JFK mot universitetet, samarbetspartners och andra föreningar.\n\nFör att arbetet ska bli effektivt – och för att fler medlemmar ska kunna engagera sig – kan styrelsen inrätta utskott. Alla ordinarie medlemmar kan väljas in i ett utskott."),
      text("inspector_title", "Rubrik för inspektorn", "Inspektorn", small),
      area("inspector_text", "Inspektorn", "Föreningens inspektor är Nick Dimitrievski, universitetslektor i skatterätt. Inspektorn är en länk mellan föreningen och universitetet och ska vara disputerad jurist och anställd vid Karlstads universitet. Uppdraget gäller normalt i tre år."),
      image("inspector_image", "Foto på inspektorn", "", { help: "Valfritt. Ladda bara upp ett foto om inspektorn har sagt ja till det." }),
    ]),
    sec("styrelsen", "Styrelsen", [
      text("board_title", "Rubrik", "Styrelsen", { required: true }),
      area("board_lead", "Text", "Har du en fråga till någon i styrelsen? Mejla direkt – vi svarar så snart vi kan."),
      text("board_empty", "Text när styrelsen saknas", "Styrelsen presenteras snart.", { more: true }),
    ], "Personerna i styrelsen ändrar du under Styrelsen i menyn."),
    sec("utskott", "Utskotten", [
      text("committees_title", "Rubrik", "Utskotten", { required: true }),
      area("committees_lead", "Text", "Det är i utskotten mycket av föreningens arbete händer. Här planerar medlemmar evenemang, driver utbildningsfrågor och bygger kontakter med arbetslivet – tillsammans med styrelsen."),
      choice("committees_style", "Utseende", "mork", [
        { value: "mork", label: "Mörk med bild", hint: "Mörk yta med bakgrundsbilden tonad bakom korten" },
        { value: "gul", label: "Gul lista", hint: "Ett utskott per rad på gul bakgrund – luftigt och lättläst" },
        { value: "ljusa", label: "Ljusa kort", hint: "Ljusa kort med utskottets begynnelsebokstav stort i svart eller gult" },
        { value: "karusell", label: "Karusell", hint: "Mörka kort som man bläddrar mellan i sidled" },
      ], { required: true }),
      image("committees_image", "Bakgrundsbild", "", { help: "Valfritt. Visas tonad i mörkt bakom utskotten i utseendena Mörk med bild och Karusell, t.ex. en gruppbild från ett utskottsmöte." }),
      text("committees_cta_title", "Sista rutan – rubrik", "Vill du vara med?"),
      area("committees_cta_text", "Sista rutan – text", "Alla ordinarie medlemmar kan väljas in i ett utskott. Anmäl ditt intresse så hör vi av oss."),
      text("committees_cta_button", "Sista rutan – knapp", "Engagera dig", small),
      text("committees_read_more", "Länk på varje utskott", "Läs mer", small),
    ], "Utskotten själva – namn, beskrivning och bilder – ändrar du under Styrelse och uppdrag → Utskott i menyn."),
    sec("utmarkelser", "Hedersmedlemmar och utmärkelser", [
      text("honors_title", "Rubrik", "Hedersmedlemmar och utmärkelser", { required: true }),
      area("honors_text", "Text", "Hedersmedlemskap är en särskild utmärkelse som tilldelas personer som genom sitt engagemang och sina insatser har haft en djupgående påverkan på föreningen."),
      text("rewards_title", "Rutan om belöningssystemet – rubrik", "Belöningssystemet"),
      area("rewards_text", "Rutan om belöningssystemet – text", "År 2025 införde JFK ett akademiskt belöningssystem, inspirerat av andra juridiska föreningar och av europeiska kungahus. Systemet består av ordnar och medaljer som uppmärksammar medlemmar som har gjort betydande insatser för föreningen."),
      text("honors_members_title", "Underrubrik för hedersmedlemmar", "Hedersmedlemmar", small),
      text("honors_members_empty", "Text när inga hedersmedlemmar finns", "Hedersmedlemmarna presenteras här inom kort.", { more: true }),
      text("honors_awards_title", "Underrubrik för utmärkelser", "Utdelade utmärkelser", small),
    ]),
    sec("pedagog", "Årets pedagog", [
      text("pedagog_title", "Rubrik", "Årets pedagog", { required: true }),
      area("pedagog_text", "Text", "Varje år delar JFK ut priset Årets pedagog till en lärare vid Karlstads universitet som på ett föredömligt sätt har främjat studenternas lärande."),
      text("pedagog_empty", "Text när inga pristagare finns", "Pristagarna presenteras här inom kort.", { more: true }),
    ]),
    sec("samarbeten", "Samarbeten", [
      text("collab_title", "Rubrik", "Samarbeten", { required: true }),
      area("collab_text", "Ingress", "Utöver våra samarbetspartners i näringslivet är JFK en del av två nätverk för juriststudenter – nationellt och internationellt."),
      text("collab_link", "Länk till partners", "Alla samarbetspartners", small),
      text("juro_kicker", "JURO – etikett", "Nationellt", { more: true }),
      text("juro_title", "JURO – rubrik", "JURO"),
      image("juro_image", "JURO – bild eller logotyp", "", { more: true }),
      area("juro_text", "JURO – text", "Juridiska Studentföreningars Riksorganisation grundades den 2 oktober 1993 och samlar de juridiska studentföreningarna vid lärosäten som ger juristexamen. JURO samordnar studentfrågor och driver utbildningspolitiska frågor på nationell nivå."),
      text("elsa_kicker", "ELSA – etikett", "Internationellt", { more: true }),
      text("elsa_title", "ELSA – rubrik", "ELSA Karlstad"),
      image("elsa_image", "ELSA – bild eller logotyp", "", { more: true }),
      area("elsa_text", "ELSA – text", "Den lokala avdelningen av European Law Students' Association. ELSA ordnar bland annat föreläsningar i juridisk engelska, ELSA Law Schools – sommar- och vinterkurser på en till två veckor – och STEP, ett utbytesprogram för praktik utomlands."),
    ]),
  ]),

  page("bli-medlem", "Bli medlem", "/bli-medlem", [
    sec("topp", "Sidans topp", [
      text("member_kicker", "Liten etikett ovanför rubriken", "Medlemskap", small),
      text("member_title", "Rubrik", "Bli medlem i JFK", { required: true }),
      area("member_lead", "Ingress", "Som medlem får du en stark social och professionell gemenskap under hela studietiden."),
      text("member_price", "Pris", "", { help: "T.ex. ”250 kr för hela utbildningen”. Lämna tomt för att inte visa något pris." }),
      ...heroFields("member"),
    ]),
    sec("formaner", "Förmåner", [
      text("member_benefits_title", "Rubrik", "Det här får du som medlem", { required: true }),
      list("member_benefits", "Förmåner", "Sittningar, banketter och andra sociala evenemang\nArbetsmarknadsdagar och lunchföreläsningar med byråer och myndigheter\nStudiestödjande aktiviteter och inspirerande föreläsningar\nEtt nätverk av studenter och jurister som håller långt efter examen\nMöjlighet att engagera dig i styrelsen och utskotten\nInflytande över din utbildning", { help: "En förmån per rad." }),
      image("member_image", "Bild", "", { help: "Valfritt. Visas bredvid förmånerna – gärna glada medlemmar på ett evenemang." }),
      text("member_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ]),
    sec("steg", "Så går det till", [
      text("member_steps_title", "Rubrik", "Så går det till", { required: true }),
      text("member_step_1_title", "Steg 1 – rubrik", "Klicka på ”Bli medlem”"),
      text("member_step_1_text", "Steg 1 – text", "Du kommer till JFK:s sida hos Hitract, där medlemskapet hanteras."),
      text("member_step_2_title", "Steg 2 – rubrik", "Registrera dig och betala"),
      text("member_step_2_text", "Steg 2 – text", "Fyll i dina uppgifter och betala medlemsavgiften direkt i Hitract."),
      text("member_step_3_title", "Steg 3 – rubrik", "Välkommen in!"),
      text("member_step_3_text", "Steg 3 – text", "Nu kan du köpa biljetter till medlemsevenemang och ta del av alla förmåner."),
      text("member_fineprint", "Liten text under knappen", "Medlemskapet hanteras helt av Hitract. Vi sparar inga medlemsuppgifter på den här webbplatsen.", { more: true }),
    ]),
    sec("faq", "Vanliga frågor", [
      text("member_faq_title", "Rubrik", "Vanliga frågor om medlemskap", { required: true }),
      text("member_faq_link", "Länk till alla frågor", "Fler vanliga frågor", small),
    ], "Frågorna själva ändrar du under Vanliga frågor i menyn (kategorin Medlemskap visas här)."),
  ]),

  page("for-studenter", "För studenter", "/for-studenter", [
    sec("topp", "Sidans topp", [
      text("students_kicker", "Liten etikett ovanför rubriken", "För studenter", small),
      text("students_title", "Rubrik", "Studier och studentliv", { required: true }),
      area("students_lead", "Ingress", "Allt du behöver veta om studierna, kursombuden, idrotten och livet runt omkring."),
      ...heroFields("students"),
    ]),
    sec("studera", "Studera på KAU", [
      text("study_title", "Rubrik", "Studera på KAU", { required: true }),
      area("study_text", "Text", "Juristprogrammet och masterprogrammet i skatterätt ges vid Handelshögskolan på Karlstads universitet. Kursplaner, scheman och information om tentor hittar du på universitetets webbplats och i lärplattformen.\n\nHar du frågor om dina studier kan du alltid vända dig till studievägledningen. Vill du påverka utbildningen är JFK:s utbildningsansvariga och kursombuden din väg in."),
      url("study_link", "Länk till universitetet", "https://www.kau.se"),
      text("study_link_label", "Text på länkknappen", "Karlstads universitet", small),
      text("study_aside_title", "Rutan om JF Påverka – rubrik", "Något i utbildningen som inte fungerar?"),
      area("study_aside_text", "Rutan om JF Påverka – text", "Lämna en synpunkt via JF Påverka – anonymt om du vill. Allt tas upp på nästa styrelsemöte."),
      text("study_aside_button", "Rutan om JF Påverka – knapp", "Till JF Påverka", small),
      image("study_image", "Bild", "", { help: "Valfritt. Visas ovanför rutan om JF Påverka, t.ex. ett foto från campus eller en föreläsningssal." }),
      text("study_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ]),
    sec("jobb", "Jobb och praktik", [
      text("students_jobs_title", "Rubrik", "Jobb och praktik", { required: true }),
      area("students_jobs_text", "Text", "Praktikplatser, sommarnotarietjänster, traineeprogram och jobb – hos våra samarbetspartners och andra arbetsgivare."),
      text("students_jobs_button", "Text på knappen", "Se lediga tjänster", small),
    ]),
    sec("kursombud", "Kursombud", [
      text("reps_title", "Rubrik", "Kursombud", { required: true }),
      area("reps_text", "Text", "Kursombuden är studenternas röst i varje termin. De samlar in synpunkter på kurser och examinationer och för dem vidare till lärare och programledning. Vill du bli kursombud? Hör av dig till utbildningsansvarig."),
      text("reps_tbd", "Text när namnet saknas", "Meddelas senare", { more: true }),
      text("reps_contact_tbd", "Text när e-post saknas", "Kontaktuppgifter kommer", { more: true }),
      text("reps_empty", "Text när inga kursombud finns", "Kursombuden presenteras snart.", { more: true }),
    ], "Kursombuden själva ändrar du under Styrelsen → Kursombud i menyn."),
    sec("idrott", "JFK Idrott", [
      text("sport_title", "Rubrik", "JFK Idrott", { required: true }),
      area("sport_text", "Text", "Som student är det viktigt att hitta en balans mellan studier och en aktiv livsstil. JFK Idrott vill göra det enkelt och roligt att röra på sig – oavsett nivå. Det viktigaste är gemenskapen, inte prestationen."),
      list("sport_items", "Aktiviteter", "Halltider|Olika sporter varje söndag kl. 16.45–18.00 i universitetshallen.\nSkidresa|Varje vår åker vi på skidresa, oftast till Åre.\nTurneringar|Futsal, fotboll och innebandy mot andra föreningar.\nKAU IF|Studentidrottsföreningen med träning i flera olika idrotter.\nNordic Wellness|Gym på campus med studentpris.", { help: "En aktivitet per rad i formatet: Rubrik|Beskrivning" }),
      url("instagram_sport_url", "JFK Idrott på Instagram – länk", "https://www.instagram.com/jfk_idrott/"),
      text("instagram_sport_handle", "JFK Idrott på Instagram – visningsnamn", "@jfk_idrott"),
      choice("sport_style", "Utseende", "band", [
        { value: "band", label: "Rullande bildband", hint: "Bilderna glider sakta från höger till vänster ovanför aktiviteterna. Stannar när man pekar på en bild" },
        { value: "bildspel", label: "Stort bildspel", hint: "En bild i taget över hela bredden som tonar över till nästa, med rubriken ovanpå" },
        { value: "delad", label: "Text och bildspel bredvid varandra", hint: "Text och aktiviteter till vänster, bilderna tonar över till höger" },
        { value: "kort", label: "Aktivitetskort med bild", hint: "Varje aktivitet blir ett kort med en egen bild, och korten rullar i sidled" },
      ], { required: true, help: "Bildspelen behöver minst två bilder. Med en eller inga bilder visas sektionen utan rörelse." }),
      choice("sport_speed", "Hastighet", "medel", [
        { value: "lugn", label: "Lugn" },
        { value: "medel", label: "Mellan" },
        { value: "snabb", label: "Snabbare" },
      ], { required: true, help: "Den som valt minskad rörelse i sin dator eller mobil ser alltid bilderna stilla." }),
      image("sport_image", "Bild 1", "", { help: "Bilderna i bildspelet, t.ex. från skidresan, turneringar och halltiderna. Liggande bilder blir snyggast. I utseendet Aktivitetskort hör bild 1 till den första aktiviteten, bild 2 till den andra och så vidare." }),
      text("sport_image_alt", "Bild 1 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_2", "Bild 2", ""),
      text("sport_image_2_alt", "Bild 2 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_3", "Bild 3", ""),
      text("sport_image_3_alt", "Bild 3 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_4", "Bild 4", "", { more: true }),
      text("sport_image_4_alt", "Bild 4 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_5", "Bild 5", "", { more: true }),
      text("sport_image_5_alt", "Bild 5 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_6", "Bild 6", "", { more: true }),
      text("sport_image_6_alt", "Bild 6 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_7", "Bild 7", "", { more: true }),
      text("sport_image_7_alt", "Bild 7 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      image("sport_image_8", "Bild 8", "", { more: true }),
      text("sport_image_8_alt", "Bild 8 – bildbeskrivning", "", { more: true, help: ALT_HELP }),
      text("sport_pause", "Knapp: pausa", "Pausa", small),
      text("sport_play", "Knapp: spela", "Spela", small),
    ]),
    sec("galleri", "Bildgalleri", [
      text("gallery_title", "Rubrik", "Bildgalleri", { required: true }),
      area("gallery_text", "Text", "Bilder från våra evenemang. Vill du att en bild på dig tas bort? Mejla informationsansvarig@jfkarlstad.se så hjälper vi dig."),
      rich("gallery_empty", "Text när inga bilder finns", "Bilderna kommer snart. Under tiden finns massor på [@jfkarlstad](https://www.instagram.com/jfkarlstad/).", { more: true, help: RICH_HELP }),
      text("gallery_open", "Text för skärmläsare på bilderna", "öppnas i större format i ny flik", { more: true }),
    ], "Bilderna laddar du upp under Bildgalleri i menyn."),
  ]),

  page("karriar", "Jobb och praktik", "/karriar", [
    sec("topp", "Sidans topp", [
      text("jobs_kicker", "Liten etikett ovanför rubriken", "För studenter", small),
      text("jobs_title", "Rubrik", "Jobb och praktik", { required: true }),
      area("jobs_lead", "Ingress", "Lediga praktikplatser, sommarnotarietjänster, traineeprogram och jobb – främst hos våra samarbetspartners."),
      ...heroFields("jobs"),
    ]),
    sec("lista", "Listan med tjänster", [
      text("jobs_filter_all", "Filter: alla", "Alla", small),
      text("jobs_kind_praktik", "Typ: praktik", "Praktik", small),
      text("jobs_kind_sommarnotarie", "Typ: sommarnotarie", "Sommarnotarie", small),
      text("jobs_kind_trainee", "Typ: trainee", "Trainee", small),
      text("jobs_kind_jobb", "Typ: jobb", "Jobb", small),
      text("jobs_kind_uppsats", "Typ: uppsats", "Uppsats", small),
      text("jobs_kind_annat", "Typ: annat", "Annat", small),
      text("jobs_deadline", "Sista ansökningsdag", "Sista ansökningsdag {datum}", { ...small, help: "{datum} byts ut mot datumet." }),
      text("jobs_rolling", "Text när sista dag saknas", "Löpande urval", small),
      text("jobs_apply", "Knapp: ansök", "Ansök", small),
      rich("jobs_empty", "Text när inga tjänster finns", "Just nu finns inga lediga tjänster. Kika gärna in igen snart – eller tipsa en arbetsgivare om att [annonsera hos oss](/for-foretag#kontakta-oss).", { more: true, help: RICH_HELP }),
      text("jobs_cta_title", "Rutan för arbetsgivare – rubrik", "Vill ni annonsera hos oss?"),
      area("jobs_cta_text", "Rutan för arbetsgivare – text", "Som samarbetspartner kan ni nå juriststudenter vid Karlstads universitet med era praktikplatser och jobb."),
      text("jobs_cta_button", "Rutan för arbetsgivare – knapp", "Kontakta oss", small),
    ], "Tjänsterna lägger du in under Jobb och praktik i menyn."),
    sec("annons", "Sidan för en enskild tjänst", [
      text("job_back", "Länk tillbaka", "Jobb och praktik", small),
      text("job_apply_button", "Knapp till ansökan", "Till ansökan", small),
      text("job_partner_link", "Länk till partnern", "Mer om {arbetsgivare}", { ...small, help: "{arbetsgivare} byts ut mot arbetsgivarens namn." }),
      text("job_expired", "Text när ansökningstiden gått ut", "Ansökningstiden har gått ut.", small),
      text("job_all", "Länk till alla tjänster", "Alla lediga tjänster", small),
    ]),
  ]),

  page("engagera-dig", "Engagera dig", "/engagera-dig", [
    sec("topp", "Sidans topp", [
      text("engage_kicker", "Liten etikett ovanför rubriken", "Om oss", small),
      text("engage_title", "Rubrik", "Engagera dig i JFK", { required: true }),
      area("engage_lead", "Ingress", "Föreningen drivs av studenter – och det finns alltid plats för fler. Ett uppdrag i JFK ger nya vänner, värdefull erfarenhet och något extra att skriva i cv:t."),
      ...heroFields("engage"),
    ]),
    sec("uppdrag", "Lediga uppdrag", [
      text("engage_positions_title", "Rubrik", "Lediga uppdrag", { required: true }),
      area("engage_positions_lead", "Text", "Här listar vi uppdrag som vi söker folk till just nu."),
      area("engage_positions_empty", "Text när inga uppdrag är utlysta", "Just nu finns inga utlysta uppdrag, men du är alltid välkommen att anmäla ditt intresse – vi hittar en plats för dig.", { more: true }),
      text("engage_interest_button", "Knapp på varje uppdrag", "Jag är intresserad", small),
      text("engage_commitment_label", "Etikett för tidsåtgång", "Tidsåtgång", small),
    ], "Uppdragen lägger du in under Styrelsen → Lediga uppdrag i menyn."),
    sec("utskott", "Utskotten", [
      text("engage_committees_title", "Rubrik", "Våra utskott", { required: true }),
      area("engage_committees_text", "Text", "Alla ordinarie medlemmar kan väljas in i ett utskott. Där planerar du evenemang, föreläsningar, idrott och mycket mer tillsammans med andra – och du bestämmer själv hur mycket tid du lägger."),
      text("engage_committee_hint", "Text ovanför korten", "Klicka på ett utskott för att läsa mer om vad ni gör.", { more: true }),
      text("engage_committee_more", "Knapp: läs mer", "Läs mer", small),
      text("engage_committee_less", "Knapp: stäng", "Stäng", small),
      text("engage_committee_join", "Knapp: vara med", "Jag vill vara med i {utskott}", { ...small, help: "{utskott} byts ut mot utskottets namn." }),
    ], "Utskotten – namn, kort och lång beskrivning, tidsåtgång och bilder – lägger du in under Styrelse och uppdrag → Utskott i menyn."),
    sec("formular", "Formuläret", [
      choice("engage_signup", "Anmälan", "oppen", [
        { value: "oppen", label: "Öppen", hint: "Formuläret visas och intresseanmälningar tas emot" },
        { value: "stangd", label: "Stängd", hint: "Formuläret ersätts av en ruta som säger att anmälan är stängd och när den öppnar" },
      ], { required: true }),
      datetime("engage_signup_opens", "Öppnar automatiskt", "", {
        help: "Anmälan öppnar av sig själv vid den här tiden, och datumet visas i rutan för stängd anmälan. Lämna tomt så står det att anmälan öppnar TBA.",
      }),
      datetime("engage_signup_closes", "Stänger automatiskt", "", {
        help: "Anmälan stänger av sig själv vid den här tiden. Lämna tomt så är den öppen tills du stänger den. Har du fyllt i båda tiderna gäller den som passerades senast.",
      }),
      choice("engage_closed_style", "Stängd – utseende", "band-svart", [
        { value: "mork", label: "Mörk ruta", hint: "Mörk ruta med ett gult lås, rubrik och text" },
        { value: "gul", label: "Gul banderoll", hint: "Ett brett gult band över hela sidan med stor rubrik – syns tydligt" },
        { value: "nedrakning", label: "Nedräkning", hint: "Räknar ned dagar, timmar och minuter till att anmälan öppnar (kräver ett datum, annars visas TBA)" },
        { value: "diskret", label: "Diskret kort", hint: "Ljust kort med en datumbricka – lugnt och enkelt" },
        { value: "band-svart", label: "Svart banderoll", hint: "Brett svart band med vit rubrik och gult lås" },
        { value: "band-vit", label: "Vit banderoll", hint: "Brett vitt band med en gul linje överst – ljust och stilrent" },
        { value: "band-rand", label: "Randig banderoll", hint: "Ljust band inramat av diagonala ränder – som en avspärrning" },
        { value: "band-bild", label: "Banderoll med bild", hint: "Sidans huvudbild (Bild 1 i Sidans topp) tonad i mörkt bakom texten" },
        { value: "kort-svart", label: "Svart kort med datum", hint: "Svart kort med en gul datumbricka" },
        { value: "kort-kontur", label: "Konturkort med datum", hint: "Genomskinligt kort med svart kant och svart datumbricka" },
        { value: "kombo-ljus", label: "Band med stort datum", hint: "Brett ljust band med en stor datumbricka till vänster" },
        { value: "kombo-svart", label: "Svart band med stort datum", hint: "Brett svart band med en stor gul datumbricka" },
      ], { required: true }),
      choice("engage_closed_countdown", "Stängd – nedräkning", "pa", [
        { value: "pa", label: "Visa nedräkning", hint: "Räknar ned dagar, timmar och minuter till att anmälan öppnar (när ett datum är ifyllt)" },
        { value: "av", label: "Ingen nedräkning", hint: "Bara rubrik, text och datum" },
      ], { required: true }),
      color("engage_closed_c_bg", "Stängd – färg: bakgrund", "", { help: "Alla färgfälten är valfria – tomt (”Standard”) = sajtens vanliga färg. Väljer du bara bakgrund får rubrik och text automatiskt svart eller vit färg som syns bra." }),
      color("engage_closed_c_title", "Stängd – färg: rubrik", ""),
      color("engage_closed_c_text", "Stängd – färg: text", ""),
      color("engage_closed_c_link", "Stängd – färg: länkar", ""),
      color("engage_closed_c_accent", "Stängd – färg: låsets cirkel och datumbrickan", ""),
      color("engage_closed_c_icon", "Stängd – färg: själva låset", "", { help: "Lämna tomt så blir låset svart eller vitt beroende på vad som syns bäst." }),
      color("engage_closed_c_box", "Stängd – färg: nedräkningens rutor", ""),
      color("engage_closed_c_num", "Stängd – färg: nedräkningens siffror", ""),
      text("engage_closed_title", "Stängd – rubrik", "Anmälan är stängd"),
      area("engage_closed_text", "Stängd – text", "Just nu tar vi inte emot intresseanmälningar till utskotten. Ansökan öppnar {datum}.", {
        help: "{datum} byts ut mot datumet ovan, eller mot texten för okänt datum.",
      }),
      text("engage_closed_tba", "Stängd – text när datum saknas", "TBA", { more: true, help: "Visas i stället för datumet, t.ex. ”TBA” eller ”snart”." }),
      rich("engage_closed_follow", "Stängd – tips", "Följ [@jfkarlstad](https://www.instagram.com/jfkarlstad/) så missar du inte när anmälan öppnar.", { more: true, help: RICH_HELP }),
      text("engage_closed_days", "Nedräkning: dagar", "dagar", small),
      text("engage_closed_hours", "Nedräkning: timmar", "timmar", small),
      text("engage_closed_minutes", "Nedräkning: minuter", "minuter", small),
      text("engage_closed_badge", "Datumbrickan: etikett", "Öppnar", small),
      text("engage_committee_closed", "Knappen på utskotten när anmälan är stängd", "Anmälan öppnar {datum}", { ...small, help: "{datum} byts ut som i texten ovan." }),
      choice("engage_open_countdown", "Öppen – nedräkning till att anmälan stänger", "pa", [
        { value: "pa", label: "Visa nedräkning", hint: "Visas ovanför formuläret när du har fyllt i ”Stänger automatiskt”" },
        { value: "av", label: "Ingen nedräkning", hint: "Anmälan stänger ändå vid tiden du har angett" },
      ], { required: true }),
      text("engage_open_countdown_text", "Öppen – text vid nedräkningen", "Anmälan stänger {datum}", { help: "{datum} byts ut mot datumet då anmälan stänger." }),
      color("engage_open_c_bg", "Öppen – färg: nedräkningens bakgrund", "", { help: "Tomt (”Standard”) = sajtens vanliga färg. Väljer du bara bakgrund blir texten automatiskt svart eller vit." }),
      color("engage_open_c_text", "Öppen – färg: nedräkningens text", ""),
      color("engage_open_c_box", "Öppen – färg: nedräkningens rutor", ""),
      color("engage_open_c_num", "Öppen – färg: nedräkningens siffror", ""),
      text("engage_form_title", "Rubrik", "Anmäl ditt intresse", { required: true }),
      area("engage_form_intro", "Text ovanför formuläret", "Fyll i formuläret så hör någon i styrelsen av sig och berättar mer. Det är inte bindande."),
      text("ef_name", "Fält: namn", "Namn", small),
      text("ef_email", "Fält: e-post", "E-post", small),
      text("ef_term", "Fält: termin", "Vilken termin läser du?", small),
      list("ef_term_options", "Val för termin", "Termin 1\nTermin 2\nTermin 3\nTermin 4\nTermin 5\nTermin 6\nTermin 7\nTermin 8\nTermin 9\nMasterprogrammet i skatterätt", { more: true, help: "Ett val per rad." }),
      text("ef_role", "Fält: intresse", "Vad är du intresserad av?", small),
      text("ef_role_any", "Valet ”vad som helst”", "Vad som helst – jag vill bara engagera mig", small),
      text("ef_message", "Fält: meddelande", "Berätta gärna lite om dig själv", small),
      text("ef_message_help", "Hjälptext för meddelandet", "Vad tycker du är roligt? Har du gjort något liknande förut? Ett par meningar räcker.", { more: true }),
    ]),
    sec("tack", "Bekräftelsen", [
      text("engage_thanks_title", "Rubrik", "Tack för ditt intresse!", { required: true }),
      area("engage_thanks_text", "Text", "Någon i styrelsen hör av sig till dig så snart vi kan, oftast inom en vecka."),
    ], "Visas när någon har skickat formuläret."),
  ]),

  page("for-foretag", "För företag", "/for-foretag", [
    sec("topp", "Sidans topp", [
      text("companies_kicker", "Liten etikett ovanför rubriken", "För företag", small),
      text("companies_title", "Rubrik", "Samarbeta med JFK", { required: true }),
      area("companies_lead", "Ingress", "Nå framtidens jurister tidigt – på campus, på våra evenemang och i våra kanaler."),
      text("companies_cta", "Knapp", "Kontakta oss", small),
      text("companies_partners_link", "Länk till partners", "Våra nuvarande partners", small),
      ...heroFields("companies"),
    ]),
    sec("varfor", "Varför JFK?", [
      text("companies_why_title", "Rubrik", "Varför JFK?", { required: true }),
      area("companies_text", "Text", "JFK samlar omkring 400 juriststudenter och masterstudenter i skatterätt vid Karlstads universitet. Som samarbetspartner blir ni en naturlig del av deras studietid – från första terminens inspark till sista terminens examensbankett."),
      text("companies_benefits_title", "Rutan – rubrik", "Det här får ni"),
      list("companies_benefits", "Rutan – punkter", "Synlighet på hemsidan, i sociala medier och på våra evenemang\nLunchföreläsningar och case-kvällar på campus\nPlats på vår arbetsmarknadsdag\nSittningar och nätverksträffar med studenter\nAnnonsering av praktikplatser, notarietjänster och jobb", { help: "En punkt per rad." }),
      image("companies_image", "Bild", "", { help: "Valfritt. Visas bredvid texten, t.ex. från arbetsmarknadsdagen eller en lunchföreläsning." }),
      text("companies_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ]),
    sec("paket", "Samarbetsformer", [
      text("packages_title", "Rubrik", "Samarbetsformer", { required: true }),
      area("packages_note", "Text", "Kontakta oss för pris och upplägg. Vi anpassar gärna samarbetet efter era mål."),
      text("package_1_name", "Paket 1 – namn", "Huvudsamarbetspartner", { help: "Lämna namnet tomt för att dölja paketet." }),
      area("package_1_text", "Paket 1 – beskrivning", "Vårt mest omfattande samarbete med störst synlighet, flera evenemang per år och en framträdande plats på hemsidan."),
      text("package_2_name", "Paket 2 – namn", "Samarbetspartner"),
      area("package_2_text", "Paket 2 – beskrivning", "Ett långsiktigt samarbete med synlighet i våra kanaler och möjlighet till evenemang under året."),
      text("package_3_name", "Paket 3 – namn", "Enskilt evenemang"),
      area("package_3_text", "Paket 3 – beskrivning", "Lunchföreläsning, case-kväll eller plats på arbetsmarknadsdagen – utan längre åtagande."),
      text("companies_strip_title", "Etikett ovanför partnerloggorna", "De samarbetar redan med oss", small),
    ]),
    sec("formular", "Formuläret", [
      text("companies_form_title", "Rubrik", "Kontakta oss", { required: true }),
      area("companies_form_intro", "Text ovanför formuläret", "Berätta kort om er, så hör vår arbetsmarknadsansvariga av sig inom några dagar."),
      text("cf_company", "Fält: företag", "Företag eller organisation", small),
      text("cf_name", "Fält: kontaktperson", "Kontaktperson", small),
      text("cf_email", "Fält: e-post", "E-post", small),
      text("cf_phone", "Fält: telefon", "Telefon", small),
      text("cf_interest", "Fält: intresse", "Intresserad av", small),
      list("cf_interest_options", "Val för intresse", "Huvudsamarbetspartner\nSamarbetspartner\nEnskilt evenemang\nVet inte än – berätta mer", { more: true, help: "Ett val per rad." }),
      text("cf_message", "Fält: meddelande", "Berätta kort om er och vad ni vill uppnå", small),
      text("companies_mail_title", "Rutan bredvid – rubrik", "Hellre mejl?", { more: true }),
      rich("companies_mail_text", "Rutan bredvid – text", "Skriv till [arbetsmarknadsansvarig@jfkarlstad.se](mailto:arbetsmarknadsansvarig@jfkarlstad.se).", { more: true, help: RICH_HELP }),
    ]),
    sec("tack", "Bekräftelsen", [
      text("companies_thanks_title", "Rubrik", "Tack för ert intresse!", { required: true }),
      area("companies_thanks_text", "Text", "Vår arbetsmarknadsansvariga hör av sig inom några dagar för att prata vidare om ett samarbete."),
    ], "Visas när någon har skickat formuläret."),
  ]),

  page("partners", "Partners", "/partners", [
    sec("lista", "Sidan med alla partners", [
      text("partners_kicker", "Liten etikett ovanför rubriken", "Partners", small),
      text("partners_title", "Rubrik", "Våra samarbetspartners", { required: true }),
      ...heroFields("partners"),
      text("partners_main_title", "Underrubrik för huvudpartners", "Huvudsamarbetspartners", small),
      text("partners_other_title", "Underrubrik för övriga", "Samarbetspartners", small),
      text("partner_main_kicker", "Etikett på huvudpartners", "Huvudsamarbetspartner", small),
      text("partner_kicker", "Etikett på övriga partners", "Samarbetspartner", small),
      text("partners_empty", "Text när inga partners finns", "Våra samarbetspartners presenteras snart.", { more: true }),
      text("partners_cta_title", "Rutan längst ned – rubrik", "Vill ni också samarbeta med JFK?"),
      area("partners_cta_text", "Rutan längst ned – text", "Vi berättar gärna mer om hur ett samarbete kan se ut."),
      text("partners_cta_button", "Knapp ”Bli samarbetspartner”", "Bli samarbetspartner", small),
    ], "Ingressen är samma som på startsidan. Partnerna själva ändrar du under Partners i menyn."),
    sec("partnersida", "Partnerns egen sida", [
      text("partner_aside_title", "Rutan – rubrik", "Läs mer om {namn}", { ...small, help: "{namn} byts ut mot partnerns namn." }),
      text("partner_career", "Knapp till karriärsidan", "Karriär hos {namn}", { ...small, help: "{namn} byts ut mot partnerns namn." }),
      text("partner_website", "Knapp till webbplatsen", "Webbplats", small),
      text("partner_jobs_title", "Rubrik för lediga tjänster", "Lediga tjänster hos {namn}", { ...small, help: "{namn} byts ut mot partnerns namn." }),
      text("partner_all", "Länk till alla partners", "Alla samarbetspartners", small),
    ]),
  ]),

  page("aktuellt", "Nyheter", "/aktuellt", [
    sec("lista", "Nyhetslistan", [
      text("news_kicker", "Liten etikett ovanför rubriken", "Aktuellt", small),
      text("news_title", "Rubrik", "Nyheter", { required: true }),
      area("news_lead", "Ingress", "Det senaste från föreningen – evenemang, beslut och annat som är bra att veta."),
      ...heroFields("news"),
      text("news_empty", "Text när inga nyheter finns", "Inga nyheter ännu.", { more: true }),
      text("news_newer", "Knapp: nyare", "Nyare", small),
      text("news_older", "Knapp: äldre", "Äldre", small),
      text("news_page", "Sidnummer", "Sida {sida} av {antal}", { ...small, help: "{sida} och {antal} byts ut automatiskt." }),
    ], "Nyheterna skriver du under Nyheter i menyn."),
    sec("artikel", "Sidan för en nyhet", [
      text("news_all", "Länk till alla nyheter", "Alla nyheter", small),
    ]),
  ]),

  page("kalender", "Kalender", "/kalender", [
    sec("topp", "Kalendern", [
      text("cal_kicker", "Liten etikett ovanför rubriken", "Aktuellt", small),
      text("cal_title", "Rubrik", "Kalender", { required: true }),
      area("cal_lead", "Ingress", "Sittningar, föreläsningar, arbetsmarknadsdagar och mycket mer. Biljetter till medlemsevenemang köper du via Hitract."),
      ...heroFields("cal"),
      rich("cal_empty", "Text när inga evenemang finns", "Inga kommande evenemang är inlagda just nu. Följ [@jfkarlstad](https://www.instagram.com/jfkarlstad/) så missar du inget.", { more: true, help: RICH_HELP }),
      text("cal_past_title", "Rubrik för tidigare evenemang", "Tidigare evenemang", small),
    ], "Evenemangen lägger du in under Event i menyn."),
    sec("manad", "Månadsvyn", [
      text("cal_view_month", "Knapp: månad", "Månad", small),
      text("cal_view_list", "Knapp: lista", "Lista", small),
      text("cal_today", "Knapp: idag", "Idag", small),
      text("cal_prev", "Knapp: föregående månad", "Föregående månad", small),
      text("cal_next", "Knapp: nästa månad", "Nästa månad", small),
      list("cal_weekdays", "Veckodagarna", "Måndag\nTisdag\nOnsdag\nTorsdag\nFredag\nLördag\nSöndag", { ...small, help: "En per rad, med måndag först." }),
      text("cal_week", "Förkortning för vecka", "v.", small),
      text("cal_more", "Fler evenemang samma dag", "+{antal} till", { ...small, help: "{antal} byts ut mot antalet." }),
      text("cal_month_empty", "Text när månaden är tom", "Inga evenemang den här månaden.", small),
      text("cal_next_event", "Länk till nästa evenemang", "Nästa evenemang: {namn}, {datum}", { ...small, help: "{namn} och {datum} byts ut automatiskt." }),
      text("cal_legend_open", "Förklaring: öppna evenemang", "Öppet för alla", small),
      text("cal_pop_more", "Rutan vid evenemang: länk till sidan", "Läs mer", small),
      text("cal_agenda_title", "Rubrik för listan under kalendern (mobil)", "Händelser i {månad}", { ...small, help: "{månad} byts ut mot månaden." }),
    ], "Kalendern visar en månad i taget. Besökare bläddrar med pilarna."),
    sec("prenumerera", "Prenumerera på kalendern", [
      text("cal_sub_button", "Knapp", "Prenumerera på kalendern", small),
      text("cal_sub_title", "Rubrik", "Få JFK:s evenemang i din kalender"),
      area("cal_sub_text", "Text", "Lägg till kalendern en gång – sedan dyker nya evenemang upp automatiskt i din mobil och dator."),
      text("cal_sub_apple", "Knapp: Apple och Outlook", "Apple Kalender eller Outlook", small),
      text("cal_sub_google", "Knapp: Google", "Google Kalender", small),
      text("cal_sub_copy", "Knapp: kopiera", "Kopiera länken", small),
      text("cal_sub_copied", "Text när länken kopierats", "Kopierad!", small),
    ]),
    sec("eventsida", "Sidan för ett evenemang", [
      text("event_members_only", "Endast för medlemmar", "Endast för medlemmar", small),
      text("event_past", "Text när evenemanget har passerat", "Evenemanget har redan ägt rum", small),
      text("event_signup", "Knapp till anmälan", "Anmälan och biljetter", small),
      text("event_join", "Knapp för medlemsevenemang", "Bli medlem för att delta", small),
      text("event_add", "Knapp: lägg till i kalendern", "Lägg till i kalendern", small),
      text("event_all", "Länk till alla evenemang", "Alla evenemang", small),
    ]),
  ]),

  page("dokument", "Dokument", "/dokument", [
    sec("topp", "Sidan", [
      text("docs_kicker", "Liten etikett ovanför rubriken", "Om oss", small),
      text("docs_title", "Rubrik", "Dokument och protokoll", { required: true }),
      area("docs_lead", "Ingress", "Stadgar, styrdokument och protokoll. Som medlem förbinder du dig att följa stadgarna och gällande styrdokument."),
      ...heroFields("docs"),
      rich("docs_missing", "Text längst ned", "Saknar du ett protokoll? Mejla [sekreterare@jfkarlstad.se](mailto:sekreterare@jfkarlstad.se).", { help: RICH_HELP }),
    ], "Dokumenten laddar du upp under Dokument i menyn."),
    sec("sok", "Sökrutan och listan", [
      text("docs_search_label", "Sökfältets rubrik", "Sök bland dokumenten", small),
      text("docs_search_placeholder", "Exempeltext i sökfältet", "T.ex. stadgar eller 2025", { more: true }),
      text("docs_category_label", "Rubrik för kategori", "Kategori", small),
      text("docs_all_categories", "Valet ”alla”", "Alla kategorier", small),
      text("docs_search_button", "Knapp", "Sök", small),
      text("docs_count", "Antal", "{antal} dokument", { ...small, help: "{antal} byts ut mot antalet." }),
      text("docs_count_match", "Antal vid sökning", "{antal} dokument matchar", { ...small, help: "{antal} byts ut mot antalet." }),
      text("docs_pending", "Text när filen saknas", "Laddas upp inom kort", small),
      text("docs_empty", "Text när inga dokument finns", "Inga dokument är uppladdade ännu.", { more: true }),
      rich("docs_no_match", "Text när sökningen inte ger träffar", "Inga dokument matchar din sökning. [Visa alla dokument](/dokument)", { more: true, help: RICH_HELP }),
      text("doc_cat_stadgar", "Kategori: stadgar", "Stadgar", small),
      text("doc_cat_styrdokument", "Kategori: styrdokument", "Styrdokument", small),
      text("doc_cat_protokoll", "Kategori: protokoll", "Protokoll", small),
      text("doc_cat_ovrigt", "Kategori: övrigt", "Övrigt", small),
    ]),
  ]),

  page("faq", "Vanliga frågor", "/faq", [
    sec("topp", "Sidan", [
      text("faq_kicker", "Liten etikett ovanför rubriken", "Hjälp", small),
      text("faq_title", "Rubrik", "Vanliga frågor", { required: true }),
      area("faq_lead", "Ingress", "Svar på det vi oftast får frågor om. Hittar du inte svaret? Hör av dig till oss."),
      ...heroFields("faq"),
      text("faq_empty", "Text när inga frågor finns", "Inga frågor ännu.", { more: true }),
      text("faq_cta_title", "Rutan längst ned – rubrik", "Hittade du inte svaret?"),
      area("faq_cta_text", "Rutan längst ned – text", "Skicka din fråga så svarar vi så snart vi kan."),
      text("faq_cta_button", "Rutan längst ned – knapp", "Kontakta oss", small),
    ], "Frågorna och svaren ändrar du under Vanliga frågor i menyn."),
  ]),

  page("jf-paverka", "JF Påverka", "/jf-paverka", [
    sec("topp", "Sidans topp", [
      text("paverka_kicker", "Liten etikett ovanför rubriken", "JF Påverka", small),
      text("paverka_page_title", "Rubrik", "Gör din röst hörd", { required: true }),
      area("paverka_lead", "Ingress", "Gör din röst hörd i JFK. Lämna synpunkter, rapportera problem eller föreslå ett eget initiativ."),
      ...heroFields("paverka"),
    ]),
    sec("info", "Rutorna bredvid formuläret", [
      text("paverka_how_title", "Första rutan – rubrik", "Så fungerar det"),
      area("paverka_page_text", "Första rutan – text", "Allt som skickas in tas upp på nästa styrelsemöte. Du kan välja att vara anonym – då sparar vi varken namn, e-post eller IP-adress.\n\nMed JF Initiativ kan du föreslå ett nytt projekt eller en aktivitet. Om det finns en genomförbar plan och någon som vill leda projektet hjälper styrelsen till med planering och marknadsföring, medan du och ditt team står för det dagliga arbetet."),
      text("paverka_anon_title", "Andra rutan – rubrik", "Anonymt på riktigt"),
      area("paverka_anon_text", "Andra rutan – text", "När du skickar anonymt sparas bara det du skriver i rubriken och beskrivningen. Ingen IP-adress, inget namn, ingen e-post – varken i databasen, i våra loggar eller i mejlet till styrelsen."),
      image("paverka_image", "Bild", "", { help: "Valfritt. Visas ovanför rutorna bredvid formuläret." }),
      text("paverka_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ]),
    sec("formular", "Formuläret", [
      text("pf_type", "Fält: typ av ärende", "Vad vill du lämna?", small),
      text("pf_type_1_label", "Val 1 – namn", "JF Åsikt – utbildning", small),
      text("pf_type_1_hint", "Val 1 – förklaring", "Kurser, examinationer, lärare eller annat i utbildningen", { more: true }),
      text("pf_type_2_label", "Val 2 – namn", "JF Åsikt – förening", small),
      text("pf_type_2_hint", "Val 2 – förklaring", "Föreningens verksamhet, styrelsens arbete eller medlemmars uppträdande", { more: true }),
      text("pf_type_3_label", "Val 3 – namn", "JF Initiativ", small),
      text("pf_type_3_hint", "Val 3 – förklaring", "Förslag på ett nytt projekt, en aktivitet eller ett initiativ", { more: true }),
      text("pf_title", "Fält: rubrik", "Rubrik", small),
      text("pf_title_help", "Hjälptext för rubriken", "En kort sammanfattning, t.ex. ”Sen återkoppling på tentan i T3”.", { more: true }),
      text("pf_message", "Fält: beskrivning", "Beskriv", small),
      area("pf_message_help", "Hjälptext för beskrivningen", "Skriv bara det som behövs för ärendet. Undvik känsliga uppgifter, som hälsa, och namnge inte andra personer om det inte är nödvändigt.", { more: true }),
      text("pf_anon", "Kryssruta: anonymt", "Skicka anonymt", small),
      area("pf_anon_help", "Hjälptext för anonymt", "Då sparar vi varken namn, e-post eller IP-adress, och styrelsen kan inte svara dig. Tänk på att det du skriver kan avslöja vem du är.", { more: true }),
      text("pf_name", "Fält: namn", "Namn", small),
      text("pf_email", "Fält: e-post", "E-post", small),
      text("pf_email_help", "Hjälptext för e-post", "Fyll i om du vill att vi återkopplar till dig.", { more: true }),
    ]),
    sec("tack", "Bekräftelsen", [
      text("paverka_thanks_title", "Rubrik", "Tack för att du gör din röst hörd!", { required: true }),
      area("paverka_thanks_text", "Text", "Ditt inskick tas upp på nästa styrelsemöte. Om du lämnade kontaktuppgifter kan vi återkoppla till dig."),
    ], "Visas när någon har skickat formuläret."),
  ]),

  page("kontakt", "Kontakt", "/kontakt", [
    sec("topp", "Sidans topp", [
      text("contact_kicker", "Liten etikett ovanför rubriken", "Kontakt", small),
      text("contact_title", "Rubrik", "Hör av dig till oss", { required: true }),
      area("contact_lead", "Ingress", "Har du en fråga om medlemskap, evenemang eller samarbeten? Fyll i formuläret så återkommer vi så snart vi kan."),
      ...heroFields("contact"),
    ]),
    sec("formular", "Formuläret", [
      text("contact_form_title", "Rubrik", "Skicka ett meddelande", { required: true }),
      rich("contact_form_intro", "Text ovanför formuläret", "Har du idéer eller synpunkter på föreningen eller utbildningen? Använd hellre [JF Påverka](/jf-paverka) – där kan du vara anonym.", { help: RICH_HELP }),
      text("kf_name", "Fält: namn", "Namn", small),
      text("kf_email", "Fält: e-post", "E-post", small),
      text("kf_subject", "Fält: ämne", "Vad gäller det?", small),
      list("kf_subject_options", "Val för ämne", "Medlemskap\nEvenemang\nSamarbete\nAnnat", { more: true, help: "Ett val per rad." }),
      text("kf_message", "Fält: meddelande", "Meddelande", small),
    ]),
    sec("uppgifter", "Kontaktuppgifterna bredvid", [
      text("contact_details_title", "Rubrik", "Kontaktuppgifter"),
      text("contact_map", "Länk till kartan", "Visa på karta", small),
      text("contact_board_title", "Rubrik för styrelsens adresser", "Mejla styrelsen direkt"),
      image("contact_image", "Bild", "", { help: "Valfritt. Visas ovanför kontaktuppgifterna, t.ex. ett foto av föreningsrummet eller campus." }),
      text("contact_image_alt", "Bildbeskrivning", "", { more: true, help: ALT_HELP }),
    ], "Adress, e-post och telefon ändrar du under Gemensamt → Kontaktuppgifter och länkar."),
    sec("tack", "Bekräftelsen", [
      text("contact_thanks_title", "Rubrik", "Tack för ditt meddelande!", { required: true }),
      area("contact_thanks_text", "Text", "Vi har tagit emot det och återkommer så snart vi kan, oftast inom några dagar."),
    ], "Visas när någon har skickat formuläret."),
  ]),

  page("sok", "Sök", "/sok", [
    sec("sok", "Söksidan", [
      text("search_title", "Rubrik", "Sök", { required: true }),
      area("search_lead", "Ingress", "Sök bland nyheter, evenemang, jobb, dokument, vanliga frågor och mer."),
      text("search_placeholder", "Exempeltext i sökfältet", "Vad letar du efter?", { more: true }),
      text("search_button", "Knapp", "Sök", small),
      text("search_results", "Antal träffar", "{antal} träffar för ”{sökord}”", { ...small, help: "{antal} och {sökord} byts ut automatiskt." }),
      rich("search_none", "Text när inget hittas", "Inga träffar för ”{sökord}”. Prova ett annat ord, eller [kontakta oss](/kontakt).", { more: true, help: "{sökord} byts ut mot det besökaren sökte på. " + RICH_HELP }),
      text("search_short", "Text när sökordet är för kort", "Skriv minst två bokstäver.", small),
      text("search_group_pages", "Grupp: sidor", "Sidor", small),
      text("search_group_news", "Grupp: nyheter", "Nyheter", small),
      text("search_group_events", "Grupp: evenemang", "Evenemang", small),
      text("search_group_jobs", "Grupp: jobb", "Jobb och praktik", small),
      text("search_group_docs", "Grupp: dokument", "Dokument", small),
      text("search_group_faq", "Grupp: frågor", "Vanliga frågor", small),
      text("search_group_partners", "Grupp: partners", "Partners", small),
    ]),
  ]),

  page("gemensamt", "Gemensamt (sidhuvud, sidfot och knappar)", "/", [
    sec("forening", "Föreningen", [
      text("site_name", "Föreningens namn", "Juridiska Föreningen i Karlstad", { required: true, help: "Används i fliktitlar, delningar och sidfoten." }),
      text("site_short_name", "Förkortning", "JFK", { required: true }),
      area("site_description", "Beskrivning för Google och delningar", "Juridiska Föreningen i Karlstad (JFK) är studentföreningen för dig som läser juristprogrammet eller masterprogrammet i skatterätt vid Karlstads universitet.", { required: true, help: "Visas i sökresultat. Håll den under 160 tecken." }),
      text("brand_line1", "Logotypens text – rad 1", "Juridiska Föreningen", small),
      text("brand_line2", "Logotypens text – rad 2", "i Karlstad", small),
      text("brand_short", "Logotypens text i mobilen", "JFK", small),
    ]),
    sec("sidtoppar", "Sidornas topp", [
      choice("page_hero_default", "Utseende på alla undersidor", "kollage", HERO_STYLE_OPTIONS, {
        required: true,
        help: "Gäller alla sidor där Utseende är ”Som de andra sidorna”. En sida utan egna bilder visar bara texten. Om oss och startsidan har egna val.",
      }),
    ]),
    sec("kontakt", "Kontaktuppgifter och länkar", [
      url("hitract_url", "Länk till Hitract (Bli medlem)", "https://open.hitract.se/HitClub/645", { required: true, help: "Alla ”Bli medlem”-knappar går hit och öppnas i en ny flik." }),
      email("contact_email", "E-postadress", "informationsansvarig@jfkarlstad.se", { required: true }),
      text("contact_phone", "Telefonnummer", "073-523 56 89"),
      text("address_street", "Gatuadress", "Universitetsgatan 2", { required: true }),
      text("address_city", "Postnummer och ort", "651 88 Karlstad", { required: true }),
      text("org_number", "Organisationsnummer", "", { help: "Visas i sidfoten och i integritetspolicyn." }),
      url("instagram_url", "Instagram – länk", "https://www.instagram.com/jfkarlstad/", { required: true }),
      text("instagram_handle", "Instagram – visningsnamn", "@jfkarlstad", { required: true }),
    ]),
    sec("sidhuvud", "Sidhuvudet", [
      text("join_label", "Text på ”Bli medlem”-knapparna", "Bli medlem", { required: true, help: "Gäller knapparna i sidhuvudet, sidfoten och på Bli medlem. Knappen överst på startsidan har en egen text." }),
      text("menu_label", "Menyknappen i mobilen", "Meny", small),
      text("menu_close", "Menyknappen när menyn är öppen", "Stäng", small),
      text("search_label", "Sökknappen", "Sök", small),
    ], "Menyns namn och ordning ändrar du under Menyn."),
    sec("sidfot", "Sidfoten", [
      area("footer_text", "Text", "Studentföreningen för juriststudenter och masterstudenter i skatterätt vid Karlstads universitet."),
      text("footer_contact_title", "Rubrik för kontaktuppgifterna", "Kontakt", small),
      text("footer_more_title", "Rubrik för övriga länkar", "Mer", small),
      text("footer_privacy", "Länk till integritetspolicyn", "Integritetspolicy", small),
      text("footer_cookies", "Länk till kakor", "Cookie-inställningar", small),
      text("footer_login", "Länk till inloggningen", "Logga in för styrelsen", small),
      text("footer_orgnr", "Förkortning för organisationsnummer", "Org.nr", small),
    ]),
    sec("knappar", "Knappar och etiketter som finns på flera sidor", [
      text("read_more", "Läs mer", "Läs mer", small),
      text("members_tag", "Etikett för medlemsevenemang", "Endast medlemmar", small),
      text("form_submit", "Knappen i formulären", "Skicka", small),
      rich("form_privacy", "Text under formulären", "Vi behandlar dina uppgifter enligt vår [integritetspolicy](/integritetspolicy).", { more: true, help: RICH_HELP }),
      text("form_optional", "Markering för frivilliga fält", "(valfritt)", small),
      text("form_select", "Första valet i rullistor", "Välj …", small),
      text("thanks_home", "Bekräftelser – knapp till startsidan", "Till startsidan", small),
      text("thanks_events", "Bekräftelser – länk till kalendern", "Se kommande evenemang", small),
    ]),
  ]),

  page("integritet", "Integritet och kakor", "/integritetspolicy", [
    sec("topp", "Integritetspolicyn – inledning", [
      text("privacy_kicker", "Liten etikett ovanför rubriken", "Integritet", small),
      text("privacy_title", "Rubrik", "Integritetspolicy", { required: true }),
      area("privacy_lead", "Ingress", "Så behandlar vi personuppgifter. Kort sagt: vi samlar bara in det vi behöver, vi använder inga spårningskakor eller analysverktyg, och vi säljer eller delar aldrig dina uppgifter för reklam."),
      text("privacy_updated", "Senast uppdaterad", "4 oktober 2026", { required: true, help: "Ändra datumet när innehållet i policyn ändras i sak." }),
    ], "Ändra bara policyn om föreningens hantering av personuppgifter faktiskt har ändrats. Fråga gärna någon som kan GDPR."),
    sec("ansvarig", "Personuppgiftsansvarig", [
      text("privacy_controller_title", "Rubrik", "Personuppgiftsansvarig", { more: true, required: true }),
      rich("privacy_controller_text", "Text", "{förening}{orgnr}, {adress}, är personuppgiftsansvarig för behandlingen som beskrivs här. Har du frågor om dina personuppgifter, eller vill du använda dina rättigheter, mejlar du [{epost}](mailto:{epost}).", { help: "{förening}, {orgnr}, {adress} och {epost} byts ut mot uppgifterna under Gemensamt. " + RICH_HELP }),
    ]),
    sec("behandlingar", "Behandlingarna – rubriker", [
      text("privacy_purposes_title", "Rubrik", "Vad vi behandlar, varför och hur länge", { required: true }),
      text("privacy_label_data", "Etikett: uppgifter", "Uppgifter", small),
      text("privacy_label_basis", "Etikett: rättslig grund", "Rättslig grund", small),
      text("privacy_label_retention", "Etikett: hur länge", "Hur länge", small),
    ]),
    sec("b1", "Behandling 1: kontaktformuläret", [
      text("privacy_p1_title", "Rubrik", "Svara på det du skickar via kontaktformuläret"),
      area("privacy_p1_data", "Uppgifter", "Namn, e-postadress, ämne och ditt meddelande."),
      area("privacy_p1_basis", "Rättslig grund", "Berättigat intresse (art. 6.1 f GDPR) – att kunna besvara frågor till föreningen."),
      area("privacy_p1_retention", "Hur länge", "Raderas automatiskt efter 12 månader, eller tidigare när ärendet är klart."),
    ]),
    sec("b2", "Behandling 2: företagsformuläret", [
      text("privacy_p2_title", "Rubrik", "Hantera förfrågningar om samarbete"),
      area("privacy_p2_data", "Uppgifter", "Företagets namn, kontaktperson, e-postadress, telefonnummer (valfritt) och ditt meddelande."),
      area("privacy_p2_basis", "Rättslig grund", "Berättigat intresse – att kunna diskutera ett samarbete med er."),
      area("privacy_p2_retention", "Hur länge", "Raderas automatiskt efter 12 månader. Blir det ett samarbete sparas kontaktuppgifterna så länge samarbetet pågår."),
    ]),
    sec("b3", "Behandling 3: JF Påverka", [
      text("privacy_p3_title", "Rubrik", "Ta emot synpunkter och initiativ via JF Påverka"),
      area("privacy_p3_data", "Uppgifter", "Typ av ärende, rubrik och beskrivning. Namn och e-post bara om du väljer att lämna dem."),
      area("privacy_p3_basis", "Rättslig grund", "Berättigat intresse – att kunna förbättra utbildningen och föreningen."),
      area("privacy_p3_retention", "Hur länge", "Raderas automatiskt efter 12 månader."),
      area("privacy_p3_note", "Extra notis", "Skickar du anonymt sparas inget namn, ingen e-postadress och ingen IP-adress tillsammans med ditt inskick – varken i databasen, i våra loggar eller i mejlet till styrelsen. Tänk på att det du skriver i texten ändå kan avslöja vem du är."),
    ]),
    sec("b4", "Behandling 4: intresseanmälningar", [
      text("privacy_p4_title", "Rubrik", "Ta emot intresseanmälningar för uppdrag i föreningen"),
      area("privacy_p4_data", "Uppgifter", "Namn, e-postadress, termin, vilket uppdrag du är intresserad av och det du berättar om dig själv."),
      area("privacy_p4_basis", "Rättslig grund", "Berättigat intresse – att kunna kontakta dig om ett uppdrag i föreningen."),
      area("privacy_p4_retention", "Hur länge", "Raderas automatiskt efter 12 månader."),
    ]),
    sec("b5", "Behandling 5: skräppostskydd", [
      text("privacy_p5_title", "Rubrik", "Skydda formulären mot skräppost och missbruk"),
      area("privacy_p5_data", "Uppgifter", "En oläsbar kontrollsumma (hash) av din IP-adress. IP-adressen sparas aldrig i klartext och kopplas aldrig till ditt meddelande."),
      area("privacy_p5_basis", "Rättslig grund", "Berättigat intresse – att hålla webbplatsen säker och fri från skräppost."),
      area("privacy_p5_retention", "Hur länge", "Raderas automatiskt inom 24 timmar."),
    ]),
    sec("b6", "Behandling 6: styrelsen och utmärkelser", [
      text("privacy_p6_title", "Rubrik", "Visa styrelsen, kursombud och utmärkelser på webbplatsen"),
      area("privacy_p6_data", "Uppgifter", "Namn, roll, föreningens funktionsadress för rollen och – om personen har gett sitt samtycke – ett foto. För hedersmedlemmar och Årets pedagog även år och motivering."),
      area("privacy_p6_basis", "Rättslig grund", "Berättigat intresse – att medlemmar och andra ska veta vem de kan kontakta. Foton publiceras bara med personens samtycke (art. 6.1 a), som kan återkallas när som helst."),
      area("privacy_p6_retention", "Hur länge", "Så länge uppdraget pågår. Hedersmedlemmar och pristagare visas tills vidare, men tas bort om personen ber om det."),
    ]),
    sec("b7", "Behandling 7: bilder från evenemang", [
      text("privacy_p7_title", "Rubrik", "Visa bilder från föreningens evenemang"),
      area("privacy_p7_data", "Uppgifter", "Fotografier där personer kan synas."),
      area("privacy_p7_basis", "Rättslig grund", "Berättigat intresse – att visa föreningens verksamhet. Vi publicerar inte bilder som kan uppfattas som kränkande."),
      area("privacy_p7_retention", "Hur länge", "Tills vidare. Vill du att en bild tas bort gör vi det skyndsamt – mejla oss."),
    ]),
    sec("b8", "Behandling 8: inloggning för styrelsen", [
      text("privacy_p8_title", "Rubrik", "Inloggning för styrelsen i webbplatsens administration"),
      area("privacy_p8_data", "Uppgifter", "Namn, e-postadress, krypterat lösenord, roll, inloggningstider och en logg över vem som ändrat vad på webbplatsen."),
      area("privacy_p8_basis", "Rättslig grund", "Berättigat intresse – att hålla webbplatsen säker och kunna se vem som gjort en ändring."),
      area("privacy_p8_retention", "Hur länge", "Inloggningen gäller i högst 12 timmar. Ändringsloggen sparas i 24 månader. Konton stängs när någon lämnar sitt uppdrag."),
    ]),
    sec("b9", "Behandling 9: statistik till partners", [
      text("privacy_p9_title", "Rubrik", "Statistik till våra samarbetspartners"),
      area("privacy_p9_data", "Uppgifter", "Hur många gånger varje partnersida och jobbannons visas och hur många som klickar vidare till partnerns webbplats eller ansökan – bara som en totalsiffra per dag. Ingenting om dig sparas: ingen IP-adress, inga kakor och inget som kan kopplas till dig."),
      area("privacy_p9_basis", "Rättslig grund", "Inga personuppgifter behandlas. Siffrorna hjälper oss att visa våra partners vad samarbetet ger."),
      area("privacy_p9_retention", "Hur länge", "Totalsiffrorna sparas i tre år."),
    ]),
    sec("b10", "Behandling 10: drift av webbplatsen", [
      text("privacy_p10_title", "Rubrik", "Leverera och skydda webbplatsen"),
      area("privacy_p10_data", "Uppgifter", "Tekniska uppgifter som behövs för att visa sidan, till exempel IP-adress, webbläsare och tidpunkt. De behandlas av vår driftleverantör Cloudflare."),
      area("privacy_p10_basis", "Rättslig grund", "Berättigat intresse – att webbplatsen ska fungera och skyddas mot attacker."),
      area("privacy_p10_retention", "Hur länge", "Kort tid enligt Cloudflares villkor. Vi använder inga analysverktyg och för ingen besöksstatistik om enskilda besökare."),
    ]),
    sec("ovrigt", "Övriga avsnitt", [
      text("privacy_others_title", "Andra personer – rubrik", "Uppgifter om andra personer", { more: true }),
      md("privacy_others_text", "Andra personer – text", "Synpunkter via JF Påverka kan handla om till exempel en kurs, en lärare eller en händelse i föreningen. Uppgifter om andra personer som nämns i ett meddelande används bara för att hantera ärendet och raderas tillsammans med det. Skriv bara det som behövs, och undvik känsliga uppgifter som hälsa, etniskt ursprung eller religion om de inte är nödvändiga för ärendet.", { more: true, help: MD_HELP }),
      text("privacy_voluntary_title", "Frivillighet – rubrik", "Måste du lämna uppgifterna?", { more: true }),
      md("privacy_voluntary_text", "Frivillighet – text", "Nej, allt är frivilligt. Utan namn och e-postadress kan vi dock inte svara på ett meddelande via kontaktformuläret.", { more: true, help: MD_HELP }),
      text("privacy_hitract_title", "Hitract – rubrik", "Medlemskap via Hitract", { more: true }),
      md("privacy_hitract_text", "Hitract – text", "Medlemskapet hanteras i Hitract. När du klickar på ”Bli medlem” lämnar du den här webbplatsen och registrerar dig direkt hos Hitract. Vi sparar inga medlemsuppgifter på den här webbplatsen. Hur medlemsuppgifterna behandlas i Hitract framgår av Hitracts villkor och integritetspolicy.", { more: true, help: MD_HELP }),
      text("privacy_recipients_title", "Mottagare – rubrik", "Vilka som kan ta del av uppgifterna", { more: true }),
      md("privacy_recipients_text", "Mottagare – text", "Inskickade meddelanden kan bara läsas av styrelseledamöter som har ett eget konto till webbplatsens administration. Vi anlitar följande personuppgiftsbiträden, som bara får behandla uppgifterna enligt våra instruktioner:\n\n- **Cloudflare** – drift av webbplatsen, databas, fillagring och skydd mot attacker.\n- **One.com** – föreningens e-post, dit en kopia av inskickade meddelanden skickas.\n\nVi säljer aldrig personuppgifter och lämnar inte ut dem till andra, om vi inte är skyldiga enligt lag.", { more: true, help: MD_HELP }),
      text("privacy_transfer_title", "Överföring – rubrik", "Överföring utanför EU/EES", { more: true }),
      md("privacy_transfer_text", "Överföring – text", "Webbplatsens databas finns i Västeuropa, men Cloudflare är ett amerikanskt företag med servrar i hela världen, och uppgifter kan därför behandlas utanför EU/EES. Cloudflare är certifierat enligt EU–US Data Privacy Framework och har dessutom ingått EU-kommissionens standardavtalsklausuler, vilket gör överföringen laglig enligt GDPR.", { more: true, help: MD_HELP }),
      text("privacy_security_title", "Säkerhet – rubrik", "Så skyddar vi uppgifterna", { more: true }),
      md("privacy_security_text", "Säkerhet – text", "All trafik är krypterad (HTTPS). Lösenord sparas bara i krypterad form, inloggningen låses efter upprepade felaktiga försök, och varje ändring i administrationen loggas. Bara de som behöver har tillgång.", { more: true, help: MD_HELP }),
      text("privacy_rights_title", "Rättigheter – rubrik", "Dina rättigheter", { more: true }),
      md("privacy_rights_text", "Rättigheter – text", "Enligt dataskyddsförordningen (GDPR) har du rätt att\n\n- få veta vilka uppgifter vi har om dig och få en kopia av dem (registerutdrag),\n- få felaktiga uppgifter rättade,\n- få dina uppgifter raderade,\n- begära att behandlingen begränsas,\n- invända mot behandling som grundar sig på berättigat intresse,\n- få ut uppgifter du själv lämnat i ett maskinläsbart format (dataportabilitet), och\n- när som helst återkalla ett samtycke, till exempel till att ett foto publiceras.\n\nMejla [{epost}](mailto:{epost}). Vi svarar inom en månad. Observera att anonyma inskick via JF Påverka inte kan kopplas till dig, så dem kan vi inte söka fram.\n\nOm du anser att vi behandlar dina uppgifter felaktigt kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY), [imy.se](https://www.imy.se).", { more: true, help: "{epost} byts ut mot föreningens e-postadress. " + MD_HELP }),
      text("privacy_automated_title", "Automatiserade beslut – rubrik", "Automatiserade beslut", { more: true }),
      md("privacy_automated_text", "Automatiserade beslut – text", "Vi fattar inga automatiserade beslut och gör ingen profilering.", { more: true, help: MD_HELP }),
      text("privacy_cookies_title", "Kakor – rubrik", "Kakor (cookies)", { more: true }),
      md("privacy_cookies_text", "Kakor – text", "Vanliga besökare får inga kakor. Den enda kakan används för inloggning i administrationen. Läs mer under [Cookie-inställningar](/cookies).", { more: true, help: MD_HELP }),
      text("privacy_changes_title", "Ändringar – rubrik", "Ändringar", { more: true }),
      md("privacy_changes_text", "Ändringar – text", "Vi uppdaterar policyn när vår behandling ändras. Den senaste versionen finns alltid här.", { more: true, help: MD_HELP }),
      text("privacy_updated_label", "Text före datumet", "Senast uppdaterad:", small),
    ]),
    sec("kakor", "Sidan om kakor", [
      text("cookies_title", "Rubrik", "Cookie-inställningar", { required: true }),
      area("cookies_lead", "Ingress", "Den här webbplatsen använder inga kakor för spårning, statistik eller reklam. Därför behöver du inte godkänna något, och vi visar ingen cookie-banner."),
      text("cookies_table_title", "Rubrik för tabellen", "Vilka kakor används?", { more: true }),
      text("cookies_col_name", "Tabell: kolumn 1", "Kaka", small),
      text("cookies_col_purpose", "Tabell: kolumn 2", "Syfte", small),
      text("cookies_col_lifetime", "Tabell: kolumn 3", "Livslängd", small),
      text("cookies_col_who", "Tabell: kolumn 4", "Vem", small),
      area("cookies_session_purpose", "Inloggningskakan – syfte", "Håller styrelsens administratörer inloggade i adminpanelen. Sätts bara när någon loggar in.", { more: true }),
      text("cookies_session_lifetime", "Inloggningskakan – livslängd", "Max 12 timmar", { more: true }),
      text("cookies_session_who", "Inloggningskakan – vem", "Bara administratörer", { more: true }),
      md("cookies_necessary_text", "Text under tabellen", "Kakan är strikt nödvändig för att inloggningen ska fungera och kräver därför inget samtycke enligt lagen (2022:482) om elektronisk kommunikation. Vanliga besökare får inga kakor alls, och webbplatsen sparar inte heller något annat i din webbläsare (som local storage).", { more: true, help: MD_HELP }),
      text("cookies_external_title", "Externa tjänster – rubrik", "Externa tjänster", { more: true }),
      md("cookies_external_text", "Externa tjänster – text", "Vi bäddar inte in Instagram, YouTube, kartor eller liknande, eftersom sådana tjänster ofta sätter egna kakor. I stället länkar vi ut till dem – det är först när du klickar som du lämnar vår webbplats.\n\nInläggen från vårt eget Instagramkonto på startsidan visas från vår egen webbplats: bilderna hämtas och lagras här, så din webbläsare kontaktar inte Instagram förrän du klickar på ett inlägg.\n\nLäs mer om hur vi behandlar personuppgifter i vår [integritetspolicy](/integritetspolicy).", { more: true, help: MD_HELP }),
    ]),
  ]),

  page("felsidor", "Felsidan (sidan finns inte)", "/sidan-finns-inte", [
    sec("404", "Sidan kunde inte hittas", [
      text("notfound_title", "Rubrik", "Sidan kunde inte hittas", { required: true }),
      area("notfound_text", "Text", "Länken kan vara gammal, eller så har sidan flyttats. Prova någon av de här i stället:"),
      text("notfound_link_home", "Länk 1", "Startsidan", small),
      text("notfound_link_calendar", "Länk 2", "Kalendern", small),
      text("notfound_link_news", "Länk 3", "Nyheter", small),
      text("notfound_link_contact", "Länk 4", "Kontakta oss", small),
    ], "Visas när någon går till en adress som inte finns."),
  ]),
] as const;

type AnyField = (typeof PAGES)[number]["sections"][number]["fields"][number];
export type TextKey = AnyField["key"];

/** Alla fält i registret, i ordning. */
export const ALL_FIELDS: readonly FieldDef<TextKey>[] = PAGES.flatMap((p) => p.sections.flatMap((s) => s.fields as readonly FieldDef<TextKey>[]));

export interface FieldLocation {
  page: PageDef;
  section: SectionDef;
  field: FieldDef<TextKey>;
}

/** Var ett fält finns i registret (för sök, länkar och klickbar förhandsvisning). */
export const FIELD_INDEX: ReadonlyMap<string, FieldLocation> = new Map(
  PAGES.flatMap((p) => p.sections.flatMap((s) => (s.fields as readonly FieldDef<TextKey>[]).map((f) => [f.key, { page: p, section: s, field: f }] as const))),
);

export function findPage(id: string | null | undefined): PageDef | undefined {
  return PAGES.find((p) => p.id === id);
}

/** Byt ut {platshållare} i en text. Värdena escapas senare av html``. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([\p{L}_]+)\}/gu, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Adress i adminpanelen där ett visst fält redigeras. */
export function editUrlFor(key: string): string | null {
  const loc = FIELD_INDEX.get(key);
  return loc ? `/admin/texter?sida=${loc.page.id}&falt=${encodeURIComponent(key)}` : null;
}

// Säkerhetskontroll när modulen laddas: varje nyckel får bara finnas en gång.
{
  const seen = new Set<string>();
  for (const f of ALL_FIELDS) {
    if (seen.has(f.key)) throw new Error(`Textnyckeln "${f.key}" finns två gånger i registret`);
    seen.add(f.key);
  }
}
