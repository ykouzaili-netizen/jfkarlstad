"""Merch- och märkestävlingen (/tavling): sidan är dold från början och visas med ett klick i adminpanelen;
flikar, nedräkning, lägen (före/öppen/röstning/klar), ämnesraden, kopieringsknapparna, kalenderfilen,
bidragen (namnen först efter röstningen), Verktyg och material, Testa din design, bilden till Instagram
och bannern på startsidan.

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from common import *

TZ = ZoneInfo("Europe/Stockholm")


def local(dt: datetime) -> str:
    return dt.astimezone(TZ).strftime("%Y-%m-%dT%H:%M")


def set_dates(page, open_, deadline, vote_start, vote_end, vote_url=None):
    """Byt datumen under Texter och sidor → Merch- och märkestävlingen → Datum och tider."""
    page.goto(f"{BASE}/admin/texter?sida=tavling")
    page.locator("#avsnitt-datum > summary").click()
    for name, value in [("comp_open_at", open_), ("comp_deadline_at", deadline), ("comp_vote_start_at", vote_start), ("comp_vote_end_at", vote_end)]:
        page.fill(f"input[name={name}]", local(value))
    if vote_url is not None:
        page.locator("#avsnitt-delta > summary").click()
        page.fill("input[name=comp_vote_url]", vote_url)
    page.click("#texter-form .sticky-actions button[type=submit]")
    page.wait_for_url(re.compile(r"klart="))


_n = [0]


def fresh(pg, hash=""):
    """Ladda om sidan på riktigt (bara en ny #-adress laddar inte om sidan)."""
    _n[0] += 1
    pg.goto(f"{BASE}/tavling?v={_n[0]}{hash}")


def reset_dates(page):
    """Standarddatumen (1 nov, 30 nov 23:59, 3–10 dec) och ingen länk till röstningen."""
    page.goto(f"{BASE}/admin/texter?sida=tavling")
    page.locator("#avsnitt-datum > summary").click()
    for name, v in [("comp_open_at", "2026-11-01T00:00"), ("comp_deadline_at", "2026-11-30T23:59"), ("comp_vote_start_at", "2026-12-03T00:00"), ("comp_vote_end_at", "2026-12-10T23:59")]:
        page.fill(f"input[name={name}]", v)
    page.locator("#avsnitt-delta > summary").click()
    page.fill("input[name=comp_vote_url]", "")
    page.click("#texter-form .sticky-actions button[type=submit]")
    page.wait_for_url(re.compile(r"klart="))


def set_visible(page, on: bool):
    page.goto(f"{BASE}/admin/texter?sida=tavling")
    box = page.locator("input[name=__sida_synlig]")
    if box.is_checked() != on:
        box.locator("xpath=ancestor::label[1]").click() if box.locator("xpath=ancestor::label[1]").count() else box.click()
    page.click("#texter-form .sticky-actions button[type=submit]")
    page.wait_for_url(re.compile(r"klart="))


def visible_text(pg, sel):
    return [t.strip() for t in pg.locator(sel + ":visible").all_inner_texts() if t.strip()]


with sync_playwright() as p:
    b = p.chromium.launch()
    errors: list[str] = []
    pub = b.new_page(viewport={"width": 1280, "height": 1000})
    pub.on("pageerror", lambda e: errors.append(str(e)))
    pub.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    adm = b.new_page(viewport={"width": 1280, "height": 1000})
    login(adm)

    # ── Dold tills styrelsen visar den ──
    anon = b.new_context().new_page()
    check(anon.request.get(f"{BASE}/tavling").status == 404, "sidan är dold från början (404 för besökare)")
    check(anon.request.get(f"{BASE}/tavling/kalender.ics").status == 404, "kalenderfilen är också dold")
    anon.goto(f"{BASE}/")
    check(anon.locator("a[href='/tavling']").count() == 0 and anon.locator(".comp-banner").count() == 0, "ingen länk eller banner när sidan är dold")
    adm.goto(f"{BASE}/tavling")
    check(adm.locator(".hidden-page-note").count() == 1 and adm.locator(".jfk-tavling").count() == 1, "inloggade ser den dolda sidan med en markering")
    set_visible(adm, True)
    check(anon.request.get(f"{BASE}/tavling").status == 200, "sidan visas när rutan Visa sidan på webbplatsen bockas i")
    reset_dates(adm)

    # ── Standardläget (före 1 november) ──
    pub.bring_to_front()  # bakgrundsflikar får strypta timers i Chromium
    pub.goto(f"{BASE}/tavling")
    check(pub.locator("h1").inner_text().replace("\n", " ").strip() == "JFK:s Merch- & Märkestävling", "rubriken med & i guld")
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "before", "läget är ”före start” innan 1 november")
    check("Öppnar 1 november" in pub.locator(".t-chip").inner_text(), "etiketten säger Öppnar 1 november")
    check("30 november kl. 23:59" in pub.locator(".t-countdown-when").inner_text(), "nedräkningen gäller 30 november kl. 23:59")
    s1 = pub.locator("[data-unit=s]").inner_text()
    pub.wait_for_timeout(2100)
    check(pub.locator("[data-unit=s]").inner_text() != s1, "nedräkningen uppdateras varje sekund")

    # Flikarna
    check(pub.locator("[role=tablist] [role=tab]").count() == 3, "tre flikar")
    check(pub.locator("#om").is_visible() and not pub.locator("#regler").is_visible(), "bara första fliken visas")
    pub.click("[data-tab=regler]")
    check(pub.locator("#regler").is_visible() and pub.url.endswith("#regler"), "fliken Regler öppnas och adressen blir #regler")
    pub.locator("[data-tab=regler]").focus()
    pub.keyboard.press("ArrowRight")
    check(pub.locator("#delta").is_visible() and pub.evaluate("document.activeElement.dataset.tab") == "delta", "piltangenterna byter flik")
    check(pub.locator(".t-rule").count() == 6, "sex regler")
    pub.goto(f"{BASE}/tavling#regel-4")
    check(pub.locator("#regler").is_visible(), "en länk till #regel-4 öppnar fliken Regler")
    pub.goto(f"{BASE}/tavling")
    pub.click("a.t-btn-gold[href='#delta']")
    check(pub.locator("#delta").is_visible(), "knappen ”Så deltar du” öppnar fliken Delta och rösta")

    # Korten före start
    check(visible_text(pub, ".t-card--submit .t-status") == ["Öppnar 1 november"], "Delta-kortet: Öppnar 1 november")
    check(visible_text(pub, ".t-card--vote .t-status") == ["Öppnar 3 december"], "Rösta-kortet: Öppnar 3 december")
    check(not pub.locator("[data-subject-link]").is_visible(), "ingen mejlknapp före start")
    check("informationsansvarig@jfkarlstad.se" in pub.locator(".t-card--submit .t-email").inner_text(), "e-postadressen visas")

    # Ämnesraden
    pub.fill("#t-namn", "Anna Andersson")
    pub.locator(".t-subject .t-seg-opt", has_text="Merch").click()
    check(pub.locator("[data-subject-out]").inner_text() == "JFK Tävling – Merch – Anna Andersson", "ämnesraden fylls i med kategori och namn")

    # Kopiera
    ctx = b.new_context(viewport={"width": 1280, "height": 1000}, permissions=["clipboard-read", "clipboard-write"])
    cp = ctx.new_page()
    cp.goto(f"{BASE}/tavling#delta")
    cp.click("[data-copy=email]")
    check(cp.evaluate("navigator.clipboard.readText()") == "informationsansvarig@jfkarlstad.se", "Kopiera kopierar e-postadressen")
    check("Kopierat" in cp.locator("[data-copy=email]").inner_text(), "knappen bekräftar Kopierat!")
    ctx.close()

    # Kalenderfilen
    ics = pub.request.get(f"{BASE}/tavling/kalender.ics")
    body = ics.text()
    check(ics.status == 200 and "text/calendar" in ics.headers["content-type"], "kalenderfilen finns")
    check(body.count("BEGIN:VEVENT") == 3 and "DTEND;TZID=Europe/Stockholm:20261130T235900" in body, "tre händelser, sista inlämning 23:59")

    # Utan JavaScript visas allt
    nojs = b.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 1000}, reduced_motion="reduce").new_page()
    nojs.goto(f"{BASE}/tavling")
    check(all(nojs.locator(f"#{i}").is_visible() for i in ("om", "regler", "delta")), "utan JavaScript visas alla tre flikarna efter varandra")
    check("45" in nojs.locator("[data-unit=d]").inner_text() or nojs.locator("[data-unit=d]").inner_text().isdigit(), "nedräkningen visar dagar även utan JavaScript")
    nojs.close()

    # Verktyg och material
    fresh(pub, "#delta")
    check(pub.locator(".t-program").count() == 6, "sex program under Verktyg och material")
    check(pub.locator(".t-program a[href='https://inkscape.org']").get_attribute("target") == "_blank", "programlänkarna öppnas i ny flik")
    for f in ["jfk-logotyp.svg", "jfk-logotyp.png", "jfk-logotyp-ljus.svg", "mall-marke.svg", "mall-tryck.svg"]:
        a = pub.locator(f".t-dl a[href^='/assets/tavling/{f}']")
        check(a.count() == 1 and a.get_attribute("download") is not None and pub.request.get(f"{BASE}/assets/tavling/{f}").status == 200, f"{f} går att ladda ned")
    check(pub.locator(".t-swatch").count() == 3, "JFK:s tre färger visas")
    check(pub.locator("[data-try]").is_visible(), "Testa din design visas med JavaScript")
    pub.set_input_files("[data-try-input]", str(test_image(OUT / "tavling-test.jpg", (600, 600), (220, 60, 60))))
    check((pub.locator("[data-try-img]").first.get_attribute("href") or "").startswith("blob:"), "den valda bilden visas på märket utan att laddas upp")
    from PIL import Image
    pub.locator("[data-share]").scroll_into_view_if_needed()
    pub.wait_for_timeout(1500)
    check((pub.locator("[data-share-preview]").get_attribute("src") or "").startswith("blob:"), "Instagram-bilden förhandsvisas i kortet")
    with pub.expect_download() as dl:
        pub.click("[data-share-button]")
    path = dl.value.path()
    check(Image.open(path).size == (1080, 1920), "bilden till Instagram är 1080 × 1920 (story)")
    Image.open(path).save(OUT / "tavling-story.png")
    pub.locator("[data-share] .t-seg-opt", has_text="Inlägg").click()
    check(pub.locator("[data-share] input[type=file]").count() == 0, "besökaren kan inte välja en egen bild")
    pub.wait_for_timeout(800)
    with pub.expect_download() as dl:
        pub.click("[data-share-button]")
    path = dl.value.path()
    check(Image.open(path).size == (1080, 1350) and dl.value.suggested_filename == "jfk-tavling-inlagg.png", "inlägget är 1080 × 1350")
    Image.open(path).save(OUT / "tavling-inlagg.png")

    # Logotypen på kategorikorten (i stället för §)
    check(pub.locator(".t-art-patch image[href*='jfk-logotyp-ljus-liten']").count() == 1 and pub.locator(".t-art-shirt image[href*='jfk-logotyp-liten']").count() == 1, "JFK:s logotyp på märket och tröjan")
    check(pub.request.get(f"{BASE}/assets/tavling/jfk-logotyp-liten.webp").status == 200, "den lilla logotypen finns")

    # Egna bilder: toppen, kategorikortet, Bilder och Instagram-bakgrunden (Texter och sidor)
    adm.goto(f"{BASE}/admin/texter?sida=tavling&falt=comp_hero_image")
    for i, k in enumerate(["comp_hero_image", "comp_cat_badge_image", "comp_photo_1", "comp_photo_2", "comp_share_image"]):
        loc = adm.locator(f"input[type=file][name={k}]")
        loc.scroll_into_view_if_needed() if loc.is_visible() else None
        loc.set_input_files(str(test_image(OUT / f"tavling-bild-{i}.jpg", (1600, 1000), (40 + i * 40, 90, 140))))
    adm.wait_for_timeout(1500)
    adm.click("#texter-form .sticky-actions button[type=submit]")
    adm.wait_for_url(re.compile(r"klart=texter"), timeout=60000)
    fresh(pub)
    check(pub.locator(".t-hero.has-photo .t-hero-photo img").count() == 1, "bild i toppen")
    check(pub.locator(".t-cat--badge .t-cat-art.has-photo img").count() == 1 and pub.locator(".t-cat--merch .t-art-shirt").count() == 1, "egen bild på märkeskortet, teckningen kvar på merchkortet")
    check(pub.locator(".t-photos li").count() == 2, "avsnittet Bilder med två bilder")
    check((pub.locator("[data-share]").get_attribute("data-bg") or "").startswith("/media/"), "Instagram-bilden får styrelsens bakgrund")
    pub.screenshot(path=str(OUT / "tavling-bilder.png"), full_page=True)

    # Bild under "Varför en tävling?"
    fresh(pub)
    check(pub.locator(".t-intro-photo").count() == 0, "utan vald bild visas ingen tom bildyta under Varför en tävling?")
    adm.goto(f"{BASE}/admin/texter?sida=tavling&falt=comp_about_image")
    adm.locator("input[type=file][name=comp_about_image]").set_input_files(str(test_image(OUT / "tavling-varfor.jpg", (1600, 1100), (60, 110, 150))))
    adm.wait_for_timeout(1500)
    if adm.locator("#falt-comp_about_image_alt").is_visible():
        adm.fill("#falt-comp_about_image_alt", "Medlemmar i overall med JFK:s märken")
    adm.click("#texter-form .sticky-actions button[type=submit]")
    adm.wait_for_url(re.compile(r"klart="))
    fresh(pub)
    photo = pub.locator(".t-intro-photo img")
    check(photo.count() == 1, "bilden visas under Varför en tävling?")
    for vp, name in [({"width": 1280, "height": 1000}, "dator"), ({"width": 390, "height": 844}, "mobil")]:
        pub.set_viewport_size(vp)
        pub.wait_for_timeout(400)
        pub.locator(".t-intro").screenshot(path=str(OUT / f"tavling-varfor-{name}.png"))
    pub.set_viewport_size({"width": 1280, "height": 1000})

    # Bannern på startsidan
    pub.goto(f"{BASE}/")
    check(pub.locator(".comp-banner a[href='/tavling']").count() == 1 and "öppnar 1 november" in pub.locator(".comp-banner").inner_text(), "bannern på startsidan när sidan visas")

    # Bidrag (Innehåll → Tävlingen)
    for code, cat, who in [("A", "marke", "Anna Andersson"), ("B", "merch", "Bertil Berg")]:
        adm.goto(f"{BASE}/admin/tavling/ny")
        adm.fill("input[name=code]", code.lower())
        adm.check(f"input[name=category][value={cat}]")
        adm.set_input_files("input[name=image_key]", str(test_image(OUT / f"bidrag-{code}.jpg", (900, 900), (40, 90, 160))))
        adm.fill("input[name=designer]", who)
        adm.fill("input[name=votes]", "12" if code == "A" else "5")
        if code == "A":
            adm.check("input[name=winner]")
        adm.click("form button[type=submit] >> nth=-1")
        adm.wait_for_load_state()
    adm.goto(f"{BASE}/admin/tavling")
    check(adm.locator("a.row-title", has_text="Design A").count() == 1, "bidraget sparas med koden i versaler (Design A)")
    check(adm.locator(".comp-status").count() == 1, "rutan överst visar läget och om sidan visas")
    fresh(pub, "#delta")
    check(pub.locator(".t-entries").count() == 0, "bidragen visas inte före röstningen")

    # ── Lägena: datumen ändras i adminpanelen ──
    now = datetime.now(TZ)

    # Öppen: inlämningen pågår
    set_dates(adm, now - timedelta(days=2), now + timedelta(days=3), now + timedelta(days=5), now + timedelta(days=9))
    fresh(pub, "#delta")
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "open", "läget blir ”öppen” när datumen ändras")
    check(visible_text(pub, ".t-card--submit .t-status") == ["Öppen"], "Delta-kortet: Öppen")
    link = pub.locator("[data-subject-link]")
    check(link.is_visible() and link.get_attribute("href").startswith("mailto:informationsansvarig@jfkarlstad.se?subject=JFK%20T%C3%A4vling"), "mejlknappen öppnar ett mejl med ämnesraden")
    check(pub.locator(".t-step--1").get_attribute("data-state") == "now", "tidslinjen: steg 1 pågår")
    # Intyget: mejlknappen fungerar först när rutan är ikryssad, och intyget står i mejlet
    check(link.get_attribute("aria-disabled") == "true", "mejlknappen är spärrad tills intyget är ikryssat")
    link.click(force=True)  # aria-disabled: Playwright väntar annars på att knappen blir aktiv
    for _ in range(20):  # meddelandet skrivs i klickhändelsen – vänta in det i stället för att läsa direkt
        if pub.locator("[data-affirm-note]").inner_text().strip():
            break
        pub.wait_for_timeout(100)
    check("kryssa" in pub.locator("[data-affirm-note]").inner_text().lower() or pub.locator("[data-affirm-note]").inner_text().strip() != "", "klick utan intyg ger ett förklarande meddelande")
    check(pub.url.startswith(BASE), "klick utan intyg öppnar inget mejl")
    pub.locator("label.t-affirm").click()
    check(link.get_attribute("aria-disabled") != "true" and "&body=" in (link.get_attribute("href") or ""), "med intyget ikryssat fungerar knappen och intyget följer med i mejlet")
    pub.locator("label.t-affirm").screenshot(path=str(OUT / "tavling-intyg.png"))
    pub.screenshot(path=str(OUT / "tavling-oppen.png"), full_page=True)

    # Röstning pågår, utan länk
    set_dates(adm, now - timedelta(days=9), now - timedelta(days=5), now - timedelta(days=1), now + timedelta(days=2), vote_url="")
    fresh(pub, "#delta")
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "voting", "läget blir ”röstning”")
    check(visible_text(pub, ".t-card--submit .t-status") == ["Stängd"] and visible_text(pub, ".t-card--vote .t-status") == ["Röstning pågår"], "Delta stängd, Rösta pågår")
    check(pub.locator(".t-card--vote .t-note:visible").count() == 1 and "läggs upp" in pub.locator(".t-card--vote .t-note:visible").inner_text(), "utan länk visas en förklaring i stället för knappen")
    check([t.lower() for t in visible_text(pub, ".t-countdown-label > span")] == ["röstningen stänger om"], "nedräkningen räknar mot att röstningen stänger")

    # Röstning med länk
    set_dates(adm, now - timedelta(days=9), now - timedelta(days=5), now - timedelta(days=1), now + timedelta(days=2), vote_url="https://forms.gle/exempel")
    fresh(pub, "#delta")
    vote = pub.locator(".t-card--vote a.t-btn-gold")
    check(vote.is_visible() and vote.get_attribute("href") == "https://forms.gle/exempel" and vote.get_attribute("target") == "_blank", "knappen Till röstningen leder till enkäten i ny flik")
    check(pub.locator(".t-entry").count() == 2 and "Anna" not in pub.content(), "under röstningen visas bidragen utan namn – inte ens i koden")
    pub.click(".t-filter button[data-filter=merch]")
    check(pub.locator(".t-entry:visible").count() == 1, "filtret visar bara Merch")
    pub.screenshot(path=str(OUT / "tavling-rostning.png"), full_page=True)
    share = pub.locator("[data-share]")
    check(len((share.get_attribute("data-collage") or "").split("|")) == 2 and share.get_attribute("data-vote-title") == "Rösta nu!", "under röstningen: bidragen som bakgrund och Rösta nu! på Instagram-bilden")
    share.scroll_into_view_if_needed()
    pub.wait_for_timeout(1200)
    with pub.expect_download() as dl:
        pub.click("[data-share-button]")
    from PIL import Image
    Image.open(dl.value.path()).save(OUT / "tavling-story-rosta.png")
    check(Image.open(OUT / "tavling-story-rosta.png").size == (1080, 1920), "röstningsbilden laddas ned")

    # Klart
    set_dates(adm, now - timedelta(days=20), now - timedelta(days=15), now - timedelta(days=10), now - timedelta(days=1))
    fresh(pub)
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "done", "läget blir ”klart”")
    check(not pub.locator(".t-clock").is_visible(), "ingen nedräkning när allt är klart")
    check("av Anna Andersson" in pub.locator(".t-entries").inner_text() and pub.locator(".t-entry.is-winner").count() == 1, "efter röstningen visas namnen och vinnaren")
    res = pub.locator(".t-results")
    check(res.count() == 1 and "12 röster" in res.inner_text() and "5 röster" in res.inner_text(), "efter röstningen visas röstresultatet som diagram")
    check(pub.locator(".t-results [class*=t-bar-w-100]").count() == 2, "staplarna är relativa inom kategorin (bästa = 100 %)")
    fresh(pub, "#delta")
    res.scroll_into_view_if_needed()
    pub.wait_for_timeout(900)
    res.screenshot(path=str(OUT / "tavling-resultat.png"))
    pub.goto(f"{BASE}/")
    check(pub.locator(".comp-banner").count() == 0, "ingen banner när röstningen är klar")

    # Läget byts av sig självt i webbläsaren när tiden passerar (deadline om 65 s → stänger efter 23:59-regeln)
    set_dates(adm, now - timedelta(days=2), now + timedelta(seconds=70), now + timedelta(days=5), now + timedelta(days=9))
    fresh(pub, "#delta")
    st = pub.locator(".jfk-tavling").get_attribute("data-state")
    for _ in range(140):
        if pub.locator(".jfk-tavling").get_attribute("data-state") == "between":
            break
        pub.wait_for_timeout(1000)
    check(st == "open" and visible_text(pub, ".t-card--submit .t-status") == ["Stängd"], "kortet byter från Öppen till Stängd utan att sidan laddas om")

    reset_dates(adm)

    # Menyn, sitemap och sök
    pub.goto(f"{BASE}/aktuellt")
    check(pub.locator("a[href='/tavling']").count() >= 1, "tävlingen finns i menyn under Aktuellt")
    check("/tavling</loc>" in pub.request.get(f"{BASE}/sitemap.xml").text(), "tävlingen finns i sitemap.xml")
    pub.goto(f"{BASE}/sok?q=märkestävling")
    check(pub.locator("a[href='/tavling']").count() >= 1, "sökningen hittar tävlingen")
    check(pub.request.get(f"{BASE}/tavlingen", max_redirects=0).status == 301, "/tavlingen skickar vidare till /tavling")

    # Komplettering: rutan under regel 2 och mallen i adminpanelen (standarddatumen: röstningen öppnar 3 dec)
    fresh(pub, "#regler")
    fu = pub.locator("#regel-2 .t-followup")
    check(fu.count() == 1 and "2 december kl. 23:59" in fu.inner_text() and "30 november kl. 23:59" in fu.inner_text(), "regel 2: Saknas något? med sista dag för komplettering")
    fu.scroll_into_view_if_needed()
    pub.locator("#regel-2").screenshot(path=str(OUT / "tavling-komplettering.png"))
    adm.goto(f"{BASE}/admin/tavling")
    adm.locator(".comp-followup > summary").click()
    mall = adm.locator(".comp-followup textarea").input_value()
    check("senast 2 december kl. 23:59" in mall and "Ämne:" in mall, "adminpanelen har ett färdigt mejl med samma datum")
    adm.locator(".comp-followup").screenshot(path=str(OUT / "tavling-komplettering-admin.png"))

    set_visible(adm, False)
    check(anon.request.get(f"{BASE}/tavling").status == 404, "sidan kan döljas igen")
    check(not errors, "inga JavaScript-fel" + (f": {errors}" if errors else ""))
    b.close()

done()
