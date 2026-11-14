"""Bordes de la hoja v3 (BORDES/) -> tiras de borde «aplanadas» por tipo de papel y esquinas, a escala real.

Lo que se aprendió de v1/v2: de las fotos generadas sólo sirve lo que de verdad es del borde (el alfa de las fibras y del
desgarro, el bisel claro que asoma, las sombras de las solapas y muescas). Su escala no es fiable y su papel no es el del
documento. Así que:
  · ESCALA: cada foto se calibra por algo físico. Rasgado: el ancho de la franja de fibras (folio 0,45 mm, acuarela
    0,7, kraft 0,9, arroz 1,8…). Papel de color y cartulina gris: el ancho del alma clara que asoma. Espiral: el paso de
    los agujeros (6,35 mm). Cartón: el paso de las ondas (7 mm). Bordes viejos: anchura de la foto.
  · SÓLO EL BORDE: la luz (luminancia relativa al papel de la foto) y el alma se quedan sólo a menos de D mm del filo
    (folio 0,6 mm…); más adentro manda el papel elegido. Sin color de la foto (salvo el tostado de los bordes viejos).
  · APLANADAS: la forma grande del desgarro (ondas de varios cm) se quita (la pone el motor, a la escala de la hoja) y
    se conservan los dientes, las fibras y las muescas. Todas las fotos de un tipo se empalman en una tira larga y
    cíclica (fundidos de 1 mm), así no se repite a la vista.
  · ESQUINAS: orejas (limpias y estropeadas) y esquinas viejas gastadas; se guarda su luz, su alfa y la solapa (lo que
    enseña el dorso: sin tinta), con el tamaño de la oreja para escalarla en el motor.
Salida: plugin/assets/bordes/<tipo>.png (RGB = luz/2, A = alfa) + <tipo>_k.png (alma) · esquinas esq_*.png (+ _f solapa)
· bordes.json. Todo a 20 px/mm."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS
import bordes_v1 as V1

OUT = os.path.join(ASSETS, 'bordes')
PPM = 20.0
SETS = json.load(open(os.path.join(os.path.dirname(__file__), 'bordes_sets.json')))
# tipo: (calibración, valor, D = hasta dónde se nota hacia dentro en mm, tinte, quitar forma grande (mm))
CFG = {
  'blanco': ('fringe', 0.45, 0.6, 0, 3), 'bisel': ('core', 0.9, 1.4, 0, 3), 'periodico': ('width', 50, 0.7, 0, 3),
  'acuarela': ('width', 55, 1.0, 0, 3), 'washi': ('width', 60, 1.2, 0, 5), 'artesanal': ('width', 60, 1.2, 0, 4),
  'kraft': ('width', 55, 1.2, 0, 3), 'gris': ('core', 1.6, 2.6, 0, 4), 'vegetal': ('fringe', 0.25, 0.5, 0, 3),
  'viejo': ('width', 45, 2.2, 0.6, 6), 'viejo_roto': ('width', 60, 3.2, 0.4, 8),
  'espiral': ('pitch', 6.35, 7.5, 0, 12), 'carton_roto': ('pitch', 7.0, 13, 0, 12), 'carton': ('width', 70, 3.0, 0.3, 8)}
CORNER_CFG = {'oreja': 0.0, 'oreja_rota': 0.3, 'vieja': 0.5}     # tinte que se conserva


def period(profile, lo, hi):
    p = profile - ndimage.gaussian_filter1d(profile, hi)
    p = p - p.mean()
    ac = np.correlate(p, p, 'full')[len(p) - 1:]
    ac = ac / (ac[0] + 1e-9)
    k = lo + int(np.argmax(ac[lo:hi]))
    return k, ac[k]


def piece(sset, fname):
    kind, val, D, tint, bigMm = CFG[sset]
    F, a = V1.matted(fname)
    F = F.astype(np.float32); a = a.astype(np.float32)
    H, W = a.shape
    e = V1.first_rows(a)
    deep = int(H * 0.2)
    okc = np.zeros(W, bool)
    for x in range(W):
        if e[x] < 0 or e[x] > H * 0.85: continue
        col = a[int(e[x]):min(H, int(e[x]) + deep), x]
        okc[x] = col.size > deep * 0.6 and np.mean(col > 0.5) > 0.6
    lab, n = ndimage.label(okc)
    if n == 0: return None
    sizes = ndimage.sum(okc, lab, range(1, n + 1)); kk = np.argmax(sizes) + 1
    xs = np.nonzero(lab == kk)[0]; lo, hi = xs[0] + int(W * 0.01), xs[-1] - int(W * 0.01)
    if hi - lo < W * 0.3: return None
    # enderezar
    xv = np.arange(lo, hi); ev = e[lo:hi]; p = np.polyfit(xv, ev, 1)
    for _ in range(3):
        r = ev - np.polyval(p, xv); s = np.std(r) + 1e-6; keep = np.abs(r) < 2 * s; p = np.polyfit(xv[keep], ev[keep], 1)
    if abs(p[0]) > 0.002:
        sh = (np.polyval(p, np.arange(W)) - np.polyval(p, (lo + hi) / 2)).astype(np.float32)
        a = V1.shear_cols(a, sh); F = V1.shear_cols(F, sh); e = V1.first_rows(a)
    ec = e.copy(); bad = ec < 0
    if bad.any(): ec[bad] = np.interp(np.nonzero(bad)[0], np.nonzero(~bad)[0], ec[~bad])
    eMed = float(np.median(ec[lo:hi]))
    # ---- escala (mm por px de la foto)
    tops = np.full(W, np.nan)
    for x in range(lo, hi):
        y0 = int(max(0, ec[x] - H * 0.25)); col = a[y0:int(ec[x]) + 1, x] > 0.3
        if col.any(): tops[x] = y0 + np.argmax(col)
    fr = (ec - tops)[lo:hi]; fr = fr[~np.isnan(fr)]
    # color propio del papel junto al borde (un poco más adentro de la franja)
    body = np.zeros((W, 3), np.float32)
    off0 = int(H * 0.06)
    for x in range(W):
        ya = int(ec[x]) + off0; yb = min(H - 1, ya + int(H * 0.12))
        colm = a[ya:yb, x] > 0.9
        body[x] = np.median(F[ya:yb, x][colm], 0) if colm.sum() > 5 else np.median(F[int(eMed) + off0:, x], 0)
    body = np.stack([ndimage.gaussian_filter1d(body[:, c], 30, mode='nearest') for c in range(3)], -1)
    rows = np.arange(H)[:, None]
    band0 = (rows >= ec[None, :]) & (rows < ec[None, :] + H * 0.08)
    Sh, K, core = V1.shade_and_core(F, a, body, band0, tint > 0)
    if tint > 0:
        L = V1.lumf(Sh)[..., None]; Sh = L + (Sh - L) * tint
    if kind == 'fringe':
        f = np.percentile(fr, 70) if fr.size else 0
        mmpx = val / f if f > 3 else 40.0 / W
    elif kind == 'core':
        cw = (K[:, lo:hi] > 0.35).sum(0); cw = cw[cw > 2]
        mmpx = val / np.median(cw) if cw.size > 20 else 40.0 / W
    elif kind == 'pitch':
        y0 = int(eMed); y1 = int(min(H - 1, eMed + H * 0.18))
        prof = (a[y0:y1, lo:hi] if sset == 'espiral' else V1.lumf(F[y0:y1, lo:hi])).mean(0)
        k, q = period(prof, max(6, (hi - lo) // 60), (hi - lo) // 5)
        mmpx = val / k
    else:
        mmpx = val / W
    # ---- luz de las fibras sueltas: media ponderada por alfa (el des-mezclado es ruidoso donde casi no hay papel)
    wA = np.clip(a, 0, 1)
    for c in range(3):
        num = ndimage.gaussian_filter(Sh[..., c] * wA, 1.5); den = ndimage.gaussian_filter(wA, 1.5)
        sm = num / np.maximum(den, 1e-3)
        Sh[..., c] = np.where(a < 0.6, sm, Sh[..., c])
    Sh = np.clip(Sh, 0.5, 1.35)
    # ---- sólo cerca del filo
    dist = ndimage.distance_transform_edt(a > 0.5) * mmpx
    fd = np.clip((D - dist) / (0.45 * D), 0, 1).astype(np.float32)
    fd = ndimage.gaussian_filter(fd, max(1.0, 0.08 * D / mmpx))
    Sh = 1 + (Sh - 1) * fd[..., None]; K = K * fd
    # ---- aplanar: se quita la forma grande del desgarro
    es = ndimage.gaussian_filter1d(ec, max(4, bigMm / mmpx / 2.5), mode='nearest')
    eRef = float(np.median(es[lo:hi]))
    shift = (es - eRef).astype(np.float32)
    a = V1.shear_cols(a, shift); Sh = V1.shear_cols(Sh, shift); K = V1.shear_cols(K, shift)
    tt = (tops - shift)[lo:hi]; tt = tt[~np.isnan(tt)]
    top = max(0, int(np.percentile(tt, 2)) - 4) if tt.size else max(0, int(eRef - 10))
    top = max(top, int(eRef - 4.0 / mmpx))                 # ninguna fibra sale más de 4 mm
    a[:top] = 0
    teeth = float(np.percentile(np.abs(ec - es)[lo:hi], 99))
    bot = int(min(H, eRef + D / mmpx + teeth + 0.4 / mmpx))
    a = a[top:bot, lo:hi]; Sh = Sh[top:bot, lo:hi]; K = K[top:bot, lo:hi]
    # lo que hay debajo del borde es papel entero (los huecos del recorte de la foto no cuentan)
    sc = mmpx * PPM
    nw, nh = max(32, int(round(a.shape[1] * sc))), max(8, int(round(a.shape[0] * sc)))
    A = np.clip(V1.resize(a, nw, nh), 0, 1); S = np.clip(V1.resize(Sh, nw, nh), 0, 2); KK = np.clip(V1.resize(K, nw, nh), 0, 1)
    edge = (eRef - top) * sc
    return {'A': A, 'S': S, 'K': KK, 'edge': edge, 'mmpx': mmpx, 'core': core is not None}


def join(pieces, xf):
    up = max(int(np.ceil(p['edge'])) for p in pieces)
    down = max(p['A'].shape[0] - int(np.floor(p['edge'])) for p in pieces)
    H = up + down
    padded = []
    for p in pieces:
        h, w = p['A'].shape; o = up - int(round(p['edge']))
        A = np.zeros((H, w), np.float32); S = np.ones((H, w, 3), np.float32); K = np.zeros((H, w), np.float32)
        A[o + h:] = 1
        A[o:o + h] = p['A']; S[o:o + h] = p['S']; K[o:o + h] = p['K']
        padded.append((A, S, K))
    A, S, K = [x.copy() for x in padded[0]]
    wv = np.linspace(0, 1, xf, dtype=np.float32)
    def blend(X, Y):
        w2 = wv[None, :, None] if X.ndim == 3 else wv[None, :]
        return X * (1 - w2) + Y * w2
    for (A2, S2, K2) in padded[1:]:
        A[:, -xf:] = blend(A[:, -xf:], A2[:, :xf]); S[:, -xf:] = blend(S[:, -xf:], S2[:, :xf]); K[:, -xf:] = blend(K[:, -xf:], K2[:, :xf])
        A = np.concatenate([A, A2[:, xf:]], 1); S = np.concatenate([S, S2[:, xf:]], 1); K = np.concatenate([K, K2[:, xf:]], 1)
    # cíclica
    A[:, :xf] = blend(A[:, -xf:], A[:, :xf]); S[:, :xf] = blend(S[:, -xf:], S[:, :xf]); K[:, :xf] = blend(K[:, -xf:], K[:, :xf])
    return A[:, :-xf], S[:, :-xf], K[:, :-xf], up


def corners(cset, files):
    tint = CORNER_CFG[cset]
    out = []
    for fname in files:
        F, a = V1.matted(fname)
        F = F.astype(np.float32); a = a.astype(np.float32)
        H, W = a.shape
        lab, n = ndimage.label(a > 0.5)
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if sl is None: continue
            comp = lab == i + 1
            if comp[sl].sum() < H * W * 0.03: continue
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            tL, tR, tT, tB = x0 <= 2, x1 >= W - 2, y0 <= 2, y1 >= H - 2
            for cy, cx in ((0, 0), (0, 1), (1, 0), (1, 1)):
                if (cx == 0 and tL) or (cx == 1 and tR) or (cy == 0 and tT) or (cy == 1 and tB): continue
                M, A, Fi = comp, a, F
                if cx == 1: M, A, Fi = M[:, ::-1], A[:, ::-1], Fi[:, ::-1]
                if cy == 1: M, A, Fi = M[::-1], A[::-1], Fi[::-1]
                ys, xs = np.nonzero(M)
                by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
                bw, bh = bx1 - bx0, by1 - by0
                col_top = [int(np.argmax(M[by0:by1, x])) + by0 if M[by0:by1, x].any() else -1 for x in range(bx0, bx1)]
                row_left = [int(np.argmax(M[y, bx0:bx1])) + bx0 if M[y, bx0:bx1].any() else -1 for y in range(by0, by1)]
                mt, ml = V1._mode(col_top), V1._mode(row_left)
                if not mt or not ml or mt[1] < 0.15 or ml[1] < 0.15: continue
                et, el = mt[0], ml[0]
                Y0, X0 = int(round(et)) + 2, int(round(el)) + 2
                lim = int(min(bw, bh) * 0.9)
                sub = ~M[Y0:Y0 + lim, X0:X0 + lim]
                lab2, _ = ndimage.label(sub)
                touch = set(np.unique(np.concatenate([lab2[0, :], lab2[:, 0]]))) - {0}
                miss = np.isin(lab2, list(touch)) if touch else np.zeros_like(sub)
                if miss.sum() < (min(bw, bh) * 0.012) ** 2: continue
                yy, xx = np.nonzero(miss)
                ext = max(np.percentile(yy, 99.5), np.percentile(xx, 99.5))
                R = int(max(ext * 1.35, ext + min(bw, bh) * 0.06, min(bw, bh) * 0.12))
                if R > lim: continue
                m = int(min(bw, bh) * 0.02)
                oy, ox = int(round(et)) - m, int(round(el)) - m
                if oy < 0 or ox < 0: continue
                ca = A[oy:oy + R + m, ox:ox + R + m]; cf = Fi[oy:oy + R + m, ox:ox + R + m]
                if ca.shape[0] < R + m or ca.shape[1] < R + m: continue
                if ca[m + 3:m + 8, int((R + m) * 0.85):].mean() < 0.85 or ca[int((R + m) * 0.85):, m + 3:m + 8].mean() < 0.85: continue
                # oreja: patas sobre los dos cantos -> línea de pliegue; la solapa es lo que falta reflejado en ella
                legX = np.nonzero(miss[0:4].any(0))[0]; legY = np.nonzero(miss[:, 0:4].any(1))[0]
                legX = float(legX.max()) if legX.size else 0; legY = float(legY.max()) if legY.size else 0
                N = R + m
                flap = np.zeros((N, N), np.float32)
                if legX > N * 0.06 and legY > N * 0.06 and cset != 'vieja':
                    Yg, Xg = np.mgrid[0:N, 0:N].astype(np.float32) - m
                    nx, ny = 1 / legX, 1 / legY; nl = np.hypot(nx, ny); nx, ny = nx / nl, ny / nl
                    dl = Xg * nx + Yg * ny - 1 / nl
                    Xs, Ys = Xg - 2 * dl * nx, Yg - 2 * dl * ny
                    missF = np.zeros((N, N), np.float32); missF[m + 2:m + 2 + miss.shape[0], m + 2:m + 2 + miss.shape[1]] = miss[:N - m - 2, :N - m - 2]
                    src = ndimage.map_coordinates(missF, [Ys + m, Xs + m], order=1, mode='constant')
                    flap = (src > 0.5) & (dl > 0) & (ca > 0.5)
                    flap = ndimage.binary_dilation(flap, iterations=max(1, int(N * 0.01))) & (ca > 0.5)
                    flap = ndimage.gaussian_filter(flap.astype(np.float32), 1.0)
                inner = Fi[oy + R:oy + int(R * 1.4), ox + R:ox + int(R * 1.4)].reshape(-1, 3)
                Mi = M[oy + R:oy + int(R * 1.4), ox + R:ox + int(R * 1.4)].reshape(-1)
                body = np.median(inner[Mi], 0) if Mi.sum() > 50 else np.median(cf[ca > 0.9], 0)
                ref = np.maximum(body, 0.02)
                shL = V1.lumf(cf) / max(float(V1.lumf(ref)), 0.02)
                ratio = (cf + 0.12) / (ref + 0.12); chroma = ratio / np.maximum(V1.lumf(ratio), 1e-3)[..., None]
                Sh = shL[..., None] * (1 + (chroma - 1) * tint)
                Sh = np.where(ca[..., None] > 0.01, Sh, 1.0)
                Yg, Xg = np.mgrid[0:N, 0:N].astype(np.float32)
                fade = np.clip((N - np.maximum(Xg, Yg)) / (R * 0.2), 0, 1)
                Sh = 1 + (Sh - 1) * fade[..., None]
                ideal = ((Xg >= m) & (Yg >= m)).astype(np.float32)
                ca = ca * fade + ideal * (1 - fade); flap = flap * fade
                # tamaño guardado: la oreja (o el gastado) mide 20 mm; el motor la escala a lo que toque
                sc = 20.0 * PPM / max(ext, 1)
                sz = int(round(N * sc))
                Sr = np.clip(V1.resize(Sh.astype(np.float32), sz, sz), 0.3, 1.6); ar = np.clip(V1.resize(ca.astype(np.float32), sz, sz), 0, 1)
                fr = np.clip(V1.resize(flap.astype(np.float32), sz, sz), 0, 1)
                cid = f'esq_{cset}_{len(out) + 1}'
                Image.fromarray((np.dstack([Sr / 2, ar]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, cid + '.png'), optimize=True)
                hasF = fr.max() > 0.3
                if hasF: Image.fromarray((fr * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, cid + '_f.png'), optimize=True)
                out.append({'id': cid, 'size': sz, 'origin': round(m * sc, 1), 'leg': 20.0, 'flap': bool(hasF), 'src': fname})
    return out


if __name__ == '__main__':
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    catp = os.path.join(ASSETS, 'bordes.json')
    cat = json.load(open(catp)) if os.path.exists(catp) else {}
    cat = {'ppm': PPM, 'strips': cat.get('strips', {}), 'corners': cat.get('corners', {})}
    for sset in CFG:
        if only and sset not in only: continue
        ps = []
        for f in SETS[sset]:
            p = piece(sset, f)
            if p: ps.append(p); print(sset, f[:40], 'mm/px %.4f' % p['mmpx'], 'pieza %dx%d' % (p['A'].shape[1], p['A'].shape[0]), 'alma' if p['core'] else '', flush=True)
        A, S, K, up = join(ps, int(PPM))
        Image.fromarray((np.dstack([np.clip(S, 0, 2) / 2, A]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, sset + '.png'), optimize=True)
        hasK = K.max() > 0.2
        if hasK: Image.fromarray((K * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, sset + '_k.png'), optimize=True)
        cat['strips'][sset] = {'w': int(A.shape[1]), 'h': int(A.shape[0]), 'edge': int(up), 'core': bool(hasK), 'mm': round(A.shape[1] / PPM, 1)}
        print('==', sset, A.shape, 'edge', up, flush=True)
    for cs in CORNER_CFG:
        if only and 'C_' + cs not in only: continue
        cat['corners'][cs] = corners(cs, SETS['C_' + cs])
        print('==', cs, len(cat['corners'][cs]), 'esquinas', flush=True)
    json.dump(cat, open(catp, 'w'), ensure_ascii=False, indent=1)
