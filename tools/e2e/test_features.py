"""Webbläsartest av adminpanelens funktioner: texter, ångra/historik, sök, klickbar karta, menyn,
jobb, statistik, lediga uppdrag, schemaläggning, kopiering, bildbank och styrelseskifte.

Kräver en nollställd lokal databas:  npm run preview:node -- --reset
"""
import re
import time
import urllib.request

from common import BASE, OUT, check, done, login, test_image, sync_playwright


def get(path: str, ua: str = "Mozilla/5.0 (Macintosh) Test") -> tuple[int, str, dict]:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):  # noqa: D401
            return None

    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(BASE + path, headers={"User-Agent": ua})
    try:
        with opener.open(req) as r:
            return r.status, r.read().decode("utf-8", "replace"), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:  # 3xx/4xx
        return e.code, e.read().decode("utf-8", "replace"), {k.lower(): v for k, v in e.headers.items()}


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="sv-SE")
    page = ctx.new_page()
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    print("Inloggning")
    login(page)
    check("/admin" in page.url, "inloggad i adminpanelen")

    # ───────── Översikt: klickbar webbplats ─────────
    print("Översikt och klickbar karta")
    page.goto(f"{BASE}/admin")
    frame_el = page.locator("[data-map-frame]")
    check(frame_el.count() == 1, "kartan över webbplatsen finns på Översikt")
    page.wait_for_function("() => { const f = document.querySelector('[data-map-frame]'); return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.getAttribute('data-map-ready') }", timeout=15000)
    frame = page.frame_locator("[data-map-frame]")
    marked = frame.locator("[data-eu]").count()
    check(marked > 40, f"många klickbara delar på startsidan ({marked})")
    frame.locator("#hero-titel").hover()
    time.sleep(0.2)
    label = frame.locator(".em-label").inner_text()
    check("Startsidan" in label and "Rubrik" in label, f"etiketten visar var texten ändras ({label!r})")
    page.screenshot(path=str(OUT / "oversikt.png"))
    frame.locator("#hero-titel").click()
    page.wait_for_url(re.compile(r"/admin/texter\?sida=startsida&falt=hero_title"))
    check(True, "klick på rubriken leder till rätt fält")
    page.wait_for_timeout(600)
    focused = page.evaluate("document.activeElement && document.activeElement.name")
    check(focused == "hero_title", f"fältet får fokus ({focused})")

    # Klick på ett event i kartan → eventets redigeringssida
    page.goto(f"{BASE}/admin")
    page.wait_for_function("() => document.querySelector('[data-map-frame]').contentDocument.body.getAttribute('data-map-ready')", timeout=15000)
    ev = page.frame_locator("[data-map-frame]").locator(".event-card").first
    if ev.count():
        ev.click()
        page.wait_for_url(re.compile(r"/admin/event/\d+$"))
        check(True, "klick på ett event leder till eventets sida i panelen")
    # Klick på menyn i kartan → menyredigeraren
    page.goto(f"{BASE}/admin")
    page.wait_for_function("() => document.querySelector('[data-map-frame]').contentDocument.body.getAttribute('data-map-ready')", timeout=15000)
    page.frame_locator("[data-map-frame]").locator(".nav-link").first.click()
    page.wait_for_url(re.compile(r"sida=meny"))
    check(True, "klick på menyn leder till menyredigeraren")

    # ───────── Texter: redigera, förhandsvisa, spara, ångra, historik ─────────
    print("Texter och sidor")
    page.goto(f"{BASE}/admin/texter")
    check(page.locator(".page-card").count() >= 19, "alla sidor visas som kort")
    page.screenshot(path=str(OUT / "texter-oversikt.png"))
    page.goto(f"{BASE}/admin/texter?sida=startsida")
    open_sections = page.locator("details[data-section][open]").count()
    check(open_sections == 1, "ett avsnitt är öppet från början")
    page.locator("details[data-section] > summary").nth(2).click()
    page.wait_for_timeout(200)
    check(page.locator("details[data-section][open]").count() == 1, "bara ett avsnitt öppet åt gången")
    page.locator("details[data-section] > summary").first.click()
    more = page.locator("details[data-section][open] .more-texts > summary").first
    if more.count():
        more.click()
        check(page.locator("details[data-section][open] .more-texts[open]").count() == 1, "”Visa fler texter” öppnar de extra fälten")
    page.fill("textarea[name=hero_title], input[name=hero_title]", "En helt ny rubrik för testet")
    page.wait_for_function("() => { const f = document.querySelector('[data-lp-frame]'); const h = f && f.contentDocument && f.contentDocument.querySelector('#hero-titel'); return h && h.textContent.includes('En helt ny rubrik') }", timeout=10000)
    check(True, "förhandsvisningen visar den nya rubriken innan den sparas")
    reset = page.locator('[data-reset="hero_title"]')
    check(reset.is_visible(), "”Återställ originaltexten” syns när texten ändrats")
    # Klick i förhandsvisningen hoppar till fältet
    page.frame_locator("[data-lp-frame]").locator("[data-ek=intro_title]").click()
    page.wait_for_timeout(700)
    check(page.evaluate("document.activeElement && document.activeElement.name") == "intro_title", "klick på en text i förhandsvisningen öppnar fältet")
    page.screenshot(path=str(OUT / "texter-startsida.png"))
    page.click("#texter-form button[type=submit]")
    page.wait_for_url(re.compile(r"klart=texter&andring="))
    check(page.locator(".undo-box").count() == 1, "kvitto med Ångra-knapp efter sparning")
    status, body, _ = get("/")
    check("En helt ny rubrik för testet" in body, "ny rubrik syns på webbplatsen")
    page.click(".undo-box button[type=submit]")
    page.wait_for_url(re.compile(r"klart=angrat"))
    status, body, _ = get("/")
    check("En helt ny rubrik för testet" not in body, "Ångra återställer rubriken")
    page.goto(f"{BASE}/admin/texter/historik?nyckel=hero_title")
    versions = page.locator(".version-item").count()
    check(versions >= 4, f"historiken visar versionerna ({versions} rader)")
    # Återställ den nya rubriken via historiken (bekräftelsedialogen godkänns)
    page.once("dialog", lambda d: d.accept())
    page.locator(".version-item:has-text('En helt ny rubrik') form button").first.click()
    page.wait_for_url(re.compile(r"klart=aterstallt-text"))
    status, body, _ = get("/")
    check("En helt ny rubrik för testet" in body, "en tidigare version kan återställas")
    page.screenshot(path=str(OUT / "historik.png"))
    # Tillbaka till originalet
    page.once("dialog", lambda d: d.accept())
    page.locator(".version-original form button").click()
    page.wait_for_url(re.compile(r"klart=aterstallt-text"))
    status, body, _ = get("/")
    check("En helt ny rubrik för testet" not in body, "originaltexten kan återställas")

    # Obligatoriskt fält tomt → fel
    page.goto(f"{BASE}/admin/texter?sida=startsida")
    page.fill("[name=hero_title]", "")
    page.click("#texter-form button[type=submit]")
    page.wait_for_load_state()
    check(page.locator(".alert-error").count() == 1 and page.locator("details[data-section][open] .has-error").count() >= 1, "tomt obligatoriskt fält ger ett tydligt fel i rätt avsnitt")

    # Gemensamt: knapptext ändras överallt
    page.goto(f"{BASE}/admin/texter?sida=gemensamt&falt=join_label")
    page.fill("[name=join_label]", "Gå med i JFK")
    page.click("#texter-form button[type=submit]")
    page.wait_for_url(re.compile(r"klart=texter"))
    status, body, _ = get("/om-oss")
    check(body.count("Gå med i JFK") >= 2, "”Bli medlem”-knapparna får den nya texten")

    # Om oss: utseendet på toppen och utskotten väljs i adminpanelen
    for key, value, css in [("about_hero_style", "delad", "about-hero--delad"), ("committees_style", "karusell", "committees--karusell")]:
        page.goto(f"{BASE}/admin/texter?sida=om-oss&falt={key}")
        page.locator(f"label:has(input[name={key}][value={value}])").click()
        page.click("#texter-form button[type=submit]")
        page.wait_for_url(re.compile(r"klart=texter"))
        status, body, _ = get("/om-oss")
        check(css in body, f"utseendet {value} syns på Om oss")
    page.goto(f"{BASE}/om-oss")
    page.locator(".committees--karusell .committee-grid").focus()
    check(page.evaluate("document.activeElement.classList.contains('committee-grid')"), "karusellen kan nås med tangentbordet")
    for key, value in [("about_hero_style", "kollage"), ("committees_style", "mork")]:
        page.goto(f"{BASE}/admin/texter?sida=om-oss&falt={key}")
        page.locator(f"label:has(input[name={key}][value={value}])").click()
        page.click("#texter-form button[type=submit]")
        page.wait_for_url(re.compile(r"klart=texter"))

    # ───────── Sök ─────────
    print("Sök")
    page.goto(f"{BASE}/admin")
    page.fill("#topp-sok", "Gå med i JFK")
    page.press("#topp-sok", "Enter")
    page.wait_for_url(re.compile(r"/admin/sok\?q="))
    hit = page.locator(".admin-hit").first
    check(hit.count() == 1 and "join_label" in (hit.get_attribute("href") or ""), "sök hittar texten och länkar till fältet")
    page.goto(f"{BASE}/admin/sok?q=inspark")
    check(page.locator(".search-group-admin").count() >= 1, "sök hittar innehåll (event/nyheter)")
    page.screenshot(path=str(OUT / "admin-sok.png"))
    status, body, _ = get("/sok?q=inspark")
    check("search-hit" in body and "<mark>" in body.lower(), "sök på webbplatsen visar markerade träffar")
    status, body, _ = get("/sok?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    check("<script>alert(1)" not in body, "sökordet escapas på webbplatsen")

    # ───────── Menyn ─────────
    print("Menyn")
    page.goto(f"{BASE}/admin/texter?sida=meny")
    page.fill("#meny-paverka", "Påverka")
    row = page.locator("[data-menu-item]:has(#meny-kontakt) > [data-menu-row] [data-move=up]")
    row.click()
    page.locator("[data-menu-row]:has(#meny-aktuellt) [data-menu-visible]").uncheck()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "menyn.png"))
    page.click("#meny-form button[type=submit]:not([name])")
    page.wait_for_url(re.compile(r"klart=meny"))
    status, body, _ = get("/")
    nav = re.search(r'<ul class="nav-list">(.*?)</ul>\s*<div class="nav-mobile-cta">', body, re.S)
    nav_html = nav.group(1) if nav else ""
    check(">Påverka<" in nav_html, "nytt menynamn syns")
    check('href="/aktuellt"' not in re.sub(r'<ul class="sub-menu".*?</ul>', "", nav_html, flags=re.S), "dold menypunkt syns inte")
    check(nav_html.find('href="/kontakt"') < nav_html.find('href="/jf-paverka"'), "ny ordning syns")
    page.once("dialog", lambda d: d.accept())
    page.click("#meny-form button[name=aterstall]")
    page.wait_for_url(re.compile(r"sida=meny"))
    status, body, _ = get("/")
    check(">JF Påverka<" in body and 'href="/aktuellt"' in body, "standardmenyn kan återställas")

    # ───────── Bildbank och uppladdning ─────────
    print("Bildbank")
    img = test_image(OUT / "test.jpg")
    page.goto(f"{BASE}/admin/nyheter/ny")
    page.fill("[name=title]", "Testnyhet med bild")
    page.fill("[name=body]", "Brödtext.")
    page.set_input_files("#falt-image_key", str(img))
    page.wait_for_function("() => { const i = document.querySelector('[data-small-for=image_key]'); return i && i.files && i.files.length === 1 }", timeout=10000)
    check(True, "en liten version skapas i webbläsaren")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/nyheter\?klart="))
    page.goto(f"{BASE}/admin/bildbank")
    cards = page.locator(".media-card").count()
    check(cards >= 1, f"bilden finns i bildbanken ({cards})")
    src = page.locator(".media-card img").first.get_attribute("src") or ""
    s_status, _, s_headers = get(src)
    check(src.endswith(".sm") and s_status == 200 and "image/" in s_headers.get("content-type", ""), "den lilla versionen serveras")
    check("Nyhet: Testnyhet med bild" in page.content(), "bildbanken visar var bilden används")
    page.screenshot(path=str(OUT / "bildbank.png"))
    # Välj bilden från bildbanken i en annan nyhet
    page.goto(f"{BASE}/admin/nyheter/ny")
    page.fill("[name=title]", "Andra nyheten")
    page.click("[data-bank-open=image_key]")
    page.wait_for_selector(".bank-pick")
    page.screenshot(path=str(OUT / "bildbank-valj.png"))
    page.locator(".bank-pick").first.click()
    check(page.locator("[data-bank-for=image_key]").input_value() != "", "vald bild från bildbanken fylls i")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/nyheter\?klart="))
    page.goto(f"{BASE}/admin/bildbank")
    check("Andra nyheten" in page.content(), "samma bild används nu på två ställen")
    # Ladda upp en bild direkt i bildbanken och ta bort den (används inte)
    page.set_input_files("#falt-bild", str(test_image(OUT / "test2.jpg", (900, 600), (200, 60, 60))))
    page.wait_for_timeout(500)
    page.click(".bank-upload-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/bildbank\?klart=skapat"))
    page.goto(f"{BASE}/admin/bildbank?visa=oanvanda")
    unused = page.locator(".media-card").count()
    check(unused == 1, "filtret ”Används inte” visar den oanvända bilden")
    page.once("dialog", lambda d: d.accept())
    page.locator(".media-card form button").first.click()
    page.wait_for_url(re.compile(r"klart=raderat"))
    check(page.locator(".media-card").count() == 0, "en oanvänd bild kan tas bort")

    # ───────── Jobb och praktik + statistik ─────────
    print("Jobb och statistik")
    page.goto(f"{BASE}/admin/jobb/ny")
    page.fill("[name=title]", "Sommarnotarie 2027")
    page.select_option("[name=partner_id]", index=1)
    partner_name = page.locator("[name=partner_id] option").nth(1).inner_text()
    page.fill("[name=employer]", partner_name)
    page.select_option("[name=kind]", "sommarnotarie")
    page.fill("[name=location]", "Stockholm")
    page.fill("[name=summary]", "Arbeta som notarie under sommaren.")
    page.fill("[name=body]", "## Om tjänsten\n\nDu får arbeta med riktiga ärenden.")
    page.fill("[name=apply_url]", "https://example.com/ansok")
    page.fill("[name=deadline]", "2030-01-31")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/jobb\?klart="))
    status, body, _ = get("/karriar")
    check("Sommarnotarie 2027" in body, "tjänsten syns på /karriar")
    slug = re.search(r'href="/karriar/([^"?]+)"', body)
    status, body, _ = get(f"/karriar/{slug.group(1)}") if slug else (0, "", {})
    check(status == 200 and "JobPosting" in body, "tjänstens sida har JobPosting-data")
    job_id = re.search(r'href="/ut/ansok/(\d+)"', body)
    st, _, hdr = get(f"/ut/ansok/{job_id.group(1)}") if job_id else (0, "", {})
    check(st == 302 and hdr.get("location") == "https://example.com/ansok", "/ut/ansok leder vidare till ansökan")
    st, _, _ = get("/ut/ansok/99999")
    check(st == 404, "okänd utlänk ger 404 (ingen öppen omdirigering)")
    get("/karriar/" + slug.group(1), ua="Googlebot/2.1") if slug else None
    status, body, _ = get("/")
    check("count-pill" in body, "startsidan visar antal lediga tjänster")
    page.goto(f"{BASE}/admin/partners/statistik")
    content = page.content()
    check("Statistik till partners" in content and page.locator(".stats-table").count() >= 1, "statistiksidan visar tabellen")
    check(page.locator(".stats-table").nth(1).locator("td.num").first.inner_text().strip() == "1", "en visning av annonsen räknas (roboten räknas inte)")
    page.screenshot(path=str(OUT / "statistik.png"), full_page=True)
    st, csv, hdr = get("/admin/partners/statistik.csv")  # utan inloggning
    check(st in (302, 303), "statistiken kräver inloggning")

    # ───────── Engagera dig ─────────
    print("Engagera dig")
    page.goto(f"{BASE}/admin/uppdrag/ny")
    page.fill("[name=title]", "Sexmästare")
    page.fill("[name=committee]", "Sexmästeriet")
    page.fill("[name=description]", "Planera sittningar och fester.")
    page.fill("[name=commitment]", "Några timmar i veckan")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"/admin/uppdrag\?klart="))
    pub = browser.new_page(viewport={"width": 390, "height": 844})
    pub.goto(f"{BASE}/engagera-dig")
    check(pub.locator(".position-card").count() == 1, "uppdraget visas på Engagera dig")
    pub.click(".position-card a")
    pub.wait_for_timeout(500)
    pub.fill("#falt-namn", "Anna Andersson")
    pub.fill("#falt-epost", "anna@example.com")
    pub.screenshot(path=str(OUT / "engagera-mobil.png"), full_page=True)
    time.sleep(3)  # tidstoken i formuläret
    pub.locator("main form button[type=submit]").last.click()
    pub.wait_for_url(re.compile(r"/engagera-dig/tack"))
    check(True, "intresseanmälan skickas")
    page.goto(f"{BASE}/admin/meddelanden")
    check("Engagera dig" in page.content(), "anmälan syns under Meddelanden")

    # ───────── Schemaläggning och kopiering ─────────
    print("Schemaläggning och kopiering")
    page.goto(f"{BASE}/admin/event/ny")
    page.fill("[name=title]", "Framtida sittning")
    page.fill("[name=starts_at]", "2030-03-01T18:00")
    page.fill("[name=publish_at]", "2030-01-01T08:00")
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"klart=schemalagt"))
    check(page.locator(".pill-plan").count() >= 1, "listan visar ”Schemalagd”")
    status, body, _ = get("/kalender")
    check("Framtida sittning" not in body, "schemalagt event syns inte förrän tiden kommit")
    page.locator("tr:has-text('Framtida sittning') form[action$='/kopiera'] button").click()
    page.wait_for_url(re.compile(r"/admin/event/\d+\?klart=kopierat"))
    check("(kopia)" in page.locator("[name=title]").input_value(), "kopian öppnas för redigering")

    # ───────── Styrelseskifte ─────────
    print("Styrelseskifte")
    page.goto(f"{BASE}/admin/styrelseskifte")
    page.locator(".handover-check input").nth(0).check()
    page.locator(".handover-check input").nth(2).check()
    page.click("form.admin-form button[type=submit]")
    page.wait_for_url(re.compile(r"klart=sparat"))
    check("2 av 11 steg klara" in page.content(), "checklistan sparar framstegen")
    page.screenshot(path=str(OUT / "styrelseskifte.png"), full_page=True)

    # ───────── Kalenderprenumeration ─────────
    st, ics, hdr = get("/kalender.ics")
    check(st == 200 and ics.startswith("BEGIN:VCALENDAR") and "text/calendar" in hdr.get("content-type", ""), "kalenderflödet fungerar")
    check(all(len(line.encode()) <= 75 for line in ics.split("\r\n")), "raderna i kalenderflödet är högst 75 byte")

    noise = [e for e in errors if "favicon" not in e and "status of 422" not in e]  # 422 = avsiktligt valideringsfel
    check(not noise, f"inga JavaScript-fel i adminpanelen {noise[:3]}")
    browser.close()

done()
