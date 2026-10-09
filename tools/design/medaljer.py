"""Gör medaljbilderna lika stora och skarpare.

  python3 tools/design/medaljer.py <modell.pth> <källmapp> <utmapp>

Källmappen innehåller medalj-01.png … medalj-NN.png (styrelsens original, genomskinlig bakgrund).
För varje medalj:
  1. skalas bilden upp 4x med Real-ESRGAN (realesr-animevideov3, ritad stil) – ren numpy, se esr.py,
  2. beskärs till själva medaljen,
  3. skalas till samma höjd (bandets överkant till medaljens nederkant) – då ligger banden och medaljerna
     i jämnhöjd när de står bredvid varandra,
  4. placeras centrerat på en lika stor yta för alla,
och sparas som WebP med genomskinlighet i dubbel upplösning (skarpt även på mobil/retina).

Modellen: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import esr  # noqa: E402

HEIGHT = 860  # medaljens höjd i px i den färdiga bilden (ungefär tre gånger visningsstorleken)
PAD = 10


def main(model: str, src: str, dst: str) -> None:
    sd = esr.load_pth(model)
    out = Path(dst)
    out.mkdir(parents=True, exist_ok=True)
    items = []
    for f in sorted(Path(src).glob("medalj-*.png")):
        tmp = out / (f.stem + ".x4.png")
        esr.upscale(sd, str(f), str(tmp))
        im = Image.open(tmp).convert("RGBA")
        tmp.unlink()
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
        im = im.resize((round(im.width * HEIGHT / im.height), HEIGHT), Image.LANCZOS)
        items.append((f.stem, im))
        print(f.stem, im.size)
    w = max(i.width for _, i in items) + 2 * PAD
    h = max(i.height for _, i in items) + 2 * PAD
    for name, im in items:
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((w - im.width) // 2, PAD))
        canvas.save(out / f"{name}.webp", "WEBP", quality=90, method=6)
    print("yta", w, h)


if __name__ == "__main__":
    main(*sys.argv[1:4])
