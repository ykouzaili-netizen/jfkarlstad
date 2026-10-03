import type { Settings } from "../lib/settings.js";

/**
 * Webbplatsens meny. Används av sidhuvudets meny och sidfotens sidkarta.
 * Namn, ordning och synlighet kan ändras i adminpanelen (Texter och sidor → Menyn) och sparas
 * som JSON i inställningen `menu_config`. Adresserna (href) styrs alltid av koden här.
 */
export interface NavLink {
  id: string;
  label: string;
  href: string;
}

export interface NavItem extends NavLink {
  children?: NavLink[];
}

export const DEFAULT_NAV: NavItem[] = [
  {
    id: "om",
    label: "Om oss",
    href: "/om-oss",
    children: [
      { id: "om-jfk", label: "Om JFK", href: "/om-oss" },
      { id: "styrning", label: "Så styrs JFK", href: "/om-oss#sa-styrs-jfk" },
      { id: "styrelsen", label: "Styrelsen", href: "/om-oss#styrelsen" },
      { id: "utmarkelser", label: "Hedersmedlemmar och utmärkelser", href: "/om-oss#utmarkelser" },
      { id: "pedagog", label: "Årets pedagog", href: "/om-oss#arets-pedagog" },
      { id: "engagera", label: "Engagera dig", href: "/engagera-dig" },
      { id: "dokument", label: "Dokument och protokoll", href: "/dokument" },
      { id: "medlem", label: "Bli medlem", href: "/bli-medlem" },
      { id: "faq", label: "Vanliga frågor", href: "/faq" },
    ],
  },
  {
    id: "studenter",
    label: "För studenter",
    href: "/for-studenter",
    children: [
      { id: "studera", label: "Studera på KAU", href: "/for-studenter#studera-pa-kau" },
      { id: "jobb", label: "Jobb och praktik", href: "/karriar" },
      { id: "kursombud", label: "Kursombud", href: "/for-studenter#kursombud" },
      { id: "idrott", label: "JFK Idrott", href: "/for-studenter#jfk-idrott" },
      { id: "galleri", label: "Bildgalleri", href: "/for-studenter#bildgalleri" },
    ],
  },
  {
    id: "aktuellt",
    label: "Aktuellt",
    href: "/aktuellt",
    children: [
      { id: "nyheter", label: "Nyheter", href: "/aktuellt" },
      { id: "kalender", label: "Kalender", href: "/kalender" },
    ],
  },
  {
    id: "foretag",
    label: "För företag",
    href: "/for-foretag",
    children: [
      { id: "samarbeta", label: "Samarbeta med JFK", href: "/for-foretag" },
      { id: "partners", label: "Våra partners", href: "/partners" },
    ],
  },
  { id: "paverka", label: "JF Påverka", href: "/jf-paverka" },
  { id: "kontakt", label: "Kontakt", href: "/kontakt" },
];

/** Så sparas menyn i databasen. */
export interface MenuConfigItem {
  id: string;
  label?: string;
  hidden?: boolean;
  children?: { id: string; label?: string; hidden?: boolean }[];
}

export interface ResolvedLink extends NavLink {
  hidden: boolean;
  defaultLabel: string;
}

export interface ResolvedItem extends ResolvedLink {
  children?: ResolvedLink[];
}

const MAX_LABEL = 60;

function cleanLabel(label: unknown, fallback: string): string {
  const l = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) : "";
  return l || fallback;
}

export function parseMenuConfig(json: string): MenuConfigItem[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as unknown;
    return Array.isArray(data) ? (data.filter((x) => x && typeof x === "object" && typeof (x as MenuConfigItem).id === "string") as MenuConfigItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Hela menyn med sparade namn, ordning och synlighet – även dolda punkter (för adminpanelen).
 * Punkter som finns i koden men inte i den sparade menyn läggs sist, så nya sidor syns automatiskt.
 */
export function resolveMenu(s: Settings): ResolvedItem[] {
  const config = parseMenuConfig(s.menu_config);
  const byId = new Map(config.map((c) => [c.id, c]));
  const ordered = [
    ...config.map((c) => DEFAULT_NAV.find((d) => d.id === c.id)).filter((d): d is NavItem => Boolean(d)),
    ...DEFAULT_NAV.filter((d) => !byId.has(d.id)),
  ];
  return ordered.map((d) => {
    const cfg = byId.get(d.id);
    const childCfg = new Map((cfg?.children ?? []).map((c) => [c.id, c]));
    const children = d.children
      ? [
          ...(cfg?.children ?? []).map((c) => d.children!.find((dc) => dc.id === c.id)).filter((x): x is NavLink => Boolean(x)),
          ...d.children.filter((dc) => !childCfg.has(dc.id)),
        ].map((dc) => {
          const cc = childCfg.get(dc.id);
          return { ...dc, label: cleanLabel(cc?.label, dc.label), hidden: Boolean(cc?.hidden), defaultLabel: dc.label };
        })
      : undefined;
    return { ...d, label: cleanLabel(cfg?.label, d.label), hidden: Boolean(cfg?.hidden), defaultLabel: d.label, children };
  });
}

/** Menyn som den visas på webbplatsen (utan dolda punkter). */
export function visibleMenu(s: Settings): NavItem[] {
  return resolveMenu(s)
    .filter((i) => !i.hidden)
    .map((i) => ({
      id: i.id,
      label: i.label,
      href: i.href,
      children: i.children ? i.children.filter((c) => !c.hidden).map(({ id, label, href }) => ({ id, label, href })) : undefined,
    }))
    .map((i) => (i.children && i.children.length === 0 ? { ...i, children: undefined } : i));
}

/** Är länken (eller någon av dess barn) den aktuella sidan? */
export function isActive(item: NavItem, path: string): boolean {
  const clean = (h: string) => h.split("#")[0]!;
  if (path === clean(item.href) || path.startsWith(clean(item.href) + "/")) return true;
  return (item.children ?? []).some((c) => {
    const h = clean(c.href);
    return path === h || path.startsWith(h + "/");
  });
}
