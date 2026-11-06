"""Procesa imperfecciones/ -> plugin/assets/imperf/ + imperf.json
Cada categoría sabe cómo se extrae (mancha entera, relieve, piezas sueltas, renglones),
cómo se funde con el papel y dónde puede aparecer."""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image
from imperf_lib import *

IDX = dict(json.load(open('/tmp/claude-0/-home-claude/7670252d-a654-52b9-a1b1-4f0466e0fd73/scratchpad/sheets/imp_index.json')))
def src(i): return IDX[i]

# mode: multiply (color), relief (surco/relieve), grease (oscurece leve + translúcido + brillo),
#       wax (relieve + translúcido + brillo), erase (relieve + aclara + quita tinta)
# kind: stamp (entera) | sprites (piezas sueltas) | lines (renglones)
# place: any | edge | corner | clip | top_right | lower | cluster | uniform | text
CATS = {
 'cafe':        dict(name='Cerco de café', kind='stamp', mode='multiply', items=[0, 4, 5, 6, 23, 43, 44], size=[70, 92], place='any', opacity=0.45, maxd=900),
 'salp_cafe':   dict(name='Salpicaduras de café', kind='sprites', mode='multiply', items=[1, 7, 19, 40, 46, 47, 56, 21, 22], src_mm=150, place='cluster', opacity=0.55, min_area=10),
 'salp_tinta':  dict(name='Salpicaduras de tinta', kind='sprites', mode='multiply', items=[14, 18, 29, 36, 38, 61], src_mm=170, place='cluster', opacity=0.8, min_area=6),
 'agua':        dict(name='Mancha de agua seca', kind='stamp', mode='multiply', items=[2, 25, 26, 50, 53, 62, 48, 37], size=[45, 95], place='any', opacity=0.55, maxd=800),
 'humedad':     dict(name='Mancha de humedad', kind='stamp', mode='multiply', items=[3, 24, 27, 31, 32, 33], size=[60, 130], place='any', opacity=0.3, maxd=640),
 'grasa':       dict(name='Mancha de grasa', kind='stamp', mode='grease', items=[16, 28, 34, 51], size=[25, 55], place='any', opacity=0.5, maxd=600),
 'sangrado':    dict(name='Sangrado de rotulador', kind='stamp', mode='multiply', items=[12, 15, 49, 55, 60, 63], size=[14, 34], place='any', opacity=0.5, maxd=520),
 'barro':       dict(name='Gotas de barro', kind='sprites', mode='multiply', items=[17], src_mm=160, place='lower', opacity=0.6, min_area=4),
 'foxing':      dict(name='Foxing (óxido y moho)', kind='sprites', mode='multiply', items=[7, 19, 40, 46, 47, 56, 1], src_mm=110, place='foxing', opacity=0.55, min_area=4, max_area=900),
 'uv':          dict(name='Amarilleo por luz', kind='stamp', mode='multiply', items=[81, 82, 85, 86, 107, 123], size=[150, 260], place='any', opacity=0.35, maxd=420),
 'clip':        dict(name='Óxido de clip', kind='stamp', mode='multiply', items=[13, 35, 42, 54, 57], size=[44, 50], place='clip', opacity=0.6, maxd=700),
 'acida':       dict(name='Migración ácida', kind='stamp', mode='multiply', items=[8, 9, 10, 41, 52, 58, 59], size=[70, 130], place='acid', opacity=0.32, maxd=700),
 'huella_grasa':dict(name='Huellas grasientas', kind='stamp', mode='grease', items=[11, 30, 39], size=[18, 24], place='edge', opacity=0.6, maxd=400),
 'grafito':     dict(name='Borrón de grafito', kind='stamp', mode='multiply', items=[78, 90, 91, 92, 93, 94, 95, 96, 134], size=[45, 90], place='lower', opacity=0.35, maxd=640),
 'escritura':   dict(name='Hendiduras de escritura', kind='lines', mode='relief', items=[73, 110, 111, 128, 129, 130], pitch_mm=9.0, place='text', opacity=0.8),
 'mecano':      dict(name='Hendiduras de máquina', kind='lines', mode='relief', items=[74, 75, 76, 109, 122, 72], pitch_mm=8.5, place='text', opacity=0.8),
 'adhesivo':    dict(name='Restos de adhesivo', kind='stamp', mode='multiply', items=[83, 84, 114, 112, 113, 115, 116, 117, 118], size=[38, 60], place='tape', opacity=0.5, maxd=600),
 'quemadura':   dict(name='Quemadura de ceniza', kind='stamp', mode='multiply', items=[79, 80, 97, 98, 99, 100, 101, 102, 108], size=[5, 16], place='any', opacity=0.7, maxd=420),
 'goma':        dict(name='Raspadura de goma', kind='stamp', mode='erase', items=[125, 126, 127, 136, 139, 140], size=[16, 38], place='any', opacity=0.8, maxd=600),
 'fibras':      dict(name='Fibras incrustadas', kind='sprites', mode='multiply', items=[124, 131, 132, 133, 137], src_mm=70, place='uniform', opacity=0.7, min_area=8),
 'nodulos':     dict(name='Grumos de celulosa', kind='sprites', mode='relief', items=[135, 138, 143], src_mm=60, place='uniform', opacity=0.8, min_area=10),
 'descamacion': dict(name='Descamación', kind='sprites', mode='relief', items=[145, 144], src_mm=70, place='uniform', opacity=0.8, min_area=3),
 'polvo':       dict(name='Polvo incrustado', kind='sprites', mode='multiply', items=[142, 146], src_mm=70, place='uniform', opacity=0.7, min_area=2),
 'sello_seco':  dict(name='Sello en seco', kind='stamp', mode='relief', items=[119, 120, 121], size=[42, 48], place='seal', opacity=0.85, maxd=700),
 'cera':        dict(name='Cera de vela', kind='stamp', mode='wax', items=[87, 88, 89], size=[12, 26], place='any', opacity=0.7, maxd=420),
 'huella_tinta':dict(name='Huella de tinta', kind='stamp', mode='multiply', items=[65, 66, 67, 68, 69, 70, 71], size=[16, 22], place='edge', opacity=0.28, maxd=420),
 'matasellos':  dict(name='Matasellos corrido', kind='stamp', mode='multiply', items=[104, 105, 106, 103, 77], size=[50, 75], place='top_right', opacity=0.45, maxd=640),
 'calor':       dict(name='Decoloración por calor', kind='stamp', mode='multiply', items=[81, 85, 86, 107], size=[90, 170], place='any', opacity=0.3, maxd=420),
}
OUT = os.path.join(ASSETS, 'imperf')


