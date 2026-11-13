"""Pliegues y arrugas -> plugin/assets/folds/*.png + folds.json

Se usa el sombreado REAL de cada foto (no una reconstrucción): así el pliegue se ve exactamente como en la textura.
Para cada foto (hoja A4 completa, 1055x1491):
  1. se quita la luz de la toma (degradado/viñeteo): se divide por una superficie cuadrática ajustada al logaritmo
     de la luminancia — así se conserva el sombreado de cada panel inclinado (es parte del volumen del pliegue);
  2. se quita el grano del papel de la foto (el grano lo pone el papel elegido) con un filtro bilateral suave
     que respeta las aristas;
  3. se guarda el sombreado relativo (1 = plano) en gris de 8 bits, a resolución completa, con su ganancia.
Las aristas (para el desgaste de la tinta) y el mapa de desplazamiento se calculan en el motor a partir de él.

Grupos = número de líneas de pliegue que se ven (contadas en cada foto); «arrugado» reúne arrugas y pliegues sueltos."""
import json, os, sys
import numpy as np
import cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, REPO

SRC = json.load(open(os.path.join(os.path.dirname(__file__), 'fold_sources.json')))
GROUPS = {
  '1': [1, 17, 19, 20, 22, 2, 25, 35],
  '2': [5, 7, 8, 11, 12, 14, 16, 26, 27, 37, 39, 44, 46, 53, 28, 38, 41],
  '3': [10, 32, 33, 42, 43, 49],
  '4': [9, 31, 45, 0, 3, 4, 18, 23, 15],
  '5': [34, 48, 13, 47],
  '6': [30, 50, 24],
  'arrugado': [55, 56, 57, 65, 67, 68, 51, 52, 64, 69, 70, 76, 77, 78, 80, 58],
  'muy_arrugado': [59, 60, 61, 63, 66, 71, 72, 73, 79, 54, 62, 74, 75],
}
OUT = os.path.join(ASSETS, 'folds')


def shading(path):
    rgb = np.asarray(Image.open(path).convert('RGB'), np.float64) / 255
    L = rgb @ np.array([0.2126, 0.7152, 0.0722])
    h, w = L.shape
    # 1) luz de la toma: superficie cuadrática en log (sobre una versión reducida y robusta)
    sm = cv2.resize(np.log(np.maximum(L, 1e-3)), (w // 8, h // 8), interpolation=cv2.INTER_AREA)
    yy, xx = np.mgrid[0:sm.shape[0], 0:sm.shape[1]]
    X = (xx / sm.shape[1] - 0.5).ravel(); Y = (yy / sm.shape[0] - 0.5).ravel()
    A = np.stack([np.ones_like(X), X, Y, X * X, Y * Y, X * Y], 1)
    z = sm.ravel(); wgt = np.ones_like(z)
    for _ in range(3):   # robusto: las aristas no tiran del ajuste
        c, *_ = np.linalg.lstsq(A * wgt[:, None], z * wgt, rcond=None)
        r = z - A @ c; s = np.median(np.abs(r)) * 1.5 + 1e-6
        wgt = 1 / (1 + (r / s) ** 2)
    Yf, Xf = np.mgrid[0:h, 0:w]
    Xf = Xf / w - 0.5; Yf = Yf / h - 0.5
    base = np.exp(c[0] + c[1] * Xf + c[2] * Yf + c[3] * Xf * Xf + c[4] * Yf * Yf + c[5] * Xf * Yf)
    S = (L / base).astype(np.float32)
    # 2) sin el grano de la foto, con las aristas intactas
    S = cv2.bilateralFilter(S, 7, 0.035, 2.2)
    S = S / np.median(S)
    return S


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    cat = {}
    for gid, srcs in GROUPS.items():
        items = []
        for n, i in enumerate(srcs):
            S = shading(os.path.join(REPO, SRC[str(i)]))
            dev = np.abs(S - 1)
            amp = float(np.percentile(dev, 99.95)) + 1e-4
            gain = 126 / amp
            enc = np.clip(np.round(128 + (S - 1) * gain), 0, 255).astype(np.uint8)
            fn = f'p{gid}_{n}.png'
            Image.fromarray(enc, 'L').save(os.path.join(OUT, fn), optimize=True)
            # fuerza típica (para igualar las hojas de un mismo grupo con el slider)
            strength = float(np.percentile(dev, 99))
            items.append({'file': fn, 'w': enc.shape[1], 'h': enc.shape[0], 'gain': round(gain, 3),
                          'strength': round(strength, 4), 'src': i})
            print(gid, i, enc.shape, 'amp', round(amp, 3), 'p99', round(strength, 3), os.path.getsize(os.path.join(OUT, fn)) // 1024, 'KB', flush=True)
        med = float(np.median([it['strength'] for it in items]))
        for it in items: it['norm'] = round(float(np.clip((med / it['strength']) ** 0.5, 0.75, 1.4)), 3)
        cat[gid] = {'items': items}
    json.dump(cat, open(os.path.join(ASSETS, 'folds.json'), 'w'), ensure_ascii=False, indent=1)
