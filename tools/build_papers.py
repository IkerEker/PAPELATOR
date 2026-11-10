"""Convierte las texturas de texturas_tileables/ en tiles sin costuras para el plugin.
- neutral: sólo el detalle (grano, fibras, relieve) en gris; el color lo elige el usuario.
- color:   se guarda también el color propio (kraft, cartón, pergamino, motas de colores).
- pattern: el papel se separa de la tinta impresa (rayas, cuadrícula...) y el tile se ajusta
           a un número entero de periodos para que las líneas coincidan en los bordes."""
import json, os, sys
import numpy as np
from scipy import ndimage
from common import *

T = 'texturas_tileables/'
# id, nombre, grupo, fichero, tipo, anchura real del original (mm) o periodo real (mm), extra
PAPERS = [
  # ---- Con patrones y guías
  ('rayado', 'Rayado', 'Patrones', 'Papel rayado azul minimalista.png', 'pattern', {'py': 8}),
  ('rayado_tenue', 'Rayado tenue', 'Patrones', 'Textura de papel rayado azul tenue.png', 'pattern', {'py': 8}),
  ('cuadricula', 'Cuadriculado grande', 'Patrones', 'Papel milimetrado azul sobre blanco.png', 'pattern', {'px': 5, 'py': 5}),
  ('cuadricula_clara', 'Cuadriculado claro', 'Patrones', 'Papel cuadriculado azul claro.png', 'pattern', {'px': 5, 'py': 5}),
  ('milimetrado', 'Milimetrado azul y rojo', 'Patrones', 'Papel cuadriculado técnico azul y rojo.png', 'pattern', {'px': 1, 'py': 1}),
  ('milimetrado_naranja', 'Milimetrado naranja', 'Patrones', 'Papel cuadriculado naranja uniforme.png', 'pattern', {'px': 1, 'py': 1}),
  ('milimetrado_azul', 'Milimetrado azul', 'Patrones', 'Cuadrícula de papel milimetrado azul.png', 'pattern', {'px': 1, 'py': 1}),
  ('punteado', 'Punteado', 'Patrones', 'Textura de papel punteado minimalista.png', 'pattern', {'px': 5, 'py': 5}),
  ('punteado_suave', 'Punteado suave', 'Patrones', 'Textura de papel cuadriculado punteado.png', 'pattern', {'px': 5, 'py': 5}),
  ('isometrico', 'Isométrico', 'Patrones', 'Papel cuadriculado isométrico azul pálido (1).png', 'pattern', {'px': 5, 'axis': 'x'}),
  ('triangular', 'Isométrico triangular', 'Patrones', 'Papel milimetrado triangular azul pálido.png', 'pattern', {'px': 5, 'axis': 'x'}),
  ('pentagrama', 'Pentagrama', 'Patrones', 'Papel pautado musical minimalista.png', 'pattern', {'py': 2}),
  # ---- Bellas artes
  ('acuarela_grueso', 'Acuarela grano grueso', 'Bellas artes', 'Textura de papel acuarela blanco rugoso.png', 'neutral', {'mm': 120}),
  ('acuarela_grueso_2', 'Acuarela grano grueso II', 'Bellas artes', 'Textura de papel acuarela blanco.png', 'neutral', {'mm': 120}),
  ('acuarela_fino', 'Acuarela grano fino', 'Bellas artes', 'Textura de papel acuarela marfil fina.png', 'neutral', {'mm': 70}),
  ('acuarela_satinada', 'Acuarela satinada', 'Bellas artes', 'Textura uniforme de papel acuarela blanco cálido.png', 'neutral', {'mm': 70}),
  ('bristol', 'Vitela / Bristol', 'Bellas artes', 'Textura de papel blanco uniforme.png', 'neutral', {'mm': 60}),
  ('folio', 'Folio blanco', 'Bellas artes', 'Textura sutil de papel blanco.png', 'neutral', {'mm': 60}),
  ('papel_fino', 'Papel blanco fino', 'Bellas artes', 'Textura de papel blanco fino.png', 'neutral', {'mm': 60}),
  ('verjurado', 'Verjurado', 'Bellas artes', 'Textura de papel verjurado color crema.png', 'neutral', {'mm': 120}),
  ('verjurado_marfil', 'Verjurado marfil', 'Bellas artes', 'Textura sutil de papel verjurado marfil.png', 'neutral', {'mm': 110}),
  ('algodon', 'Algodón', 'Bellas artes', 'Textura de papel marfil artesanal.png', 'neutral', {'mm': 100}),
  ('algodon_crema', 'Algodón crema', 'Bellas artes', 'Textura de papel artesanal crema suave.png', 'neutral', {'mm': 100}),
  ('arroz', 'Papel de arroz', 'Bellas artes', 'Textura de papel de arroz fibroso.png', 'neutral', {'mm': 150}),
  ('arroz_dorado', 'Arroz con fibras doradas', 'Bellas artes', 'Textura de papel de arroz fibroso (1).png', 'color', {'mm': 150, 'chroma': 2}),
  ('arroz_artesanal', 'Arroz artesanal', 'Bellas artes', 'Textura de papel de arroz artesanal.png', 'neutral', {'mm': 150}),
  # ---- Rústicos y orgánicos
  ('kraft', 'Kraft', 'Rústicos', 'Textura de papel kraft marrón fibroso.png', 'color', {'mm': 70}),
  ('kraft_claro', 'Kraft claro', 'Rústicos', 'Textura de papel kraft marrón fibroso (1).png', 'color', {'mm': 70}),
  ('reciclado', 'Reciclado', 'Rústicos', 'Textura de papel reciclado fibroso (2).png', 'color', {'mm': 80}),
  ('reciclado_motas', 'Reciclado con motas', 'Rústicos', 'Textura de papel reciclado multicolor.png', 'color', {'mm': 110, 'chroma': 2}),
  ('reciclado_gris', 'Reciclado gris', 'Rústicos', 'Textura uniforme de papel gris reciclado.png', 'neutral', {'mm': 70}),
  ('hecho_mano', 'Hecho a mano', 'Rústicos', 'Textura de papel artesanal marfil.png', 'neutral', {'mm': 110}),
  ('hecho_mano_grumos', 'Hecho a mano con grumos', 'Rústicos', 'Textura de papel artesanal marfil-2.png', 'neutral', {'mm': 110}),
  ('hecho_mano_fibroso', 'Hecho a mano fibroso', 'Rústicos', 'Textura de papel artesanal fibroso.png', 'neutral', {'mm': 110}),
  ('pergamino', 'Pergamino', 'Rústicos', 'Textura de pergamino envejecido-2.png', 'color', {'mm': 240}),
  ('pergamino_oscuro', 'Pergamino envejecido', 'Rústicos', 'Textura de pergamino envejecido.png', 'color', {'mm': 240}),
  ('pergamino_blanco', 'Pergamino blanco', 'Rústicos', 'Textura de pergamino blanco arrugado.png', 'neutral', {'mm': 160}),
  ('corrugado', 'Cartón corrugado', 'Rústicos', 'Textura de cartón corrugado kraft-2.png', 'color', {'flute': 7.5}),
  ('corrugado_fino', 'Cartón corrugado fino', 'Rústicos', 'Textura de cartón corrugado kraft unerquicklich.png', 'color', {'flute': 5}),
  # ---- Técnicos y translúcidos
  ('periodico', 'Periódico', 'Técnicos', 'Textura uniforme de papel de periódico.png', 'neutral', {'mm': 50}),
  ('periodico_gris', 'Periódico gris', 'Técnicos', 'Textura uniforme de papel de periódico (2).png', 'neutral', {'mm': 50}),
  ('vegetal', 'Vegetal / cebolla', 'Técnicos', 'Papel translúcido texturizado en blanco roto-2.png', 'neutral', {'mm': 80}),
  ('vegetal_arrugado', 'Vegetal arrugado', 'Técnicos', 'Textura arrugada de papel translúcido blanco.png', 'neutral', {'mm': 150}),
  ('encerado', 'Encerado', 'Técnicos', 'Textura de papel encerado arrugado (1).png', 'neutral', {'mm': 160}),
  ('horno', 'Papel de horno', 'Técnicos', 'Textura de papel de horno arrugado.png', 'neutral', {'mm': 160}),
  ('cartulina_gris', 'Cartulina gris', 'Técnicos', 'Textura de papel gris uniforme.png', 'neutral', {'mm': 60}),
]

