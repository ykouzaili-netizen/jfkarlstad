import { html, raw, type SafeHtml } from "../lib/html.js";
import { loadSettings, type Settings } from "../lib/settings.js";
import { securityHeaders } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { ASSET_VERSION, favicon, mediaUrl } from "../views/layout.js";
import { icon, type IconName } from "../views/icons.js";
import { ROLE_LABELS, type Session } from "./auth.js";

/** Kvitton efter en åtgärd. Bara fördefinierade koder – ingen text från URL:en visas. */
const FLASH: Record<string, { kind: "ok" | "error"; text: string }> = {
  sparat: { kind: "ok", text: "Ändringarna är sparade och syns direkt på webbplatsen." },
  skapat: { kind: "ok", text: "Klart! Det nya innehållet är skapat." },
  raderat: { kind: "ok", text: "Borttaget." },
  uppbyggnad_aterstalld: { kind: "ok", text: "Sidans uppbyggnad är återställd: ordinarie ordning, alla avsnitt synliga och standardstorlek på alla texter." },
  justerat: { kind: "ok", text: "Bilden är justerad. Ändringen syns direkt överallt där bilden används." },
  aterstallt_bild: { kind: "ok", text: "Bilden visas nu som från början." },
  publicerat: { kind: "ok", text: "Publicerat – nu syns det på webbplatsen." },
  avpublicerat: { kind: "ok", text: "Avpublicerat – det syns inte längre på webbplatsen." },
  hanterad: { kind: "ok", text: "Meddelandet är markerat som hanterat." },
  ny: { kind: "ok", text: "Meddelandet är markerat som nytt igen." },
  aterstallt: { kind: "ok", text: "Färger och typsnitt är återställda till standard." },
  losenord: { kind: "ok", text: "Ditt lösenord är bytt." },
  inloggad: { kind: "ok", text: "Välkommen in!" },
  behorighet: { kind: "error", text: "Den sidan kräver administratörsbehörighet." },
  csrf: { kind: "error", text: "Formuläret hade gått ut. Försök igen." },
  uppladdning: { kind: "error", text: "Filen kunde inte laddas upp. Kontrollera filtyp och storlek." },
  oforandrat: { kind: "ok", text: "Inget hade ändrats, så det fanns inget att spara." },
  schemalagt: { kind: "ok", text: "Sparat och schemalagt – det dyker upp på webbplatsen vid den tid du valde." },
  kopierat: { kind: "ok", text: "Kopian är skapad som ett utkast. Ändra det som ska ändras och publicera när du är klar." },
  angrat: { kind: "ok", text: "Ändringen är ångrad. Texterna är tillbaka som de var." },
  "angrat-delvis": { kind: "ok", text: "Ändringen är ångrad, utom för texter som någon har ändrat igen efteråt." },
  "aterstallt-text": { kind: "ok", text: "Versionen är återställd och syns nu på webbplatsen." },
  anvands: { kind: "error", text: "Bilden används fortfarande och kan inte tas bort." },
  instagram: { kind: "error", text: "Inläggen kunde inte hämtas från Instagram. Se felet i rutan nedan – oftast har nyckeln gått ut och behöver bytas." },
  "bild-borta": { kind: "error", text: "Bilden i den versionen finns inte kvar i bildbanken och kan inte återställas." },
};

export interface NavEntry {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  /** Visas bara i mobilmenyn (på dator finns länken i toppraden). */
  mobileOnly?: boolean;
  badge?: number;
}

/** Föreningens logotyp (Utseende → Logotyp) bredvid "Adminpanel", annars §-märket. */
function brandMark(s: Settings): SafeHtml {
  const src = s.logo_key ? mediaUrl(s.logo_key) : null;
  return src ? html`<img class="brand-logo" src="${src}" alt="" width="36" height="36">` : html`<span class="brand-mark" aria-hidden="true">§</span>`;
}

/** Platsen för märket på inloggningssidorna (guestCard i auth-pages.ts); byts mot logotypen i adminLayout. */
export const BRAND_SLOT = '<span class="brand-mark" aria-hidden="true" data-brand-slot>§</span>';

