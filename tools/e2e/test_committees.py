"""Utskottens egna sidor (/om-oss/utskott/:slug) med anslagsbild och medlemmar, Anslagstavlan på Om oss,
evenemang som ett utskott arrangerar, och verksamhetsåren: Tidigare år för utskotten och Tidigare styrelser,
nästa års styrelse som läggs in i förväg och byte av år under Styrelseskifte.

Kör mot nollställd databas:  npm run preview:node -- --reset
E2E_IMAGES kan peka på en mapp med cover-<namn>.jpg (t.ex. cover-evenemang.jpg) för snyggare skärmbilder.
"""
from common import *

IMG = Path(os.environ.get("E2E_IMAGES", ""))
COVERS = {
    "evenemangsutskottet": ("evenemang", (200, 120, 50)),
    "arbetsmarknadsutskottet": ("arbetsmarknad", (60, 80, 120)),
    "kommunikationsutskottet": ("kommunikation", (190, 60, 50)),
    "utbildningsutskottet": ("utbildning", (140, 110, 70)),
    "ekonomiutskottet": ("ekonomi", (50, 100, 90)),
    "idrottsutskottet": ("idrott", (40, 80, 160)),
}


def cover(slug: str) -> str:
    name, color = COVERS[slug]
    if IMG and (IMG / f"cover-{name}.jpg").exists():
        return str(IMG / f"cover-{name}.jpg")
    return str(test_image(OUT / f"utskott-{name}.jpg", (1600, 1000), color))


def portrait(n: int) -> str:
    """Ett tecknat porträtt (huvud och axlar mot en tonad bakgrund) – inga riktiga personer."""
    from PIL import Image, ImageDraw, ImageFilter

    tones = [((222, 205, 170), (60, 52, 46)), ((190, 200, 214), (40, 48, 62)), ((230, 196, 120), (58, 44, 30)), ((200, 214, 200), (36, 56, 48))]
    bg, fg = tones[n % len(tones)]
    W, H = 900, 1200
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    d.ellipse([W * 0.32, H * 0.2, W * 0.68, H * 0.5], fill=fg)
    d.rounded_rectangle([W * 0.12, H * 0.56, W * 0.88, H * 1.2], radius=260, fill=fg)
    im = im.filter(ImageFilter.GaussianBlur(3))
    path = OUT / f"portratt-{n}.jpg"
    im.save(path, "JPEG", quality=88)
    return str(path)


def submit_main(page):
    page.click("form.admin-form button.btn-lg")
    page.wait_for_load_state()


def settle(pg):
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(600)


def add_member(page, committee_id: int, name: str, role: str, program="", quote="", photo: str | None = None, year: str | None = None):
    url = f"{BASE}/admin/utskottsmedlemmar/ny?utskott={committee_id}" + (f"&ar={year}" if year else "")
    page.goto(url)
    page.fill("#falt-name", name)
    page.fill("#falt-role", role)
    if program:
        page.fill("#falt-program", program)
    if quote:
        page.fill("#falt-quote", quote)
    if photo:
        page.set_input_files("input[name=photo_key]", photo)
        dlg = page.locator("dialog.crop-dialog")
        dlg.wait_for(state="visible")
        dlg.locator("button[value=ok]").click()
        dlg.wait_for(state="detached")
        page.wait_for_timeout(300)
    submit_main(page)


