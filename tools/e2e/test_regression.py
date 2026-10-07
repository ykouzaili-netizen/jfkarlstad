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
