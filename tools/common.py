"""Utilidades de procesado de texturas para PAPELATOR."""
import json, os
import numpy as np
from PIL import Image
import cv2
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(REPO, 'plugin', 'assets')


def load(path, mode='RGB'):
    return np.asarray(Image.open(os.path.join(REPO, path)).convert(mode), dtype=np.float32) / 255.0


def save_png(arr, path, mode=None):
    a = np.clip(np.round(arr * 255.0), 0, 255).astype(np.uint8)
    im = Image.fromarray(a, mode) if mode else Image.fromarray(a)
    full = os.path.join(ASSETS, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    im.save(full, optimize=True)
    return os.path.getsize(full)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def gblur(a, s):
    if a.ndim == 3:
        return np.stack([ndimage.gaussian_filter(a[..., c], s, mode='reflect') for c in range(a.shape[2])], -1)
    return ndimage.gaussian_filter(a, s, mode='reflect')


def flatten_light(rgb, sigma):
    """Quita el degradado de iluminación de la foto (frecuencias muy bajas) conservando el color medio."""
    L = lum(rgb)
    low = gblur(L, sigma)
    ratio = low.mean() / np.maximum(low, 1e-3)
    return np.clip(rgb * ratio[..., None], 0, 1.5)


def autocorr_shift(a, axis, lo, hi):
    """Desplazamiento (lo..hi) a lo largo de 'axis' con la mejor coincidencia de la imagen consigo misma."""
    a = a - a.mean()
    best, bs = -1e9, lo
    n = a.shape[axis]
    for s in range(lo, hi + 1):
        if axis == 1:
            x, y = a[:, s:], a[:, :n - s]
        else:
            x, y = a[s:], a[:n - s]
        c = np.mean(x * y) / (np.std(x) * np.std(y) + 1e-9)
        if c > best:
            best, bs = c, s
    return bs, best


def fundamental_period(profile, minp=3, maxp=None):
    p = profile - profile.mean()
    n = len(p)
    maxp = maxp or n // 3
    ac = np.correlate(p, p, 'full')[n - 1:]
    ac /= ac[0] + 1e-9
    # primer pico local fuerte
    for k in range(minp, maxp):
        if ac[k] > ac[k - 1] and ac[k] >= ac[k + 1] and ac[k] > 0.25:
            # refinamiento parabólico
            y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
            d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-9)
            return k + d, ac[k]
    return None, 0


def _seam_path(E):
    """Camino vertical de mínimo coste (programación dinámica). E: H x O"""
    H, O = E.shape
    C = E.copy()
    back = np.zeros((H, O), np.int32)
    for r in range(1, H):
        prev = C[r - 1]
        left = np.concatenate([[np.inf], prev[:-1]])
        right = np.concatenate([prev[1:], [np.inf]])
        stack = np.stack([left, prev, right])
        idx = np.argmin(stack, 0)
        C[r] += stack[idx, np.arange(O)]
        back[r] = idx - 1
    path = np.zeros(H, np.int32)
    path[-1] = int(np.argmin(C[-1]))
    for r in range(H - 1, 0, -1):
        path[r - 1] = np.clip(path[r] + back[r, path[r]], 0, O - 1)
    return path


def wrap_x(img, s, O, feather=3):
    """Hace la imagen periódica en X con periodo s usando un corte de costura óptimo en una franja de O px."""
    A = img[:, s:s + O]
    B = img[:, 0:O]
    diff = (A - B) ** 2
    E = diff.sum(-1) if diff.ndim == 3 else diff
    E = ndimage.gaussian_filter(E, 1.0)
    path = _seam_path(E)
    out = img[:, :s].copy()
    cols = np.arange(O)[None, :]
    w = np.clip((cols - path[:, None]) / feather + 0.5, 0, 1)  # 0 = usar A, 1 = usar B
    if img.ndim == 3:
        w = w[..., None]
    out[:, :O] = A * (1 - w) + B * w
    return out


def wrap_y(img, t, O, feather=3):
    if img.ndim == 3:
        return wrap_x(img.transpose(1, 0, 2), t, O, feather).transpose(1, 0, 2)
    return wrap_x(img.T, t, O, feather).T


