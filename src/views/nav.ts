/** Webbplatsens navigation. Används av både sidhuvudets meny och sidfotens sidkarta. */
export interface NavLink {
  label: string;
  href: string;
}

export interface NavItem extends NavLink {
  id: string;
  children?: NavLink[];
}

export const NAV: NavItem[] = [
  {
    id: "om",
    label: "Om oss",
    href: "/om-oss",
    children: [
      { label: "Om JFK", href: "/om-oss" },
      { label: "Så styrs JFK", href: "/om-oss#sa-styrs-jfk" },
      { label: "Styrelsen", href: "/om-oss#styrelsen" },
      { label: "Hedersmedlemmar och utmärkelser", href: "/om-oss#utmarkelser" },
      { label: "Årets pedagog", href: "/om-oss#arets-pedagog" },
      { label: "Dokument och protokoll", href: "/dokument" },
      { label: "Bli medlem", href: "/bli-medlem" },
      { label: "Vanliga frågor", href: "/faq" },
    ],
  },
  {
    id: "studenter",
    label: "För studenter",
    href: "/for-studenter",
    children: [
      { label: "Studera på KAU", href: "/for-studenter#studera-pa-kau" },
      { label: "Kursombud", href: "/for-studenter#kursombud" },
      { label: "JFK Idrott", href: "/for-studenter#jfk-idrott" },
      { label: "Bildgalleri", href: "/for-studenter#bildgalleri" },
    ],
  },
  {
    id: "aktuellt",
    label: "Aktuellt",
    href: "/aktuellt",
    children: [
      { label: "Nyheter", href: "/aktuellt" },
      { label: "Kalender", href: "/kalender" },
    ],
  },
  {
    id: "foretag",
    label: "För företag",
    href: "/for-foretag",
    children: [
      { label: "Samarbeta med JFK", href: "/for-foretag" },
      { label: "Våra partners", href: "/partners" },
    ],
  },
  { id: "paverka", label: "JF Påverka", href: "/jf-paverka" },
  { id: "kontakt", label: "Kontakt", href: "/kontakt" },
];

/** Är länken (eller någon av dess barn) den aktuella sidan? */
export function isActive(item: NavItem, path: string): boolean {
  const clean = (h: string) => h.split("#")[0]!;
  if (path === clean(item.href) || path.startsWith(clean(item.href) + "/")) return true;
  return (item.children ?? []).some((c) => {
    const h = clean(c.href);
    return path === h || path.startsWith(h + "/");
  });
}
