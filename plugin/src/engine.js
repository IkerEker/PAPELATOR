/* PAPELATOR · motor v3
   Papel a partir de texturas reales tileables + imperfecciones reales colocadas con lógica
   + calco del reverso + composición final con desplazamiento y fotografía.
   JavaScript puro: se ejecuta igual en UXP (Photoshop) y en Node (pruebas). */
'use strict';

const P = require('./presets.js');

// ================================================================ utilidades
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const def = (v, d) => (v === undefined || v === null || (typeof v === 'number' && isNaN(v)) ? d : v);

function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashi(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x5bd1e995, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.732; }
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
// ruido de valor separable (rápido)
function addValueNoise(out, w, h, cx, cy, amp, seed) {
  if (cx < 1) cx = 1; if (cy < 1) cy = 1;
  const gw = Math.ceil(w / cx) + 2, gh = Math.ceil(h / cy) + 2;
  const grid = new Float32Array(gw * gh); const r = rng(seed);
  for (let i = 0; i < grid.length; i++) grid[i] = r() * 2 - 1;
  const offx = r() * cx, offy = r() * cy;
  const ix = new Int32Array(w), fx = new Float32Array(w);
  for (let x = 0; x < w; x++) { const g = (x + offx) / cx; const i = Math.floor(g); ix[x] = i; const f = g - i; fx[x] = f * f * (3 - 2 * f); }
  const row = new Float32Array(gw);
  for (let y = 0; y < h; y++) {
    const g = (y + offy) / cy; const j = Math.floor(g); let f = g - j; f = f * f * (3 - 2 * f);
    const b0 = j * gw, b1 = (j + 1) * gw;
    for (let i = 0; i < gw; i++) row[i] = grid[b0 + i] + (grid[b1 + i] - grid[b0 + i]) * f;
    let o = y * w;
    for (let x = 0; x < w; x++, o++) { const i = ix[x]; const a = row[i]; out[o] += amp * (a + (row[i + 1] - a) * fx[x]); }
  }
}
function boxBlur(a, w, h, r, tmp) {
  r = Math.round(r); if (r < 1) return;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w; let acc = 0;
    for (let i = -r; i <= r; i++) acc += a[row + clamp(i, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc * inv; const xi = x + r + 1, xo = x - r; acc += a[row + (xi < w ? xi : w - 1)] - a[row + (xo > 0 ? xo : 0)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[clamp(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { a[y * w + x] = acc * inv; const yi = y + r + 1, yo = y - r; acc += tmp[(yi < h ? yi : h - 1) * w + x] - tmp[(yo > 0 ? yo : 0) * w + x]; }
  }
}
function gaussBlur(a, w, h, sigma, tmp) {
  if (sigma < 0.4) return;
  if (sigma < 1.2) { // 1 pasada suave
    const k = clamp(sigma / 1.2, 0, 1) * 0.5;
    tmp.set(a);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const o = y * w + x; a[o] = tmp[o] * (1 - k) + (tmp[o - 1] + tmp[o + 1] + tmp[o - w] + tmp[o + w]) * 0.25 * k; }
    return;
  }
  const r = Math.max(1, Math.round(sigma * 0.95));
  boxBlur(a, w, h, r, tmp); boxBlur(a, w, h, r, tmp); boxBlur(a, w, h, r, tmp);
}

// ================================================================ assets
// assets = { json(name) -> Promise<obj>, image(path) -> Promise<{width,height,channels,data}> }
const cache = { mips: {} };
async function catalogs(assets) {
  if (!cache.papers) {
    cache.papers = await assets.json('papers.json');
    cache.imperf = await assets.json('imperf.json');
    cache.calco = await assets.json('calco.json');
    try { cache.folds = await assets.json('folds.json'); } catch (e) { cache.folds = {}; }
  }
  return cache;
}
function paperById(id) {
  const list = cache.papers || [];
  for (const p of list) if (p.id === id) return p;
  return list[0];
}
// mipmap (reducción 2x por nivel) para no generar aliasing al reducir la textura
function mipLevel(key, img, level) {
  const k = key + '@' + level;
  if (cache.mips[k]) return cache.mips[k];
  if (level === 0) return (cache.mips[k] = img);
  const prev = mipLevel(key, img, level - 1);
  const w = Math.max(1, prev.width >> 1), h = Math.max(1, prev.height >> 1), c = prev.channels;
  const d = new Uint8Array(w * h * c), s = prev.data, pw = prev.width;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < c; ch++) {
    const a = ((2 * y) * pw + 2 * x) * c + ch;
    d[(y * w + x) * c + ch] = (s[a] + s[a + c] + s[a + pw * c] + s[a + pw * c + c] + 2) >> 2;
  }
  return (cache.mips[k] = { width: w, height: h, channels: c, data: d });
}
async function loadImg(assets, path) {
  if (!cache[path]) cache[path] = await assets.image(path);
  return cache[path];
}

// ================================================================ PAPEL BASE
async function genPaper(S, st, assets, B) {
  const { w, h, ppm, N } = S;
  const paper = paperById(st.paper);
  const k = S.k;
  const dimg = await loadImg(assets, 'papers/' + paper.id + '_d.png');
  const cimg = paper.kind === 'color' ? await loadImg(assets, 'papers/' + paper.id + '_c.png') : null;
  const iimg = paper.kind === 'pattern' ? await loadImg(assets, 'papers/' + paper.id + '_ink.png') : null;
  const tw = dimg.width, th = dimg.height;
  // px de textura por px de documento
  const scale = clamp(def(st.scale, 1), 0.1, 10);
  const kx = tw / (paper.tileMm[0] * ppm * scale), ky = th / (paper.tileMm[1] * ppm * scale);
  let level = 0; let kk = Math.max(kx, ky);
  while (kk > 1.5 && level < 6) { kk /= 2; level++; }
  const lv = 1 << level;
  const dm = mipLevel(paper.id + '_d', dimg, level);
  const im = iimg ? mipLevel(paper.id + '_i', iimg, level) : null;
  const mw = dm.width, mh = dm.height;
  const ux = kx / lv, uy = ky / lv;
  const gain = paper.gain;
  const texK = def(st.texture, 1) * Math.pow(clamp(k, 0, 2), 0.6) * def(st._texLight, 1);
  S.texK = texK;
  // color del papel
  let C = hexToRgb(st.color);
  if (!C) { const c = P.COLORS.filter(x => x.id === st.color)[0]; C = c && c.hex ? hexToRgb(c.hex) : null; }
  const original = !C;
  if (!C) C = paper.color.slice();
  const Lmean = (paper.color[0] * 0.2126 + paper.color[1] * 0.7152 + paper.color[2] * 0.0722);
  const Cn = [C[0] / 255, C[1] / 255, C[2] / 255];
  const dark = [1 - Cn[0], 1 - Cn[1], 1 - Cn[2]];
  // anti-repetición: dos lecturas desplazadas mezcladas por un ruido suave (no en papeles con patrón)
  // (cartón ondulado: sólo a lo largo de la onda; verjurado: nada, sus líneas son regulares)
  const mix = paper.kind !== 'pattern' && paper.mix !== 'none';
  const r = rng(S.seedP + 77);
  const o1x = r() * mw, o2x = r() * mw;
  let o1y = r() * mh, o2y = r() * mh;
  if (paper.mix === 'x') { o1y = 0; o2y = 0; }
  const M = B.T; M.fill(0);
  if (mix) addValueNoise(M, w, h, (mw / ux) * 0.7, (mh / uy) * 0.7, 1, S.seedP + 78);
  // tinte de color propio
  const cw = cimg ? cimg.width : 0, chh = cimg ? cimg.height : 0;
  let mt = [1, 1, 1];
  if (cimg) { let s = [0, 0, 0]; for (let i = 0; i < cw * chh; i++) for (let c = 0; c < 3; c++) s[c] += cimg.data[i * 3 + c]; mt = s.map(v => v / (cw * chh) / 127.5); }
  const pc = hexToRgb(st.patternColor), pOp = clamp(def(st.patternOpacity, 1), 0, 2) * Math.min(1.2, 0.35 + 0.65 * Math.min(1, k));
  const D = B.D, alb = B.alb, md = dm.data;
  const sample = (u, v) => {   // bilineal con envoltura (tile)
    u = u % mw; if (u < 0) u += mw; v = v % mh; if (v < 0) v += mh;
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, x1 = x0 + 1 < mw ? x0 + 1 : 0, y1 = y0 + 1 < mh ? y0 + 1 : 0;
    const a = md[y0 * mw + x0], b = md[y0 * mw + x1], c = md[y1 * mw + x0], d = md[y1 * mw + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      const u = x * ux, v = y * uy;
      let d;
      if (mix) {
        const d1 = (sample(u + o1x, v + o1y) - 128) / gain, d2 = (sample(u + o2x, v + o2y) - 128) / gain;
        const t = smooth(-0.35, 0.35, M[o]);
        d = (d1 * t + d2 * (1 - t)) / Math.sqrt(t * t + (1 - t) * (1 - t));
      } else d = (sample(u, v) - 128) / gain;
      d *= texK;
      D[o] = d;
      let rr, gg, bb;
      if (cimg) {
        // tinte (resolución reducida)
        const cs = paper.chroma;
        let tu = ((u * lv) / cs) % cw, tv = ((v * lv) / cs) % chh;
        if (mix) { const t = smooth(-0.35, 0.35, M[o]); tu = (((t > 0.5 ? u + o1x : u + o2x) * lv) / cs) % cw; tv = (((t > 0.5 ? v + o1y : v + o2y) * lv) / cs) % chh; }
        if (tu < 0) tu += cw; if (tv < 0) tv += chh;
        const ci = ((tv | 0) * cw + (tu | 0)) * 3, cd = cimg.data;
        const t0 = cd[ci] / 127.5, t1 = cd[ci + 1] / 127.5, t2 = cd[ci + 2] / 127.5;
        if (original) { rr = Lmean * t0; gg = Lmean * t1; bb = Lmean * t2; }
        else { rr = C[0] * t0 / mt[0]; gg = C[1] * t1 / mt[1]; bb = C[2] * t2 / mt[2]; }
      } else { rr = C[0]; gg = C[1]; bb = C[2]; }
      // el grano se ve igual en papeles claros y oscuros (no es un simple multiplicar)
      rr = rr * (1 + d) + d * dark[0] * 70; gg = gg * (1 + d) + d * dark[1] * 70; bb = bb * (1 + d) + d * dark[2] * 70;
      if (im) {
        const ui = (u % im.width + im.width) % im.width, vi = (v % im.height + im.height) % im.height;
        const ii = ((vi | 0) * im.width + (ui | 0)) * 3, idd = im.data;
        let i0 = idd[ii] / 255, i1 = idd[ii + 1] / 255, i2 = idd[ii + 2] / 255;
        if (pc) { const cov = 1 - Math.min(i0, i1, i2); i0 = 1 - cov * (1 - pc[0] / 255); i1 = 1 - cov * (1 - pc[1] / 255); i2 = 1 - cov * (1 - pc[2] / 255); }
        rr *= 1 - (1 - i0) * pOp; gg *= 1 - (1 - i1) * pOp; bb *= 1 - (1 - i2) * pOp;
      }
      const j = o * 4;
      alb[j] = rr; alb[j + 1] = gg; alb[j + 2] = bb; alb[j + 3] = 255;
    }
  }
  return paper;
}

// ================================================================ RUIDO 2D (sin búfer)
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hashi(ix, iy, seed), b = hashi(ix + 1, iy, seed), c = hashi(ix, iy + 1, seed), d = hashi(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
// campo suave evaluado en una rejilla gruesa (cada `step` px) e interpolado: el ruido de baja frecuencia no
// necesita calcularse en cada píxel (en un A4 a 300 ppp son 8,7 millones de llamadas)
function lowField(w, h, step, fn) {
  const gw = Math.ceil((w - 1) / step) + 2, gh = Math.ceil((h - 1) / step) + 2, g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
  const inv = 1 / step;
  return (x, y) => {
    const fx = x * inv, fy = y * inv, ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, o = iy * gw + ix;
    return (g[o] * (1 - ax) + g[o + 1] * ax) * (1 - ay) + (g[o + gw] * (1 - ax) + g[o + gw + 1] * ax) * ay;
  };
}
function fbm2(x, y, seed) { return vnoise(x, y, seed) * 0.57 + vnoise(x * 2.07, y * 2.07, seed + 1) * 0.29 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.14; }

// ================================================================ IMPERFECCIONES
function estadoCounts(st) {
  if (st.custom && typeof st.custom === 'object') return st.custom;
  const e = P.ESTADOS.filter(x => x.id === st.estado)[0] || P.ESTADOS[0];
  return e.v;
}

// Dibuja una mancha (o una pieza de atlas) escalada, girada y fundida según su naturaleza.
// o.absorb: la mancha entra más en los valles del grano (>0) o se queda en las crestas (<0, grafito, polvo, tinta de dedos)
// o.erode: la mancha nunca es uniforme; un ruido propio le come zonas (así ninguna repetición es igual)
function drawSprite(S, B, src, rect, cx, cy, sx, sy, rot, mode, op, mask, flip, o) {
  const { w, h } = S;
  o = o || {};
  const sx0 = rect ? rect[0] : 0, sy0 = rect ? rect[1] : 0;
  const sw = rect ? rect[2] : src.width, sh = rect ? rect[3] : src.height;
  const ch = src.channels, sd = src.data, SW = src.width;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const hw = sw * sx / 2, hh = sh * sy / 2;
  const ext = Math.ceil(Math.abs(hw * ca) + Math.abs(hh * sa)) + 2, eyt = Math.ceil(Math.abs(hw * sa) + Math.abs(hh * ca)) + 2;
  const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(w - 1, Math.ceil(cx + ext));
  const y0 = Math.max(0, Math.floor(cy - eyt)), y1 = Math.min(h - 1, Math.ceil(cy + eyt));
  if (x1 < x0 || y1 < y0) return;
  const ix = 1 / sx, iy = 1 / sy;
  const alb = B.alb, D = B.D, dinv = 1 / (S.dstd || 0.01);
  const md = mask ? mask.data : null;
  const absorb = def(o.absorb, 0), erode = def(o.erode, 0), cell = Math.max(2, def(o.cellPx, 20)), es = def(o.eseed, 1), cock = def(o.cockle, 0);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      let u = (dx * ca + dy * sa) * ix + sw / 2, v = (-dx * sa + dy * ca) * iy + sh / 2;
      if (flip) u = sw - u;
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) continue;
      const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv;
      const base = ((sy0 + iv) * SW + sx0 + iu) * ch;
      const oo = y * w + x, j = oo * 4;
      const sampleC = (c) => {
        const a = sd[base + c], b = sd[base + ch + c], cc = sd[base + SW * ch + c], d = sd[base + SW * ch + ch + c];
        return ((a + (b - a) * fu) * (1 - fv) + (cc + (d - cc) * fu) * fv) / 255;
      };
      let k = op;
      if (absorb) k *= clamp(1 - absorb * 0.42 * D[oo] * dinv, 0.3, 1.9);
      if (erode) k *= 1 - erode * (1 - smooth(0.22, 0.72, fbm2(x / cell, y / cell, es)));
      if (mode === 'multiply') {
        const m0 = sampleC(0), m1 = ch >= 3 ? sampleC(1) : m0, m2 = ch >= 3 ? sampleC(2) : m0;
        alb[j] *= 1 - (1 - m0) * k; alb[j + 1] *= 1 - (1 - m1) * k; alb[j + 2] *= 1 - (1 - m2) * k;
        if (cock && B.F) B.F[oo] += cock * smooth(0, 0.08, 1 - (m0 + m1 + m2) / 3) * 0.6;
      } else if (mode === 'grease') {
        const m0 = sampleC(0), m1 = ch >= 3 ? sampleC(1) : m0, m2 = ch >= 3 ? sampleC(2) : m0;
        const g = clamp((1 - (m0 * 0.2126 + m1 * 0.7152 + m2 * 0.0722)) * 4, 0, 1);
        const dd = 1 - g * k * 0.07;
        alb[j] *= dd; alb[j + 1] *= dd; alb[j + 2] *= dd * 0.988;
        const tv = B.trans[oo] + g * k * 200; B.trans[oo] = tv > 255 ? 255 : tv;
        const gv = B.gloss[oo] + g * k * 200; B.gloss[oo] = gv > 255 ? 255 : gv;
      } else {
        // relieve (0.5 = plano)
        const rv = (sampleC(0) - 0.5) / 4;
        B.R[oo] += rv * k * 1.4;
        if (md && (mode === 'erase' || mode === 'wax')) {
          const mm = ((md[iv * sw + iu] + md[iv * sw + Math.min(sw - 1, iu + 1)]) / 2) / 255 * k;
          if (mode === 'erase') {
            alb[j] += (255 - alb[j]) * mm * 0.12; alb[j + 1] += (255 - alb[j + 1]) * mm * 0.12; alb[j + 2] += (255 - alb[j + 2]) * mm * 0.12;
            const dv = B.damage[oo] + mm * 255; B.damage[oo] = dv > 255 ? 255 : dv;
          } else {
            const tv = B.trans[oo] + mm * 220; B.trans[oo] = tv > 255 ? 255 : tv;
            const gv = B.gloss[oo] + mm * 255; B.gloss[oo] = gv > 255 ? 255 : gv;
            alb[j] *= 1 - mm * 0.03; alb[j + 1] *= 1 - mm * 0.03; alb[j + 2] *= 1 - mm * 0.055;
          }
        }
      }
    }
  }
}

