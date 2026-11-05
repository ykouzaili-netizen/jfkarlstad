"""Biljettförsäljning på evenemang (migrering 0029): fälten Biljettsläpp och Biljettförsäljningen slutar i
adminpanelen, kontrollen av tiderna, raden på eventkort/eventsida och biljettdatumen i kalendern
(rutnätet, prickarna i mobilen, listan "Biljetter i …" och rutan vid hovring).

Kör mot förhandsvisningen med nollställd databas:  npm run preview:node -- --reset
Datumen räknas från dagens datum, så testet fungerar oavsett när det körs.
"""
from datetime import date, timedelta
from common import *

today = date.today()
def d(days: int, t: str) -> str:
    return f"{(today + timedelta(days=days)).isoformat()}T{t}"
def month_of(v: str) -> str:
    return v[:7]


def add_event(adm, title, start, open_at=None, close_at=None, expect_error=None):
    adm.goto(f"{BASE}/admin/event/ny")
    adm.fill("input[name=title]", title)
    adm.fill("input[name=starts_at]", start)
    if open_at: adm.fill("input[name=tickets_open_at]", open_at)
    if close_at: adm.fill("input[name=tickets_close_at]", close_at)
    adm.click("form button[type=submit] >> nth=-1")
    adm.wait_for_load_state()
    if expect_error:
        check(expect_error in adm.content(), f"felmeddelande: {expect_error}")
    else:
        check("/admin/event" in adm.url and "ny" not in adm.url, f"eventet {title} sparas")


with sync_playwright() as p:
    browser = p.chromium.launch()
    adm = browser.new_context().new_page()
    login(adm)

    print("Adminpanelen")
    adm.goto(f"{BASE}/admin/event/ny")
    check(adm.locator("input[name=tickets_open_at]").count() == 1 and adm.locator("input[name=tickets_close_at]").count() == 1, "fälten för biljettsläpp och slut finns")
    add_event(adm, "Felaktigt event", d(30, "18:00"), d(10, "12:00"), d(5, "12:00"), "Försäljningen kan inte sluta innan biljettsläppet.")
    add_event(adm, "Felaktigt event", d(30, "18:00"), d(40, "12:00"), None, "Biljettsläppet kan inte vara efter eventet.")

    soon_open, soon_close, soon_start = d(7, "12:00"), d(30, "23:59"), d(37, "18:00")
    add_event(adm, "Julsittningen", soon_start, soon_open, soon_close)
    add_event(adm, "Pågående försäljning", d(10, "12:00"), d(-3, "09:00"), d(8, "18:00"))
    add_event(adm, "Stängd försäljning", d(12, "18:00"), d(-20, "09:00"), d(-1, "23:59"))
    add_event(adm, "Bara slutdatum", d(14, "18:00"), None, d(12, "23:59"))

    pub = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce").new_page()
    errors: list[str] = []
    pub.on("pageerror", lambda e: errors.append(str(e)))

    print("Eventets sida")
    pub.goto(f"{BASE}/kalender/julsittningen")
    line = pub.locator(".aside-card .tix-line")
    day = today + timedelta(days=7)
    check(line.count() == 1 and "Biljettsläpp" in line.inner_text() and str(day.day) in line.inner_text() and "kl. 12:00" in line.inner_text(), f"före släppet: {line.inner_text() if line.count() else '–'}")
    pub.goto(f"{BASE}/kalender/pagaende-forsaljning")
    t = pub.locator(".aside-card .tix-line").inner_text()
    check("säljs t.o.m." in t and "kl. 18:00" in t, f"under försäljningen: {t}")
    pub.goto(f"{BASE}/kalender/stangd-forsaljning")
    t = pub.locator(".aside-card .tix-line").inner_text()
    check("har stängt" in t, f"efter försäljningen: {t}")
    pub.goto(f"{BASE}/kalender/bara-slutdatum")
    t = pub.locator(".aside-card .tix-line").inner_text()
    check("säljs t.o.m." in t and "kl." not in t, f"bara slutdatum (23:59 visar bara dagen): {t}")
    pub.screenshot(path=str(OUT / "biljetter-eventsida.png"))

    print("Kalendern – släppets månad")
    pub.goto(f"{BASE}/kalender?manad={month_of(soon_open)}")
    chip = pub.locator(f'.cal-day a.cal-tix.is-open[href="/kalender/julsittningen"]')
    check(chip.count() == 1 and "Biljettsläpp" in chip.inner_text() and "12:00" in chip.inner_text(), "biljettsläppet syns på sin dag i rutnätet")
    check(pub.locator(".cal-legend .cal-dot.is-tickets").count() == 1, "förklaringen visar biljettdatum")
    block = pub.locator(".cal-tix-block")
    check(block.count() == 1 and "Julsittningen" in block.inner_text(), "listan Biljetter i månaden visar släppet")
    check(pub.locator(f"#dag-{soon_open[:10]}").count() == 1, "dagen med släppet har ett ankare")
    cards = pub.locator(".cal-agenda .tix-line")
    check(cards.count() >= 1, "eventkorten i listan visar biljettraden")
    # Hovring på ett evenemang visar biljettraden i rutan
    ev = pub.locator('.cal-ev[href="/kalender/pagaende-forsaljning"]')
    if ev.count():
        ev.first.hover(); pub.wait_for_timeout(400)
        check("säljs t.o.m." in pub.locator(".cal-pop").inner_text(), "rutan vid hovring visar biljetterna")
    pub.screenshot(path=str(OUT / "biljetter-kalender.png"), full_page=True)

    print("Kalendern – sista biljettdagen")
    pub.goto(f"{BASE}/kalender?manad={month_of(soon_close)}")
    close = pub.locator(f'.cal-day a.cal-tix.is-close[href="/kalender/julsittningen"]')
    check(close.count() == 1 and "Sista biljettdag" in close.inner_text(), "sista biljettdagen syns i rutnätet")

    print("Mobil")
    mob = browser.new_context(viewport={"width": 380, "height": 800}, reduced_motion="reduce").new_page()
    mob.goto(f"{BASE}/kalender?manad={month_of(soon_open)}")
    cell = mob.locator(f'td:has(a.cal-num[href="#dag-{soon_open[:10]}"])')
    check(cell.locator(".cal-dot.is-tickets").is_visible(), "mobilen visar en prick för biljettsläppet")
    check(mob.locator(".cal-tix-row").first.is_visible(), "mobilen visar listan med biljetter")
    w = mob.evaluate("document.documentElement.scrollWidth")
    check(w <= 380, f"ingen vågrät skroll i mobilen ({w} px)")
    mob.screenshot(path=str(OUT / "biljetter-mobil.png"), full_page=True)

    check(not errors, f"inga JavaScript-fel {errors}")
    browser.close()
done()
