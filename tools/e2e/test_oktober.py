"""Nyheterna 17 oktober: nomineringsformuläret, länkkontrollen, dra och släpp i listorna, beskärning och svartvita
porträtt, det rullande partnerbandet, utseenden för Vanliga frågor och samarbetsformerna, nätverkens evenemang
och klick per partnerlänk.

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
"""
from common import *
import time

with sync_playwright() as p:
    b = p.chromium.launch()
    errors: list[str] = []
    adm = b.new_page(viewport={"width": 1280, "height": 1000})
    adm.on("pageerror", lambda e: errors.append(str(e)))
    login(adm)
    pub = b.new_context().new_page()
    pub.set_viewport_size({"width": 390, "height": 844})
    pub.on("pageerror", lambda e: errors.append(str(e)))

    # ── Nominera till en utmärkelse ──
    print("Nominering")
    pub.goto(f"{BASE}/om-oss")
    cta = pub.locator(".nominate-cta a[href='/nominera']")
    check(cta.count() >= 1, "Om oss har en knapp till nomineringen under utmärkelserna")
    pub.goto(f"{BASE}/nominera")
    awards = pub.locator("select[name=utmarkelse] option").all_inner_texts()
    check(len(awards) >= 2, f"utmärkelserna kommer från medaljlistan ({len(awards)} val)")
    pub.screenshot(path=str(OUT / "nominera-mobil.png"), full_page=True)
    pub.locator("main form button[type=submit]").last.click()
    pub.wait_for_load_state()
    check(pub.locator("[aria-invalid=true]").count() >= 3, "tomt formulär ger fel på de obligatoriska fälten")
    pub.select_option("select[name=utmarkelse]", index=1)
    pub.fill("[name=kandidat]", "Cecilia Carlsson")
    pub.fill("[name=meddelande]", "Har drivit mentorprogrammet i tre år och lyft hela föreningen.")
    pub.fill("[name=namn]", "Anna Andersson")
    pub.fill("[name=epost]", "anna@example.com")
    time.sleep(3)  # tidstoken
    pub.locator("main form button[type=submit]").last.click()
    pub.wait_for_url(re.compile(r"/nominera/tack"))
    check(pub.locator("h1").count() == 1, "tack-sidan visas")
    adm.goto(f"{BASE}/admin/meddelanden")
    row = adm.locator("a", has_text="Nominering: Cecilia Carlsson")
    check(row.count() == 1, "nomineringen hamnar under Meddelanden")
    row.first.click()
    check("mentorprogrammet" in adm.content(), "motiveringen syns i meddelandet")
    # Stäng nomineringen
    adm.goto(f"{BASE}/admin/texter?sida=nominera&falt=nominate_open")
    adm.locator("label:has(input[name=nominate_open][value=stangd])").click()
    adm.click("#texter-form .sticky-actions button[type=submit]")
    adm.wait_for_url(re.compile(r"klart="))
    pub.goto(f"{BASE}/nominera")
    check(pub.locator("select[name=utmarkelse]").count() == 0 and pub.locator(".nominate-closed").count() == 1, "stängd nominering visar en förklaring i stället för formuläret")
    pub.goto(f"{BASE}/om-oss")
    check(pub.locator(".nominate-cta").count() == 0, "knappen på Om oss försvinner när nomineringen är stängd")

    # ── Dra och släpp i medaljlistan (tangentbord) ──
    print("Ordning")
    adm.goto(f"{BASE}/admin/medaljer")
    ids = [r.get_attribute("data-sort-id") for r in adm.locator("tbody tr[data-sort-id]").all()]
    check(len(ids) >= 2, "medaljlistan har rader att sortera")
    first = adm.locator("tbody tr[data-sort-id]").first
    group = first.get_attribute("data-sort-group")
    peers = [r.get_attribute("data-sort-id") for r in adm.locator(f"tbody tr[data-sort-group='{group}']").all()]
    first.locator("[data-sort-handle]").focus()
    adm.keyboard.press("ArrowDown")
    adm.wait_for_timeout(1200)
    adm.reload()
    after = [r.get_attribute("data-sort-id") for r in adm.locator(f"tbody tr[data-sort-group='{group}']").all()]
    check(len(peers) < 2 or after[:2] == [peers[1], peers[0]], "pil ned på handtaget flyttar raden och sparas direkt")
    r = adm.request.post(f"{BASE}/admin/medaljer/ordning", form={"_csrf": "fel", "ids": ",".join(ids)}, max_redirects=0)
    check(r.status in (403, 400), f"ordningen kräver giltig CSRF ({r.status})")

    # ── Beskärning och svartvitt ──
    print("Porträtt")
    adm.goto(f"{BASE}/admin/styrelsen/ny")
    adm.set_input_files("input[name=photo_key]", str(test_image(OUT / "portratt-bred.jpg", (1600, 1000), (180, 90, 60))))
    dlg = adm.locator("dialog.crop-dialog")
    dlg.wait_for(state="visible")
    adm.wait_for_timeout(400)
    adm.screenshot(path=str(OUT / "beskarning.png"))
    check("Beskär porträttet" in dlg.inner_text(), "beskärningsrutan öppnas för porträtt")
    adm.keyboard.press("ArrowRight")
    dlg.locator("button[value=ok]").click()
    dlg.wait_for(state="detached")
    size = [0, 1]
    for _ in range(20):
        size = adm.evaluate("""() => new Promise(res => { const f = document.querySelector('input[name=photo_key]').files[0];
            const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = URL.createObjectURL(f); })""")
        if abs(size[0] / size[1] - 0.75) < 0.01:
            break
        adm.wait_for_timeout(300)
    check(abs(size[0] / size[1] - 0.75) < 0.01, f"bilden beskärs till 3:4 ({size[0]}×{size[1]})")

    adm.goto(f"{BASE}/admin/utmarkelser/ny")
    if adm.locator("input[name=kind][value=hedersmedlem]").count():
        adm.check("input[name=kind][value=hedersmedlem]")
    adm.set_input_files("input[name=photo_key]", str(test_image(OUT / "portratt-farg.jpg", (900, 1200), (200, 40, 40))))
    dlg = adm.locator("dialog.crop-dialog")
    dlg.wait_for(state="visible")
    check("svartvitt" in dlg.inner_text(), "hedersmedlemmar: rutan säger att fotot sparas svartvitt")
    dlg.locator("button[value=ok]").click()
    dlg.wait_for(state="detached")
    sat = adm.evaluate("""() => new Promise(res => { const f = document.querySelector('input[name=photo_key]').files[0];
        const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = 40; c.height = 40;
        const x = c.getContext('2d'); x.drawImage(i, 0, 0, 40, 40); const d = x.getImageData(0, 0, 40, 40).data; let m = 0;
        for (let k = 0; k < d.length; k += 4) m = Math.max(m, Math.max(d[k], d[k+1], d[k+2]) - Math.min(d[k], d[k+1], d[k+2]));
        res(m); }; i.src = URL.createObjectURL(f); })""")
    check(sat <= 6, f"hedersmedlemmens foto blir svartvitt (färgskillnad {sat})")

    # ── Partnerbandet på startsidan ──
    print("Startsidan")
    pub.set_viewport_size({"width": 1280, "height": 900})
    pub.goto(f"{BASE}/")
    band = pub.locator(".partner-band")
    n_partners = pub.locator(".partner-band .marquee-track li:not([aria-hidden])").count()
    check(band.count() == 1 and n_partners >= 4, f"fler än tre partners → rullande logoband ({n_partners})")
    check(pub.locator(".partner-band [aria-hidden=true] a[tabindex='-1']").count() >= 1, "kopiorna i bandet är dolda för skärmläsare och tangentbord")
    check(pub.locator("[data-motion-toggle]").count() >= 1, "bandet har en paus-knapp")
    band.scroll_into_view_if_needed()
    pub.wait_for_timeout(600)
    pub.locator(".partners-section, section:has(.partner-band)").first.screenshot(path=str(OUT / "partnerband.png"))
    adm.goto(f"{BASE}/admin/texter?sida=startsida&falt=home_partners_band")
    adm.locator("label:has(input[name=home_partners_band][value=rad])").click()
    adm.click("#texter-form .sticky-actions button[type=submit]")
    adm.wait_for_url(re.compile(r"klart="))
    pub.goto(f"{BASE}/")
    check(pub.locator(".partner-band").count() == 0, "bandet kan stängas av (alltid som rad)")

    # ── Vanliga frågor och samarbetsformerna ──
    print("Utseenden")
    for style, cls in [("kort", ".faq-cards"), ("register", ".faq-register")]:
        adm.goto(f"{BASE}/admin/texter?sida=faq&falt=faq_style")
        adm.locator(f"label:has(input[name=faq_style][value={style}])").click()
        adm.click("#texter-form .sticky-actions button[type=submit]")
        adm.wait_for_url(re.compile(r"klart="))
        pub.goto(f"{BASE}/faq")
        check(pub.locator(cls).count() >= 1, f"Vanliga frågor kan visas som {style}")
        ov = pub.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(ov <= 0, f"{style}: ingen sidled scroll")
        pub.screenshot(path=str(OUT / f"faq-{style}.png"), full_page=True)
    for style in ["nivaer", "mork"]:
        adm.goto(f"{BASE}/admin/texter?sida=for-foretag&falt=packages_style")
        adm.locator(f"label:has(input[name=packages_style][value={style}])").click()
        adm.click("#texter-form .sticky-actions button[type=submit]")
        adm.wait_for_url(re.compile(r"klart="))
        pub.goto(f"{BASE}/for-foretag")
        check(pub.locator(f".packages--{style}").count() == 1, f"samarbetsformerna kan visas som {style}")
        pub.locator(f".packages--{style}").screenshot(path=str(OUT / f"paket-{style}.png"))

    # ── Nätverkens evenemang ──
    print("Nätverk")
    adm.goto(f"{BASE}/admin/event/ny")
    adm.fill("input[name=title]", "Paneldebatt med JURO")
    adm.fill("input[name=starts_at]", "2030-03-14T18:00")
    adm.select_option("select[name=network_id]", label="JURO")
    adm.click("form button[type=submit] >> nth=-1")
    adm.wait_for_url(re.compile(r"/admin/event(\?|$)"))
    pub.goto(f"{BASE}/om-oss/juro")
    sec = pub.locator("section[aria-labelledby=natverk-evenemang]")
    check(sec.count() == 1 and "Paneldebatt med JURO" in sec.inner_text(), "nätverkets sida visar kommande evenemang")
    sec.locator("a", has_text="Paneldebatt").first.click()
    pub.wait_for_load_state()
    check("Tillsammans med" in pub.content() and pub.locator("a[href='/om-oss/juro']").count() >= 1, "evenemanget visar vilket nätverk det arrangeras med")

    # ── Klick per partnerlänk ──
    print("Statistik")
    adm.goto(f"{BASE}/admin/partners")
    adm.locator("a.row-title").first.click()
    adm.wait_for_load_state()
    pid = adm.url.rstrip("/").split("/")[-1]
    adm.locator("[data-repeater-row] input[name=link_label]").last.fill("Karriärpodden")
    adm.locator("[data-repeater-row] input[name=link_url]").last.fill("https://example.com/podd")
    adm.click("form.admin-form button[type=submit] >> nth=-1")
    adm.wait_for_url(re.compile(r"/admin/partners(\?|$)"))
    pub.goto(f"{BASE}/partners")
    pages = sorted({a.get_attribute("href") for a in pub.locator("main a[href^='/partners/']").all()})
    href = None
    for path in pages:
        pub.goto(BASE + path)
        hit = pub.locator(".partner-links a[href*='/ut/lank/']", has_text="Karriärpodden")
        if hit.count():
            href = hit.first.get_attribute("href")
            break
    if href:
        check(pub.locator(".partner-links a", has_text="Karriärpodden").locator(".partner-link-kind").count() == 1, "länken får en ikon efter sin sort (podd)")
        for _ in range(2):
            r = pub.request.get(BASE + href, max_redirects=0, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"})
        check(r.status == 302 and r.headers.get("location") == "https://example.com/podd", "utlänken skickar vidare")
        adm.goto(f"{BASE}/admin/partners/statistik")
        table = adm.locator("table", has_text="Karriärpodden")
        check(table.count() >= 1 and "2" in table.first.locator("tr", has_text="Karriärpodden").inner_text(), "Klick per länk räknar varje länk för sig")
        table.first.screenshot(path=str(OUT / "klick-per-lank.png"))
    else:
        check(False, "länken Karriärpodden hittades på första partnerns sida")

    # ── Länkkontroll ──
    print("Länkkontroll")
    adm.goto(f"{BASE}/admin/lankar")
    rows = adm.locator("tr[data-link-row]")
    total = rows.count()
    check(total >= 5, f"länkkontrollen hittar webbplatsens länkar ({total})")
    check(adm.locator("tr[data-link-row='https://example.com/podd'] .lc-places a", has_text="Karriärpodden").count() == 1, "varje länk visar var den används, med länk dit")
    check(adm.locator("tr[data-link-row*='localhost']").count() == 0, "länkar inom webbplatsen tas inte med")
    adm.click("[data-link-check] button[type=submit]")
    for _ in range(180):
        if adm.locator(".lc-pill.is-checking").count() == 0 and adm.locator("[data-link-check] button[disabled]").count() == 0:
            break
        adm.wait_for_timeout(1000)
    check(adm.locator(".lc-pill.lc-ny").count() == 0, "alla länkar fick ett resultat")
    adm.screenshot(path=str(OUT / "lankkontroll.png"), full_page=True)
    adm.reload()
    check(adm.locator(".lc-pill.lc-ny").count() == 0, "resultatet sparas till nästa gång")
    form = adm.locator("[data-link-check]")
    csrf = form.get_attribute("data-csrf")
    r = adm.request.post(f"{BASE}/admin/lankar/kontroll", form={"_csrf": csrf, "urls": "https://evil.example/hemlig\nhttp://169.254.169.254/"})
    check(r.status == 200 and r.json()["results"] == {}, "bara adresser som finns på webbplatsen kontrolleras")
    r = adm.request.post(f"{BASE}/admin/lankar/kontroll", form={"_csrf": "fel", "urls": "https://example.com/podd"})
    check(r.status == 403, "kontrollen kräver giltig CSRF")
    adm.goto(f"{BASE}/admin")
    broken = adm.locator("a[href='/admin/lankar']", has_text="länk")
    print("  (översikten:", broken.count(), "påminnelser om trasiga länkar)")

    check(not errors, "inga JavaScript-fel" + (f": {errors}" if errors else ""))
    b.close()

done()