// dónde aparece cada cosa (mm). Sigue la causa física de cada daño.
function place(rule, r, Wm, Hm, sizeMm, it) {
  const halfH = it ? sizeMm * it.h / Math.max(it.w, it.h) / 2 : sizeMm / 2;
  const any = () => ({ x: lerp(0.08, 0.92, r()) * Wm, y: lerp(0.08, 0.92, r()) * Hm, rot: r() * Math.PI * 2 });
  switch (rule) {
    case 'edge': {   // dedos: sobre todo la esquina inferior exterior, luego borde derecho y centro del margen inferior
      const q = r();
      if (q < 0.55) return { x: Wm - lerp(8, 30, r()), y: Hm - lerp(8, 34, r()), rot: lerp(-0.4, 0.9, r()) + Math.PI / 2 };
      if (q < 0.8) return { x: Wm - lerp(4, 14, r()), y: lerp(0.35, 0.8, r()) * Hm, rot: Math.PI / 2 + (r() - 0.5) * 0.7 };
      return { x: lerp(0.35, 0.65, r()) * Wm, y: Hm - lerp(4, 14, r()), rot: (r() - 0.5) * 0.8 };
    }
    case 'water': {  // el agua entra desde un borde (casi siempre el inferior) y queda cortada por él
      const q = r();
      if (q < 0.6) return { x: lerp(0.1, 0.9, r()) * Wm, y: Hm + sizeMm * lerp(-0.25, 0.25, r()), rot: r() * 6.28 };
      if (q < 0.85) { const left = r() < 0.5; return { x: left ? sizeMm * lerp(-0.25, 0.2, r()) : Wm - sizeMm * lerp(-0.25, 0.2, r()), y: lerp(0.35, 0.95, r()) * Hm, rot: r() * 6.28 }; }
      return any();
    }
    case 'tape': {
      if (r() < 0.65) {
        const q = (r() * 4) | 0, sx = q & 1 ? -1 : 1, sy = q & 2 ? -1 : 1;
        const cx = q & 1 ? Wm : 0, cy = q & 2 ? Hm : 0, ins = lerp(6, 12, r());
        return { x: cx + sx * ins, y: cy + sy * ins, rot: (sx * sy > 0 ? -1 : 1) * Math.PI / 4 + (r() - 0.5) * 0.25 };
      }
      return { x: lerp(0.35, 0.65, r()) * Wm, y: lerp(2, 7, r()), rot: (r() - 0.5) * 0.2 };
    }
    case 'top_right': return { x: lerp(0.62, 0.88, r()) * Wm, y: lerp(0.05, 0.18, r()) * Hm, rot: (r() - 0.5) * 0.5 };
    case 'seal': return r() < 0.6 ? { x: lerp(0.58, 0.82, r()) * Wm, y: lerp(0.72, 0.9, r()) * Hm, rot: (r() - 0.5) * 0.3 }
      : { x: lerp(0.15, 0.35, r()) * Wm, y: lerp(0.75, 0.9, r()) * Hm, rot: (r() - 0.5) * 0.3 };
    case 'lower': return { x: lerp(0.15, 0.85, r()) * Wm, y: lerp(0.55, 0.92, r()) * Hm, rot: (r() - 0.5) * 0.7 };
    case 'staple': {  // grapa: casi siempre esquina superior izquierda; en diagonal, horizontal o vertical. Varias grapas acaban en el mismo sitio.
      const right = r() < 0.1, q = r();
      let x, y, rot;
      if (q < 0.55) { x = lerp(8, 13, r()); y = lerp(8, 13, r()); rot = -Math.PI / 4 + (r() - 0.5) * 0.25; }
      else if (q < 0.88) { x = lerp(12, 22, r()); y = lerp(5.5, 10, r()); rot = (r() - 0.5) * 0.12; }
      else { x = lerp(5.5, 10, r()); y = lerp(12, 24, r()); rot = Math.PI / 2 + (r() - 0.5) * 0.12; }
      if (right) { x = Wm - x; rot = -rot; }
      return { x, y, rot };
    }
    case 'clip': {    // clip: abraza el canto superior, su huella baja perpendicular al borde
      const x = (r() < 0.75 ? lerp(0.1, 0.42, r()) : lerp(0.6, 0.88, r())) * Wm;
      return { x, y: halfH + lerp(-3, 1.5, r()), rot: (r() - 0.5) * 0.22 + (r() < 0.5 ? Math.PI : 0) };
    }
    case 'binder': {  // pinza: centrada en el canto superior (o en el izquierdo si se archivó de lado)
      if (r() < 0.8) return { x: lerp(0.38, 0.62, r()) * Wm, y: halfH + lerp(1, 5, r()), rot: (r() - 0.5) * 0.08 };
      return { x: halfH + lerp(1, 5, r()), y: lerp(0.38, 0.62, r()) * Hm, rot: -Math.PI / 2 + (r() - 0.5) * 0.08 };
    }
    case 'handled': { // golpes de uña y arruguitas: donde se coge el papel (esquinas y bordes, sobre todo abajo a la derecha)
      const q = r(), d = () => lerp(4, 30, Math.pow(r(), 1.4));
      if (q < 0.4) return { x: Wm - d(), y: Hm - d(), rot: r() * 6.28 };
      if (q < 0.58) return { x: Wm - d(), y: lerp(0.2, 0.85, r()) * Hm, rot: r() * 6.28 };
      if (q < 0.72) return { x: Wm - d(), y: d(), rot: r() * 6.28 };
      if (q < 0.86) return { x: d(), y: lerp(0.15, 0.95, r()) * Hm, rot: r() * 6.28 };
      return { x: lerp(0.2, 0.8, r()) * Wm, y: Hm - d(), rot: r() * 6.28 };
    }
    default: return any();
  }
}

