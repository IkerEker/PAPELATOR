"""SOBREPONER: vidrios, cristales y plásticos que se ponen delante del documento.
Fuentes: SOBREPONER/*.png (fotos sobre negro, 1254x1254). Salida: plugin/assets/overlays/ + overlays.json

Para cada textura se generan, ya tileables y alineados entre sí:
  {id}_r.png  reflejos (lo que brilla sobre el negro de la foto: la luz que devuelve el vidrio/plástico)
  {id}_n.png  pendientes del relieve (gris+alfa: x, y). Es el MAPA DE DESPLAZAMIENTO: lo de detrás se ve desviado
              en proporción a la pendiente y a la distancia entre el vidrio y el papel
  {id}_m.png  sólo vidrio armado: la malla metálica (opaca, va dentro del vidrio)

El relieve se obtiene según lo que es cada vidrio:
  acanalado  cañas cilíndricas: se localizan las uniones entre cañas y cada caña es un semicilindro exacto
             (así el desplazamiento es limpio: lente cilíndrica que comprime e invierte la imagen al alejarla)
  ondulado / martillado / plástico   relieve suave a partir del brillo (las zonas convexas devuelven la luz)
  armado     el vidrio (martillado/ondulado) sin la malla + la malla aparte
  lluvia     cada gota es una cúpula (lente): forma a partir del borde brillante, rellena
  esmerilado casi sin relieve: lo que hace es difundir (desenfoque que crece con la distancia)"""
import json, os, sys
import numpy as np
import cv2
from scipy import ndimage, signal
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, REPO, save_png, make_tileable

SRC = os.path.join(REPO, 'SOBREPONER')
OUT = os.path.join(ASSETS, 'overlays')
MAXD = 1024

# familia, tamaño real, parámetros por defecto
FAM = {
 'acanalado':  dict(name='Acanalado', refr=0.7, refl=0.6, frost=0.12, tint=(0.955, 0.975, 0.965), dirt=True),
 'ondulado':   dict(name='Ondulado', refr=0.7, refl=0.55, frost=0.08, tint=(0.96, 0.975, 0.97), dirt=True, mm=200),
 'martillado': dict(name='Martillado', refr=0.55, refl=0.55, frost=0.2, tint=(0.955, 0.972, 0.965), dirt=True, mm=120),
 'armado':     dict(name='Armado', refr=0.55, refl=0.5, frost=0.18, tint=(0.94, 0.965, 0.955), dirt=True),
 'esmerilado': dict(name='Esmerilado', refr=0.06, refl=0.12, frost=1.0, tint=(0.97, 0.975, 0.975), dirt=True, mm=80),
 'lluvia':     dict(name='Lluvia', refr=0.45, refl=0.85, frost=0.0, tint=(0.97, 0.975, 0.98), dirt=False, mm=150),
 'plastico':   dict(name='Plástico', refr=0.3, refl=1.0, frost=0.04, tint=(0.975, 0.975, 0.975), dirt=True, mm=260),
}
ITEMS = {
 'acanalado': ['Vidrio acanalado en blanco y negro.png', 'Vidrio acanalado negro y plateado.png', 'Cristal acanalado negro brillante.png',
               'Textura abstracta de vidrio acanalado oscuro.png', 'Rayas verticales de vidrio texturizado.png', 'Vidrio estriado vertical translúcido.png',
               'Textura de vidrio acanalado en gris.png', 'Textura de vidrio estriado translúcido.png'],
 'ondulado':  ['Textura de vidrio ondulado en blanco y negro.png', 'Vidrio ondulado en blanco y negro.png', 'Ondas de vidrio líquido en blanco y negro.png',
               'Ondas de vidrio negro brillante.png', 'Ondulaciones de vidrio brillante.png', 'Textura ondulada de vidrio translúcido.png'],
 'martillado': ['Textura de vidrio martillado brillante.png', 'Textura de vidrio martillado oscuro.png', 'Vidrio martillado en relieve.png',
                'Cristal martillado en sombras-1.png', 'Textura abstracta de vidrio ondulado.png', 'Textura abstracta de vidrio rugoso-2.png'],
 'armado':    ['Textura de vidrio armado con malla metálica.png', 'Vidrio armado con rejilla metálica.png', 'Vidrio armado con reflejos ondulados.png',
               'Vidrio armado oscuro con textura martillada.png', 'Vidrio armado oscuro con textura ondulada.png', 'Cristal armado oscuro con reflejos metálicos.png',
               'Textura de vidrio armado oxidado.png'],
 'esmerilado': ['Textura de vidrio esmerilado oscuro.png', 'Textura de vidrio esmerilado oscuro (1).png', 'Textura granulada negra mate.png'],
 'lluvia':    ['Gotas de lluvia sobre cristal negro.png', 'Gotas de lluvia sobre cristal negro (1).png', 'Gotas de lluvia sobre cristal negro (2).png',
               'Gotas de lluvia sobre cristal negro (3).png'],
 'plastico':  ['Plástico transparente arrugado sobre fondo negro.png', 'Plástico transparente arrugado sobre negro brillante.png', 'Pliegues brillantes de plástico transparente.png',
               'Textura abstracta de plástico transparente arrugado.png', 'Plástico translúcido sobre fondo negro.png', 'Textura de plástico arrugado brillante.png',
               'Pliegues Brillantes sobre Negro.png', 'Plástico arrugado sobre negro reluciente.png', 'Brillo arrugado sobre negro.png',
               'Textura de Plástico Arrugado sobre Vidrio Negro.png', 'Textura de plástico brillante sobre fondo negro.png', 'Textura de plástico brillante sobre negro.png',
               'Plástico negro arrugado y brillante.png', 'Textura abstracta de plástico negro brillante.png', 'Textura negra con plástico arrugado.png'],
}


