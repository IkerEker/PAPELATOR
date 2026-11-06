"""Datos adicionales para el motor v3:
- papers.json: 'rough' (relieve de grano, alta frecuencia), 'grainMm' (tamaño típico del grano),
  'ageK' (velocidad de envejecimiento según la pasta: lignina > química > trapo).
- imperf/sheet_*.png: manchas de papel envejecido a hoja completa (de las imágenes 'cuadradas'),
  que se aplican cubriendo todo el papel, nunca como un sello cuadrado.
- elimina el óxido de clip."""
import json, os, glob
import numpy as np
from scipy import ndimage
from PIL import Image
from common import *
from imperf_lib import multiply_map, bbox

A = ASSETS
cat = json.load(open(A + '/papers.json'))
AGE = {'periodico': 1.6, 'periodico_gris': 1.6, 'kraft': 1.25, 'kraft_claro': 1.25, 'reciclado': 1.3, 'reciclado_motas': 1.3,
       'reciclado_gris': 1.3, 'corrugado': 1.2, 'corrugado_fino': 1.2, 'cartulina_gris': 1.1, 'algodon': 0.7, 'algodon_crema': 0.7,
       'bristol': 0.8, 'acuarela_grueso': 0.7, 'acuarela_grueso_2': 0.7, 'acuarela_fino': 0.7, 'acuarela_satinada': 0.7,
       'vegetal': 0.8, 'vegetal_arrugado': 0.8, 'encerado': 0.6, 'horno': 0.6, 'pergamino': 0.6, 'pergamino_oscuro': 0.6}
for p in cat:
    d = np.asarray(Image.open(f"{A}/papers/{p['id']}_d.png"), np.float32)
    d = (d - 128) / p['gain']
    hp = d - ndimage.gaussian_filter(d, 10, mode='wrap')
    rough = float(hp.std())
    # longitud de correlación del grano (px -> mm)
    c = hp[:512, :512]
    F = np.fft.fft2(c - c.mean()); ac = np.real(np.fft.ifft2(F * np.conj(F))); ac /= ac[0, 0]
    prof = (ac[0, :60] + ac[:60, 0]) / 2
    lag = int(np.argmax(prof < 0.5)) or 1
    mmpp = p['tileMm'][0] / p['size'][0]
    p['rough'] = round(rough, 5)
    p['grainMm'] = round(max(0.05, lag * mmpp), 4)
    p['ageK'] = AGE.get(p['id'], 1.0)
    print(f"{p['id']:22s} rough {rough:.4f} grain {p['grainMm']:.3f} mm")
json.dump(cat, open(A + '/papers.json', 'w'), ensure_ascii=False, indent=1)

# ---- manchas de envejecimiento a hoja completa
IDX = dict(json.load(open('/tmp/claude-0/-home-claude/7670252d-a654-52b9-a1b1-4f0466e0fd73/scratchpad/sheets/imp_index.json')))
icat = json.load(open(A + '/imperf.json'))
items = []
for n, i in enumerate([8, 9, 10, 41, 52, 58, 59]):
    rgb = load(IDX[i])
    m = multiply_map(rgb, 0.01)
    mask = m.min(-1) < 0.97
    y0, y1, x0, x1 = bbox(mask, 0)
    # interior del rectángulo (sin los bordes rectos)
    iy, ix = int((y1 - y0) * 0.14), int((x1 - x0) * 0.14)
    c = m[y0 + iy:y1 - iy, x0 + ix:x1 - ix]
    # sólo la variación: tono medio neutralizado aparte (se guarda como color medio)
    mean = c.reshape(-1, 3).mean(0)
    rel = c / mean
    im = Image.fromarray(np.clip(rel * 0.5 * 255, 0, 255).astype(np.uint8)).resize((768, 1086), Image.LANCZOS)
    fn = f'sheet_{n}.png'
    im.save(f'{A}/imperf/{fn}', optimize=True)
    items.append({'file': fn, 'w': 768, 'h': 1086, 'mean': [round(float(v), 4) for v in mean], 'src': i})
icat['manchado'] = {'name': 'Manchado de envejecimiento', 'kind': 'sheet', 'mode': 'multiply', 'place': 'sheet', 'opacity': 0.5, 'items': items}
# fuera: óxido de clip y la versión 'sello' de la migración ácida
for k in ('clip', 'acida'):
    if k in icat:
        for it in icat[k].get('items', []):
            for f in (it['file'], it['file'].replace('.png', '_m.png')):
                if os.path.exists(f'{A}/imperf/{f}'): os.remove(f'{A}/imperf/{f}')
        del icat[k]
json.dump(icat, open(A + '/imperf.json', 'w'), ensure_ascii=False, indent=1)
print('sheets', len(items))