// ---------------------------------------------------------------- envejecimiento por campos
// curva de color del papel al envejecer: blanco → crema → marfil → tostado → tabaco
const AGE_STOPS = [[0, 1, 1, 1], [0.25, 0.99, 0.966, 0.895], [0.5, 0.975, 0.926, 0.795], [0.75, 0.948, 0.868, 0.69], [1, 0.905, 0.795, 0.585], [1.4, 0.84, 0.7, 0.47]];
function ageTint(a, out) {
  a = clamp(a, 0, 1.4);
  let i = 0; while (i < AGE_STOPS.length - 2 && a > AGE_STOPS[i + 1][0]) i++;
  const A = AGE_STOPS[i], Bb = AGE_STOPS[i + 1], t = (a - A[0]) / (Bb[0] - A[0]);
  out[0] = lerp(A[1], Bb[1], t); out[1] = lerp(A[2], Bb[2], t); out[2] = lerp(A[3], Bb[3], t);
  return out;
}

async function genAging(S, st, assets, B, paper, counts) {
  const { w, h, ppm } = S;
  const kk = clamp(S.k, 0, 2);
  const amt = Math.min(1.5, clamp(def(st.estadoAmount, 1), 0, 3));
  const edad = clamp(def(st.edad, 0), 0, 1.5) * def(paper.ageK, 1) * kk * amt;
  const sol = def(counts.sol, 0) * kk * amt, manoseo = def(counts.manoseo, 0) * kk * amt;
  const manchado = def(counts.manchado, 0) * amt;
  if (edad <= 0.001 && sol <= 0 && manoseo <= 0) return;
  const r = rng(S.seedE * 13 + 5);
  const s1 = (r() * 1e6) | 0, s2 = (r() * 1e6) | 0, s3 = (r() * 1e6) | 0;
  const c30 = 30 * ppm, c6 = 6 * ppm, c2 = 2.2 * ppm;
  const band = (5 + 9 * Math.min(1, edad)) * ppm;
  const Wm = w / ppm;
  // mancha de envejecimiento a hoja completa (de las imágenes de papel viejo): cubre todo el papel
  // Se combinan dos mapas distintos, el segundo girado 90°: las fotos de origen tienen vetas verticales y así ni se
  // repite una hoja reconocible ni domina una dirección. Sólo oscurece (normalizado a su zona más limpia), así que
  // nunca blanquea ni azulea el papel.
  let sheet = null, sheet2 = null, sOp = 0, flipX = false, flipY = false, hiA = [1, 1, 1], hiB = [1, 1, 1];
  const scat = cache.imperf.manchado;
  if (scat && (edad > 0.15 || manchado > 0)) {
    const ia = (r() * scat.items.length) | 0, ib = (ia + 1 + ((r() * (scat.items.length - 1)) | 0)) % scat.items.length;
    sheet = await loadImg(assets, 'imperf/' + scat.items[ia].file);
    sheet2 = await loadImg(assets, 'imperf/' + scat.items[ib].file);
    hiA = scat.items[ia].hi || hiA; hiB = scat.items[ib].hi || hiB;
    sOp = clamp((0.2 + 0.8 * clamp(manchado, 0, 1.5)) * Math.min(1, edad * 1.2) * 0.4, 0, 0.6) * Math.min(1, kk);
    flipX = r() < 0.5; flipY = r() < 0.5;
  }
  const sw = sheet ? sheet.width : 0, shh = sheet ? sheet.height : 0, sd = sheet ? sheet.data : null;
  const sw2 = sheet2 ? sheet2.width : 0, sh2 = sheet2 ? sheet2.height : 0, sd2 = sheet2 ? sheet2.data : null;
  // sol: la parte que asomaba (de una carpeta, bajo otra hoja) se tuesta; el borde es la línea recta del papel
  // que la tapaba (algo inclinada, 2-3 mm de transición) y el tostado crece hacia el canto expuesto
  const side = (r() * 4) | 0, cut = lerp(0.6, 0.85, r()), tilt = (r() - 0.5) * 0.06;
  const soft = 2.6 * ppm, cutLen = side < 2 ? w : h;
  const alb = B.alb, D = B.D, dinv = 1 / (S.dstd || 0.01);
  const tint = [1, 1, 1];
  const soil = [0.83, 0.8, 0.75];
  const st6 = Math.max(1, Math.round(c6 / 8)), st30 = Math.max(1, Math.round(c30 / 10));
  const AM = st._final ? (B.ageMap = new Float32Array(w * h)) : null;   // para envejecer la tinta igual que el papel
  const N1 = lowField(w, h, st30, (x, y) => fbm2(x / c30, y / c30, s1));
  const N2 = lowField(w, h, st6, (x, y) => vnoise(x / c6, y / c6, s2));
  const N3 = lowField(w, h, st30, (x, y) => vnoise(x / c30, y / c30, s3));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      const n1 = N1(x, y), n2 = N2(x, y);
      // distancia irregular al borde: los cantos absorben antes la contaminación
      const dE = Math.min(x, y, w - 1 - x, h - 1 - y) + (n2 - 0.5) * 9 * ppm + (n1 - 0.5) * 12 * ppm;
      const edge = Math.exp(-Math.max(0, dE) / band);
      let a = edad * (0.2 + 0.26 * n1) + edad * 0.55 * edge;
      if (sol > 0) {
        const t = side === 0 ? x / w : side === 1 ? 1 - x / w : side === 2 ? y / h : 1 - y / h;
        const along = side < 2 ? y / h - 0.5 : x / w - 0.5;
        const dpx = (t - cut - tilt * along) * cutLen + (N3(x, y) - 0.5) * 0.8 * ppm;
        const ex = smooth(-soft, soft, dpx);
        if (ex > 0) a += sol * 0.22 * def(paper.ageK, 1) * ex * (0.72 + 0.28 * clamp((t - cut) / (1 - cut), 0, 1)) * (0.85 + 0.3 * n1);
      }
      if (AM) AM[o] = a;
      if (a > 0.002) { ageTint(a, tint); alb[j] *= tint[0]; alb[j + 1] *= tint[1]; alb[j + 2] *= tint[2]; }
      if (sheet) {
        let u = x / w, v = y / h; if (flipX) u = 1 - u; if (flipY) v = 1 - v;
        const si = (Math.min(shh - 1, (v * shh) | 0) * sw + Math.min(sw - 1, (u * sw) | 0)) * 3;
        const si2 = (Math.min(sh2 - 1, (u * sh2) | 0) * sw2 + Math.min(sw2 - 1, ((1 - v) * sw2) | 0)) * 3;
        for (let c = 0; c < 3; c++) {
          const fa = Math.min(1, sd[si + c] / 127.5 / hiA[c]), fb = Math.min(1, sd2[si2 + c] / 127.5 / hiB[c]);
          alb[j + c] *= 1 + (Math.sqrt(fa * fb) - 1) * sOp;
        }
      }
      if (manoseo > 0) {
        // suciedad de las manos: esquina inferior exterior y centro del margen inferior, se queda en las crestas
        const dc = Math.hypot((w - x) / ppm, (h - y) / ppm);
        const mx = (x / ppm - Wm / 2) / 45, my = (h - y) / ppm / 22;
        let s = Math.exp(-dc / 38) * 0.95 + Math.exp(-(mx * mx + my * my)) * 0.45 + Math.exp(-dE / (4 * ppm)) * 0.15;
        s *= manoseo * (0.55 + 0.45 * n2) * clamp(1 + 0.55 * D[o] * dinv, 0.4, 1.8);
        s = clamp(s * 0.3, 0, 0.6);
        if (s > 0.002) { alb[j] *= 1 - (1 - soil[0]) * s; alb[j + 1] *= 1 - (1 - soil[1]) * s; alb[j + 2] *= 1 - (1 - soil[2]) * s; }
      }
    }
  }
}

// ---------------------------------------------------------------- forma del papel (nunca está plano)
// F = altura en mm: ondulación por humedad alineada con la fibra + leve curvatura de la hoja
function genShape(S, st, B, counts) {
  const { w, h, ppm, N } = S;
  const kk = clamp(S.k, 0, 2);
  const cock = (def(counts.cockle, 0) + clamp(def(st.edad, 0), 0, 1) * 0.25) * kk;
  const r = rng(S.seedE * 17 + 3);
  const s1 = (r() * 1e6) | 0, s2 = (r() * 1e6) | 0;
  const along = h >= w;   // la fibra suele ir a lo largo de la hoja
  const cA = 16 * ppm, cB = 44 * ppm;
  const curl = 0.5 + 0.6 * r(), cu = (r() - 0.5) * 0.6, cv = (r() - 0.5) * 0.6, diag = r() < 0.5 ? 1 : -1;
  const F = B.F;
  for (let y = 0; y < h; y++) {
    const v = (2 * y / h - 1);
    for (let x = 0; x < w; x++) {
      const o = y * w + x, u = (2 * x / w - 1);
      let f = curl * (0.5 * (u + cu) * (u + cu) + 0.35 * (v + cv) * (v + cv) + 0.25 * diag * u * v) * 0.6;
      if (cock > 0) {
        const nx = along ? x / cA : x / cB, ny = along ? y / cB : y / cA;
        f += cock * ((vnoise(nx, ny, s1) - 0.5) * 1.3 + (vnoise(nx * 2.3, ny * 2.3, s2) - 0.5) * 0.45);
      }
      F[o] += f;
    }
  }
}

