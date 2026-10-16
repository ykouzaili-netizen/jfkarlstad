"""Studentnätverken (JURO, ELSA Karlstad): korten på Om oss leder till egna sidor, och logotyp, bilder,
texter och länkar läggs till under Partners → Studentnätverk."""
from common import *

# Bilder att ladda upp: E2E_IMAGES kan peka på en mapp med logga.png, huvud.jpg, bild2–4.jpg (riktiga foton
# ger bättre skärmbilder); annars skapas enfärgade testbilder.
IMG = Path(os.environ.get("E2E_IMAGES", ""))


def img(name: str, size=(1600, 1000), color=(40, 90, 160)) -> str:
    if IMG and (IMG / name).exists():
        return str(IMG / name)
    return str(test_image(OUT / f"natverk-{name}.jpg", size, color))


def settle(pg):
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(700)


with sync_playwright() as p:
    b = p.chromium.launch()
    pub = b.new_page(viewport={"width": 1280, "height": 1400})

    # Om oss: korten från databasen
    pub.goto(f"{BASE}/om-oss")
    cards = pub.locator("#samarbeten ~ * .collab-card, .collab-grid .collab-card")
    check(pub.locator(".collab-grid .collab-card").count() == 2, "två kort under Samarbeten (JURO och ELSA Karlstad)")
    check(pub.locator(".collab-grid a[href='/om-oss/juro']").count() == 1, "JURO-kortet länkar till /om-oss/juro")
    pub.locator(".collab-grid .collab-card").nth(1).click(position={"x": 40, "y": 40})
    pub.wait_for_load_state()
    check(pub.url.endswith("/om-oss/elsa-karlstad"), "ett klick var som helst på kortet öppnar sidan")
    check(pub.locator("h1").inner_text() == "ELSA Karlstad", "sidan har nätverkets namn som rubrik")
    check(pub.locator(".network-collab-panel").count() == 0, "ingen ruta Så samarbetar vi")
    check(pub.locator(".collab-grid a[href='/om-oss/juro']").count() == 1, "Fler samarbeten länkar till JURO")
    check(pub.locator(".breadcrumb a[href='/om-oss']").count() == 1, "brödsmulan leder tillbaka till Om oss")
    check(pub.request.get(f"{BASE}/om-oss/finns-inte").status == 404, "okänt nätverk ger 404")

    # Admin: logotyp, bilder, länkar
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    login(page)
    page.goto(f"{BASE}/admin/natverk")
    check(page.locator(".tabs a[href='/admin/natverk'][aria-current]").count() == 1, "fliken Studentnätverk under Partners")
    page.click("a.row-title:has-text('ELSA Karlstad')")
    page.wait_for_load_state()
    edit = page.url
    page.set_input_files("input[type=file][name=logo_key]", img("logga.png", (900, 360)))
    page.set_input_files("input[type=file][name=image_key]", img("huvud.jpg", (1800, 1200), (60, 110, 90)))
    page.fill("#falt-image_alt", "Exempelbild")
    for i, c in [(2, (150, 70, 60)), (3, (60, 70, 150)), (4, (120, 120, 40))]:
        page.set_input_files(f"input[type=file][name=image_{i}_key]", img(f"bild{i}.jpg", (1200, 900), c))
        page.fill(f"#falt-image_{i}_caption", f"Bildtext {i} (exempel)")
    page.fill("#falt-website_url", "https://example.com/elsa")
    page.fill("#falt-email", "elsa@example.com")
    page.locator("input[name=link_label]").first.fill("Instagram")
    page.locator("input[name=link_url]").first.fill("instagram.com/exempel")
    page.screenshot(path=str(OUT / "natverk-admin.png"), full_page=True)
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    check(page.locator(".field-error").count() == 0, "sparas utan fel")

    pub.goto(f"{BASE}/om-oss/elsa-karlstad")
    check(pub.locator(".network-hero-logo img.network-logo").count() == 1, "logotypen visas överst")
    check(pub.locator(".partner-photo--banner img").count() == 1, "huvudbilden visas")
    check(pub.locator(".network-gallery li").count() == 3, "tre bilder under Bilder")
    check(pub.locator(".network-gallery figcaption").first.inner_text() == "Bildtext 2 (exempel)", "bildtexten visas")
    check(pub.locator(".aside-card a[href='https://example.com/elsa']").count() == 1, "knapp till webbplatsen")
    check(pub.locator(".aside-card a[href='mailto:elsa@example.com']").count() == 1, "e-postadressen")
    check(pub.locator(".aside-card .partner-links a[href='https://instagram.com/exempel']").count() == 1, "extra länk med https:// tillagt")
    settle(pub)
    pub.screenshot(path=str(OUT / "natverk-elsa.png"), full_page=True)
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.goto(f"{BASE}/om-oss/elsa-karlstad")
    settle(m)
    check(m.evaluate("document.documentElement.scrollWidth <= innerWidth"), "ingen sidled scroll på mobil")
    m.screenshot(path=str(OUT / "natverk-elsa-mobil.png"), full_page=True)
    pub.goto(f"{BASE}/om-oss/juro")
    settle(pub)
    pub.screenshot(path=str(OUT / "natverk-juro.png"), full_page=True)
    pub.goto(f"{BASE}/om-oss#samarbeten")
    settle(pub)
    pub.locator("#samarbeten").scroll_into_view_if_needed()
    pub.wait_for_timeout(500)
    pub.locator("section[aria-labelledby=samarbeten]").screenshot(path=str(OUT / "natverk-om-oss.png"))
    check(pub.locator(".collab-grid .collab-card").nth(1).locator(".collab-logo-chip img").count() == 1, "ELSA-kortet visar bild och logotyp")

    # Nytt nätverk och dolt nätverk
    page.goto(f"{BASE}/admin/natverk/ny")
    page.fill("#falt-name", "Testnätverket")
    page.fill("#falt-summary", "Ett nätverk som bara finns i testet.")
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    pub.goto(f"{BASE}/om-oss")
    check(pub.locator(".collab-grid a[href='/om-oss/testnatverket']").count() == 1, "ett nytt nätverk får kort och egen sida")
    check(pub.request.get(f"{BASE}/om-oss/testnatverket").status == 200, "den nya sidan finns")
    page.goto(f"{BASE}/admin/natverk")
    page.click("a.row-title:has-text('Testnätverket')")
    page.wait_for_load_state()
    page.uncheck("input[name=published]", force=True)
    page.click("form button[type=submit] >> nth=-1")
    page.wait_for_load_state()
    check(pub.request.get(f"{BASE}/om-oss/testnatverket").status == 404, "ett dolt nätverk har ingen sida")

    # Sök
    pub.goto(f"{BASE}/sok?q=ELSA")
    check(pub.locator("a[href='/om-oss/elsa-karlstad']").count() >= 1, "sökningen hittar nätverkets sida")
    b.close()
done()
