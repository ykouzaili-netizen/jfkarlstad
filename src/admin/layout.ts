import { html, raw, type SafeHtml } from "../lib/html.js";
import { loadSettings } from "../lib/settings.js";
import { securityHeaders } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { ASSET_VERSION } from "../views/layout.js";
import { icon, type IconName } from "../views/icons.js";
import { ROLE_LABELS, type Session } from "./auth.js";

/** Kvitton efter en åtgärd. Bara fördefinierade koder – ingen text från URL:en visas. */
const FLASH: Record<string, { kind: "ok" | "error"; text: string }> = {
  sparat: { kind: "ok", text: "Ändringarna är sparade och syns direkt på webbplatsen." },
  skapat: { kind: "ok", text: "Klart! Det nya innehållet är skapat." },
  raderat: { kind: "ok", text: "Borttaget." },
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
};

export interface NavEntry {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  badge?: number;
}

export async function adminLayout(
  c: RequestContext,
  session: Session | null,
  opts: { title: string; active?: string; newCount?: number; narrow?: boolean; wide?: boolean },
  content: SafeHtml,
  status = 200,
): Promise<Response> {
  const s = await loadSettings(c.env.DB);
  const flashCode = c.url.searchParams.get("klart") ?? c.url.searchParams.get("fel") ?? "";
  const flash = FLASH[flashCode];

  const groups: { title: string; items: NavEntry[] }[] = [
    { title: "", items: [{ href: "/admin", label: "Översikt", icon: "sparkle" }] },
    {
      title: "Innehåll",
      items: [
        { href: "/admin/nyheter", label: "Nyheter", icon: "megaphone" },
        { href: "/admin/event", label: "Event", icon: "calendar" },
        { href: "/admin/partners", label: "Partners", icon: "briefcase" },
        { href: "/admin/styrelsen", label: "Styrelsen", icon: "user" },
        { href: "/admin/utmarkelser", label: "Utmärkelser", icon: "sparkle" },
        { href: "/admin/kursombud", label: "Kursombud", icon: "network" },
        { href: "/admin/galleri", label: "Bildgalleri", icon: "instagram" },
        { href: "/admin/faq", label: "Vanliga frågor", icon: "mail" },
        { href: "/admin/dokument", label: "Dokument", icon: "lock" },
      ],
    },
    {
      title: "Webbplatsen",
      items: [
        { href: "/admin/texter", label: "Redigera texter", icon: "megaphone" },
        { href: "/admin/meddelanden", label: "Meddelanden", icon: "mail", badge: opts.newCount },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: "/admin/utseende", label: "Utseende", icon: "sparkle", adminOnly: true },
        { href: "/admin/anvandare", label: "Användare", icon: "user", adminOnly: true },
        { href: "/admin/logg", label: "Ändringslogg", icon: "clock", adminOnly: true },
        { href: "/admin/konto", label: "Mitt konto", icon: "lock" },
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
                return html`<li><a href="${i.href}"${active ? raw(' aria-current="page"') : ""}>${icon(i.icon, "icon icon-sm")}<span>${i.label}</span>${i.badge ? html`<span class="badge" aria-label="${i.badge} nya">${i.badge}</span>` : ""}</a></li>`;
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
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/assets/admin.css?v=${ASSET_VERSION}">
<script src="/assets/admin.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="admin-body${session ? "" : " admin-guest"}">
<a class="skip-link" href="#admin-innehall">Hoppa till innehållet</a>
${session
  ? html`<header class="admin-top">
      <a class="admin-brand" href="/admin"><span class="brand-mark" aria-hidden="true">§</span><span>Adminpanel</span></a>
      <div class="admin-top-actions">
        <a class="admin-top-link" href="/" target="_blank" rel="noopener">${icon("external", "icon icon-sm")}<span>Visa webbplatsen</span></a>
        <span class="admin-user"><span class="admin-user-name">${session.user.name}</span><span class="admin-user-role">${ROLE_LABELS[session.user.role]}</span></span>
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
export function postButton(session: Session, action: string, label: string, opts: { confirm?: string; className?: string } = {}): SafeHtml {
  return html`<form class="inline-form" method="post" action="${action}"${opts.confirm ? html` data-confirm="${opts.confirm}"` : ""}>
    ${csrfField(session)}<button class="${opts.className ?? "btn btn-outline btn-sm"}" type="submit">${label}</button>
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