def lumf(path):
    a = np.asarray(Image.open(path).convert('RGB'), np.float64) / 255
    return a @ np.array([0.2126, 0.7152, 0.0722])


def norm01(a, lo=1, hi=99.8):
    l, h = np.percentile(a, [lo, hi])
    return np.clip((a - l) / max(h - l, 1e-6), 0, 1)


def reflections(L, bright_bg=False):
    """Lo que el vidrio devuelve de luz. En fotos sobre negro es el propio brillo; en las que tienen fondo claro
    (vidrio delante de una pared clara) sólo los brillos por encima de su entorno."""
    if bright_bg:
        R = L - cv2.GaussianBlur(L, (0, 0), 18)
        return np.clip(R / max(np.percentile(R, 99.7), 1e-6), 0, 1) ** 1.3
    R = norm01(L, 2, 99.85)
    return R ** 1.35


def flutes(L):
    """Uniones entre cañas (mínimos del perfil horizontal) y relieve semicilíndrico exacto."""
    prof = cv2.GaussianBlur(L, (0, 0), 1.2).mean(0)
    p = prof - ndimage.uniform_filter1d(prof, 61)
    # periodo medio por autocorrelación
    ac = np.correlate(p - p.mean(), p - p.mean(), 'full')[len(p) - 1:]
    lo = 12
    per = lo + int(np.argmax(ac[lo:200]))
    mins, _ = signal.find_peaks(-ndimage.gaussian_filter1d(p, per * 0.12), distance=max(6, int(per * 0.6)))
    return mins, per


def flute_height(w, h, bounds):
    Hx = np.zeros(w)
    for a, b in zip(bounds[:-1], bounds[1:]):
        x = np.arange(a, b)
        u = (x - a + 0.5) / (b - a)
        Hx[a:b] = np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1)) * (b - a) / 2   # semicírculo de radio = media caña
    return np.repeat(Hx[None, :], h, 0)


def grid_lines(M, axis):
    prof = M.mean(axis)
    pk, _ = signal.find_peaks(ndimage.gaussian_filter1d(prof, 1.5), distance=40, prominence=prof.std() * 0.8)
    return pk


def drop_domes(L):
    """Gotas: borde brillante → máscara rellena → cúpula (distancia al borde, perfil esférico)."""
    # el cuerpo de la gota es más claro que el negro del fondo; el borde brillante cierra el contorno
    body = cv2.GaussianBlur(L, (0, 0), 1.5) > 0.07
    filled = ndimage.binary_fill_holes(ndimage.binary_closing(body, iterations=2))
    filled = ndimage.binary_opening(filled, iterations=2)
    d = ndimage.distance_transform_edt(filled)
    lab, n = ndimage.label(filled)
    H = np.zeros_like(L)
    if n:
        mx = ndimage.maximum(d, lab, np.arange(1, n + 1))
        r = np.zeros(n + 1); r[1:] = np.maximum(mx, 1)
        R = r[lab]
        # perfil de cúpula: h = sqrt(R² - (R-d)²)
        H = np.where(filled, np.sqrt(np.clip(R ** 2 - (R - d) ** 2, 0, None)), 0)
    return cv2.GaussianBlur(H.astype(np.float32), (0, 0), 2.4)


