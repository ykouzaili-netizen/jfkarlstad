import { html } from "../lib/html.js";
import { lines, loadSettings } from "../lib/settings.js";
import { faqQuery, rows, type FaqRow } from "../lib/content.js";
import { htmlResponse } from "../lib/http.js";
import type { RequestContext } from "../router.js";
import { joinButton, layout } from "../views/layout.js";
import { arrowLink } from "../views/components.js";
import { checkList, faqList, pageHeader } from "../views/page.js";

export async function membershipPage(c: RequestContext): Promise<Response> {
  const db = c.env.DB;
  const [s, faq] = await Promise.all([loadSettings(db), rows<FaqRow>(faqQuery.byCategory(db, "Medlemskap"))]);

  const steps = [
    { title: "Klicka på ”Bli medlem”", text: "Du kommer till JFK:s sida hos Hitract, där medlemskapet hanteras." },
    { title: "Registrera dig och betala", text: "Fyll i dina uppgifter och betala medlemsavgiften direkt i Hitract." },
    { title: "Välkommen in!", text: "Nu kan du köpa biljetter till medlemsevenemang och ta del av alla förmåner." },
  ];

  const content = html`
    ${pageHeader({
      kicker: "Medlemskap",
      title: "Bli medlem i JFK",
      lead: s.member_lead,
      actions: html`${joinButton(s, { className: "btn btn-primary btn-lg" })}${s.member_price ? html`<p class="price-note">${s.member_price}</p>` : ""}`,
    })}

    <section class="section section-tight-top">
      <div class="container split split-top">
        <div>
          <h2 class="section-title">Det här får du som medlem</h2>
          ${checkList(lines(s.member_benefits))}
        </div>
        <div class="info-card">
          <h2 class="info-title">Så går det till</h2>
          <ol class="step-list">
            ${steps.map((st, i) => html`<li><span class="step-num" aria-hidden="true">${i + 1}</span><div><h3 class="step-title">${st.title}</h3><p>${st.text}</p></div></li>`)}
          </ol>
          ${joinButton(s, { className: "btn btn-primary btn-block" })}
          <p class="fine-print">Medlemskapet hanteras helt av Hitract. Vi sparar inga medlemsuppgifter på den här webbplatsen.</p>
        </div>
      </div>
    </section>

    ${faq.length
      ? html`<section class="section section-surface" aria-labelledby="medlem-faq">
          <div class="container narrow">
            <h2 class="section-title" id="medlem-faq">Vanliga frågor om medlemskap</h2>
            ${faqList(faq)}
            <p class="after-list">${arrowLink("/faq", "Fler vanliga frågor")}</p>
          </div>
        </section>`
      : ""}
  `;
  return htmlResponse(c, layout(c, s, { title: "Bli medlem", description: s.member_lead }, content));
}
