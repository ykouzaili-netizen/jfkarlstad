"""Gör medaljbilderna lika stora.

  python3 tools/design/medaljer.py <källmapp> <utmapp> [modell.pth]

Källmappen innehåller medalj-NN.png (styrelsens original med genomskinlig bakgrund). För varje medalj:
  1. små originalbilder (lägre än 1200 px, t.ex. de ritade förlagorna från 2026-10-08) skalas upp 4x med
     Real-ESRGAN (realesr-animevideov3, se esr.py) – kräver modellfilen som tredje argument.
     Fotona från 2026-10-16 (1080 × 1920) är stora nog och skalas bara ned,
  2. lösa småpixlar runt medaljen (rester från friläggningen) tas bort,
  3. bilden beskärs och skalas så att medaljerna blir lika stora: runda medaljer (ROUND) får samma
     medaljbredd, övriga former (stjärna, snöflinga, monogram) samma bandbredd som de runda. Fotona är tagna
     på olika avstånd och banden draperar olika långt, så samma höjd ger olika stora medaljer,
  4. placeras centrerat på en lika stor yta för alla (WIDTH × HEIGHT + PAD) med bandets överkant i samma höjd,
och sparas som WebP med genomskinlighet. Färgerna ändras inte.

Modellen: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HEIGHT = 860  # medaljens höjd i px i den färdiga bilden (ungefär tre gånger visningsstorleken)
WIDTH = 417   # ytans bredd – samma för alla bilder (src/lib/medals.ts räknar med 417 × 880)
PAD = 10
# Runda medaljer: våg och lagerkrans (brons/guld) och solen med JFK. Övriga skalas efter bandets bredd.
ROUND = {"01", "02", "03", "04", "06", "08", "09", "12", "14"}


def clean(im: Image.Image) -> Image.Image:
    """Tar bort lösa småbitar i alfakanalen (allt som inte hänger ihop med medaljen och är litet)."""
    a = np.array(im.getchannel("A"))
    mask = a > 24
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.004])
        # Behåll halvgenomskinliga kantpixlar intill det som behålls
        keep = ndimage.binary_dilation(keep, iterations=2)
        a = np.where(keep, a, 0).astype(np.uint8)
    out = im.copy()
    out.putalpha(Image.fromarray(a))
    return out


def widths(im: Image.Image) -> tuple[float, float]:
    """(bandets bredd, medaljens bredd) i px för en beskuren bild: medianbredden i bandets övre del och
    den största bredden i nedre 40 % (medaljen)."""
    a = np.array(im.getchannel("A")) > 128
    h = a.shape[0]

    def w(y: int) -> int:
        xs = np.flatnonzero(a[y])
        return int(xs[-1] - xs[0] + 1) if xs.size else 0

    ribbon = float(np.median([w(y) for y in range(int(h * 0.03), int(h * 0.2))]))
    medal = float(max(w(y) for y in range(int(h * 0.6), h)))
    return ribbon, medal


def main(src: str, dst: str, model: str | None = None) -> None:
    out = Path(dst)
    out.mkdir(parents=True, exist_ok=True)
    sd = None
    items = []
    for f in sorted(Path(src).glob("medalj-*.png")):
        im = Image.open(f).convert("RGBA")
        if im.height < 1200:
            import esr  # noqa: PLC0415 – behövs bara för de små ritade förlagorna

            sd = sd or esr.load_pth(model)
            tmp = out / (f.stem + ".x4.png")
            esr.upscale(sd, str(f), str(tmp))
            im = Image.open(tmp).convert("RGBA")
            tmp.unlink()
        im = clean(im)
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox())
        items.append((f.stem, im, *widths(im)))

    # Mål: alla runda medaljer lika breda; övriga får de runda medaljernas (genomsnittliga) bandbredd i förhållande
    # till medaljbredden. Skalan väljs så att den största bilden precis får plats på ytan.
    round_items = [i for i in items if i[0].split("-")[1] in ROUND]
    band_per_medal = float(np.mean([r / m for _, _, r, m in round_items])) if round_items else 1.0

    def rel(item) -> float:  # bildens storlek uttryckt i "medaljbredder"
        name, im, ribbon, medal = item
        unit = medal if name.split("-")[1] in ROUND else ribbon / band_per_medal
        return 1.0 / unit

    target = min(min(HEIGHT / (im.height * rel(i)), (WIDTH - 2 * PAD) / (im.width * rel(i))) for i in items for im in [i[1]])
    for item in items:
        name, im = item[0], item[1]
        s = target * rel(item)
        w, h = round(im.width * s), round(im.height * s)
        # Skala i förmultiplicerad form så att kanterna inte får mörka eller ljusa ränder
        small = im.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
        canvas = Image.new("RGBA", (WIDTH, HEIGHT + 2 * PAD), (0, 0, 0, 0))
        canvas.alpha_composite(small, ((WIDTH - w) // 2, PAD))
        canvas.save(out / f"{name}.webp", "WEBP", quality=90, alpha_quality=100, method=6)
        print(name, (w, h), "medaljbredd", round(item[3] * s), "bandbredd", round(item[2] * s))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main(*sys.argv[1:4])
