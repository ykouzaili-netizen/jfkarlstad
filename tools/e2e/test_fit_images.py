"""Bilder som får plats (src/views/fit-image.ts): en stående affisch visas hel på nyhetskortet och som ark på sidan,
ett liggande foto fyller kortet, eventets bild syns i kalenderns lista, ingen förstoring vid hovring, ingen sidled
scroll på mobil.

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
"""
from common import *


def upload(page, path: str, image: Path, alt: str):
    page.goto(f"{BASE}{path}")
    page.set_input_files("input[type=file][name=image_key]", str(image))
    page.fill("#falt-image_alt", alt)
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    check(page.locator(".error-summary, .field-error").count() == 0, f"{path}: sparat utan fel")


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 900})
    login(page)

    print("Ladda upp bilder")
    upload(page, "/admin/nyheter/1", test_image(OUT / "affisch.jpg", (1080, 1350)), "Affisch för höstsittningen")
    upload(page, "/admin/nyheter/2", test_image(OUT / "foto43.jpg", (1600, 1200), (120, 60, 40)), "Styrelsen")
    upload(page, "/admin/event/3", test_image(OUT / "a4.jpg", (1240, 1754), (30, 30, 30)), "Affisch för halvtidsmiddagen")

    errors: list[str] = []
    for vw, vh, tag in [(1280, 900, "dator"), (390, 844, "mobil")]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, reduced_motion="reduce")
        g = ctx.new_page()
        g.on("pageerror", lambda e: errors.append(str(e)))

        print(f"Nyhetskorten ({tag})")
        g.goto(f"{BASE}/aktuellt")
        poster = g.locator('.news-card:has(a[href="/aktuellt/ny-webbplats"]) .fit-box')
        photo = g.locator('.news-card:has(a[href="/aktuellt/jf-initiativ"]) .fit-box')
        check("is-whole" in (poster.get_attribute("class") or ""), "stående affisch visas hel")
        check("is-whole" not in (photo.get_attribute("class") or ""), "liggande foto (4:3) fyller kortet")
        check(poster.locator("img.fit-img").evaluate("e => getComputedStyle(e).objectFit") == "contain", "affischen: object-fit contain")
        check(photo.locator("img.fit-img").evaluate("e => getComputedStyle(e).objectFit") == "cover", "fotot: object-fit cover")
        if tag == "dator":
            g.hover('.news-card:has(a[href="/aktuellt/jf-initiativ"])')
            g.wait_for_timeout(700)
            check(photo.locator("img.fit-img").evaluate("e => getComputedStyle(e).transform") in ("none", "matrix(1, 0, 0, 1, 0, 0)"), "ingen förstoring vid hovring")
        check(g.evaluate("document.documentElement.scrollWidth <= innerWidth"), "ingen sidled scroll")

        print(f"Nyhetens sida ({tag})")
        g.goto(f"{BASE}/aktuellt/ny-webbplats")
        check(g.locator(".article-figure.is-sheet").count() == 1, "affischen visas som ark")
        check(g.locator(".article-image").count() == 0, "ingen beskuren 16:9-ruta")
        g.goto(f"{BASE}/aktuellt/jf-initiativ")
        fig = g.locator(".article-figure")
        check(fig.count() == 1 and "is-sheet" not in (fig.get_attribute("class") or ""), "liggande foto i sin egen form")
        box = fig.locator("img.article-figure-img").bounding_box()
        check(box and abs(box["width"] / box["height"] - 4 / 3) < 0.03, "fotot behåller formen 4:3")

        print(f"Kalendern ({tag})")
        g.goto(f"{BASE}/kalender/halvtidsmiddag-ht26")
        check(g.locator(".article-figure.is-sheet").count() == 1, "eventets affisch som ark")
        g.goto(f"{BASE}/kalender")
        thumb = g.locator('.event-card:has(a[href="/kalender/halvtidsmiddag-ht26"]) .event-thumb .fit-box')
        check(thumb.count() == 1, "eventets bild i kalenderns lista")
        check(g.locator('.event-card:has(a[href="/kalender/inspark-2026"]) .event-thumb').count() == 0, "event utan bild: ingen ruta")
        check(g.evaluate("document.documentElement.scrollWidth <= innerWidth"), "ingen sidled scroll i kalendern")
        if tag == "dator":
            chip = g.locator('.cal-ev[href="/kalender/halvtidsmiddag-ht26"]')
            if chip.count():
                chip.first.hover()
                g.wait_for_timeout(500)
                check(g.locator(".cal-pop:not([hidden]) .cal-pop-thumb img.fit-img").count() == 1, "bilden i rutan som öppnas")
        g.screenshot(path=OUT / f"bilder-kalender-{tag}.png")
        ctx.close()

    check(not errors, f"inga skriptfel ({errors[:2]})")
    b.close()
done()