// ================================================================ PLIEGUES Y ARRUGAS
// Cada textura es el sombreado REAL de una hoja fotografiada (sin la luz de la toma ni el grano de su papel).
// Se aplica tal cual: multiplica papel y tinta a la vez (la luz cae sobre todo por igual). De ella salen también
//  · un mapa de desplazamiento suave (como «Desplazar» de Photoshop con la textura desenfocada): la tinta se
//    quiebra un poco al cruzar el pliegue, sin forzar;
//  · las aristas (líneas finas de alto contraste): ahí roza el papel doblado y se levanta la tinta.
const FOLD_LIGHT = { ninguna: 1, escaner: 0.8, dia: 1, ventana: 1.2, foco: 1, flash: 0.75, sombra: 1, lampara: 1.12 };
function cubic(a, b, c, d, t) { return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))); }
async function genFolds(S, st, assets, B) {
  const pid = st.pliegue || 'ninguno';
  const pre = (P.PLIEGUES || []).filter(p => p.id === pid)[0];
  const cat = cache.folds && pre && pre.group ? cache.folds[pre.group] : null;
  const amt = clamp(def(st.pliegueAmount, 1), 0, 3) * clamp(S.k, 0, 2);
  if (!cat || !cat.items.length || amt <= 0) return null;
  const r = rng(S.seedF);
  const nv = cat.items.length;
  const vi = (((def(st.pliegueVar, 0) | 0) % nv) + nv) % nv;
  const it = cat.items[vi];
  const img = await loadImg(assets, 'folds/' + it.file);
  const { w, h, ppm } = S;
  const tw = img.width, th = img.height, TN = tw * th, ch = img.channels, sd = img.data;
  // colocación: el lado largo de la textura con el lado largo del documento; volteos según la variación
  const rot = w > h, fx = r() < 0.5, fy = r() < 0.5;
  let a, b, c = 0, d, e, f = 0;
  if (!rot) { a = (tw - 1) / (w - 1); b = 0; d = 0; e = (th - 1) / (h - 1); }
  else { a = 0; b = (tw - 1) / (h - 1); d = (th - 1) / (w - 1); e = 0; }
  if (fx) { a = -a; b = -b; c = tw - 1; }
  if (fy) { d = -d; e = -e; f = th - 1; }
  const tpm = tw / 210;                                   // px de textura por mm (la foto es un A4)
  // ---- campos a resolución de textura
  const g = 1 / it.gain * def(it.norm, 1);
  const SH = new Float32Array(TN);
  for (let o = 0; o < TN; o++) SH[o] = (sd[o * ch] - 128) * g;
  const tmp = new Float32Array(TN);
  const DS = new Float32Array(SH); gaussBlur(DS, tw, th, 1.3 * tpm, tmp);          // desplazamiento: textura desenfocada
  const CR = new Float32Array(SH); gaussBlur(CR, tw, th, 0.7 * tpm, tmp);          // aristas: contraste fino
  for (let o = 0; o < TN; o++) CR[o] = Math.abs(SH[o] - CR[o]);
  gaussBlur(CR, tw, th, 0.35, tmp);
  let cm = 0; { const hst = new Float32Array(TN >> 4); for (let i = 0; i < hst.length; i++) hst[i] = CR[i << 4]; hst.sort(); cm = hst[(hst.length * 0.996) | 0] || 1e-3; }
  for (let o = 0; o < TN; o++) CR[o] = smooth(0.3, 1, CR[o] / cm);
  const JN = new Float32Array(CR); gaussBlur(JN, tw, th, 2.5 * tpm, tmp);            // cruces: mucha arista junta
  let jm = 0; for (let o = 0; o < TN; o += 5) if (JN[o] > jm) jm = JN[o];
  for (let o = 0; o < TN; o++) JN[o] = smooth(0.35, 0.9, JN[o] / (jm || 1));
  const bil = (A, u, v) => {
    u = u < 0 ? 0 : u > tw - 1.001 ? tw - 1.001 : u; v = v < 0 ? 0 : v > th - 1.001 ? th - 1.001 : v;
    const iu = u | 0, iv = v | 0, du = u - iu, dv = v - iv, o = iv * tw + iu;
    return (A[o] * (1 - du) + A[o + 1] * du) * (1 - dv) + (A[o + tw] * (1 - du) + A[o + tw + 1] * du) * dv;
  };
  // bicúbico (Catmull-Rom) para el sombreado: las aristas siguen nítidas al ampliar la textura
  const bic = (u, v) => {
    u = u < 1 ? 1 : u > tw - 2.001 ? tw - 2.001 : u; v = v < 1 ? 1 : v > th - 2.001 ? th - 2.001 : v;
    const iu = u | 0, iv = v | 0, du = u - iu, dv = v - iv;
    let o = (iv - 1) * tw + iu - 1;
    const r0 = cubic(SH[o], SH[o + 1], SH[o + 2], SH[o + 3], du); o += tw;
    const r1 = cubic(SH[o], SH[o + 1], SH[o + 2], SH[o + 3], du); o += tw;
    const r2 = cubic(SH[o], SH[o + 1], SH[o + 2], SH[o + 3], du); o += tw;
    const r3 = cubic(SH[o], SH[o + 1], SH[o + 2], SH[o + 3], du);
    return cubic(r0, r1, r2, r3, dv);
  };
  const F = {
    amt, it, pre,
    wear: clamp(def(st.pliegueWear, 1), 0, 3) * (1 + 0.8 * clamp(def(st.edad, 0), 0, 1.2)) * Math.min(1.4, clamp(S.k, 0, 2)),
    dirt: clamp(def(st.edad, 0), 0, 1.2),
    // out = [sombreado-1, desplazamiento, arista, cruce]
    sample(x, y, out) {
      const u = a * x + b * y + c, v = d * x + e * y + f;
      out[0] = bic(u, v) * amt; out[1] = bil(DS, u, v) * amt; out[2] = bil(CR, u, v); out[3] = bil(JN, u, v);
      return out;
    }
  };
  // ---- en el papel: color de la arista (fibra rota algo más clara; con los años, suciedad) y, en «Papel de fondo»,
  // el sombreado para ver el pliegue mientras se trabaja
  const alb = B.alb, q = [0, 0, 0, 0];
  const ds = (S.seedF * 5 + 3) | 0, cell = 4 * ppm;
  const shadeIt = !st._final, am1 = Math.min(1, amt);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    F.sample(x, y, q);
    const j = (y * w + x) * 4;
    let m = 1;
    if (q[2] > 0.02) m += q[2] * am1 * (0.02 * (1 - F.dirt) - (0.025 + 0.08 * smooth(0.35, 0.75, fbm2(x / cell, y / cell, ds))) * F.dirt);
    if (shadeIt) m *= clamp(1 + q[0], 0.3, 1.6);
    if (m !== 1) { alb[j] *= m; alb[j + 1] *= m; alb[j + 2] *= m * (m < 1 ? 0.995 : 1); }
  }
  return F;
}

async function genEstado(S, st, assets, B) {
  const counts = estadoCounts(st);
  const amt = clamp(def(st.estadoAmount, 1), 0, 3);
  const k = S.k;
  if (!counts || amt <= 0 || k <= 0) return;
  const { w, h, ppm } = S;
  const Wm = w / ppm, Hm = h / ppm, areaK = (Wm * Hm) / (210 * 297);
  const cats = cache.imperf;
  const r = rng(S.seedE * 31 + 7);
  const opK = clamp(k, 0, 2) * Math.min(1.5, amt);
  const order = ['nodulos', 'fibras', 'descamacion', 'polvo', 'uv', 'calor', 'humedad', 'agua', 'foxing', 'cafe', 'salp_cafe',
    'barro', 'grasa', 'cera', 'adhesivo', 'matasellos', 'quemadura', 'sangrado', 'salp_tinta', 'grafito', 'huella_tinta',
    'huella_grasa', 'goma', 'escritura', 'mecano', 'sello_seco', 'arruguita', 'media_luna', 'pinza', 'clip_huella', 'grapa_marca', 'grapa_agujero'];
  for (const cid of order) {
    let n = counts[cid]; const C = cats[cid];
    if (!n || !C) continue;
    const op0 = C.opacity * opK;
    const base = { absorb: def(C.absorb, 0), erode: def(C.erode, 0), cellPx: def(C.cellMm, 5) * ppm, cockle: def(C.cockle, 0) };
    if (C.kind === 'stamp') {
      n = Math.round(n * Math.min(1.5, amt));
      for (let i = 0; i < n; i++) {
        const it = C.items[(r() * C.items.length) | 0];
        const img = await loadImg(assets, 'imperf/' + it.file);
        const mask = it.mask ? await loadImg(assets, 'imperf/' + it.file.replace('.png', '_m.png')) : null;
        const sizeMm = lerp(C.size[0], C.size[1], r());
        const sc = sizeMm * ppm / Math.max(it.w, it.h);
        const an = 1 + (r() - 0.5) * 2 * def(C.aniso, 0.12);    // ninguna mancha tiene las mismas proporciones (las de taza siguen siendo redondas)
        const pl = place(C.place, r, Wm, Hm, sizeMm, it);
        drawSprite(S, B, img, null, pl.x * ppm, pl.y * ppm, sc * an, sc / an, pl.rot, C.mode, op0 * lerp(0.7, 1.05, r()), mask, r() < 0.5,
          Object.assign({ eseed: (r() * 1e6) | 0 }, base));
      }
    } else if (C.kind === 'sprites') {
      const atlas = await loadImg(assets, 'imperf/' + C.atlas);
      const sp = C.sprites;
      const opt = { absorb: base.absorb };
      if (C.place === 'cluster') {
        for (let e = 0; e < Math.round(n * Math.min(1.5, amt)); e++) {
          const cx = lerp(0.15, 0.85, r()) * Wm, cy = lerp(0.15, 0.85, r()) * Hm, R0 = lerp(28, 60, r());
          const dir = r() * Math.PI * 2, drops = Math.round(lerp(20, 60, r()));
          for (let d = 0; d < drops; d++) {
            const s = sp[(r() * sp.length) | 0];
            const rr = Math.abs(gauss(r)) * R0 * 0.6;
            const a = dir + gauss(r) * 0.9;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            const sc = s.mm * ppm * lerp(0.5, 1.1, r()) * Math.max(0.3, 1 - rr / (R0 * 1.6));
            drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, sc, r() * Math.PI * 2, C.mode, op0 * lerp(0.6, 1, r()), null, r() < 0.5, opt);
          }
        }
      } else if (C.place === 'lower') {
        for (let e = 0; e < Math.round(n * Math.min(1.5, amt)); e++) {
          const cx = lerp(0.1, 0.9, r()) * Wm, drops = Math.round(lerp(40, 110, r()));
          for (let d = 0; d < drops; d++) {
            const s = sp[(r() * sp.length) | 0];
            const up = Math.pow(r(), 1.8) * Hm * 0.32;
            const x = cx + gauss(r) * 40, y = Hm - up;
            const sc = s.mm * ppm * lerp(0.45, 1, r()) * (1 - up / (Hm * 0.5));
            drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, sc, r() * Math.PI * 2, C.mode, op0 * lerp(0.5, 0.95, r()), null, false, opt);
          }
        }
      } else {
        // por pieza: cantidad por A4; el tamaño sigue una ley de potencia (muchas pequeñas, pocas grandes)
        const total = Math.round(n * areaK * Math.min(2, amt));
        const clusters = [];
        if (C.place === 'foxing') for (let c = 0; c < 3 + Math.round(n / 50); c++) {
          const edgeBias = r() < 0.65;
          clusters.push([edgeBias ? (r() < 0.5 ? lerp(0.02, 0.18, r()) : lerp(0.82, 0.98, r())) * Wm : r() * Wm,
            edgeBias && r() < 0.4 ? (r() < 0.5 ? lerp(0.02, 0.15, r()) : lerp(0.85, 0.98, r())) * Hm : r() * Hm, lerp(8, 35, r())]);
        }
        for (let i = 0; i < total; i++) {
          const s = sp[(r() * sp.length) | 0];
          let x, y;
          if (clusters.length && r() < 0.78) { const c = clusters[(r() * clusters.length) | 0]; x = c[0] + gauss(r) * c[2]; y = c[1] + gauss(r) * c[2]; }
          else if (cid === 'polvo' && r() < 0.55) {
            const e = Math.pow(r(), 2) * 30, sd = (r() * 4) | 0;
            x = sd === 0 ? e : sd === 1 ? Wm - e : r() * Wm; y = sd === 2 ? e : sd === 3 ? Hm - e : r() * Hm;
          } else { x = r() * Wm; y = r() * Hm; }
          const size = cid === 'foxing' ? lerp(0.35, 1.15, Math.pow(r(), 2.2)) : lerp(0.55, 1.15, r());
          const sc = s.mm * ppm * size;
          const opp = cid === 'foxing' ? op0 * lerp(0.35, 1, Math.pow(r(), 0.7)) : op0 * lerp(0.45, 1, r());
          drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, sc, r() * Math.PI * 2, C.mode, opp, null, r() < 0.5, opt);
        }
      }
    } else if (C.kind === 'lines') {
      const atlas = await loadImg(assets, 'imperf/' + C.atlas);
      const sp = C.sprites.slice();
      for (let b = 0; b < Math.round(n * Math.min(1.5, amt)); b++) {
        const left = lerp(18, 32, r()), top = lerp(22, 48, r()), pitch = C.pitchMm * lerp(0.95, 1.12, r());
        const last = Hm * lerp(0.45, 0.88, r()), rot = (r() - 0.5) * 0.04, press = lerp(0.55, 1, r());
        for (let i = sp.length - 1; i > 0; i--) { const jj = (r() * (i + 1)) | 0; const t = sp[i]; sp[i] = sp[jj]; sp[jj] = t; }
        let y = top, k2 = 0;
        while (y < last && k2 < sp.length) {
          const s = sp[k2++];
          const sc = s.mm * ppm * lerp(0.95, 1.05, r());
          const wmm = s.r[2] * sc / ppm, hmm = s.r[3] * sc / ppm;
          if (wmm > Wm - left - 12) continue;
          const lines = Math.max(1, Math.round(hmm / pitch));
          const x = left + wmm / 2 + (r() - 0.5) * 2, yc = y + (lines - 1) * pitch / 2;
          drawSprite(S, B, atlas, s.r, x * ppm, yc * ppm + (x * ppm - w / 2) * rot, sc, sc, rot, 'relief', op0 * press * lerp(0.75, 1.05, r()), null, false);
          y += lines * pitch;
          if (r() < 0.08) y += pitch;
        }
      }
    }
  }
}