def crop_resize(arr, mask, maxd, fill):
    b = bbox(mask, 10)
    if b is None:
        return None
    y0, y1, x0, x1 = b
    c = arr[y0:y1, x0:x1]
    h, w = c.shape[:2]
    f = min(1.0, maxd / max(h, w))
    if f < 1:
        mode = 'RGB' if c.ndim == 3 else 'F'
        im = Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8)) if c.ndim == 3 else Image.fromarray(c.astype(np.float32), 'F')
        im = im.resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
        c = np.asarray(im, np.float32) / (255 if c.ndim == 3 else 1)
    # bordes a 1 / neutro suavemente (que nunca se vea el recorte)
    hh, ww = c.shape[:2]
    e = 6
    ry = np.clip(np.minimum(np.arange(hh), hh - 1 - np.arange(hh)) / e, 0, 1)
    rx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / e, 0, 1)
    edge = np.minimum(ry[:, None], rx[None, :])
    if c.ndim == 3:
        c = fill - (fill - c) * edge[..., None]
    else:
        c = fill - (fill - c) * edge
    return c


def enc_relief(r, gain=4.0):
    return np.clip(0.5 + (r - 1) * gain, 0, 1)


def build_stamp(cid, C):
    items = []
    for n, i in enumerate(C['items']):
        rgb = load(src(i))
        if C['mode'] in ('multiply', 'grease'):
            m = multiply_map(rgb, 0.03 if C['mode'] == 'multiply' else 0.012)
            mask = m.min(-1) < 0.985
            c = crop_resize(m, mask, C['maxd'], 1.0)
            if c is None: continue
            fn = f'{cid}_{n}.png'
            save_png(c, 'imperf/' + fn)
        else:
            r = relief_map(rgb)
            mask = np.abs(r - 1) > 0.01
            mask = ndimage.binary_closing(mask, iterations=6)
            c = crop_resize(r, mask, C['maxd'], 1.0)
            if c is None: continue
            fn = f'{cid}_{n}.png'
            save_png(enc_relief(c), 'imperf/' + fn, 'L')
            if C['mode'] in ('erase', 'wax'):
                # máscara de la zona afectada (para aclarar / quitar tinta / translucidez)
                L = lum(rgb)
                bg, _ = estimate_bg(rgb, 0.03)
                area = ndimage.binary_closing(np.abs(r - 1) > 0.006, iterations=10)
                area = ndimage.binary_fill_holes(area)
                area = ndimage.gaussian_filter(area.astype(np.float32), 3)
                ca = crop_resize(area, mask, C['maxd'], 0.0)
                if ca is not None and ca.shape[:2] == c.shape[:2]:
                    save_png(np.clip(ca, 0, 1), 'imperf/' + f'{cid}_{n}_m.png', 'L')
        items.append({'file': fn, 'w': int(c.shape[1]), 'h': int(c.shape[0]), 'src': i,
                      'mask': os.path.exists(os.path.join(OUT, f'{cid}_{n}_m.png'))})
    return {'items': items}


