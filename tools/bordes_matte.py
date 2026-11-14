"""Recorte de las fotos de BORDES/ (croma verde o fondo negro) -> RGBA con alfa fino (fibras semitransparentes).

Paso a paso, para cada imagen:
  1. Fondo: color del croma en cada zona (puede tener viñeta o degradado): media por bloques de los píxeles que son
     fondo seguro, rellenada hacia dentro y suavizada.
  2. Color propio del papel cerca de cada punto (F0): media de los píxeles de papel seguro, extendida hacia el borde
     (convolución normalizada), para saber cómo sería una fibra «pura» en esa zona.
  3. Alfa: posición del píxel entre el fondo local y el papel local, medida en la señal que mejor los separa
     (croma verde: G - max(R, B); fondo negro: luminancia). Así las fibras sueltas y las barbas finas salen
     semitransparentes en su justa medida.
  4. Color: se descuenta el fondo (C = a·F + (1-a)·B -> F) y se quita el verde que queda reflejado en el filo
     (el papel nunca es más verde que su propio color).
  5. Limpieza: motas sueltas lejos del papel fuera; el interior macizo, alfa 1 (salvo agujeros reales del papel)."""
import numpy as np
from scipy import ndimage


def _smooth_fill(val, mask, block=24, sigma=2.0):
    """Campo suave a partir de las muestras val[mask] (media por bloques + relleno + desenfoque)."""
    H, W = mask.shape
    gh, gw = (H + block - 1) // block, (W + block - 1) // block
    ch = val.shape[2] if val.ndim == 3 else 1
    v = val.reshape(H, W, ch)
    acc = np.zeros((gh, gw, ch)); cnt = np.zeros((gh, gw))
    ys, xs = np.nonzero(mask)
    np.add.at(acc, (ys // block, xs // block), v[ys, xs])
    np.add.at(cnt, (ys // block, xs // block), 1)
    ok = cnt > block * block * 0.08
    grid = np.zeros_like(acc)
    grid[ok] = acc[ok] / cnt[ok][:, None]
    if not ok.any():
        return np.broadcast_to(v[mask].mean(0) if mask.any() else np.zeros(ch), (H, W, ch)).copy()
    # relleno: cada celda vacía toma la celda válida más cercana
    idx = ndimage.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    grid = grid[idx[0], idx[1]]
    grid = np.stack([ndimage.gaussian_filter(grid[..., c], sigma, mode='nearest') for c in range(ch)], -1)
    # a resolución completa (bilineal)
    yy = (np.arange(H) + 0.5) / block - 0.5; xx = (np.arange(W) + 0.5) / block - 0.5
    out = np.stack([ndimage.map_coordinates(grid[..., c], np.meshgrid(yy, xx, indexing='ij'), order=1, mode='nearest') for c in range(ch)], -1)
    return out if val.ndim == 3 else out[..., 0]


def _norm_conv(val, w, sigma):
    """Media ponderada local (convolución normalizada): extiende el color del papel macizo hacia el filo."""
    num = np.stack([ndimage.gaussian_filter(val[..., c] * w, sigma) for c in range(val.shape[2])], -1)
    den = ndimage.gaussian_filter(w, sigma)[..., None]
    return num / np.maximum(den, 1e-6), den[..., 0]


def matte(rgb, kind=None):
    """rgb float32 HxWx3 (0..1). Devuelve (F rgb des-mezclado, alfa, info)."""
    H, W, _ = rgb.shape
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if kind is None:
        corner = np.concatenate([rgb[:20, :].reshape(-1, 3), rgb[:, :12].reshape(-1, 3)[: 4000]])
        m = np.median(corner, 0)
        kind = 'black' if m.max() < 0.12 else 'green'
    if kind == 'green':
        sig = G - np.maximum(R, B)
        bgSure = (sig > 0.25) & (G > 0.35)
    else:
        sig = rgb.max(-1)
        bgSure = sig < 0.06
    # 1) fondo local
    Bc = _smooth_fill(rgb, bgSure)
    sb = (Bc[..., 1] - np.maximum(Bc[..., 0], Bc[..., 2])) if kind == 'green' else Bc.max(-1)
    # papel seguro: lejos del fondo en la señal
    if kind == 'green':
        fgSure = sig < np.minimum(0.06, sb * 0.15)
    else:
        fgSure = sig > np.maximum(0.25, np.percentile(sig[~bgSure], 30) * 0.8) if (~bgSure).any() else sig > 0.25
    fgSure = ndimage.binary_erosion(fgSure, iterations=3)
    # 2) color del papel cercano
    F0, den = _norm_conv(rgb, fgSure.astype(np.float32), 9)
    F0b, _ = _norm_conv(rgb, fgSure.astype(np.float32), 40)
    wsel = np.clip(den / 0.15, 0, 1)[..., None]
    F0 = F0 * wsel + F0b * (1 - wsel)
    sf = (F0[..., 1] - np.maximum(F0[..., 0], F0[..., 2])) if kind == 'green' else F0.max(-1)
    # 3) alfa en la señal que separa fondo y papel
    if kind == 'green':
        # el color del papel cercano sólo ajusta un poco (un papel azul con bisel blanco no debe dar alfa < 1)
        a = (sb - sig) / np.maximum(sb - np.clip(sf, -0.08, sb * 0.3), 1e-3)
    else:
        a = (sig - sb) / np.maximum(sf - sb, 0.05)
    a = np.clip(a, 0, 1).astype(np.float32)
    a[a < (0.07 if kind == 'black' else 0.025)] = 0
    a[a > 0.975] = 1
    # 4) color sin fondo + sin verde reflejado
    am = np.maximum(a, 1e-3)[..., None]
    F = (rgb - (1 - am) * Bc) / am
    # en los píxeles casi transparentes el des-mezclado es inestable: hacia el color del papel cercano
    t = np.clip((a - 0.1) / 0.5, 0, 1)[..., None]
    F = F * t + F0 * (1 - t)
    if kind == 'green':
        own = np.maximum(F0[..., 1] - np.maximum(F0[..., 0], F0[..., 2]), 0)
        F[..., 1] = np.minimum(F[..., 1], np.maximum(F[..., 0], F[..., 2]) + own + 0.01)
    F = np.clip(F, 0, 1)
    # 5) limpieza: motas aisladas lejos del papel
    lab, n = ndimage.label(a > 0.02)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        big = np.argmax(sizes) + 1
        solid = ndimage.binary_dilation(a > 0.5, iterations=6)
        keep = np.zeros(n + 1, bool); keep[big] = True
        # se conservan las piezas grandes y las que tocan el papel macizo (fibras pegadas)
        touch = ndimage.maximum(solid, lab, range(1, n + 1))
        for i in range(n):
            if sizes[i] > 1500 or touch[i]: keep[i + 1] = True
        a = a * keep[lab]
    # interior macizo: alfa 1 salvo agujeros (zonas finas del papel artesano) que se ven como tal
    if kind == 'black':
        reg = ndimage.binary_fill_holes(ndimage.binary_closing(a > 0.5, iterations=3))
        a[ndimage.binary_erosion(reg, iterations=6)] = 1
    solidIn = ndimage.binary_erosion(a > 0.9, iterations=4)
    a[solidIn & (a > 0.85)] = 1
    return F.astype(np.float32), a.astype(np.float32), {'kind': kind, 'bg': Bc.reshape(-1, 3).mean(0).tolist()}