// ================================================================ CALCO
async function genCalco(S, st, assets, B, paper, backArt) {
  const id = st.calco;
  if (!id || id === 'ninguno') return;
  const { w, h, ppm, N } = S;
  const k = S.k;
  const amount = clamp(def(st.calcoAmount, 1), 0, 3) * clamp(k, 0, 2) * def(st._calcoBoost, 1);
  if (amount <= 0) return;
  const tr = clamp(def(paper.translucency, 0.25), 0, 1);
  const blur = ppm * (0.18 + 0.5 * (1 - tr)) * clamp(def(st.calcoBlur, 1), 0.2, 4);
  const f = clamp(Math.floor(blur / 1.5), 1, 6);
  const lw = Math.ceil(w / f), lh = Math.ceil(h / f), LN = lw * lh;
  const cov = new Float32Array(LN), tmpL = new Float32Array(LN);
  let colB = null;
  if (id === 'documento') {
    if (!backArt) return;
    const a = backArt.data, c = backArt.channels;
    colB = [new Float32Array(LN), new Float32Array(LN), new Float32Array(LN)];
    for (let ly = 0; ly < lh; ly++) for (let lx = 0; lx < lw; lx++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let yy = ly * f; yy < Math.min(h, ly * f + f); yy++) for (let xx = lx * f; xx < Math.min(w, lx * f + f); xx++) {
        const s0 = (yy * w + (w - 1 - xx)) * c, al = c === 4 ? a[s0 + 3] / 255 : 1;
        sr += a[s0] / 255 * al + (1 - al); sg += a[s0 + 1] / 255 * al + (1 - al); sb += a[s0 + 2] / 255 * al + (1 - al); n++;
      }
      const o = ly * lw + lx, R0 = sr / n, G0 = sg / n, B0 = sb / n;
      cov[o] = 1 - (R0 * 0.2126 + G0 * 0.7152 + B0 * 0.0722);
      colB[0][o] = 1 - R0; colB[1][o] = 1 - G0; colB[2][o] = 1 - B0;
    }
  } else {
    const img = await loadImg(assets, 'calco/' + cache.calco[id].ink);
    mapBack(img, cov, lw, lh);
  }
  gaussBlur(cov, lw, lh, blur / f, tmpL);
  if (colB) for (let c = 0; c < 3; c++) gaussBlur(colB[c], lw, lh, blur / f, tmpL);
  const bil = (arr, x, y) => {
    const u = clamp(x / f - 0.5, 0, lw - 1.001), v = clamp(y / f - 0.5, 0, lh - 1.001);
    const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv, o = iv * lw + iu;
    return (arr[o] * (1 - fu) + arr[o + 1] * fu) * (1 - fv) + (arr[o + lw] * (1 - fu) + arr[o + lw + 1] * fu) * fv;
  };
  const s0 = amount * (0.025 + 0.22 * tr);
  const alb = B.alb, trans = B.trans, D = B.D, dinv = 1 / (S.dstd || 0.01);
  const tint = [0.86, 0.87, 0.9];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x;
    const v = bil(cov, x, y); if (v < 0.003) continue;
    // más trasluz donde el papel es más fino (formación) o está engrasado
    const boost = (trans ? 1 + 2.4 * trans[o] / 255 : 1) * clamp(1 + 0.25 * D[o] * dinv, 0.6, 1.5);
    const s = clamp(s0 * boost, 0, 0.9) * v;
    const j = o * 4;
    if (colB) { for (let c = 0; c < 3; c++) { const cv = bil(colB[c], x, y) / Math.max(v, 1e-3); alb[j + c] *= 1 - s * (0.55 * cv + 0.45 * (1 - tint[c] + 0.12)); } }
    else { alb[j] *= 1 - s * (1 - tint[0] + 0.14); alb[j + 1] *= 1 - s * (1 - tint[1] + 0.14); alb[j + 2] *= 1 - s * (1 - tint[2] + 0.14); }
  }
  const tmp = (id === 'apuntes' || id === 'rotulador') ? new Float32Array(N) : null;
  const bleedK = clamp(def(st.calcoBleed, 1), 0, 3) * amount;
  const info = cache.calco[id] || {};
  const thin = 0.15 + 0.85 * tr;
  const bleedLayers = [];
  if (id === 'rotulador') bleedLayers.push({ file: info.pool, col: [0.2, 0.22, 0.3], k: 0.34 * thin, base: info.ink, baseK: 0.08 * thin, blur: 0.12 });
  if (id === 'apuntes') bleedLayers.push({ file: info.fluor, col: [0.97, 0.94, 0.45], k: 0.17 * thin, blur: 0.45 });
  for (const L of bleedLayers) {
    const img = await loadImg(assets, 'calco/' + L.file);
    const bl = new Float32Array(N); mapBack(img, bl, w, h);
    if (L.base) { const b2 = new Float32Array(N); const bi = await loadImg(assets, 'calco/' + L.base); mapBack(bi, b2, w, h); for (let o = 0; o < N; o++) bl[o] = Math.max(bl[o], b2[o] * L.baseK / Math.max(L.k, 1e-3)); }
    gaussBlur(bl, w, h, ppm * L.blur, tmp);
    for (let o = 0; o < N; o++) {
      let v = bl[o]; if (v < 0.01) continue;
      v = clamp(v * (1 + D[o] * 6) - 0.05, 0, 1);
      const s = clamp(v * L.k * bleedK, 0, 0.95), j = o * 4;
      alb[j] *= 1 - s * (1 - L.col[0]); alb[j + 1] *= 1 - s * (1 - L.col[1]); alb[j + 2] *= 1 - s * (1 - L.col[2]);
    }
  }
  if (id === 'apuntes' && info.pressure) {
    const pk = clamp(def(st.calcoPressure, 1), 0, 3) * clamp(k, 0, 2);
    if (pk > 0) {
      const img = await loadImg(assets, 'calco/' + info.pressure);
      const hgt = new Float32Array(N); mapBack(img, hgt, w, h);
      gaussBlur(hgt, w, h, ppm * 0.08, tmp);
      const d = Math.max(1, Math.round(ppm * 0.08));
      for (let y = d; y < h - d; y++) for (let x = d; x < w - d; x++) { const o = y * w + x; B.R[o] += (hgt[o - d * w - d] - hgt[o + d * w + d]) * 0.06 * pk; }
    }
  }
}
function mapBack(img, out, w, h) {
  const iw = img.width, ih = img.height, c = img.channels, d = img.data;
  const s = Math.min(iw / w, ih / h);
  const ox = (iw - w * s) / 2, oy = (ih - h * s) / 2;
  for (let y = 0; y < h; y++) {
    const iv = Math.min(ih - 1, (oy + y * s) | 0);
    for (let x = 0; x < w; x++) { const iu = Math.min(iw - 1, (ox + (w - 1 - x) * s) | 0); out[y * w + x] = d[(iv * iw + iu) * c] / 255; }
  }
}

function applyRelief(S, B) {
  const alb = B.alb, R = B.R;
  for (let o = 0; o < S.N; o++) {
    const r = R[o]; if (r === 0) continue;
    const f = 1 + clamp(r, -0.5, 0.5), j = o * 4;
    alb[j] *= f; alb[j + 1] *= f; alb[j + 2] *= f;
  }
}