def build_sprites(cid, C):
    sprites, meta = [], []
    for i in C['items']:
        rgb = load(src(i))
        H, W = rgb.shape[:2]
        mmpp = C['src_mm'] / W
        if C['mode'] == 'multiply':
            m = multiply_map(rgb, 0.03)
            mask = m.min(-1) < 0.95
            arr, fill = m, 1.0
        else:
            r = relief_map(rgb, 0.01)
            mask = np.abs(r - 1) > 0.02
            arr, fill = r, 1.0
        lab, comps = components(mask, C.get('min_area', 6), pad=3)
        for (y0, y1, x0, x1, li, area) in comps:
            if area > C.get('max_area', 1e9):
                continue
            if (y1 - y0) > 400 or (x1 - x0) > 400:
                continue
            sub = arr[y0:y1, x0:x1].copy()
            own = ndimage.binary_dilation(lab[y0:y1, x0:x1] == li, iterations=2)
            soft = ndimage.gaussian_filter(own.astype(np.float32), 1.0)
            if sub.ndim == 3:
                sub = fill - (fill - sub) * soft[..., None]
            else:
                sub = fill - (fill - sub) * soft
            sprites.append(sub)
            dark = float(1 - (sub.min(-1) if sub.ndim == 3 else sub).min())
            meta.append({'mm': round(mmpp, 5), 'area': int(area), 'dark': round(dark, 3)})
    # limitar número de piezas (las mejores = más grandes y variadas)
    if len(sprites) > 420:
        order = np.argsort([-m['area'] for m in meta])
        keep = sorted(list(order[:300]) + list(np.random.RandomState(1).choice(order[300:], 120, replace=False)))
        sprites = [sprites[k] for k in keep]; meta = [meta[k] for k in keep]
    if not sprites:
        return {'sprites': []}
    if C['mode'] == 'multiply':
        atlas, rects = pack(sprites, 2048)
        save_png(np.clip(atlas, 0, 1), f'imperf/{cid}_atlas.png')
    else:
        atlas, rects = pack([s for s in sprites], 2048)
        save_png(enc_relief(atlas), f'imperf/{cid}_atlas.png', 'L')
    for m, r in zip(meta, rects):
        m['r'] = list(map(int, r))
    return {'atlas': f'{cid}_atlas.png', 'sprites': meta}


def build_lines(cid, C):
    sprites, meta = [], []
    pitches = []
    for i in C['items']:
        rgb = load(src(i))
        r = relief_map(rgb, 0.01)
        mag = np.abs(r - 1) > 0.02
        # renglones: dilatar mucho en horizontal
        rows = ndimage.binary_dilation(mag, structure=np.ones((5, 61)))
        rows = ndimage.binary_dilation(rows, structure=np.ones((3, 3)))
        lab, comps = components(rows, 400, pad=4)
        comps = [c for c in comps if (c[3] - c[2]) > 120 and (c[1] - c[0]) < 220]
        centers = sorted([(c[0] + c[1]) / 2 for c in comps])
        if len(centers) > 2:
            pitches.append(np.median(np.diff(centers)))
        for (y0, y1, x0, x1, li, area) in comps:
            sub = r[y0:y1, x0:x1].copy()
            own = ndimage.gaussian_filter((lab[y0:y1, x0:x1] == li).astype(np.float32), 1.5)
            sub = 1 - (1 - sub) * own
            sprites.append(sub)
            meta.append({'src': i})
    pitch = float(np.median(pitches)) if pitches else 100.0
    mmpp = C['pitch_mm'] / pitch
    atlas, rects = pack(sprites, 2048)
    save_png(enc_relief(atlas), f'imperf/{cid}_atlas.png', 'L')
    for m, rr in zip(meta, rects):
        m['r'] = list(map(int, rr)); m['mm'] = round(mmpp, 5)
    return {'atlas': f'{cid}_atlas.png', 'sprites': meta, 'pitchMm': C['pitch_mm']}


if __name__ == '__main__':
    only = sys.argv[1:] or None
    catp = os.path.join(ASSETS, 'imperf.json')
    cat = json.load(open(catp)) if os.path.exists(catp) else {}
    for cid, C in CATS.items():
        if only and cid not in only: continue
        if C['kind'] == 'stamp': res = build_stamp(cid, C)
        elif C['kind'] == 'sprites': res = build_sprites(cid, C)
        else: res = build_lines(cid, C)
        entry = {k: v for k, v in C.items() if k not in ('items',)}
        entry.update(res)
        cat[cid] = entry
        n = len(res.get('items', res.get('sprites', [])))
        print(cid, C['kind'], C['mode'], n)
        json.dump(cat, open(catp, 'w'), ensure_ascii=False, indent=1)
