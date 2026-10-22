import { html, type SafeHtml } from "../lib/html.js";
import { ec, ek, loadSettings, sc, siteLayout, type Settings } from "../lib/settings.js";
import {
  chairOf,
  committeeCover,
  committeeImages,
  coverFocus,
  loadCommitteeMembers,
  loadCommittees,
  loadGroupPhotos,
  usesTeamPhoto,
  type CommitteeMemberRow,
  type CommitteeRow,
  type GroupPhotoRow,
} from "../lib/committees.js";
import { eventQuery, rows, type EventRow } from "../lib/content.js";
import { renderMarkdown, plainText } from "../lib/markdown.js";
import { stockholmNow, truncate } from "../lib/format.js";
import { fill } from "../lib/texts.js";
import { htmlResponse } from "../lib/http.js";
import { isLinkVisible } from "../lib/pagelayout.js";
import { shownYear, splitByYear, yearState } from "../lib/years.js";
import type { RequestContext } from "../router.js";
import { layout, mediaUrl, picture } from "../views/layout.js";
import { arrowLink, eventCard } from "../views/components.js";
import { icon } from "../views/icons.js";
import { breadcrumb, initials } from "../views/page.js";
import { notFoundPage } from "./errors.js";
import { signupState } from "./forms.js";

/**
 * Utskottens egna sidor (/om-oss/utskott/:slug): anslagsbilden överst, årets medlemmar (den första visas störst),
 * vad utskottet gör med anmälan, bilder, kommande evenemang, tidigare år och övriga utskott.
 * Innehållet ändras under Styrelse och uppdrag → Utskott, rubrikerna under Texter och sidor → Om oss → Utskottens egna sidor.
 *
 * Här finns också affischerna för utseendet Anslagstavlan på Om oss (committeePosters).
 */

export const committeeUrl = (cm: { slug: string }) => `/om-oss/utskott/${cm.slug}`;

/** Utskottets begynnelsebokstav (utan "utskottet") när bild saknas. */
export function committeeMonogram(name: string): string {
  return name.replace(/utskottet$/i, "").trim().charAt(0).toUpperCase() || name.charAt(0).toUpperCase();
}

/**
 * Mjukt bindestreck före "utskott" i sammansatta namn ("Kommunikations­utskottet"), så att långa namn bryts
 * snyggt i smala kort. Webbläsarnas automatiska avstavning saknar ofta svenska.
 */
export function softHyphen(name: string): string {
  return name.replace(/([a-zåäö])(utskott)/giu, "$1­$2");
}


/** "Ordförande: {namn}" med namnet i fetstil. */
function withName(template: string, name: string): SafeHtml {
  const parts = template.split("{namn}");
  return html`${parts.map((p, i) => (i ? html`<strong>${name}</strong>${p}` : html`${p}`))}`;
}

function countText(s: Settings, n: number): string {
  return n === 1 ? s.committees_members_one : fill(s.committees_members_count, { antal: n });
}

/** Anslagstavlan: en affisch per utskott med anslagsbilden, antal medlemmar och ordföranden under. */
export function committeePosters(s: Settings, committees: CommitteeRow[], byCommittee: Map<number, CommitteeMemberRow[]>): SafeHtml {
  return html`<ul class="poster-grid">
    ${committees.map((cm, i) => {
      const cover = committeeCover(cm);
      const members = byCommittee.get(cm.id) ?? [];
      const chair = chairOf(members);
      return html`<li class="poster poster--t${(i % 4) + 1}"${ec(s, `/admin/utskott/${cm.id}`, `Utskott › ${cm.name}`)}>
        <span class="poster-tape" aria-hidden="true"></span>
        <div class="poster-card${cover ? " has-image" : ""}">
          <div class="poster-media focus-${coverFocus(cm)}" aria-hidden="true">
            ${cover
              ? picture(cover.key, { alt: "", sizes: "(min-width: 1100px) 360px, (min-width: 700px) 30vw, 46vw", width: 800, height: 1000 })
              : html`<span class="poster-monogram">${committeeMonogram(cm.name)}</span>`}
          </div>
          ${members.length ? html`<span class="poster-count"${ek(s, "committees_members_count")}>${countText(s, members.length)}</span>` : ""}
          <div class="poster-copy">
            <h3 class="poster-name"><a class="poster-link" href="${committeeUrl(cm)}">${softHyphen(cm.name)}</a></h3>
            ${cm.summary ? html`<p class="poster-text">${cm.summary}</p>` : ""}
          </div>
        </div>
        ${chair ? html`<p class="poster-chair"${ek(s, "committees_chair")}>${withName(s.committees_chair, chair.name)}</p>` : ""}
      </li>`;
    })}
  </ul>`;
}

