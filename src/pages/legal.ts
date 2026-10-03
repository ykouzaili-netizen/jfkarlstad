import { html } from "../lib/html.js";
import { ek, loadSettings, type SettingKey, type Settings } from "../lib/settings.js";
import { renderInline, renderMarkdown } from "../lib/markdown.js";
import { fill } from "../lib/texts.js";
import { htmlResponse, textResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { layout } from "../views/layout.js";
import { pageHeader } from "../views/page.js";
import { jobQuery } from "../lib/content.js";
import { stockholmToday } from "../lib/format.js";

const PURPOSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Övriga avsnitt i policyn, i ordning. Rubrik + markdowntext från textregistret. */
const PRIVACY_SECTIONS = [
  ["privacy_others_title", "privacy_others_text"],
  ["privacy_voluntary_title", "privacy_voluntary_text"],
  ["privacy_hitract_title", "privacy_hitract_text"],
  ["privacy_recipients_title", "privacy_recipients_text"],
  ["privacy_transfer_title", "privacy_transfer_text"],
  ["privacy_security_title", "privacy_security_text"],
  ["privacy_rights_title", "privacy_rights_text"],
  ["privacy_automated_title", "privacy_automated_text"],
  ["privacy_cookies_title", "privacy_cookies_text"],
  ["privacy_changes_title", "privacy_changes_text"],
] as const;

function privacyVars(s: Settings): Record<string, string> {
  return {
    förening: s.site_name,
    orgnr: s.org_number ? `, organisationsnummer ${s.org_number}` : "",
    adress: [s.address_street, s.address_city].filter(Boolean).join(", "),
    epost: s.contact_email,
  };
}

export async function privacyPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const vars = privacyVars(s);

  const content = html`
    ${pageHeader(s, { kickerKey: "privacy_kicker", titleKey: "privacy_title", leadKey: "privacy_lead" })}
    <section class="section section-tight-top">
      <div class="container narrow prose prose-lg legal">
        <h2${ek(s, "privacy_controller_title")}>${s.privacy_controller_title}</h2>
        <p${ek(s, "privacy_controller_text")}>${renderInline(fill(s.privacy_controller_text, vars))}</p>

        <h2${ek(s, "privacy_purposes_title")}>${s.privacy_purposes_title}</h2>
        <div class="purpose-list">
          ${PURPOSES.map((n) => {
            const k = <T extends string>(suffix: T) => `privacy_p${n}_${suffix}` as `privacy_p${typeof n}_${T}`;
            const title = k("title") as SettingKey;
            const note = n === 3 ? s.privacy_p3_note : "";
            if (!s[title]) return "";
            return html`<section class="purpose-card"${ek(s, title)}>
              <h3>${s[title]}</h3>
              <dl>
                <div><dt>${s.privacy_label_data}</dt><dd>${s[k("data") as SettingKey]}</dd></div>
                <div><dt>${s.privacy_label_basis}</dt><dd>${s[k("basis") as SettingKey]}</dd></div>
                <div><dt>${s.privacy_label_retention}</dt><dd>${s[k("retention") as SettingKey]}</dd></div>
              </dl>
              ${note ? html`<p class="purpose-note">${note}</p>` : ""}
            </section>`;
          })}
        </div>

        ${PRIVACY_SECTIONS.map(([t, x]) =>
          s[x].trim()
            ? html`<h2${ek(s, t)}>${s[t]}</h2><div${ek(s, x)}>${renderMarkdown(fill(s[x], vars))}</div>`
            : "",
        )}

        <p class="muted"${ek(s, "privacy_updated")}>${s.privacy_updated_label} ${s.privacy_updated}.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.privacy_title, description: s.privacy_lead }, content));
}

export async function cookiesPage(c: RequestContext): Promise<Response> {
  const s = await loadSettings(c.env.DB, c.preview);
  const content = html`
    ${pageHeader(s, { kickerKey: "privacy_kicker", titleKey: "cookies_title", leadKey: "cookies_lead" })}
    <section class="section section-tight-top">
      <div class="container narrow prose prose-lg legal">
        <h2${ek(s, "cookies_table_title")}>${s.cookies_table_title}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">${s.cookies_col_name}</th><th scope="col">${s.cookies_col_purpose}</th><th scope="col">${s.cookies_col_lifetime}</th><th scope="col">${s.cookies_col_who}</th></tr></thead>
            <tbody>
              <tr${ek(s, "cookies_session_purpose")}><td><code>__Host-jfk_session</code></td><td>${s.cookies_session_purpose}</td><td>${s.cookies_session_lifetime}</td><td>${s.cookies_session_who}</td></tr>
            </tbody>
          </table>
        </div>
        <div${ek(s, "cookies_necessary_text")}>${renderMarkdown(s.cookies_necessary_text)}</div>
        <h2${ek(s, "cookies_external_title")}>${s.cookies_external_title}</h2>
        <div${ek(s, "cookies_external_text")}>${renderMarkdown(s.cookies_external_text)}</div>
        <p class="muted"${ek(s, "privacy_updated")}>${s.privacy_updated_label} ${s.privacy_updated}.</p>
      </div>
    </section>`;
  return htmlResponse(c, layout(c, s, { title: s.cookies_title, description: s.cookies_lead }, content));
}

export async function sitemapXml(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const site = c.env.SITE_URL.replace(/\/$/, "");
  const [news, events, partners, jobs] = await db.batch([
    db.prepare("SELECT slug, COALESCE(updated_at, published_at) AS mod FROM news WHERE published = 1 AND (published_at IS NULL OR published_at <= datetime('now'))"),
    db.prepare("SELECT slug, updated_at AS mod FROM events WHERE published = 1 AND (publish_at IS NULL OR publish_at <= datetime('now'))"),
    db.prepare("SELECT slug, updated_at AS mod FROM partners WHERE published = 1"),
    jobQuery.open(db, stockholmToday()),
  ]);
  const staticPaths = [
    "/", "/om-oss", "/engagera-dig", "/bli-medlem", "/for-studenter", "/karriar", "/for-foretag", "/partners",
    "/aktuellt", "/kalender", "/dokument", "/jf-paverka", "/faq", "/kontakt", "/integritetspolicy", "/cookies",
  ];
  const entry = (path: string, mod?: string) =>
    `<url><loc>${site}${path}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ""}</url>`;
  const dyn = (res: D1Result | undefined, prefix: string) =>
    ((res?.results ?? []) as { slug: string; mod?: string }[]).map((r) => entry(`${prefix}/${encodeURIComponent(r.slug)}`, r.mod));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    ...staticPaths.map((p) => entry(p)),
    ...dyn(news, "/aktuellt"),
    ...dyn(events, "/kalender"),
    ...dyn(partners, "/partners"),
    ...((jobs?.results ?? []) as { slug: string; updated_at?: string }[]).map((j) => entry(`/karriar/${encodeURIComponent(j.slug)}`, j.updated_at)),
  ].join("\n")}\n</urlset>`;
  return textResponse(xml, "application/xml; charset=utf-8");
}
