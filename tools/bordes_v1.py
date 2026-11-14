"""Bordes de la hoja (BORDES/) -> tiras de borde tileables y esquinas, para recortar la hoja con alfa.

Cada foto (papel sobre croma verde, o sobre negro en el vegetal) se recorta con bordes_matte.matte() y se convierte en
lo que el motor necesita, independiente del papel concreto de la foto:
  · alfa: dónde hay papel (fibras sueltas semitransparentes incluidas);
  · Sh: el color de la foto dividido por el color de su propio papel (= relieve, sombras de solapas, filo tostado o
    quemado, fibras más claras). Al aplicarlo se multiplica por el papel elegido, así el borde sirve para cualquier
    color de papel;
  · K: dónde asoma el interior del papel (el bisel blanco de un papel de color rasgado, el alma clara de la cartulina
    gris o del kraft). Al aplicarlo ahí se pinta el «alma» del papel elegido (más clara que su cara).

TIRAS (bordes rectos de una hoja): el papel queda abajo y el borde cruza la foto en horizontal. Se endereza (si la foto
está algo inclinada), se recorta sólo la banda donde el borde se nota (lo de más abajo es papel normal) y se hace
cíclica en horizontal: se busca un punto de corte donde la altura del borde y el dibujo coinciden y se funde un tramo
corto, así una tira cubre un lado entero de la hoja sin costura.

ESQUINAS (orejas dobladas, esquinas gastadas y redondeadas, esquina de caja aplastada): se detecta cada esquina libre de
cada trozo de papel, se mide hasta dónde llega el daño (lo que falta y la solapa), se localizan los dos cantos rectos y
se guarda girada como esquina superior izquierda, con el punto donde se cortarían los dos cantos como origen.

Escala: cada conjunto tiene la anchura real que cubre la foto (en mm); todo se guarda a 10 px/mm."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, REPO
import bordes_matte as BM

SRC = os.path.join(REPO, 'BORDES')
TMP = os.environ.get('PAPELATOR_TMP', '/tmp/papelator_bordes')
OUT = os.path.join(ASSETS, 'bordes')
PPM = 10.0
# las fotos generadas exageran el tamaño del rasgado: un borde real tiene dientes de 1-3 mm y fibras de 1 mm
SCALE = 0.6
# hasta dónde (mm, ya a escala real) se nota el borde hacia dentro; más allá es el papel elegido, sin nada de la foto
FADE = {'blanco': 1.6, 'bisel': 2.4, 'blanco_roto': 5, 'espiral': 2.5, 'wire': 3, 'periodico': 1.6, 'reciclado': 2.5,
        'acuarela': 2, 'washi': 2.5, 'artesanal': 3, 'viejo': 3.5, 'viejo_roto': 4, 'quemado': 6, 'kraft': 2.4,
        'kraft_grueso': 4, 'gris': 3, 'gris_roto': 5, 'vegetal': 1.5, 'carton': 3, 'carton_rasgado': 8, 'carton_roto': 11}
# sólo estos guardan el color del filo (tostado, quemado); en el resto el borde es luz y sombra y el color es el del papel
TINT = {'viejo', 'viejo_roto', 'quemado'}

# conjunto: (anchura real de la foto en mm, ficheros)
STRIPS = {
 'blanco': (120, ['Papel blanco rasgado sobre fondo verde (1).png', 'Papel blanco rasgado sobre fondo verde.png', 'Papel blanco rasgado sobre verde croma.png', 'Papel rasgado sobre fondo verde croma.png', 'Gemini_Generated_Image_hfopqshfopqshfop.jpg', 'Gemini_Generated_Image_lpj7mflpj7mflpj7.jpg']),
 'bisel': (120, ['Borde de papel azul rasgado sobre verde (1).png', 'Borde de papel azul rasgado sobre verde.png', 'Borde de papel rasgado verde y azul.png', 'Textura de papel rasgado verde y azul.png', 'Gemini_Generated_Image_jhrzrqjhrzrqjhrz.jpg', 'Gemini_Generated_Image_tcek3wtcek3wtcek.jpg', 'Gemini_Generated_Image_vfntrhvfntrhvfnt.jpg']),
 'blanco_roto': (130, ['Borde de papel rasgado sobre verde croma.png', 'Gemini_Generated_Image_9gqm6j9gqm6j9gqm.jpg', 'Gemini_Generated_Image_p0rslp0rslp0rslp.jpg', 'Gemini_Generated_Image_rjsv6srjsv6srjsv.jpg', 'Gemini_Generated_Image_xh0lmdxh0lmdxh0l.jpg', 'Papel rasgado sobre fondo verde croma (1).png']),
 'espiral': (115, ['Borde de cuaderno espiral rasgado.png', 'Borde de cuaderno rasgado sobre verde croma.png', 'Borde perforado rasgado sobre fondo verde.png', 'Gemini_Generated_Image_osszabosszabossz.jpg', 'Papel de cuaderno rasgado sobre verde croma.png']),
 'wire': (115, ['Gemini_Generated_Image_946sq8946sq8946s.jpg', 'Gemini_Generated_Image_gmnp57gmnp57gmnp (1).jpg']),
 'periodico': (120, ['Borde de papel rasgado sobre fondo verde (1).png', 'Borde de papel rasgado sobre fondo verde (2).png', 'Borde de papel rasgado sobre verde cromático.png', 'Textura macro de papel rasgado sobre fondo verde.png']),
 'reciclado': (120, ['Gemini_Generated_Image_1luw5j1luw5j1luw.jpg', 'Gemini_Generated_Image_lon8udlon8udlon8.jpg']),
 'acuarela': (120, ['Borde Rasgado sobre Fondo Verde Croma.png', 'Borde de papel rasgado sobre fondo verde (4).png', 'Borde de papel rasgado sobre fondo verde (5).png', 'Borde de papel rasgado sobre verde croma (1).png', 'Borde de papel rasgado sobre verde croma (2).png', 'Borde de papel rasgado sobre verde croma (4).png', 'Gemini_Generated_Image_5h8do5h8do5h8do5.jpg', 'Gemini_Generated_Image_5txiv75txiv75txi.jpg', 'Gemini_Generated_Image_niw66yniw66yniw6.jpg', 'Papel rasgado sobre fondo verde intenso.png', 'Textura de papel rasgado sobre fondo verde chroma.png']),
 'washi': (120, ['Borde de papel fibroso sobre verde croma (1).png', 'Borde de papel fibroso sobre verde croma.png', 'Franja de fibras sobre fondo verde croma.png', 'Gemini_Generated_Image_c6xal8c6xal8c6xa.jpg', 'Gemini_Generated_Image_c77cwhc77cwhc77c.jpg', 'Gemini_Generated_Image_rerukarerukareru.jpg', 'Gemini_Generated_Image_zhlrc6zhlrc6zhlr.jpg', 'Gemini_Generated_Image_fpch7ffpch7ffpch.jpg']),
 'artesanal': (120, ['Borde de papel artesanal sobre fondo verde-1.png', 'Borde de papel artesanal sobre fondo verde.png', 'Gemini_Generated_Image_41mxx041mxx041mx.jpg', 'Gemini_Generated_Image_eb8ybgeb8ybgeb8y.jpg', 'Papel artesanal rasgado sobre verde croma-2.png', 'Papel artesanal sobre fondo verde intenso.png']),
 'viejo': (130, ['Borde de Papel Rasgado sobre Fondo Verde.png', 'Gemini_Generated_Image_5nie615nie615nie.jpg', 'Papel envejecido con borde rasgado sobre verde croma.png', 'Papel rasgado sobre fondo verde croma (2).png', 'Textura de papel blanco rasgado sobre verde croma.png', 'Gemini_Generated_Image_6tno7u6tno7u6tno.jpg', 'Gemini_Generated_Image_9fkdgg9fkdgg9fkd.jpg', 'Gemini_Generated_Image_wd1h3jwd1h3jwd1h.jpg']),
 'viejo_roto': (130, ['Borde de papel envejecido sobre verde croma.png', 'Papel Rasgado sobre Fondo Verde Croma (3).png', 'Papel antiguo rasgado sobre fondo verde (1).png', 'Papel antiguo rasgado sobre fondo verde croma.png', 'Papel envejecido rasgado sobre fondo verde croma.png', 'Textura de Papel Antiguo Rasgado sobre Verde Croma.png', 'Pergamino antiguo sobre fondo verde intenso.png']),
 'quemado': (140, ['Gemini_Generated_Image_d1gb52d1gb52d1gb.jpg', 'Gemini_Generated_Image_f0lxcnf0lxcnf0lx.jpg', 'Gemini_Generated_Image_mn5wvumn5wvumn5w.jpg', 'Gemini_Generated_Image_owkdrxowkdrxowkd.jpg', 'Gemini_Generated_Image_q58nq58nq58nq58n.jpg', 'Gemini_Generated_Image_uu6xw7uu6xw7uu6x.jpg']),
 'kraft': (120, ['Papel kraft rasgado sobre fondo verde (1).png', 'Papel kraft rasgado sobre fondo verde croma.png', 'Papel kraft rasgado sobre fondo verde.png', 'Textura de papel kraft rasgado sobre fondo verde.png']),
 'kraft_grueso': (130, ['Gemini_Generated_Image_28rnrw28rnrw28rn.jpg', 'Gemini_Generated_Image_9hr7un9hr7un9hr7.jpg', 'Gemini_Generated_Image_ykkdfpykkdfpykkd.jpg']),
 'gris': (130, ['Borde de Papel Rasgado sobre Verde Vivo.png', 'Cartulina gris rasgada sobre fondo verde.png', 'Cartón gris rasgado sobre fondo verde.png', 'Papel gris rasgado sobre fondo verde.png', 'Textura de papel gris rasgado sobre verde intenso.png']),
 'gris_roto': (140, ['Gemini_Generated_Image_2ctmqd2ctmqd2ctm.jpg', 'Gemini_Generated_Image_5ovzra5ovzra5ovz.jpg', 'Gemini_Generated_Image_btyvfjbtyvfjbtyv.jpg', 'Gemini_Generated_Image_j1j6gfj1j6gfj1j6.jpg', 'Gemini_Generated_Image_ysju5ysju5ysju5y.jpg']),
 'vegetal': (120, ['Borde de papel translúcido rasgado.png', 'Borde rasgado sobre fondo negro (1).png', 'Gemini_Generated_Image_77d5hw77d5hw77d5.jpg', 'Gemini_Generated_Image_8omdq08omdq08omd.jpg', 'Gemini_Generated_Image_axsst0axsst0axss.jpg', 'Gemini_Generated_Image_rx96qkrx96qkrx96.jpg']),
 'carton': (160, ['Borde de cartón corrugado sobre fondo verde.png', 'Borde de cartón desgastado sobre fondo verde.png', 'Cartón kraft desgastado sobre fondo verde (1).png', 'Primer plano de cartón desgastado sobre verde croma.png', 'Textura de cartón corrugado sobre fondo verde chroma (1).png', 'Textura de cartón corrugado sobre fondo verde.png', 'Gemini_Generated_Image_i1b606i1b606i1b6.jpg', 'Gemini_Generated_Image_k8uuprk8uuprk8uu.jpg', 'Gemini_Generated_Image_n2513an2513an251.jpg']),
 'carton_rasgado': (105, ['Cartón corrugado desgarrado sobre verde croma.png', 'Cartón corrugado rasgado sobre fondo verde (2).png', 'Cartón corrugado rasgado sobre fondo verde (3).png', 'Cartón corrugado rasgado sobre verde】【。.png', 'Gemini_Generated_Image_sdiif5sdiif5sdii.jpg', 'Gemini_Generated_Image_sjmjb2sjmjb2sjmj.jpg', 'Gemini_Generated_Image_xjtwvaxjtwvaxjtw.jpg', 'Gemini_Generated_Image_31s2w331s2w331s2.jpg']),
 'carton_roto': (160, ['Cartón corrugado rasgado sobre fondo verde (1).png', 'Cartón corrugado rasgado sobre fondo verde.png', 'Cartón corrugado rasgado sobre verde croma (1).png', 'Cartón kraft con borde rasgado.png', 'Cartón kraft rasgado sobre fondo verde (1).png', 'Cartón kraft rasgado sobre fondo verde.png']),
}
CORNERS = {
 'oreja': (300, ['Collage de esquinas de papel plegadas.png', 'Esquinas de papel plegadas sobre verde.png', 'Tres esquinas de papel dobladas (1).png', 'Tres esquinas de papel dobladas.png']),
 'oreja_rota': (110, ['Esquinas de Papel Rasgado sobre Verde (1).png', 'Esquinas de papel rasgado sobre verde auxiliar.png', 'Esquinas de papel rasgado sobre verde croma.png', 'Esquinas de papel rasgado sobre verde.png', 'Gemini_Generated_Image_efun1zefun1zefun.jpg', 'Gemini_Generated_Image_o174zgo174zgo174.jpg', 'Gemini_Generated_Image_ts6d2wts6d2wts6d.jpg', 'Gemini_Generated_Image_zfku2mzfku2mzfku.jpg']),
 'vieja': (140, ['Cuatro esquinas de papel envejecido (1).png', 'Cuatro esquinas de papel envejecido.png', 'Esquinas de papel vintage sobre verde.png', 'Fragmentos de papel envejecido en cuadrícula.png', 'Gemini_Generated_Image_9hbxex9hbxex9hbx.jpg', 'Gemini_Generated_Image_fcpm14fcpm14fcpm.jpg', 'Gemini_Generated_Image_jivhbpjivhbpjivh.jpg', 'Gemini_Generated_Image_tit5s9tit5s9tit5.jpg', 'Gemini_Generated_Image_6tno7u6tno7u6tno.jpg', 'Gemini_Generated_Image_9fkdgg9fkdgg9fkd.jpg', 'Gemini_Generated_Image_wd1h3jwd1h3jwd1h.jpg']),
 'carton': (250, ['Gemini_Generated_Image_t4qy3tt4qy3tt4qy.jpg']),
 'quemada': (200, ['Gemini_Generated_Image_owkdrxowkdrxowkd.jpg']),
}


def matted(fname):
    """Recorte (cacheado en TMP)."""
    os.makedirs(TMP, exist_ok=True)
    key = os.path.join(TMP, 'm_' + ''.join(c if c.isalnum() else '_' for c in fname) + '.npz')
    if os.path.exists(key):
        d = np.load(key); return d['F'], d['a']
    rgb = np.asarray(Image.open(os.path.join(SRC, fname)).convert('RGB'), np.float32) / 255
    F, a, _ = BM.matte(rgb)
    np.savez_compressed(key, F=F.astype(np.float16), a=a.astype(np.float16))
    return F, a


def lumf(x): return x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722


def first_rows(a, thr=0.5, run=12):
    """Primera fila con papel macizo en cada columna (-1 si no hay): papel durante 'run' filas seguidas, para que una
    fibra suelta o una lengüeta por encima no cuente como el borde."""
    m = a > thr
    if run > 1:
        m = ndimage.binary_erosion(m, structure=np.ones((run, 1), bool), border_value=1)
        m = np.roll(m, -0, 0)
        # la erosión centra la ventana: se sube media ventana para que marque el principio del papel
        m = np.concatenate([m[run // 2:], np.repeat(m[-1:], run // 2, 0)], 0)
    e = m.argmax(0).astype(np.float32)
    e[~m.any(0)] = -1
    return e


def shear_cols(arr, shift):
    """Desplaza cada columna 'shift[x]' filas hacia arriba (corrige la inclinación del borde)."""
    H, W = arr.shape[:2]
    yy = np.arange(H, dtype=np.float32)[:, None] + shift[None, :]
    xx = np.broadcast_to(np.arange(W, dtype=np.float32)[None, :], (H, W))
    if arr.ndim == 2:
        return ndimage.map_coordinates(arr, [yy, xx], order=1, mode='nearest')
    return np.stack([ndimage.map_coordinates(arr[..., c], [yy, xx], order=1, mode='nearest') for c in range(arr.shape[2])], -1)


def resize(arr, w, h):
    if arr.ndim == 2:
        return np.asarray(Image.fromarray(arr.astype(np.float32), 'F').resize((w, h), Image.LANCZOS))
    return np.stack([resize(arr[..., c], w, h) for c in range(arr.shape[2])], -1)


def shade_and_core(F, a, body, rows_band, tint=False):
    """Sh (color / color de su papel) y K (alma del papel que asoma), dentro de la banda del borde."""
    H, W, _ = F.shape
    bodyL = lumf(body)
    L = lumf(F)
    # ¿asoma un interior más claro? (bisel blanco, alma de la cartulina gris, fibra clara del kraft)
    sel = rows_band & (a > 0.95)
    core = None
    if sel.sum() > 500 and np.median(bodyL) < 0.82:
        brighter = sel & (L > bodyL[None, :] + 0.12)
        if brighter.sum() > sel.sum() * 0.02:
            core = np.median(F[brighter], 0)
    if core is not None:
        d = core[None, None, :] - body[None, :, :]
        K = np.sum((F - body[None]) * d, -1) / np.maximum(np.sum(d * d, -1), 1e-4)
        # sólo lo que de verdad es alma (no las pequeñas variaciones de luz del propio papel)
        K = np.clip((K - 0.3) / 0.45, 0, 1); K = K * K * (3 - 2 * K) * (a > 0.02)
        ref = body[None] * (1 - K[..., None]) + core[None, None, :] * K[..., None]
    else:
        K = np.zeros((H, W), np.float32)
        ref = np.broadcast_to(body[None], F.shape)
    # luz (luminancia) y, aparte, un tinte de color sólo donde el papel de la foto no es muy saturado: en un azul
    # intenso el canal rojo casi no existe y su cociente sería puro ruido; en un papel viejo el tinte tostado sí vale
    Lr = np.maximum(lumf(ref), 0.02)
    shL = lumf(F) / Lr
    eps = 0.12
    ratio = (F + eps) / (ref + eps)
    rl = np.maximum(lumf(ratio), 1e-3)[..., None]
    chroma = ratio / rl
    # nunca más verde que rojo/azul (restos del croma en las fibras)
    chroma[..., 1] = np.minimum(chroma[..., 1], np.maximum(chroma[..., 0], chroma[..., 2]))
    Sh = shL[..., None] * (chroma if tint else 1.0)
    if not tint: Sh = np.repeat(Sh, 3, -1) if Sh.shape[-1] == 1 else Sh
    Sh = np.where(a[..., None] > 0.01, Sh, 1.0)
    return np.clip(Sh, 0.03, 2.0).astype(np.float32), K.astype(np.float32), core


def loop_seam(a, Sh, e, lo, hi, ov):
    """Columnas de corte (xa, xb) donde el borde vuelve a casar consigo mismo."""
    W = a.shape[1]
    span = hi - lo
    cand_a = range(lo + ov, lo + ov + max(2, int(span * 0.12)))
    cand_b = range(hi - max(2, int(span * 0.12)), hi)
    best, bx = 1e9, (lo + ov, hi - 1)
    ga = a[:, ::1]
    for xa in cand_a[::2]:
        for xb in cand_b[::2]:
            if xb - xa < span * 0.75: continue
            c = abs(e[xa] - e[xb]) * 0.05 + np.mean(np.abs(ga[:, xa - 6:xa + 6] - ga[:, xb - 6:xb + 6])) * 4 \
                + np.mean(np.abs(Sh[:, xa - 4:xa + 4] - Sh[:, xb - 4:xb + 4]))
            if c < best: best, bx = c, (xa, xb)
    return bx


def process_strip(sid, fname, widthMm, sset=''):
    widthMm = widthMm * SCALE
    F, a = matted(fname)
    F = F.astype(np.float32); a = a.astype(np.float32)
    H, W = a.shape
    e = first_rows(a)
    # columnas útiles: hay borde y debajo papel macizo un buen trecho (los trozos sueltos y las esquinas fuera)
    deep = int(H * 0.22)
    okc = np.zeros(W, bool)
    for x in range(W):
        if e[x] < 0 or e[x] > H * 0.85: continue
        y0 = int(e[x]); col = a[y0:min(H, y0 + deep), x]
        okc[x] = col.size > deep * 0.6 and np.mean(col > 0.5) > 0.6
    lab, n = ndimage.label(okc)
    if n == 0: return None
    sizes = ndimage.sum(okc, lab, range(1, n + 1)); k = np.argmax(sizes) + 1
    xs = np.nonzero(lab == k)[0]; lo, hi = xs[0] + int(W * 0.015), xs[-1] - int(W * 0.015)
    # enderezar: recta robusta del borde
    xv = np.arange(lo, hi); ev = e[lo:hi]
    p = np.polyfit(xv, ev, 1)
    for _ in range(3):
        r = ev - np.polyval(p, xv); s = np.std(r) + 1e-6
        keep = np.abs(r) < 2 * s
        p = np.polyfit(xv[keep], ev[keep], 1)
    if abs(p[0]) > 0.002:
        shift = (np.polyval(p, np.arange(W)) - np.polyval(p, (lo + hi) / 2)).astype(np.float32)
        a = shear_cols(a, shift); F = shear_cols(F, shift); e = first_rows(a)
    yE = float(np.median(e[lo:hi]))
    # fondo del papel: color por columna en la parte honda (lejos del borde)
    bot = np.array([int(np.nonzero(a[:, x] > 0.5)[0][-1]) if (a[:, x] > 0.5).any() else H - 1 for x in range(W)])
    pb = int(np.median(bot[lo:hi]))
    y1, y2 = int(yE + (pb - yE) * 0.55), pb - 4
    if y2 - y1 < 20: y1 = max(int(yE) + 10, y2 - 40)
    # color propio del papel junto al borde (no en el fondo de la foto: la luz cambia)
    near = np.zeros((W, 3), np.float32)
    for x in range(W):
        ya = int(max(0, e[x])) + int(H * 0.09); yb = min(y2, ya + int(H * 0.16))
        if yb - ya < 8: ya, yb = y1, y2
        near[x] = np.median(F[ya:yb, x], 0)
    body = near
    body = np.stack([ndimage.gaussian_filter1d(body[:, c], 40, mode='nearest') for c in range(3)], -1)
    rows = np.arange(H)[:, None]
    band0 = (rows >= e[None, :]) & (rows < e[None, :] + H * 0.05)
    Sh, K, core = shade_and_core(F, a, body, band0, sset in TINT)
    # el borde sólo se nota cerca del filo: distancia (dentro del papel) a lo transparente
    mmpx0 = widthMm / W
    d1 = FADE.get(sset, 2.5) / mmpx0
    dist = ndimage.distance_transform_edt(a > 0.5)
    fade = np.clip((d1 - dist) / (d1 * 0.45), 0, 1).astype(np.float32)
    fade = ndimage.gaussian_filter(fade, max(1, d1 * 0.08))
    Sh = 1 + (Sh - 1) * fade[..., None]; K = K * fade
    # hasta dónde se nota el borde: desviación respecto del papel, fila a fila
    dev = np.median(np.abs(Sh[:, lo:hi] - 1).mean(-1) + K[:, lo:hi], 1)
    base = np.median(dev[y1:y2]) if y2 > y1 else 0.02
    sm = ndimage.gaussian_filter1d(dev, 3)
    yB = int(yE + H * 0.01)
    for y in range(int(yE), y1):
        if sm[y] > base * 1.6 + 0.004: yB = y
    # además, lo más hondo que llega el papel arrancado (muescas, solapas, agujeros)
    holes = (a[int(yE):y1, lo:hi] < 0.5)
    if holes.any():
        yB = max(yB, int(yE) + int(np.nonzero(holes.any(1))[0][-1]))
    ramp = int(H * 0.012) + 2
    yB = min(yB + ramp, y1)
    w = np.clip((yB + ramp - rows[:, 0]) / ramp, 0, 1).astype(np.float32)
    Sh = 1 + (Sh - 1) * w[:, None, None]; K = K * w[:, None]
    # lo más alto que llegan las fibras (por columna, sólo cerca de su borde; sin motas sueltas)
    reach = int(H * 0.22)
    tops = []
    for x in range(lo, hi, 2):
        y0 = int(max(0, e[x] - reach)); col = a[y0:int(e[x]) + 1, x] > 0.03
        if col.any(): tops.append(y0 + int(np.argmax(col)))
    yT = max(0, int(np.percentile(tops, 0.7)) - 4) if tops else max(0, int(yE) - 10)
    y_end = min(H, yB + ramp)
    # cíclica en horizontal
    ov = int(W * 0.025)
    xa, xb = loop_seam(a, Sh, e, lo, hi, ov)
    L = xb - xa
    def tile(arr):
        t = arr[:, xa:xb].copy()
        wgt = np.linspace(0, 1, ov, dtype=np.float32)
        wgt = wgt[None, :, None] if arr.ndim == 3 else wgt[None, :]
        t[:, L - ov:] = arr[:, xb - ov:xb] * (1 - wgt) + arr[:, xa - ov:xa] * wgt
        return t
    a_t = tile(a)[yT:y_end]; Sh_t = tile(Sh)[yT:y_end]; K_t = tile(K)[yT:y_end]
    # a 10 px/mm
    mmpx = widthMm / W
    nw = max(64, int(round(L * mmpx * PPM))); nh = max(16, int(round((y_end - yT) * mmpx * PPM)))
    a_r = np.clip(resize(a_t, nw, nh), 0, 1); Sh_r = np.clip(resize(Sh_t, nw, nh), 0, 2); K_r = np.clip(resize(K_t, nw, nh), 0, 1)
    os.makedirs(OUT, exist_ok=True)
    rgba = np.dstack([Sh_r / 2, a_r])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, sid + '.png'), optimize=True)
    hasK = core is not None and K_r.max() > 0.2
    if hasK: Image.fromarray((K_r * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, sid + '_k.png'), optimize=True)
    return {'id': sid, 'w': nw, 'h': nh, 'edge': round((yE - yT) * mmpx * PPM, 1), 'core': bool(hasK), 'src': fname}


def _mode(vals, tol=3):
    """Valor más repetido (con tolerancia): la posición de un canto recto aunque parte de él falte."""
    v = np.asarray([x for x in vals if x >= 0], np.float32)
    if v.size < 5: return None
    h, edges = np.histogram(v, bins=np.arange(v.min() - 0.5, v.max() + 1.5, 1))
    k = np.convolve(h, np.ones(2 * tol + 1), 'same')
    c = edges[np.argmax(k)] + 0.5
    near = v[np.abs(v - c) <= tol]
    return float(np.median(near)), near.size / v.size


def process_corners(cset, fname, widthMm, start):
    F, a = matted(fname)
    F = F.astype(np.float32); a = a.astype(np.float32)
    H, W = a.shape
    mmpx = widthMm / W
    lab, n = ndimage.label(a > 0.5)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None: continue
        comp = lab == i + 1
        if comp[sl].sum() < H * W * 0.03: continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        tL, tR, tT, tB = x0 <= 2, x1 >= W - 2, y0 <= 2, y1 >= H - 2
        for cy, cx in ((0, 0), (0, 1), (1, 0), (1, 1)):
            if (cx == 0 and tL) or (cx == 1 and tR) or (cy == 0 and tT) or (cy == 1 and tB): continue
            # todo como esquina superior izquierda (se voltea la foto entera)
            M, A, Fi = comp, a, F
            if cx == 1: M, A, Fi = M[:, ::-1], A[:, ::-1], Fi[:, ::-1]
            if cy == 1: M, A, Fi = M[::-1], A[::-1], Fi[::-1]
            ys, xs = np.nonzero(M)
            by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            bw, bh = bx1 - bx0, by1 - by0
            # cantos: la fila (columna) donde empieza el papel en la mayoría de columnas (filas) del trozo
            col_top = [int(np.argmax(M[by0:by1, x])) + by0 if M[by0:by1, x].any() else -1 for x in range(bx0, bx1)]
            row_left = [int(np.argmax(M[y, bx0:bx1])) + bx0 if M[y, bx0:bx1].any() else -1 for y in range(by0, by1)]
            mt, ml = _mode(col_top), _mode(row_left)
            if not mt or not ml or mt[1] < 0.15 or ml[1] < 0.15: continue
            et, el = mt[0], ml[0]
            # daño: lo que falta dentro del ángulo de los cantos, unido al exterior por la esquina
            Y0, X0 = int(round(et)) + 2, int(round(el)) + 2
            lim = int(min(bw, bh) * 0.9)
            sub = ~M[Y0:Y0 + lim, X0:X0 + lim]
            lab2, n2 = ndimage.label(sub)
            touch = set(np.unique(np.concatenate([lab2[0, :], lab2[:, 0]]))) - {0}
            miss = np.isin(lab2, list(touch)) if touch else np.zeros_like(sub)
            if miss.mean() * lim * lim < (min(bw, bh) * 0.012) ** 2: continue
            yy, xx = np.nonzero(miss)
            ext = max(np.percentile(yy, 99.5), np.percentile(xx, 99.5))
            R = int(max(ext * 1.3, ext + min(bw, bh) * 0.06, min(bw, bh) * 0.12))
            if R > lim: continue
            m = int(min(bw, bh) * 0.02)
            oy, ox = int(round(et)) - m, int(round(el)) - m
            if oy < 0 or ox < 0: continue
            ca = A[oy:oy + R + m, ox:ox + R + m]; cf = Fi[oy:oy + R + m, ox:ox + R + m]
            if ca.shape[0] < R + m or ca.shape[1] < R + m: continue
            # los dos cantos tienen que seguir enteros al final del recorte (si no, no es una esquina limpia)
            if ca[m + 3:m + 8, int((R + m) * 0.85):].mean() < 0.85 or ca[int((R + m) * 0.85):, m + 3:m + 8].mean() < 0.85: continue
            inner = Fi[oy + R:oy + int(R * 1.4), ox + R:ox + int(R * 1.4)].reshape(-1, 3)
            Mi = M[oy + R:oy + int(R * 1.4), ox + R:ox + int(R * 1.4)].reshape(-1)
            body = np.median(inner[Mi], 0) if Mi.sum() > 50 else np.median(cf[ca > 0.9], 0)
            ref = np.maximum(body, 0.02)
            Lr = max(float(lumf(ref)), 0.02)
            shL = lumf(cf) / Lr
            ratio = (cf + 0.12) / (ref + 0.12); chroma = ratio / np.maximum(lumf(ratio), 1e-3)[..., None]
            Sh = np.where(ca[..., None] > 0.01, shL[..., None] * chroma, 1.0)
            Yg, Xg = np.mgrid[0:R + m, 0:R + m].astype(np.float32)
            fade = np.clip((R + m - np.maximum(Xg, Yg)) / (R * 0.18), 0, 1)
            Sh = 1 + (Sh - 1) * fade[..., None]
            ideal = ((Xg >= m) & (Yg >= m)).astype(np.float32)
            ca = ca * fade + ideal * (1 - fade)
            sz = int(round((R + m) * mmpx * PPM))
            Sh_r = np.clip(resize(Sh.astype(np.float32), sz, sz), 0, 2); a_r = np.clip(resize(ca.astype(np.float32), sz, sz), 0, 1)
            cid = f'esq_{cset}_{start + len(out) + 1}'
            Image.fromarray((np.dstack([Sh_r / 2, a_r]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, cid + '.png'), optimize=True)
            out.append({'id': cid, 'size': sz, 'origin': round(m * mmpx * PPM, 1), 'damage': round(ext * mmpx, 1), 'src': fname})
    return out


if __name__ == '__main__':
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    catp = os.path.join(ASSETS, 'bordes.json')
    cat = json.load(open(catp)) if os.path.exists(catp) else {'ppm': PPM, 'strips': {}, 'corners': {}}
    for sset, (mm, files) in STRIPS.items():
        if only and sset not in only: continue
        lst = []
        for j, f in enumerate(files):
            r = process_strip(f'{sset}_{j + 1}', f, mm, sset)
            if r: lst.append(r); print(sset, r['id'], r['w'], 'x', r['h'], 'borde', r['edge'], 'alma' if r['core'] else '', flush=True)
        cat['strips'][sset] = lst
    for cset, (mm, files) in CORNERS.items():
        if only and 'C_' + cset not in only: continue
        lst = []
        for f in files:
            lst += process_corners(cset, f, mm, len(lst))
        cat['corners'][cset] = lst
        print(cset, len(lst), 'esquinas', flush=True)
    json.dump(cat, open(catp, 'w'), ensure_ascii=False, indent=1)
