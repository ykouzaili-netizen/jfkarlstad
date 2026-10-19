"""Bildgalleriet 19 oktober: fotodatum ur bildens uppgifter (EXIF), datumordning på webbplatsen, kategorier och
sortering i adminpanelen, dra och släpp med Återställ, "Läs fotodatum ur bilderna" och bildrutan på webbplatsen.

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
"""
from common import *
from PIL import Image, ImageDraw

D = OUT / "galleri"
D.mkdir(exist_ok=True)


def photo(name: str, taken: str | None, color, size=(1600, 1200)) -> str:
    img = Image.new("RGB", size, color)
    ImageDraw.Draw(img).text((40, 40), name, fill=(255, 255, 255))
    path = D / name
    if taken:
        ex = Image.Exif()
        ex[0x0110] = "Testkamera"
        ex.get_ifd(0x8769)[0x9003] = taken
        img.save(path, "JPEG", quality=85, exif=ex)
    else:
        img.save(path, "JPEG", quality=85)
    return str(path)


old = photo("aldre.jpg", "2026:08:20 18:05:00", (150, 40, 40))
new = photo("nyare.jpg", "2026:08:22 21:40:12", (40, 120, 60))
none = photo("utan.jpg", None, (60, 60, 140))
big = photo("stor.jpg", "2026:08:21 12:00:00", (120, 100, 20), size=(4200, 2800))  # komprimeras – datumet ska ändå följa med
nojs = photo("utan-js.jpg", "2026:08:19 09:15:00", (20, 20, 20))


def rows_titles(page, sel="tbody tr .row-title"):
    return [t.strip() for t in page.locator(sel).all_inner_texts()]


