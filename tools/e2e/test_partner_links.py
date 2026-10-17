"""Fler länkar på partnersidan: lägga till, felmeddelanden, ta bort, utlänkar via /ut/lank och läget utan JavaScript."""
from common import *
import re

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    login(page)
    page.goto(f"{BASE}/admin/partners")
    page.click("text=Vinge")
    page.wait_for_load_state()
    edit = page.url
    pid = edit.rstrip("/").split("/")[-1]

    rows = page.locator("[data-repeater-row]")
    check(rows.count() == 1, "med JavaScript visas en tom rad från början")
    page.locator("[data-repeater-row] input[name=link_label]").nth(0).fill("LinkedIn")
    page.locator("[data-repeater-row] input[name=link_url]").nth(0).fill("linkedin.com/company/vinge")
    page.click("[data-repeater-add]")
    check(rows.count() == 2, "+ Lägg till länk ger en ny rad")
    check(page.evaluate("document.activeElement.name") == "link_label", "fokus hamnar i den nya raden")
    page.locator("[data-repeater-row] input[name=link_label]").nth(1).fill("Traineeprogrammet")
    page.locator("[data-repeater-row] input[name=link_url]").nth(1).fill("inte en adress")
    page.click("[data-repeater-add]")
    page.locator("[data-repeater-row] input[name=link_label]").nth(2).fill("Podden")
    page.locator("[data-repeater-row] input[name=link_url]").nth(2).fill("https://example.com/podd")
    page.locator(".field-links").screenshot(path=str(OUT / "partner-lankar-admin.png"))
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    check(page.locator("#links-fel").count() == 1 and "länk 2" in page.locator("#links-fel").inner_text(), "fel adress ger ett begripligt fel för rätt rad")
    check(page.locator("input[name=link_label]").evaluate_all("els => els.map(e => e.value)")[:3] == ["LinkedIn", "Traineeprogrammet", "Podden"], "inget försvinner när felet visas")

    page.locator("[data-repeater-row] input[name=link_url]").nth(1).fill("https://example.com/trainee")
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    check(page.locator(".field-error").count() == 0, "sparas när alla rader är rätt")

    pub = b.new_page(viewport={"width": 1280, "height": 1000})
    pub.goto(f"{BASE}/partners/vinge")
    links = pub.locator(".partner-links a")
    check(links.count() == 3, "tre länkar på partnersidan")
    check("linkedin.com" in links.nth(0).inner_text(), "adressens domän visas under texten (https:// lades till automatiskt)")
    href = links.nth(0).get_attribute("href") or ""
    check(re.fullmatch(rf"/ut/lank/{pid}\?l=[a-z0-9]{{4,12}}", href) is not None, "länken går via /ut/lank med länkens id")
    r = pub.request.get(f"{BASE}{href}", max_redirects=0)
    check(r.status == 302 and r.headers.get("location") == "https://linkedin.com/company/vinge", "länkens id skickar vidare till rätt adress")
    check(links.nth(0).get_attribute("target") == "_blank" and "noopener" in (links.nth(0).get_attribute("rel") or ""), "öppnas i ny flik med noopener")
    pub.locator(".aside-card").screenshot(path=str(OUT / "partner-lankar-sida.png"))
    pub.screenshot(path=str(OUT / "partner-lankar-helsida.png"))

    r = pub.request.get(f"{BASE}/ut/lank/{pid}?nr=1", max_redirects=0)
    check(r.status == 302 and r.headers.get("location") == "https://linkedin.com/company/vinge", "utlänken skickar vidare till adressen i databasen")
    check(pub.request.get(f"{BASE}/ut/lank/{pid}?nr=9", max_redirects=0).status == 404, "länk som inte finns ger 404")
    check(pub.request.get(f"{BASE}/ut/lank/{pid}?nr=abc", max_redirects=0).status == 404, "skräp i nr ger 404")

    # Ta bort mittenraden
    page.goto(edit)
    check(page.locator("[data-repeater-row]").count() == 4, "sparade rader plus en tom")
    page.locator("[data-repeater-row]").nth(1).locator("[data-repeater-remove]").click()
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    pub.goto(f"{BASE}/partners/vinge")
    texts = pub.locator(".partner-link-text").all_inner_texts()
    check(len(texts) == 2 and "Podden" in texts[1], "Ta bort tar bort rätt länk")

    # Utan JavaScript
    nojs = b.new_context(java_script_enabled=False, reduced_motion="reduce")
    pg = nojs.new_page()
    for c in page.context.cookies():
        nojs.add_cookies([c])
    pg.goto(edit)
    check(pg.locator("[data-repeater-row]").count() == 4, "utan JavaScript: sparade rader plus två tomma")
    pg.locator("input[name=link_label]").nth(2).fill("Instagram")
    pg.locator("input[name=link_url]").nth(2).fill("https://instagram.com/vinge")
    pg.click("form button[type=submit] >> nth=-1")
    pg.wait_for_load_state()
    pub.goto(f"{BASE}/partners/vinge")
    check(pub.locator(".partner-links a").count() == 3, "utan JavaScript går det att lägga till en länk")

    # Partner utan knappar men med länkar: rutan visas ändå
    page.goto(edit)
    page.fill("#falt-website_url", "")
    page.fill("#falt-career_url", "")
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    pub.goto(f"{BASE}/partners/vinge")
    check(pub.locator(".aside-card .partner-links a").count() == 3 and pub.locator(".aside-card .btn").count() == 0, "bara länkar: rutan visas utan knappar")
    b.close()
done()