/** Porträtt i 3:4 med namnskylt, som styrelsens porträttvägg. Utan foto visas initialerna. */
function memberCard(s: Settings, m: CommitteeMemberRow): SafeHtml {
  return html`<li class="person-card${m.photo_key ? " has-photo" : ""}"${ec(s, `/admin/utskottsmedlemmar/${m.id}`, `Utskottsmedlem › ${m.name}`)}>
    <div class="person-photo">
      ${m.photo_key
        ? picture(m.photo_key, { alt: "", sizes: "(min-width: 1000px) 240px, (min-width: 600px) 30vw, 50vw", className: "person-img", width: 600, height: 750 })
        : html`<span class="person-initials" aria-hidden="true">${initials(m.name)}</span>`}
    </div>
    <div class="person-body">
      <h3 class="person-name">${m.name}</h3>
      ${m.role ? html`<p class="person-role">${m.role}</p>` : ""}
      ${m.program ? html`<p class="person-meta">${m.program}</p>` : ""}
    </div>
  </li>`;
}

/** Den som står först i listan: större porträtt, roll, program och ett eget citat. */
function leadMember(s: Settings, m: CommitteeMemberRow, email: string | null | undefined): SafeHtml {
  return html`<article class="cm-lead"${ec(s, `/admin/utskottsmedlemmar/${m.id}`, `Utskottsmedlem › ${m.name}`)}>
    <div class="cm-lead-photo${m.photo_key ? " has-photo" : ""}">
      ${m.photo_key
        ? picture(m.photo_key, { alt: "", sizes: "(min-width: 760px) 300px, 70vw", width: 600, height: 800 })
        : html`<span class="person-initials" aria-hidden="true">${initials(m.name)}</span>`}
    </div>
    <div class="cm-lead-body">
      ${m.role ? html`<p class="cm-lead-role">${m.role}</p>` : ""}
      <h3 class="cm-lead-name">${m.name}</h3>
      ${m.program ? html`<p class="cm-lead-program">${m.program}</p>` : ""}
      ${email ? html`<a class="cm-lead-email" href="mailto:${email}"${ek(s, "committee_contact")}>${icon("mail", "icon icon-sm")}<span>${s.committee_contact}</span><span class="cm-lead-address">${email}</span></a>` : ""}
    </div>
    ${m.quote ? html`<blockquote class="cm-lead-quote"><p>${m.quote}</p></blockquote>` : ""}
  </article>`;
}

/**
 * Tidigare år: namn och roll, och årets gruppbild om den finns (inga porträtt). Används för utskotten och för
 * styrelsen på Om oss. År som bara har en gruppbild (inga inlagda personer) visas också.
 */
