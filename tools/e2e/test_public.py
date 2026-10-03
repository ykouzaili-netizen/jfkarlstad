"""Webbläsartest av de publika sidorna: laddas utan fel, ingen horisontell scroll i mobilen,
inga JavaScript-fel och inga märkningar för adminpanelens karta på den riktiga webbplatsen."""
from common import BASE, OUT, check, done, sync_playwright

PAGES = [
    "/", "/om-oss", "/engagera-dig", "/bli-medlem", "/for-studenter", "/karriar", "/for-foretag", "/partners",
    "/aktuellt", "/kalender", "/dokument", "/faq", "/jf-paverka", "/kontakt", "/sok", "/sok?q=medlem",
    "/integritetspolicy", "/cookies", "/sidan-finns-inte",
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, vp in [("mobil", {"width": 360, "height": 780}), ("dator", {"width": 1280, "height": 860})]:
        print(f"Visning: {name}")
        page = browser.new_page(viewport=vp, locale="sv-SE")
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for path in PAGES:
            res = page.goto(BASE + path)
            expected = 404 if path == "/sidan-finns-inte" else 200
            ok = res is not None and res.status == expected
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            marks = page.locator("[data-ek], [data-eu]").count()
            check(ok and overflow <= 0 and marks == 0, f"{path}: status {res.status if res else '?'}, overflow {overflow}px, märkningar {marks}")
            if path in ("/karriar", "/kalender", "/sok?q=medlem", "/engagera-dig", "/"):
                page.screenshot(path=str(OUT / f"pub-{name}-{path.strip('/').replace('?', '_') or 'start'}.png"))
        if name == "dator":
            page.goto(BASE + "/kalender?manad=2026-08")
            check(page.locator(".cal-grid tbody tr").count() == 6 and page.locator(".cal-ev:has-text('Inspark')").count() == 7, "månadsvyn visar ett flerdagarsevenemang på varje dag")
            page.hover(".cal-ev:has-text('Inspark') >> nth=2")
            page.wait_for_selector(".cal-pop:not([hidden])")
            pop = page.locator(".cal-pop")
            check("Inspark 2026" in pop.inner_text() and pop.locator("a[href='/kalender/inspark-2026']").count() == 1, "rutan med detaljer visas när man pekar på ett evenemang")
            check(page.locator(".cal-ev:has-text('Inspark') >> nth=2").get_attribute("aria-describedby") == f"cal-desc-{page.locator('.cal-ev >> nth=0').get_attribute('data-pop').split('-')[-1]}", "skärmläsare får datum, tid och plats som beskrivning")
            pop.hover()
            page.wait_for_timeout(400)
            check(pop.is_visible(), "rutan ligger kvar när muspekaren flyttas in i den")
            page.screenshot(path=str(OUT / "pub-kalender-ruta.png"))
            page.keyboard.press("Escape")
            check(not pop.is_visible(), "Escape stänger rutan")
            page.hover(".cal-ev:has-text('Inspark') >> nth=0")
            page.wait_for_selector(".cal-pop:not([hidden])")
            page.mouse.move(5, 5)
            page.wait_for_timeout(400)
            check(not pop.is_visible(), "rutan stängs när muspekaren lämnar")
            page.click(".cal-nav-btn >> nth=1")
            check("manad=2026-09" in page.url, "pilen bläddrar till nästa månad")
            page.goto(BASE + "/kalender?manad=skräp")
            check(page.locator(".cal-grid").count() == 1, "ogiltig månad visar innevarande månad")
            page.goto(BASE + "/kalender?visa=lista")
            check(page.locator(".cal-grid").count() == 0 and page.locator(".event-card").count() >= 1, "listvyn finns kvar")
            page.goto(BASE + "/")
            check(page.locator("body.has-overlay-header .hero").count() == 1, "startsidan har helskärmshero med sidhuvudet ovanpå")
            hero_h = page.evaluate("document.querySelector('.hero').getBoundingClientRect().height")
            check(hero_h >= 860, f"heron fyller skärmen ({hero_h:.0f}px)")
            page.goto(BASE + "/kalender")
            page.click(".subscribe > summary")
            check(page.locator(".subscribe-panel").is_visible(), "panelen för kalenderprenumeration öppnas")
            page.screenshot(path=str(OUT / "pub-kalender-prenumerera.png"))
        if name == "mobil":
            page.goto(BASE + "/")
            page.click("[data-menu-toggle]")
            check(page.locator(".nav-search").is_visible(), "sökfältet finns i mobilmenyn")
            label = page.locator(".menu-label").inner_text()
            check(label.strip() == "Stäng", f"menyknappens text växlar ({label!r})")
        check(not errors, f"inga JavaScript-fel ({name}) {errors[:3]}")
        page.close()
    browser.close()
done()
