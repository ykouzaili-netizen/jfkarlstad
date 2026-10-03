import { html } from "../lib/html.js";
import { ek, lines, loadSettings } from "../lib/settings.js";
import { faqQuery, rows, type FaqRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout } from "../views/layout.js";
import { arrowLink } from "../views/components.js";
import { checkList, faqList, pageHeader } from "../views/page.js";

export async function membershipPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, faq] = await Promise.all([loadSettings(db, c.preview), rows<FaqRow>(faqQuery.byCategory(db, "Medlemskap"))]);

  const steps = [
    ["member_step_1_title", "member_step_1_text"],
    ["member_step_2_title", "member_step_2_text"],
    ["member_step_3_title", "member_step_3_text"],
  ] as const;

  const content = html`
    ${pageHeader(s, {
      kickerKey: "member_kicker",
      titleKey: "member_title",
      leadKey: "member_lead",
      actions: html`${joinButton(s, { className: "btn btn-primary btn-lg" })}${s.member_price ? html`<p class="price-note"${ek(s, "member_price")}>${s.member_price}</p>` : ""}`,
    })}

    <section class="section section-tight-top">
      <div class="container split split-top">
        <div>
          <h2 class="section-title"${ek(s, "member_benefits_title")}>${s.member_benefits_title}</h2>
          ${checkList(lines(s.member_benefits), ek(s, "member_benefits"))}
        </div>
        <div class="info-card">
          <h2 class="info-title"${ek(s, "member_steps_title")}>${s.member_steps_title}</h2>
          <ol class="step-list">
            ${steps.map(
              ([t, x], i) => html`<li><span class="step-num" aria-hidden="true">${i + 1}</span><div><h3 class="step-title"${ek(s, t)}>${s[t]}</h3><p${ek(s, x)}>${s[x]}</p></div></li>`,
            )}
          </ol>
          ${joinButton(s, { className: "btn btn-primary btn-block" })}
          ${s.member_fineprint ? html`<p class="fine-print"${ek(s, "member_fineprint")}>${s.member_fineprint}</p>` : ""}
        </div>
      </div>
    </section>

    ${faq.length
      ? html`<section class="section section-surface" aria-labelledby="medlem-faq">
          <div class="container narrow">
            <h2 class="section-title" id="medlem-faq"${ek(s, "member_faq_title")}>${s.member_faq_title}</h2>
            ${faqList(s, faq)}
            <p class="after-list">${arrowLink("/faq", s.member_faq_link, "arrow-link", ek(s, "member_faq_link"))}</p>
          </div>
        </section>`
      : ""}
  `;
  return htmlResponse(c, layout(c, s, { title: s.member_title, description: s.member_lead }, content));
}
