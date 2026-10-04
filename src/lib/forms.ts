import { html, type SafeHtml } from "./html.js";

/** Deklarativa formulärfält: samma definition används för rendering och servervalidering. */
export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "radio" | "checkbox" | "url" | "number" | "date" | "datetime-local" | "password" | "color";
  required?: boolean;
  max?: number;
  min?: number;
  options?: { value: string; label: string; hint?: string }[];
  autocomplete?: string;
  help?: string;
  placeholder?: string;
  rows?: number;
  /** Extra klass på fältets wrapper, t.ex. för att JS ska kunna dölja det. */
  wrapClass?: string;
  /** Extra attribut på etiketten (förhandsvisningens klickbara texter). */
  labelAttr?: SafeHtml;
}

/** Små texter i formulären som kan ändras i adminpanelen. */
export interface FormUiTexts {
  optional: string;
  select: string;
}
const DEFAULT_UI: FormUiTexts = { optional: "(valfritt)", select: "Välj …" };

export type Values = Record<string, string>;
export type Errors = Record<string, string>;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Läs och validera fält. Returnerar trimmade värden och svenska felmeddelanden. */
export function validate(fields: FieldSpec[], form: FormData): { values: Values; errors: Errors } {
  const values: Values = {};
  const errors: Errors = {};
  for (const f of fields) {
    const rawValue = form.get(f.name);
    let v = typeof rawValue === "string" ? rawValue.replace(/\r\n/g, "\n").trim() : "";
    if (f.type === "checkbox") v = v ? "1" : "";
    values[f.name] = v;

    if (!v) {
      if (f.required) {
        // Etiketter som är frågor ("Vad gäller det?") fungerar inte i "Fyll i …" – använd då en neutral text.
        const question = /\?\s*$/.test(f.label);
        const label = f.label.charAt(0).toLowerCase() + f.label.slice(1);
        errors[f.name] =
          f.type === "radio" || f.type === "select"
            ? question ? "Välj ett av alternativen." : `Välj ${label}.`
            : f.type === "checkbox"
              ? "Du behöver kryssa i rutan."
              : question ? "Fyll i det här fältet." : `Fyll i ${label}.`;
      }
      continue;
    }
    const max = f.max ?? (f.type === "textarea" ? 5000 : 200);
    if (v.length > max) errors[f.name] = `Får vara högst ${max} tecken (nu ${v.length}).`;
    else if (f.type === "email" && !EMAIL_RE.test(v)) errors[f.name] = "Ange en giltig e-postadress, t.ex. namn@exempel.se.";
    else if (f.type === "tel" && !/^[+\d][\d\s\-()]{5,20}$/.test(v)) errors[f.name] = "Ange ett giltigt telefonnummer.";
    else if (f.type === "url" && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)) errors[f.name] = "Ange en fullständig länk som börjar med https://";
    else if ((f.type === "select" || f.type === "radio") && f.options && !f.options.some((o) => o.value === v)) errors[f.name] = "Ogiltigt val.";
    else if (f.type === "number" && (!/^-?\d+$/.test(v) || (f.min !== undefined && +v < f.min) || (f.max !== undefined && +v > f.max)))
      errors[f.name] = f.min !== undefined && f.max !== undefined ? `Ange ett tal mellan ${f.min} och ${f.max}.` : "Ange ett heltal.";
    else if (f.type === "color" && !/^#[0-9a-f]{6}$/i.test(v)) errors[f.name] = "Ange en färg i formatet #rrggbb.";
    else if (f.type === "datetime-local" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) errors[f.name] = "Ange datum och tid.";
    else if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.name] = "Ange ett datum.";
  }
  return { values, errors };
}

function describedBy(f: FieldSpec, error?: string): string {
  const ids = [f.help ? `${f.name}-hjalp` : "", error ? `${f.name}-fel` : ""].filter(Boolean);
  return ids.join(" ");
}

