"""Merch- och märkestävlingen (/tavling): flikar, nedräkning, lägen (före/öppen/röstning/klar), ämnesraden,
kopieringsknapparna, kalenderfilen och att datumen ändras i adminpanelen.

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
    reset_dates(adm)

    # ── Standardläget (före 1 november) ──
    pub.goto(f"{BASE}/tavling")
    check(pub.locator("h1").inner_text().replace("\n", " ").strip() == "JFK:s Merch- & Märkestävling", "rubriken med & i guld")
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "before", "läget är ”före start” innan 1 november")
    check("Öppnar 1 november" in pub.locator(".t-chip").inner_text(), "etiketten säger Öppnar 1 november")
    check("30 november kl. 23:59" in pub.locator(".t-countdown-when").inner_text(), "nedräkningen gäller 30 november kl. 23:59")
    s1 = pub.locator("[data-unit=s]").inner_text()
    pub.wait_for_timeout(1300)
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
    pub.locator(".t-seg-opt", has_text="Merch").click()
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
    pub.screenshot(path=str(OUT / "tavling-rostning.png"), full_page=True)

    # Klart
    set_dates(adm, now - timedelta(days=20), now - timedelta(days=15), now - timedelta(days=10), now - timedelta(days=1))
    fresh(pub)
    check(pub.locator(".jfk-tavling").get_attribute("data-state") == "done", "läget blir ”klart”")
    check(not pub.locator(".t-clock").is_visible(), "ingen nedräkning när allt är klart")

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

    check(not errors, "inga JavaScript-fel" + (f": {errors}" if errors else ""))
    b.close()

done()