def tile_stack(stack, x0=None, x1=None, y0=None, y1=None, O=100):
    """Hace tileables a la vez todos los mapas (mismo corte para todos)."""
    hh, ww = stack.shape[:2]
    if x0 is not None:
        stack = stack[:, x0:x1 + O]; s = x1 - x0
    else:
        s = ww - O - 4
    if y0 is not None:
        stack = stack[y0:y1 + O]; t = y1 - y0
    else:
        t = stack.shape[0] - O - 4
    return make_tileable(stack, s, t, O)


def slopes(H, sig=1.2):
    Hs = cv2.GaussianBlur(H.astype(np.float32), (0, 0), sig)
    gy, gx = np.gradient(Hs)
    g = np.hypot(gx, gy)
    gm = float(np.percentile(g, 99.5)) + 1e-9
    return gx / gm, gy / gm


def process(fam, n, fn):
    L = lumf(os.path.join(SRC, fn))
    hh, ww = L.shape
    bright = L.mean() > 0.3
    R = reflections(L, bright)
    M = None
    info = {}
    if fam == 'acanalado':
        bounds, per = flutes(L)
        H = flute_height(ww, hh, bounds)
        H += 0.06 * per * cv2.GaussianBlur(norm01(L), (0, 0), 3)        # cañas no perfectas
        O = 100
        cand = [b for b in bounds if b <= ww - O - 2]
        x0 = int(bounds[1]); x1 = int(cand[-1])
        nfl = int(np.sum((bounds >= x0) & (bounds < x1)))
        st = tile_stack(np.dstack([R, H, np.zeros_like(R)]), x0=x0, x1=x1, O=O)
        info['tileMm'] = [round(nfl * 10.0, 1), round(nfl * 10.0 * st.shape[0] / st.shape[1], 1)]   # cañas de 10 mm
        info['flutes'] = nfl
    elif fam == 'armado':
        th = L - cv2.morphologyEx(L, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
        Mraw = np.clip(th / max(np.percentile(th, 99.5), 1e-6), 0, 1)
        lines_x = grid_lines(Mraw, 0); lines_y = grid_lines(Mraw, 1)
        cell = float(np.median(np.diff(lines_x))) if len(lines_x) > 2 else 100
        # el vidrio sin la malla (se rellena el hueco del alambre) → relieve; el alambre no desvía la imagen
        wire = np.zeros(L.shape, np.uint8)
        for x in lines_x: wire[:, max(0, x - 5):x + 6] = 1
        for y in lines_y: wire[max(0, y - 5):y + 6, :] = 1
        glass = cv2.inpaint((L * 255).astype(np.uint8), wire, 7, cv2.INPAINT_TELEA).astype(np.float64) / 255
        H = cv2.GaussianBlur(norm01(glass), (0, 0), 13) * 14
        # color del alambre (acero o, en el oxidado, óxido)
        rgb = np.asarray(Image.open(os.path.join(SRC, fn)).convert('RGB'), np.float64) / 255
        on = (wire > 0) & (Mraw > 0.35)
        info['meshColor'] = [round(float(v), 3) for v in (rgb[on].mean(0) / max(rgb[on].mean(), 1e-3) if on.any() else np.ones(3))]
        O = 100
        cx = [x for x in lines_x if x <= ww - O - 2]; cy = [y for y in lines_y if y <= hh - O - 2]
        x0, x1 = int(lines_x[1]), int(cx[-1]); y0, y1 = int(lines_y[1]), int(cy[-1])
        st = tile_stack(np.dstack([R, H, np.zeros_like(R)]), x0=x0, x1=x1, y0=y0, y1=y1, O=O)
        # malla limpia en el espacio del tile: alambres de ~0,6 mm en las posiciones reales, con su leve ondulación
        tw_, th_ = st.shape[1], st.shape[0]
        Mi = np.zeros((th_ * 3, tw_ * 3), np.float32)
        rng = np.random.default_rng(len(fn))
        wpx = max(2, int(round(0.6 / 12.5 * cell * 3)))
        for x in [lx - x0 for lx in lines_x if x0 <= lx < x1]:
            ys = np.arange(0, th_ * 3, 6); xs = x * 3 + np.cumsum(rng.normal(0, 0.25, len(ys))).clip(-3, 3)
            cv2.polylines(Mi, [np.stack([xs, ys], 1).astype(np.int32).reshape(-1, 1, 2)], False, 1.0, wpx, cv2.LINE_AA)
        for y in [ly - y0 for ly in lines_y if y0 <= ly < y1]:
            xs = np.arange(0, tw_ * 3, 6); ys = y * 3 + np.cumsum(rng.normal(0, 0.25, len(xs))).clip(-3, 3)
            cv2.polylines(Mi, [np.stack([xs, ys], 1).astype(np.int32).reshape(-1, 1, 2)], False, 1.0, wpx, cv2.LINE_AA)
        st[..., 2] = cv2.resize(Mi, (tw_, th_), interpolation=cv2.INTER_AREA)
        ncx = round((x1 - x0) / cell); ncy = round((y1 - y0) / cell)
        info['tileMm'] = [round(ncx * 12.5, 1), round(ncy * 12.5, 1)]   # malla de 12,5 mm (vidrio armado estándar)
        info['cells'] = [int(ncx), int(ncy)]
    elif fam == 'lluvia':
        H = drop_domes(L)
        st = tile_stack(np.dstack([R, H, np.zeros_like(R)]))
    elif fam == 'esmerilado':
        H = cv2.GaussianBlur(L - cv2.GaussianBlur(L, (0, 0), 6), (0, 0), 1.0) * 30
        R = norm01(L - cv2.GaussianBlur(L, (0, 0), 30), 1, 99.9) * 0.6
        st = tile_stack(np.dstack([R, H, np.zeros_like(R)]))
    else:
        # relieve suave: lo fino de la foto es brillo, no forma (si no, la imagen se rompe en ruido)
        sig = {'ondulado': 16, 'martillado': 15, 'plastico': 4}[fam]
        H = cv2.GaussianBlur(norm01(L), (0, 0), sig) * 14
        st = tile_stack(np.dstack([R, H, np.zeros_like(R)]))
    Rt, Ht, Mt = st[..., 0], st[..., 1], st[..., 2]
    if 'tileMm' not in info:
        mm = FAM[fam]['mm']; info['tileMm'] = [float(mm), round(mm * Rt.shape[0] / Rt.shape[1], 1)]
    # tamaño de almacenamiento
    f = min(1.0, MAXD / max(Rt.shape))
    if f < 1:
        sz = (int(round(Rt.shape[1] * f)), int(round(Rt.shape[0] * f)))
        Rt = cv2.resize(Rt.astype(np.float32), sz, interpolation=cv2.INTER_AREA)
        Ht = cv2.resize(Ht.astype(np.float32), sz, interpolation=cv2.INTER_AREA) * f
        Mt = cv2.resize(Mt.astype(np.float32), sz, interpolation=cv2.INTER_AREA)
    # pendientes periódicas (el tile envuelve)
    Hp = np.pad(Ht, 4, mode='wrap')
    gx, gy = slopes(Hp, 1.0 if fam in ('lluvia', 'acanalado') else 1.4)
    gx, gy = gx[4:-4, 4:-4], gy[4:-4, 4:-4]
    cid = f'{fam}_{n}'
    os.makedirs(OUT, exist_ok=True)
    save_png(np.clip(Rt, 0, 1), f'overlays/{cid}_r.png', 'L')
    enc = np.zeros(gx.shape + (2,), np.uint8)
    enc[..., 0] = np.clip(np.round(128 + gx * 126), 0, 255); enc[..., 1] = np.clip(np.round(128 + gy * 126), 0, 255)
    Image.fromarray(enc, 'LA').save(os.path.join(OUT, f'{cid}_n.png'), optimize=True)
    it = {'id': cid, 'r': f'{cid}_r.png', 'n': f'{cid}_n.png', 'w': int(Rt.shape[1]), 'h': int(Rt.shape[0]), 'src': fn}
    if fam == 'armado':
        save_png(np.clip(Mt, 0, 1), f'overlays/{cid}_m.png', 'L'); it['m'] = f'{cid}_m.png'
    it.update(info)
    it['rMean'] = round(float(Rt.mean()), 4)
    return it


if __name__ == '__main__':
    only = sys.argv[1:]
    if os.path.isdir(OUT) and not only:
        for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    cat = {}
    if only and os.path.exists(os.path.join(ASSETS, 'overlays.json')):
        cat = json.load(open(os.path.join(ASSETS, 'overlays.json')))
    for fam, files in ITEMS.items():
        if only and fam not in only: continue
        items = []
        for n, fn in enumerate(files):
            it = process(fam, n, fn); items.append(it)
            print(fam, n, it['w'], it['h'], it['tileMm'], it.get('flutes', ''), it.get('cells', ''), 'r%.3f' % it['rMean'], flush=True)
        e = {k: v for k, v in FAM[fam].items() if k != 'mm'}
        e['items'] = items
        cat[fam] = e
    json.dump(cat, open(os.path.join(ASSETS, 'overlays.json'), 'w'), ensure_ascii=False, indent=1)
