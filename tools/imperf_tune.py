"""Ajuste de color de las manchas: el café seco es pardo (no gris). En las fotos de origen los bordes más
oscuros del cerco salen desaturados; se lleva la absorbancia hacia la proporción del café real
(R:G:B ≈ 0.38 : 0.62 : 1) conservando parte de la variación propia. Ejecutar una sola vez sobre los mapas originales."""
import json, os
import numpy as np
from PIL import Image
from common import ASSETS
TARGET = {'cafe': (0.38, 0.62, 1.0), 'salp_cafe': (0.38, 0.62, 1.0)}
MIX = 0.75
cat = json.load(open(os.path.join(ASSETS, 'imperf.json')))
for cid, tgt in TARGET.items():
    C = cat[cid]
    files = [it['file'] for it in C.get('items', [])] or [C['atlas']]
    t = np.array(tgt); t = t / t.sum()
    for f in files:
        p = os.path.join(ASSETS, 'imperf', f)
        im = Image.open(p); mode = im.mode
        a = np.asarray(im.convert('RGBA' if mode == 'RGBA' else 'RGB')).astype(np.float64) / 255
        rgb = a[..., :3]
        A = -np.log(np.clip(rgb, 1 / 255, 1))
        tot = A.sum(-1, keepdims=True)
        # los bordes del cerco venían quemados a negro (absorbancia saturada): se comprime la cantidad total
        # (sin tocar el tono) para que al dar opacidad no se vuelva gris
        tc = tot / (1 + tot / 1.6)
        A = A * (tc / np.maximum(tot, 1e-6)); tot = tc
        A2 = A * (1 - MIX) + tot * t * MIX
        out = np.exp(-A2)
        a[..., :3] = out
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA' if mode == 'RGBA' else 'RGB').save(p, optimize=True)
        print(cid, f, mode)
