"""Prueba exacta de PAPELATOR: los assets del plugin son los de siempre.

    python3 tools/test/verificar_assets.py        (desde cualquier carpeta)

Compara el md5 de los píxeles de los 822 PNG de plugin/assets y el md5 de los 6 JSON con tools/test/assets_md5.json.
Sale con código 1 si algo cambia, y dice qué.
"""
import hashlib, json, os, sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(AQUI, '..', '..', 'plugin', 'assets')
ref = json.load(open(os.path.join(AQUI, 'assets_md5.json')))
mal = []
for ruta, md5 in ref['png'].items():
    p = os.path.join(A, ruta)
    if not os.path.exists(p): mal.append(('FALTA', ruta)); continue
    if hashlib.md5(Image.open(p).tobytes()).hexdigest() != md5: mal.append(('CAMBIA', ruta))
for ruta, md5 in ref['json'].items():
    if hashlib.md5(open(os.path.join(A, ruta), 'rb').read()).hexdigest() != md5: mal.append(('CAMBIA', ruta))
sobran = sorted(os.path.relpath(os.path.join(d, f), A).replace(os.sep, '/') for d, _, fs in os.walk(A) for f in fs
                if f.endswith('.png') and os.path.relpath(os.path.join(d, f), A).replace(os.sep, '/') not in ref['png'])
mal += [('SOBRA', s) for s in sobran]
for m in mal: print(*m)
print(len(ref['png']), 'PNG comprobados,', sum(1 for m in mal if m[1].endswith('.png')), 'distintos ·',
      len(ref['json']), 'JSON comprobados,', sum(1 for m in mal if m[1].endswith('.json')), 'distintos')
sys.exit(1 if mal else 0)
