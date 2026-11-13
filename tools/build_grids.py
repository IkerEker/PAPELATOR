"""Papeles milimetrados con geometría exacta.
Las fuentes tienen el aspecto bueno (color, grosor, papel) pero su geometría no es la de un milimetrado real
(líneas medias cada 8 mm, líneas desiguales, dobles). Aquí la tinta se vuelve a trazar exacta (1 / 5 / 10 mm)
con el color y grosor medidos en cada fuente, con leves variaciones de imprenta, y el papel (detalle) se
re-muestrea de forma periódica al mismo tile."""
import json, os
import numpy as np
from PIL import Image
from common import ASSETS

PPMM = 12            # px por mm del tile
TILE = 100           # mm (múltiplo de 10)
# color multiplicativo (r,g,b) y grosor (mm) de cada orden de línea: menor 1 mm, media 5 mm, mayor 10 mm
SPEC = {
  'milimetrado':         dict(minor=((0.80, 0.875, 0.93), 0.085), mid=((0.60, 0.75, 0.86), 0.13), major=((0.93, 0.30, 0.28), 0.17)),
  'milimetrado_naranja': dict(minor=((0.988, 0.875, 0.76), 0.085), mid=((0.972, 0.77, 0.57), 0.12), major=((0.955, 0.56, 0.22), 0.19)),
  'milimetrado_azul':    dict(minor=((0.80, 0.915, 0.96), 0.085), mid=((0.62, 0.81, 0.905), 0.12), major=((0.33, 0.665, 0.845), 0.19)),
}

def per_noise(n, sigma_px, seed):
    """ruido periódico (tileable) de media 0 y desviación 1"""
    r = np.random.default_rng(seed).standard_normal((n, n))
    f = np.fft.fftfreq(n)
    g = np.exp(-(f[:, None] ** 2 + f[None, :] ** 2) * (2 * np.pi * sigma_px) ** 2 / 2)
    a = np.real(np.fft.ifft2(np.fft.fft2(r) * g))
    return a / (a.std() + 1e-9)

def fourier_resize(a, n):
    """re-muestreo periódico exacto (conserva el tile sin costura)"""
    h, w = a.shape
    F = np.fft.fftshift(np.fft.fft2(a))
    out = np.zeros((n, n), complex)
    hh, ww = min(h, n), min(w, n)
    cy, cx = h // 2, w // 2; oy, ox = n // 2, n // 2
    out[oy - hh // 2:oy - hh // 2 + hh, ox - ww // 2:ox - ww // 2 + ww] = F[cy - hh // 2:cy - hh // 2 + hh, cx - ww // 2:cx - ww // 2 + ww]
    return np.real(np.fft.ifft2(np.fft.ifftshift(out))) * (n * n) / (h * w)

def coverage(n, pitch_px, width_px, offset_px, ss=4):
    """cobertura (0..1) de líneas paralelas, antialias por superposición de muestras"""
    x = (np.arange(n * ss) + 0.5) / ss
    d = np.abs(((x - offset_px + pitch_px / 2) % pitch_px) - pitch_px / 2)
    c = np.clip(width_px / 2 + 0.5 / ss - d, 0, 1 / ss) * ss
    return c.reshape(n, ss).mean(1)

def synth_paper(n, std, seed):
    """detalle de papel con el espectro radial medido en el folio (mm reales), fase aleatoria"""
    ref = next(q for q in papers if q['id'] == 'folio')
    d = np.asarray(Image.open(os.path.join(ASSETS, 'papers/folio_d.png')).convert('L'), np.float64)
    d = (d - d.mean()) / ref['gain']
    m = d.shape[0]; mm_ref = ref['tileMm'][0] / m
    P = np.abs(np.fft.fft2(d)) ** 2
    fr = np.hypot(*np.meshgrid(np.fft.fftfreq(m), np.fft.fftfreq(m))) / mm_ref     # ciclos/mm
    bins = np.linspace(0, fr.max(), 200)
    idx = np.digitize(fr.ravel(), bins)
    prof = np.array([P.ravel()[idx == i].mean() if np.any(idx == i) else 0 for i in range(len(bins) + 1)])
    f2 = np.hypot(*np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n))) * PPMM
    amp = np.sqrt(np.interp(f2, bins, prof[1:len(bins) + 1]))
    amp[0, 0] = 0
    ph = np.exp(2j * np.pi * np.random.default_rng(seed).random((n, n)))
    a = np.real(np.fft.ifft2(amp * ph))
    return a / (a.std() + 1e-12) * std

papers = json.load(open(os.path.join(ASSETS, 'papers.json')))
for p in papers:
    if p['id'] not in SPEC: continue
    sp = SPEC[p['id']]
    n = TILE * PPMM
    off = PPMM * 0.5                       # las líneas no caen en el borde del tile
    ink = np.ones((n, n, 3))
    dens = 1 + 0.05 * per_noise(n, 9 * PPMM, 1)          # densidad de tinta de la imprenta (manchas amplias)
    fine = 1 + 0.07 * per_noise(n, 0.06 * PPMM, 2)       # borde de la línea sobre la fibra
    for order, pitch in (('minor', 1), ('mid', 5), ('major', 10)):
        col, wmm = sp[order]
        cx = coverage(n, pitch * PPMM, wmm * PPMM, off)
        cov = np.maximum(cx[None, :], cx[:, None])
        # cada línea con su propia carga de tinta (±4 %)
        rng = np.random.default_rng(hash(order) % 1000 + 7)
        k = 1 + 0.04 * rng.standard_normal(TILE // pitch + 1)
        idx = np.clip(((np.arange(n) - off) / (pitch * PPMM) + 0.5).astype(int), 0, len(k) - 1)
        lk = np.maximum(k[idx][None, :] * (cx[None, :] >= cx[:, None]), k[idx][:, None] * (cx[:, None] > cx[None, :]))
        c = np.clip(cov * lk * dens * fine, 0, 1)[..., None]
        # cada orden tapa al anterior donde se cruzan (se imprimen a la vez, no se suman)
        ink = ink * (1 - c) + np.array(col) * c if order != 'minor' else 1 - (1 - np.array(col)) * c
    Image.fromarray((np.clip(ink, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(ASSETS, f"papers/{p['id']}_ink.png"), optimize=True)
    # papel: el detalle de la fuente arrastra restos de las líneas viejas. Se sintetiza un papel nuevo con el
    # mismo espectro (nube de formación + grano) que el folio de oficina, periódico por construcción.
    dd = synth_paper(n, p['detailStd'], seed=hash(p['id']) % 999)
    gain = p['gain']
    Image.fromarray(np.clip(128 + dd * gain, 0, 255).astype(np.uint8), 'L').save(os.path.join(ASSETS, f"papers/{p['id']}_d.png"), optimize=True)
    p['tileMm'] = [float(TILE), float(TILE)]
    p['size'] = [n, n]
    p['grid'] = '1/5/10 mm'
    print(p['id'], 'ok', n)
json.dump(papers, open(os.path.join(ASSETS, 'papers.json'), 'w'), ensure_ascii=False, indent=1)
