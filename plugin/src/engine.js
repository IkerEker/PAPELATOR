/* PAPELATOR · motor v2
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
  const texK = def(st.texture, 1) * Math.pow(clamp(k, 0, 2), 0.6);
  // color del papel
  let C = hexToRgb(st.color);
  if (!C) { const c = P.COLORS.filter(x => x.id === st.color)[0]; C = c && c.hex ? hexToRgb(c.hex) : null; }
  const original = !C;
  if (!C) C = paper.color.slice();
  const Lmean = (paper.color[0] * 0.2126 + paper.color[1] * 0.7152 + paper.color[2] * 0.0722);
  const Cn = [C[0] / 255, C[1] / 255, C[2] / 255];
  const dark = [1 - Cn[0], 1 - Cn[1], 1 - Cn[2]];
  // anti-repetición: dos lecturas desplazadas mezcladas por un ruido suave (no en papeles con patrón)
  const mix = paper.kind !== 'pattern';
  const r = rng(S.seed + 77);
  const o1x = r() * mw, o1y = r() * mh, o2x = r() * mw, o2y = r() * mh;
  const M = B.T; M.fill(0);
  if (mix) addValueNoise(M, w, h, (mw / ux) * 0.7, (mh / uy) * 0.7, 1, S.seed + 78);
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

// ================================================================ IMPERFECCIONES
function estadoCounts(st) {
  if (st.custom && typeof st.custom === 'object') return st.custom;
  const e = P.ESTADOS.filter(x => x.id === st.estado)[0] || P.ESTADOS[0];
  return e.v;
}

// dibuja una imagen (sello entero o pieza de atlas) escalada, girada y fundida según su modo
function drawSprite(S, B, src, rect, cx, cy, scale, rot, mode, op, mask, flip) {
  const { w, h } = S;
  const sx0 = rect ? rect[0] : 0, sy0 = rect ? rect[1] : 0;
  const sw = rect ? rect[2] : src.width, sh = rect ? rect[3] : src.height;
  const ch = src.channels, sd = src.data, SW = src.width;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const hw = sw * scale / 2, hh = sh * scale / 2;
  const ext = Math.ceil(Math.abs(hw * ca) + Math.abs(hh * sa)) + 2, eyt = Math.ceil(Math.abs(hw * sa) + Math.abs(hh * ca)) + 2;
  const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(w - 1, Math.ceil(cx + ext));
  const y0 = Math.max(0, Math.floor(cy - eyt)), y1 = Math.min(h - 1, Math.ceil(cy + eyt));
  if (x1 < x0 || y1 < y0) return;
  const inv = 1 / scale;
  const alb = B.alb;
  const md = mask ? mask.data : null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      let u = (dx * ca + dy * sa) * inv + sw / 2, v = (-dx * sa + dy * ca) * inv + sh / 2;
      if (flip) u = sw - u;
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) continue;
      const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv;
      const base = ((sy0 + iv) * SW + sx0 + iu) * ch;
      const o = y * w + x, j = o * 4;
      const sampleC = (c) => {
        const a = sd[base + c], b = sd[base + ch + c], cc = sd[base + SW * ch + c], d = sd[base + SW * ch + ch + c];
        return ((a + (b - a) * fu) * (1 - fv) + (cc + (d - cc) * fu) * fv) / 255;
      };
      if (mode === 'multiply') {
        const m0 = sampleC(0), m1 = ch >= 3 ? sampleC(1) : m0, m2 = ch >= 3 ? sampleC(2) : m0;
        alb[j] *= 1 - (1 - m0) * op; alb[j + 1] *= 1 - (1 - m1) * op; alb[j + 2] *= 1 - (1 - m2) * op;
      } else if (mode === 'grease') {
        const m0 = sampleC(0), m1 = ch >= 3 ? sampleC(1) : m0, m2 = ch >= 3 ? sampleC(2) : m0;
        const g = clamp((1 - (m0 * 0.2126 + m1 * 0.7152 + m2 * 0.0722)) * 4, 0, 1);
        const dd = 1 - g * op * 0.09;
        alb[j] *= dd; alb[j + 1] *= dd; alb[j + 2] *= dd * 0.985;
        const tv = B.trans[o] + g * op * 200; B.trans[o] = tv > 255 ? 255 : tv;
        const gv = B.gloss[o] + g * op * 220; B.gloss[o] = gv > 255 ? 255 : gv;
      } else {
        // relieve (0.5 = plano)
        const rv = (sampleC(0) - 0.5) / 4;
        B.R[o] += rv * op * 1.6;
        if (md && (mode === 'erase' || mode === 'wax')) {
          const mm = ((md[(iv) * sw + iu] + md[(iv) * sw + Math.min(sw - 1, iu + 1)]) / 2) / 255 * op;
          if (mode === 'erase') {
            alb[j] += (255 - alb[j]) * mm * 0.16; alb[j + 1] += (255 - alb[j + 1]) * mm * 0.16; alb[j + 2] += (255 - alb[j + 2]) * mm * 0.16;
            const dv = B.damage[o] + mm * 255; B.damage[o] = dv > 255 ? 255 : dv;
          } else {
            const tv = B.trans[o] + mm * 230; B.trans[o] = tv > 255 ? 255 : tv;
            const gv = B.gloss[o] + mm * 255; B.gloss[o] = gv > 255 ? 255 : gv;
            alb[j] *= 1 - mm * 0.04; alb[j + 1] *= 1 - mm * 0.04; alb[j + 2] *= 1 - mm * 0.07;
          }
        }
      }
    }
  }
}

// dónde aparece cada cosa (en mm; devuelve centro y giro)
function place(rule, r, Wm, Hm, sizeMm) {
  const any = () => ({ x: lerp(0.08, 0.92, r()) * Wm, y: lerp(0.08, 0.92, r()) * Hm, rot: r() * Math.PI * 2 });
  switch (rule) {
    case 'edge': {   // donde se coge la hoja: bordes laterales y abajo
      const side = r() < 0.75 ? (r() < 0.5 ? 1 : 3) : 2;
      const t = lerp(0.3, 0.9, r()), inset = sizeMm * lerp(0.25, 0.7, r());
      if (side === 1) return { x: Wm - inset, y: t * Hm, rot: Math.PI / 2 + (r() - 0.5) * 0.9 };
      if (side === 3) return { x: inset, y: t * Hm, rot: -Math.PI / 2 + (r() - 0.5) * 0.9 };
      return { x: lerp(0.2, 0.8, r()) * Wm, y: Hm - inset, rot: (r() - 0.5) * 0.9 };
    }
    case 'clip': {   // un clip abraza el borde: perpendicular a él, cerca de una esquina superior
      if (r() < 0.75) {
        const left = r() < 0.7;
        const x = left ? lerp(14, 45, r()) : Wm - lerp(14, 45, r());
        return { x, y: sizeMm * lerp(0.28, 0.4, r()), rot: Math.PI / 2 * (r() < 0.5 ? 1 : -1) + (r() - 0.5) * 0.15 };
      }
      return { x: sizeMm * lerp(0.28, 0.4, r()), y: lerp(14, 50, r()), rot: (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.15 };
    }
    case 'tape': {   // celo: en diagonal en las esquinas o arriba en el centro
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
    case 'acid': return { x: lerp(0.3, 0.7, r()) * Wm, y: lerp(0.3, 0.7, r()) * Hm, rot: (r() - 0.5) * 0.08 + (r() < 0.5 ? 0 : Math.PI) };
    default: return any();
  }
}

async function genEstado(S, st, assets, B) {
  const counts = estadoCounts(st);
  const amt = clamp(def(st.estadoAmount, 1), 0, 3);
  const k = S.k;
  if (!counts || amt <= 0 || k <= 0) return;
  const { w, h, ppm } = S;
  const Wm = w / ppm, Hm = h / ppm, areaK = (Wm * Hm) / (210 * 297);
  const cats = cache.imperf;
  const r = rng(S.seed * 31 + 7);
  const opK = clamp(k, 0, 2) * Math.min(1.5, amt);
  // envejecimiento de bordes y sol (procedural)
  const edad = def(counts.edad, 0) * Math.min(1.5, amt) * clamp(k, 0, 2), sol = def(counts.sol, 0) * Math.min(1.5, amt) * clamp(k, 0, 2);
  if (edad > 0 || sol > 0) {
    const T = B.T; T.fill(0); addValueNoise(T, w, h, 22 * ppm, 22 * ppm, 1, S.seed + 601); addValueNoise(T, w, h, 7 * ppm, 7 * ppm, 0.35, S.seed + 602);
    const side = (r() * 4) | 0;
    const Y = [0.97, 0.9, 0.74];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      const ed = Math.min(x, y, w - 1 - x, h - 1 - y) / ppm + T[o] * 6;
      let a = edad * 0.55 * Math.exp(-Math.max(0, ed) / 9);
      if (sol > 0) {
        const t = side === 0 ? x / w : side === 1 ? 1 - x / w : side === 2 ? y / h : 1 - y / h;
        a += sol * 0.35 * smooth(0.15, 1, t + T[o] * 0.12);
      }
      a = clamp(a, 0, 1);
      if (a > 0.002) { alb3(B.alb, j, Y, a); }
    }
  }
  const needs = { R: false, trans: false, gloss: false, damage: false };
  for (const cid in counts) {
    const C = cats[cid]; if (!C || !counts[cid]) continue;
    if (C.mode !== 'multiply') { needs.R = true; needs.trans = true; needs.gloss = true; needs.damage = true; }
  }
  if (needs.R && !B.R) B.R = new Float32Array(S.N);
  if (!B.trans) B.trans = new Uint8Array(S.N);
  if (!B.gloss) B.gloss = new Uint8Array(S.N);
  if (!B.damage) B.damage = new Uint8Array(S.N);
  if (!B.R) B.R = new Float32Array(S.N);
  // orden: primero lo que está "en la masa" (fibras, grumos), luego manchas, luego relieves
  const order = ['nodulos', 'fibras', 'descamacion', 'polvo', 'uv', 'calor', 'humedad', 'acida', 'agua', 'foxing', 'cafe', 'salp_cafe',
    'barro', 'grasa', 'cera', 'adhesivo', 'clip', 'matasellos', 'quemadura', 'sangrado', 'salp_tinta', 'grafito', 'huella_tinta',
    'huella_grasa', 'goma', 'escritura', 'mecano', 'sello_seco'];
  for (const cid of order) {
    let n = counts[cid]; const C = cats[cid];
    if (!n || !C) continue;
    const op0 = C.opacity * opK;
    if (C.kind === 'stamp') {
      n = Math.round(n * Math.min(1.5, amt));
      for (let i = 0; i < n; i++) {
        const it = C.items[(r() * C.items.length) | 0];
        const img = await loadImg(assets, 'imperf/' + it.file);
        const mask = it.mask ? await loadImg(assets, 'imperf/' + it.file.replace('.png', '_m.png')) : null;
        const sizeMm = lerp(C.size[0], C.size[1], r());
        const sc = sizeMm * ppm / Math.max(it.w, it.h);
        const pl = place(C.place, r, Wm, Hm, sizeMm);
        drawSprite(S, B, img, null, pl.x * ppm, pl.y * ppm, sc, pl.rot, C.mode, op0 * lerp(0.75, 1.1, r()), mask, r() < 0.5);
      }
    } else if (C.kind === 'sprites') {
      const atlas = await loadImg(assets, 'imperf/' + C.atlas);
      const sp = C.sprites;
      if (C.place === 'cluster') {
        // salpicaduras: un evento = una nube de gotas con dirección
        for (let e = 0; e < Math.round(n * Math.min(1.5, amt)); e++) {
          const cx = lerp(0.15, 0.85, r()) * Wm, cy = lerp(0.15, 0.85, r()) * Hm, R0 = lerp(28, 60, r());
          const dir = r() * Math.PI * 2, drops = Math.round(lerp(25, 70, r()));
          for (let d = 0; d < drops; d++) {
            const s = sp[(r() * sp.length) | 0];
            const rr = Math.abs(gauss(r)) * R0 * 0.6;
            const a = dir + gauss(r) * 0.9;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            const sc = s.mm * ppm * lerp(0.55, 1.15, r()) * Math.max(0.35, 1 - rr / (R0 * 1.6));
            drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, r() * Math.PI * 2, C.mode, op0 * lerp(0.7, 1.05, r()), null, r() < 0.5);
          }
        }
      } else if (C.place === 'lower') {
        // barro: salpica desde abajo, gotas más pequeñas cuanto más alto
        for (let e = 0; e < Math.round(n * Math.min(1.5, amt)); e++) {
          const cx = lerp(0.1, 0.9, r()) * Wm, drops = Math.round(lerp(40, 120, r()));
          for (let d = 0; d < drops; d++) {
            const s = sp[(r() * sp.length) | 0];
            const up = Math.pow(r(), 1.8) * Hm * 0.35;
            const x = cx + gauss(r) * 40, y = Hm - up;
            const sc = s.mm * ppm * lerp(0.5, 1.1, r()) * (1 - up / (Hm * 0.5));
            drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, r() * Math.PI * 2, C.mode, op0 * lerp(0.6, 1, r()), null, false);
          }
        }
      } else {
        // por pieza (foxing, polvo, fibras, grumos, descamación): cantidad por A4
        const total = Math.round(n * areaK * Math.min(2, amt));
        const clusters = [];
        if (C.place === 'foxing') for (let c = 0; c < 3 + Math.round(n / 60); c++) {
          // el foxing se agrupa y prefiere los bordes
          const edgeBias = r() < 0.6;
          clusters.push([edgeBias ? (r() < 0.5 ? lerp(0.02, 0.2, r()) : lerp(0.8, 0.98, r())) * Wm : r() * Wm, r() * Hm, lerp(10, 40, r())]);
        }
        for (let i = 0; i < total; i++) {
          let s = sp[(r() * sp.length) | 0];
          let x, y;
          if (clusters.length && r() < 0.75) { const c = clusters[(r() * clusters.length) | 0]; x = c[0] + gauss(r) * c[2]; y = c[1] + gauss(r) * c[2]; }
          else if (cid === 'polvo' && r() < 0.5) { // el polvo se acumula hacia los bordes
            const e = Math.pow(r(), 2) * 30, side = (r() * 4) | 0;
            x = side === 0 ? e : side === 1 ? Wm - e : r() * Wm; y = side === 2 ? e : side === 3 ? Hm - e : r() * Hm;
          } else { x = r() * Wm; y = r() * Hm; }
          const sc = s.mm * ppm * lerp(0.6, 1.2, r());
          drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, r() * Math.PI * 2, C.mode, op0 * lerp(0.5, 1, r()), null, r() < 0.5);
        }
      }
    } else if (C.kind === 'lines') {
      // alguien escribió sobre otra hoja encima de esta: renglones con margen, inclinación y presión coherentes
      const atlas = await loadImg(assets, 'imperf/' + C.atlas);
      const sp = C.sprites.slice();
      for (let b = 0; b < Math.round(n * Math.min(1.5, amt)); b++) {
        const left = lerp(18, 32, r()), top = lerp(22, 48, r()), pitch = C.pitchMm * lerp(0.95, 1.12, r());
        const last = Hm * lerp(0.45, 0.88, r()), rot = (r() - 0.5) * 0.04, press = lerp(0.6, 1.1, r());
        for (let i = sp.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = sp[i]; sp[i] = sp[j]; sp[j] = t; }
        let y = top, k2 = 0;
        while (y < last && k2 < sp.length) {
          const s = sp[k2++];
          const sc = s.mm * ppm * lerp(0.95, 1.05, r());
          const wmm = s.r[2] * sc / ppm, hmm = s.r[3] * sc / ppm;
          if (wmm > Wm - left - 12) continue;
          const lines = Math.max(1, Math.round(hmm / pitch));
          const x = left + wmm / 2 + (r() - 0.5) * 2, yc = y + (lines - 1) * pitch / 2;
          drawSprite(S, B, atlas, s.r, x * ppm, yc * ppm + (x * ppm - w / 2) * rot, sc, rot, 'relief', op0 * press * lerp(0.75, 1.05, r()), null, false);
          y += lines * pitch;
          if (r() < 0.08) y += pitch;
        }
      }
    }
  }
}
function alb3(alb, j, Y, a) { alb[j] *= 1 - (1 - Y[0]) * a; alb[j + 1] *= 1 - (1 - Y[1]) * a; alb[j + 2] *= 1 - (1 - Y[2]) * a; }

// ================================================================ CALCO
async function genCalco(S, st, assets, B, paper, backArt) {
  const id = st.calco;
  if (!id || id === 'ninguno') return;
  const { w, h, ppm, N } = S;
  const k = S.k;
  const amount = clamp(def(st.calcoAmount, 1), 0, 3) * clamp(k, 0, 2);
  if (amount <= 0) return;
  const tr = clamp(def(paper.translucency, 0.25), 0, 1);
  // el trasluz siempre va desenfocado: se calcula a resolución reducida (rápido y con poca memoria)
  const blur = ppm * (0.18 + 0.5 * (1 - tr)) * clamp(def(st.calcoBlur, 1), 0.2, 4);
  const f = clamp(Math.floor(blur / 1.5), 1, 6);
  const lw = Math.ceil(w / f), lh = Math.ceil(h / f), LN = lw * lh;
  const cov = new Float32Array(LN), tmpL = new Float32Array(LN);
  let colB = null;
  if (id === 'documento') {
    if (!backArt) return;
    // tu propio documento visto desde detrás: espejo horizontal
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
    const info0 = cache.calco[id];
    const img = await loadImg(assets, 'calco/' + info0.ink);
    mapBack(img, cov, lw, lh);
  }
  // 1) trasluz: espejo desenfocado, gris cálido, más visible donde el papel es fino o está engrasado
  gaussBlur(cov, lw, lh, blur / f, tmpL);
  if (colB) for (let c = 0; c < 3; c++) gaussBlur(colB[c], lw, lh, blur / f, tmpL);
  const bil = (arr, x, y) => {
    const u = clamp(x / f - 0.5, 0, lw - 1.001), v = clamp(y / f - 0.5, 0, lh - 1.001);
    const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv, o = iv * lw + iu;
    return (arr[o] * (1 - fu) + arr[o + 1] * fu) * (1 - fv) + (arr[o + lw] * (1 - fu) + arr[o + lw + 1] * fu) * fv;
  };
  const s0 = amount * (0.03 + 0.26 * tr);
  const alb = B.alb, trans = B.trans;
  const tint = [0.86, 0.87, 0.9];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x;
    const v = bil(cov, x, y); if (v < 0.003) continue;
    const boost = trans ? 1 + 2.4 * trans[o] / 255 : 1;
    const s = clamp(s0 * boost, 0, 0.9) * v;
    const j = o * 4;
    if (colB) {
      // el color del reverso se ve apagado: mezcla de su tono con gris
      for (let c = 0; c < 3; c++) { const cv = bil(colB[c], x, y) / Math.max(v, 1e-3); alb[j + c] *= 1 - s * (0.55 * cv + 0.45 * (1 - tint[c] + 0.12)); }
    } else {
      alb[j] *= 1 - s * (1 - tint[0] + 0.14); alb[j + 1] *= 1 - s * (1 - tint[1] + 0.14); alb[j + 2] *= 1 - s * (1 - tint[2] + 0.14);
    }
  }
  const tmp = (id === 'apuntes' || id === 'rotulador') ? new Float32Array(N) : null;
  // 2) traspaso de tinta líquida (rotulador: charcos donde se apoyó la punta; fluorescente)
  const bleedK = clamp(def(st.calcoBleed, 1), 0, 3) * amount;
  const info = cache.calco[id] || {};
  const bleedLayers = [];
  // el traspaso depende de lo fino/absorbente que sea el papel
  const thin = 0.15 + 0.85 * tr;
  if (id === 'rotulador') bleedLayers.push({ file: info.pool, col: [0.2, 0.22, 0.3], k: 0.4 * thin, base: info.ink, baseK: 0.1 * thin, blur: 0.12 });
  if (id === 'apuntes') bleedLayers.push({ file: info.fluor, col: [0.97, 0.94, 0.45], k: 0.2 * thin, blur: 0.45 });
  for (const L of bleedLayers) {
    const img = await loadImg(assets, 'calco/' + L.file);
    const bl = new Float32Array(N); mapBack(img, bl, w, h);
    if (L.base) { const b2 = new Float32Array(N); const bi = await loadImg(assets, 'calco/' + L.base); mapBack(bi, b2, w, h); for (let o = 0; o < N; o++) bl[o] = Math.max(bl[o], b2[o] * L.baseK / Math.max(L.k, 1e-3)); }
    gaussBlur(bl, w, h, ppm * L.blur, tmp);
    // borde que se abre siguiendo las fibras
    const D = B.D;
    for (let o = 0; o < N; o++) {
      let v = bl[o]; if (v < 0.01) continue;
      v = clamp(v * (1 + D[o] * 6) - 0.05, 0, 1);
      const s = clamp(v * L.k * bleedK, 0, 0.95), j = o * 4;
      alb[j] *= 1 - s * (1 - L.col[0]); alb[j + 1] *= 1 - s * (1 - L.col[1]); alb[j + 2] *= 1 - s * (1 - L.col[2]);
    }
  }
  // 3) presión del bolígrafo (por detrás = cresta por delante)
  if (id === 'apuntes' && info.pressure) {
    const pk = clamp(def(st.calcoPressure, 1), 0, 3) * clamp(k, 0, 2);
    if (pk > 0) {
      const img = await loadImg(assets, 'calco/' + info.pressure);
      const hgt = new Float32Array(N); mapBack(img, hgt, w, h);
      gaussBlur(hgt, w, h, ppm * 0.08, tmp);
      if (!B.R) B.R = new Float32Array(N);
      const d = Math.max(1, Math.round(ppm * 0.08));
      for (let y = d; y < h - d; y++) for (let x = d; x < w - d; x++) {
        const o = y * w + x;
        B.R[o] += (hgt[o - d * w - d] - hgt[o + d * w + d]) * 0.07 * pk;
      }
    }
  }
}
// coloca una imagen de reverso (A4) cubriendo el documento, en espejo
function mapBack(img, out, w, h) {
  const iw = img.width, ih = img.height, c = img.channels, d = img.data;
  const sc = Math.max(iw / w, ih / h) * Math.min(w / iw, h / ih) > 0 ? Math.min(iw / w, ih / h) : 1;
  const s = Math.min(iw / w, ih / h);
  const ox = (iw - w * s) / 2, oy = (ih - h * s) / 2;
  for (let y = 0; y < h; y++) {
    const v = oy + y * s, iv = Math.min(ih - 1, v | 0);
    for (let x = 0; x < w; x++) {
      const u = ox + (w - 1 - x) * s, iu = Math.min(iw - 1, u | 0);
      out[y * w + x] = d[(iv * iw + iu) * c] / 255;
    }
  }
  return sc;
}

// aplicar el relieve acumulado (surcos, sellos, grumos, presión) como sombreado
function applyRelief(S, B) {
  if (!B.R) return;
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
  const B = { alb: new Uint8ClampedArray(N * 4), D: new Float32Array(N), T: new Float32Array(N), R: null, trans: null, gloss: null, damage: null };
  await prog(0.05, 'Cargando la textura…');
  const paper = await genPaper(S, st, assets, B);
  await prog(0.35, 'Envejeciendo el papel…');
  await genEstado(S, st, assets, B);
  await prog(0.6, 'Calco del reverso…');
  await genCalco(S, st, assets, B, paper, opts.backArt || null);
  applyRelief(S, B);
  B.T = null;
  await prog(0.8, 'Listo el papel');
  return { rgba: new Uint8Array(B.alb.buffer), buffers: B, paper, S, st };
}

// ================================================================ API: APLICAR (render final)
async function renderFinal(opts) {
  const { w, h, ppm, assets, art, artComponents } = opts;
  const prog = opts.onProgress || (async () => {});
  const base = await renderPaper(Object.assign({}, opts, { onProgress: async (v, m) => prog(v * 0.5, m) }));
  const { buffers: B, paper, S, st } = base;
  const N = S.N, k = S.k;
  const alb = B.alb;
  const out = new Uint8ClampedArray(N * 4);
  await prog(0.55, 'Imprimiendo en el papel…');
  const comps = artComponents || 4;
  const D = B.D;
  // desviación del grano para normalizar el desplazamiento
  let s2 = 0; for (let o = 0; o < N; o += 7) s2 += D[o] * D[o];
  const dstd = Math.sqrt(s2 / Math.ceil(N / 7)) || 0.01;
  const gpx = 0.05 * ppm * clamp(def(st.grain, 1), 0, 4) * clamp(k, 0, 2);
  const absorb = clamp(def(st.absorb, 1), 0, 3) * clamp(k, 0, 2);
  const mixK = clamp(k * 1.4, 0, 1);
  const inkMode = st.inkMode === 'normal' ? 'normal' : 'multiply';
  const shift = 9 * w + 5;
  const gloss = B.gloss;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      const hn = D[o] / dstd;
      let o2 = o + shift; if (o2 >= N) o2 = o;
      const hn2 = D[o2] / dstd;
      // muestra del arte desplazada por las fibras
      let sx = x + gpx * hn, sy = y + gpx * hn2;
      sx = sx < 0 ? 0 : sx > w - 1.001 ? w - 1.001 : sx; sy = sy < 0 ? 0 : sy > h - 1.001 ? h - 1.001 : sy;
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
      const a00 = (iy * w + ix) * comps, a10 = a00 + comps, a01 = a00 + w * comps, a11 = a01 + comps;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      let al = 1;
      if (comps === 4) al = (art[a00 + 3] * w00 + art[a10 + 3] * w10 + art[a01 + 3] * w01 + art[a11 + 3] * w11) / 255;
      const cr = (art[a00] * w00 + art[a10] * w10 + art[a01] * w01 + art[a11] * w11) / 255;
      const cg = (art[a00 + 1] * w00 + art[a10 + 1] * w10 + art[a01 + 1] * w01 + art[a11 + 1] * w11) / 255;
      const cb = (art[a00 + 2] * w00 + art[a10 + 2] * w10 + art[a01 + 2] * w01 + art[a11 + 2] * w11) / 255;
      const pr = alb[j], pg = alb[j + 1], pb = alb[j + 2];
      // tinta que falta: valles del grano, raspaduras de goma, zonas enceradas o grasientas (rechazan la tinta)
      let cover = 1 - absorb * 0.28 * smooth(1.2, 3.2, -hn);
      if (B.damage) cover *= 1 - B.damage[o] / 255 * 0.85;
      if (gloss) cover *= 1 - gloss[o] / 255 * 0.12;
      let r, g, b;
      if (inkMode === 'multiply') {
        // la tinta transparente se suma al papel (offset / inkjet)
        const ir = 1 - (1 - (cr * al + (1 - al))) * cover, ig = 1 - (1 - (cg * al + (1 - al))) * cover, ib = 1 - (1 - (cb * al + (1 - al))) * cover;
        r = pr * ir; g = pg * ig; b = pb * ib;
      } else {
        // tinta opaca: tapa el papel pero el grano se sigue notando
        const t = al * cover, dd = 1 + D[o] * 0.6;
        r = lerp(pr, cr * 255 * dd, t); g = lerp(pg, cg * 255 * dd, t); b = lerp(pb, cb * 255 * dd, t);
      }
      // lo que se veía antes (arte encima del papel, sin efectos) para la intensidad baja
      const b0r = lerp(pr, cr * 255, al), b0g = lerp(pg, cg * 255, al), b0b = lerp(pb, cb * 255, al);
      out[j] = lerp(b0r, r, mixK); out[j + 1] = lerp(b0g, g, mixK); out[j + 2] = lerp(b0b, b, mixK); out[j + 3] = 255;
    }
  }
  await prog(0.8, 'Fotografiando…');
  photo(S, st, out, B);
  await prog(1, 'Listo');
  return { rgba: new Uint8Array(out.buffer) };
}

// ================================================================ FOTOGRAFÍA
function photo(S, st, px, B) {
  const { w, h, N } = S;
  const k = clamp(S.k, 0, 2);
  const luz = st.luz || 'ninguna', cal = st.calidad || 'perfecta';
  const expo = Math.pow(2, clamp(def(st.exposure, 0), -1.5, 1.5) * 0.7);
  const diag = Math.hypot(w, h);
  if (luz !== 'ninguna' || expo !== 1) {
    // parámetros de cada luz: posición de la fuente, caída, tinte, viñeta, brillo especular
    const L = {
      ninguna: { fall: 0, tint: [1, 1, 1], vig: 0, glare: 0 },
      escaner: { fall: 0, tint: [1.0, 1.005, 1.015], vig: 0, glare: 0, lift: 0.03, flat: 1 },
      dia: { sx: 0.5, sy: -0.6, fall: 0.08, tint: [0.995, 1.0, 1.015], vig: 0.07, glare: 0 },
      ventana: { sx: -0.75, sy: 0.25, fall: 0.17, tint: [1.015, 1.0, 0.99], vig: 0.08, glare: 0.015, cool: 0.03 },
      foco: { spot: 1, fall: 0.26, tint: [1.03, 1.0, 0.95], vig: 0.08, glare: 0.03 },
      flash: { spot: 0.7, fall: 0.24, tint: [0.99, 1.0, 1.02], vig: 0.15, glare: 0.09 },
      lampara: { sx: 0.8, sy: -0.75, fall: 0.24, tint: [1.06, 1.0, 0.87], vig: 0.12, glare: 0.035 }
    }[luz] || {};
    const fall = (L.fall || 0) * k, vig = (L.vig || 0) * k, glare = (L.glare || 0) * k;
    const tint = (L.tint || [1, 1, 1]).map(v => 1 + (v - 1) * k);
    const cx = w / 2, cy = h / 2;
    const sxp = cx + (L.sx || 0) * diag, syp = cy + (L.sy || 0) * diag, hgt = diag * 0.55;
    let e0 = 1;
    if (!L.spot && fall > 0) { const q = (cx - sxp) ** 2 + (cy - syp) ** 2 + hgt * hgt; e0 = hgt / (q * Math.sqrt(q)); }
    const gl = B.gloss;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      let e = 1;
      if (L.spot) {
        // linterna / flash: centro iluminado, caída suave hacia los bordes
        const rr = Math.hypot(x - cx, y - cy) / (diag * 0.5);
        e = 1 - fall * smooth(0.18 * L.spot, 1.25, rr);
      } else if (fall > 0) {
        const q = (x - sxp) ** 2 + (y - syp) ** 2 + hgt * hgt; const ee = hgt / (q * Math.sqrt(q)) / e0;
        e = Math.pow(ee, fall * 1.4);
        e = e / (1 + fall * 0.15);
      }
      const rx = (x - cx) / (diag / 2), ry = (y - cy) / (diag / 2);
      e *= 1 / Math.pow(1 + (rx * rx + ry * ry) * vig, 2);
      e *= expo;
      let g = 0;
      if (glare > 0) {
        // reflejo especular (más en zonas brillantes: grasa, cera)
        const gx = L.spot ? cx : cx - (L.sx || 0) * diag * 0.25, gy = L.spot ? cy : cy - (L.sy || 0) * diag * 0.25;
        const gd = ((x - gx) ** 2 + (y - gy) ** 2) / (diag * diag * 0.04);
        g = glare * Math.exp(-gd) * (1 + (gl ? gl[o] / 255 * 3 : 0));
      } else if (gl && gl[o] && luz !== 'escaner') g = gl[o] / 255 * 0.04 * k;
      const cool = (L.cool || 0) * k * (1 - Math.min(1, e));
      for (let c = 0; c < 3; c++) {
        let v = px[j + c] * e * tint[c];
        if (c === 2) v *= 1 + cool; if (c === 0) v *= 1 - cool * 0.5;
        v += (255 - v) * g;
        if (L.lift) v = v + (255 - v) * L.lift * k;
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
    escaner_pro: { sharpen: 0.35, noise: 0.6, contrast: 0.03, white: 0.0 },
    escaner_oficina: { blur: 0.6, sharpen: 0.5, noise: 1.2, contrast: 0.12, white: 0.06, desat: 0.12, streak: 1 },
    movil: { sharpen: 0.6, noise: 3.2, chroma: 1.2, contrast: 0.06, sat: 0.08, vig: 0.08 },
    movil_antiguo: { blur: 1.0, noise: 7, chroma: 4, contrast: 0.1, jpeg: 0.35, ca: 1.2, cast: [0.99, 1.02, 0.95], vig: 0.18 },
    fotocopia: { gray: 1, blur: 0.7, contrast: 0.55, toner: 1, white: 0.12, noise: 2 },
    analogica: { grain: 7, blur: 0.5, contrast: -0.06, lift: 0.06, cast: [1.03, 1.0, 0.94], vig: 0.25, sat: -0.08 }
  }[cal];
  if (!Q) return;
  const scaleK = Math.max(1, Math.max(w, h) / 3000);
  const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let o = 0; o < N; o++) { ch[0][o] = px[o * 4]; ch[1][o] = px[o * 4 + 1]; ch[2][o] = px[o * 4 + 2]; }
  const tmp = new Float32Array(N);
  if (Q.gray) { for (let o = 0; o < N; o++) { const l = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11; ch[0][o] = ch[1][o] = ch[2][o] = l; } }
  if (Q.blur) for (let c = 0; c < 3; c++) gaussBlur(ch[c], w, h, Q.blur * scaleK * k, tmp);
  if (Q.sharpen) {
    // máscara de enfoque (halo típico del procesado de móvil / escáner)
    const bl = new Float32Array(N);
    for (let c = 0; c < 3; c++) { bl.set(ch[c]); gaussBlur(bl, w, h, 1.4 * scaleK, tmp); for (let o = 0; o < N; o++) ch[c][o] += (ch[c][o] - bl[o]) * Q.sharpen * k; }
  }
  if (Q.ca) {
    // aberración cromática: rojo y azul se separan hacia los bordes
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
    // compresión: los bloques de 8x8 pierden detalle fino en zonas suaves
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
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x, j = o * 4;
    let r = ch[0][o], g = ch[1][o], b = ch[2][o];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (desat || sat) { const s = 1 - desat + sat; r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
    r *= cast[0]; g *= cast[1]; b *= cast[2];
    if (con) { r = 128 + (r - 128) * (1 + con); g = 128 + (g - 128) * (1 + con); b = 128 + (b - 128) * (1 + con); }
    if (white) { const f = 1 / (1 - white); r *= f; g *= f; b *= f; }
    if (lift) { r = r + (255 - r) * 0 + lift * 255 * (1 - r / 255); g = g + lift * 255 * (1 - g / 255); b = b + lift * 255 * (1 - b / 255); }
    if (vig) { const rr = ((x - w / 2) ** 2 + (y - h / 2) ** 2) / (diag * diag); const f = 1 - vig * rr; r *= f; g *= f; b *= f; }
    if (nz) { const n = (hashi(x, y, 11) + hashi(x, y, 12) - 1) * nz * (0.5 + 1.2 * (1 - l / 255)); r += n; g += n; b += n; }
    if (chn) { r += (hashi(x >> 1, y >> 1, 21) - 0.5) * chn; b += (hashi(x >> 1, y >> 1, 22) - 0.5) * chn; }
    if (grainF) { const n = grainF[o] * gr * 4 * (0.6 + 0.8 * (1 - Math.abs(l - 128) / 128)); r += n; g += n; b += n; }
    if (toner && hashi(x, y, 31) < 0.0009 * toner) { r *= 0.3; g *= 0.3; b *= 0.3; }
    if (streak) { const s = (hashi(0, y >> 1, 41) - 0.5) * 4 * streak; r += s; g += s; b += s; }
    px[j] = r; px[j + 1] = g; px[j + 2] = b;
  }
}

// píxeles por milímetro: por resolución si es de impresión; si es de pantalla se asume A4
function pxPerMm(w, h, resolution) {
  if (resolution && resolution >= 150) return resolution / 25.4;
  return Math.max(w, h) / 297;
}

module.exports = { renderPaper, renderFinal, pxPerMm, catalogs, presets: P, _cache: cache };
