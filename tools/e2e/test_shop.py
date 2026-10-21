"""JFK Butik (/butik): dold från början och synlig för inloggade, släppets produkter först, storleksval och
varukorgen i webbläsaren, produktsidan, adminpanelens produkter och släpp, och att butiken kan visas för alla.

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
"""
from common import *


def set_visible(page, on: bool):
    page.goto(f"{BASE}/admin/texter?sida=butik")
    box = page.locator("input[name=__sida_synlig]")
    if box.is_checked() != on:
        label = box.locator("xpath=ancestor::label[1]")
        label.click() if label.count() else box.click()
    page.click("#texter-form .sticky-actions button[type=submit]")
    page.wait_for_url(re.compile(r"klart="))


with sync_playwright() as p:
    browser = p.chromium.launch()
    guest = browser.new_context().new_page()
    errors: list[str] = []

    print("Dold för besökare")
    check(guest.goto(f"{BASE}/butik").status == 404, "/butik svarar 404 för besökare")
    check(guest.goto(f"{BASE}/butik/jfk-hoodie").status == 404, "produktsidan svarar 404 för besökare")
    guest.goto(f"{BASE}/")
    check(guest.locator('header a[href="/butik"]').count() == 0, "ingen menylänk till butiken")
    check("/butik" not in guest.goto(f"{BASE}/sitemap.xml").text(), "inte i sitemap")

    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    login(page)

    print("Inloggad: butiken med släppet")
    page.goto(f"{BASE}/butik")
    check(page.locator(".hidden-page-note").count() == 1, "raden ”Sidan är dold” visas")
    features = page.locator(".shop-feature")
    check(features.count() == 3, "tre produkter visas stort (två i släppet + utvald)")
    check("Vinnartröjan" in features.first.inner_text(), "släppets produkt först")
    check("Beställ senast 30 januari" in features.first.inner_text(), "sista dagen för släppet visas")
    check(page.locator("#allt .shop-card").count() == 3, "tre produkter under Också i butiken")
    check(page.locator(".shop-drawing").count() >= 6, "teckningar när foton saknas")

    print("Storlek och varukorg")
    add = page.locator("#p-vinnartrojan .shop-add")
    check(add.is_disabled() and "Välj storlek först" in add.inner_text(), "knappen väntar på storlek")
    page.locator("#p-vinnartrojan label.shop-size", has_text="M").click()
    check(not add.is_disabled() and "449" in add.inner_text(), "knappen visar priset när storleken är vald")
    add.click()
    toast = page.locator("[data-shop-toast]")
    check(toast.is_visible() and "Vinnartröjan" in toast.inner_text(), "bekräftelsen visas")
    page.locator("#p-vinnarmarket .shop-add").click()
    page.locator("#p-vinnarmarket .shop-add").click()
    check(page.locator("[data-shop-count]").first.inner_text() == "3", "korgen räknar tre varor")

    print("Färgvalet byter teckningens färg")
    page.locator("#p-jfk-hoodie label.shop-swatch").nth(1).click()
    check("Krämvit" in page.locator("#p-jfk-hoodie [data-shop-chosen]").inner_text(), "vald färg visas")
    g = page.locator('#p-jfk-hoodie [data-shop-drawing]').evaluate("e => getComputedStyle(e).getPropertyValue('--g').trim()")
    check(g == "#ece4d0", "teckningen blev krämvit")

    page.goto(f"{BASE}/butik/varukorg")
    groups = page.locator(".shop-cart-group")
    check(groups.count() == 1 and "Släpp 01" in groups.first.inner_text(), "släppets varor i en egen grupp")
    check(page.locator("[data-shop-cart-total]").inner_text().replace(" ", " ") == "607 kr", "summan stämmer (449 + 2 × 79)")
    page.get_by_role("button", name="Öka antal: Vinnartröjan").click()
    check(page.locator("[data-shop-cart-total]").inner_text().replace(" ", " ") == "1 056 kr", "fler ökar summan")
    page.get_by_role("button", name="Ta bort: Vinnarmärket").click()
    check(page.locator(".shop-cart-item").count() == 1, "ta bort fungerar")
    check("Kassan öppnar när leverantören är vald" in page.content(), "kassan säger att betalningen inte är kopplad")

    print("Produktsidan")
    page.goto(f"{BASE}/butik/jfk-hoodie")
    check(page.locator("h1.shop-name").inner_text() == "JFK-hoodie", "rubriken är produktens namn")
    check(page.locator("details#matt").count() == 1, "måtten finns")
    check(page.goto(f"{BASE}/butik/finns-inte").status == 404, "okänd produkt ger 404")

    print("Adminpanelen")
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(f"{BASE}/admin/butik")
    check("Butiken är dold" in page.inner_text("main"), "statusrutan säger att butiken är dold")
    page.click("text=Lägg till produkt")
    page.fill("input[name=name]", "Testkeps")
    page.fill("input[name=price]", "189")
    page.locator("input[name=kind][value=alltid]").check()
    page.select_option("select[name=garment]", "annat")
    page.fill("textarea[name=colors]", "Grön #1f7a3d")
    page.get_by_role("button", name="Skapa").click()
    page.wait_for_load_state()
    page.goto(f"{BASE}/butik")
    check(page.locator(".shop-card", has_text="Testkeps").count() == 1, "ny produkt syns i butiken")

    page.goto(f"{BASE}/admin/butik-slapp/1")
    page.fill("input[name=ends_at]", "2020-01-01T00:00")
    page.get_by_role("button", name="Spara ändringar").click()
    page.wait_for_load_state()
    check("efter att släppet öppnar" in page.content(), "sista beställning före öppning ger fel")

    print("Visa butiken för alla")
    set_visible(page, True)
    check(guest.goto(f"{BASE}/butik").status == 200, "besökare ser butiken")
    guest.goto(f"{BASE}/")
    check(guest.locator('a[href="/butik"]').count() >= 1, "menylänk till butiken")
    check("/butik/jfk-hoodie" in guest.goto(f"{BASE}/sitemap.xml?v=2").text(), "butiken och produkterna i sitemap")
    set_visible(page, False)
    check(guest.goto(f"{BASE}/butik").status == 404, "dold igen")

    check(not errors, "inga JavaScript-fel" + (f": {errors}" if errors else ""))
    browser.close()

done()
