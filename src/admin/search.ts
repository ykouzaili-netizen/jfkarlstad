import { html } from "../lib/html.js";
import { loadSettings, type SettingKey } from "../lib/settings.js";
import { PAGES, type FieldDef } from "../lib/texts.js";
import { highlight, matches, MIN_QUERY, normalizeQuery, snippet, terms } from "../lib/search.js";
import { formatDate } from "../lib/format.js";
import type { RequestContext } from "../router.js";
import { resolveMenu } from "../views/nav.js";
import { icon, type IconName } from "../views/icons.js";
import type { Session } from "./auth.js";
import { adminHead, adminLayout, newMessageCount } from "./layout.js";

/**
 * "Hitta text på webbplatsen": sök bland alla texter (nuvarande lydelse och fältens namn) och allt
 * innehåll (nyheter, event, jobb, frågor, partners, styrelsen …). Varje träff länkar dit den ändras.
 */

interface Hit {
  title: string;
  where: string;
  text: string;
  href: string;
}

interface Group {
  label: string;
  icon: IconName;
  hits: Hit[];
}

export async function adminSearchPage(c: RequestContext, session: Session): Promise<Response> {
  const db = c.env.DB;
  const q = normalizeQuery(c.url.searchParams.get("q"));
  const ts = terms(q);
  const searching = q.replace(/\s/g, "").length >= MIN_QUERY;
  let groups: Group[] = [];

  if (searching) {
    const s = await loadSettings(db);
    const textHits: Hit[] = [];
    for (const page of PAGES) {
      for (const sec of page.sections) {
        for (const f of sec.fields as readonly FieldDef[]) {
          if (f.type === "image") continue;
          const value = s[f.key as SettingKey] ?? "";
          if (!matches(ts, value, f.label, sec.title, page.title)) continue;
          textHits.push({
            title: f.label,
            where: `${page.title} › ${sec.title}`,
            text: snippet(ts, value, 180) || "(tom)",
            href: `/admin/texter?sida=${page.id}&falt=${f.key}`,
          });
        }
      }
    }
    // Träffar i själva texten före träffar i fältnamnet
    textHits.sort((a, b) => Number(matches(ts, b.text)) - Number(matches(ts, a.text)));

    const menuHits: Hit[] = [];
    for (const item of resolveMenu(s)) {
      for (const it of [item, ...(item.children ?? [])]) {
        if (matches(ts, it.label)) menuHits.push({ title: it.label, where: "Menyn", text: it.hidden ? "Dold i menyn" : it.href, href: `/admin/texter?sida=meny#meny-${it.id}` });
      }
    }

    const [news, events, jobs, faq, partners, board, docs, positions, gallery, reps] = await db.batch([
      db.prepare("SELECT id, title, excerpt, body, published, published_at FROM news ORDER BY id DESC LIMIT 500"),
      db.prepare("SELECT id, title, summary, body, location, starts_at FROM events ORDER BY starts_at DESC LIMIT 500"),
      db.prepare("SELECT id, title, employer, summary, body, location FROM jobs ORDER BY id DESC LIMIT 300"),
      db.prepare("SELECT id, question, answer, category FROM faq"),
      db.prepare("SELECT id, name, tagline, description FROM partners"),
      db.prepare("SELECT id, name, role, email FROM board_members"),
      db.prepare("SELECT id, title, year, category FROM documents"),
      db.prepare("SELECT id, title, committee, description FROM positions"),
      db.prepare("SELECT id, alt, caption, album FROM gallery_images"),
      db.prepare("SELECT id, term, name, email FROM course_reps"),
    ]);
    type R = Record<string, string | number | null>;
    const rows = (r: D1Result | undefined) => (r?.results ?? []) as R[];
    const str = (v: unknown) => (v == null ? "" : String(v));
    const make = (list: R[], path: string, title: string, fields: string[], where: (r: R) => string, textField?: string): Hit[] =>
      list
        .filter((r) => matches(ts, ...fields.map((f) => str(r[f]))))
        .map((r) => ({
          title: str(r[title]) || "(utan namn)",
          where: where(r),
          text: textField ? snippet(ts, fields.map((f) => str(r[f])).find((v) => matches(ts, v)) ?? str(r[textField]), 180) : "",
          href: `/admin/${path}/${r.id}`,
        }));

    groups = [
      { label: "Texter på webbplatsen", icon: "edit" as IconName, hits: textHits },
      { label: "Menyn", icon: "menuList" as IconName, hits: menuHits },
      { label: "Nyheter", icon: "megaphone" as IconName, hits: make(rows(news), "nyheter", "title", ["title", "excerpt", "body"], (r) => (r.published ? `Publicerad ${formatDate(str(r.published_at))}` : "Utkast"), "excerpt") },
      { label: "Event", icon: "calendar" as IconName, hits: make(rows(events), "event", "title", ["title", "summary", "body", "location"], (r) => str(r.starts_at).replace("T", " kl. "), "summary") },
      { label: "Jobb och praktik", icon: "briefcase" as IconName, hits: make(rows(jobs), "jobb", "title", ["title", "employer", "summary", "body", "location"], (r) => str(r.employer), "summary") },
      { label: "Vanliga frågor", icon: "mail" as IconName, hits: make(rows(faq), "faq", "question", ["question", "answer"], (r) => str(r.category), "answer") },
      { label: "Partners", icon: "briefcase" as IconName, hits: make(rows(partners), "partners", "name", ["name", "tagline", "description"], (r) => str(r.tagline), "description") },
      { label: "Styrelsen", icon: "users" as IconName, hits: make(rows(board), "styrelsen", "name", ["name", "role", "email"], (r) => str(r.role)) },
      { label: "Kursombud", icon: "users" as IconName, hits: make(rows(reps), "kursombud", "term", ["term", "name", "email"], (r) => str(r.name) || "Meddelas senare") },
      { label: "Lediga uppdrag", icon: "users" as IconName, hits: make(rows(positions), "uppdrag", "title", ["title", "committee", "description"], (r) => str(r.committee), "description") },
      { label: "Dokument", icon: "lock" as IconName, hits: make(rows(docs), "dokument", "title", ["title", "year"], (r) => `${str(r.year)}`) },
      { label: "Bildgalleri", icon: "image" as IconName, hits: make(rows(gallery), "galleri", "alt", ["alt", "caption", "album"], (r) => str(r.album)) },
    ].filter((g) => g.hits.length);
  }
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  const LIMIT = 30;

  const content = html`
    ${adminHead("Hitta text på webbplatsen", { lead: "Skriv ett ord eller en mening som finns på webbplatsen – eller namnet på fältet – så visar vi var du ändrar det." })}
    <form class="admin-search-form" method="get" action="/admin/sok" role="search">
      <label class="sr-only" for="admin-sok-falt">Sök</label>
      <span class="texts-search-icon" aria-hidden="true">${icon("search", "icon icon-sm")}</span>
      <input type="search" id="admin-sok-falt" name="q" value="${q}" placeholder="T.ex. sittning, Bli medlem eller organisationsnummer" autocomplete="off" maxlength="100"${q ? "" : html` autofocus`}>
      <button class="btn btn-primary" type="submit">Sök</button>
    </form>
    ${q && !searching ? html`<p class="muted search-note">Skriv minst två bokstäver.</p>` : ""}
    ${searching && !total ? html`<div class="admin-empty"><p>Inget hittades för ”${q}”. Prova ett annat ord – eller bläddra bland <a href="/admin/texter">alla sidor</a>.</p></div>` : ""}
    ${searching && total ? html`<p class="muted search-note" role="status">${total} ${total === 1 ? "träff" : "träffar"} för ”${q}”</p>` : ""}
    ${groups.map(
      (g) => html`<section class="admin-card search-group-admin">
        <h2 class="card-heading">${icon(g.icon, "icon icon-sm")}${g.label} <span class="pill">${g.hits.length}</span></h2>
        <ul class="admin-hits">
          ${g.hits.slice(0, LIMIT).map(
            (h) => html`<li><a class="admin-hit" href="${h.href}">
              <span class="admin-hit-where">${h.where}</span>
              <span class="admin-hit-title">${highlight(h.title, ts)}</span>
              ${h.text ? html`<span class="admin-hit-text">${highlight(h.text, ts)}</span>` : ""}
            </a></li>`,
          )}
        </ul>
        ${g.hits.length > LIMIT ? html`<p class="muted">Visar de första ${LIMIT}. Gör sökningen mer exakt för att se fler.</p>` : ""}
      </section>`,
    )}`;
  return adminLayout(c, session, { title: q ? `Sök: ${q}` : "Hitta text", active: "/admin/sok", newCount: await newMessageCount(db), searchQuery: q }, content);
}