export function archiveYears<T extends { name: string; role: string }>(
  archive: { year: string; rows: T[] }[],
  photos: Map<string, GroupPhotoRow> = new Map(),
  shown = "",
): SafeHtml {
  const years = new Map(archive.map((a) => [a.year, a.rows]));
  for (const y of photos.keys()) if (shown && yearState(y, shown) === "tidigare" && !years.has(y)) years.set(y, []);
  const list = [...years.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return html`<div class="archive-years">
    ${list.map(([year, rows]) => {
      const photo = photos.get(year);
      return html`<section class="archive-year${photo ? " has-photo" : ""}" aria-label="${year}">
        <h3 class="archive-year-title">${year}</h3>
        ${photo
          ? html`<figure class="archive-photo"><a href="${mediaUrl(photo.image_key)}" target="_blank" rel="noopener">${picture(photo.image_key, { alt: photo.image_alt, sizes: "(min-width: 900px) 360px, 90vw", width: 800, height: 533 })}<span class="sr-only"> (öppnas i ny flik)</span></a></figure>`
          : ""}
        ${rows.length ? html`<ul class="archive-list">${rows.map((r) => html`<li><span class="archive-name">${r.name}</span>${r.role ? html`<span class="archive-role">${r.role}</span>` : ""}</li>`)}</ul>` : ""}
      </section>`;
    })}
  </div>`;
}

/** Har arkivet något att visa (personer eller en gruppbild från ett tidigare år)? */
export function hasArchive(archive: { year: string }[], photos: Map<string, GroupPhotoRow>, shown: string): boolean {
  return archive.length > 0 || [...photos.keys()].some((y) => yearState(y, shown) === "tidigare");
}

/**
 * Lagbild: årets gruppbild med en numrerad punkt på varje utplacerad person och listan bredvid. Utan JS leder
 * punkterna till personen i listan (:target); med JS (site.js, [data-team]) visas den valda personens kort.
 */
function teamPhoto(s: Settings, nonce: string, photo: GroupPhotoRow, members: CommitteeMemberRow[]): SafeHtml {
  let n = 0;
  const numbered = members.map((m) => ({ m, n: m.marker_x != null && m.marker_y != null ? ++n : 0 }));
  const placed = numbered.filter((x) => x.n);
  const first = numbered[0]!;
  // Positionerna är kontrollerade tal (0–100), så de kan skrivas rakt in i CSS:en.
  const css = placed.map(({ m }) => `#lag-punkt-${m.id}{left:${Number(m.marker_x)}%;top:${Number(m.marker_y)}%}`).join("");
  return html`${css ? html`<style nonce="${nonce}">${css}</style>` : ""}<div class="team" data-team>
    <figure class="team-photo">
      ${picture(photo.image_key, { alt: photo.image_alt, sizes: "(min-width: 1000px) 720px, 100vw", width: 1600, height: 1067 })}
      ${placed.map(
        ({ m, n }) => html`<a class="team-dot" id="lag-punkt-${m.id}" href="#lag-${m.id}" data-team-pick="${m.id}" aria-label="${n}. ${m.name}">${n}</a>`,
      )}
    </figure>
    <div class="team-side">
      ${placed.length ? html`<p class="team-hint"${ek(s, "committee_team_hint")}>${s.committee_team_hint}</p>` : ""}
      <ol class="team-list">
        ${numbered.map(
          ({ m, n }) => html`<li class="team-person${m === first.m ? " is-selected" : ""}" id="lag-${m.id}" data-team-person="${m.id}"${ec(s, `/admin/utskottsmedlemmar/${m.id}`, `Utskottsmedlem › ${m.name}`)}>
            <button class="team-person-head" type="button" data-team-pick="${m.id}" aria-expanded="${m === first.m ? "true" : "false"}">
              <span class="team-num${n ? "" : " is-missing"}" aria-hidden="true">${n || "–"}</span>
              <span class="team-name">${m.name}</span>
              ${m.role ? html`<span class="team-role">${m.role}</span>` : ""}
            </button>
            ${m.program || m.quote || !n
              ? html`<div class="team-detail">
                  ${m.program ? html`<p class="team-program">${m.program}</p>` : ""}
                  ${m.quote ? html`<blockquote class="team-quote"><p>${m.quote}</p></blockquote>` : ""}
                  ${!n ? html`<p class="team-missing"${ek(s, "committee_team_missing")}>${s.committee_team_missing}</p>` : ""}
                </div>`
              : ""}
          </li>`,
        )}
      </ol>
    </div>
  </div>`;
}

export async function committeePage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, all] = await Promise.all([loadSettings(db, c.preview), loadCommittees(db)]);
  const cm = all.find((x) => x.slug === (c.params.slug ?? ""));
  if (!cm) return notFoundPage(c);
  const year = shownYear(s.service_year);
  const [members, events, photos] = await Promise.all([
    loadCommitteeMembers(db, cm.id),
    rows<EventRow>(eventQuery.upcomingForCommittee(db, cm.id, stockholmNow(), 3)).catch(() => [] as EventRow[]),
    loadGroupPhotos(db, cm.id),
  ]);
  const yearPhoto = photos.get(year);
  const { current, archive } = splitByYear(members, year);
  const [lead, ...rest] = current;
  const cover = committeeCover(cm);
  const others = all.filter((o) => o.id !== cm.id);
  const gallery = committeeImages(cm).filter((g) => g.key !== cover?.key);
  const edit = ec(s, `/admin/utskott/${cm.id}`, `Utskott › ${cm.name}`);
  const vars = { namn: cm.name };
  const layoutState = siteLayout(s);
  const signup = signupState(s);
  const canJoin = isLinkVisible(layoutState, "/engagera-dig");

  const chips = [
    current.length ? html`<span class="cm-chip cm-chip-accent"${ek(s, "committees_members_count")}>${countText(s, current.length)}</span>` : "",
    cm.commitment ? html`<span class="cm-chip">${icon("clock", "icon icon-sm")}${cm.commitment}</span>` : "",
    html`<span class="cm-chip"${ek(s, "committee_year")}>${fill(s.committee_year, { år: year })}</span>`,
  ];

  const hero = html`<section class="cm-hero${cover ? " has-image" : sc(s, "committee_top")}" aria-labelledby="utskott-namn">
    ${cover
      ? html`<div class="cm-hero-media focus-${coverFocus(cm)}"${edit}>${picture(cover.key, { alt: cover.alt, sizes: "100vw", width: 2000, height: 1000, eager: true })}</div>`
      : html`<span class="cm-hero-monogram" aria-hidden="true">${committeeMonogram(cm.name)}</span>`}
    <div class="container cm-hero-inner">
      ${breadcrumb([{ href: "/om-oss", label: s.about_kicker }, { href: "/om-oss#utskotten", label: s.committee_breadcrumb }, { label: cm.name }])}
      <h1 class="cm-title" id="utskott-namn"${edit}>${softHyphen(cm.name)}</h1>
      ${cm.summary ? html`<p class="cm-lead-text">${cm.summary}</p>` : ""}
      <div class="cm-chips">${chips}</div>
    </div>
  </section>`;

  const meet = html`<section class="section${sc(s, "committee_meet")}" aria-labelledby="mot-utskottet">
    <div class="container">
      <h2 class="section-title cm-section-title" id="mot-utskottet"${ek(s, "committee_meet_title")}>${s.committee_meet_title}</h2>
      ${!lead
        ? html`<p class="cm-empty"${ek(s, "committee_empty")}>${s.committee_empty}</p>`
        : usesTeamPhoto(cm, yearPhoto)
          ? html`${teamPhoto(s, c.nonce, yearPhoto, current)}
              ${cm.email ? html`<p class="cm-team-email"><a href="mailto:${cm.email}"${ek(s, "committee_contact")}>${icon("mail", "icon icon-sm")}${s.committee_contact}</a> <span>${cm.email}</span></p>` : ""}`
          : html`${leadMember(s, lead, cm.email)}
              ${rest.length ? html`<ul class="person-grid cm-members">${rest.map((m) => memberCard(s, m))}</ul>` : ""}`}
    </div>
  </section>`;

  const joinBox = canJoin
    ? html`<aside class="cm-join" aria-labelledby="vara-med">
        <h2 class="cm-join-title" id="vara-med"${ek(s, "committee_join_title")}>${s.committee_join_title}</h2>
        <p${ek(s, "committee_join_text")}>${s.committee_join_text}</p>
        ${cm.commitment ? html`<p class="cm-join-meta"><span${ek(s, "committee_commitment")}>${s.committee_commitment}:</span> ${cm.commitment}</p>` : ""}
        ${signup.open
          ? html`<a class="btn btn-primary" href="/engagera-dig?utskott=${cm.slug}#anmalan"${ek(s, "engage_committee_join")}>${fill(s.engage_committee_join, { utskott: cm.name })}${icon("arrowRight", "icon icon-sm")}</a>`
          : html`<a class="btn btn-outline" href="/engagera-dig#anmalan"${ek(s, "engage_committee_closed")}>${icon("lock", "icon icon-sm")}${fill(s.engage_committee_closed, { datum: signup.when })}</a>`}
        ${cm.email && !lead ? html`<a class="cm-join-email" href="mailto:${cm.email}">${icon("mail", "icon icon-sm")}${cm.email}</a>` : ""}
      </aside>`
    : "";

  const about =
    cm.body || joinBox
      ? html`<section class="section section-surface${sc(s, "committee_about")}" aria-labelledby="vad-vi-gor">
          <div class="container split split-top">
            <div${edit}>
              <h2 class="section-title cm-section-title" id="vad-vi-gor"${ek(s, "committee_about_title")}>${s.committee_about_title}</h2>
              ${cm.body ? html`<div class="prose prose-lg">${renderMarkdown(cm.body)}</div>` : ""}
            </div>
            ${joinBox}
          </div>
        </section>`
      : "";

  const images = gallery.length
    ? html`<section class="section${sc(s, "committee_photos")}" aria-labelledby="utskott-bilder">
        <div class="container">
          <h2 class="section-title cm-section-title" id="utskott-bilder"${ek(s, "committee_images_title")}>${s.committee_images_title}</h2>
          <ul class="network-gallery network-gallery--${gallery.length}"${edit}>
            ${gallery.map((g, i) => html`<li><figure>${picture(g.key, { alt: g.alt, sizes: i === 0 && gallery.length > 1 ? "(min-width: 900px) 60vw, 100vw" : "(min-width: 900px) 40vw, 100vw", width: 1200, height: 900 })}</figure></li>`)}
          </ul>
        </div>
      </section>`
    : "";

  const eventsBlock = events.length
    ? html`<section class="section${sc(s, "committee_events")}" aria-labelledby="utskott-evenemang">
        <div class="container">
          <div class="section-head">
            <h2 class="section-title cm-section-title" id="utskott-evenemang"${ek(s, "committee_events_title")}>${fill(s.committee_events_title, vars)}</h2>
            ${arrowLink("/kalender", s.committee_events_all, "arrow-link section-link", ek(s, "committee_events_all"))}
          </div>
          <div class="card-grid">${events.map((e) => eventCard(s, e))}</div>
        </div>
      </section>`
    : "";

  const archiveBlock = hasArchive(archive, photos, year)
    ? html`<section class="section section-tight-top${sc(s, "committee_archive")}" aria-labelledby="tidigare-ar">
        <div class="container">
          <details class="archive">
            <summary><span class="archive-summary"><span class="archive-title" id="tidigare-ar"${ek(s, "committee_archive_title")}>${s.committee_archive_title}</span><span class="archive-lead"${ek(s, "committee_archive_lead")}>${fill(s.committee_archive_lead, vars)}</span></span>${icon("chevronDown", "icon icon-sm")}</summary>
            ${archiveYears(archive, photos, year)}
          </details>
        </div>
      </section>`
    : "";

  const more = others.length
    ? html`<section class="section section-surface${sc(s, "committee_more")}" aria-labelledby="fler-utskott">
        <div class="container">
          <h2 class="section-title cm-section-title" id="fler-utskott"${ek(s, "committee_more_title")}>${s.committee_more_title}</h2>
          <ul class="cm-more">
            ${others.map((o) => {
              const oc = committeeCover(o);
              return html`<li class="cm-more-item">
                <span class="cm-more-media focus-${coverFocus(o)}" aria-hidden="true">${oc
                  ? picture(oc.key, { alt: "", sizes: "(min-width: 900px) 220px, 45vw", width: 480, height: 300 })
                  : html`<span class="cm-more-monogram">${committeeMonogram(o.name)}</span>`}</span>
                <a class="cm-more-link" href="${committeeUrl(o)}">${softHyphen(o.name)}</a>
              </li>`;
            })}
          </ul>
        </div>
      </section>`
    : "";

  const content = html`${hero}${meet}${about}${images}${eventsBlock}${archiveBlock}${more}
    <div class="container"><p class="after-list after-list-page">${arrowLink("/om-oss#utskotten", s.committee_back, "arrow-link", ek(s, "committee_back"))}</p></div>`;

  const ogImage = cover ? mediaUrl(cover.key, "md") ?? undefined : undefined;
  return htmlResponse(
    c,
    layout(c, s, { title: cm.name, description: cm.summary ? truncate(cm.summary, 155) : truncate(plainText(cm.body), 155), ogImage, pageId: "om-oss" }, content),
  );
}
