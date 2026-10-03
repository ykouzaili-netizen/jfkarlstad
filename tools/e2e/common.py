"""Gemensamt för webbläsartesterna (Playwright för Python).

Kör mot den lokala förhandsvisningen:  npm run preview:node -- --reset
Sedan till exempel:                     python3 tools/e2e/test_features.py
"""
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, expect  # noqa: F401

BASE = os.environ.get("BASE_URL", "http://localhost:8787")
SETUP_TOKEN = os.environ.get("SETUP_TOKEN", "byt-till-en-lang-slumpad-strang")
EMAIL = "testadmin@jfkarlstad.se"
PASSWORD = "Ett-langt-testlosenord-2026"
OUT = Path(os.environ.get("E2E_OUT", "/tmp/jfk-e2e"))
OUT.mkdir(parents=True, exist_ok=True)

failures: list[str] = []


def check(cond: bool, what: str) -> None:
    print(("  ✓ " if cond else "  ✗ ") + what)
    if not cond:
        failures.append(what)


def done() -> None:
    print()
    if failures:
        print(f"{len(failures)} fel:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("Alla kontroller gick igenom.")


def login(page: Page) -> None:
    """Logga in. Skapar den första administratören om databasen är tom."""
    page.goto(f"{BASE}/admin/setup?nyckel={SETUP_TOKEN}")
    if page.locator("#falt-epost").count():
        page.fill("#falt-namn", "Test Testsson")
        page.fill("#falt-epost", EMAIL)
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/admin/losenord/"))
        pw = page.locator("input[type=password]")
        pw.nth(0).fill(PASSWORD)
        if pw.count() > 1:
            pw.nth(1).fill(PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_load_state()
    page.goto(f"{BASE}/admin/logga-in")
    if "/admin/logga-in" in page.url:
        page.fill("input[type=email]", EMAIL)
        page.fill("input[type=password]", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/admin(\?|$)"))


def test_image(path: Path, size=(2400, 1600), color=(40, 90, 160)) -> Path:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    for i in range(0, size[0], 120):
        d.rectangle([i, 0, i + 60, size[1]], fill=(240, 200, 70))
    img.save(path, "JPEG", quality=92)
    return path
