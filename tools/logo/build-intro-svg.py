"""Bygger introts logotyp (public/assets/intro-logo.svg) från föreningens EPS-original.

    python3 tools/logo/build-intro-svg.py

Illustrator-EPS:en skriver ut formerna som enkla PostScript-kommandon (mo/li/cv/cp, f = fyll, @ = linje,
"c m y k cmyk" = färg) med y-axeln redan vänd som i SVG. Skriptet läser dem rakt av – ingen Ghostscript
behövs. Formerna grupperas efter sin roll i logotypen så att intro.js kan animera dem var för sig:

  vagen     stommen, två skålar och två uppsättningar trådar (linjer)
  bagtext   "Juridiska Föreningen i Karlstad" – en form per bokstav, vänster till höger
  jfk       bokstäverna J, F och K
  krans     två stjälkar och bladen, uppifrån och ned per sida

Ändras logotypen: lägg in den nya EPS:en och kontrollera att formerna hamnar i rätt grupper (ordningen nedan).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EPS = ROOT / "JFK_logga_stor.eps"
OUT = ROOT.parent.parent / "public" / "assets" / "intro-logo.svg"


def cmyk_hex(c, m, y, k):
    return "#%02x%02x%02x" % tuple(round(255 * (1 - v) * (1 - k)) for v in (c, m, y))


def num(v):
    return ("%.1f" % float(v)).rstrip("0").rstrip(".")


def shapes():
    text = EPS.read_text(encoding="latin-1").split("\n")
    start = next(i for i, l in enumerate(text) if l.startswith("%%EndPageSetup"))
    end = next(i for i, l in enumerate(text) if l.startswith("%%PageTrailer"))
    color, width, d, out = "#000000", 1.0, [], []
    for line in text[start:end]:
        t = line.split()
        if not t or line.startswith("%"):
            continue
        op = t[-1]
        if op == "cmyk" and len(t) >= 5:
            color = cmyk_hex(*map(float, t[-5:-1]))
        elif op == "lw":
            width = float(t[0])
        elif op == "mo":
            d.append(f"M{num(t[0])} {num(t[1])}")
        elif op == "li":
            d.append(f"L{num(t[0])} {num(t[1])}")
        elif op == "cv":
            d.append("C" + " ".join(num(x) for x in t[:6]))
        elif op == "cp":
            d.append("Z")
        elif op in ("clp", "np"):
            d = []  # sidans klippram
        elif op == "f":
            out.append(("fill", color, width, "".join(d)))
            d = []
        elif op == "@":
            out.append(("stroke", color, width, "".join(d)))
            d = []
    return out


def main():
    s = shapes()
    assert len(s) == 66, f"Väntade 66 former i logotypen, fick {len(s)} – kontrollera grupperingen nedan."
    p = lambda i, cls="": f'<path{f" class={chr(34)}{cls}{chr(34)}" if cls else ""} d="{s[i][3]}"/>'
    # Ordningen i originalfilen: 0 stomme, 1 vänster skål, 2 vänster trådar, 3 höger skål, 4 höger trådar,
    # 5–32 bågtextens bokstäver, 33–35 J F K, 36–49 högra bladen (uppifrån), 50 högra stjälken,
    # 51–64 vänstra bladen (uppifrån), 65 vänstra stjälken.
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 414.6 419.25" class="intro-logo" aria-hidden="true" focusable="false">',
        '<defs><mask id="intro-grow" maskUnits="userSpaceOnUse" x="0" y="0" width="414.6" height="419.25">'
        '<circle class="i-grow" cx="207.3" cy="430" r="0" fill="#fff"/></mask>'
        '<clipPath id="intro-jfk"><rect x="80" y="150" width="270" height="156"/></clipPath></defs>',
        '<circle class="i-ring" cx="207.3" cy="215" r="205" fill="none"/>',
        '<g class="i-vagen">', p(0, "i-stomme"), p(1, "i-skal"), p(3, "i-skal"),
        p(2, "i-trad"), p(4, "i-trad"), "</g>",
        '<g class="i-krans">', '<g mask="url(#intro-grow)">', p(65, "i-stjalk"), p(50, "i-stjalk"), "</g>",
        *[p(i, "i-blad") for i in list(range(64, 50, -1)) + list(range(49, 35, -1))], "</g>",
        '<g class="i-jfk" clip-path="url(#intro-jfk)">', *[p(i, "i-bokstav") for i in (33, 34, 35)], "</g>",
        '<g class="i-bagtext">', *[p(i, "i-tecken") for i in range(5, 33)], "</g>",
        '<circle class="i-dot" cx="207.3" cy="215" r="7"/>',
        "</svg>",
    ]
    OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"Skrev {OUT.relative_to(ROOT.parent.parent)} ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