# translucidez (cuánto deja ver el calco) y relieve relativo
TRANSLUCENT = {'arroz': 0.85, 'arroz_dorado': 0.8, 'arroz_artesanal': 0.75, 'vegetal': 0.9, 'vegetal_arrugado': 0.9,
               'encerado': 0.85, 'horno': 0.85, 'periodico': 0.55, 'periodico_gris': 0.55, 'papel_fino': 0.45,
               'corrugado': 0.0, 'corrugado_fino': 0.0, 'cartulina_gris': 0.08, 'bristol': 0.15, 'acuarela_grueso': 0.06,
               'acuarela_grueso_2': 0.06, 'acuarela_fino': 0.1, 'acuarela_satinada': 0.1, 'kraft': 0.12, 'kraft_claro': 0.12,
               'hecho_mano': 0.15, 'hecho_mano_grumos': 0.12, 'hecho_mano_fibroso': 0.15, 'pergamino': 0.35,
               'pergamino_oscuro': 0.3, 'pergamino_blanco': 0.4}

O = 90


def ink_split(rgb):
    """Separa tinta impresa (líneas, puntos) del papel."""
    med = np.stack([ndimage.median_filter(rgb[..., c], size=13, mode='wrap') for c in range(3)], -1)
    ratio = np.clip(rgb / np.maximum(med, 1e-3), 0, 1.2)
    strength = 1 - ratio.min(-1)
    sat = rgb.max(-1) - rgb.min(-1) - (med.max(-1) - med.min(-1))
    s2 = np.maximum(strength, sat * 1.5)
    mask = np.clip((s2 - 0.035) / 0.05, 0, 1)
    mask = np.maximum(mask, ndimage.maximum_filter(mask, 3) * 0.6)
    ink = 1 - (1 - np.clip(ratio, 0, 1)) * mask[..., None]
    paper = rgb * (1 - mask[..., None]) + med * mask[..., None]
    return ink, paper, mask