// ================================================================ API: PAPEL DE FONDO
async function renderPaper(opts) {
  const { w, h, ppm, state, assets } = opts;
  const prog = opts.onProgress || (async () => {});
  await catalogs(assets);
  const st = Object.assign({}, P.DEFAULT_STATE, state || {});
  const N = w * h;
  const S = { w, h, ppm, N, seed: (def(st.seed, 1) | 0) * 7919 + 13, k: clamp(def(st.intensity, 50), 0, 100) / 50 };
  // semillas por sección: el botón ⟳ de cada sección cambia sólo lo suyo
  S.seedP = S.seed + (def(st.seedPaper, 0) | 0) * 104729;
  S.seedE = S.seed + (def(st.seedEstado, 0) | 0) * 130363;
  S.seedF = S.seed * 3 + 101 + (def(st.pliegueVar, 0) | 0) * 7;
  const B = { alb: new Uint8ClampedArray(N * 4), D: new Float32Array(N), T: new Float32Array(N), F: new Float32Array(N), R: new Float32Array(N),
    trans: new Uint8Array(N), gloss: new Uint8Array(N), damage: new Uint8Array(N) };
  await prog(0.05, 'Cargando la textura…');
  const paper = await genPaper(S, st, assets, B);
  let s2 = 0; for (let o = 0; o < N; o += 7) s2 += B.D[o] * B.D[o];
  S.dstd = Math.sqrt(s2 / Math.ceil(N / 7)) || 0.01;
  B.T = null;
  const counts = estadoCounts(st) || {};
  await prog(0.2, 'Envejeciendo el papel…');
  await genAging(S, st, assets, B, paper, counts);
  await prog(0.35, 'Imperfecciones…');
  await genEstado(S, st, assets, B);
  await prog(0.55, 'Calco del reverso…');
  await genCalco(S, st, assets, B, paper, opts.backArt || null);
  applyRelief(S, B);
  B.R = null;
  genShape(S, st, B, counts);
  await prog(0.68, 'Pliegues…');
  B.fold = await genFolds(S, st, assets, B);
  await prog(0.8, 'Listo el papel');
  return { rgba: new Uint8Array(B.alb.buffer), buffers: B, paper, S, st };
}

// ================================================================ LUZ
// dirección (en la imagen) de la que viene la luz, cuánto revela el relieve del grano (rk) y la forma de la hoja (fk),
// y cuánto deja ver la textura (texLight: el escáner la aplana, la luz rasante la marca)
const LIGHT = {
  ninguna: { lx: -0.5, ly: -0.7, rk: 0, fk: 0, tex: 1 },
  escaner: { lx: 0, ly: -1, rk: 0.22, fk: 0.05, tex: 0.6 },
  dia: { lx: 0.3, ly: -0.9, rk: 0.35, fk: 0.45, tex: 0.9 },
  ventana: { lx: -0.95, ly: 0.3, rk: 1, fk: 1.1, tex: 1.12 },
  foco: { lx: -0.2, ly: -0.6, rk: 0.4, fk: 0.55, tex: 0.95 },
  flash: { lx: 0, ly: -0.3, rk: 0.1, fk: 0.25, tex: 0.78 },
  sombra: { lx: -0.3, ly: -0.9, rk: 0.35, fk: 0.55, tex: 0.92 },
  lampara: { lx: 0.85, ly: -0.55, rk: 0.85, fk: 0.95, tex: 1.06 }
};
function lightDir(id) { const L = LIGHT[id] || LIGHT.ninguna; const n = Math.hypot(L.lx, L.ly) || 1; return [L.lx / n, L.ly / n, L]; }

