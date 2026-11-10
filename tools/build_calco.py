"""Genera los documentos de detrás para el calco (lo que se transparenta desde la otra cara).
Cada uno se guarda como cobertura de tinta (0..1) más mapas auxiliares:
- periodico / folio: tinta impresa (sin presión).
- apuntes: tinta de bolígrafo (azul) + fluorescente + relieve de la presión.
- rotulador: tinta de rotulador + 'charcos' donde la punta se apoyó o los trazos se cruzan (traspasan más)."""
import json, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize
from common import *
from imperf_lib import multiply_map, components

W, H = 1240, 1754            # A4 a 150 ppp (el calco siempre va desenfocado)
MM = W / 210.0
rnd = random.Random(7)
F = {
  'serif': '/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf',
  'serifb': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  'sans': '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf',
  'sansb': '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf',
  'mono': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
}
WORDS = ('el la los las de del que en un una por con para como más pero sus le ya o fue este ha si porque esta son entre cuando muy '
         'sin sobre ser tiene también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante '
         'ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella '
         'estar estas algunas algo nosotros ciudad gobierno año días tiempo vida mundo país trabajo parte casa momento gente '
         'historia proyecto informe cuenta mesa ministerio servicio desarrollo nacional calle tarde semana problema mañana '
         'acuerdo consejo empresa caso mujer ayuntamiento barrio vecinos precio datos mercado ley sistema obra viaje').split()


def sentence(n):
    w = [rnd.choice(WORDS) for _ in range(n)]
    w[0] = w[0].capitalize()
    return ' '.join(w) + '.'


def para(nsent):
    return ' '.join(sentence(rnd.randint(7, 16)) for _ in range(nsent))


def draw_text_block(d, text, x, y, width, font, lh, fill=255, justify=True, maxy=None):
    words = text.split(); line = []
    def flush(ln, last=False):
        nonlocal y
        if not ln: return
        if justify and not last and len(ln) > 1:
            tw = sum(d.textlength(wd, font=font) for wd in ln)
            gap = (width - tw) / (len(ln) - 1)
            xx = x
            for wd in ln:
                d.text((xx, y), wd, font=font, fill=fill); xx += d.textlength(wd, font=font) + gap
        else:
            d.text((x, y), ' '.join(ln), font=font, fill=fill)
        y += lh
    for wd in words:
        if maxy and y > maxy: return y
        test = ' '.join(line + [wd])
        if d.textlength(test, font=font) > width and line:
            flush(line); line = [wd]
        else:
            line.append(wd)
    flush(line, True)
    return y


