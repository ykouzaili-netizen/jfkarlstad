"""Regressionstest av äldre delar: Utseende, galleriet (GDPR-radering), dokument (PDF och länk) och användare."""
import re
import sqlite3
from pathlib import Path

from common import BASE, OUT, check, done, login, test_image, sync_playwright

DB = Path(__file__).resolve().parents[1] / "local-preview/.data/local.sqlite"
FILES = Path(__file__).resolve().parents[1] / "local-preview/.data/r2"


def media_keys() -> set[str]:
    with sqlite3.connect(DB) as c:
        return {r[0] for r in c.execute("SELECT key FROM media")}


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    login(page)

    print("Utseende")
    page.goto(f"{BASE}/admin/utseende")
    page.fill("[data-color-hex=color_accent]", "#e0b830")
    page.set_input_files("#falt-logo", str(test_image(OUT / "logo.jpg", (600, 600), (20, 20, 20))))
    page.wait_for_timeout(800)
    page.click("#utseende-form button[type=submit]:not([name])")
    page.wait_for_url(re.compile(r"klart=sparat"))
    html = page.request.get(f"{BASE}/").text()
    check("#e0b830" in html and "brand-logo" in html, "färg och logotyp sparas och syns")

    print("Galleriet")
    before = media_keys()
    page.goto(f"{BASE}/admin/galleri/ny")
    page.set_input_files("#falt-image_key", str(test_image(OUT / "galleri.jpg", (1600, 1200), (90, 140, 80))))
    page.select_option("[name=album]", index=1)
    page.fill("[name=alt]", "Studenter på sittning")
    page.wait_for_timeout(800)
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/galleri\?klart="))
    new = media_keys() - before
    check(len(new) == 1, "galleribilden registreras i bildbanken")
    key = next(iter(new), "")
    page.once("dialog", lambda d: d.accept())
    page.locator("tr:has-text('Studenter på sittning') form[action$='/radera'] button").click()
    page.wait_for_url(re.compile(r"klart=raderat"))
    check(key not in media_keys() and not (FILES / key).exists() and not (FILES / f"{key}.sm").exists(), "galleribilden raderas helt (även den lilla versionen)")
    # Bildbeskrivningen är valfri
    page.goto(f"{BASE}/admin/galleri/ny")
    page.set_input_files("#falt-image_key", str(test_image(OUT / "galleri2.jpg", (1200, 900), (140, 90, 80))))
    page.select_option("[name=album]", index=1)
    album = page.locator("[name=album]").input_value()
    page.wait_for_timeout(800)
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/galleri\?klart="))
    check("Bild utan beskrivning" in page.content(), "en bild utan bildbeskrivning går att spara och syns i listan")
    page.goto(f"{BASE}/for-studenter")
    check(page.locator(f'.gallery-grid img[alt="Bild från albumet {album}"]').count() == 1, "utan beskrivning får bilden en alt-text med albumet")
    page.goto(f"{BASE}/admin/galleri")
    page.once("dialog", lambda d: d.accept())
    page.locator("tr:has-text('Bild utan beskrivning') form[action$='/radera'] button").click()
    page.wait_for_url(re.compile(r"klart=raderat"))

    # Flera bilder på en gång (med JS: en i taget, med mindre versioner)
    page.goto(f"{BASE}/admin/galleri/ny")
    check(page.locator("#falt-image_key").get_attribute("multiple") is not None, "bildfältet i galleriet tar emot flera filer")
    many = [str(test_image(OUT / f"flera{i}.jpg", (1800, 1200), (60 + i * 40, 90, 120))) for i in range(3)]
    before = media_keys()
    page.set_input_files("#falt-image_key", many)
    check("3 bilder valda" in page.locator("[data-upload-status=image_key]").inner_text(), "antalet valda bilder visas")
    page.select_option("[name=album]", index=1)
    page.fill("[name=caption]", "Flera på en gång")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/galleri\?klart=flera&antal=3"), timeout=30000)
    check("3 bilder har laddats upp" in page.content(), "meddelandet säger hur många bilder som laddades upp")
    new = media_keys() - before
    check(len(new) == 3, f"tre bilder registreras i bildbanken ({len(new)})")
    check(all((FILES / f"{k}.sm").exists() for k in new), "varje bild får sin mindre version")
    # Utan JavaScript: alla filer skickas på en gång och servern gör en bild per fil
    nojs = browser.new_context(java_script_enabled=False, reduced_motion="reduce")
    p2 = nojs.new_page()
    for ck in page.context.cookies():
        nojs.add_cookies([ck])
    p2.goto(f"{BASE}/admin/galleri/ny")
    p2.set_input_files("#falt-image_key", many[:2])
    p2.select_option("[name=album]", index=1)
    p2.fill("[name=caption]", "Flera utan JS")
    p2.click("form.admin-form button[type=submit]")
    p2.wait_for_url(re.compile(r"klart=flera"))
    check("2 bilder har laddats upp" in p2.content(), "flera bilder fungerar även utan JavaScript")
    nojs.close()
    # År: ändra flera bilder på en gång (Bildgalleri → markera → År) och välj år på webbplatsen
    page.goto(f"{BASE}/admin/galleri")
    group = page.locator("section.gl-group", has=page.locator(".gl-year", has_text="Utan årtal")).first
    check(group.count() == 1, "bilderna utan år ligger i en egen grupp")
    group.locator("[data-gl-all]").check()
    check("5 bilder markerade" in page.locator("[data-gl-count]").inner_text(), "Markera alla markerar gruppen och räknar")
    group.locator("input.gl-pick").first.uncheck()
    page.fill("form.gl-bulk input[name=year]", "2025")
    page.click("form.gl-bulk button[value=andra]")
    page.wait_for_url(re.compile(r"klart=flera-andrade"))
    check(page.locator(".gl-year", has_text="2025").count() >= 1 and page.locator(".gl-year", has_text="Utan årtal").count() == 1, "året sparas på de markerade bilderna")
    page.goto(f"{BASE}/for-studenter#bildgalleri")
    panel = page.locator("[data-gal-panel]:not([hidden])")
    check(panel.locator("a[data-gal-year='2025']").count() == 1 and panel.locator("a[data-gal-year='utan']").count() == 1, "albumet har ett val per år och ”Utan årtal”")
    check(panel.locator("a[data-gal-year='2025'][aria-current]").count() == 1, "det senaste året visas först")
    panel.locator("a[data-gal-year='utan']").click()
    check("ar=utan" in page.url, "adressen visar det valda året (går att dela och fungerar utan JS)")
    check(panel.locator("[data-gal-year-panel]:not([hidden]) li").count() == 1, "bilden utan år visas under Utan årtal")
    for label in ["Flera på en gång"] * 3 + ["Flera utan JS"] * 2:
        page.goto(f"{BASE}/admin/galleri")
        page.once("dialog", lambda d: d.accept())
        page.locator(f"tr:has-text('{label}') form[action$='/radera'] button").first.click()
        page.wait_for_url(re.compile(r"klart=raderat"))

    print("Filmer (Biografen)")
    page.goto(f"{BASE}/for-studenter")
    check(page.locator("section.cine").count() == 0, "Biografen syns inte när det inte finns några filmer")
    page.goto(f"{BASE}/admin/filmer/ny")
    page.fill("[name=youtube_url]", "https://example.com/inte-youtube")
    page.fill("[name=title]", "Testfilm")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_load_state()
    check("ser inte ut som en YouTube-länk" in page.content(), "en länk som inte är YouTube ger ett begripligt fel")
    page.fill("[name=youtube_url]", "https://youtube.com/shorts/kLmNoPqRsT2?si=abc")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/filmer\?klart="))
    check("Stående" in page.content(), "en YouTube Short blir stående automatiskt")
    page.goto(f"{BASE}/admin/filmer/ny")
    page.fill("[name=youtube_url]", "https://www.youtube.com/watch?v=aBcDeFgHiJ1&t=30s")
    page.fill("[name=title]", "Liggande testfilm")
    page.fill("[name=year]", "2026")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/filmer\?klart="))
    page.goto(f"{BASE}/for-studenter#biografen")
    cine = page.locator("section.cine")
    check(cine.count() == 1 and cine.locator(".cine-item").count() == 2, "Biografen visar filmerna i ett program")
    shown = cine.locator("[data-cine-screen]:not([hidden])")
    check(shown.locator(".cine-poster").get_attribute("src").startswith("/film/bild/"), "stillbilden kommer från sajten, inte från YouTube")
    check(page.locator("iframe").count() == 0, "inget laddas från YouTube innan man trycker på play")
    shown.locator(".cine-play").click()
    check("youtube-nocookie.com/embed/aBcDeFgHiJ1" in (shown.locator("iframe").get_attribute("src") or ""), "play laddar spelaren från youtube-nocookie.com")
    cine.locator("[data-cine-pick]").filter(has=page.locator("b", has_text=re.compile(r"^Testfilm$"))).click()
    vis = cine.locator("[data-cine-screen]:not([hidden])")
    check("is-vertical" in (vis.get_attribute("class") or "") and page.locator("iframe").count() == 0, "programmet byter till den stående filmen och stoppar den som spelades")
    csp = page.request.get(f"{BASE}/for-studenter").headers.get("content-security-policy", "")
    check("frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com" in csp, "CSP tillåter bara youtube-nocookie.com som extra ram")
    check(page.request.get(f"{BASE}/film/bild/zzzzzzzzzzz.jpg").status == 404, "stillbildsadressen fungerar bara för filmer som finns i galleriet")
    for title in ["Testfilm", "Liggande testfilm"]:
        page.goto(f"{BASE}/admin/filmer")
        page.once("dialog", lambda d: d.accept())
        page.locator(f"tr:has(a.row-title:text-is('{title}')) form[action$='/radera'] button").click()
        page.wait_for_url(re.compile(r"klart=raderat"))

    print("Dokument")
    pdf = OUT / "test.pdf"
    pdf.write_bytes(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    page.goto(f"{BASE}/admin/dokument/ny")
    page.fill("[name=title]", "Testprotokoll")
    page.select_option("[name=category]", "protokoll")
    check(page.locator("input[name=source][value=lank]").is_checked() and page.locator("#falt-file_key").is_hidden(), "nya dokument är länkar som standard, PDF-fältet är dolt")
    page.check("input[name=source][value=pdf]")
    check(page.locator("#falt-file_key").is_visible() and page.locator("#falt-link_url").is_hidden(), "PDF-fältet visas när man väljer PDF")
    page.set_input_files("#falt-file_key", str(pdf))
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/dokument\?klart="))
    html = page.request.get(f"{BASE}/dokument").text()
    m = re.search(r'href="/dokument/fil/(\d+)"[^>]*>Testprotokoll', html)
    check(bool(m), "dokumentet visas på webbplatsen")
    if m:
        r = page.request.get(f"{BASE}/dokument/fil/{m.group(1)}")
        check(r.status == 200 and r.headers.get("content-type") == "application/pdf", "PDF:en kan öppnas")
        doc_id = m.group(1)
        pdf_key = sqlite3.connect(DB).execute("SELECT file_key FROM documents WHERE id = ?", (doc_id,)).fetchone()[0]

        # Byta till länk utan att klistra in någon: felmeddelande, PDF:en ligger kvar
        page.goto(f"{BASE}/admin/dokument/{doc_id}")
        check(page.locator("input[name=source][value=pdf]").is_checked(), "dokument med PDF öppnas med PDF valt")
        page.check("input[name=source][value=lank]")
        page.click("form.admin-form button[type=submit]")
        page.wait_for_load_state()
        check(page.locator("#link_url-fel").count() == 1 and pdf_key in media_keys(), "tom länk ger fel och PDF:en finns kvar")

        # Byta till Google-länk: PDF:en raderas helt, sidan länkar till Google via den fasta adressen
        gdoc = "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing"
        page.check("input[name=source][value=lank]")
        page.fill("#falt-link_url", gdoc)
        page.click("form.admin-form button[type=submit]")
        page.wait_for_url(re.compile(r"klart=sparat"))
        check(pdf_key not in media_keys() and not (FILES / pdf_key).exists(), "PDF:en raderas när dokumentet blir en länk")
        html = page.request.get(f"{BASE}/dokument").text()
        check('aria-hidden="true">DOC</span>' in html and "Google Dokument" in html and f'href="/dokument/fil/{doc_id}"' in html, "länken visas som Google Dokument på webbplatsen")
        r = page.request.get(f"{BASE}/dokument/fil/{doc_id}", max_redirects=0)
        check(r.status == 302 and r.headers.get("location") == gdoc, "den fasta adressen skickar vidare till Google")
        check(f"/dokument/fil/{doc_id}" in page.request.get(f"{BASE}/sok?q=Testprotokoll").text(), "sökningen länkar till dokumentet")

        # Tillbaka till PDF utan fil: länken töms, dokumentet står som "kommer snart"
        page.goto(f"{BASE}/admin/dokument/{doc_id}")
        page.check("input[name=source][value=pdf]")
        page.click("form.admin-form button[type=submit]")
        page.wait_for_url(re.compile(r"klart=sparat"))
        row = sqlite3.connect(DB).execute("SELECT link_url, file_key FROM documents WHERE id = ?", (doc_id,)).fetchone()
        check(row == (None, None), "länken töms när man väljer PDF")
        check(page.request.get(f"{BASE}/dokument/fil/{doc_id}", max_redirects=0).status == 404, "utan fil eller länk finns inget att öppna")

    print("Användare")
    page.goto(f"{BASE}/admin/anvandare")
    page.fill("[name=namn]", "Redaktör Testsson")
    page.fill("[name=epost]", "redaktor@jfkarlstad.se")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_load_state()
    check(page.locator(".invite-box").count() == 1, "inbjudningslänk skapas")

    check(not errors, f"inga JavaScript-fel {errors[:3]}")
    browser.close()
done()
