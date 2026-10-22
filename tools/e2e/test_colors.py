"""Färger för alla delar av sidorna (Texter och sidor → sidan → ”… – färger”).

- Sparar färger i redigeraren och kontrollerar dem på webbplatsen (sidhuvudet, sidfoten, en sidas topp).
- Varje färgset når rätt del av sidan (färgerna skrivs direkt i förhandsvisningens databas för att täcka alla).
- Klick på ett avsnitts bakgrund i förhandsvisningen leder till avsnittets färger.

Kör mot nollställd databas:  npm run preview:node -- --reset
"""
import sqlite3
from pathlib import Path

from common import *

DB = Path(__file__).resolve().parents[1] / "local-preview" / ".data" / "local.sqlite"

# färgset → (adress, delen som ska få bakgrunden). "@x" = första länken av den sorten.
CASES = {
    "header": ("/om-oss", ".site-header"),
    "footer": ("/om-oss", ".site-footer"),
    "tops": ("/kontakt", "#innehall .page-hero"),
    "top_om_oss": ("/om-oss", "#innehall :is(.page-top, .page-hero)"),
    "home_insta": ("/", "section[aria-labelledby=insta-titel]"),
    "home_partners": ("/", "section[aria-labelledby=partner-titel]"),
    "om_oss_utskott": ("/om-oss", "section[aria-labelledby=utskotten]"),
    "om_oss_utmarkelser": ("/om-oss", "section[aria-labelledby=utmarkelser]"),
    "for_studenter_idrott": ("/for-studenter", "section[aria-labelledby=jfk-idrott]"),
    "committee_meet": ("@/om-oss/utskott/", "section[aria-labelledby=mot-utskottet]"),
    "committee_more": ("@/om-oss/utskott/", "section[aria-labelledby=fler-utskott]"),
    "nominate_form": ("/nominera", "#innehall .page-hero + section"),
    "contact_form": ("/kontakt", "#innehall .page-hero + section"),
    "contact_thanks": ("/kontakt/tack", "#innehall > section"),
    "engage_thanks": ("/engagera-dig/tack", "#innehall > section"),
    "jobs_list": ("/karriar", "#innehall .page-hero + section"),
    "partners_list": ("/partners", "#innehall .page-hero + section"),
    "partner_page": ("@/partners/", "#innehall .partner-top + section"),
    "news_list": ("/aktuellt", "#innehall .page-hero + section"),
    "news_article": ("@/aktuellt/", "#innehall article > .section"),
    "calendar_month": ("/kalender", "section[aria-labelledby=kalender-manad]"),
    "calendar_past": ("/kalender?visa=lista", "section[aria-labelledby=tidigare]"),
    "event_page": ("@/kalender/", "#innehall article > section"),
    "docs_list": ("/dokument", "#innehall .page-hero + section"),
    "faq_list": ("/faq", ".faq-page"),
    "paverka_form": ("/jf-paverka", "#innehall .page-hero + section"),
    "search_results": ("/sok?q=jfk", "#innehall .page-hero + section"),
    "privacy_body": ("/integritetspolicy", "#innehall .page-hero + section"),
    "cookies_body": ("/cookies", "#innehall .page-hero + section"),
    "error_page": ("/finns-inte-alls", ".error-page"),
    "shop_dark": ("/butik", ".jfk-butik .shop-why"),
    "shop_light": ("/butik", ".jfk-butik .shop-archive"),
    "shop_light@varukorg": ("/butik/varukorg", ".jfk-butik .shop-cart-page"),
    "tavling_top": ("/tavling", ".jfk-tavling .t-hero"),
}
LINKS_FROM = {"/om-oss/utskott/": "/om-oss", "/partners/": "/partners", "/aktuellt/": "/aktuellt", "/kalender/": "/kalender?vy=lista"}


def rgb(h: str) -> str:
    return f"rgb({int(h[1:3], 16)}, {int(h[3:5], 16)}, {int(h[5:7], 16)})"


