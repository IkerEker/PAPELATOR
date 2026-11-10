"""Correcciones finales de papers.json (ejecutar después de build_papers / build_extras / build_grids).
- Acuarela de grano grueso: la escala de la foto era ~1,5x mayor que la real (granos de 2-4 mm, no 6-10).
- Cartón ondulado: la mezcla anti-repetición sólo se desplaza a lo largo de la onda (si no, rompe las ondas).
- Verjurado: no se mezcla (corondeles y puntizones son regulares; mezclar los duplica)."""
import json, os
from common import ASSETS
p = os.path.join(ASSETS, 'papers.json'); ps = json.load(open(p))
for q in ps:
    if q['id'] in ('acuarela_grueso', 'acuarela_grueso_2') and q['tileMm'][0] > 100:
        q['tileMm'] = [round(v * 0.65, 2) for v in q['tileMm']]; q['grainMm'] = round(q['grainMm'] * 0.65, 4)
    if q['id'] in ('corrugado', 'corrugado_fino'): q['mix'] = 'x'
    if q['id'] in ('verjurado', 'verjurado_marfil'): q['mix'] = 'none'
json.dump(ps, open(p, 'w'), ensure_ascii=False, indent=1)
