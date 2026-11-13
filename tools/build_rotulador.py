"""Calco de rotulador: lo que alguien escribió con rotulador por la otra cara y traspasa el papel.

No son garabatos sueltos: es escritura a mano real en su disposición real (una nota con título subrayado y renglones,
una etiqueta en letra grande, una lista con tachones y marcas). La letra es cursiva asémica: trazos encadenados con
proporciones de letra manuscrita (altura x, ascendentes, descendentes, inclinación, deriva del renglón), que al verse
del revés y a través del papel se lee como escritura sin ser texto concreto.

Para cada variante se guardan dos mapas (1 = tinta):
  rotulador_N.png          el trazo (grosor constante de punta de fieltro)
  rotulador_charcos_N.png  donde la punta se paró: al empezar y acabar cada trazo, en los giros bruscos y los puntos
                           (ahí el rotulador suelta más tinta y traspasa más)."""
import json, os, math, random
import numpy as np
import cv2
from common import ASSETS, save_png

W, H = 1240, 1754
MM = W / 210.0
SS = 3                                  # superamostrado para el antialias
WS = 1.22                               # anchura de la letra (la mano suelta escribe ancho)

# --- letras cursivas (unidades: altura x = 1, línea base = 0; x hacia la derecha) ---
L = {
 'e': (0.72, [(0, .1), (.42, .55), (.48, .92), (.28, .82), (.22, .42), (.36, .05), (.72, .14)]),
 'a': (0.82, [(0, .1), (.46, .86), (.25, .96), (.06, .52), (.2, .04), (.44, .48), (.56, .96), (.52, .18), (.82, .1)]),
 'o': (0.8, [(0, .14), (.36, .96), (.14, .72), (.2, .06), (.52, .12), (.58, .74), (.32, .96), (.8, .82)]),
 's': (0.58, [(0, .12), (.34, .96), (.5, .42), (.2, .04), (.08, .16), (.58, .12)]),
 'n': (0.86, [(0, .1), (.14, .9), (.18, .04), (.3, .7), (.5, .96), (.6, .5), (.62, .04), (.86, .14)]),
 'm': (1.16, [(0, .1), (.12, .9), (.16, .04), (.26, .72), (.42, .96), (.5, .5), (.5, .04), (.62, .72), (.8, .96), (.88, .5), (.9, .04), (1.16, .14)]),
 'r': (0.6, [(0, .1), (.16, .9), (.34, .78), (.36, .64), (.5, .9), (.58, .16), (.6, .12)]),
 'i': (0.46, [(0, .1), (.24, .96), (.22, .08), (.46, .14)]),
 'l': (0.6, [(0, .1), (.44, 1.5), (.46, 2.35), (.26, 2.2), (.22, 1.2), (.28, .06), (.6, .14)]),
 't': (0.5, [(0, .1), (.26, 1.95), (.22, .16), (.5, .12)]),
 'd': (0.84, [(0, .1), (.46, .86), (.25, .96), (.06, .52), (.2, .04), (.44, .48), (.58, 2.25), (.52, .16), (.84, .1)]),
 'c': (0.6, [(0, .1), (.42, .86), (.16, .8), (.06, .32), (.26, .02), (.6, .16)]),
 'u': (0.76, [(0, .9), (.04, .2), (.24, 0), (.44, .4), (.5, .96), (.5, .16), (.76, .1)]),
 'p': (0.86, [(0, .1), (.2, .96), (.18, -1.05), (.2, .7), (.5, .96), (.62, .5), (.4, .04), (.2, .2), (.86, .12)]),
 'g': (0.82, [(0, .1), (.46, .86), (.25, .96), (.06, .52), (.2, .04), (.44, .48), (.56, .96), (.5, -.95), (.22, -1.1), (.16, -.72), (.82, .1)]),
 'b': (0.78, [(0, .1), (.38, 1.6), (.42, 2.3), (.22, 2.1), (.2, .1), (.5, .8), (.62, .4), (.4, .04), (.78, .2)]),
 'h': (0.86, [(0, .1), (.4, 1.6), (.42, 2.3), (.22, 2.1), (.18, .04), (.32, .72), (.54, .96), (.62, .5), (.64, .04), (.86, .14)]),
 'v': (0.72, [(0, .9), (.24, .02), (.48, .9), (.52, .8), (.72, .86)]),
 'y': (0.8, [(0, .9), (.06, .2), (.26, 0), (.46, .4), (.5, .96), (.44, -.95), (.18, -1.05), (.16, -.7), (.8, .1)]),
 'z': (0.66, [(0, .9), (.5, .92), (.06, .04), (.5, .06), (.66, .1)]),
 'q': (0.84, [(0, .1), (.46, .86), (.25, .96), (.06, .52), (.2, .04), (.44, .48), (.56, .96), (.52, -1.0), (.6, -.6), (.84, .1)]),
 'f': (0.6, [(0, .1), (.4, 1.7), (.42, 2.3), (.24, 2.1), (.22, -1.0), (.12, -.6), (.6, .14)]),
}
FREQ = 'eeeeeeaaaaaaooooossssnnnnrrrriiiilllldddtttcccuuummppbghvyzqf'
WORDS_LEN = [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9]
DOT = {'i'}
CROSS = {'t'}
DIGITS = {
 '1': [(.1, 1.3), (.42, 1.85), (.42, 0)],
 '2': [(.05, 1.45), (.3, 1.85), (.62, 1.6), (.5, 1.05), (.05, 0), (.7, .05)],
 '3': [(.08, 1.6), (.4, 1.85), (.6, 1.45), (.3, 1.0), (.62, .55), (.4, 0), (.05, .2)],
 '4': [(.55, 0), (.55, 1.85), (.04, .55), (.78, .55)],
 '5': [(.66, 1.82), (.14, 1.82), (.1, 1.0), (.5, 1.1), (.66, .5), (.36, 0), (.04, .2)],
 '7': [(.04, 1.82), (.7, 1.82), (.24, 0)],
 '0': [(.36, 1.85), (.06, 1.0), (.3, 0), (.62, .9), (.36, 1.85)],
}