export function renderField(f: FieldSpec, value = "", error?: string, ui: FormUiTexts = DEFAULT_UI): SafeHtml {
  const id = `falt-${f.name}`;
  const desc = describedBy(f, error);
  const req = f.required ? html` <span class="req" aria-hidden="true">*</span>` : html` <span class="optional">${ui.optional}</span>`;
  const la = f.labelAttr ?? "";
  const common = html`id="${id}" name="${f.name}"${f.required ? html` required` : ""}${desc ? html` aria-describedby="${desc}"` : ""}${error ? html` aria-invalid="true"` : ""}`;
  const help = f.help ? html`<p class="field-help" id="${f.name}-hjalp">${f.help}</p>` : "";
  const err = error ? html`<p class="field-error" id="${f.name}-fel">${error}</p>` : "";
  const wrap = `field${error ? " has-error" : ""}${f.wrapClass ? " " + f.wrapClass : ""}`;

  if (f.type === "radio") {
    return html`<fieldset class="${wrap} field-choices"${desc ? html` aria-describedby="${desc}"` : ""}>
      <legend class="field-label"${la}>${f.label}${req}</legend>
      ${help}
      <div class="choice-grid">
        ${(f.options ?? []).map(
          (o) => html`<label class="choice">
            <input type="radio" name="${f.name}" value="${o.value}"${value === o.value ? html` checked` : ""}${f.required ? html` required` : ""}>
            <span class="choice-body"><span class="choice-label">${o.label}</span>${o.hint ? html`<span class="choice-hint">${o.hint}</span>` : ""}</span>
          </label>`,
        )}
      </div>
      ${err}
    </fieldset>`;
  }
  if (f.type === "checkbox") {
    return html`<div class="${wrap}">
      <label class="check-field"${la}><input type="checkbox" ${common} value="1"${value ? html` checked` : ""}><span>${f.label}</span></label>
      ${help}${err}
    </div>`;
  }

  let control: SafeHtml;
  if (f.type === "textarea") {
    control = html`<textarea ${common} rows="${f.rows ?? 6}"${f.max ? html` maxlength="${f.max}"` : ""}${f.placeholder ? html` placeholder="${f.placeholder}"` : ""}>${value}</textarea>`;
  } else if (f.type === "select") {
    control = html`<select ${common}>
      <option value="">${ui.select}</option>
      ${(f.options ?? []).map((o) => html`<option value="${o.value}"${value === o.value ? html` selected` : ""}>${o.label}</option>`)}
    </select>`;
  } else if (f.type === "color") {
    // Färgväljare + hexkod. Tomt = sajtens vanliga färg; admin.js håller rutorna i synk och "Standard" tömmer fältet.
    const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "";
    control = html`<div class="color-pick${hex ? "" : " is-auto"}" data-color-pick>
      <input type="color" value="${hex || "#888888"}" aria-label="${f.label}: välj färg">
      <input type="text" ${common} value="${value}" placeholder="Standard" maxlength="7" spellcheck="false" autocomplete="off">
      <button type="button" class="btn btn-outline btn-sm" data-color-clear${hex ? "" : html` hidden`}>Standard</button>
    </div>`;
  } else {
    control = html`<input type="${f.type}" ${common} value="${value}"${f.autocomplete ? html` autocomplete="${f.autocomplete}"` : ""}${f.type !== "number" && f.max ? html` maxlength="${f.max}"` : ""}${f.type === "number" && f.min !== undefined ? html` min="${f.min}"` : ""}${f.type === "number" && f.max !== undefined ? html` max="${f.max}"` : ""}${f.placeholder ? html` placeholder="${f.placeholder}"` : ""}>`;
  }
  return html`<div class="${wrap}">
    <label class="field-label" for="${id}"${la}>${f.label}${req}</label>
    ${help}${control}${err}
  </div>`;
}

export function errorSummary(errors: Errors, fields: FieldSpec[], extra?: string): SafeHtml {
  const list = fields.filter((f) => errors[f.name]);
  if (!list.length && !extra) return html``;
  return html`<div class="alert alert-error" role="alert" tabindex="-1" data-focus>
    <p class="alert-title">${extra ?? "Formuläret innehåller fel. Rätta det som är markerat och försök igen."}</p>
    ${list.length
      ? html`<ul>${list.map((f) => html`<li><a href="#falt-${f.name}">${f.label}: ${errors[f.name]}</a></li>`)}</ul>`
      : ""}
  </div>`;
}
