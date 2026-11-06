"""Extracción de imperfecciones: fondo blanco -> mapa de multiplicar / relieve / piezas sueltas."""
import numpy as np
from scipy import ndimage
from PIL import Image
from common import *


def estimate_bg(rgb, thr=0.06):
    """Estima el papel de fondo (con su degradado de luz) ignorando la mancha."""
    L = lum(rgb)
    border = np.concatenate([L[:20].ravel(), L[-20:].ravel(), L[:, :20].ravel(), L[:, -20:].ravel()])
    ref = np.median(border)
    # zona de mancha aproximada: lo que se aparta del fondo (más oscuro o más saturado)
    sat = rgb.max(-1) - rgb.min(-1)
    bsat = np.median(np.concatenate([sat[:20].ravel(), sat[-20:].ravel()]))
    dev = np.maximum(ref - L, (sat - bsat) * 1.2)
    dev = np.maximum(dev, np.abs(L - ref) * 0.8)
    mask = ndimage.binary_dilation(dev > thr, iterations=12)
    w = (~mask).astype(np.float32)
    small = 8
    # convolución normalizada a baja resolución (rápido)
    h, wd = L.shape
    def down(a):
        return np.asarray(Image.fromarray(a.astype(np.float32)).resize((wd // small, h // small), Image.BOX), np.float32)
    def up(a):
        return np.asarray(Image.fromarray(a).resize((wd, h), Image.BILINEAR), np.float32)
    ws = down(w)
    bg = []
    for c in range(3):
        num = ndimage.gaussian_filter(down(rgb[..., c] * w), 12)
        den = ndimage.gaussian_filter(ws, 12)
        est = num / np.maximum(den, 1e-4)
        # donde no hay datos, rellena con la media del borde
        fill = np.median(rgb[..., c][~mask]) if (~mask).any() else ref
        est = np.where(den > 0.02, est, fill)
        bg.append(up(est))
    return np.stack(bg, -1), mask


def multiply_map(rgb, soft=0.025):
    """Mapa para multiplicar (1 = sin efecto). Elimina la textura del papel original con un umbral suave."""
    bg, _ = estimate_bg(rgb)
    m = np.clip(rgb / np.maximum(bg, 1e-3), 0, 1.05)
    d = 1 - m.min(-1)
    # umbral suave: las pequeñas variaciones del papel de la foto desaparecen
    k = np.clip((d - soft) / (soft * 1.5), 0, 1)
    k = ndimage.gaussian_filter(k, 0.8)
    out = 1 - (1 - np.clip(m, 0, 1)) * k[..., None]
    return np.clip(out, 0, 1)


def relief_map(rgb, soft=0.012):
    """Relieve horneado en la foto (luz rasante): sombreado relativo centrado en 1."""
    bg, _ = estimate_bg(rgb, thr=0.03)
    s = lum(rgb) / np.maximum(lum(bg), 1e-3)
    d = s - 1
    hp = d - ndimage.gaussian_filter(d, 25)       # sólo el relieve, sin manchas amplias
    mag = np.abs(hp)
    k = np.clip((mag - soft) / soft, 0, 1)
    k = ndimage.gaussian_filter(np.maximum(k, ndimage.maximum_filter(k, 3) * 0.7), 1.0)
    return 1 + hp * k


def bbox(mask, pad=8):
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    return max(0, ys.min() - pad), min(mask.shape[0], ys.max() + pad + 1), max(0, xs.min() - pad), min(mask.shape[1], xs.max() + pad + 1)


def components(mask, min_area=6, pad=3):
    lab, n = ndimage.label(mask)
    objs = ndimage.find_objects(lab)
    out = []
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        area = int((lab[sl] == i + 1).sum())
        if area < min_area:
            continue
        y0, y1 = max(0, sl[0].start - pad), min(mask.shape[0], sl[0].stop + pad)
        x0, x1 = max(0, sl[1].start - pad), min(mask.shape[1], sl[1].stop + pad)
        out.append((y0, y1, x0, x1, i + 1, area))
    return lab, out


def pack(sprites, maxw=2048):
    """Empaquetado en estanterías. sprites: lista de arrays (h,w,c). Devuelve atlas y rects."""
    order = sorted(range(len(sprites)), key=lambda i: -sprites[i].shape[0])
    x = y = rowh = 0
    rects = [None] * len(sprites)
    for i in order:
        h, w = sprites[i].shape[:2]
        if x + w > maxw:
            x = 0; y += rowh + 2; rowh = 0
        rects[i] = (x, y, w, h)
        x += w + 2; rowh = max(rowh, h)
    H = y + rowh
    c = sprites[0].shape[2] if sprites[0].ndim == 3 else 1
    atlas = np.ones((H, maxw, c) if c > 1 else (H, maxw), np.float32) * (1.0 if c > 1 else 0.5)
    for i, s in enumerate(sprites):
        x0, y0, w, h = rects[i]
        atlas[y0:y0 + h, x0:x0 + w] = s
    return atlas, rects
