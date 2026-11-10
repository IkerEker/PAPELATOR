"""Pliegues y arrugas -> plugin/assets/folds/*.png + folds.json
Cada foto (hoja completa A4, papel gris plegado y desplegado) se convierte en:
  R,G = pendiente (normal) del papel   B = altura   (para sombrear, desplazar la tinta y reiluminar)
  A   = aristas: >128 cresta (hacia el que mira: ahí roza y se gasta la tinta), <128 valle (ahí se acumula suciedad)
La luz de cada foto se estima (la dirección que explica el sombreado con el menor relieve)."""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import fold_lib as F
from common import ASSETS, REPO

IDX = dict(json.load(open('/tmp/claude-0/-home-claude/7670252d-a654-52b9-a1b1-4f0466e0fd73/scratchpad/sheets/npl_index.json')))
CATS = {
  'mitad':            ('Por la mitad', [1, 17, 19, 20, 22]),
  'mitad_gastado':    ('Por la mitad, gastado', [2, 25, 35]),
  'cuatro':           ('En cuatro', [5, 7, 8, 11, 12, 14, 16, 26, 27, 37, 39, 44, 46, 53]),
  'cuatro_gastado':   ('En cuatro, gastado', [28, 38, 41]),
  'seis':             ('En seis', [9, 10, 32, 33, 42, 43, 49]),
  'ocho':             ('En ocho', [31, 34, 45, 48]),
  'cuadricula':       ('Cuadrícula', [0, 3, 4, 13, 18, 23, 30, 47, 50]),
  'acordeon':         ('Acordeón', [24, 15]),
  'casual':           ('Pliegues sueltos', [51, 52, 64, 69, 70, 76, 77, 78, 80]),
  'arrugado_suave':   ('Arrugado suave', [55, 56, 57, 65, 67, 68]),
  'arrugado':         ('Arrugado', [58, 59, 60, 61, 63, 66, 71, 72, 73, 79]),
  'arrugado_plegado': ('Arrugado y plegado', [54, 62, 74, 75]),
}
SCALE = float(os.environ.get('FOLD_SCALE', '0.75'))
OUT = os.path.join(ASSETS, 'folds')
os.makedirs(OUT, exist_ok=True)


def best_light(s):
    ss = s[::3, ::3]
    best = None
    for deg in range(0, 180, 15):
        t = np.radians(deg); L = (np.cos(t), np.sin(t))
        H = F.reconstruct(ss, L=L, lam=0.0015, groove=12)
        v = H.std()
        if best is None or v < best[0]: best = (v, deg)
    return best[1]


def process(i, cid, n):
    path = os.path.join(REPO, IDX[i])
    s = F.shading(path, sig_low=55, sig_grain=0.9)
    deg = best_light(s)
    cands = []
    for d in (deg, deg + 180):
        t = np.radians(d); L = (np.cos(t), np.sin(t))
        H = F.reconstruct(s, L=L, lam=0.0015, groove=12)
        # el signo correcto: las líneas oscuras del pliegue son surcos (la oscuridad acompaña a la altura baja)
        c = np.corrcoef(H.ravel(), ndimage.gaussian_filter(s, 3).ravel())[0, 1]
        cands.append((c, d, H))
    cands.sort(key=lambda z: -z[0])
    _, deg, H = cands[0]
    h, w = H.shape
    Hs = ndimage.zoom(H, SCALE, order=1) * SCALE   # altura en px de la nueva resolución
    Hs = ndimage.gaussian_filter(Hs, 1.1)   # sin el grano fino de la foto (el grano lo pone el papel elegido)
    gy, gx = np.gradient(Hs)
    g = np.hypot(gx, gy)
    gmax = float(np.percentile(g, 99.7)) + 1e-6
    hmax = float(np.percentile(np.abs(Hs - Hs.mean()), 99.8)) + 1e-6
    # curvatura: crestas y valles finos (aristas del pliegue)
    lap = ndimage.laplace(Hs)
    kmax = float(np.percentile(np.abs(lap), 99.6)) + 1e-6   # el motor calcula las aristas con la divergencia de la normal
    # pendientes (normal) a 0.75: canal L = x, canal A = y  (PNG gris+alfa, comprime mucho mejor)
    q = lambda a: np.round(a * 2) / 2
    enc = np.zeros(Hs.shape + (2,), np.uint8)
    enc[..., 0] = np.clip(128 + q(gx / gmax * 127), 0, 255)
    enc[..., 1] = np.clip(128 + q(gy / gmax * 127), 0, 255)
    fn = f'{cid}_{n}.png'
    Image.fromarray(enc, 'LA').save(os.path.join(OUT, fn), optimize=True)
    # altura a 1/4 (sólo se usa para el desplazamiento, que es suave)
    hs = ndimage.zoom(Hs - Hs.mean(), 0.25, order=1)
    Image.fromarray(np.clip(128 + hs / hmax * 127, 0, 255).astype(np.uint8), 'L').save(os.path.join(OUT, f'{cid}_{n}_h.png'), optimize=True)
    # escala física: la foto es una hoja A4 (210 mm de ancho); px de la textura guardada
    mmpp = 210.0 / Hs.shape[1]
    # relieve típico (rugosidad) para que el motor sepa cuánto pesa cada textura
    rough = float(np.std(g))
    return {'file': fn, 'hfile': f'{cid}_{n}_h.png', 'w': int(Hs.shape[1]), 'h': int(Hs.shape[0]), 'gmax': round(gmax, 5), 'hmax': round(hmax, 4), 'kmax': round(kmax / gmax, 5),
            'mmpp': round(mmpp, 5), 'rough': round(rough, 5), 'lightDeg': int(deg % 360), 'src': i,
            'bytes': os.path.getsize(os.path.join(OUT, fn)) + os.path.getsize(os.path.join(OUT, f'{cid}_{n}_h.png'))}


if __name__ == '__main__':
    only = sys.argv[1:] or None
    cat = {}
    for cid, (name, items) in CATS.items():
        if only and cid not in only: continue
        res = []
        for n, i in enumerate(items):
            r = process(i, cid, n); res.append(r)
            print(cid, i, r['w'], r['h'], 'luz', r['lightDeg'], 'rough', r['rough'], 'KB', r['bytes'] // 1024, flush=True)
        cat[cid] = {'name': name, 'items': res}
    json.dump(cat, open(os.path.join(ASSETS, 'folds.json'), 'w'), ensure_ascii=False, indent=1)
