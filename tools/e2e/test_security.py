"""Säkerhet: öppna omdirigeringar, säkerhetshuvuden, security.txt, kontospärren och tvåstegsverifiering
(slå på, logga in med kod och reservkod, återanvänd kod, krav för alla, administratören stänger av för någon).

Kör mot nollställd databas:  npm run preview:node -- --reset
"""
import base64
import hashlib
import hmac
import struct
import time

from common import *


def totp(secret: str, offset: int = 0) -> str:
    key = base64.b32decode(secret.replace(" ", "") + "=" * (-len(secret.replace(" ", "")) % 8))
    step = int(time.time() // 30) + offset
    mac = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = mac[-1] & 15
    return str((struct.unpack(">I", mac[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


def logout(page):
    page.goto(f"{BASE}/admin")
    if page.locator("form[action='/admin/logga-ut'] button").count():
        page.locator("form[action='/admin/logga-ut'] button").first.click()
        page.wait_for_load_state()
    page.context.clear_cookies()


def password_login(page, email, password):
    page.goto(f"{BASE}/admin/logga-in")
    page.fill("input[type=email]", email)
    page.fill("input[type=password]", password)
    page.click("form.admin-form button[type=submit]")
    page.wait_for_load_state()


def invite(adm, name, email, password):
    """Skapa en redaktör via Användare och välj lösenord med inbjudningslänken."""
    adm.goto(f"{BASE}/admin/anvandare")
    adm.fill("#falt-namn", name)
    adm.fill("#falt-epost", email)
    adm.click("form[action='/admin/anvandare'] button[type=submit]")
    adm.wait_for_load_state()
    link = adm.locator(".invite-box input[data-copy-source]").input_value()
    other = adm.context.browser.new_page()
    other.goto(link.replace("https://jfkarlstad.se", BASE))
    other.fill("#falt-nytt", password)
    other.fill("#falt-igen", password)
    other.click("form.admin-form button[type=submit]")
    other.wait_for_load_state()
    other.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    req = b.new_page().request

    # ── Öppna omdirigeringar ──
    print("Omdirigeringar")
    for bad in ["//evil.example/", "//evil.example", "/\\evil.example/", "///evil.example/sida/"]:
        r = req.get(BASE + bad, max_redirects=0)
        loc = r.headers.get("location", "")
        host = re.match(r"^https?://([^/]+)", loc)
        safe = not loc.startswith("//") and not loc.startswith("/\\") and (not host or "evil.example" not in host.group(1))
        check(safe, f"{bad!r} leder inte till en annan webbplats ({r.status} → {loc!r})")

    # ── Säkerhetshuvuden ──
    print("Säkerhetshuvuden")
    r = req.get(f"{BASE}/om-oss")
    h = r.headers
    check("frame-ancestors 'none'" in h.get("content-security-policy", "") and "script-src 'self'" in h.get("content-security-policy", ""), "strikt CSP")
    check(h.get("x-frame-options") == "DENY", "X-Frame-Options: DENY")
    check("max-age=63072000" in h.get("strict-transport-security", ""), "HSTS")
    check(h.get("cross-origin-resource-policy") == "same-origin", "Cross-Origin-Resource-Policy")
    check("payment=()" in h.get("permissions-policy", ""), "Permissions-Policy stänger av känsliga funktioner")
    check(h.get("x-content-type-options") == "nosniff", "nosniff")
    r = req.get(f"{BASE}/.well-known/security.txt")
    t = r.text()
    check(r.status == 200 and "Contact: mailto:" in t and "Expires: 20" in t, "security.txt med kontakt och utgångsdatum")
    r = req.get(f"{BASE}/admin/tvasteg", max_redirects=0)
    check(r.status == 303 and "/admin/logga-in" in r.headers.get("location", ""), "steg två utan lösenordssteget går inte")

    # ── Tvåstegsverifiering ──
    print("Tvåstegsverifiering")
    adm = b.new_page(viewport={"width": 1280, "height": 1000}, extra_http_headers={"x-e2e-ip": "203.0.113.10"})
    login(adm)
    adm.goto(f"{BASE}/admin")
    check(adm.locator(".tfa-nudge").count() == 1, "Översikt påminner om tvåstegsverifiering")
    adm.goto(f"{BASE}/admin/konto")
    check(adm.locator("#tvastegs .pill:has-text('Av')").count() == 1, "Mitt konto: Av")
    adm.click("#tvastegs a:has-text('Slå på')")
    adm.wait_for_load_state()
    check(adm.locator(".tfa-qr svg").count() == 1, "QR-koden visas")
    adm.screenshot(path=str(OUT / "tvastegs-sla-pa.png"), full_page=True)
    adm.locator(".tfa-manual details summary").click()
    secret = adm.locator(".tfa-secret").inner_text().replace(" ", "")
    check(len(secret) == 32, "nyckeln för manuell inmatning (160 bitar)")
    adm.fill("#falt-kod", "000000" if totp(secret) != "000000" else "111111")
    adm.click("form[action='/admin/konto/tvastegs'] button[type=submit]")
    adm.wait_for_load_state()
    check(adm.locator(".alert-error").count() == 1, "fel kod slår inte på")
    adm.fill("#falt-kod", totp(secret))
    adm.click("form[action='/admin/konto/tvastegs'] button[type=submit]")
    adm.wait_for_load_state()
    codes = [x.strip() for x in adm.locator(".tfa-code-list li").all_inner_texts()]
    check(len(codes) == 10 and all(len(c) == 11 for c in codes), "tio reservkoder visas en gång")
    adm.screenshot(path=str(OUT / "tvastegs-reservkoder.png"), full_page=True)
    adm.goto(f"{BASE}/admin/konto")
    check(adm.locator("#tvastegs .pill:has-text('På')").count() == 1, "Mitt konto: På")

    logout(adm)
    password_login(adm, EMAIL, PASSWORD)
    check("/admin/tvasteg" in adm.url, "efter lösenordet kommer steg två")
    adm.screenshot(path=str(OUT / "tvastegs-inloggning.png"), full_page=True)
    adm.goto(f"{BASE}/admin/nyheter")
    check("/admin/logga-in" in adm.url, "utan koden finns ingen session")
    password_login(adm, EMAIL, PASSWORD)
    adm.fill("#falt-kod", "123456" if totp(secret, 1) != "123456" else "654321")
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check(adm.locator(".alert-error").count() == 1 and "/admin/tvasteg" in adm.url, "fel kod: stannar på steg två")
    adm.fill("#falt-kod", totp(secret, 1))
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check(adm.url.rstrip("/").endswith("/admin"), "rätt kod: inloggad")
    used = totp(secret, 1)

    # Samma kod går inte att använda igen
    logout(adm)
    password_login(adm, EMAIL, PASSWORD)
    adm.fill("#falt-kod", used)
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check("/admin/tvasteg" in adm.url, "en använd kod fungerar inte igen")
    # Reservkod
    adm.fill("#falt-kod", codes[0].upper())
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check(adm.url.rstrip("/").endswith("/admin"), "reservkod loggar in")
    logout(adm)
    password_login(adm, EMAIL, PASSWORD)
    adm.fill("#falt-kod", codes[0])
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check("/admin/tvasteg" in adm.url, "samma reservkod fungerar inte igen")
    adm.fill("#falt-kod", codes[1])
    adm.click("form.admin-form button[type=submit]")
    adm.wait_for_load_state()
    check(adm.url.rstrip("/").endswith("/admin"), "lyckade inloggningar räknas inte mot spärren")

    # Fem felaktiga koder: kontot spärras för koder i en kvart, även med rätt kod
    guess = b.new_page(extra_http_headers={"x-e2e-ip": "203.0.113.40"})
    password_login(guess, EMAIL, PASSWORD)
    for i in range(5):
        guess.fill("#falt-kod", f"{(int(totp(secret)) + 500000 + i) % 1000000:06d}")
        guess.click("form.admin-form button[type=submit]")
        guess.wait_for_load_state()
    guess.fill("#falt-kod", totp(secret, 1) if totp(secret, 1) != used else totp(secret))
    guess.click("form.admin-form button[type=submit]")
    guess.wait_for_load_state()
    check("För många" in guess.locator(".alert-error").inner_text(), "efter fem felaktiga koder: spärrat en kvart")
    guess.close()

    # ── Kräv för alla ──
    print("Krav och återställning")
    invite(adm, "Rita Redaktör", "rita@example.com", "Ett-annat-langt-losenord-9")
    adm.goto(f"{BASE}/admin/anvandare")
    check(adm.locator("#tvastegs:has-text('1 av 2')").count() == 1, "Användare: 1 av 2 har tvåstegsverifiering")
    adm.once("dialog", lambda d: d.accept())
    adm.click("#tvastegs button:has-text('Kräv för alla')")
    adm.wait_for_load_state()
    check("tvastegs-krav" in adm.url, "kravet slås på")
    rita = b.new_page(viewport={"width": 1280, "height": 1000}, extra_http_headers={"x-e2e-ip": "203.0.113.20"})
    password_login(rita, "rita@example.com", "Ett-annat-langt-losenord-9")
    check("/admin/konto/tvastegs" in rita.url and "krav=1" in rita.url, "utan tvåstegsverifiering: direkt till inställningen")
    rita.goto(f"{BASE}/admin/nyheter")
    check("/admin/konto/tvastegs" in rita.url, "och inget annat går att öppna")
    rita.screenshot(path=str(OUT / "tvastegs-krav.png"), full_page=True)
    rita.locator(".tfa-manual details summary").click()
    rsecret = rita.locator(".tfa-secret").inner_text().replace(" ", "")
    rita.fill("#falt-kod", totp(rsecret))
    rita.click("form[action='/admin/konto/tvastegs'] button[type=submit]")
    rita.wait_for_load_state()
    rita.goto(f"{BASE}/admin/nyheter")
    check("/admin/nyheter" in rita.url, "efter att ha slagit på: adminpanelen fungerar")
    rita.goto(f"{BASE}/admin/konto/tvastegs")
    rita.fill("#falt-losen-av", "Ett-annat-langt-losenord-9")
    rita.click("form[action='/admin/konto/tvastegs/av'] button[type=submit]")
    rita.wait_for_load_state()
    check(rita.locator(".alert-error:has-text('kräver')").count() == 1, "med kravet går det inte att stänga av själv")

    adm.goto(f"{BASE}/admin/anvandare")
    adm.once("dialog", lambda d: d.accept())
    adm.locator("tr:has-text('Rita Redaktör') button:has-text('Stäng av tvåsteg')").click()
    adm.wait_for_load_state()
    check("tvastegs-aterstallt" in adm.url, "administratören stänger av för någon som tappat telefonen")
    rita.goto(f"{BASE}/admin/nyheter")
    check("/admin/logga-in" in rita.url, "och personen loggas ut")
    adm.screenshot(path=str(OUT / "tvastegs-anvandare.png"), full_page=True)

    # ── Kontospärren blir längre för varje omgång ──
    print("Kontospärr")
    adm.once("dialog", lambda d: d.accept())
    adm.click("#tvastegs button:has-text('frivilligt')")
    adm.wait_for_load_state()
    lock = b.new_page(extra_http_headers={"x-e2e-ip": "203.0.113.30"})
    for i in range(5):
        password_login(lock, "rita@example.com", f"fel-losenord-{i}-xxxxxxxx")
    check("spärrat i 15 minuter" in lock.locator(".alert-error").inner_text(), "efter fem fel: spärrat i 15 minuter")
    password_login(lock, "rita@example.com", "Ett-annat-langt-losenord-9")
    check("låst" in lock.locator(".alert-error").inner_text(), "rätt lösenord under spärren hjälper inte")

    b.close()
done()
