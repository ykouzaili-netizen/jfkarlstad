"""Real-ESRGAN (realesr-animevideov3, SRVGGNetCompact) i ren numpy – utan torch.

Användning: python3 esr.py modell.pth in.png ut.png
Skalar upp 4x. Genomskinlighet: RGB körs med kanterna utfyllda, alfakanalen körs som gråskala.
"""
import pickle
import sys
import zipfile

import numpy as np
from PIL import Image
from numpy.lib.stride_tricks import sliding_window_view


def load_pth(path):
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    prefix = names[0].split("/")[0]
    dtypes = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64}

    class Storage:
        def __init__(self, dtype):
            self.dtype = dtype

    def rebuild(storage, offset, size, stride, *rest):
        arr, = storage
        n = int(np.prod(size)) if size else 1
        if not size:
            return arr[offset:offset + 1].reshape(())
        st = [s * arr.itemsize for s in stride]
        return np.lib.stride_tricks.as_strided(arr[offset:], shape=size, strides=st).copy()

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == "_rebuild_tensor_v2":
                return rebuild
            if name.endswith("Storage"):
                return Storage(dtypes.get(name, np.float32))
            if mod == "collections" and name == "OrderedDict":
                import collections
                return collections.OrderedDict
            return super().find_class(mod, name)

        def persistent_load(self, pid):
            _, stype, key, _loc, _numel = pid
            dt = stype.dtype if isinstance(stype, Storage) else np.float32
            raw = zf.read(f"{prefix}/data/{key}")
            return (np.frombuffer(raw, dtype=dt).astype(np.float32),)

    sd = U(zf.open(f"{prefix}/data.pkl")).load()
    for k in ("params_ema", "params"):
        if k in sd:
            sd = sd[k]
    return sd


def conv3(x, w, b):
    # x: (C,H,W), w: (O,C,3,3)
    xp = np.pad(x, ((0, 0), (1, 1), (1, 1)), mode="constant")
    win = sliding_window_view(xp, (3, 3), axis=(1, 2))  # (C,H,W,3,3)
    out = np.tensordot(w, win, axes=([1, 2, 3], [0, 3, 4]))  # (O,H,W)
    return out + b[:, None, None]


def prelu(x, a):
    return np.where(x >= 0, x, x * a.reshape(-1, 1, 1))


def run(sd, img):
    # img: (3,H,W) i 0..1
    keys = sorted({int(k.split(".")[1]) for k in sd if k.startswith("body.")})
    x = img
    for i in keys:
        w = sd[f"body.{i}.weight"]
        if w.ndim == 4:
            x = conv3(x, w, sd[f"body.{i}.bias"])
        else:
            x = prelu(x, w)
    # pixel shuffle 4x
    c, h, wd = x.shape
    r = 4
    x = x.reshape(3, r, r, h, wd).transpose(0, 3, 1, 4, 2).reshape(3, h * r, wd * r)
    base = np.repeat(np.repeat(img, r, axis=1), r, axis=2)
    return np.clip(x + base, 0, 1)


def fill_edges(rgb, alpha, steps=12):
    """Fyll genomskinliga pixlar med närmaste synliga färg (undviker mörka kanter)."""
    rgb = rgb.copy()
    known = alpha > 0.02
    for _ in range(steps):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                k = np.roll(np.roll(known, dy, 0), dx, 1)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * k[..., None]
                cnt += k
        new = (~known) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        known = known | new
    return rgb


def upscale(sd, src, dst):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    rgb = fill_edges(rgb, alpha)
    out_rgb = run(sd, rgb.transpose(2, 0, 1)).transpose(1, 2, 0)
    out_a = run(sd, np.repeat(alpha[None], 3, 0)).mean(0)
    out = np.dstack([out_rgb, out_a])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(dst)


if __name__ == "__main__":
    sd = load_pth(sys.argv[1])
    upscale(sd, sys.argv[2], sys.argv[3])