def process(entry):
    pid, name, group, fname, kind, extra = entry
    rgb = load(T + fname)
    H, W = rgb.shape[:2]
    rgb = flatten_light(rgb, max(H, W) / 5)
    info = {'id': pid, 'name': name, 'group': group, 'kind': kind, 'source': fname}
    if kind == 'pattern':
        ink, paper, mask = ink_split(rgb)
        cov = 1 - lum(ink)
        # periodos fundamentales (px)
        prow = cov.mean(1); pcol = cov.mean(0)
        py, cy = fundamental_period(prow, 4, H // 4)
        px, cx = fundamental_period(pcol, 4, W // 4)
        # ¿hay patrón en cada eje? (las rayas horizontales no tienen periodo en X)
        if pcol.std() < 0.15 * prow.std(): px, cx = None, 0
        if prow.std() < 0.15 * pcol.std(): py, cy = None, 0
        # tile = número entero de periodos en X e Y (con compensación de inclinación)
        sm = gblur(cov, 1.0)
        (tile_ink, tile_pap0), (s, t, ey, ex) = make_tileable_pattern([ink, paper], sm, O)
        # bajas frecuencias del papel: fundido suave para que tampoco se note
        low = gblur(tile_pap0, 40)
        tile_pap = tile_pap0
        info.update(periods=[float(px) if px else None, float(py) if py else None])
        # escala física
        if extra.get('axis') == 'x' and px: mm_per_px = extra['px'] / px
        elif 'py' in extra and py: mm_per_px = extra['py'] / py
        elif 'px' in extra and px: mm_per_px = extra['px'] / px
        else: mm_per_px = 0.1
        info['tileMm'] = [round(float(s * mm_per_px), 2), round(float(t * mm_per_px), 2)]
        save_png(np.clip(tile_ink, 0, 1), f'papers/{pid}_ink.png')
        L = lum(tile_pap)
        base = tile_pap
    else:
        if 'flute' in extra:
            prof = lum(rgb).mean(1)
            py, _ = fundamental_period(prof, 8, H // 3)
            s = W - O - 4
            t, tc = autocorr_shift(lum(rgb), 0, H - O - 260, H - O - 4)
            info['tileMm'] = [round(float(s / py * extra['flute']), 2), round(float(t / py * extra['flute']), 2)]
            base = make_tileable(rgb, s, t, O)
        else:
            s, t = W - O - 4, H - O - 4
            base = make_tileable(rgb, s, t, O, low_sigma=30)
            mm_per_px = extra['mm'] / W
            info['tileMm'] = [round(float(s * mm_per_px), 2), round(float(t * mm_per_px), 2)]
        L = lum(base)
    mean = float(L.mean())
    det = L / max(mean, 1e-3)
    std = float(det.std())
    gain = float(np.clip(110.0 / (4 * std + 1e-6), 60, 2500))
    enc = np.clip(128 + (det - 1) * gain, 0, 255) / 255.0
    info['size'] = [int(base.shape[1]), int(base.shape[0])]
    info['gain'] = round(gain, 3)
    info['detailStd'] = round(std, 4)
    mc = base.reshape(-1, 3).mean(0)
    info['color'] = [int(round(v * 255)) for v in np.clip(mc, 0, 1)]
    info['translucency'] = TRANSLUCENT.get(pid, 0.25)
    info['bytes'] = save_png(enc, f'papers/{pid}_d.png', 'L')
    if kind == 'color':
        # color propio como "tinte" relativo a la luminancia, a resolución reducida (el detalle va en _d)
        k = extra.get('chroma', 4)
        tint = base / np.maximum(L[..., None], 1e-3)
        tint = gblur(tint, k * 0.6)
        small = np.asarray(Image.fromarray(np.clip(tint / 2 * 255, 0, 255).astype(np.uint8)).resize((base.shape[1] // k, base.shape[0] // k), Image.BOX), np.float32) / 255
        info['chroma'] = k
        info['bytes'] += save_png(small, f'papers/{pid}_c.png')
    if kind == 'pattern':
        info['bytes'] += os.path.getsize(os.path.join(ASSETS, f'papers/{pid}_ink.png'))
    info['seam'] = [round(float(v), 2) for v in seam_score(base)]
    return info


if __name__ == '__main__':
    only = sys.argv[1:] or None
    out = []
    catp = os.path.join(ASSETS, 'papers.json')
    old = {p['id']: p for p in json.load(open(catp))} if os.path.exists(catp) else {}
    for e in PAPERS:
        if only and e[0] not in only:
            if e[0] in old: out.append(old[e[0]])
            continue
        info = process(e)
        print(info['id'], info['kind'], info['size'], info['tileMm'], 'seam', info['seam'], 'KB', info['bytes'] // 1024, info.get('periods'))
        out.append(info)
    json.dump(out, open(catp, 'w'), ensure_ascii=False, indent=1)
