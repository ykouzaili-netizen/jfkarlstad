"""Bilden på partnersidan: alla utseenden går att spara och visas på /partners/:slug, även på mobil."""
from common import *
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 900})
    login(page)
    page.goto(f"{BASE}/admin/partners")
    page.click("text=Vinge")
    page.wait_for_load_state()
    edit = page.url
    page.set_input_files("input[type=file][name=image_key]", str(test_image(OUT / "partnerbild.jpg", (1800, 1200))))
    page.fill("#falt-image_alt", "Medarbetare på kontoret (exempel)")
    check(page.locator("input[name=image_style]").count() == 5, "fem utseenden att välja mellan")
    for style in ["banner", "bakgrund", "delad", "spalt", "platta"]:
        if page.url != edit:
            page.goto(edit)
        page.check(f"input[name=image_style][value={style}]")
        page.click("form button[type=submit] >> nth=-1")
        page.wait_for_load_state()
        err = page.locator(".error-summary, .field-error").count()
        check(err == 0, f"{style}: sparat utan fel")
        pub = b.new_page(viewport={"width": 1280, "height": 1250})
        pub.goto(f"{BASE}/partners/vinge")
        check(pub.locator(f".partner-photo--{style} img").count() == 1, f"{style}: bilden visas")
        pub.evaluate("window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0,0)")
        pub.wait_for_timeout(900)
        pub.screenshot(path=OUT / f"partner-{style}.png")
        m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        m.goto(f"{BASE}/partners/vinge")
        m.evaluate("window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0,0)")
        m.wait_for_timeout(900)
        check(m.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{style}: ingen sidled scroll på mobil")
        m.screenshot(path=OUT / f"partner-{style}-mobil.png", full_page=True)
        pub.close(); m.close()
    # utan bild: ingen figur
    pub = b.new_page(); pub.goto(f"{BASE}/partners/setterwalls")
    check(pub.locator(".partner-photo").count() == 0, "partner utan bild: ingen bildyta")
    b.close()
done()
