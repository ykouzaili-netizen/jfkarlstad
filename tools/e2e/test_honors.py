"""Hedersmedlemmar och belöningssystemet på Om oss: adminpanelen och de tre utseendena.

Kör mot en nollställd förhandsvisning:  npm run preview:node -- --reset
                                         python3 tools/e2e/test_honors.py
Testet lägger själv in en medalj, en mottagare och en hedersmedlem via adminpanelen och tar bort dem efteråt.
"""
import re

from common import BASE, OUT, check, done, login, sync_playwright, expect, test_image  # noqa: F401

MEDAL = "Testmedaljen"
RECIPIENT = "Testa Mottagare"
MEMBER = "Testa Hedersmedlem"


def set_style(page, style: str) -> None:
    page.goto(f"{BASE}/admin/texter?sida=om-oss&falt=honors_style")
    radio = page.locator(f"input[type=radio][name=honors_style][value={style}]")
    if radio.is_checked():
        return
    page.locator(f"label:has(input[name=honors_style][value={style}])").click()
    page.click("#texter-form .sticky-actions button[type=submit]")
    page.wait_for_url(re.compile(r"klart=texter"))


def run() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        login(page)

        print("Admin: ordnar och medaljer")
        page.goto(f"{BASE}/admin/medaljer/ny")
        preview = page.locator("[data-medal-preview-img]")
        check(preview.count() == 1, "förhandsvisningen av medaljen finns i formuläret")
        before = preview.get_attribute("src")
        page.goto(f"{BASE}/admin/medaljer")
        check(page.locator("a.row-title").count() >= 10, "föreningens tio medaljer finns som platser i listan")
        check("Dold" in page.content(), "…och är dolda tills de fått namn")
        # Flytta upp/ned direkt i listan
        names = lambda: [x.strip() for x in page.locator("a.row-title").all_inner_texts()]
        order = names()
        page.locator("tbody tr").nth(2).locator("button[aria-label^='Flytta upp']").click()
        page.wait_for_load_state()
        now = names()
        check(now[1] == order[2] and now[2] == order[1], "Flytta upp byter plats med medaljen ovanför")
        check(page.evaluate("document.activeElement.getAttribute('aria-label') || ''").startswith("Flytta upp"), "fokus stannar på knappen så att man kan flytta flera steg")
        check(page.locator("tbody tr").first.locator("button[aria-label^='Flytta upp']").is_disabled(), "den översta kan inte flyttas upp")
        page.locator("tbody tr").nth(1).locator("button[aria-label^='Flytta ned']").click()
        page.wait_for_load_state()
        check(names()[:3] == order[:3], "Flytta ned återställer ordningen")
        page.goto(f"{BASE}/admin/medaljer/ny")
        check(page.locator('input[name="design"]').count() == 13, "tolv medaljbilder och Egen bild går att välja")
        # Egen bild utan uppladdad fil ger ett tydligt fel
        page.fill('input[name="name"]', MEDAL)
        page.locator('input[name="design"][value="egen"]').check(force=True)
        check(page.locator('input[name="image_key"]').first.is_visible(), "uppladdningen visas för Egen bild")
        page.locator(".admin-form-actions button[type=submit]").click()
        page.wait_for_load_state("networkidle")
        check("Ladda upp en bild på medaljen" in page.content(), "Egen bild kräver en uppladdad bild")
        preview = page.locator("[data-medal-preview-img]")
        before = preview.get_attribute("src")
        page.locator('input[name="design"][value="07"]').check(force=True)
        check(preview.get_attribute("src") != before and "medalj-07.png" in preview.get_attribute("src"), "förhandsvisningen följer valet")
        img = page.request.get(f"{BASE}{preview.get_attribute('src')}")
        check(img.status == 200 and "image/png" in img.headers["content-type"], "medaljbilden finns")
        page.fill('input[name="name"]', MEDAL)
        page.fill('textarea[name="description"]', "Delas ut i testet.")
        page.fill('input[name="founded"]', "2025")
        page.locator(".admin-form-actions button[type=submit]").click()
        page.wait_for_load_state("networkidle")
        check(MEDAL in page.content(), "medaljen syns i listan")
        medal_href = page.locator(f'a.row-title:has-text("{MEDAL}")').last.get_attribute("href")
        medal_id = medal_href.rsplit("/", 1)[-1]

        # Byt namn och ladda upp en egen bild
        page.goto(f"{BASE}{medal_href}")
        page.fill('input[name="name"]', MEDAL + " II")
        page.fill('textarea[name="description"]', "Ny beskrivning i testet.")
        page.locator('input[name="design"][value="egen"]').check(force=True)
        page.set_input_files('input[type="file"][name="image_key"]', str(test_image(OUT / "medalj.jpg", (440, 920))))
        page.locator(".admin-form-actions button[type=submit]").click()
        page.wait_for_load_state("networkidle")
        check(f"{MEDAL} II" in page.content(), "namnet går att ändra")
        page.goto(f"{BASE}{medal_href}")
        check(page.locator('textarea[name="description"]').input_value() == "Ny beskrivning i testet.", "beskrivningen går att ändra")
        check("/media/" in (page.locator("[data-medal-preview-img]").get_attribute("src") or ""), "den egna bilden visas i förhandsvisningen")

        page.goto(f"{BASE}{medal_href}")
        page.locator('a:has-text("Lägg till mottagare")').click()
        check(page.locator('input[name="kind"][value="utmarkelse"]').is_checked(), "Lägg till mottagare förväljer typen")
        check(page.locator('select[name="medal_id"]').input_value() == medal_id, "…och medaljen")
        page.fill('input[name="name"]', RECIPIENT)
        page.locator(".admin-form-actions button[type=submit]").click()
        page.wait_for_load_state("networkidle")
        check(MEDAL in page.content(), "mottagarens rad visar medaljens namn")

        page.goto(f"{BASE}/admin/utmarkelser/ny")
        check(page.locator('input[name="kind"][value="hedersmedlem"]').is_checked(), "ny utmärkelse börjar som hedersmedlem")
        check(page.locator('select[name="medal_id"]').is_hidden(), "medaljvalet är dolt för hedersmedlemmar")
        page.fill('input[name="name"]', MEMBER)
        page.fill('input[name="year"]', "2024")
        page.fill('textarea[name="description"]', "För lång och trogen tjänst i testet.")
        page.locator(".admin-form-actions button[type=submit]").click()
        page.wait_for_load_state("networkidle")

        for style in ["kabinett", "band", "kortlek"]:
            print(f"Om oss: {style}")
            set_style(page, style)
            page.goto(f"{BASE}/om-oss")
            sec = page.locator(f"section.honors--{style}")
            check(sec.count() == 1, f"{style}: avsnittet visas")
            text = sec.inner_text()
            check(MEDAL in text and MEMBER in text, f"{style}: medaljen och hedersmedlemmen finns med")

            if style == "kabinett":
                sec.locator(".hk-case", has_text=MEDAL).click()
                pop = page.locator(f"#medalj-{medal_id}")
                expect(pop).to_be_visible()
                check(RECIPIENT in pop.inner_text(), "kabinett: rutan visar mottagaren")
                page.keyboard.press("Escape")
                expect(pop).to_be_hidden()
            if style == "band":
                tab = sec.locator(f'[data-tab="band-m{medal_id}"]')
                tab.click()
                check(tab.get_attribute("aria-selected") == "true", "band: fliken blir vald")
                check(page.locator(f"#band-m{medal_id}").is_visible() and page.locator("#band-heder").is_hidden(), "band: rätt panel visas")
                tab.press("ArrowLeft")
                check(page.locator(f"#band-m{medal_id}").is_hidden(), "band: piltangenterna byter flik")
            if style == "kortlek":
                counter = sec.locator("[data-deck-current]")
                if counter.count():
                    sec.locator("[data-deck-next]").click()
                    check(counter.inner_text() == "2", "kortlek: Nästa bläddrar")
                    sec.locator("[data-deck-prev]").click()
                    check(counter.inner_text() == "1", "kortlek: Föregående bläddrar tillbaka")
                coin = sec.locator(".hd-coin", has_text=MEDAL)
                coin.locator("[data-flip-btn]").click()
                check(coin.locator("[data-flip-btn]").get_attribute("aria-expanded") == "true", "kortlek: myntet vänds")
            page.screenshot(path=str(OUT / f"heders-{style}.png"), full_page=False)

        print("Städar")
        for path, label in [("utmarkelser", RECIPIENT), ("utmarkelser", MEMBER), ("medaljer", MEDAL)]:
            page.goto(f"{BASE}/admin/{path}")
            row = page.locator("tr", has=page.locator(f'a.row-title:has-text("{label}")')).last
            page.once("dialog", lambda d: d.accept())
            row.locator('form[action$="/radera"] button').click()
            page.wait_for_load_state("networkidle")
        page.goto(f"{BASE}/admin/medaljer")
        check(MEDAL not in page.content(), "medaljen är borttagen")
        set_style(page, "kabinett")

        check(not errors, f"inga JavaScript-fel ({errors})")
        browser.close()
    done()


if __name__ == "__main__":
    run()
