"""Superficies construidas (NUEVAS SUPERFICIES/) -> fondos tileables con mapa de relieve propio.

Cada foto se analiza y se clasifica por lo que es; de eso sale:
  · el tile sin costuras. En las que tienen aparejo (ladrillo, bloques, sillería, adoquín, azulejo, encofrado) el tile
    es un número entero de piezas: el periodo se busca por autocorrelación y se recorta a él antes de coser, así
    las juntas casan en los bordes y no se mezclan dos lecturas (que duplicarían las juntas);
  · si se puede pintar (colorable): gotelé, estuco, yeso, pared lisa, pintura, azulejo y bloque de hormigón se
    guardan sólo como relieve (el color lo eliges tú; «Original» es el suyo). Ladrillo, piedra, adoquín, terrazo,
    granito, asfalto, hormigón visto y metal guardan su color propio y no se pueden pintar;
  · el desplazamiento: dispMm (cuánto se desvía la tinta, en mm del documento) y heightMm (tamaño del relieve que la
    desvía: juntas, grumos, poros). Es mucho mayor que en papel: en una pared la tinta se rompe en cada junta.
docMm = cuánto mide la foto en el documento al 100 % (para que en un A4 se vean unas 5-6 piezas de un aparejo)."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import build_papers as BP
from common import ASSETS, REPO, load, lum, gblur, autocorr_shift

SRC = 'NUEVAS SUPERFICIES/'
SCR = os.environ.get('PAPELATOR_TMP', '/tmp')
G_PARED, G_SUELO, G_METAL = 'Paredes', 'Suelos y piedra', 'Metal'

# tipo: (grupo, colorable, aparejo, docMm, dispMm, heightMm, ficheros)
TYPES = {
  'ladrillo':   (G_PARED, False, True, 262, 1.7, 0.8, ['Muro de ladrillo rojo envejecido.png', 'Pared de ladrillo rojo desgastado.png',
                 'Textura de pared de ladrillo envejecido.png', 'Textura de pared de ladrillo rojo envejecido.png', 'Textura de pared de ladrillo rojo envejecido (1).png']),
  'bloques':    (G_PARED, True, True, 315, 1.5, 0.8, ['Textura de muro de bloques de hormigón.png', 'Textura de muro de bloques de hormigón (1).png',
                 'Textura de pared de bloques de hormigón.png', 'Textura de pared de bloques de hormigón encadenados.png']),
  'sillar':     (G_PARED, False, True, 330, 1.9, 1.0, ['Textura de muro de piedra caliza.png', 'Textura de muro de piedra caliza (1).png',
                 'Textura de muro de piedra caliza envejecida.png', 'Muro de piedra caliza porosa.png']),
  'azulejo':    (G_PARED, True, True, 250, 0.9, 0.35, ['Superficie de azulejos blancos.png', 'Superficie de azulejos blancos glossy.png',
                 'Superficie de azulejos blancos envejecidos.png', 'Pared de azulejos blancos en cuadrícula.png']),
  'gotele':     (G_PARED, True, False, 210, 0.75, 0.6, ['Textura de estuco blanco rugoso.png', 'Textura de estuco blanco rugoso (1).png',
                 'Textura de estuco blanco rugoso (2).png', 'Textura rugosa de estuco blanco.png']),
  'pared_lisa': (G_PARED, True, False, 280, 0.45, 0.5, ['Textura sutil de pared blanca-1.png', 'Textura sutil de pared blanca-2.png',
                 'Textura sutil de pared de estuco.png', 'Pared blanca texturizada con sutiles imperfecciones.png', 'Textura de pared blanca rugosa.png']),
  'pintura':    (G_PARED, True, False, 300, 0.9, 0.7, ['Gemini_Generated_Image_5jrwey5jrwey5jrw.jpg', 'Gemini_Generated_Image_qk3f2bqk3f2bqk3f.jpg',
                 'Textura de pintura gris con grumos y relieves.png', 'Textura de pared gris envejecida.png', 'Textura rugosa de pared gris beige.png']),
  'yeso':       (G_PARED, True, False, 350, 0.5, 1.5, ['Textura de yeso veneciano beige.png', 'Textura de yeso veneciano en tonos cálidos.png',
                 'Textura abstracta de estuco beige y gris.png', 'Textura abstracta de pared beige.png']),
  'hormigon':   (G_SUELO, False, False, 350, 0.6, 0.8, ['Textura de hormigón gris desgastado.png', 'Textura de hormigón gris desgastado (1).png',
                 'Textura de hormigón gris desgastado-1.png', 'Textura de hormigón desgastado-2.png', 'Textura de concreto gris desgastado.png',
                 'Textura de hormigón gris claro.png', 'Textura de hormigón gris mate.png', 'Textura de hormigón beige grisáceo.png']),
  'encofrado':  (G_SUELO, False, True, 250, 0.9, 0.8, ['Textura de hormigón gris con poros y vetas.png', 'Textura de hormigón gris industrial.png',
                 'Textura de hormigón industrial envejecido.png', 'Textura de hormigón industrial envejecido (1).png']),
  'adoquin':    (G_SUELO, False, True, 240, 1.9, 0.8, ['Textura de adoquines de granito gris.png', 'Pavimento de adoquines de granito envejecido.png',
                 'Pavimento de adoquines de granito envejecido (1).png', 'Pavimento de piedra gris texturizada.png']),
  'terrazo':    (G_SUELO, False, False, 336, 0.3, 0.5, ['Superficie de terrazo en tonos neutros.png', 'Textura de terrazo gris con fragmentos de mármol.png',
                 'Textura de terrazo gris con fragmentos minerales.png', 'Textura de terrazo gris con piedras incrustadas.png']),
  'granito':    (G_SUELO, False, False, 280, 0.3, 0.4, ['Textura de granito gris moteado.png', 'Textura de granito gris moteado (1).png',
                 'Textura de granito gris moteado (2).png', 'Textura de granito gris moteado (3).png']),
  'asfalto':    (G_SUELO, False, False, 350, 0.8, 0.5, ['Textura de asfalto rugoso.png', 'Textura de asfalto rugoso con grava.png',
                 'Textura de asfalto granulado.png', 'Textura granular de asfalto oscuro.png']),
  'acero':      (G_METAL, False, False, 250, 0.15, 0.2, ['Textura de Acero Cepillado.png', 'Textura de Acero Cepillado Horizontალური.png',
                 'Textura de acero inoxidable cepillado.png', 'Textura de acero inoxidable cepillado (1).png']),
  'oxido':      (G_METAL, False, False, 300, 0.8, 0.5, ['Textura de metal oxidado.png', 'Textura de metal oxidado (1).png',
                 'Textura de metal oxidado (2).png', 'Textura de metal oxidado (3).png']),
}
NAMES = {'ladrillo': 'Ladrillo', 'bloques': 'Bloque de hormigón', 'sillar': 'Piedra de sillería', 'azulejo': 'Azulejo', 'gotele': 'Gotelé',
         'pared_lisa': 'Pared lisa', 'pintura': 'Pintura con grumos', 'yeso': 'Yeso veneciano', 'hormigon': 'Hormigón', 'encofrado': 'Hormigón encofrado',
         'adoquin': 'Adoquín', 'terrazo': 'Terrazo', 'granito': 'Granito', 'asfalto': 'Asfalto', 'acero': 'Acero cepillado', 'oxido': 'Metal oxidado'}
O = BP.O


def prepare(path, tid, n, pattern):
    """Recorta la foto a un número entero de piezas (si tiene aparejo) para que BP.process cosa en ese periodo."""
    im = Image.open(os.path.join(REPO, path)).convert('RGB')
    if im.width > 1400: im = im.resize((1254, 1254), Image.LANCZOS)
    W, H = im.size
    if not pattern: return im, W
    a = np.asarray(im, np.float32) / 255
    L = lum(a); hp = L - gblur(L, 20)
    s, _ = autocorr_shift(hp, 1, int(W * 0.5), W - O - 4)
    t, _ = autocorr_shift(hp, 0, int(H * 0.5), H - O - 4)
    return im.crop((0, 0, s + O + 4, t + O + 4)), W


if __name__ == '__main__':
    only = sys.argv[1:]
    catp = os.path.join(ASSETS, 'papers.json')
    cat = json.load(open(catp))
    cat = [p for p in cat if not (p.get('material') == 'surface' and (not only or p['id'].rsplit('_', 1)[0] in only))]
    BP.T = ''
    types = {}
    for tid, (grp, colorable, pattern, docMm, dispMm, heightMm, files) in TYPES.items():
        if only and tid not in only: continue
        ids = []
        for n, f in enumerate(files):
            pid = f'{tid}_{n + 1}'
            im, W0 = prepare(SRC + f, tid, n, pattern)
            tmp = os.path.join(SCR, pid + '_src.png'); im.save(tmp)
            mm = docMm * im.width / W0
            BP.TRANSLUCENT[pid] = 0.0
            info = BP.process((pid, NAMES[tid] + ' ' + str(n + 1), grp, tmp, 'neutral' if colorable else 'color', {'mm': mm, 'chroma': 4}))
            info['source'] = SRC + f
            info.update(material='surface', surface=tid, colorable=colorable, dispMm=dispMm, heightMm=heightMm, ageK=0.2)
            if pattern: info['mix'] = 'none'
            # rugosidad y grano (como build_extras)
            from build_boards import extras
            extras(info)
            print(pid, info['size'], info['tileMm'], 'rough', info['rough'], 'seam', info['seam'], flush=True)
            cat.append(info); ids.append(pid)
        types[tid] = ids
    json.dump(cat, open(catp, 'w'), ensure_ascii=False, indent=1)
    json.dump(types, open(os.path.join(SCR, 'surface_types.json'), 'w'))