export async function adminLayout(
  c: RequestContext,
  session: Session | null,
  opts: { title: string; active?: string; newCount?: number; narrow?: boolean; wide?: boolean; searchQuery?: string },
  content: SafeHtml,
  status = 200,
): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  if (content.value.includes(BRAND_SLOT)) content = raw(content.value.replace(BRAND_SLOT, brandMark(s).value));
  const flashCode = c.url.searchParams.get("klart") ?? c.url.searchParams.get("fel") ?? "";
  const flash = FLASH[flashCode];

  const groups: { title: string; items: NavEntry[] }[] = [
    {
      title: "",
      items: [
        { href: "/admin", label: "Översikt", icon: "sparkle" },
        { href: "/admin/meddelanden", label: "Meddelanden", icon: "mail", badge: opts.newCount },
      ],
    },
    {
      title: "Webbplatsen",
      items: [
        { href: "/admin/texter", label: "Texter och sidor", icon: "edit" },
        { href: "/admin/utseende", label: "Utseende", icon: "sparkle", adminOnly: true },
        { href: "/admin/bildbank", label: "Bildbank", icon: "image" },
      ],
    },
    {
      title: "Innehåll",
      items: [
        { href: "/admin/nyheter", label: "Nyheter", icon: "megaphone" },
        { href: "/admin/event", label: "Event", icon: "calendar" },
        { href: "/admin/jobb", label: "Jobb och praktik", icon: "briefcase" },
        { href: "/admin/partners", label: "Partners", icon: "chart" },
        { href: "/admin/dokument", label: "Dokument", icon: "lock" },
        { href: "/admin/faq", label: "Vanliga frågor", icon: "network" },
        { href: "/admin/galleri", label: "Bildgalleri", icon: "image" },
        { href: "/admin/instagram", label: "Instagram", icon: "instagram" },
      ],
    },
    {
      title: "Föreningen",
      items: [{ href: "/admin/styrelsen", label: "Styrelse och uppdrag", icon: "users" }],
    },
    {
      title: "Administration",
      items: [
        { href: "/admin/anvandare", label: "Användare", icon: "user", adminOnly: true },
        { href: "/admin/e-post", label: "E-post", icon: "mail", adminOnly: true },
        { href: "/admin/styrelseskifte", label: "Styrelseskifte", icon: "checklist", adminOnly: true },
        { href: "/admin/logg", label: "Ändringslogg", icon: "history", adminOnly: true },
        { href: "/admin/konto", label: "Mitt konto", icon: "lock", mobileOnly: true },
      ],
    },
  ];

  const nav = session
    ? html`<nav class="admin-nav" id="adminmeny" aria-label="Adminmeny">
        ${groups.map((g) => {
          const items = g.items.filter((i) => !i.adminOnly || session.user.role === "admin");
          if (!items.length) return "";
          return html`<div class="admin-nav-group">
            ${g.title ? html`<p class="admin-nav-title">${g.title}</p>` : ""}
            <ul>
              ${items.map((i) => {
                const active = opts.active === i.href;
                return html`<li${i.mobileOnly ? raw(' class="mobile-only"') : ""}><a href="${i.href}"${active ? raw(' aria-current="page"') : ""}>${icon(i.icon, "icon icon-sm")}<span>${i.label}</span>${i.badge ? html`<span class="badge" aria-label="${i.badge} nya">${i.badge}</span>` : ""}</a></li>`;
              })}
            </ul>
          </div>`;
        })}
      </nav>`
    : "";

  const body = html`<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${opts.title} | Adminpanel – ${s.site_short_name}</title>
${favicon(s)}
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/assets/admin.css?v=${ASSET_VERSION}">
<script src="/assets/admin.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="admin-body${session ? "" : " admin-guest"}">
<a class="skip-link" href="#admin-innehall">Hoppa till innehållet</a>
${session
  ? html`<header class="admin-top">
      <a class="admin-brand" href="/admin">${brandMark(s)}<span>Adminpanel</span></a>
      <form class="admin-top-search" method="get" action="/admin/sok" role="search">
        <label class="sr-only" for="topp-sok">Hitta text eller innehåll</label>
        <span class="admin-top-search-icon" aria-hidden="true">${icon("search", "icon icon-sm")}</span>
        <input type="search" id="topp-sok" name="q" value="${opts.searchQuery ?? ""}" placeholder="Hitta text eller innehåll …" autocomplete="off" maxlength="100">
      </form>
      <div class="admin-top-actions">
        <a class="admin-top-link" href="/" target="_blank" rel="noopener">${icon("external", "icon icon-sm")}<span>Visa webbplatsen</span></a>
        <a class="admin-user" href="/admin/konto" title="Mitt konto"><span class="admin-user-name">${session.user.name}</span><span class="admin-user-role">${ROLE_LABELS[session.user.role]} · Mitt konto</span></a>
        <form method="post" action="/admin/logga-ut"><input type="hidden" name="_csrf" value="${session.csrf}"><button class="btn btn-outline btn-sm" type="submit">Logga ut</button></form>
        <button class="admin-menu-toggle" type="button" aria-expanded="false" aria-controls="adminmeny" data-admin-menu>${icon("menu")}<span class="sr-only">Meny</span></button>
      </div>
    </header>`
  : ""}
<div class="admin-shell">
  ${nav}
  <main class="admin-main${opts.narrow ? " admin-main-narrow" : ""}${opts.wide ? " admin-main-wide" : ""}" id="admin-innehall" tabindex="-1">
    ${flash ? html`<div class="alert alert-${flash.kind}" role="status" data-flash>${flash.text}</div>` : ""}
    ${content}
  </main>
</div>
${session
  ? html`<dialog class="bank-dialog" aria-labelledby="bank-titel" data-bank-dialog>
      <div class="bank-head">
        <h2 class="bank-title" id="bank-titel">Välj en bild från bildbanken</h2>
        <button class="lp-close bank-close" type="button" data-bank-close aria-label="Stäng">✕</button>
      </div>
      <div class="bank-body" data-bank-body><p class="muted">Laddar bilderna …</p></div>
    </dialog>`
  : ""}
</body>
</html>`;

  return new Response(body.value, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...securityHeaders(c.nonce),
    },
  });
}