def catmull(pts, n=7):
    pts = np.asarray(pts, np.float64)
    if len(pts) < 3: return pts
    P = np.vstack([pts[0], pts, pts[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


class Pen:
    """Rotulador: trazos de grosor constante + charcos donde la punta se detiene."""
    def __init__(self, rnd):
        self.r = rnd
        self.ink = np.zeros((H * SS, W * SS), np.float32)
        self.pool = np.zeros((H * SS, W * SS), np.float32)

    def stroke(self, pts, width_mm, dens=1.0, pools=True):
        pts = np.asarray(pts, np.float64)
        if len(pts) < 2: return
        th = max(1, int(round(width_mm * MM * SS)))
        layer = np.zeros_like(self.ink)
        cv2.polylines(layer, [np.round(pts * SS).astype(np.int32).reshape(-1, 1, 2)], False, 1.0, th, cv2.LINE_AA)
        np.maximum(self.ink, layer * dens, out=self.ink)
        if not pools: return
        rad = width_mm * MM * SS * 0.5
        # al apoyar y al levantar la punta
        for p, k in ((pts[0], self.r.uniform(1.05, 1.5)), (pts[-1], self.r.uniform(0.95, 1.35))):
            self.blot(p, rad * k, self.r.uniform(0.65, 1.0))
        # giros bruscos (la mano frena)
        d = np.diff(pts, axis=0); a = np.arctan2(d[:, 1], d[:, 0])
        da = np.abs((np.diff(a) + np.pi) % (2 * np.pi) - np.pi)
        for i in np.where(da > 1.9)[0]:
            if self.r.random() < 0.6: self.blot(pts[i + 1], rad * self.r.uniform(0.9, 1.2), self.r.uniform(0.35, 0.7))

    def blot(self, p, rad, v):
        cv2.circle(self.pool, (int(p[0] * SS), int(p[1] * SS)), max(1, int(rad)), float(v), -1, cv2.LINE_AA)

    def dot(self, p, width_mm):
        rad = width_mm * MM * 0.62
        cv2.circle(self.ink, (int(p[0] * SS), int(p[1] * SS)), max(1, int(rad * SS)), 1.0, -1, cv2.LINE_AA)
        self.blot(p, rad * SS * 1.1, self.r.uniform(0.7, 1.0))

    def result(self):
        ink = cv2.resize(self.ink, (W, H), interpolation=cv2.INTER_AREA)
        pool = cv2.resize(self.pool, (W, H), interpolation=cv2.INTER_AREA)
        pool = cv2.GaussianBlur(pool, (0, 0), 0.8 * MM * 0.5)
        return np.clip(ink, 0, 1), np.clip(np.maximum(pool, 0) * np.clip(ink * 1.5, 0, 1), 0, 1)


class Hand:
    """Mano que escribe: inclinación, deriva del renglón y variación de cada letra."""
    def __init__(self, rnd, slant=None):
        self.r = rnd
        self.slant = slant if slant is not None else rnd.uniform(0.12, 0.32)

    def word(self, pen, x, y, xh_mm, width_mm, n=None, digits=False, angle=0.0):
        """Escribe una palabra con la base en (x, y) px; devuelve la x donde acaba."""
        r = self.r
        xh = xh_mm * MM
        pts, extras = [], []
        cx = 0.0
        letters = ([r.choice('1234570') for _ in range(n or r.randint(2, 4))] if digits
                   else [r.choice(FREQ) for _ in range(n or r.choice(WORDS_LEN))])
        strokes = []
        for i, ch in enumerate(letters):
            if digits:
                g = DIGITS[ch]; wd = 0.82
                s = [(cx + gx * 0.9 + r.gauss(0, .03), gy * 0.62 + r.gauss(0, .03)) for gx, gy in g]
                strokes.append(s); cx += wd * r.uniform(0.9, 1.1); continue
            wd, g = L[ch]
            sy = r.uniform(0.9, 1.1)
            s = [(cx + gx * WS * r.uniform(0.92, 1.08) + r.gauss(0, .035), gy * sy + r.gauss(0, .035)) for gx, gy in g]
            if pts and s: s = s[1:]   # enlazada con la anterior
            pts += s
            if ch in DOT: extras.append(('dot', (cx + .3 * WS, 1.55 + r.uniform(-.1, .2))))
            if ch in CROSS: extras.append(('cross', (cx - .05, 1.12), (cx + .6 * WS, 1.18)))
            cx += wd * WS * r.uniform(0.92, 1.08)
        if pts: strokes.insert(0, pts)
        ca, sa = math.cos(angle), math.sin(angle)
        def tf(px_, py_):
            X = (px_ + py_ * self.slant) * xh; Y = -py_ * xh
            return (x + X * ca - Y * sa, y + X * sa + Y * ca)
        for s in strokes:
            pen.stroke([tf(*p) for p in catmull(s)], width_mm, dens=r.uniform(0.85, 1.0))
        for e in extras:
            if e[0] == 'dot': pen.dot(tf(*e[1]), width_mm)
            else: pen.stroke([tf(*e[1]), tf(*e[2])], width_mm * 0.95, pools=r.random() < 0.5)
        return tf(cx, 0)[0], cx * xh

    def line(self, pen, x, y, nwords, xh_mm, width_mm, angle=0.0, maxw=None, digits_p=0.0):
        r = self.r
        cur = x
        for k in range(nwords):
            yy = y + (cur - x) * math.tan(angle) + r.gauss(0, xh_mm * MM * 0.06)
            end, wpx = self.word(pen, cur, yy, xh_mm * r.uniform(0.92, 1.08), width_mm,
                                 digits=r.random() < digits_p, angle=angle + r.gauss(0, 0.02))
            cur = end + xh_mm * MM * r.uniform(0.9, 1.4)
            if maxw and cur - x > maxw: break
        return cur


def wobble(rnd, pts, amp):
    pts = np.asarray(pts, np.float64)
    n = len(pts); t = np.linspace(0, 1, n)
    nrm = np.zeros_like(pts)
    d = np.gradient(pts, axis=0); l = np.hypot(d[:, 0], d[:, 1]) + 1e-9
    nrm[:, 0], nrm[:, 1] = -d[:, 1] / l, d[:, 0] / l
    w = amp * (np.sin(t * math.pi * rnd.uniform(1, 2.2) + rnd.uniform(0, 6)) * 0.6 + np.sin(t * math.pi * 5 + rnd.uniform(0, 6)) * 0.15)
    return pts + nrm * w[:, None]


def underline(pen, rnd, x0, x1, y, width_mm):
    n = 24
    xs = np.linspace(x0 - rnd.uniform(0, 3) * MM, x1 + rnd.uniform(1, 6) * MM, n)
    ys = y + np.linspace(0, rnd.uniform(-2, 1.5) * MM, n)
    pen.stroke(wobble(rnd, np.stack([xs, ys], 1), 0.5 * MM), width_mm)


def circle(pen, rnd, cx, cy, rx, ry, width_mm):
    a0 = rnd.uniform(0, 2 * math.pi); n = 60
    t = np.linspace(a0, a0 + 2 * math.pi * rnd.uniform(1.08, 1.2), n)
    rr = 1 + 0.06 * np.sin(t * 2 + rnd.uniform(0, 6))
    pts = np.stack([cx + rx * rr * np.cos(t), cy + ry * rr * np.sin(t)], 1)
    pen.stroke(pts, width_mm)


def arrow(pen, rnd, x0, y0, x1, y1, width_mm):
    n = 20
    mx, my = (x0 + x1) / 2 + rnd.uniform(-1, 1) * 6 * MM, (y0 + y1) / 2 + rnd.uniform(-1, 1) * 6 * MM
    t = np.linspace(0, 1, n)[:, None]
    pts = (1 - t) ** 2 * np.array([x0, y0]) + 2 * (1 - t) * t * np.array([mx, my]) + t ** 2 * np.array([x1, y1])
    pen.stroke(pts, width_mm)
    a = math.atan2(pts[-1, 1] - pts[-3, 1], pts[-1, 0] - pts[-3, 0]); L_ = 5 * MM
    for s in (1, -1):
        b = a + math.pi + s * 0.5
        pen.stroke([(x1, y1), (x1 + L_ * math.cos(b), y1 + L_ * math.sin(b))], width_mm)


def box(pen, rnd, x0, y0, x1, y1, width_mm):
    c = [(x0, y0), (x1, y0 + rnd.uniform(-1, 1) * MM), (x1 + rnd.uniform(-1, 1) * MM, y1), (x0 + rnd.uniform(-1, 1) * MM, y1), (x0 + rnd.uniform(-1, 1.5) * MM, y0 - MM)]
    pts = []
    for (a, b) in zip(c[:-1], c[1:]):
        for t in np.linspace(0, 1, 10, endpoint=False): pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    pts.append(c[-1])
    pen.stroke(wobble(rnd, pts, 0.4 * MM), width_mm)


def check(pen, rnd, x, y, s_mm, width_mm):
    s = s_mm * MM
    pen.stroke(catmull([(x, y - s * .4), (x + s * .35, y), (x + s, y - s * 1.1)], 6), width_mm)


def nota(seed):
    rnd = random.Random(seed); pen = Pen(rnd); hand = Hand(rnd)
    wf = rnd.uniform(0.9, 1.15)                               # rotulador fino
    ang = rnd.uniform(-0.035, 0.01)
    x0, y0 = rnd.uniform(24, 34) * MM, rnd.uniform(38, 48) * MM
    end = hand.line(pen, x0, y0, rnd.randint(2, 3), rnd.uniform(7.5, 9), wf * 1.3, angle=ang)
    underline(pen, rnd, x0, end - 4 * MM, y0 + 6 * MM, wf * 1.15)
    y = y0 + rnd.uniform(26, 30) * MM
    xs = []
    for i in range(rnd.randint(5, 7)):
        xl = x0 + rnd.uniform(-2, 3) * MM
        e = hand.line(pen, xl, y, rnd.randint(2, 5), rnd.uniform(4.8, 5.8), wf, angle=ang + rnd.gauss(0, 0.012), maxw=rnd.uniform(110, 150) * MM, digits_p=0.08)
        xs.append((xl, e, y)); y += rnd.uniform(14, 16.5) * MM
    # número rodeado y flecha hacia un renglón
    xl, e, yy = xs[rnd.randint(1, len(xs) - 2)]
    nx = min(W - 30 * MM, e + rnd.uniform(14, 24) * MM)
    hand.word(pen, nx, yy, 5.5, wf, n=rnd.randint(1, 2), digits=True)
    circle(pen, rnd, nx + 5 * MM, yy - 5 * MM, 10 * MM, 8 * MM, wf)
    return pen.result()


def etiqueta(seed):
    rnd = random.Random(seed); pen = Pen(rnd); hand = Hand(rnd, slant=rnd.uniform(0.05, 0.18))
    wt = rnd.uniform(2.0, 2.6)                                 # rotulador gordo
    ang = rnd.uniform(-0.07, -0.02)
    y = rnd.uniform(70, 95) * MM
    x = rnd.uniform(30, 45) * MM
    e = hand.line(pen, x, y, 1, rnd.uniform(13, 16), wt, angle=ang)
    y2 = y + rnd.uniform(30, 36) * MM
    e2 = hand.line(pen, x + rnd.uniform(0, 15) * MM, y2, rnd.randint(1, 2), rnd.uniform(11, 13), wt, angle=ang * 0.7)
    underline(pen, rnd, x, max(e, e2) - 6 * MM, y2 + 8 * MM, wt * 0.9)
    underline(pen, rnd, x + 5 * MM, max(e, e2) - 12 * MM, y2 + 13 * MM, wt * 0.9)
    # una línea pequeña abajo con rotulador fino (fecha / referencia)
    hand.line(pen, rnd.uniform(110, 140) * MM, rnd.uniform(230, 260) * MM, 2, 5.5, 1.1, angle=rnd.uniform(-0.02, 0.02), digits_p=0.6)
    return pen.result()


def lista(seed):
    rnd = random.Random(seed); pen = Pen(rnd); hand = Hand(rnd)
    wf = rnd.uniform(1.0, 1.25)
    ang = rnd.uniform(-0.03, 0.015)
    x0, y = rnd.uniform(30, 40) * MM, rnd.uniform(40, 50) * MM
    e = hand.line(pen, x0 + 4 * MM, y, 1, 8.5, wf * 1.3, angle=ang)
    box(pen, rnd, x0 - 2 * MM, y - 18 * MM, e + 3 * MM, y + 7 * MM, wf * 1.1)
    y += rnd.uniform(24, 28) * MM
    n = rnd.randint(6, 8); crossed = rnd.randint(1, n - 1); checks = rnd.sample(range(n), 2)
    for i in range(n):
        pen.stroke([(x0, y - 2 * MM), (x0 + 4 * MM, y - 2.3 * MM)], wf)                 # guion
        e = hand.line(pen, x0 + 9 * MM, y, rnd.randint(1, 3), rnd.uniform(5, 6), wf, angle=ang + rnd.gauss(0, 0.01), digits_p=0.05)
        if i == crossed:
            pen.stroke(wobble(rnd, [(x0 + 6 * MM, y - 2.6 * MM), (e - 3 * MM, y - 2.4 * MM)], 0.3 * MM), wf)
        if i in checks: check(pen, rnd, e + 4 * MM, y - 1 * MM, 6, wf)
        y += rnd.uniform(16, 18) * MM
    return pen.result()


if __name__ == '__main__':
    cat = json.load(open(os.path.join(ASSETS, 'calco.json')))
    inks, pools = [], []
    for k, (fn, seed) in enumerate([(nota, 11), (etiqueta, 5), (lista, 23), (nota, 42)]):
        ink, pool = fn(seed)
        save_png(ink, f'calco/rotulador_{k}.png', 'L'); save_png(pool, f'calco/rotulador_charcos_{k}.png', 'L')
        inks.append(f'rotulador_{k}.png'); pools.append(f'rotulador_charcos_{k}.png')
        print(k, fn.__name__, 'tinta %.3f' % ink.mean())
    for f in ('rotulador.png', 'rotulador_charcos.png'):
        p = os.path.join(ASSETS, 'calco', f)
        if os.path.exists(p): os.remove(p)
    cat['rotulador'] = {'inks': inks, 'pools': pools, 'ink': inks[0], 'pool': pools[0]}
    json.dump(cat, open(os.path.join(ASSETS, 'calco.json'), 'w'), indent=1)
