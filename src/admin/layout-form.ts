import { html, type SafeHtml } from "../lib/html.js";
import {
  blockOrder,
  canHidePage,
  isBlockHidden,
  LAYOUT_PREFIX,
  PAGE_LAYOUTS,
  parseStyle,
  serializeStyle,
  type SiteLayout,
  type TextStyle,
} from "../lib/pagelayout.js";
import type { FieldDef, PageDef, SectionDef } from "../lib/texts.js";
import { icon } from "../views/icons.js";

/**
 * Formulärdelarna i "Texter och sidor" som styr sidans uppbyggnad: visa/dölj sidan, avsnittens ordning
 * och synlighet, och varje texts storlek och justering. Samma tolkning används när formuläret sparas
 * (texts.ts) och i förhandsvisningen (preview.ts), så att förhandsvisningen alltid visar det som sparas.
 *
 * Fältnamn:  __sida_synlig=1   __ordning=a,b,c   __visa__<avsnitt>=1   __stil_storlek__<nyckel>   __stil_just__<nyckel>
 */

/** Texttyper som kan få egen storlek och justering. */
const STYLABLE: readonly FieldDef["type"][] = ["text", "textarea", "lines", "rich", "markdown"];

export function isStylable(f: FieldDef): boolean {
  return STYLABLE.includes(f.type);
}

/** Inställningsrader (nyckel → värde, null = ta bort) som formuläret ger för en sida. */
export function layoutEntries(form: FormData, page: PageDef): [string, string | null][] {
  const out: [string, string | null][] = [];
  const def = PAGE_LAYOUTS[page.id];
  if (def && canHidePage(page.id) && form.has("__sida_finns")) {
    out.push([LAYOUT_PREFIX.page + page.id, form.get("__sida_synlig") ? null : "dold"]);
  }
  if (def && def.blocks.length && form.has("__ordning")) {
    const known = def.blocks.map((b) => b.id);
    const order = String(form.get("__ordning") ?? "")
      .split(",")
      .filter((id, i, all) => known.includes(id) && all.indexOf(id) === i);
    const isDefault = order.length === 0 || order.join(",") === known.slice(0, order.length).join(",");
    out.push([LAYOUT_PREFIX.order + page.id, isDefault ? null : order.join(",")]);
    const hidden = known.filter((id) => !form.get(`__visa__${id}`));
    out.push([LAYOUT_PREFIX.hidden + page.id, hidden.length ? hidden.join(",") : null]);
  }
  for (const sec of page.sections) {
    for (const f of sec.fields as readonly FieldDef[]) {
      if (!isStylable(f) || !form.has(`__stil_storlek__${f.key}`)) continue;
      const st = parseStyle(`${form.get(`__stil_storlek__${f.key}`)},${form.get(`__stil_just__${f.key}`) ?? ""}`);
      out.push([LAYOUT_PREFIX.style + f.key, st ? serializeStyle(st) : null]);
    }
  }
  return out;
}

// ───────────────────────── Markup ─────────────────────────

/** Rutan högst upp: visa eller dölj hela sidan. */
export function pageVisibilityCard(page: PageDef, layout: SiteLayout): SafeHtml | string {
  if (!canHidePage(page.id)) return "";
  const hidden = layout.hiddenPages.has(page.id);
  return html`<div class="page-visibility${hidden ? " is-hidden" : ""}" data-page-visibility>
    <input type="hidden" name="__sida_finns" value="1">
    <label class="switch">
      <input type="checkbox" name="__sida_synlig" value="1"${hidden ? "" : html` checked`} data-page-visible>
      <span class="switch-track" aria-hidden="true"></span>
      <span class="switch-text"><strong>Visa sidan på webbplatsen</strong>
        <span class="switch-hint" data-visible-hint>${hidden
          ? "Sidan är dold. Besökare får ”Sidan finns inte”, och länkarna till den är borttagna från menyn och sidfoten."
          : "Stäng av för att dölja sidan helt – t.ex. under en period då den inte är aktuell. Inga texter försvinner."}</span>
      </span>
    </label>
  </div>`;
}

