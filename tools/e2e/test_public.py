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