// ================================================================ API: APLICAR (render final)
async function renderFinal(opts) {
  const { w, h, ppm, assets, art, artComponents } = opts;
  const prog = opts.onProgress || (async () => {});
  const st0 = Object.assign({}, P.DEFAULT_STATE, opts.state || {});
  const Lsel = LIGHT[st0.luz] || LIGHT.ninguna;
  const kk0 = clamp(clamp(def(st0.intensity, 50), 0, 100) / 50, 0, 2);
  const stF = Object.assign({}, st0, {
    _texLight: lerp(1, Lsel.tex, Math.min(1, kk0)),
    _calcoBoost: st0.luz === 'escaner' ? 1.45 : 1,
    _final: true
  });
  const base = await renderPaper(Object.assign({}, opts, { state: stF, onProgress: async (v, m) => prog(v * 0.45, m) }));
  const { buffers: B, paper, S, st } = base;
  const N = S.N, k = S.k, kk = clamp(k, 0, 2);
  const alb = B.alb, D = B.D, F = B.F, gloss = B.gloss;
  const out = new Uint8ClampedArray(N * 4);
  const comps = artComponents || 4;
  const method = st.impresion || 'offset';

  // ---- 1) mapa de desplazamiento propio de este papel: el relieve del grano a su escala real
  await prog(0.48, 'Mapa de desplazamiento del papel…');
  const scale = clamp(def(st.scale, 1), 0.1, 10);
  const reliefK = clamp(def(paper.rough, 0.02) / 0.03, 0.2, 3) * def(paper.reliefAdj, 1);
  const Hs = new Float32Array(N), tmp = new Float32Array(N);
  const tk = 1 / (S.texK || 1);
  for (let o = 0; o < N; o++) Hs[o] = D[o] * tk;
  const gSig = clamp(def(paper.grainMm, 0.12) * scale * ppm * 0.85, 0.7, 10);
  gaussBlur(Hs, w, h, gSig, tmp);
  let g2 = 0, gn = 0;
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) { const o = y * w + x; const gx = Hs[o + 1] - Hs[o - 1], gy = Hs[o + w] - Hs[o - w]; g2 += gx * gx + gy * gy; gn++; }
  const ginv = 1 / (Math.sqrt(g2 / Math.max(1, gn)) || 1e-4);
  const methK = { offset: 1, tipografia: 0.75, inkjet: 1.25, laser: 0.4 }[method] || 1;
  // desplazamiento (px): papel liso casi nada, rugoso e irregular bastante; crece con la escala del grano
  const disp = ppm * 0.045 * Math.min(reliefK, 2.2) * Math.pow(scale, 0.75) * clamp(def(st.grain, 1), 0, 4) * Math.pow(kk, 0.8) * methK;
  // perspectiva de la cámara sobre la forma de la hoja (sólo en foto)
  const camK = (st.luz !== 'ninguna' && st.luz !== 'escaner') ? ppm * kk / (Math.hypot(w, h) * 1.4) * 0.9 : 0;
  const cxp = w / 2, cyp = h / 2;

  // ---- 2) campos auxiliares según la técnica de impresión
  let Cb = null;
  if (method === 'tipografia') {
    // cobertura suavizada: borde más cargado (tinta exprimida) y letra hundida
    Cb = new Float32Array(N);
    for (let o = 0; o < N; o++) {
      const s = o * comps, al = comps === 4 ? art[s + 3] / 255 : 1;
      Cb[o] = (1 - (art[s] * 0.2126 + art[s + 1] * 0.7152 + art[s + 2] * 0.0722) / 255) * al;
    }
    gaussBlur(Cb, w, h, Math.max(0.6, 0.1 * ppm), tmp);
  }
  const porous = clamp(def(paper.translucency, 0.25) * 0.8 + reliefK * 0.15, 0, 1);
  const feather = method === 'inkjet' ? Math.max(0.4, ppm * 0.03 * (1 + 2.5 * porous)) : 0;

  // ---- 3) envejecimiento de la tinta
  // Una tinta de 100 años: los colorantes se han ido con la luz (el amarillo y el magenta antes que el cian), el negro
  // ha perdido fuerza y vira a pardo, y la tinta se ha levantado — primero en las crestas del grano, a manchitas y a
  // tramos. Todo sigue el envejecimiento del propio papel: donde el papel está más tostado (cantos, zona al sol) la
  // tinta está más gastada.
  const inkAge = clamp(def(st.edad, 0), 0, 1.3) * clamp(def(st.inkAge, 1), 0, 2) * kk;
  const cap = 0.955 - 0.03 * Math.min(1, inkAge);          // el negro nunca es negro puro
  const AM = B.ageMap || null;
  let amInv = 1;
  if (AM) { let sm = 0, n = 0; for (let o = 0; o < N; o += 37) { sm += AM[o]; n++; } amInv = n && sm > 0 ? n / sm : 1; }
  const lft = Math.max(1.1, 0.16 * ppm), mot2 = 1.6 * ppm, flk = Math.max(1.5, 0.3 * ppm), lSeed = (S.seedE * 11 + 17) | 0, patchE = 7 * ppm;
  const absorb = clamp(def(st.absorb, 1), 0, 3) * kk;
  const mixK = clamp(k * 1.4, 0, 1);
  const inkMode = st.inkMode === 'normal' ? 'normal' : 'multiply';
  const [Lx, Ly, Lp] = lightDir(st.luz);
  const rk = Lp.rk * kk * 0.05 * Math.sqrt(reliefK), fk = Lp.fk * kk * 0.9;
  const sampleArt = (sx, sy, outc) => {
    sx = sx < 0 ? 0 : sx > w - 1.001 ? w - 1.001 : sx; sy = sy < 0 ? 0 : sy > h - 1.001 ? h - 1.001 : sy;
    const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
    const a00 = (iy * w + ix) * comps, a10 = a00 + comps, a01 = a00 + w * comps, a11 = a01 + comps;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    const al = comps === 4 ? (art[a00 + 3] * w00 + art[a10 + 3] * w10 + art[a01 + 3] * w01 + art[a11 + 3] * w11) / 255 : 1;
    for (let c = 0; c < 3; c++) outc[c] = (art[a00 + c] * w00 + art[a10 + c] * w10 + art[a01 + c] * w01 + art[a11 + c] * w11) / 255;
    outc[3] = al;
  };
  const cA = [0, 0, 0, 0], cB2 = [0, 0, 0, 0];
  const dinv = 1 / (S.dstd || 0.01);
  // ---- pliegues: normales (sombreado con la luz de la toma), desplazamiento de la tinta y desgaste de las aristas
  const FD = B.fold, fq = [0, 0, 0, 0];
  const fShK = FOLD_LIGHT[st.luz] || FOLD_LIGHT.ninguna;
  // desplazamiento suave (como «Desplazar» con la textura desenfocada): ~0,3 mm en los pliegues más marcados
  const fDisp = 2.4 * ppm;
  const methW = { offset: 1, tipografia: 0.85, inkjet: 0.7, laser: 1.5 }[method] || 1;
  const fWear = FD ? FD.wear * methW * 0.36 : 0;
  const fCell = 2.6 * ppm, fFine = Math.max(1.2, 0.35 * ppm), fSeed = (S.seedF * 7 + 5) | 0;
  const edgeMm = 28 * ppm;
  const mot = 0.8 * ppm, sMot = (S.seed * 3) | 0;
  await prog(0.55, 'Imprimiendo en el papel…');
  for (let y = 1; y < h - 1; y++) {
    if ((y & 255) === 0) await prog(0.55 + 0.25 * y / h, 'Imprimiendo en el papel…');
    for (let x = 1; x < w - 1; x++) {
      const o = y * w + x, j = o * 4;
      // gradiente del relieve del papel (dirección en la que la tinta "resbala" hacia los valles)
      const gx = (Hs[o + 1] - Hs[o - 1]) * ginv, gy = (Hs[o + w] - Hs[o - w]) * ginv;
      let sx = x - gx * disp, sy = y - gy * disp;
      if (camK) { const f = F[o]; sx -= f * (x - cxp) * camK / ppm; sy -= f * (y - cyp) * camK / ppm; }
      if (FD) { FD.sample(x, y, fq); sx -= fq[1] * fDisp; sy -= fq[1] * fDisp * 0.65; }
      sampleArt(sx, sy, cA);
      if (feather > 0) {
        // la tinta líquida se abre siguiendo las fibras
        sampleArt(sx + feather, sy + feather * 0.4, cB2);
        for (let c = 0; c < 4; c++) cA[c] = cA[c] * 0.6 + cB2[c] * 0.4;
        sampleArt(sx - feather * 0.5, sy - feather, cB2);
        for (let c = 0; c < 4; c++) cA[c] = cA[c] * 0.8 + cB2[c] * 0.2;
      }
      const al = cA[3];
      // absorbancia de la tinta (premultiplicada sobre blanco)
      let a0 = (1 - cA[0]) * al, a1 = (1 - cA[1]) * al, a2 = (1 - cA[2]) * al;
      const am = (a0 + a1 + a2) / 3;
      const hn = D[o] * dinv;
      if (inkAge > 0 && am > 0.003) {
        const Fl = AM ? clamp(AM[o] * amInv, 0.55, 2.2) : 1;
        const ea = 1 - Math.exp(-1.8 * inkAge * Fl);
        // densidades ópticas: parte neutra (negro) y parte de color
        let d0 = -Math.log(1 - Math.min(0.985, a0)), d1 = -Math.log(1 - Math.min(0.985, a1)), d2 = -Math.log(1 - Math.min(0.985, a2));
        const kN = Math.min(d0, d1, d2);
        const c0 = (d0 - kN) * (1 - 0.45 * ea), c1 = (d1 - kN) * (1 - 0.7 * ea), c2 = (d2 - kN) * (1 - 0.8 * ea);
        const kD = kN * (1 - 0.42 * ea);
        // tinta levantada: en las fibras altas, irregular, con escamas sueltas
        const fineN = fbm2(x / lft, y / lft, lSeed);
        const lift = ea * (0.14 + 0.4 * smooth(0.3, 0.8, fineN * 0.8 + 0.22 * smooth(-1, 2, hn)));
        const pv = fbm2(x / patchE, y / patchE, lSeed + 5);       // zonas más gastadas (manchas de varios mm)
        const mott = (1 - ea * 0.25 * (fbm2(x / mot2, y / mot2, lSeed + 3) - 0.5)) * (1 - ea * 0.3 * smooth(0.42, 0.75, pv));
        // escamas: se agrupan en las zonas gastadas, casi no hay en las sanas
        const ft = 0.9 - 0.1 * ea - 0.16 * ea * smooth(0.35, 0.75, pv);
        const fl = ea > 0.12 ? smooth(ft, ft + 0.04, fbm2(x / flk, y / flk, lSeed + 7)) : 0;
        const keep = (1 - lift) * mott * (1 - 0.9 * fl);
        d0 = (c0 + kD * (1 - 0.24 * ea)) * keep; d1 = (c1 + kD * (1 - 0.11 * ea)) * keep; d2 = (c2 + kD) * keep;
        a0 = 1 - Math.exp(-d0); a1 = 1 - Math.exp(-d1); a2 = 1 - Math.exp(-d2);
      }
      a0 *= cap; a1 *= cap; a2 *= cap;
      let cover = 1;
      let pr = alb[j], pg = alb[j + 1], pb = alb[j + 2];
      if (method === 'offset') {
        a0 = 1 - Math.pow(1 - a0, 1.06); a1 = 1 - Math.pow(1 - a1, 1.06); a2 = 1 - Math.pow(1 - a2, 1.06);
        cover = 1 - absorb * 0.2 * Math.sqrt(reliefK) * smooth(1.3, 3, -hn);
      } else if (method === 'tipografia') {
        const cb = Cb[o], cv = am / Math.max(cap, 0.01);
        const rim = clamp(cv - cb, 0, 1);
        const fill = cb > 0.5 ? 1 - 0.16 * smooth(0.45, 0.8, fbm2(x / mot, y / mot, sMot)) * smooth(0.5, 0.9, cb) : 1;
        const kr = 1 + 0.4 * rim;
        a0 = Math.min(cap, a0 * kr * fill); a1 = Math.min(cap, a1 * kr * fill); a2 = Math.min(cap, a2 * kr * fill);
        cover = 1 - absorb * 0.32 * smooth(0.6, 2.4, -hn);
      } else if (method === 'inkjet') {
        a0 *= 0.97; a1 *= 0.97; a2 *= 0.97;
        cover = 1 - absorb * 0.1 * smooth(1.6, 3, -hn);
      } else if (method === 'laser') {
        // el tóner se queda encima: tapa la textura del papel bajo las zonas impresas
        const tcov = clamp(am * 1.3, 0, 1) * 0.55, flat = 1 / (1 + D[o] * 0.9);
        pr = lerp(pr, pr * flat, tcov); pg = lerp(pg, pg * flat, tcov); pb = lerp(pb, pb * flat, tcov);
        const gv = gloss[o] + am * 90; gloss[o] = gv > 255 ? 255 : gv;
      }
      if (B.damage) cover *= 1 - B.damage[o] / 255 * 0.85;
      if (fWear > 0 && fq[2] > 0.03) {
        // la arista exterior del doblez roza y se lleva la tinta: a tramos, primero en las crestas del grano,
        // más en los cruces de pliegues y cerca de los bordes de la hoja (las esquinas del paquete doblado)
        const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
        const edgeK = 1 + 0.7 * smooth(edgeMm, 0, ed);
        const patch = smooth(0.28, 0.68, fbm2(x / fCell, y / fCell, fSeed));
        const fine = fbm2(x / fFine, y / fFine, fSeed + 9) - 0.5;
        const sharp = method === 'laser' ? 0.08 : 0.22;
        let wv = fWear * fq[2] * fq[2] * (0.5 + 1.1 * fq[3]) * edgeK * (0.25 + 0.75 * patch);   // sólo el filo de la arista
        wv = smooth(0.42 - sharp, 0.42 + sharp, wv * (0.7 + 0.6 * smooth(-1.5, 1.5, hn + fine * 2.2)));
        cover *= 1 - 0.82 * wv;
      }
      if (gloss && method !== 'laser') cover *= 1 - gloss[o] / 255 * 0.1;
      let r, g, b;
      if (inkMode === 'multiply') { r = pr * (1 - a0 * cover); g = pg * (1 - a1 * cover); b = pb * (1 - a2 * cover); }
      else { const t = al * cover, dd = 1 + D[o] * 0.6; r = lerp(pr, cA[0] * 255 * dd, t); g = lerp(pg, cA[1] * 255 * dd, t); b = lerp(pb, cA[2] * 255 * dd, t); }
      // lo que se vería sin efectos (para intensidades bajas)
      const o0 = (y * w + x) * comps, al0 = comps === 4 ? art[o0 + 3] / 255 : 1;
      const b0r = lerp(alb[j], art[o0], al0), b0g = lerp(alb[j + 1], art[o0 + 1], al0), b0b = lerp(alb[j + 2], art[o0 + 2], al0);
      r = lerp(b0r, r, mixK); g = lerp(b0g, g, mixK); b = lerp(b0b, b, mixK);
      // la luz de la foto revela el relieve del grano y la forma de la hoja
      let shade = 1;
      if (rk) shade += clamp(-(gx * Lx + gy * Ly) * rk, -0.12, 0.12);
      if (fk) shade += clamp(-((F[o + 1] - F[o - 1]) * Lx + (F[o + w] - F[o - w]) * Ly) * 0.5 * ppm * fk * 0.06, -0.14, 0.14);
      if (Cb && rk) shade += clamp(((Cb[o + 1] - Cb[o - 1]) * Lx + (Cb[o + w] - Cb[o - w]) * Ly) * 0.06 * kk, -0.05, 0.05);
      if (FD) shade *= clamp(1 + fq[0] * fShK, 0.3, 1.6);
      out[j] = r * shade; out[j + 1] = g * shade; out[j + 2] = b * shade; out[j + 3] = 255;
    }
  }
  // bordes de 1 px
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const j = (y * w + x) * 4, jj = ((y === 0 ? 1 : h - 2) * w + clamp(x, 1, w - 2)) * 4; out[j] = out[jj]; out[j + 1] = out[jj + 1]; out[j + 2] = out[jj + 2]; out[j + 3] = 255; }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const j = (y * w + x) * 4, jj = (y * w + (x === 0 ? 1 : w - 2)) * 4; out[j] = out[jj]; out[j + 1] = out[jj + 1]; out[j + 2] = out[jj + 2]; out[j + 3] = 255; }
  await prog(0.82, 'Fotografiando…');
  photo(S, st, out, B, paper);
  await prog(1, 'Listo');
  return { rgba: new Uint8Array(out.buffer) };
}

