"""Material att ladda ned på tävlingssidan (/tavling): JFK:s logotyp som fristående SVG och PNG, och mallar.

Logotypen byggs från sajtens vektorlogotyp (public/assets/intro-logo.svg, samma som i introt): animationens
mask och ring tas bort och färgerna skrivs in i filen, så att den går att öppna i Inkscape, Affinity, Canva osv.
Kör från repots rot:  python3 tools/design/tavling-material.py
PNG-versionerna ritas av Chromium (Playwright) med genomskinlig bakgrund.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/tavling"
OUT.mkdir(parents=True, exist_ok=True)

src = (ROOT / "public/assets/intro-logo.svg").read_text()

# Färgerna som i föreningens logotyp (diplom-logo.webp): svart text, grå våg och gul krans. Den ljusa
# versionen har samma färger som introt (site.css: .intro-logo).
THEMES = {
    "jfk-logotyp": {  # för ljus bakgrund
        "i-stomme": 'fill="#d6d6d6"', "i-skal": 'fill="#d6d6d6"',
        "i-trad": 'fill="none" stroke="#b4b4b4" stroke-width="0.5"',
        "i-krans": 'fill="#f5d729"', "i-jfk": 'fill="#141414"', "i-bagtext": 'fill="#141414"',
    },
    "jfk-logotyp-ljus": {  # för mörk bakgrund
        "i-stomme": 'fill="#dadada" fill-opacity="0.62"', "i-skal": 'fill="#dadada" fill-opacity="0.62"',
        "i-trad": 'fill="none" stroke="#dadada" stroke-opacity="0.8" stroke-width="0.7"',
        "i-krans": 'fill="#f5d729"', "i-jfk": 'fill="#ffffff"', "i-bagtext": 'fill="#ffffff"',
    },
}


def standalone(theme: dict) -> str:
    s = src
    s = re.sub(r"<defs>.*?</defs>", "", s, flags=re.S)
    s = re.sub(r'<circle class="i-ring"[^>]*/>', "", s)
    s = re.sub(r'<circle class="i-dot"[^>]*/>', "", s)
    s = s.replace(' mask="url(#intro-grow)"', "").replace(' clip-path="url(#intro-jfk)"', "")
    s = re.sub(r' class="intro-logo"| aria-hidden="true"| focusable="false"', "", s)
    for cls, attrs in theme.items():
        s = re.sub(rf'class="{cls}"', f'class="{cls}" {attrs}', s)
    s = re.sub(r' class="[a-z-]+"', "", s)
    head = '<svg xmlns="http://www.w3.org/2000/svg"'
    return s.replace(head, f'{head} width="1658" height="1677"', 1).replace("<svg ", "<svg ", 1) \
        .replace(">", ">\n<title>Juridiska Föreningen i Karlstad – logotyp</title>", 1)


for name, theme in THEMES.items():
    (OUT / f"{name}.svg").write_text(standalone(theme))

# ── Mall för märket: 100 × 100 mm, märket 80 mm ──
badge = """<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="120mm" viewBox="0 0 100 120" font-family="Arial, Helvetica, sans-serif">
<title>JFK:s märkestävling – mall för märket (8 cm)</title>
<rect width="100" height="120" fill="#ffffff"/>
<g id="hjalplinjer">
<circle cx="50" cy="50" r="40" fill="none" stroke="#141414" stroke-width="0.4"/>
<circle cx="50" cy="50" r="37" fill="none" stroke="#cda72a" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>
<circle cx="50" cy="50" r="33" fill="none" stroke="#2a6fdb" stroke-width="0.25" stroke-dasharray="0.6 0.8"/>
<line x1="50" y1="8" x2="50" y2="92" stroke="#bbbbbb" stroke-width="0.15"/>
<line x1="8" y1="50" x2="92" y2="50" stroke="#bbbbbb" stroke-width="0.15"/>
</g>
<g id="forklaring" font-size="2.6" fill="#141414">
<text x="50" y="99" text-anchor="middle" font-size="3.4" font-weight="bold">Mall för märket – 8 cm i diameter</text>
<line x1="8" y1="104" x2="14" y2="104" stroke="#141414" stroke-width="0.4"/><text x="16" y="105">Märkets kant (8 cm) – formen är valfri.</text>
<line x1="8" y1="108.5" x2="14" y2="108.5" stroke="#cda72a" stroke-width="0.4" stroke-dasharray="1.2 0.9"/><text x="16" y="109.5">Kantsömmen (ca 3 mm) – lägg inget viktigt här.</text>
<line x1="8" y1="113" x2="14" y2="113" stroke="#2a6fdb" stroke-width="0.4" stroke-dasharray="0.6 0.8"/><text x="16" y="114">Säker yta – håll text och detaljer innanför.</text>
<rect x="86" y="102" width="5" height="5" fill="none" stroke="#141414" stroke-width="0.25"/><text x="88.5" y="110.5" text-anchor="middle" font-size="2">5 mm</text>
<text x="50" y="118.5" text-anchor="middle" font-size="2.1" fill="#666666">Minsta texthöjd 5 mm · högst 7 färger · skriv inte ditt namn i filen</text>
</g>
</svg>
"""
(OUT / "mall-marke.svg").write_text(badge)

# ── Mall för tryck: A4 med tröjan fram och bak ──
shirt = "M74 34 52 42 22 64l16 30 18-10v86h96V84l18 10 16-30-30-22-22-8c-4 10-16 16-30 16S78 44 74 34Z"
print_tpl = f"""<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family="Arial, Helvetica, sans-serif">
<title>JFK:s merchtävling – mall för tryck</title>
<rect width="210" height="297" fill="#ffffff"/>
<text x="105" y="20" text-anchor="middle" font-size="7" font-weight="bold" fill="#141414">Mall för tryck</text>
<text x="105" y="28" text-anchor="middle" font-size="3.6" fill="#555555">Lägg din design i en av ytorna. Ytorna är exempel – storleken bestäms med tryckeriet.</text>
<g transform="translate(6 40) scale(0.5)">
<path d="{shirt}" fill="#f4f1e8" stroke="#141414" stroke-width="1.6"/>
<path d="M74 34c4 10 16 16 30 16s26-6 30-16" fill="none" stroke="#141414" stroke-width="1.6"/>
<rect x="120" y="66" width="22" height="22" rx="2" fill="none" stroke="#2a6fdb" stroke-width="1.2" stroke-dasharray="2 2"/>
</g>
<g transform="translate(106 40) scale(0.5)">
<path d="{shirt}" fill="#f4f1e8" stroke="#141414" stroke-width="1.6"/>
<path d="M78 36c6 4 16 6 26 6s20-2 26-6" fill="none" stroke="#141414" stroke-width="1.6"/>
<rect x="62" y="62" width="84" height="100" rx="2" fill="none" stroke="#cda72a" stroke-width="1.2" stroke-dasharray="4 3"/>
</g>
<text x="58" y="140" text-anchor="middle" font-size="4.4" font-weight="bold" fill="#141414">Fram</text>
<text x="158" y="140" text-anchor="middle" font-size="4.4" font-weight="bold" fill="#141414">Rygg</text>
<g font-size="3.6" fill="#141414">
<line x1="30" y1="160" x2="40" y2="160" stroke="#cda72a" stroke-width="0.8" stroke-dasharray="2 1.5"/><text x="44" y="161.3">Stort tryck, t.ex. på ryggen eller framsidan</text>
<line x1="30" y1="170" x2="40" y2="170" stroke="#2a6fdb" stroke-width="0.8" stroke-dasharray="1 1"/><text x="44" y="171.3">Litet tryck, t.ex. på bröstet</text>
</g>
<rect x="30" y="185" width="150" height="80" rx="4" fill="none" stroke="#bbbbbb" stroke-width="0.4" stroke-dasharray="2 2"/>
<text x="105" y="225" text-anchor="middle" font-size="4" fill="#999999">Plats för din skiss – eller rita direkt på tröjorna ovan</text>
<text x="105" y="282" text-anchor="middle" font-size="3.2" fill="#666666">Ett tryck · koppling till JFK, juridik eller Karlstad · skriv inte ditt namn i filen</text>
</svg>
"""
(OUT / "mall-tryck.svg").write_text(print_tpl)

# ── PNG av logotypen (genomskinlig bakgrund) ──
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    for name in THEMES:
        pg = b.new_page(viewport={"width": 1658, "height": 1677})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{(OUT / f"{name}.svg").read_text()}</body></html>')
        pg.locator("svg").screenshot(path=str(OUT / f"{name}.png"), omit_background=True)
    b.close()

for f in sorted(OUT.iterdir()):
    print(f.name, f.stat().st_size)