def bg_of(page, sel: str) -> str:
    """Bakgrunden – för tävlingens topp (en gradient ovanpå färgen) den sista färgen i background."""
    return page.locator(sel).first.evaluate(
        "e => { const s = getComputedStyle(e); if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') return s.backgroundColor;"
        " const m = s.backgroundImage.match(/rgb\\([^)]*\\)/g); return m ? m[m.length - 1] : s.backgroundColor; }"
    )


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 1000})
    login(page)

    # ── Spara i redigeraren ──
    print("Redigeraren")
    page.goto(f"{BASE}/admin/texter?sida=gemensamt&falt=header_c_bg")
    check(page.locator("#farger-header .color-group-title:has-text('Sidhuvudet – färger')").count() == 1, "Gemensamt: färggruppen för sidhuvudet")
    check(page.locator("#farger-footer").count() == 1 and page.locator("#farger-tops").count() == 1, "… och för sidfoten och alla sidors topp")
    page.fill("#falt-header_c_bg", "#1f3a5f")
    page.locator("#falt-header_c_bg").dispatch_event("change")
    check(page.locator("#farger-header .color-ask").count() == 1, "ny bakgrund: panelen föreslår text som syns")
    page.click("#farger-header .color-ask button:has-text('Ja, anpassa')")
    text = page.locator("#falt-header_c_text").input_value()
    check(text in ("#ffffff", "#fff7d6"), f"texten blir ljus på den mörka bakgrunden ({text})")
    page.locator("#avsnitt-sidfot > summary").click()
    page.fill("#falt-footer_c_bg", "#f1cc4d")
    page.locator("#falt-footer_c_bg").dispatch_event("change")
    if page.locator("#farger-footer .color-ask").count():
        page.click("#farger-footer .color-ask button:has-text('Ja, anpassa')")
    with page.expect_navigation():
        page.locator("#texter-form button[type=submit]:not([formaction])").first.click()
    check("klart=texter" in page.url, "färgerna sparas")

    page.goto(f"{BASE}/admin/texter?sida=karriar&falt=top_karriar_c_bg")
    check(page.locator("#farger-top_karriar .color-group-title:has-text('Toppen – färger')").count() == 1, "Karriär: färger för toppen")
    page.fill("#falt-top_karriar_c_bg", "#2d5a3d")
    page.fill("#falt-top_karriar_c_text", "#ffffff")
    with page.expect_navigation():
        page.locator("#texter-form button[type=submit]:not([formaction])").first.click()

    pub = b.new_page(viewport={"width": 1280, "height": 900})
    pub.goto(f"{BASE}/karriar")
    check(bg_of(pub, ".site-header") == rgb("#1f3a5f"), "sidhuvudet har den nya färgen")
    check(pub.locator(".site-header .brand").first.evaluate("e => getComputedStyle(e).color") == rgb(text), "… med den ljusa texten")
    check(bg_of(pub, ".site-footer") == rgb("#f1cc4d"), "sidfoten har den nya färgen")
    btn = pub.locator(".site-footer .btn").first
    check(btn.evaluate("e => getComputedStyle(e).backgroundColor") != rgb("#f1cc4d"), "knappen i sidfoten syns mot den gula bakgrunden")
    check(bg_of(pub, "#innehall .page-hero") == rgb("#2d5a3d"), "Karriärs topp har sin egen färg")
    pub.goto(f"{BASE}/kontakt")
    check(bg_of(pub, "#innehall .page-hero") != rgb("#2d5a3d"), "… och andra sidors topp påverkas inte")
    pub.screenshot(path=str(OUT / "farger-sidhuvud.png"))

    # ── Klick på en bakgrund i förhandsvisningen ──
    print("Förhandsvisningen")
    page.goto(f"{BASE}/admin/texter?sida=om-oss&falt=om_oss_styrning_c_bg")
    frame = page.frame_locator("iframe[data-lp-frame]")
    sec = frame.locator("section[aria-labelledby=sa-styrs-jfk]")
    sec.wait_for()
    check(sec.get_attribute("data-ek") == "om_oss_styrning_c_bg", "avsnittet är märkt med sina färger")
    page.locator("#avsnitt-styrning > summary").click()
    sec.scroll_into_view_if_needed()
    box = sec.bounding_box()
    page.mouse.click(box["x"] + box["width"] - 6, box["y"] + 6)
    page.wait_for_timeout(400)
    check(page.evaluate("document.activeElement && document.activeElement.id") == "falt-om_oss_styrning_c_bg", "klick på bakgrunden: färgfältet får fokus")
    check(frame.locator(".site-footer[data-ek=footer_c_bg]").count() == 1, "sidfoten är klickbar till sina färger")

    # ── Alla färgset når rätt del ──
    print("Alla delar")
    con = sqlite3.connect(DB)
    con.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('sida:butik', 'visas', datetime('now'))")
    con.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('sida:tavling', 'visas', datetime('now'))")
    colors = {}
    # "set@namn" = samma färgset provat på ännu en del av sidan
    for i, k in enumerate(CASES):
        pre = k.split("@")[0]
        if pre in colors:
            continue
        colors[pre] = "#%02x%02x%02x" % (40 + (i * 37) % 200, 200 - (i * 53) % 150, 90 + (i * 71) % 160)
        con.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))", (pre + "_c_bg", colors[pre]))
    con.commit()
    links = {}
    for pre, src in LINKS_FROM.items():
        pub.goto(BASE + src)
        hrefs = [h for h in pub.eval_on_selector_all(f"a[href^='{pre}']", "els => els.map(e => e.getAttribute('href'))") if len(h) > len(pre)]
        links[pre] = hrefs[0] if hrefs else None
    for k, (path, sel) in CASES.items():
        if path.startswith("@"):
            path = links.get(path[1:])
            if not path:
                check(False, f"{k}: hittade ingen sida att prova på")
                continue
        pub.goto(BASE + path)
        if not pub.locator(sel).count():
            check(False, f"{k}: {sel} finns inte på {path}")
            continue
        check(bg_of(pub, sel) == rgb(colors[k.split("@")[0]]), f"{k}: {path}")
    for pre in colors:
        con.execute("DELETE FROM settings WHERE key = ?", (pre + "_c_bg",))
    con.commit()
    b.close()
done()