def blend_wrap(img, s, t, Ox, Oy):
    """Periodicidad suave para frecuencias bajas (fundido lineal)."""
    out = img[:t + Oy, :s].copy()
    w = np.linspace(0, 1, Ox)[None, :]
    if img.ndim == 3:
        w = w[..., None]
    out[:, :Ox] = img[:t + Oy, s:s + Ox] * (1 - w) + img[:t + Oy, :Ox] * w
    out2 = out[:t].copy()
    w = np.linspace(0, 1, Oy)[:, None]
    if img.ndim == 3:
        w = w[..., None]
    out2[:Oy] = out[t:t + Oy] * (1 - w) + out[:Oy] * w
    return out2


def make_tileable(img, s, t, O=80, low_sigma=None):
    """img (H,W[,3]) -> tile (t,s[,3]) sin costuras. Altas frecuencias por corte óptimo,
    bajas frecuencias por fundido amplio (para que el moteado tampoco marque la costura)."""
    if low_sigma:
        low = gblur(img, low_sigma)
        high = img - low
        Ol = min(img.shape[1] - s, img.shape[0] - t)
        lowt = blend_wrap(low, s, t, Ol, Ol)
        hight = wrap_y(wrap_x(high, s, O), t, O)
        return lowt + hight
    return wrap_y(wrap_x(img, s, O), t, O)


def seam_score(tile):
    a = lum(tile) if tile.ndim == 3 else tile
    inner = np.mean(np.abs(a[:, 1:] - a[:, :-1]))
    sx = np.mean(np.abs(a[:, 0] - a[:, -1]))
    innery = np.mean(np.abs(a[1:] - a[:-1]))
    sy = np.mean(np.abs(a[0] - a[-1]))
    return sx / inner, sy / innery


def best_shift2(a, axis, lo, hi, cross=8):
    """Busca el periodo (lo..hi) en 'axis' permitiendo un pequeño desfase perpendicular (líneas algo inclinadas)."""
    a = a - a.mean()
    if axis == 0:
        a = a.T
    H, W = a.shape
    best, bs, be = -1e9, lo, 0
    m = cross + 2
    for s in range(lo, hi + 1, 1):
        x = a[m:H - m, s:]
        for e in range(-cross, cross + 1):
            y = a[m + e:H - m + e, :W - s]
            c = np.mean(x * y)
            if c > best:
                best, bs, be = c, s, e
    return bs, be


def wrap_x_shift(img, s, e, O, feather=3):
    """Como wrap_x pero la franja que se envuelve se desplaza e filas (compensa líneas inclinadas)."""
    A = np.roll(img[:, s:s + O], -e, axis=0)
    B = img[:, 0:O]
    diff = (A - B) ** 2
    E = diff.sum(-1) if diff.ndim == 3 else diff
    E = ndimage.gaussian_filter(E, 1.0)
    path = _seam_path(E)
    out = img[:, :s].copy()
    cols = np.arange(O)[None, :]
    w = np.clip((cols - path[:, None]) / feather + 0.5, 0, 1)
    if img.ndim == 3:
        w = w[..., None]
    out[:, :O] = A * (1 - w) + B * w
    return out


def make_tileable_pattern(img_list, cov, O=90):
    """Tile periódico para papeles con patrón: periodo y desfase se buscan en la cobertura de tinta."""
    H, W = cov.shape
    s, ey = best_shift2(cov, 1, W - O - 300, W - O - 4)
    covx = wrap_x_shift(cov, s, ey, O)
    t, ex = best_shift2(covx, 0, H - O - 300, H - O - 4)
    outs = []
    for img in img_list:
        a = wrap_x_shift(img, s, ey, O)
        # envolver en Y con desfase horizontal ex (el tile ya es periódico en X, así que rotar es válido)
        b = a.transpose(1, 0, 2) if a.ndim == 3 else a.T
        b = wrap_x_shift(b, t, ex, O)
        outs.append(b.transpose(1, 0, 2) if b.ndim == 3 else b.T)
    return outs, (s, t, ey, ex)