with sync_playwright() as p:
    b = p.chromium.launch()
    adm = b.new_page(viewport={"width": 1280, "height": 1000}, reduced_motion="reduce")
    login(adm)
    pub = b.new_page(viewport={"width": 1280, "height": 1000}, reduced_motion="reduce")
    pub.goto(f"{BASE}/om-oss")  # skapar standardutskotten första gången

    # ── Adminpanelen: utskotten får anslagsbild ──
    print("Anslagsbild")
    adm.goto(f"{BASE}/admin/utskott")
    check(adm.locator("th:has-text('Medlemmar i år')").count() == 1, "listan visar antalet medlemmar i år")
    check(adm.locator(".tabs a[href='/admin/utskottsmedlemmar']").count() == 1, "fliken Utskottsmedlemmar")
    ids = {}
    for row in adm.locator("tbody tr").all():
        link = row.locator("a.row-title")
        ids[link.inner_text().strip().lower()] = int(link.get_attribute("href").rsplit("/", 1)[1])
    eid = ids["evenemangsutskottet"]
    for slug in COVERS:
        adm.goto(f"{BASE}/admin/utskott/{ids[slug]}")
        adm.set_input_files("input[type=file][name=cover_key]", cover(slug))
        adm.fill("#falt-cover_alt", f"{slug.capitalize()} (exempelbild)")
        if slug == "evenemangsutskottet":
            adm.check("input[name=cover_focus][value=upptill]")
            adm.fill("#falt-email", "evenemang@example.com")
            adm.screenshot(path=str(OUT / "utskott-admin-formular.png"), full_page=True)
        submit_main(adm)
        check(adm.locator(".field-error").count() == 0, f"{slug}: sparas utan fel")
    adm.goto(f"{BASE}/admin/utskott")
    check(adm.locator("tbody tr img.thumb").count() == 6, "anslagsbilden syns som miniatyr i listan")

    # ── Medlemmar ──
    print("Medlemmar")
    adm.goto(f"{BASE}/admin/utskott/{eid}")
    check(adm.locator("#medlemmar").count() == 1, "rutan Medlemmar under utskottets formulär")
    check("Inga medlemmar för 2026/27" in adm.locator("#medlemmar").text_content(), "tomt läge när inga medlemmar finns")
    adm.click("#medlemmar a.btn-primary:has-text('Lägg till medlem')")
    adm.wait_for_load_state()
    check(adm.locator("#falt-committee_id").input_value() == str(eid), "Lägg till medlem förväljer utskottet")
    check(adm.locator("#falt-year").input_value() == "2026/27", "och året som visas")
    check(adm.locator("a.btn-outline:has-text('Avbryt')").get_attribute("href") == f"/admin/utskott/{eid}#medlemmar", "Avbryt leder tillbaka till utskottet")
    adm.fill("#falt-name", "Elsa Lindqvist")
    adm.fill("#falt-role", "Ordförande")
    adm.fill("#falt-program", "Juristprogrammet, termin 5")
    adm.fill("#falt-quote", "Jag gick med för att fler ska känna sig hemma på programmet.")
    adm.set_input_files("input[name=photo_key]", portrait(0))
    dlg = adm.locator("dialog.crop-dialog")
    dlg.wait_for(state="visible")
    dlg.locator("button[value=ok]").click()
    dlg.wait_for(state="detached")
    adm.wait_for_timeout(300)
    adm.screenshot(path=str(OUT / "utskott-admin-medlem.png"), full_page=True)
    submit_main(adm)
    check(f"/admin/utskott/{eid}" in adm.url and "klart=skapat" in adm.url, "efter sparning tillbaka till utskottet")
    check(adm.locator("#medlemmar .cmm-row").count() == 1, "medlemmen syns i rutan")

    people = [
        ("Ahmed Nour", "Vice ordförande", "Juristprogrammet, termin 3", 1),
        ("Julia Karlsson", "Sittningsansvarig", "Juristprogrammet, termin 3", 2),
        ("Simon Mattsson", "Ledamot", "Juristprogrammet, termin 1", None),
        ("Vera Holm", "Ledamot", "Juristprogrammet, termin 7", 3),
        ("Nils Åberg", "Ledamot", "Juristprogrammet, termin 1", None),
        ("Linnea Ström", "Ledamot", "Masterprogrammet i skatterätt", 1),
    ]
    for name, role, prog, ph in people:
        add_member(adm, eid, name, role, prog, photo=portrait(ph) if ph is not None else None)
    add_member(adm, eid, "Maja Ek", "Ordförande", "Juristprogrammet, termin 4", year="2027/28")
    add_member(adm, eid, "Leo Forsberg", "Ledamot", "Juristprogrammet, termin 2", year="2027/28")
    for name, role in [("Hugo Sandberg", "Ordförande"), ("Ines Rydén", "Kassör"), ("Omar Haddad", "Ledamot")]:
        add_member(adm, eid, name, role, year="2025/26")
    rows_now = adm.locator("#medlemmar > ol .cmm-row")
    check(rows_now.count() == 7, f"sju medlemmar i år ({rows_now.count()})")
    check(adm.locator("#medlemmar .cmm-next .cmm-row").count() == 2, "två inlagda för nästa år")
    check(adm.locator("#medlemmar details.cmm-archive .cmm-row").count() == 3, "tre under tidigare år")
    check(rows_now.first.locator(".pill-accent").count() == 1, "den första är märkt Visas störst")

    # Flytta med pilen: Ahmed (nr 2) upp → först
    adm.locator("#medlemmar > ol .cmm-row").nth(1).locator("button[aria-label^='Flytta upp']").click()
    adm.wait_for_load_state()
    check(f"/admin/utskott/{eid}" in adm.url, "pilen leder tillbaka till utskottet")
    check(adm.locator("#medlemmar > ol .cmm-row").first.inner_text().startswith("Ahmed") or "Ahmed" in adm.locator("#medlemmar > ol .cmm-row").first.inner_text(), "ordningen ändras med pilen")
    adm.locator("#medlemmar > ol .cmm-row").first.locator("button[aria-label^='Flytta ned']").click()
    adm.wait_for_load_state()
    check("Elsa" in adm.locator("#medlemmar > ol .cmm-row").first.inner_text(), "och tillbaka")
    # Dra och släpp: handtaget och piltangenterna
    handle = adm.locator("#medlemmar > ol .cmm-row").nth(2).locator("[data-sort-handle]")
    check(handle.is_visible(), "handtaget för dra och släpp syns med JavaScript")
    adm.goto(f"{BASE}/admin/utskott/{eid}#medlemmar")
    adm.screenshot(path=str(OUT / "utskott-admin-medlemmar.png"), full_page=True)

    adm.goto(f"{BASE}/admin/utskottsmedlemmar")
    check(adm.locator("tbody tr").count() == 12, "alla medlemmar i listan Utskottsmedlemmar")
    check(adm.locator("tbody .pill-plan").count() == 2, "nästa års medlemmar märks i listan")

    # ── Ett evenemang som utskottet arrangerar ──
    print("Evenemang")
    adm.goto(f"{BASE}/admin/event/ny")
    adm.fill("#falt-title", "Höstsittning")
    adm.fill("#falt-starts_at", "2030-11-20T18:30")
    adm.select_option("#falt-committee_id", str(eid))
    submit_main(adm)
    check(adm.locator(".field-error").count() == 0, "eventet sparas")

    # ── Webbplatsen ──
    print("Om oss")
    pub.goto(f"{BASE}/om-oss")
    posters = pub.locator(".poster-grid .poster")
    check(posters.count() == 6, "Anslagstavlan: sex affischer")
    first = pub.locator(".poster", has=pub.locator("a[href='/om-oss/utskott/evenemangsutskottet']"))
    check(first.locator(".poster-count").inner_text() == "7 medlemmar", "affischen räknar årets medlemmar (inte nästa år eller tidigare)")
    check("Ordförande: Elsa Lindqvist" in first.locator(".poster-chair").inner_text(), "ordföranden under affischen")
    check(first.locator(".poster-media.focus-upptill img").count() == 1, "anslagsbilden med vald fokus")
    check(pub.locator(".poster-grid .poster-count").count() == 1, "utskott utan medlemmar visar inget antal")
    settle(pub)
    pub.locator("#utskotten").scroll_into_view_if_needed()
    pub.wait_for_timeout(500)
    pub.locator("section.committees-board").screenshot(path=str(OUT / "utskott-om-oss.png"))
    first.locator(".poster-card").click(position={"x": 60, "y": 60})
    pub.wait_for_load_state()
    check(pub.url.endswith("/om-oss/utskott/evenemangsutskottet"), "ett klick på affischen öppnar utskottets sida")

    print("Utskottets sida")
    check(pub.locator("h1").inner_text().replace("­", "") == "Evenemangsutskottet", "rubriken är utskottets namn")
    check(pub.locator(".cm-hero.has-image .cm-hero-media img").count() == 1, "anslagsbilden överst")
    check(pub.locator(".cm-lead .cm-lead-name").inner_text() == "Elsa Lindqvist", "den första visas störst")
    check("fler ska känna sig hemma" in pub.locator(".cm-lead-quote").inner_text(), "med sitt citat")
    check(pub.locator(".cm-lead a[href='mailto:evenemang@example.com']").count() == 1, "utskottets e-post")
    check(pub.locator(".cm-members .person-card").count() == 6, "övriga sex i porträttväggen")
    check(pub.locator(".cm-members .person-card.has-photo").count() == 4, "foton där de finns, initialer annars")
    body = pub.locator("main").inner_text()
    check("Maja Ek" not in body, "nästa års medlemmar syns inte")
    check(pub.locator("details.archive").count() == 1 and "Hugo Sandberg" in pub.locator("details.archive").text_content(), "Tidigare år med förra årets medlemmar")
    check(pub.locator("details.archive img").count() == 0, "tidigare år utan foton")
    check(pub.locator("a[href='/kalender/hostsittning']").count() >= 1, "evenemanget under På gång")
    check(pub.locator(".cm-join a[href='/engagera-dig?utskott=evenemangsutskottet#anmalan']").count() == 1, "anmälan förväljer utskottet")
    check(pub.locator(".cm-more .cm-more-item").count() == 5, "Fler utskott")
    pub.locator("details.archive summary").click()
    settle(pub)
    pub.screenshot(path=str(OUT / "utskott-sida.png"), full_page=True)

    pub.goto(f"{BASE}/kalender/hostsittning")
    check(pub.locator("a[href='/om-oss/utskott/evenemangsutskottet']:has-text('Arrangeras av Evenemangsutskottet')").count() == 1, "eventet länkar till utskottet")

    pub.goto(f"{BASE}/om-oss/utskott/ekonomiutskottet")
    check(pub.locator(".cm-empty").count() == 1, "utskott utan medlemmar: Årets medlemmar presenteras snart")
    check(pub.locator("details.archive").count() == 0, "inget arkiv utan tidigare år")
    check(pub.request.get(f"{BASE}/om-oss/utskott/finns-inte").status == 404, "okänt utskott ger 404")
    r = pub.request.get(f"{BASE}/om-oss/utskott", max_redirects=0)
    check(r.status == 301 and r.headers.get("location", "").endswith("/om-oss#utskotten"), "/om-oss/utskott skickar till utskotten på Om oss")
    check("/om-oss/utskott/evenemangsutskottet" in pub.request.get(f"{BASE}/sitemap.xml").text(), "utskottens sidor i sitemap")
    pub.goto(f"{BASE}/sok?q=sittningar")
    check(pub.locator("a[href='/om-oss/utskott/evenemangsutskottet']").count() >= 1, "sökningen hittar utskottets sida")
    pub.goto(f"{BASE}/engagera-dig")
    check(pub.locator(".cm-meet a[href='/om-oss/utskott/evenemangsutskottet']").count() == 1, "Engagera dig länkar till Möt utskottet")

    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, reduced_motion="reduce")
    for path, name in [("/om-oss/utskott/evenemangsutskottet", "utskott-sida-mobil"), ("/om-oss", "utskott-om-oss-mobil")]:
        m.goto(BASE + path)
        settle(m)
        check(m.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{path}: ingen sidled scroll på mobil")
        if path == "/om-oss":
            m.locator("#utskotten").scroll_into_view_if_needed()
            m.wait_for_timeout(500)
            m.locator("section.committees-board").screenshot(path=str(OUT / f"{name}.png"))
        else:
            m.screenshot(path=str(OUT / f"{name}.png"), full_page=True)

    # ── Styrelsen per verksamhetsår ──
    print("Styrelsen och verksamhetsåret")
    adm.goto(f"{BASE}/admin/styrelsen")
    check(adm.locator(".year-intro").count() == 1 and "2026/27" in adm.locator(".year-intro").inner_text(), "listan säger vilket år som visas")
    check(adm.locator("th:has-text('Verksamhetsår')").count() == 1, "kolumnen Verksamhetsår")
    adm.click(".year-intro a:has-text('Lägg in styrelsen för 2027/28')")
    adm.wait_for_load_state()
    check(adm.locator("#falt-year").input_value() == "2027/28", "genvägen förväljer nästa år")
    adm.fill("#falt-name", "Ny Ordförande")
    adm.fill("#falt-role", "Ordförande")
    submit_main(adm)
    adm.goto(f"{BASE}/admin/styrelsen/ny?ar=2025/26")
    adm.fill("#falt-name", "Gammal Kassör")
    adm.fill("#falt-role", "Kassör")
    adm.fill("#falt-email", "gammal@example.com")
    submit_main(adm)
    adm.screenshot(path=str(OUT / "styrelsen-admin.png"), full_page=True)
    pub.goto(f"{BASE}/om-oss")
    board = pub.locator("#styrelsen").locator("xpath=ancestor::section[1]")
    check("Ny Ordförande" not in board.inner_text(), "nästa års styrelse syns inte än")
    check(board.locator("details.archive-board").count() == 1 and "Gammal Kassör" in board.locator("details.archive-board").text_content(), "Tidigare styrelser")
    pub.goto(f"{BASE}/kontakt")
    check("gammal@example.com" not in pub.content(), "kontaktsidan visar bara årets styrelse")

    adm.goto(f"{BASE}/admin/styrelseskifte")
    card = adm.locator("#verksamhetsar")
    check("2026/27" in card.text_content() and "1 i styrelsen och 2 i utskotten" in card.text_content(), "Styrelseskifte visar året och vad som är inlagt för nästa år")
    adm.screenshot(path=str(OUT / "styrelseskifte-ar.png"))
    adm.once("dialog", lambda d: d.accept())
    card.locator("button[value='2027/28']").click()
    if adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").count():
        adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").first.click()
    adm.wait_for_load_state()
    adm.wait_for_timeout(300)
    check("2027/28" in adm.locator("#verksamhetsar .year-card-year").inner_text(), "året är bytt")
    pub.goto(f"{BASE}/om-oss")
    check("Ny Ordförande" in pub.locator("#styrelsen").locator("xpath=ancestor::section[1]").inner_text(), "efter bytet visas den nya styrelsen")
    pub.goto(f"{BASE}/om-oss/utskott/evenemangsutskottet")
    check(pub.locator(".cm-lead-name").inner_text() == "Maja Ek", "och nästa års utskott")
    check("Elsa Lindqvist" in pub.locator("details.archive").text_content(), "2026/27 har flyttat till Tidigare år")
    # tillbaka
    adm.goto(f"{BASE}/admin/styrelseskifte")
    adm.once("dialog", lambda d: d.accept())
    adm.locator("#verksamhetsar button[value='2026/27']").click()
    if adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").count():
        adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").first.click()
    adm.wait_for_load_state()
    adm.wait_for_timeout(300)
    check("2026/27" in adm.locator("#verksamhetsar .year-card-year").inner_text(), "och går att byta tillbaka")
    r = adm.request.post(f"{BASE}/admin/styrelseskifte/ar", form={"_csrf": "fel", "ar": "2027/28"}, max_redirects=0)
    check(r.status == 303 and "fel=csrf" in r.headers.get("location", ""), "byte av år kräver giltig CSRF")

    # ── Behåll från i år ──
    print("Behåll från i år")
    adm.goto(f"{BASE}/admin/utskott/{eid}")
    keep = adm.locator("#medlemmar details.keep")
    check(keep.count() == 1, "rutan Behåll från 2026/27 under nästa år")
    keep.locator("summary").click()
    keep.locator("label.keep-person:has-text('Elsa Lindqvist') input").check()
    keep.locator("label.keep-person:has-text('Ahmed Nour') input").check()
    keep.locator("button[type=submit]").click()
    adm.wait_for_load_state()
    check("klart=behallna" in adm.url and "antal=2" in adm.url, "två personer inlagda för nästa år")
    check(adm.locator("#medlemmar .cmm-next .cmm-row").count() == 4, "nästa år har nu fyra medlemmar")
    check("Elsa Lindqvist" not in adm.locator("#medlemmar details.keep").text_content(), "den som redan är inlagd visas inte igen")
    r = adm.request.post(f"{BASE}/admin/behall/{eid}", form={"_csrf": "fel", "id": "1"}, max_redirects=0)
    check(r.status == 303 and "fel=csrf" in r.headers.get("location", ""), "Behåll kräver giltig CSRF")

    adm.goto(f"{BASE}/admin/styrelsen")
    bkeep = adm.locator(".year-intro details.keep")
    bkeep.locator("summary").click()
    bkeep.locator("input[name=id]").first.check()
    bkeep.locator("button[type=submit]").click()
    adm.wait_for_load_state()
    check("klart=behallna" in adm.url and "antal=1" in adm.url, "styrelsen: en ledamot behålls till nästa år")

    # ── Lagbild ──
    print("Lagbild")
    adm.goto(f"{BASE}/admin/utskott/{eid}")
    adm.check("input[name=meet_style][value=lagbild]")
    submit_main(adm)
    adm.goto(f"{BASE}/admin/utskott/{eid}#lagbild")
    lag = adm.locator("#lagbild")
    check(lag.count() == 1, "rutan Lagbild och gruppbilder")
    now_block = lag.locator(".gp-year").first
    now_block.locator("input[type=file][name=bild]").set_input_files(cover("evenemangsutskottet"))
    now_block.locator("input[name=alt]").fill("Evenemangsutskottet på kickoffen (exempelbild)")
    now_block.locator("button[type=submit]").click()
    adm.wait_for_load_state()
    check("klart=skapat" in adm.url, "gruppbilden för året laddas upp")
    editor = adm.locator("#lagbild [data-marker-editor]").first
    check(editor.count() == 1 and editor.locator("input[name=placera]").count() == 7, "alla sju går att placera ut")
    img = editor.locator("[data-marker-img] img")
    img.scroll_into_view_if_needed()
    box = img.bounding_box()
    spots = [(0.16, 0.5), (0.3, 0.42), (0.44, 0.48), (0.58, 0.4), (0.72, 0.5), (0.86, 0.44)]
    for fx, fy in spots:
        adm.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
    check(editor.locator(".gp-dot:not([hidden])").count() == 6, "sex punkter i bilden efter sex klick")
    editor.screenshot(path=str(OUT / "lagbild-admin.png"))
    editor.locator("button[value=spara]").click()
    adm.wait_for_load_state()
    check("klart=sparat" in adm.url, "punkterna sparas")

    pub.goto(f"{BASE}/om-oss/utskott/evenemangsutskottet")
    check(pub.locator(".team .team-dot").count() == 6, "lagbilden på utskottets sida har sex siffror")
    check(pub.locator(".team-num.is-missing").count() == 1, "den som inte är utplacerad står utan siffra")
    check(pub.locator(".cm-lead").count() == 0, "porträttvisningen ersätts av lagbilden")
    left = pub.evaluate("getComputedStyle(document.querySelector('.team-dot')).left")
    check(left not in ("auto", "0px"), f"punkterna sitter på sina platser ({left})")
    pub.locator(".team-dot").nth(2).click()
    sel = pub.locator(".team-person.is-selected")
    check(sel.count() == 1 and "Julia Karlsson" in sel.inner_text(), "ett klick på siffra 3 visar Julia Karlsson")
    pub.locator(".team").screenshot(path=str(OUT / "lagbild.png"))
    m.goto(f"{BASE}/om-oss/utskott/evenemangsutskottet")
    settle(m)
    check(m.evaluate("document.documentElement.scrollWidth <= innerWidth"), "lagbilden: ingen sidled scroll på mobil")
    m.locator(".team").screenshot(path=str(OUT / "lagbild-mobil.png"))

    # Gruppbild från ett tidigare år och styrelsens gruppbild
    print("Gruppbilder")
    adm.goto(f"{BASE}/admin/utskott/{eid}#lagbild")
    past = adm.locator("#lagbild details.gp-past")
    past.locator("summary").click()
    form = past.locator("form.gp-upload")
    form.locator("select[name=ar]").select_option("2025/26")
    form.locator("input[type=file][name=bild]").set_input_files(cover("arbetsmarknadsutskottet"))
    form.locator("input[name=alt]").fill("Utskottet 2025/26 (exempelbild)")
    form.locator("button[type=submit]").click()
    adm.wait_for_load_state()
    pub.goto(f"{BASE}/om-oss/utskott/evenemangsutskottet")
    check(pub.locator("details.archive .archive-photo img").count() == 1, "Tidigare år visar gruppbilden från 2025/26")

    adm.goto(f"{BASE}/admin/styrelsen")
    check(adm.locator("details#gruppbilder:not([open])").count() == 1, "gruppbilderna är hopfällda ovanför ledamöterna")
    adm.goto(f"{BASE}/admin/styrelsen#gruppbilder")
    check(adm.locator("details#gruppbilder[open]").count() == 1, "#gruppbilder öppnar rutan")
    gb = adm.locator("#gruppbilder .gp-year").first
    check(gb.count() == 1, "styrelsen har rutan Gruppbilder")
    gb.locator("input[type=file][name=bild]").set_input_files(cover("idrottsutskottet"))
    gb.locator("input[name=alt]").fill("Styrelsen 2026/27 (exempelbild)")
    gb.locator("button[type=submit]").click()
    adm.wait_for_load_state()
    pub.goto(f"{BASE}/om-oss")
    check(pub.locator(".board-photo img").count() == 1 and "Styrelsen 2026/27" in pub.locator(".board-photo figcaption").inner_text(), "årets gruppbild överst under Styrelsen")

    # Ta bort en gruppbild: raderas helt
    check("klart=skapat" in adm.url and adm.locator("details#gruppbilder[open]").count() == 1, "efter uppladdningen är rutan öppen")
    adm.goto(f"{BASE}/admin/styrelsen#gruppbilder")
    key = adm.locator("#gruppbilder .gp-image img").first.get_attribute("src").split("/media/")[1].split(".md")[0].split("?")[0]
    adm.once("dialog", lambda d: d.accept())
    adm.locator("#gruppbilder button[value=ta-bort]").first.click()
    adm.wait_for_load_state()
    check("klart=raderat" in adm.url, "gruppbilden tas bort")
    check(pub.request.get(f"{BASE}/media/{key}").status == 404, "och raderas helt från lagringen")

    # ── Idé 1: Det här är vi på Engagera dig ──
    pub.goto(f"{BASE}/engagera-dig")
    people = pub.locator("#utskott-evenemangsutskottet .cm-people .cm-face")
    check(people.count() == 7, f"Engagera dig visar årets sju medlemmar ({people.count()})")
    check(pub.locator("#utskott-ekonomiutskottet .cm-people").count() == 0, "utskott utan medlemmar visar inget")
    pub.locator("#utskott-evenemangsutskottet summary").click()
    pub.wait_for_timeout(400)
    pub.locator("#utskott-evenemangsutskottet").screenshot(path=str(OUT / "engagera-medlemmar.png"))

    # ── Ta bort ──
    adm.goto(f"{BASE}/admin/utskott")
    adm.once("dialog", lambda d: d.accept())
    row = adm.locator("tbody tr", has=adm.locator("a.row-title:has-text('Evenemangsutskottet')"))
    row.locator("button:has-text('Ta bort')").click()
    if adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").count():
        adm.locator("dialog[open] button[value=ok], .confirm-dialog button.btn-primary").first.click()
    adm.wait_for_load_state()
    check("fel=utskott-har-medlemmar" in adm.url, "ett utskott med medlemmar kan inte tas bort")
    check(adm.locator("tbody a.row-title:has-text('Evenemangsutskottet')").count() == 1, "utskottet finns kvar")

    b.close()
done()