/** Fält och knappar för ett flyttbart avsnitt (överst i avsnittets innehåll). */
export function blockControls(pageId: string, blockId: string, layout: SiteLayout): SafeHtml {
  const hidden = isBlockHidden(layout, pageId, blockId);
  return html`<div class="block-controls">
    <label class="check-field check-small">
      <input type="checkbox" name="__visa__${blockId}" value="1"${hidden ? "" : html` checked`} data-block-visible>
      <span>Visa avsnittet på webbplatsen</span>
    </label>
    <span class="block-move" role="group" aria-label="Flytta avsnittet">
      <button type="button" class="btn btn-outline btn-sm" data-move="up">${icon("arrowUp", "icon icon-sm")}Flytta upp</button>
      <button type="button" class="btn btn-outline btn-sm" data-move="down">${icon("arrowDown", "icon icon-sm")}Flytta ned</button>
    </span>
  </div>`;
}

/** Storlek och justering för en text. Dold bakom en knapp så att redigeringen inte blir plottrig. */
export function textStyleControls(f: FieldDef, style: TextStyle | undefined): SafeHtml | string {
  if (!isStylable(f)) return "";
  const size = style?.size ?? 100;
  const align = style?.align ?? "";
  const id = `stil-${f.key}`;
  const opts: [string, string][] = [["", "Standard"], ["left", "Vänster"], ["center", "Centrerad"], ["right", "Höger"]];
  return html`<details class="text-style"${style ? html` open` : ""} data-text-style="${f.key}">
    <summary>${icon("type", "icon icon-sm")}Storlek och placering${style ? html`<span class="text-style-badge">${size} %${align ? ` · ${opts.find((o) => o[0] === align)![1].toLowerCase()}` : ""}</span>` : ""}</summary>
    <div class="text-style-body">
      <div class="text-style-size">
        <label for="${id}-storlek">Storlek</label>
        <input type="range" id="${id}-storlek" name="__stil_storlek__${f.key}" min="50" max="250" step="5" value="${size}" data-style-size>
        <output for="${id}-storlek" data-style-size-out>${size} %</output>
      </div>
      <fieldset class="text-style-align">
        <legend>Justering</legend>
        <div class="segmented">
          ${opts.map(
            ([v, label]) => html`<label><input type="radio" name="__stil_just__${f.key}" value="${v}"${align === v ? html` checked` : ""} data-style-align><span>${label}</span></label>`,
          )}
        </div>
      </fieldset>
      <button type="button" class="link-btn" data-style-reset>${icon("history", "icon icon-sm")}Standardstorlek och -placering</button>
    </div>
  </details>`;
}

/**
 * Avsnittens ordning i redigeraren: avsnitt före det första flyttbara (sidans topp) först, sedan de
 * flyttbara i vald ordning (med sina följeslagare), sist övriga (formulär, bekräftelser, undersidor).
 */
export function editorSectionOrder(page: PageDef, layout: SiteLayout): { block: string | null; sections: SectionDef[] }[] {
  const def = PAGE_LAYOUTS[page.id];
  const all = [...page.sections] as SectionDef[];
  if (!def || !def.blocks.length) return all.map((sec) => ({ block: null, sections: [sec] }));
  const byId = new Map(all.map((sec) => [sec.id, sec]));
  const owned = new Set(def.blocks.flatMap((b) => [b.id, ...(b.with ?? [])]));
  const firstBlockIdx = all.findIndex((sec) => owned.has(sec.id));
  const head = all.slice(0, Math.max(0, firstBlockIdx)).filter((sec) => !owned.has(sec.id));
  const tail = all.slice(Math.max(0, firstBlockIdx)).filter((sec) => !owned.has(sec.id));
  const groups = blockOrder(layout, page.id).map((id) => {
    const b = def.blocks.find((x) => x.id === id)!;
    return { block: id, sections: [id, ...(b.with ?? [])].map((x) => byId.get(x)).filter(Boolean) as SectionDef[] };
  });
  return [...head.map((sec) => ({ block: null, sections: [sec] })), ...groups, ...tail.map((sec) => ({ block: null, sections: [sec] }))];
}