export function adminHead(title: string, opts: { lead?: string; actions?: SafeHtml; back?: { href: string; label: string } } = {}): SafeHtml {
  return html`<div class="admin-head">
    <div>
      ${opts.back ? html`<a class="admin-back" href="${opts.back.href}">← ${opts.back.label}</a>` : ""}
      <h1 class="admin-title">${title}</h1>
      ${opts.lead ? html`<p class="admin-lead">${opts.lead}</p>` : ""}
    </div>
    ${opts.actions ? html`<div class="admin-head-actions">${opts.actions}</div>` : ""}
  </div>`;
}

export function csrfField(session: Session): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${session.csrf}">`;
}

/** Liten POST-knapp (t.ex. radera/publicera) med CSRF och valfri bekräftelsefråga. */
export function postButton(session: Session, action: string, label: string, opts: { confirm?: string; className?: string; hidden?: Record<string, string> } = {}): SafeHtml {
  return html`<form class="inline-form" method="post" action="${action}"${opts.confirm ? html` data-confirm="${opts.confirm}"` : ""}>
    ${csrfField(session)}${Object.entries(opts.hidden ?? {}).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}<button class="${opts.className ?? "btn btn-outline btn-sm"}" type="submit">${label}</button>
  </form>`;
}

export function statusPill(on: boolean, onLabel = "Publicerad", offLabel = "Utkast"): SafeHtml {
  return html`<span class="pill ${on ? "pill-on" : "pill-off"}">${on ? onLabel : offLabel}</span>`;
}

export async function newMessageCount(db: D1Database): Promise<number> {
  try {
    return (await db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'ny'").first<{ n: number }>())?.n ?? 0;
  } catch {
    return 0;
  }
}
