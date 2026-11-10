"""Imperfecciones sutiles nuevas (NUEVAS/TEXTURA_IMPERFECCIONES) -> catálogo.
Grapas (marca y agujeros), huella de clip, marcas de pinza, medias lunas y pequeñas arrugas de manipulación."""
import json, os
import numpy as np
from scipy import ndimage
from PIL import Image
from imperf_lib import *

IDX = dict(json.load(open('/tmp/claude-0/-home-claude/7670252d-a654-52b9-a1b1-4f0466e0fd73/scratchpad/sheets/nimp_index.json')))
# size = dimensión mayor real en mm; place = regla física de colocación
NEW = {
 'grapa_marca':  dict(name='Marca de grapa', kind='stamp', mode='relief', items=[0, 1, 13, 30, 31], size=[13, 15], place='staple', opacity=0.55, maxd=640, aniso=0.03, group='grapa'),
 'grapa_agujero':dict(name='Agujeros de grapa', kind='stamp', mode='hole', items=[2, 3, 4, 5, 14, 15, 6, 7], size=[13, 16], place='staple', opacity=0.6, maxd=640, aniso=0.03, group='grapa'),
 'clip_huella':  dict(name='Huella de clip', kind='stamp', mode='relief', items=[8, 9, 11, 21, 33, 16], size=[34, 40], place='clip', opacity=0.5, maxd=640, aniso=0.04),
 'pinza':        dict(name='Marcas de pinza', kind='stamp', mode='relief', items=[10, 12, 22, 27, 28], size=[22, 32], place='binder', opacity=0.5, maxd=640, aniso=0.04),
 'media_luna':   dict(name='Media luna (golpe de uña)', kind='stamp', mode='relief', items=[17, 18, 19, 24, 25, 26], size=[7, 20], place='handled', opacity=0.5, maxd=640, aniso=0.15),
 'arruguita':    dict(name='Arruguita de manipulación', kind='stamp', mode='relief', items=[20, 29, 34], size=[16, 30], place='handled', opacity=0.5, maxd=640, aniso=0.15),
}

def crop_resize(arr, mask, maxd, fill, pad=14):
    b = bbox(mask, pad)
    if b is None: return None
    y0, y1, x0, x1 = b
    c = arr[y0:y1, x0:x1]
    h, w = c.shape[:2]
    f = min(1.0, maxd / max(h, w))
    if f < 1:
        if c.ndim == 3:
            im = Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8)).resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
            c = np.asarray(im, np.float32) / 255
        else:
            im = Image.fromarray(c.astype(np.float32), 'F').resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
            c = np.asarray(im, np.float32)
    hh, ww = c.shape[:2]; e = 8
    ry = np.clip(np.minimum(np.arange(hh), hh - 1 - np.arange(hh)) / e, 0, 1)
    rx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / e, 0, 1)
    edge = np.minimum(ry[:, None], rx[None, :])
    return fill - (fill - c) * (edge[..., None] if c.ndim == 3 else edge)

def big_mask(d, base):
    """Máscara adaptativa: umbral relativo a la señal real, se queda con los componentes grandes."""
    thr = max(base, 0.22 * np.percentile(d, 99.9))
    m = ndimage.binary_opening(d > thr, iterations=1)
    m = ndimage.binary_closing(m, iterations=5)
    lab, n = ndimage.label(m)
    if n == 0: return m
    sz = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.where(sz >= 0.04 * sz.max())[0])
    return ndimage.binary_dilation(keep, iterations=6)

cat = json.load(open(os.path.join(ASSETS, 'imperf.json')))
for cid, C in NEW.items():
    items = []
    for n, i in enumerate(C['items']):
        rgb = load(IDX[i])
        if C['mode'] == 'hole':
            m = multiply_map(rgb, 0.012)
            r = relief_map(rgb, 0.006)
            m = np.clip(m * (1 + np.clip(r - 1, -0.3, 0.3))[..., None], 0, 1)
            c = crop_resize(m, big_mask(1 - m.min(-1), 0.015), C['maxd'], 1.0)
            fn = f'{cid}_{len(items)}.png'; save_png(c, 'imperf/' + fn)
        else:
            r = relief_map(rgb, 0.006)
            c = crop_resize(r, big_mask(np.abs(ndimage.gaussian_filter(r, 1.5) - 1), 0.006), C['maxd'], 1.0)
            fn = f'{cid}_{len(items)}.png'; save_png(np.clip(0.5 + (c - 1) * 4, 0, 1), 'imperf/' + fn, 'L')
        items.append({'file': fn, 'w': int(c.shape[1]), 'h': int(c.shape[0]), 'src': i, 'mask': False})
        print(cid, i, c.shape[:2])
    e = {k: v for k, v in C.items() if k != 'items'}
    e['items'] = items
    if e['mode'] == 'hole': e['mode'] = 'multiply'
    e.update(erode=0.1, cellMm=2, absorb=0, cockle=0)
    cat[cid] = e
json.dump(cat, open(os.path.join(ASSETS, 'imperf.json'), 'w'), ensure_ascii=False, indent=1)