def periodico():
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    m = int(12 * MM)
    d.text((m, m), 'EL DIARIO DEL NORTE', font=ImageFont.truetype(F['serifb'], int(13 * MM)), fill=255)
    y = m + int(17 * MM)
    d.rectangle([m, y, W - m, y + 3], fill=255); y += int(2 * MM)
    d.text((m, y), 'Martes 14 de marzo · Edición de la mañana · 1,20 €', font=ImageFont.truetype(F['sans'], int(3.2 * MM)), fill=230)
    y += int(6 * MM); d.rectangle([m, y, W - m, y + 1], fill=255); y += int(5 * MM)
    d.text((m, y), sentence(6)[:-1], font=ImageFont.truetype(F['serifb'], int(9 * MM)), fill=255)
    y += int(14 * MM)
    cols, gap = 5, int(4 * MM)
    cw = (W - 2 * m - gap * (cols - 1)) // cols
    body = ImageFont.truetype(F['serif'], int(2.9 * MM)); lh = int(3.6 * MM)
    # bloque de foto con trama (semitono)
    px0, py0, pw, ph = m, y, cw * 3 + gap * 2, int(70 * MM)
    yy, xx = np.mgrid[0:ph, 0:pw]
    tone = 0.5 + 0.35 * np.sin(xx / 90.0) * np.cos(yy / 70.0) + 0.15 * np.sin((xx + yy) / 23.0)
    cell = 6
    ht = np.zeros((ph, pw), np.float32)
    cy, cx = (yy % cell) - cell / 2, (xx % cell) - cell / 2
    r = np.sqrt(np.clip(tone, 0, 1)) * cell * 0.62
    ht = (np.sqrt(cx ** 2 + cy ** 2) < r).astype(np.float32)
    im.paste(Image.fromarray((ht * 255).astype(np.uint8)), (px0, py0))
    d.text((m, py0 + ph + int(2 * MM)), sentence(9), font=ImageFont.truetype(F['sans'], int(2.6 * MM)), fill=210)
    for c in range(cols):
        x = m + c * (cw + gap)
        ystart = y if c >= 3 else py0 + ph + int(8 * MM)
        yy0 = ystart
        while yy0 < H - m - 10 * MM:
            if rnd.random() < 0.25:
                d.text((x, yy0), sentence(4)[:-1], font=ImageFont.truetype(F['serifb'], int(4 * MM)), fill=255); yy0 += int(7 * MM)
            yy0 = draw_text_block(d, para(rnd.randint(3, 6)), x, yy0, cw, body, lh, maxy=H - m - 10 * MM) + int(3 * MM)
        if c < cols - 1:
            d.line([x + cw + gap // 2, y, x + cw + gap // 2, H - m], fill=200, width=1)
    return np.asarray(im, np.float32) / 255


def folio():
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    m = int(25 * MM)
    d.text((m, m), 'INFORME TÉCNICO', font=ImageFont.truetype(F['sansb'], int(6 * MM)), fill=255)
    d.text((m, m + int(9 * MM)), 'Referencia 2024/118 · Departamento de Obras', font=ImageFont.truetype(F['sans'], int(3.6 * MM)), fill=240)
    y = m + int(20 * MM)
    body = ImageFont.truetype(F['sans'], int(3.9 * MM)); lh = int(6 * MM)
    for k in range(7):
        if k in (2, 5):
            d.text((m, y), f'{k // 2 + 1}. ' + sentence(3)[:-1].upper(), font=ImageFont.truetype(F['sansb'], int(4.2 * MM)), fill=255); y += int(8 * MM)
        y = draw_text_block(d, para(rnd.randint(3, 5)), m, y, W - 2 * m, body, lh, maxy=H - m - 15 * MM) + int(4 * MM)
        if y > H - m - 20 * MM: break
    d.text((W // 2 - 10, H - int(15 * MM)), '2', font=body, fill=255)
    return np.asarray(im, np.float32) / 255


def strokes_from_relief_atlas(cid):
    cat = json.load(open(os.path.join(ASSETS, 'imperf.json')))[cid]
    atlas = np.asarray(Image.open(os.path.join(ASSETS, 'imperf', cat['atlas'])), np.float32) / 255
    out = []
    for s in cat['sprites']:
        x, y, w, h = s['r']
        r = (atlas[y:y + h, x:x + w] - 0.5) / 4
        ink = np.clip((np.abs(r) - 0.012) / 0.05, 0, 1)
        ink = ndimage.gaussian_filter(ink, 0.6)
        out.append((ink, s['mm']))
    return out


def paste_max(dst, src, x, y):
    h, w = src.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0: return
    dst[y0:y1, x0:x1] = np.maximum(dst[y0:y1, x0:x1], src[y0 - y:y1 - y, x0 - x:x1 - x])


def resize(a, f):
    h, w = a.shape[:2]
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((max(1, int(w * f)), max(1, int(h * f))), Image.BILINEAR), np.float32)


def apuntes():
    pen = np.zeros((H, W), np.float32)
    fluor = np.zeros((H, W), np.float32)
    lines = strokes_from_relief_atlas('escritura')
    pitch = 9 * MM
    y = 32 * MM
    left = 26 * MM
    k = 0
    order = list(range(len(lines))); rnd.shuffle(order)
    while y < H - 25 * MM and k < len(order):
        ink, mmpp = lines[order[k]]; k += 1
        f = mmpp * MM * rnd.uniform(0.9, 1.05)
        a = resize(ink, f)
        if a.shape[0] > pitch * 1.6:   # renglones dobles: se colocan ocupando dos
            pass
        x = int(left + rnd.uniform(-2, 4) * MM)
        paste_max(pen, a, x, int(y - a.shape[0] * 0.55))
        # subrayado con fluorescente en algunos renglones
        if rnd.random() < 0.28:
            x0 = x + rnd.randint(0, a.shape[1] // 3); x1 = x0 + rnd.randint(a.shape[1] // 4, a.shape[1] // 2)
            band = np.zeros((int(5 * MM), x1 - x0), np.float32)
            band[:] = 0.75
            band[:, :int(2 * MM)] = 1.0; band[:, -int(2 * MM):] = 1.0       # más tinta al empezar y al terminar la pasada
            band = ndimage.gaussian_filter(band, 1.5)
            paste_max(fluor, band, x0, int(y - 3.5 * MM))
        # algún tachón
        if rnd.random() < 0.12:
            yy = int(y - 1.5 * MM); x0 = x + rnd.randint(10, max(11, a.shape[1] // 2))
            img = Image.fromarray(np.zeros((H, W), np.uint8)); dd = ImageDraw.Draw(img)
            for j in range(4):
                dd.line([x0 + j * 3, yy + rnd.randint(-6, 6), x0 + rnd.randint(80, 160), yy + rnd.randint(-6, 6)], fill=220, width=2)
            pen = np.maximum(pen, np.asarray(img, np.float32) / 255)
        y += pitch * (2 if a.shape[0] > pitch * 1.6 else 1)
        if rnd.random() < 0.1: y += pitch
    relief = ndimage.gaussian_filter(pen, 1.2)
    return pen, fluor, relief


def rotulador():
    src = load('APOYO/TRAZOS/Garabatos de marcador negro sobre blanco.png')
    m = multiply_map(src, 0.04)
    cov = 1 - lum(m)
    cov = np.clip((cov - 0.05) / 0.6, 0, 1)
    lab, comps = components(cov > 0.3, 300, pad=6)
    pieces = []
    for (y0, y1, x0, x1, li, area) in comps:
        p = cov[y0:y1, x0:x1] * ndimage.binary_dilation(lab[y0:y1, x0:x1] == li, iterations=3)
        pieces.append(p)
    src2 = load('APOYO/TRAZOS/Garabatos abstractos en tinta negra.png')
    c2 = 1 - lum(multiply_map(src2, 0.04)); c2 = np.clip((c2 - 0.05) / 0.6, 0, 1)
    lab2, comps2 = components(c2 > 0.3, 300, pad=6)
    for (y0, y1, x0, x1, li, area) in comps2:
        pieces.append(c2[y0:y1, x0:x1] * ndimage.binary_dilation(lab2[y0:y1, x0:x1] == li, iterations=3))
    ink = np.zeros((H, W), np.float32)
    count = np.zeros((H, W), np.float32)
    # palabras grandes escritas con rotulador
    img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img)
    fnt = ImageFont.truetype(F['sansb'], int(14 * MM))
    for wd, (xx, yy) in zip(['¡OJO!', 'IDEAS', 'v2 →', 'URGENTE'], [(30, 40), (95, 130), (40, 210), (110, 250)]):
        d.text((xx * MM, yy * MM), wd, font=fnt, fill=255, stroke_width=2, stroke_fill=255)
    words = ndimage.gaussian_filter(np.asarray(img, np.float32) / 255, 1.0)
    ink = np.maximum(ink, words); count += (words > 0.3)
    for k in range(16):
        p = rnd.choice(pieces)
        f = rnd.uniform(0.45, 0.9)
        a = resize(p, f)
        x = rnd.randint(-a.shape[1] // 4, W - a.shape[1] * 3 // 4); y = rnd.randint(int(20 * MM), H - a.shape[0] - int(10 * MM))
        tmp = np.zeros((H, W), np.float32); paste_max(tmp, a, x, y)
        count += (tmp > 0.3); ink = np.maximum(ink, tmp)
    # charcos de tinta: extremos del trazo (la punta se apoya) y cruces (doble pasada)
    sk = skeletonize(ink > 0.45)
    nb = ndimage.convolve(sk.astype(np.int32), np.ones((3, 3), np.int32), mode='constant') - 1
    ends = sk & (nb == 1)
    pool = np.zeros((H, W), np.float32)
    ys, xs = np.where(ends)
    for y, x in zip(ys, xs):
        r = rnd.uniform(1.5, 3.2) * MM / 2
        yy, xx = np.ogrid[-int(r) - 2:int(r) + 3, -int(r) - 2:int(r) + 3]
        blob = np.clip(r - np.sqrt(xx ** 2 + yy ** 2), 0, 1).astype(np.float32)
        paste_max(pool, blob, int(x - r - 2), int(y - r - 2))
    pool = np.maximum(pool, (count >= 2).astype(np.float32) * ink)
    pool = ndimage.gaussian_filter(pool, 1.5)
    return ink, pool


if __name__ == '__main__':
    out = {}
    p = periodico(); save_png(p, 'calco/periodico.png', 'L'); out['periodico'] = {'ink': 'periodico.png'}
    f = folio(); save_png(f, 'calco/folio.png', 'L'); out['folio'] = {'ink': 'folio.png'}
    pen, fl, rel = apuntes()
    save_png(pen, 'calco/apuntes_boli.png', 'L'); save_png(fl, 'calco/apuntes_fluor.png', 'L'); save_png(rel, 'calco/apuntes_presion.png', 'L')
    out['apuntes'] = {'ink': 'apuntes_boli.png', 'fluor': 'apuntes_fluor.png', 'pressure': 'apuntes_presion.png'}
    ink, pool = rotulador()
    save_png(ink, 'calco/rotulador.png', 'L'); save_png(pool, 'calco/rotulador_charcos.png', 'L')
    out['rotulador'] = {'ink': 'rotulador.png', 'pool': 'rotulador_charcos.png'}
    out['_size'] = [W, H]
    json.dump(out, open(os.path.join(ASSETS, 'calco.json'), 'w'), indent=1)
    print('ok')
