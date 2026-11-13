"""Fondos de madera y cartón (NUEVAS_NUEVAS/) -> tiles sin costuras, igual que los papeles (build_papers.process).
Se añaden a papers.json con 'material' = 'wood' | 'carton', que el motor usa para decidir qué imperfecciones
y efectos tienen sentido (la madera no se dobla, no transparenta, no coge foxing ni marcas de escritura…).

Tamaños reales (anchura de la foto):
  madera de abedul (contrachapado) 300 mm · OSB 420 mm (virutas de 5-10 cm) · aglomerado 150 mm (partículas 1-4 mm)
  cartón de caja: la cara exterior deja ver la onda de debajo (paso de 6,5 mm) · cartón kraft liso 120 mm"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
import build_papers as BP
from common import ASSETS, REPO

SCR = os.environ.get('PAPELATOR_TMP', '/tmp')
N = 'NUEVAS_NUEVAS/'
G = 'Maderas y cartones'
BOARDS = [
  ('madera', 'Madera de abedul', G, N + 'Textura de madera de abedul claro.png', 'color', {'mm': 300, 'chroma': 4}, 'wood'),
  ('madera_vetas', 'Madera de vetas onduladas', G, N + 'Textura de madera clara con vetas onduladas.png', 'color', {'mm': 300, 'chroma': 4}, 'wood'),
  ('madera_clara', 'Madera clara', G, N + 'Textura de madera clara y natural-1.png', 'color', {'mm': 300, 'chroma': 4}, 'wood'),
  ('madera_nudos', 'Madera de abedul con nudos', G, N + 'Textura natural de madera de abedul-2.png', 'color', {'mm': 300, 'chroma': 4}, 'wood'),
  ('osb', 'OSB', G, N + 'Textura de tablero OSB de madera natural.png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_prensado', 'OSB prensado', G, N + 'Textura de tablero OSB de madera prensada.png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_detalle', 'OSB de virutas grandes', G, N + 'Textura detallada de tablero OSB de madera.png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_detalle2', 'OSB de virutas grandes II', G, N + 'Textura detallada de tablero OSB de madera (1).png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_fino', 'OSB de virutas finas', G, N + 'Textura detallada de tablero OSB.png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_realista', 'OSB natural', G, N + 'Textura realista de tablero OSB de madera.png', 'color', {'mm': 420, 'chroma': 3}, 'wood'),
  ('osb_viejo', 'OSB a la intemperie', G, N + 'Gemini_Generated_Image_bpp2f4bpp2f4bpp2.jpg', 'color', {'mm': 600, 'chroma': 3}, 'wood'),
  ('aglomerado', 'Aglomerado', G, N + 'Textura realista de aglomerado de madera.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('aglomerado_marron', 'Aglomerado marrón', G, N + 'Textura de aglomerado de madera marrón.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('aglomerado_granular', 'Aglomerado granular', G, N + 'Textura granular de aglomerado de madera.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('aglomerado_uniforme', 'Aglomerado uniforme', G, N + 'Textura uniforme de aglomerado de madera.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('particulas', 'Tablero de partículas', G, N + 'Textura uniforme de tablero de partículas de madera.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('virutas', 'Virutas prensadas', G, N + 'Textura uniforme de virutas de madera.png', 'color', {'mm': 150, 'chroma': 3}, 'wood'),
  ('caja', 'Cartón de caja', G, N + 'Textura de cartón corrugado marrón.png', 'color', {'flute': 6.5}, 'carton'),
  ('caja_3', 'Cartón de caja III', G, N + 'Textura de cartón corrugado marrón (2).png', 'color', {'mm': 160, 'chroma': 3}, 'carton'),
  ('caja_4', 'Cartón de caja IV', G, N + 'Textura de cartón corrugado marrón (3).png', 'color', {'flute': 6.5}, 'carton'),
  ('caja_kraft', 'Cartón de caja kraft', G, N + 'Textura de cartón corrugado kraft.png', 'color', {'mm': 160, 'chroma': 3}, 'carton'),
  ('caja_kraft_2', 'Cartón de caja kraft II', G, N + 'Textura de cartón kraft corrugado.png', 'color', {'flute': 6.5}, 'carton'),
  ('caja_kraft_3', 'Cartón de caja kraft III', G, N + 'Textura de cartón kraft corrugado (1).png', 'color', {'flute': 6.5}, 'carton'),
  ('caja_kraft_4', 'Cartón de caja kraft IV', G, N + 'Textura de cartón kraft corrugado (2).png', 'color', {'flute': 6.5}, 'carton'),
  ('caja_kraft_5', 'Cartón de caja kraft V', G, N + 'Textura de cartón kraft corrugado (3).png', 'color', {'mm': 160, 'chroma': 3}, 'carton'),
  ('caja_reciclado', 'Cartón de caja reciclado', G, 'ROT:' + N + 'Textura de cartón corrugado reciclado.png', 'color', {'flute': 6.5}, 'carton'),
  ('carton_kraft', 'Cartón kraft liso', G, N + 'Textura uniforme de cartón kraft marrón.png', 'color', {'mm': 120, 'chroma': 4}, 'carton'),
  ('carton_kraft_2', 'Cartón kraft liso II', G, N + 'Textura uniforme de cartón kraft marrón (1).png', 'color', {'mm': 120, 'chroma': 4}, 'carton'),
  ('carton_kraft_3', 'Cartón kraft liso III', G, N + 'Textura uniforme de cartón kraft marrón (2).png', 'color', {'mm': 120, 'chroma': 4}, 'carton'),
]
AGE = {'wood': 0.55, 'carton': 1.2}


def extras(p):
    """rugosidad y tamaño de grano, como build_extras.py"""
    d = np.asarray(Image.open(f"{ASSETS}/papers/{p['id']}_d.png"), np.float32)
    d = (d - 128) / p['gain']
    hp = d - ndimage.gaussian_filter(d, 10, mode='wrap')
    c = hp[:512, :512]
    F = np.fft.fft2(c - c.mean()); ac = np.real(np.fft.ifft2(F * np.conj(F))); ac /= ac[0, 0]
    prof = (ac[0, :60] + ac[:60, 0]) / 2
    lag = int(np.argmax(prof < 0.5)) or 1
    p['rough'] = round(float(hp.std()), 5)
    p['grainMm'] = round(max(0.05, lag * p['tileMm'][0] / p['size'][0]), 4)


if __name__ == '__main__':
    only = sys.argv[1:]
    catp = os.path.join(ASSETS, 'papers.json')
    cat = json.load(open(catp))
    byid = {p['id']: i for i, p in enumerate(cat)}
    for pid, name, group, fname, kind, extra, mat in BOARDS:
        if only and pid not in only: continue
        if fname.startswith('ROT:'):
            # ondas en vertical: se gira para que el paso de la onda quede en filas, como en los demás
            src = fname[4:]
            tmp = os.path.join(SCR, pid + '_rot.png')
            Image.open(os.path.join(REPO, src)).convert('RGB').rotate(90, expand=True).save(tmp)
            fname = tmp
        BP.T = ''
        BP.TRANSLUCENT[pid] = 0.0
        info = BP.process((pid, name, group, fname if os.path.isabs(fname) else fname, kind, extra))
        info['source'] = fname if not os.path.isabs(fname) else 'ROT:' + src
        info['material'] = mat
        info['ageK'] = AGE[mat]
        if pid.startswith('caja'): info['mix'] = 'x'      # la onda de debajo es regular: sólo se mezcla a lo largo
        if mat == 'wood': info['reliefAdj'] = 0.8
        extras(info)
        print(pid, info['size'], info['tileMm'], 'rough', info['rough'], 'grain', info['grainMm'], 'seam', info['seam'], flush=True)
        if pid in byid: cat[byid[pid]] = info
        else: byid[pid] = len(cat); cat.append(info)
    # el cartón ondulado que ya existía también es cartón
    for p in cat:
        if p['id'] in ('corrugado', 'corrugado_fino'): p['material'] = 'carton'; p['group'] = G
    json.dump(cat, open(catp, 'w'), ensure_ascii=False, indent=1)