with sync_playwright() as p:
    b = p.chromium.launch()
    errors: list[str] = []
    adm = b.new_page(viewport={"width": 1280, "height": 1000})
    adm.on("pageerror", lambda e: errors.append(str(e)))
    login(adm)

    print("Uppladdning med fotodatum")
    # En bild: fältet Fotograferad fylls i från bilden
    adm.goto(f"{BASE}/admin/galleri/ny?kategori=inspark")
    check(adm.locator("select[name=album]").input_value() == "Inspark", "+ Ladda upp från en kategori förväljer den")
    adm.set_input_files("input[data-upload=image_key]", big)
    expect(adm.locator("input[name=taken_at]")).not_to_have_value("", timeout=15000)
    check(adm.locator("input[name=taken_at]").input_value() == "2026-08-21T12:00", "fotodatumet läses ur originalet även när bilden komprimeras")
    adm.fill("input[name=year]", "2026")
    adm.fill("input[name=alt]", "Stor bild")
    adm.locator(".admin-form-actions button[type=submit]").click()
    adm.wait_for_url(re.compile(r"klart=skapat"))

    # Flera bilder på en gång: varje bild får sitt eget datum
    adm.goto(f"{BASE}/admin/galleri/ny")
    adm.select_option("select[name=album]", "Inspark")
    adm.fill("input[name=year]", "2026")
    adm.set_input_files("input[data-upload=image_key]", [old, new, none])
    adm.locator(".admin-form-actions button[type=submit]").click()
    adm.wait_for_url(re.compile(r"klart=flera"), timeout=60000)

    # Utan JavaScript: bilden sparas oläst (för "Läs fotodatum ur bilderna")
    ctx = b.new_context(java_script_enabled=False)
    nj = ctx.new_page()
    login(nj)
    nj.goto(f"{BASE}/admin/galleri/ny")
    nj.select_option("select[name=album]", "Inspark")
    nj.fill("input[name=year]", "2026")
    nj.fill("input[name=alt]", "Utan JS")
    nj.set_input_files("input[name=image_key]", nojs)
    nj.locator(".admin-form-actions button[type=submit]").click()
    nj.wait_for_load_state()
    nj.goto(f"{BASE}/admin/galleri?sortera=tillagd-nyast")
    check(nj.locator("select[name=sortera]").count() == 1 and nj.locator("noscript").count() >= 1, "sorteringen fungerar utan JS (Visa-knapp)")
    ctx.close()

    print("Adminlistan")
    adm.goto(f"{BASE}/admin/galleri?kategori=inspark")
    taken = adm.locator("tbody tr td[data-label=Fotograferad]").all_inner_texts()
    print("   ", taken)
    check(taken[:4] == ["22 aug 2026 21:40", "21 aug 2026 12:00", "20 aug 2026 18:05", "Okänt"], "nyast fotograferad först, utan datum (utom den olästa) sist")
    check(adm.locator("[data-exif-backfill]").count() == 1 and "1 bild har inget fotodatum" in adm.locator("[data-exif-backfill]").inner_text(), "rutan Läs fotodatum visar den olästa bilden")
    adm.screenshot(path=str(OUT / "galleri-admin.png"), full_page=True)
    adm.locator("[data-exif-start]").click()
    adm.wait_for_url(re.compile(r"/admin/galleri"), timeout=20000)
    adm.wait_for_timeout(3500)
    adm.wait_for_load_state()
    check(adm.locator("[data-exif-backfill]").count() == 0, "rutan försvinner när bilderna är lästa")
    check("19 aug 2026 09:15" in adm.locator("tbody").first.inner_text(), "den äldre bilden fick sitt fotodatum ur filen")

    # Kategorier
    cats = adm.locator(".gl-cats a").all_inner_texts()
    check(any(c.startswith("Inspark") for c in cats) and cats[0].startswith("Alla"), f"kategorierna visas med antal ({cats})")
    adm.goto(f"{BASE}/admin/galleri?kategori=banketter")
    check(adm.locator(".admin-empty").count() == 1, "tom kategori ger en tydlig tom vy")

    # Sortering
    adm.goto(f"{BASE}/admin/galleri?kategori=inspark")
    adm.select_option("#gl-sortera", "foto-aldst")
    adm.wait_for_url(re.compile(r"sortera=foto-aldst"))
    asc = adm.locator("tbody tr td[data-label=Fotograferad]").all_inner_texts()
    check(asc[0] == "19 aug 2026 09:15" and asc[-1] == "Okänt", "Fotograferad – äldst först, utan datum sist")
    check(adm.locator("[data-sort-handle]").count() == 0, "inga draghandtag i sorterade vyer")
    adm.select_option("#gl-sortera", "tillagd-nyast")
    adm.wait_for_url(re.compile(r"sortera=tillagd-nyast"))
    check(adm.locator("tbody tr .row-title").first.inner_text() == "Utan JS", "Tillagd – senast först")

    print("Egen ordning och Återställ")
    adm.goto(f"{BASE}/admin/galleri?kategori=inspark")
    before = rows_titles(adm)
    h = adm.locator("tbody tr").nth(0).locator("[data-sort-handle]")
    h.focus()
    adm.keyboard.press("ArrowDown")
    expect(adm.locator(".sort-status").first).to_contain_text("sparad", timeout=10000)
    check(adm.locator("[data-gl-mode]").first.inner_text() == "Egen ordning" and adm.locator("[data-gl-reset]").first.is_visible(), "efter dragning: Egen ordning och knappen Återställ")
    adm.reload()
    after = rows_titles(adm)
    check(after[0] == before[1] and after[1] == before[0], "den nya ordningen är sparad")
    pub = b.new_page(viewport={"width": 1280, "height": 900})
    pub.on("pageerror", lambda e: errors.append(str(e)))
    pub.goto(f"{BASE}/for-studenter?album=inspark&ar=2026#bildgalleri")
    alts = pub.locator("[data-gal-year-panel]:not([hidden]) .gallery-item img").evaluate_all("els => els.map(e => e.alt)")
    check(alts[0] == after[0] or after[0].startswith("Bild utan"), f"webbplatsen följer den egna ordningen ({alts[:2]})")
    adm.once("dialog", lambda d: d.accept())
    adm.locator("[data-gl-reset] button").first.click()
    adm.wait_for_url(re.compile(r"klart=ordning-aterstalld"))
    check(rows_titles(adm) == before, "Återställ ger datumordningen tillbaka")
    check("kategori=inspark" in adm.url, "Återställ stannar i samma kategori")
    check(adm.locator("[data-gl-mode]").first.inner_text() == "Efter fotodatum", "albumet visar Efter fotodatum igen")

    print("Redigera")
    adm.locator("tbody tr .row-title", has_text="Utan JS").click()
    check(adm.locator("input[name=taken_at]").input_value() == "2026-08-19T09:15", "fotodatumet syns och kan ändras i formuläret")
    adm.fill("input[name=taken_at]", "2026-08-30T10:00")
    adm.locator(".admin-form-actions button[type=submit]").click()
    adm.wait_for_url(re.compile(r"klart=sparat"))
    check(adm.locator("tbody tr .row-title").first.inner_text() == "Utan JS", "ändrat fotodatum flyttar bilden")

    print("Bildrutan på webbplatsen")
    pub.goto(f"{BASE}/for-studenter?album=inspark&v=2#bildgalleri")
    items = pub.locator("[data-gal-year-panel]:not([hidden]) a[data-gal-item]")
    items.nth(1).click()
    dlg = pub.locator("dialog[data-gal-lb]")
    check(dlg.evaluate("d => d.open"), "bilden öppnas i en ruta på samma sida")
    check(pub.url.endswith("#bildgalleri"), "sidan ligger kvar")
    check(dlg.locator("[data-gal-lb-count]").inner_text() == "Bild 2 av 5", "räknaren visar bild 2 av 5")
    dl = dlg.locator("[data-gal-lb-download]")
    check(dl.get_attribute("download", timeout=2000).startswith("jfk-inspark-2026-") and "/media/" in dl.get_attribute("href"), "Ladda ned har filnamn och bildens adress")
    with pub.expect_download() as d:
        dl.click()
    check(d.value.suggested_filename.endswith(".jpg"), "bilden laddas ned")
    op = dlg.locator("[data-gal-lb-open]")
    check(op.get_attribute("target") == "_blank", "Öppna i ny flik öppnar en ny flik")
    pub.wait_for_timeout(400)
    pub.screenshot(path=str(OUT / "galleri-bildruta.png"))
    pub.keyboard.press("ArrowRight")
    check(dlg.locator("[data-gal-lb-count]").inner_text() == "Bild 3 av 5", "piltangenten byter bild")
    dlg.locator("[data-gal-lb-close]").click()
    check(not dlg.evaluate("d => d.open"), "krysset stänger")
    check(pub.evaluate("document.activeElement.hasAttribute('data-gal-item')"), "fokus tillbaka på bilden")
    items.first.click()
    pub.mouse.click(10, 500)  # den mörka kanten
    check(not dlg.evaluate("d => d.open"), "klick utanför bilden stänger")
    items.first.click()
    box = dlg.locator("[data-gal-lb-img]").bounding_box()
    pub.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    check(dlg.evaluate("d => d.open"), "klick på själva bilden stänger inte")
    pub.keyboard.press("Escape")
    check(not dlg.evaluate("d => d.open"), "Esc stänger")
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.goto(f"{BASE}/for-studenter?album=inspark&v=3#bildgalleri")
    m.locator("[data-gal-year-panel]:not([hidden]) a[data-gal-item]").first.click()
    m.wait_for_timeout(400)
    m.screenshot(path=str(OUT / "galleri-bildruta-mobil.png"))
    check(m.locator("[data-gal-lb-close]").is_visible(), "krysset syns på mobilen")
    # Utan JS: bilden öppnas i ny flik som förut
    ctx = b.new_context(java_script_enabled=False)
    nj = ctx.new_page()
    nj.goto(f"{BASE}/for-studenter?album=inspark#bildgalleri")
    check(nj.locator("a[data-gal-item]").first.get_attribute("target") == "_blank", "utan JS öppnas bilden i ny flik")
    ctx.close()

    check(not errors, f"inga skriptfel ({errors[:3]})")
    b.close()
done()
