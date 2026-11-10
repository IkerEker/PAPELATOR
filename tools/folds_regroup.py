"""Reagrupa folds.json según el número real de paneles (pliegues contados en cada textura) y normaliza la fuerza
de cada hoja dentro de su grupo (que ninguna variante de «por la mitad» quede casi invisible).
Los grupos por número de foto de origen (src):"""
import json, os
import numpy as np
from common import ASSETS
GROUPS = {
  'mitad':            ('Por la mitad', [1, 17, 19, 20, 22]),
  'mitad_gastado':    ('Por la mitad, gastado', [2, 25, 35]),
  'cuatro':           ('En cuatro', [5, 7, 8, 11, 12, 14, 16, 26, 27, 37, 39, 44, 46, 53]),
  'cuatro_gastado':   ('En cuatro, gastado', [28, 38, 41]),
  'seis':             ('En seis', [10, 32, 33, 42, 43, 49]),
  'ocho':             ('En ocho', [9, 31, 45]),
  'nueve':            ('En nueve', [0, 3, 4, 18, 23]),
  'cuadricula':       ('Muchas veces', [34, 48, 13, 30, 47, 50]),
  'acordeon':         ('Acordeón', [24, 15]),
  'casual':           ('Pliegues sueltos', [51, 52, 64, 69, 70, 76, 77, 78, 80]),
  'arrugado_suave':   ('Arrugado suave', [55, 56, 57, 65, 67, 68]),
  'arrugado':         ('Arrugado', [58, 59, 60, 61, 63, 66, 71, 72, 73, 79]),
  'arrugado_plegado': ('Arrugado y plegado', [54, 62, 74, 75]),
}
p = os.path.join(ASSETS, 'folds.json')
old = json.load(open(p))
bysrc = {it['src']: it for v in old.values() for it in v['items']}
new = {}
for cid, (name, srcs) in GROUPS.items():
    items = [dict(bysrc[s]) for s in srcs]
    med = float(np.median([it['gmax'] for it in items]))
    for it in items: it['gain'] = round(float(np.clip((med / it['gmax']) ** 0.6, 0.75, 1.5)), 3)
    new[cid] = {'name': name, 'items': items}
assert sum(len(v['items']) for v in new.values()) == len(bysrc), 'faltan texturas'
json.dump(new, open(p, 'w'), ensure_ascii=False, indent=1)
for k, v in new.items(): print(k, len(v['items']), [it['gain'] for it in v['items']])