// ================================================================ FOTOGRAFÍA
function photo(S, st, px, B, paper) {
  const { w, h } = S;
  const k = clamp(S.k, 0, 2);
  const luz = st.luz || 'ninguna', cal = st.calidad || 'perfecta';
  const expo = Math.pow(2, clamp(def(st.exposure, 0), -1.5, 1.5) * 0.7);
  const diag = Math.hypot(w, h);
  if (luz !== 'ninguna' || expo !== 1) {
    const L = {
      ninguna: { fall: 0, tint: [1, 1, 1], vig: 0, glare: 0, white: 1, black: 0 },
      escaner: { fall: 0, tint: [1.0, 1.003, 1.01], vig: 0, glare: 0, white: 0.985, black: 0.018, scanYellow: 1 },
      dia: { sx: 0.5, sy: -0.6, fall: 0.07, tint: [0.995, 1.0, 1.012], vig: 0.06, glare: 0, white: 0.955, black: 0.03 },
      ventana: { sx: -0.75, sy: 0.25, fall: 0.15, tint: [1.012, 1.0, 0.99], vig: 0.07, glare: 0.012, cool: 0.03, white: 0.95, black: 0.035 },
      foco: { spot: 1, fall: 0.22, tint: [1.025, 1.0, 0.955], vig: 0.07, glare: 0.025, white: 0.955, black: 0.03 },
      flash: { spot: 0.7, fall: 0.2, tint: [0.99, 1.0, 1.02], vig: 0.12, glare: 0.07, white: 0.96, black: 0.04 },
      sombra: { sx: 0.1, sy: -0.8, fall: 0.06, tint: [0.995, 1.0, 1.01], vig: 0.07, glare: 0, shadow: 1, white: 0.95, black: 0.035 },
      lampara: { sx: 0.8, sy: -0.75, fall: 0.2, tint: [1.05, 1.0, 0.885], vig: 0.1, glare: 0.03, white: 0.95, black: 0.035 }
    }[luz] || {};
    const fall = (L.fall || 0) * k, vig = (L.vig || 0) * k, glare = (L.glare || 0) * k;
    const tint = (L.tint || [1, 1, 1]).map(v => 1 + (v - 1) * k);
    // respuesta de la cámara: el blanco del papel nunca llega a 255 y el negro nunca a 0
    const white = 1 - (1 - def(L.white, 1)) * Math.min(1, k), black = def(L.black, 0) * Math.min(1, k) * 255;
    const cx = w / 2, cy = h / 2;
    const sxp = cx + (L.sx || 0) * diag, syp = cy + (L.sy || 0) * diag, hgt = diag * 0.55;
    let e0 = 1;
    if (!L.spot && fall > 0) { const q = (cx - sxp) ** 2 + (cy - syp) ** 2 + hgt * hgt; e0 = hgt / (q * Math.sqrt(q)); }
    const gl = B.gloss;
    // escáner: la luz atraviesa dos veces el papel fino → se ve más amarillo
    const sy = L.scanYellow ? clamp(def(paper.translucency, 0.25), 0, 1) * 0.035 * k : 0;
    // sombra blanda del móvil / de la mano (desde abajo a la derecha)
    const shK = L.shadow ? 0.2 * Math.min(1, k) : 0, shx = w * 0.62, shy = h * 1.08, sra = w * 0.38, srb = h * 0.3;
    // la iluminación es suave: se calcula en una rejilla de 8 px y se interpola
    const E = lowField(w, h, 8, (x, y) => {
      let e = 1;
      if (L.spot) { const rr = Math.hypot(x - cx, y - cy) / (diag * 0.5); e = 1 - fall * smooth(0.2 * L.spot, 1.3, rr); }
      else if (fall > 0) { const q = (x - sxp) ** 2 + (y - syp) ** 2 + hgt * hgt; e = Math.pow(hgt / (q * Math.sqrt(q)) / e0, fall * 1.4) / (1 + fall * 0.15); }
      const rx = (x - cx) / (diag / 2), ry = (y - cy) / (diag / 2);
      e *= 1 / Math.pow(1 + (rx * rx + ry * ry) * vig, 2);
      if (shK) { const qx = (x - shx) / sra, qy = (y - shy) / srb; e *= 1 - shK * smooth(1.45, 0.75, Math.sqrt(qx * qx + qy * qy)); }
      return e * expo;
    });
    const gx0 = L.spot ? cx : cx - (L.sx || 0) * diag * 0.25, gy0 = L.spot ? cy : cy - (L.sy || 0) * diag * 0.25;
    const G = glare > 0 ? lowField(w, h, 8, (x, y) => glare * Math.exp(-((x - gx0) ** 2 + (y - gy0) ** 2) / (diag * diag * 0.04))) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      const e = E(x, y);
      let g = 0;
      if (G) g = G(x, y) * (1 + (gl ? gl[o] / 255 * 3 : 0));
      else if (gl && gl[o] && luz !== 'escaner') g = gl[o] / 255 * 0.025 * k;
      const cool = (L.cool || 0) * k * (1 - Math.min(1, e));
      for (let c = 0; c < 3; c++) {
        let v = px[j + c] * e * tint[c];
        if (c === 2) v *= 1 + cool - sy; if (c === 0) v *= 1 - cool * 0.5;
        v += (255 - v) * g;
        v = black + v * white * (255 - black) / 255;
        px[j + c] = v;
      }
    }
  }
  if (cal === 'perfecta') return;
  quality(S, st, px, cal, k);
}

function quality(S, st, px, cal, k) {
  const { w, h, N } = S;
  const Q = {
    escaner_pro: { sharpen: 0.25, noise: 0.5, contrast: 0.02 },
    escaner_oficina: { blur: 0.55, sharpen: 0.45, noise: 1.0, contrast: 0.1, white: 0.05, desat: 0.1, streak: 1, dust: 1 },
    movil: { sharpen: 0.55, noise: 2.6, chroma: 1.0, contrast: 0.05, sat: 0.06, vig: 0.06 },
    movil_antiguo: { blur: 0.9, noise: 6, chroma: 3.5, contrast: 0.08, jpeg: 0.3, ca: 1.1, cast: [1.01, 1.0, 0.955], vig: 0.14 },
    fotocopia: { gray: 1, blur: 0.65, contrast: 0.5, toner: 1, white: 0.1, noise: 1.8, dust: 1 },
    analogica: { grain: 6, blur: 0.45, contrast: -0.05, lift: 0.05, cast: [1.025, 1.0, 0.95], vig: 0.2, sat: -0.07 }
  }[cal];
  if (!Q) return;
  const scaleK = Math.max(1, Math.max(w, h) / 3000);
  const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let o = 0; o < N; o++) { ch[0][o] = px[o * 4]; ch[1][o] = px[o * 4 + 1]; ch[2][o] = px[o * 4 + 2]; }
  const tmp = new Float32Array(N);
  if (Q.gray) { for (let o = 0; o < N; o++) { const l = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11; ch[0][o] = ch[1][o] = ch[2][o] = l; } }
  if (Q.blur) for (let c = 0; c < 3; c++) gaussBlur(ch[c], w, h, Q.blur * scaleK * k, tmp);
  if (Q.sharpen) {
    const bl = new Float32Array(N);
    for (let c = 0; c < 3; c++) { bl.set(ch[c]); gaussBlur(bl, w, h, 1.4 * scaleK, tmp); for (let o = 0; o < N; o++) ch[c][o] += (ch[c][o] - bl[o]) * Q.sharpen * k; }
  }
  if (Q.ca) {
    const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
    const r0 = new Float32Array(ch[0]), b0 = new Float32Array(ch[2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / R, dy = (y - cy) / R, s = Q.ca * k * scaleK;
      const xr = clamp(Math.round(x + dx * s), 0, w - 1), yr = clamp(Math.round(y + dy * s), 0, h - 1);
      const xb = clamp(Math.round(x - dx * s), 0, w - 1), yb = clamp(Math.round(y - dy * s), 0, h - 1);
      ch[0][y * w + x] = r0[yr * w + xr]; ch[2][y * w + x] = b0[yb * w + xb];
    }
  }
  if (Q.jpeg) {
    for (let c = 0; c < 3; c++) {
      const a = ch[c];
      for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
        let s = 0, s2 = 0, n = 0;
        for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) { const v = a[y * w + x]; s += v; s2 += v * v; n++; }
        const m = s / n, varr = s2 / n - m * m;
        const t = Q.jpeg * k * clamp(1 - varr / 400, 0, 1);
        if (t <= 0) continue;
        for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) { const o = y * w + x; a[o] = lerp(a[o], m, t); }
      }
    }
  }
  const nz = (Q.noise || 0) * k, chn = (Q.chroma || 0) * k, gr = (Q.grain || 0) * k;
  let grainF = null;
  if (gr > 0) { grainF = new Float32Array(N); for (let o = 0; o < N; o++) grainF[o] = hashi(o % w, (o / w) | 0, 5) - 0.5; gaussBlur(grainF, w, h, 0.7 * scaleK, tmp); }
  const con = (Q.contrast || 0) * k, white = (Q.white || 0) * k, desat = (Q.desat || 0) * k, sat = (Q.sat || 0) * k, lift = (Q.lift || 0) * k;
  const cast = (Q.cast || [1, 1, 1]).map(v => 1 + (v - 1) * k);
  const vig = (Q.vig || 0) * k, diag = Math.hypot(w, h) / 2;
  const toner = (Q.toner || 0) * k, streak = (Q.streak || 0) * k;
  // motas de polvo del cristal (escáner / fotocopiadora)
  const dust = [];
  if (Q.dust) { const r = rng(S.seed + 999); const n = Math.round(14 * k); for (let i = 0; i < n; i++) dust.push([r() * w, r() * h, (0.6 + r() * 1.8) * scaleK, 0.2 + 0.5 * r()]); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x, j = o * 4;
    let r = ch[0][o], g = ch[1][o], b = ch[2][o];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (desat || sat) { const s = 1 - desat + sat; r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
    r *= cast[0]; g *= cast[1]; b *= cast[2];
    if (con) { r = 128 + (r - 128) * (1 + con); g = 128 + (g - 128) * (1 + con); b = 128 + (b - 128) * (1 + con); }
    if (white) { const f = 1 / (1 - white); r *= f; g *= f; b *= f; }
    if (lift) { r += lift * 255 * (1 - r / 255); g += lift * 255 * (1 - g / 255); b += lift * 255 * (1 - b / 255); }
    if (vig) { const rr = ((x - w / 2) ** 2 + (y - h / 2) ** 2) / (diag * diag); const f = 1 - vig * rr; r *= f; g *= f; b *= f; }
    if (nz) { const n = (hashi(x, y, 11) + hashi(x, y, 12) - 1) * nz * (0.5 + 1.2 * (1 - l / 255)); r += n; g += n; b += n; }
    if (chn) { r += (hashi(x >> 1, y >> 1, 21) - 0.5) * chn; b += (hashi(x >> 1, y >> 1, 22) - 0.5) * chn; }
    if (grainF) { const n = grainF[o] * gr * 4 * (0.6 + 0.8 * (1 - Math.abs(l - 128) / 128)); r += n; g += n; b += n; }
    if (toner && hashi(x, y, 31) < 0.0006 * toner) { r *= 0.35; g *= 0.35; b *= 0.35; }
    if (streak) { const s = (hashi(0, y >> 1, 41) - 0.5) * 3 * streak; r += s; g += s; b += s; }
    px[j] = r; px[j + 1] = g; px[j + 2] = b;
  }
  for (const d of dust) {
    const R = Math.ceil(d[2] + 2);
    for (let y = Math.max(0, (d[1] - R) | 0); y < Math.min(h, d[1] + R); y++) for (let x = Math.max(0, (d[0] - R) | 0); x < Math.min(w, d[0] + R); x++) {
      const t = clamp(d[2] - Math.hypot(x - d[0], y - d[1]) + 0.5, 0, 1) * d[3] * Math.min(1, k); if (t <= 0) continue;
      const j = (y * w + x) * 4; px[j] *= 1 - t * 0.6; px[j + 1] *= 1 - t * 0.6; px[j + 2] *= 1 - t * 0.6;
    }
  }
}

function pxPerMm(w, h, resolution) {
  if (resolution && resolution >= 150) return resolution / 25.4;
  return Math.max(w, h) / 297;
}

module.exports = { renderPaper, renderFinal, pxPerMm, catalogs, presets: P, _cache: cache };
