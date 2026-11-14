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
    try { cache.overlays = await assets.json('overlays.json'); } catch (e) { cache.overlays = {}; }
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
  const scale = clamp(def(st.scale, 1), 0.04, 10);
  const kx = tw / (paper.tileMm[0] * ppm * scale), ky = th / (paper.tileMm[1] * ppm * scale);
  let level = 0; let kk = Math.max(kx, ky);
  while (kk > 1.5 && level < 8) { kk /= 2; level++; }
  const lv = 1 << level;
  const dm = mipLevel(paper.id + '_d', dimg, level);
  const im = iimg ? mipLevel(paper.id + '_i', iimg, level) : null;
  const mw = dm.width, mh = dm.height;
  const ux = kx / lv, uy = ky / lv;
  const gain = paper.gain;
  const texK = def(st.texture, 1) * Math.pow(clamp(k, 0, 2), 0.6) * def(st._texLight, 1);
  S.texK = texK;
  // color del papel
  // lo que tiene color propio (ladrillo, piedra, metal, madera, cartón, pantalla) no se pinta aunque quede un color elegido
  const fixedColor = paper.material && paper.material !== 'paper' && !paper.colorable;
  let C = fixedColor ? null : hexToRgb(st.color);
  if (!C && !fixedColor) { const c = P.COLORS.filter(x => x.id === st.color)[0]; C = c && c.hex ? hexToRgb(c.hex) : null; }
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
// Qué le puede pasar a cada material. La madera no se dobla, no transparenta y no coge marcas propias del papel
// (foxing, fibras, hendiduras de escritura, goma…); el cartón casi todo menos lo de papel fino.
const MATERIAL_NO = {
  wood: { fibras: 1, nodulos: 1, descamacion: 1, foxing: 1, escritura: 1, mecano: 1, sello_seco: 1, goma: 1, matasellos: 1, manchado: 1,
    clip_huella: 1, pinza: 1, arruguita: 1, media_luna: 1, grapa_marca: 1, cockle: 1 },
  carton: { fibras: 1, nodulos: 1, escritura: 1, mecano: 1, goma: 1, arruguita: 1 },
  // paredes, suelos, metal: nada propio del papel; sí manchas, agua, grasa, barro, polvo, quemaduras, cera, cinta
  surface: { fibras: 1, nodulos: 1, descamacion: 1, foxing: 1, escritura: 1, mecano: 1, sello_seco: 1, goma: 1, matasellos: 1, manchado: 1,
    clip_huella: 1, pinza: 1, arruguita: 1, media_luna: 1, grapa_marca: 1, grapa_agujero: 1, cockle: 1, manoseo: 1, huella_tinta: 1, grafito: 1, sangrado: 1 }
};
function materialOf(st) { const p = paperById(st.paper); return (p && p.material) || 'paper'; }
function allowed(st, cid) { const no = MATERIAL_NO[materialOf(st)]; return !no || !no[cid]; }
// La antigüedad no sólo tuesta el papel: cuanto más vieja la hoja, más marcas. Al subir el slider se suman a las del
// estado elegido (que además se multiplican si pasas de su antigüedad propia). Curva lenta al principio: a 20-40 %
// apenas añade; a 100-120 % la hoja está destrozada (hongos por todas partes, cercos de agua, polvo, cantos rotos).
const AGE_ADD = { moho: 2, polvo: 420, foxing: 300, manchado: 1.1, descamacion: 110, fibras: 4, humedad: 2, agua: 2, uv: 1,
  media_luna: 3, arruguita: 3, cockle: 0.7, manoseo: 0.45, grapa_agujero: 1, huella_grasa: 1.5, adhesivo: 0.6 };
// cada estado envejece a su manera (sumas extra por unidad de la curva)
const AGE_FLAVOR = {
  humedad: { moho: 12, foxing: 650, humedad: 4, agua: 4, barro: 1.5, cockle: 0.6, manchado: 0.5, descamacion: 80, sangrado: 1 },
  abandonado: { moho: 20, foxing: 800, humedad: 5, agua: 5, barro: 2.5, cockle: 0.6, manchado: 0.7, descamacion: 140, polvo: 300, sangrado: 1.5 },
  libro: { moho: 2, foxing: 350, manchado: 0.5, uv: 1, descamacion: 40 }, correo: { foxing: 250, matasellos: 1, huella_tinta: 1, agua: 1 },
  archivo: { moho: 4, foxing: 250, polvo: 300, adhesivo: 1.5, grapa_agujero: 2, clip_huella: 1, humedad: 1 },
  sol: { uv: 2, calor: 1, foxing: -150 }, oficial: { foxing: 150, huella_tinta: 1, grapa_agujero: 1 },
  bar: { cafe: 2, salp_cafe: 1.5, grasa: 2, quemadura: 2, huella_grasa: 2 }, taller: { grasa: 3, barro: 2, huella_tinta: 2, huella_grasa: 3 },
  velas: { cera: 3, quemadura: 3, calor: 2 }, escuela: { grafito: 2, goma: 2, huella_grasa: 2, arruguita: 2 },
  usado: { huella_grasa: 2, manoseo: 0.3 }, nuevo: {}
};
function ageCurve(st) { return Math.pow(Math.max(0, clamp(def(st.edad, 0), 0, 1.5) - 0.05), 1.6); }
function estadoCounts(st) {
  if (st.custom && typeof st.custom === 'object') return st.custom;
  const e = P.ESTADOS.filter(x => x.id === st.estado)[0] || P.ESTADOS[0];
  const a = clamp(def(st.edad, e.edad), 0, 1.5), g = ageCurve(st);
  if (g <= 0) return e.v;
  const v = {}, mul = 1 + 1.2 * Math.max(0, a - e.edad);
  Object.keys(e.v).forEach(c => { v[c] = e.v[c] * (c === 'sol' ? 1 : mul); });
  const add = (tbl) => Object.keys(tbl).forEach(c => { v[c] = Math.max(0, (v[c] || 0) + tbl[c] * g); });
  add(AGE_ADD); add(AGE_FLAVOR[e.id] || {});
  ['cockle', 'manchado', 'manoseo'].forEach(c => { if (v[c] != null) v[c] = Math.min(1.5, v[c]); });
  return v;
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
            alb[j] += (255 - alb[j]) * mm * 0.06; alb[j + 1] += (255 - alb[j + 1]) * mm * 0.06; alb[j + 2] += (255 - alb[j + 2]) * mm * 0.06;
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
  if (scat && (edad > 0.15 || manchado > 0) && allowed(st, 'manchado')) {
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
  const mat = materialOf(st); if (mat === 'wood' || mat === 'surface') return;   // un tablero o una pared no se curvan
  const kk = clamp(S.k, 0, 2);
  const cock = allowed(st, 'cockle') ? (def(counts.cockle, 0) + clamp(def(st.edad, 0), 0, 1) * 0.25) * kk : 0;
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
  if (materialOf(st) !== 'paper') return null;      // madera y cartón no se doblan como el papel
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
  // la luz de la foto: lo más claro del pliegue llega al blanco del papel y el resto queda por debajo (como en una foto
  // real de papel blanco). Si no, en papel blanco las luces se queman y el pliegue se ve plano y falso.
  let hiS = 0; { const hs = new Float32Array(TN >> 4); for (let i = 0; i < hs.length; i++) hs[i] = SH[i << 4]; hs.sort(); hiS = Math.max(0, hs[(hs.length * 0.995) | 0]); }
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
  // ---- altura de la hoja: la luz de la foto (sombreado) es la pendiente de la hoja; sumándola a lo largo de filas y
  // columnas sale su altura (lo que sube y baja en cada pliegue). Visto con la cámara, lo más alto se ve un poco más
  // hacia fuera: el contorno de la hoja y lo impreso hacen un quiebro en cada pliegue, como en la foto de una hoja
  // que estuvo doblada.
  const pd = 2, pw = Math.ceil(tw / pd), ph = Math.ceil(th / pd), PN = pw * ph;
  const SHd = new Float32Array(PN);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) SHd[y * pw + x] = SH[Math.min(th - 1, y * pd) * tw + Math.min(tw - 1, x * pd)];
  { let m = 0; for (let o = 0; o < PN; o++) m += SHd[o]; m /= PN; for (let o = 0; o < PN; o++) SHd[o] -= m; }
  const PZ = new Float32Array(PN), H2 = new Float32Array(PN), tmpP = new Float32Array(PN);
  for (let y = 0; y < ph; y++) { let s = 0; for (let x = 0; x < pw; x++) { s += SHd[y * pw + x]; PZ[y * pw + x] = s; } }
  for (let x = 0; x < pw; x++) { let s = 0; for (let y = 0; y < ph; y++) { s += SHd[y * pw + x]; H2[y * pw + x] = s; } }
  for (let o = 0; o < PN; o++) PZ[o] += H2[o];
  // sin deriva: se quita lo muy lento (lo que mide más que unos 6 cm)
  H2.set(PZ); gaussBlur(H2, pw, ph, 60 * tpm / pd, tmpP);
  let hs = 0; for (let o = 0; o < PN; o++) { PZ[o] -= H2[o]; hs += PZ[o] * PZ[o]; }
  hs = Math.sqrt(hs / PN) || 1; for (let o = 0; o < PN; o++) PZ[o] = clamp(PZ[o] / hs * 0.25, -0.6, 0.6);
  // el papel no hace escalones: dobla. Se suaviza unos milímetros para que el contorno haga un codo, no un corte
  gaussBlur(PZ, pw, ph, 2.5 * tpm / pd, tmpP);
  const bilP = (u, v) => {
    u = clamp(u / pd, 0, pw - 1.001); v = clamp(v / pd, 0, ph - 1.001);
    const iu = u | 0, iv = v | 0, du = u - iu, dv = v - iv, o = iv * pw + iu;
    return (PZ[o] * (1 - du) + PZ[o + 1] * du) * (1 - dv) + (PZ[o + pw] * (1 - du) + PZ[o + pw + 1] * du) * dv;
  };
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
  const hiA = hiS * amt;
  const F = {
    amt, it, pre,
    wear: clamp(def(st.pliegueWear, 1), 0, 3) * (1 + 0.8 * clamp(def(st.edad, 0), 0, 1.2)) * Math.min(1.4, clamp(S.k, 0, 2)),
    dirt: clamp(def(st.edad, 0), 0, 1.2),
    // out = [sombreado-1, desplazamiento, arista, cruce]
    sample(x, y, out) {
      const u = a * x + b * y + c, v = d * x + e * y + f;
      out[0] = (bic(u, v) * amt - hiA) / (1 + hiA); out[1] = bil(DS, u, v) * amt; out[2] = bil(CR, u, v); out[3] = bil(JN, u, v);
      return out;
    },
    // altura relativa del panel (-0.5..0.5) en este punto del documento
    panel(x, y) { return bilP(a * x + b * y + c, d * x + e * y + f); },
    panelK: 0.01 * Math.min(1.5, amt) * (st.luz === 'ninguna' || st.luz === 'escaner' ? 0.6 : 1)
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

// ================================================================ BORDE DE LA HOJA
// La hoja deja de llenar el documento: queda recortada, con su sombra debajo. Tres maneras (corte limpio, rasgado,
// quemado) y un solo slider de desgaste que decide todo lo demás. Todo se genera a la escala real del papel:
//   · corte limpio: canto nítido; con desgaste, pelusa de fibra de 0,2 mm, muescas de 0,3-1,5 mm, esquinas
//     redondeadas (1-3 mm), suciedad del canto, orejas dobladas (6-25 mm), pequeños desgarros y algún mordisco;
//   · rasgado: el desgarro se aparta de la recta 1-5 mm en ondas de 4-8 cm, con dientes de 0,1-0,4 mm, fibras que
//     salen 0,3-3 mm según el papel (folio corto, acuarela algodón, arroz pelo largo, kraft fibra marrón) y, a tramos,
//     el bisel: la cara interior del papel que asoma, más clara y sin tinta (en un papel de color, blanca; en la
//     cartulina gris, su alma crema; en el cartón ondulado, las ondas de dentro);
//   · quemado: frente de quema a lóbulos, filo carbonizado negro con ceniza, chamuscado pardo que se apaga hacia
//     dentro y, con mucho desgaste, agujeros quemados.
// Se guarda «plano» (alfa, multiplicador de luz/color, quitar tinta, alma) y se lee desplazado con lo mismo que mueve la
// tinta: el contorno sigue los pliegues, la forma de la hoja y la cámara.
const BORDE_PAR = {
  oficina:     { fib: 0.35, dens: 6, fa: 0.55, bev: 0.75, teeth: 0.14, core: [0.6, 253, 253, 251] },
  cuaderno:    { fib: 0.35, dens: 6, fa: 0.55, bev: 0.75, teeth: 0.14, core: [0.6, 253, 253, 251] },
  periodico:   { fib: 0.5, dens: 10, fa: 0.5, bev: 0.45, teeth: 0.22, core: [0.35, 238, 234, 222] },
  reciclado:   { fib: 0.55, dens: 9, fa: 0.5, bev: 0.6, teeth: 0.22, core: [0.4, 238, 234, 224] },
  acuarela:    { fib: 0.9, dens: 8, fa: 0.5, bev: 1.0, teeth: 0.3, core: [0.5, 252, 250, 245] },
  washi:       { fib: 2.4, dens: 5, fa: 0.42, bev: 0.3, teeth: 0.2, curl: 1.6, core: [0.5, 250, 250, 247] },
  artesanal:   { fib: 1.3, dens: 7, fa: 0.5, bev: 0.9, teeth: 0.35, curl: 1.2, core: [0.4, 246, 240, 228] },
  kraft:       { fib: 1.0, dens: 7, fa: 0.55, bev: 1.0, teeth: 0.25, core: [0.55, 222, 196, 152] },
  pergamino:   { fib: 0.18, dens: 1.5, fa: 0.5, bev: 0.35, teeth: 0.45, core: [0.3, 236, 222, 192] },
  vegetal:     { fib: 0.05, dens: 0.3, fa: 0.4, bev: 0.4, teeth: 0.08, core: [0.85, 250, 250, 250] },
  gris:        { fib: 0.6, dens: 6, fa: 0.55, bev: 1.5, teeth: 0.25, core: [1, 224, 216, 198] },
  carton:      { fib: 0.7, dens: 5, fa: 0.55, bev: 3.2, teeth: 0.4, flute: 6.5, core: [0.45, 214, 186, 142] },
  carton_liso: { fib: 1.1, dens: 6, fa: 0.55, bev: 1.4, teeth: 0.3, core: [0.45, 214, 186, 142] }
};
function typeIdOf(paperId) { const t = (P.PAPER_TYPES || []).filter(t => t.papers.indexOf(paperId) >= 0)[0]; return t ? t.id : null; }
function bordeFam(st) { return P.BORDE_FAM[typeIdOf(st.paper)] || null; }
function bordeTipo(st) {
  const t = st.borde || 'ninguno';
  return t === 'recto' || t === 'gastado' ? 'limpio' : t === 'roto' ? 'rasgado' : t;
}
function bordeOk(st) { return !!bordeFam(st) && ['limpio', 'rasgado', 'quemado'].indexOf(bordeTipo(st)) >= 0; }
// margen alrededor de la hoja (lo justo para la sombra y las fibras)
function bordeMargin(ppm) { return 7 * ppm; }

async function genBorde(S, st, assets, B) {
  if (!bordeOk(st)) return null;
  const tipo = bordeTipo(st), fam = bordeFam(st), PR = BORDE_PAR[fam] || BORDE_PAR.oficina;
  const { w, h, ppm, N } = S;
  let amt = clamp(def(st.bordeAmount, 0.35), 0, 1);
  if (st.borde === 'gastado') amt = Math.max(amt, 0.6); else if (st.borde === 'roto') amt = Math.max(amt, 0.85);
  const r = rng(S.seed * 13 + (def(st.seedBorde, 0) | 0) * 7919 + 5);
  const mm = ppm;                                   // px por mm
  // color del papel elegido (para el alma que asoma al rasgar)
  let pr = 0, pg = 0, pb = 0, pn = 0;
  for (let o = 0; o < N; o += 97) { pr += B.alb[o * 4]; pg += B.alb[o * 4 + 1]; pb += B.alb[o * 4 + 2]; pn++; }
  pr /= pn; pg /= pn; pb /= pn;
  const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
  const colored = (mx - mn) / Math.max(1, mx) > 0.2 && fam !== 'kraft' && fam !== 'carton' && fam !== 'carton_liso';
  const cr = colored ? [0.8, 250, 250, 248] : PR.core;
  const core = [lerp(pr, cr[1], cr[0]), lerp(pg, cr[2], cr[0]), lerp(pb, cr[3], cr[0])];

  const A = new Uint8Array(N).fill(255), SS = new Uint8Array(N * 3).fill(128), K = new Uint8Array(N), C = new Uint8Array(N);
  const gx = (s, t, u) => s === 0 ? t : s === 1 ? w - 1 - u : s === 2 ? w - 1 - t : u;
  const gy = (s, t, u) => s === 0 ? u : s === 1 ? t : s === 2 ? h - 1 - u : h - 1 - t;
  const mulS = (o, a, b, c) => { const q = o * 3; SS[q] = clamp(SS[q] * a, 0, 255); SS[q + 1] = clamp(SS[q + 1] * b, 0, 255); SS[q + 2] = clamp(SS[q + 2] * c, 0, 255); };
  const maxK = (o, v) => { const k = v * 255; if (k > K[o]) K[o] = k; };
  const maxC = (o, v) => { const k = v * 255; if (k > C[o]) C[o] = k; };
  // ---- qué es cada lado: 0 arriba · 1 derecha · 2 abajo · 3 izquierda
  const kind = ['limpio', 'limpio', 'limpio', 'limpio'];
  const order = [0, 1, 2, 3].sort(() => r() - 0.5);
  if (tipo === 'rasgado') { const nT = amt < 0.25 ? 1 : amt < 0.5 ? 2 : amt < 0.75 ? 3 : 4; for (let i = 0; i < nT; i++) kind[order[i]] = 'rasgado'; }
  if (tipo === 'quemado') for (let s = 0; s < 4; s++) kind[s] = 'quemado';
  const wearClean = tipo === 'limpio' ? amt : amt * 0.6;
  const seeds = [0, 1, 2, 3].map(() => (r() * 1e5) | 0);
  const margin = bordeMargin(mm);
  // ---- burn: anchos de carbón y chamuscado
  const wcB = (0.25 + 0.9 * amt) * mm, wsB = (1.6 + 9 * amt) * mm;
  const charAt = (o, dm, nz) => {
    // dm en px desde el filo hacia dentro
    const wc = wcB * (0.6 + 0.8 * nz), ws = wsB * (0.55 + 0.9 * nz);
    if (dm < wc) {
      const ash = smooth(0.55, 0.9, nz) * 0.35;
      mulS(o, 0.11 + ash, 0.085 + ash, 0.07 + ash * 0.95); maxK(o, 1);
    } else {
      const f = Math.pow(clamp(1 - (dm - wc) / ws, 0, 1), 1.6);
      if (f > 0.001) {
        const deep = smooth(0.7, 1, f);
        mulS(o, lerp(1, lerp(0.62, 0.3, deep), f), lerp(1, lerp(0.42, 0.18, deep), f), lerp(1, lerp(0.2, 0.08, deep), f));
        if (deep > 0) maxK(o, deep * 0.6);
      }
    }
  };
  // ---- cada lado: línea del filo (distancia al borde del documento, px) y lo que pasa cerca de ella
  const lines = [];
  const torn = [];
  for (let s = 0; s < 4; s++) {
    const L = (s === 0 || s === 2) ? w : h, sd = seeds[s], kd = kind[s];
    const line = new Float32Array(L), tm = new Float32Array(L), bev = new Float32Array(L), bnz = new Float32Array(L);
    const Aw = (0.8 + 4.2 * amt) * mm, slope = (r() - 0.5) * 1.6;
    // mordiscos en un canto limpio (desgaste alto): tramos rasgados cortos
    const bites = [];
    if (kd === 'limpio' && wearClean > 0.82) { const nb = r() < 0.5 ? 1 : 0; for (let i = 0; i < nb; i++) bites.push([r() * L, lerp(6, 16, r()) * mm, lerp(1.5, 4, r()) * mm]); }
    const nicks = [];
    if (kd !== 'quemado') { const nn = Math.round(L / mm / 60 * Math.pow(wearClean, 1.4) * 4 * r() + (wearClean > 0.3 ? 1 : 0) * (r() < wearClean ? 1 : 0)); for (let i = 0; i < nn; i++) nicks.push([r() * L, lerp(0.4, 1.8, r()) * mm, lerp(0.15, 0.8, r()) * mm * (0.5 + wearClean)]); }
    for (let t = 0; t < L; t++) {
      const tmm = t / mm;
      let v = margin, tw = 0;
      if (kd === 'rasgado') {
        tw = 1;
        v += Aw * (0.15 + 0.85 * fbm2(tmm / 55, s * 3.7, sd)) + 0.32 * Aw * fbm2(tmm / 9, s * 1.3, sd + 1)
          + Aw * 0.5 * (0.5 + 0.5 * slope * (t / L - 0.5) * 2);
        v += PR.teeth * mm * (vnoise(tmm / 0.7, s, sd + 2) + 0.6 * vnoise(tmm / 0.28, s, sd + 3));
      } else if (kd === 'quemado') {
        const D = (1.2 + 12 * amt) * mm;
        const lobe = 1 - Math.abs(2 * vnoise(tmm / 14, s * 2.1, sd) - 1);       // frentes de quema en cúspide
        v += D * (0.25 + 0.5 * lobe + 0.25 * fbm2(tmm / 40, s, sd + 5)) + 0.35 * mm * vnoise(tmm / 0.5, s, sd + 6);
      } else {
        v += 0.03 * mm * (vnoise(tmm / 1.5, s, sd) - 0.5);
        for (const [t0, bw, bd] of bites) {
          const q = (t - t0) / bw; if (Math.abs(q) < 1) {
            const prof = Math.pow(1 - q * q, 0.7);
            v += bd * prof * (0.6 + 0.8 * fbm2(tmm / 3, s, sd + 7)) + PR.teeth * mm * vnoise(tmm / 0.6, s, sd + 8) * prof;
            tw = Math.max(tw, smooth(0, 0.35, prof));
          }
        }
        for (const [t0, nw, nd] of nicks) { const q = (t - t0) / nw; if (Math.abs(q) < 1) v += nd * Math.sqrt(1 - q * q) * (0.7 + 0.6 * vnoise(tmm / 0.3, s, sd + 9)); }
      }
      line[t] = v; tm[t] = tw;
      // bisel a tramos: sólo donde el desgarro dejó la cara interior arriba
      bev[t] = tw * PR.bev * mm * (colored ? 1.5 : 1) * Math.max(0, fbm2(tmm / 7, s * 5.1, sd + 11) * 1.8 - (colored ? 0.3 : 0.5)) * (0.7 + 0.5 * amt);
      bnz[t] = fbm2(tmm / 6, s * 0.7, sd + 12);
    }
    lines.push(line); torn.push(tm);
    let umax = 0; for (let t = 0; t < L; t++) umax = Math.max(umax, line[t] + bev[t]);
    const deep = kd === 'quemado' ? wsB * 1.5 + wcB * 1.5 : Math.max(PR.bev * mm * 2, 1.2 * mm) + (PR.flute ? 2 * mm : 0);
    const D = (s === 0 || s === 2) ? h : w;
    umax = Math.min(D, Math.ceil(umax + deep + 2));
    const dirtW = (1 + 2.5 * wearClean) * mm, dirt = 0.09 * Math.pow(wearClean, 1.5);
    for (let t = 0; t < L; t++) {
      const ln = line[t], tw = tm[t], bw = bev[t], nz = bnz[t], tmm = t / mm;
      for (let u = 0; u < umax; u++) {
        const o = gy(s, t, u) * w + gx(s, t, u);
        const d = u - ln;
        if (d < -0.5) {
          // fuera de la hoja; en el quemado, ceniza suelta pegada al filo
          if (kd === 'quemado' && d > -0.35 * mm) {
            const ash = clamp(vnoise(tmm / 0.25, u / mm / 0.25, seeds[s] + 13) * 1.6 - 0.6, 0, 1) * (1 + d / (0.35 * mm));
            if (ash > 0.02) { A[o] = Math.min(A[o], ash * 200); mulS(o, 0.16, 0.13, 0.11); maxK(o, 1); continue; }
          }
          A[o] = 0; continue;
        }
        if (d < 0.5) A[o] = A[o] * (d + 0.5);
        const dd = Math.max(0, d);
        if (kd === 'quemado') { charAt(o, dd, 0.55 * nz + 0.45 * vnoise(tmm / 2.5, u / mm / 2.5, seeds[s] + 16)); continue; }
        // canto: el grosor del papel hace una línea finísima algo más oscura
        if (dd < 0.18 * mm) mulS(o, 0.96, 0.96, 0.96);
        if (tw > 0) {
          if (dd < 0.5 * mm) { const f = 1 + 0.035 * tw * (1 - dd / (0.5 * mm)); mulS(o, f, f, f); }
          if (bw > 0.3 && dd < bw + 0.15 * mm) {
            if (dd < bw) {
              // bisel: cara interior, fibrosa, sin tinta
              const fib = vnoise(tmm / 0.11, dd / mm / 0.6, seeds[s] + 14);
              maxK(o, tw); maxC(o, tw * (0.75 + 0.25 * fib) * smooth(bw, bw * 0.75, dd));
              if (PR.flute) {
                const yy = gy(s, t, u) / mm, ph = Math.cos(yy / PR.flute * 6.283);   // las ondas van en filas, como la textura
                const f = 0.8 + 0.2 * ph; mulS(o, f, f * 0.98, f * 0.95);
              }
            } else { const f = PR.flute ? 0.72 : 0.9; mulS(o, f, f, f); }   // escalón del bisel: sombra fina
          }
        }
        if (dirt > 0 && dd < dirtW) {
          const f = dirt * Math.pow(1 - dd / dirtW, 2) * (0.5 + vnoise(tmm / 4, s, seeds[s] + 15));
          mulS(o, 1 - f * 0.9, 1 - f * 1.0, 1 - f * 1.25);
        }
      }
    }
  }
  // ---- esquinas: redondeo del desgaste y orejas dobladas (sólo donde los dos cantos son limpios)
  const cornerSides = [[0, 3], [0, 1], [2, 1], [2, 3]];          // TL, TR, BR, BL
  const sgxs = [1, -1, -1, 1], sgys = [1, 1, -1, -1];
  const med = (arr) => { const a = Array.from(arr.subarray(Math.floor(arr.length * 0.1), Math.floor(arr.length * 0.9))).sort((p, q) => p - q); return a[a.length >> 1]; };
  const Lm = lines.map(med);
  const cornerXY = (ci) => [sgxs[ci] > 0 ? Lm[3] : w - 1 - Lm[1], sgys[ci] > 0 ? Lm[0] : h - 1 - Lm[2]];
  const cleanCorner = (ci) => kind[cornerSides[ci][0]] === 'limpio' && kind[cornerSides[ci][1]] === 'limpio';
  const [Lx0, Ly0] = lightDir(st.luz);
  for (let ci = 0; ci < 4; ci++) {
    if (!cleanCorner(ci) && tipo !== 'rasgado') continue;
    const rad = (0.15 + 3 * Math.pow(wearClean, 1.3) * lerp(0.5, 1.2, r())) * mm;
    if (rad < 0.4) continue;
    const [xc, yc] = cornerXY(ci), sx = sgxs[ci], sy = sgys[ci];
    for (let Y = 0; Y < rad + 2; Y++) for (let X = 0; X < rad + 2; X++) {
      const x = Math.round(xc + X * sx), y = Math.round(yc + Y * sy); if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (X >= rad || Y >= rad) continue;
      const dist = Math.hypot(rad - X, rad - Y), cov = clamp(rad - dist + 0.5, 0, 1);
      const o = y * w + x; A[o] = A[o] * cov;
    }
  }
  const nEars = wearClean < 0.35 ? 0 : wearClean < 0.7 ? 1 : 2;
  const earOrder = [0, 1, 2, 3].sort(() => r() - 0.5).filter(cleanCorner);
  for (let ei = 0; ei < Math.min(nEars, earOrder.length); ei++) {
    const ci = earOrder[ei], [xc, yc] = cornerXY(ci), sgx = sgxs[ci], sgy = sgys[ci];
    const s1 = lerp(6, 22, Math.pow(r(), 1.5)) * (0.7 + 0.5 * wearClean) * mm, s2 = s1 * lerp(0.7, 1.35, r());
    const f = lerp(0.82, 0.97, r());                       // la solapa no queda plana: se ve algo más corta
    const nl = Math.hypot(1 / s1, 1 / s2), nx = 1 / s1 / nl, ny = 1 / s2 / nl;
    const Bx = Math.ceil(Math.max(s1, s2) * 1.15 + 3 * mm);
    const M = new Float32Array(Bx * Bx), T = new Float32Array(Bx * Bx);
    const inFlap = (X, Y) => {
      const dl = X * nx + Y * ny - 1 / nl;                  // >0: lado de la hoja
      if (dl <= 0) return false;
      const k = dl * (1 + 1 / f), Xs = X - nx * k, Ys = Y - ny * k;
      return Xs >= 0 && Ys >= 0;
    };
    for (let Y = 0; Y < Bx; Y++) for (let X = 0; X < Bx; X++) {
      let c = 0; for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) if (inFlap(X + ox, Y + oy)) c++;
      M[Y * Bx + X] = c / 4;
    }
    // sombra de la solapa sobre la hoja: hacia el lado contrario de la luz, más larga lejos del pliegue
    const sdx = -Lx0 * sgx, sdy = -Ly0 * sgy, off = 0.7 * mm;
    for (let Y = 0; Y < Bx; Y++) for (let X = 0; X < Bx; X++) {
      const xs = Math.round(X - sdx * off), ys = Math.round(Y - sdy * off);
      T[Y * Bx + X] = xs >= 0 && ys >= 0 && xs < Bx && ys < Bx ? M[ys * Bx + xs] : 0;
    }
    gaussBlur(T, Bx, Bx, 0.8 * mm, new Float32Array(Bx * Bx));
    const back = 0.965, lift = (Lx0 * sgx * nx + Ly0 * sgy * ny);   // la solapa mira algo hacia la luz o en contra
    for (let Y = 0; Y < Bx; Y++) for (let X = 0; X < Bx; X++) {
      const x = Math.round(xc + X * sgx), y = Math.round(yc + Y * sgy); if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = y * w + x, dl = X * nx + Y * ny - 1 / nl, m = M[Y * Bx + X];
      if (dl < 0.5) A[o] = A[o] * clamp(dl + 0.5, 0, 1);
      if (m > 0) {
        A[o] = Math.max(A[o], m * 255);
        const g = back * (1 - 0.05 * lift * clamp(dl / (Math.min(s1, s2) * 0.5), 0, 1)) * (dl < 0.35 * mm ? 1.05 : 1);
        const q = o * 3; SS[q] = clamp(128 * g, 0, 255); SS[q + 1] = SS[q]; SS[q + 2] = clamp(128 * g * 0.99, 0, 255);
        K[o] = 255; C[o] = 0;
      } else if (dl > 0) {
        const sh = T[Y * Bx + X] * 0.33; if (sh > 0.003) mulS(o, 1 - sh, 1 - sh, 1 - sh);
      }
    }
  }
  // ---- desgarros pequeños que entran en la hoja
  const nTears = (tipo === 'quemado') ? 0 : wearClean > 0.55 ? 1 + (r() < (wearClean - 0.55) * 2 ? 1 : 0) + (tipo === 'rasgado' && amt > 0.8 ? 1 : 0) : 0;
  for (let i = 0; i < nTears; i++) {
    const s = (r() * 4) | 0, L = (s === 0 || s === 2) ? w : h, t0 = lerp(0.12, 0.88, r()) * L;
    let t = t0, u = lines[s][Math.round(t0)] - 0.5 * mm, ang = (r() - 0.5) * 1.1;
    const len = lerp(3, 14, r()) * mm, open = lerp(0.05, 0.22, r()) * mm, side = r() < 0.5 ? 1 : -1;
    const pts = [];
    for (let l = 0; l < len; l += 0.35 * mm) { pts.push([gx(s, t, u), gy(s, t, u), 1 - l / len]); ang += (r() - 0.5) * 0.6; t += Math.sin(ang) * 0.35 * mm; u += Math.cos(ang) * 0.35 * mm; }
    const R = 1.2 * mm;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0 - R)); y <= Math.min(h - 1, Math.ceil(y1 + R)); y++) for (let x = Math.max(0, Math.floor(x0 - R)); x <= Math.min(w - 1, Math.ceil(x1 + R)); x++) {
      let best = 1e9, bs = 0, bw = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
        const q = clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1), px = ax + vx * q - x, py = ay + vy * q - y, dd = px * px + py * py;
        if (dd < best) { best = dd; bs = (vx * (y - ay) - vy * (x - ax)) > 0 ? 1 : -1; bw = lerp(pts[k][2], pts[k + 1][2], q); }
      }
      const dist = Math.sqrt(best), o = y * w + x, half = open * bw * 0.5;
      if (dist < half + 0.5) A[o] = A[o] * clamp(dist - half + 0.5, 0, 1);
      if (dist < R) {
        const e = Math.exp(-dist / (0.35 * mm));
        if (bs === side) mulS(o, 1 - 0.14 * e, 1 - 0.14 * e, 1 - 0.14 * e); else mulS(o, 1 + 0.05 * e, 1 + 0.05 * e, 1 + 0.05 * e);
        maxC(o, 0.5 * Math.exp(-dist / (0.12 * mm))); if (dist < 0.25 * mm) maxK(o, 0.6);
      }
    }
  }
  // ---- agujeros quemados
  if (tipo === 'quemado' && amt > 0.55) {
    const nh = 1 + Math.round((amt - 0.55) * 5 * r());
    for (let i = 0; i < nh; i++) {
      const s = (r() * 4) | 0, L = (s === 0 || s === 2) ? w : h, t0 = lerp(0.15, 0.85, r()) * L;
      const Rr = lerp(1.5, 7, r()) * amt * mm, u0 = lines[s][Math.round(t0)] + Rr + lerp(3, 25, r()) * mm;
      const cx = gx(s, t0, u0), cy = gy(s, t0, u0), hs = (r() * 1e5) | 0, ext = Rr * 1.4 + wsB * 1.6 + wcB * 2;
      for (let y = Math.max(0, Math.floor(cy - ext)); y <= Math.min(h - 1, Math.ceil(cy + ext)); y++) for (let x = Math.max(0, Math.floor(cx - ext)); x <= Math.min(w - 1, Math.ceil(cx + ext)); x++) {
        const dx = x - cx, dy = y - cy, rr = Math.hypot(dx, dy), an = Math.atan2(dy, dx);
        const Rt = Rr * (0.55 + 0.9 * fbm2(Math.cos(an) * 2.2 + 3, Math.sin(an) * 2.2 + 3, hs) + 0.12 * vnoise(an * 9, 2, hs + 3));
        const d = rr - Rt, o = y * w + x;
        if (d < 0.5) A[o] = A[o] * clamp(d + 0.5, 0, 1);
        if (d >= -0.5) charAt(o, Math.max(0, d), fbm2(an * 2, 1, hs + 1));
      }
    }
  }
  // ---- fibras: salen del filo rasgado (y una pelusa fina en los cantos gastados)
  const fibW = Math.max(0.55, 0.045 * mm);
  for (let s = 0; s < 4; s++) {
    if (kind[s] === 'quemado') continue;
    const L = (s === 0 || s === 2) ? w : h, line = lines[s], tm = torn[s];
    const Lmm = L / mm;
    const nF = Math.round(Lmm * PR.dens * (kind[s] === 'rasgado' ? 1 : 0.06 + 0.5 * Math.pow(wearClean, 1.5)));
    for (let i = 0; i < nF; i++) {
      const t0 = r() * L, ti = Math.round(t0), tw = Math.max(tm[ti], kind[s] === 'rasgado' ? 1 : 0);
      const lenK = tw > 0.5 ? 1 : 0.35;
      const len = PR.fib * lenK * mm * (0.25 + 1.6 * Math.pow(r(), 2.2));
      if (len < 0.8) continue;
      let t = t0, u = line[ti] + r() * 0.25 * mm * lenK, ang = gauss(r) * 0.65;
      { const rx = Math.round(gx(s, t, u + 1)), ry = Math.round(gy(s, t, u + 1)); if (rx < 0 || ry < 0 || rx >= w || ry >= h || A[ry * w + rx] < 160) continue; }
      const curl = (r() - 0.5) * 0.25 * (PR.curl || 1) / Math.max(1, len / mm);
      const af = PR.fa * (0.35 + 0.65 * r()) * (tw > 0.5 ? 1 : 0.7);
      const steps = Math.ceil(len / 0.6);
      for (let k = 0; k < steps; k++) {
        const fx = gx(s, t, u), fy = gy(s, t, u);
        const ix = Math.floor(fx), iy = Math.floor(fy), ffx = fx - ix, ffy = fy - iy;
        const fade = 1 - 0.6 * (k / steps);
        for (const [ddx, ddy, ww] of [[0, 0, (1 - ffx) * (1 - ffy)], [1, 0, ffx * (1 - ffy)], [0, 1, (1 - ffx) * ffy], [1, 1, ffx * ffy]]) {
          const xx = ix + ddx, yy = iy + ddy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = yy * w + xx, a = af * fade * Math.min(1, ww * fibW * 1.6);
          if (a * 255 > A[o]) A[o] = a * 255;
          if (a > 0.05) { K[o] = 255; maxC(o, 0.85); }
        }
        ang += curl * 0.6 + (r() - 0.5) * 0.18;
        t += Math.sin(ang) * 0.6; u -= Math.cos(ang) * 0.6;
      }
    }
  }
  return { A, S: SS, K, C, core };
}
// lee el borde (bilineal) en un punto del documento: o = [alfa, s0, s1, s2, quitarTinta, alma]
function borderAt(BR, w, h, x, y, o) {
  x = x < 0 ? 0 : x > w - 1.001 ? w - 1.001 : x; y = y < 0 ? 0 : y > h - 1.001 ? h - 1.001 : y;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, i00 = iy * w + ix, i10 = i00 + 1, i01 = i00 + w, i11 = i01 + 1;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const A = BR.A, Sx = BR.S, K = BR.K, C = BR.C;
  o[0] = (A[i00] * w00 + A[i10] * w10 + A[i01] * w01 + A[i11] * w11) / 255;
  for (let c = 0; c < 3; c++) o[1 + c] = (Sx[i00 * 3 + c] * w00 + Sx[i10 * 3 + c] * w10 + Sx[i01 * 3 + c] * w01 + Sx[i11 * 3 + c] * w11) / 128;
  o[4] = (K[i00] * w00 + K[i10] * w10 + K[i01] * w01 + K[i11] * w11) / 255;
  o[5] = (C[i00] * w00 + C[i10] * w10 + C[i01] * w01 + C[i11] * w11) / 255;
  return o;
}
// Sombra de la hoja sobre la mesa: una sombra suave desplazada en contra de la luz y otra de contacto, pegada al
// canto. Con escáner casi no hay (el cristal aplasta la hoja); con lámpara o foco es más marcada.
function sheetShadow(S, st, A) {
  const { w, h, ppm, N } = S;
  const L = LIGHT[st.luz] || LIGHT.ninguna, n = Math.hypot(L.lx, L.ly) || 1, dx = -L.lx / n, dy = -L.ly / n;
  const P0 = { ninguna: [1.3, 2.4, 0.34], escaner: [0.2, 0.6, 0.2], dia: [1.0, 3.4, 0.28], ventana: [2.4, 3.2, 0.38],
    foco: [1.9, 1.8, 0.42], flash: [0.3, 1.4, 0.34], sombra: [0.8, 4.8, 0.22], lampara: [2.1, 2.2, 0.4] }[st.luz] || [1.3, 2.4, 0.34];
  const tmp = new Float32Array(N), sh = new Float32Array(N), c2 = new Float32Array(N);
  const sh1 = Math.round(dx * P0[0] * ppm), sv1 = Math.round(dy * P0[0] * ppm);
  const sh2 = Math.round(dx * 0.15 * ppm), sv2 = Math.round(dy * 0.15 * ppm);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xa = x - sh1, ya = y - sv1, xb = x - sh2, yb = y - sv2;
    sh[y * w + x] = xa >= 0 && ya >= 0 && xa < w && ya < h ? A[ya * w + xa] : 0;
    c2[y * w + x] = xb >= 0 && yb >= 0 && xb < w && yb < h ? A[yb * w + xb] : 0;
  }
  gaussBlur(sh, w, h, P0[1] * ppm, tmp); gaussBlur(c2, w, h, Math.max(0.6, 0.35 * ppm), tmp);
  const k = Math.min(1.3, Math.max(0.3, S.k));
  for (let o = 0; o < N; o++) sh[o] = 1 - (1 - P0[2] * k * sh[o]) * (1 - 0.3 * k * c2[o]);
  return sh;
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
  // con los años las manchas se oscurecen y los hongos crecen en colonias más grandes
  const ag = st.custom ? 0 : Math.min(1.4, ageCurve(st));
  const AGE_DARK = { foxing: 1.3, humedad: 2.0, agua: 1.4, polvo: 0.5, descamacion: 0.5, barro: 0.4, uv: 0.6, manchado: 0.5 };
  const AGE_BIG = { humedad: 0.5, agua: 0.45, uv: 0.3 };   // los cercos viejos son más grandes
  const order = ['nodulos', 'fibras', 'descamacion', 'polvo', 'uv', 'calor', 'humedad', 'agua', 'foxing', 'cafe', 'salp_cafe',
    'barro', 'grasa', 'cera', 'adhesivo', 'matasellos', 'quemadura', 'sangrado', 'salp_tinta', 'grafito', 'huella_tinta',
    'huella_grasa', 'goma', 'escritura', 'mecano', 'sello_seco', 'arruguita', 'media_luna', 'pinza', 'clip_huella', 'grapa_marca', 'grapa_agujero'];
  for (const cid of order) {
    let n = counts[cid]; const C = cats[cid];
    if (!n || !C || !allowed(st, cid)) continue;
    const op0 = Math.min(1, C.opacity * opK * (1 + def(AGE_DARK[cid], 0) * ag));
    const base = { absorb: def(C.absorb, 0), erode: def(C.erode, 0), cellPx: def(C.cellMm, 5) * ppm, cockle: def(C.cockle, 0) };
    if (C.kind === 'stamp') {
      n = Math.round(n * Math.min(1.5, amt));
      for (let i = 0; i < n; i++) {
        const it = C.items[(r() * C.items.length) | 0];
        const img = await loadImg(assets, 'imperf/' + it.file);
        const mask = it.mask ? await loadImg(assets, 'imperf/' + it.file.replace('.png', '_m.png')) : null;
        const sizeMm = lerp(C.size[0], C.size[1], r()) * (1 + def(AGE_BIG[cid], 0) * ag);
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
        if (C.place === 'foxing') for (let c = 0; c < 3 + Math.round(n / (50 + 60 * ag)); c++) {
          const edgeBias = r() < 0.65;
          clusters.push([edgeBias ? (r() < 0.5 ? lerp(0.02, 0.18, r()) : lerp(0.82, 0.98, r())) * Wm : r() * Wm,
            edgeBias && r() < 0.4 ? (r() < 0.5 ? lerp(0.02, 0.15, r()) : lerp(0.85, 0.98, r())) * Hm : r() * Hm, lerp(8, 35 + 25 * ag, r())]);
        }
        for (let i = 0; i < total; i++) {
          const s = sp[(r() * sp.length) | 0];
          let x, y;
          if (clusters.length && r() < 0.78) { const c = clusters[(r() * clusters.length) | 0]; x = c[0] + gauss(r) * c[2]; y = c[1] + gauss(r) * c[2]; }
          else if (cid === 'polvo' && r() < 0.55) {
            const e = Math.pow(r(), 2) * 30, sd = (r() * 4) | 0;
            x = sd === 0 ? e : sd === 1 ? Wm - e : r() * Wm; y = sd === 2 ? e : sd === 3 ? Hm - e : r() * Hm;
          } else { x = r() * Wm; y = r() * Hm; }
          const size = cid === 'foxing' ? lerp(0.35, 1.15 + 1.4 * ag, Math.pow(r(), 2.2)) : lerp(0.55, 1.15, r());
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
  // colonias de moho: muchas motas de foxing apretadas en manchas de 1-4 cm, más densas en el centro
  const nMoho = Math.round(def(counts.moho, 0) * areaK * Math.min(2, amt));
  if (nMoho > 0 && allowed(st, 'foxing') && cats.foxing) {
    const C = cats.foxing, atlas = await loadImg(assets, 'imperf/' + C.atlas), sp = C.sprites;
    const opt = { absorb: def(C.absorb, 0) };
    for (let m = 0; m < nMoho; m++) {
      const edge = r() < 0.6;
      const cx = (edge && r() < 0.5 ? (r() < 0.5 ? lerp(0.0, 0.2, r()) : lerp(0.8, 1, r())) : r()) * Wm;
      const cy = (edge && r() < 0.5 ? (r() < 0.5 ? lerp(0.0, 0.2, r()) : lerp(0.8, 1, r())) : r()) * Hm;
      const R = lerp(5, 20, Math.pow(r(), 1.4)) * (0.7 + 0.6 * ag), dots = Math.round(lerp(60, 160, r()) * R / 10);
      const sq = lerp(0.6, 1.4, r());
      for (let d = 0; d < dots; d++) {
        const s = sp[(r() * sp.length) | 0];
        const rr = Math.abs(gauss(r)) * R * 0.5, a = r() * Math.PI * 2;
        const x = cx + Math.cos(a) * rr * sq, y = cy + Math.sin(a) * rr / sq;
        const sc = s.mm * ppm * lerp(0.5, 1.7, Math.pow(r(), 1.5));
        const op = Math.min(1, C.opacity * opK * (1.2 + ag) * lerp(0.4, 1, r()) * Math.max(0.25, 1 - rr / (R * 1.3)));
        drawSprite(S, B, atlas, s.r, x * ppm, y * ppm, sc, sc, r() * Math.PI * 2, C.mode, op, null, r() < 0.5, opt);
      }
    }
  }
}

// ================================================================ CALCO
// variantes de un calco (p. ej. distintas notas a rotulador): ⟳ pasa a la siguiente
function calcoFile(info, key, st) {
  const list = info[key + 's'];
  if (!list || !list.length) return info[key];
  return list[(((def(st.seedCalco, 0) | 0) % list.length) + list.length) % list.length];
}
async function genCalco(S, st, assets, B, paper, backArt) {
  const id = st.calco;
  if (!id || id === 'ninguno' || materialOf(st) !== 'paper') return;   // madera y cartón no transparentan
  const { w, h, ppm, N } = S;
  const k = S.k;
  // slider: 0 = invisible · 100 % = sutil (como siempre) · 250 % = descarado, se lee lo de detrás
  const A = clamp(def(st.calcoAmount, 1), 0, 3);
  const gA = A <= 1 ? A : 1 + Math.pow(A - 1, 1.5) * 3.2;
  const amount = gA * clamp(k, 0, 2) * def(st._calcoBoost, 1);
  if (amount <= 0) return;
  const loud = clamp((gA - 1) / 6, 0, 1);   // 0 hasta 100 %, 1 al máximo
  const tr = clamp(def(paper.translucency, 0.25), 0, 1);
  const blur = ppm * (0.18 + 0.5 * (1 - tr)) * clamp(def(st.calcoBlur, 1), 0.2, 4) / (1 + 0.8 * loud);
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
    const img = await loadImg(assets, 'calco/' + calcoFile(cache.calco[id], 'ink', st));
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
    const j = o * 4, dk = 0.35 * loud;   // al máximo la tinta de detrás se ve casi gris oscuro
    if (colB) { for (let c = 0; c < 3; c++) { const cv = bil(colB[c], x, y) / Math.max(v, 1e-3); alb[j + c] *= 1 - s * (0.55 * cv + 0.45 * (1 - tint[c] + 0.12) + dk); } }
    else { alb[j] *= 1 - s * (1 - tint[0] + 0.14 + dk); alb[j + 1] *= 1 - s * (1 - tint[1] + 0.14 + dk); alb[j + 2] *= 1 - s * (1 - tint[2] + 0.14 + dk); }
  }
  const tmp = (id === 'apuntes' || id === 'rotulador') ? new Float32Array(N) : null;
  const bleedK = clamp(def(st.calcoBleed, 1), 0, 3) * A * clamp(k, 0, 2) * (1 + 1.5 * loud);
  const info = cache.calco[id] || {};
  const thin = 0.15 + 0.85 * tr;
  const bleedLayers = [];
  // rotulador: el tinte atraviesa el papel por todo el trazo (gris violáceo, borde abierto en las fibras) y aún más
  // donde la punta se paró
  if (id === 'rotulador') bleedLayers.push({ file: calcoFile(info, 'pool', st), col: [0.24, 0.23, 0.31], k: 0.3 * thin, base: calcoFile(info, 'ink', st), baseK: 0.17 * thin, blur: 0.14 });
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
      for (let y = d; y < h - d; y++) for (let x = d; x < w - d; x++) { const o = y * w + x; B.R[o] += (hgt[o - d * w - d] - hgt[o + d * w + d]) * 0.025 * pk; }
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

// ================================================================ PANTALLA
// Lo que hay encima se ve EN una pantalla. Seis pantallas:
//  oled     móvil OLED: subpíxeles en diamante (PenTile: verde en cada píxel, rojo y azul compartidos en rombo),
//           negro absoluto, color saturado, cristal muy brillante
//  lcd      monitor LCD IPS: tira RGB vertical con rejilla negra, negro grisáceo, brillo IPS en esquinas, «mura»
//           (nubes de brillo desigual del panel)
//  vieja    portátil viejo TN: píxel gordo, rejilla marcada (screen door), 6 bits con tramado, color que cambia con el
//           ángulo (arriba lavado, abajo oscuro), azulada, fugas de luz, mura marcada
//  crt      tele de tubo: rejilla de apertura (franjas RGB continuas), líneas de barrido gaussianas que engordan con el
//           brillo, resplandor de fósforos (bloom + halation), convergencia imperfecta, eco de señal, temblor de línea,
//           nieve, cristal curvo con esquinas oscuras
//  led      pantalla LED gigante (valla, estadio): LEDs redondos con sus 3 chips sobre negro, viseras horizontales,
//           módulos de 16×16 con brillo y tono algo distintos, algún LED muerto; muy brillante; fotografiada saca bandas
//  eink     libro electrónico (tinta electrónica): no emite luz, la refleja como el papel; gris de 16 niveles con
//           tramado, blanco grisáceo y negro poco profundo, grano de microcápsulas, fantasma de la página anterior
// Fotografiarla añade moiré (dos rejillas de franjas de colores que se cruzan, curvadas por el objetivo), bandas del
// obturador, reflejos en el cristal (lámpara, flash, tu propio reflejo) y huellas que sólo se ven en el reflejo.
const SCREENS = {
  pantalla_oled: { layout: 'pentile', across: 820, black: 0.0, contrast: 0.06, sat: 0.14, temp: [0.985, 1.0, 1.03], glow: 0.12, gloss: 1.0, bands: 0.3, moire: 0.9, floor: 0.6 },
  pantalla_lcd: { layout: 'stripe', across: 520, black: 0.07, contrast: 0, sat: 0, temp: [0.965, 1.0, 1.05], gap: 0.14, gapV: 0.1, glow: 0.04, gloss: 0.35, bands: 0.08, moire: 1.0, bleed: 0.1, ipsGlow: 0.12, mura: 0.03, floor: 0.58 },
  pantalla_vieja: { layout: 'stripe', across: 300, black: 0.13, contrast: -0.12, sat: -0.12, temp: [0.93, 1.0, 1.1], gap: 0.24, gapV: 0.2, glow: 0.03, gloss: 0.25, bands: 0.18, moire: 0.8, bleed: 0.26, dither: 63, viewAngle: 0.55, mura: 0.07, floor: 0.42 },
  pantalla_crt: { layout: 'crt', across: 380, black: 0.035, contrast: 0.08, sat: 0.05, temp: [1.02, 1.0, 0.97], gap: 0.18, glow: 0.55, gloss: 0.8, bands: 0.42, moire: 0.7, curve: 0.07, converge: 0.22, vig: 0.55, echo: 0.08, jitter: 0.06, snow: 5, floor: 0.3 },
  pantalla_led: { layout: 'led', across: 190, black: 0.0, contrast: 0.1, sat: 0.2, temp: [1.0, 1.0, 1.0], glow: 0.35, gloss: 0.1, bands: 0.5, moire: 1.1, module: 16, dead: 0.0006, floor: 0.0 },
  pantalla_eink: { layout: 'eink', across: 1500, white: 0.8, black: 0.17, contrast: 0, temp: [0.985, 0.99, 0.955], gloss: 0.15, bands: 0, moire: 0, gray: 1, dither: 15, ghost: 0.06, grain: 1, reflective: 1, floor: 1 }
};
function isScreen(st) { const p = paperById(st.paper); return !!(p && p.material === 'screen'); }

async function renderScreen(opts, st, withArt) {
  const { w, h, ppm, assets } = opts;
  const prog = opts.onProgress || (async () => {});
  const art = withArt ? opts.art : null, comps = opts.artComponents || 4;
  const N = w * h, k = clamp(clamp(def(st.intensity, 50), 0, 100) / 50, 0, 2), kk = Math.min(1.5, k), k1 = Math.min(1, kk);
  const S = { w, h, ppm, N, seed: (def(st.seed, 1) | 0) * 7919 + 13 + (def(st.seedPaper, 0) | 0) * 104729, k };
  const D = SCREENS[st.paper] || SCREENS.pantalla_lcd;
  const longS = Math.max(w, h);
  // tamaño del píxel: curva suave (30 % → ×0,5 · 100 % → ×1 · 200 % → ×1,5 · 400 % → ×2,3) para que no se pase
  const pitch = st._pitch || Math.max(1.2, longS / D.across * Math.pow(clamp(def(st.screenZoom, 1), 0.3, 4), 0.6));
  const bright = clamp(def(st.screenBright, 1), 0.3, 1.6);
  const r = rng(S.seed * 7 + 5);
  await prog(0.1, 'Encendiendo la pantalla…');
  // ---- 1) lo que muestra: el arte (sobre blanco) promediado en cada píxel de la pantalla
  const lw = Math.ceil(w / pitch) + 2, lh = Math.ceil(h / pitch) + 2, LN = lw * lh;
  const C = [new Float32Array(LN), new Float32Array(LN), new Float32Array(LN)], cnt = new Float32Array(LN);
  if (art) for (let y = 0; y < h; y++) {
    const ly = (y / pitch) | 0;
    for (let x = 0; x < w; x++) {
      const o = ly * lw + ((x / pitch) | 0), s = (y * w + x) * comps, al = comps === 4 ? art[s + 3] / 255 : 1;
      C[0][o] += 1 - al + al * art[s] / 255; C[1][o] += 1 - al + al * art[s + 1] / 255; C[2][o] += 1 - al + al * art[s + 2] / 255; cnt[o]++;
    }
  }
  for (let o = 0; o < LN; o++) { const n = cnt[o]; if (n) { C[0][o] /= n; C[1][o] /= n; C[2][o] /= n; } else C[0][o] = C[1][o] = C[2][o] = 1; }
  // tinta electrónica: el fantasma de la página anterior (otro trozo del mismo contenido, desplazado) se queda
  let ghost = null;
  if (D.ghost && art) {
    ghost = new Float32Array(LN); const gy = Math.round(lh * lerp(0.28, 0.42, r())), gx = Math.round(lw * (r() - 0.5) * 0.1);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const yy = (y + gy) % lh, xx = clamp(x + gx, 0, lw - 1), o2 = yy * lw + xx;
      ghost[y * lw + x] = 1 - (C[0][o2] * 0.3 + C[1][o2] * 0.59 + C[2][o2] * 0.11);
    }
  }
  // ---- 2) cómo reproduce el color cada pantalla
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const blk = def(D.black, 0) * kk, wht = 1 - (1 - def(D.white, 1)) * k1, con = def(D.contrast, 0) * kk, sat = def(D.sat, 0) * kk;
  const temp = D.temp.map(t => 1 + (t - 1) * kk);
  const mod = D.module ? [] : null;
  if (mod) for (let i = 0; i < 4096; i++) mod.push([1 + (r() - 0.5) * 0.12 * kk, (r() - 0.5) * 0.05 * kk, (r() - 0.5) * 0.05 * kk]);
  for (let ly = 0; ly < lh; ly++) for (let lx = 0; lx < lw; lx++) {
    const o = ly * lw + lx;
    let c0 = C[0][o], c1 = C[1][o], c2 = C[2][o];
    const l = c0 * 0.2126 + c1 * 0.7152 + c2 * 0.0722;
    if (D.gray) { c0 = c1 = c2 = lerp(l, c0 * 0.3 + c1 * 0.59 + c2 * 0.11, 1); }
    else { c0 = l + (c0 - l) * (1 + sat); c1 = l + (c1 - l) * (1 + sat); c2 = l + (c2 - l) * (1 + sat); }
    const cc = [c0, c1, c2];
    for (let c = 0; c < 3; c++) {
      let v = clamp(cc[c], 0, 1);
      v = 0.5 + (v - 0.5) * (1 + con);
      if (ghost) v -= ghost[o] * D.ghost * kk;
      if (D.viewAngle) {             // TN: el gamma cambia con el ángulo de visión (de arriba a abajo)
        const t = ly / lh - 0.5, va = D.viewAngle * kk;
        v = Math.pow(clamp(v, 0, 1), 1 + va * t * 1.6) * (1 - va * 0.25 * t) + va * 0.12 * Math.max(0, -t);
      }
      if (D.dither) {                // pocos niveles con tramado ordenado (bandas en los degradados)
        const q = lerp(255, D.dither, k1), th = (bayer[(ly & 3) * 4 + (lx & 3)] + 0.5) / 16 - 0.5;
        v = Math.round(clamp(v, 0, 1) * q + th) / q;
      }
      v = blk + (wht - blk) * clamp(v, 0, 1);
      if (mod) { const mi = (((ly / D.module) | 0) * 64 + ((lx / D.module) | 0)) & 4095, md = mod[mi]; v *= md[0] * (1 + (c === 0 ? md[1] : c === 2 ? md[2] : 0)); }
      cc[c] = clamp(v * temp[c] * bright, 0, 1.4);
    }
    if (D.dead && r() < D.dead * kk) { const t = r(); if (t < 0.6) cc[0] = cc[1] = cc[2] = 0; else cc[(r() * 3) | 0] = 1.2; }
    C[0][o] = cc[0]; C[1][o] = cc[1]; C[2][o] = cc[2];
  }
  // ---- 3) subpíxeles: cada píxel con su estructura física
  await prog(0.3, 'Subpíxeles…');
  const out = new Uint8ClampedArray(N * 4);
  const vis = smooth(1.6, 5, pitch) * Math.min(1, kk * 1.2);
  const ae = Math.min(0.45, 1.8 / pitch);
  const bar = (u, a, b) => smooth(a - ae, a + ae, u) * (1 - smooth(b - ae, b + ae, u));
  const disk = (dx, dy, rad) => 1 - smooth(rad - ae, rad + ae, Math.hypot(dx, dy));
  const curve = def(D.curve, 0) * kk, conv = def(D.converge, 0) * kk, echo = def(D.echo, 0) * kk, jit = def(D.jitter, 0) * kk;
  const cxw = w / 2, cyh = h / 2;
  const at = (c, fx, fy) => C[c][clamp(fy | 0, 0, lh - 1) * lw + clamp(fx | 0, 0, lw - 1)];
  const fl = lerp(1, def(D.floor, 0.5), k1), expoM = 1 / (fl + (1 - fl) * 0.42);
  const gG = D.layout === 'stripe' ? 3 / ((1 - D.gap) * (1 - (D.gapV || 0))) : D.layout === 'crt' ? 3 / (1 - D.gap) * 1.25 : D.layout === 'led' ? 5.5 : 2.6;
  const jitRow = new Float32Array(lh); for (let i = 0; i < lh; i++) jitRow[i] = (hashi(i, 7, S.seed) - 0.5) * jit + Math.sin(i * 0.05 + r() * 6) * jit * 0.5;
  const grain = D.grain ? 0.05 * kk : 0;
  for (let y = 0; y < h; y++) {
    if ((y & 511) === 0) await prog(0.3 + 0.35 * y / h, 'Subpíxeles…');
    for (let x = 0; x < w; x++) {
      let X = x, Y = y;
      if (curve) { const u = (x - cxw) / cxw, v = (y - cyh) / cyh, rr = u * u + v * v; X = cxw + u * (1 + curve * rr) * cxw; Y = cyh + v * (1 + curve * rr) * cyh; }
      const j = (y * w + x) * 4;
      if (X < 0 || Y < 0 || X >= w || Y >= h) { out[j] = out[j + 1] = out[j + 2] = 6; out[j + 3] = 255; continue; }
      let sx = X / pitch; const sy = Y / pitch;
      if (jit) sx += jitRow[clamp(sy | 0, 0, lh - 1)];
      const ix = Math.floor(sx), iy = sy | 0, fx = sx - ix, fy = sy - iy;
      const base = [at(0, sx - conv, sy), at(1, sx, sy), at(2, sx + conv, sy + conv * 0.5)];
      if (echo) for (let c = 0; c < 3; c++) base[c] = base[c] * (1 - echo) + at(c, sx - 2.5, sy) * echo;   // eco de la señal
      const m = [0, 0, 0];
      let sub = true;
      if (D.layout === 'stripe') {
        const gv = (D.gapV || 0) / 2, g = D.gap / 2, row = bar(fy, gv, 1 - gv);
        for (let c = 0; c < 3; c++) m[c] = bar(fx * 3 - c, g, 1 - g) * row;
      } else if (D.layout === 'pentile') {
        const dg = Math.hypot((fx - 0.72) / 0.2, (fy - 0.5) / 0.26);
        m[1] = 1 - smooth(1 - ae * 3, 1 + ae * 3, dg);
        const dd = (Math.abs(fx - 0.27) + Math.abs(fy - 0.5)) / 0.36, rb = 1 - smooth(1 - ae * 3, 1 + ae * 3, dd);
        // rojo y azul se comparten entre vecinos: su valor es la media de los dos píxeles que los usan
        if (((ix + iy) & 1) === 0) m[0] = rb * 1.9; else m[2] = rb * 1.9;
        if (m[0]) base[0] = (base[0] + at(0, sx - 1, sy)) / 2; if (m[2]) base[2] = (base[2] + at(2, sx - 1, sy)) / 2;
      } else if (D.layout === 'crt') {
        const l = base[0] * 0.3 + base[1] * 0.59 + base[2] * 0.11, sig = 0.2 + 0.2 * clamp(l, 0, 1.2);
        const scan = Math.exp(-((fy - 0.5) * (fy - 0.5)) / (2 * sig * sig));
        for (let c = 0; c < 3; c++) m[c] = bar(fx * 3 - c, D.gap / 2, 1 - D.gap / 2) * scan;
      } else if (D.layout === 'led') {
        // paquete SMD redondo con 3 chips (R arriba-izquierda, G arriba-derecha, B abajo); visera encima
        const dx = fx - 0.5, dy = fy - 0.54, pk = disk(dx, dy, 0.37);
        m[0] = disk(fx - 0.42, fy - 0.46, 0.085) + pk * 0.12; m[1] = disk(fx - 0.58, fy - 0.46, 0.085) + pk * 0.12; m[2] = disk(fx - 0.5, fy - 0.62, 0.085) + pk * 0.12;
        const visor = smooth(0.18, 0.02, fy) * 0.08;   // la visera: un borde gris arriba de cada fila
        base.push(visor, pk);
      } else { sub = false; }        // tinta electrónica: sin subpíxeles a la vista
      for (let c = 0; c < 3; c++) {
        let v;
        if (D.layout === 'led') {
          // el chip de su color brilla fuerte; el difusor del paquete deja ver el color mezclado; entre LEDs, negro
          const ledV = base[c] * (Math.min(1, m[c]) * 1.5 + base[4] * 0.95) * 1.25 + base[3];
          v = lerp(base[c], ledV, Math.min(1, kk * 1.3));
        } else if (sub) v = lerp(base[c], base[c] * (fl + (1 - fl) * Math.min(1.9, m[c] * gG)) * expoM, vis);
        else v = base[c];
        if (grain) v *= 1 + (hashi(x >> 1, y >> 1, 77) - 0.5) * grain;
        out[j + c] = 255 * v;
      }
      out[j + 3] = 255;
    }
  }
  // ---- 4) luz: bloom de lo brillante (fósforos, LEDs), halation del cristal del tubo y nitidez óptica
  const tmp = new Float32Array(N), ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let o = 0; o < N; o++) { ch[0][o] = out[o * 4]; ch[1][o] = out[o * 4 + 1]; ch[2][o] = out[o * 4 + 2]; }
  const shot = st.luz !== 'ninguna' || ['movil', 'movil_antiguo', 'analogica'].indexOf(st.calidad) >= 0;
  const optic = pitch * (D.layout === 'led' ? 0.05 : 0.06) * (shot ? 1.3 : 1);
  if (def(D.glow, 0) > 0) {
    const gk = D.glow * kk;
    for (let c = 0; c < 3; c++) {
      const g = new Float32Array(ch[c]); gaussBlur(g, w, h, pitch * (D.layout === 'led' ? 0.9 : 2.2), tmp);
      const hal = D.layout === 'crt' ? new Float32Array(ch[c]) : null; if (hal) gaussBlur(hal, w, h, longS / 60, tmp);
      if (optic > 0.45) gaussBlur(ch[c], w, h, optic, tmp);
      for (let o = 0; o < N; o++) ch[c][o] += Math.max(0, g[o] - 70) * gk * 0.9 + (hal ? hal[o] * gk * 0.07 : 0);
    }
  } else if (optic > 0.45) for (let c = 0; c < 3; c++) gaussBlur(ch[c], w, h, optic, tmp);
  // ---- 5) defectos del panel: fugas de luz, brillo IPS, mura, viñeta del tubo, nieve
  const bseed = (r() * 1e5) | 0, bc = longS / 7, mc = longS / 5;
  const bleedK = def(D.bleed, 0) * kk, ipsK = def(D.ipsGlow, 0) * kk, vig = def(D.vig, 0) * kk, mura = def(D.mura, 0) * kk;
  const E = (bleedK || ipsK) ? lowField(w, h, 8, (x, y) => {
    const u = x / w, v = y / h, de = Math.min(u, v, 1 - u, 1 - v);
    let add = 0;
    if (bleedK) add += bleedK * 90 * Math.exp(-de / 0.05) * smooth(0.35, 0.8, fbm2(x / bc, y / bc, bseed));
    if (ipsK) { const dc = Math.min(Math.hypot(u, v), Math.hypot(1 - u, v), Math.hypot(u, 1 - v), Math.hypot(1 - u, 1 - v)); add += ipsK * 70 * Math.exp(-dc / 0.22); }
    return add;
  }) : null;
  const M = mura ? lowField(w, h, 8, (x, y) => 1 + mura * ((fbm2(x / mc, y / mc, bseed + 5) - 0.5) * 2 + (vnoise(x / (mc * 0.25), y / (mc * 3), bseed + 9) - 0.5) * 0.6)) : null;
  const snow = def(D.snow, 0) * kk;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x, j = o * 4;
    const add = E ? E(x, y) : 0;
    let vf = M ? M(x, y) : 1;
    if (vig) { const rx = (x - w / 2) / (w / 2), ry = (y - h / 2) / (h / 2); vf *= 1 - vig * Math.pow((rx * rx + ry * ry) / 2, 1.4); }
    const sn = snow ? (hashi(x >> 1, y, 91) - 0.5) * snow * 2 : 0;
    for (let c = 0; c < 3; c++) {
      const v0 = ch[c][o], darkK = 1 - Math.min(1, v0 / 160);
      out[j + c] = (v0 + add * darkK * (c === 2 ? 1.08 : c === 0 ? 0.95 : 1)) * vf + sn;
    }
  }
  if (!withArt) return { rgba: new Uint8Array(out.buffer), S };
  // ---- 6) vidrio delante, si se eligió
  await applyOverlay(S, st, out, assets, prog);
  // ---- 7) fotografiar la pantalla
  if (shot) { await prog(0.85, 'Fotografiando la pantalla…'); screenShot(S, st, out, D, pitch, kk); }
  const cal = ['movil', 'movil_antiguo', 'analogica'].indexOf(st.calidad) >= 0 ? st.calidad : 'perfecta';
  // la pantalla ya pixela y difumina: la foto desenfoca la mitad para que el texto siga leyéndose
  if (cal !== 'perfecta') quality(S, Object.assign({}, st, { _soft: 0.5 }), out, cal, k);
  else if (def(st.encuadre, 0) > 0) captureGeometry(S, st, out, {}, k);
  await prog(1, 'Listo');
  return { rgba: new Uint8Array(out.buffer) };
}

function screenShot(S, st, px, D, pitch, kk) {
  const { w, h } = S, longS = Math.max(w, h), half = Math.hypot(w, h) / 2;
  const r = rng((S.seed + (def(st.seedFoto, 0) | 0) * 7717) * 11 + 3);
  const luz = st.luz || 'ninguna', gloss = D.gloss;
  // moiré: la rejilla de la pantalla y la del sensor «baten». Dos familias de franjas (filas y columnas de la
  // pantalla) casi perpendiculares, de colores en las pantallas con tira RGB, curvadas por el objetivo y la
  // perspectiva, y más fuertes donde la cámara enfoca mejor. Cuanto más pequeño el píxel, más moiré.
  const mA = def(D.moire, 0) * kk * 0.07 * (0.45 + 0.55 * smooth(10, 2.5, pitch));
  const colored = D.layout === 'stripe' || D.layout === 'pentile' || D.layout === 'crt';
  const fr = [];
  for (let i = 0; i < 2; i++) {
    const th = (i ? Math.PI / 2 : 0) + (r() - 0.5) * 0.5;
    fr.push({ ca: Math.cos(th), sa: Math.sin(th), per: longS * lerp(0.01, 0.035, r()), x0: r() * w, y0: r() * h, bend: lerp(-2, 2, r()), a: i ? 0.7 : 1 });
  }
  const fseed = (r() * 1e5) | 0, fsc = longS / 3;
  const MA = mA ? lowField(w, h, 8, (x, y) => mA * smooth(0.2, 0.75, fbm2(x / fsc, y / fsc, fseed))) : null;
  // bandas del obturador (PWM / barrido): horizontales, con una más marcada
  const bA = def(D.bands, 0) * kk * 0.6 * lerp(0.7, 1.25, r()), bPer = h / lerp(1.8, 7.5, r()), bPh = r() * 6.28;
  const bTilt = (r() - 0.5) * 0.12, bSharp = lerp(2, 5, r()), bBig = lerp(0.3, 0.9, r()), bWob = lerp(0, 0.025, r()) * h, bWf = lerp(1, 3, r()) / w;
  // reflejos en el cristal según la luz
  const lamp = luz === 'lampara' || luz === 'foco', flash = luz === 'flash', me = luz === 'sombra', day = luz === 'dia' || luz === 'ventana';
  const lx = lerp(0.2, 0.8, r()) * w, ly = lerp(0.15, 0.45, r()) * h;
  const fx = (0.5 + (r() - 0.5) * 0.15) * w, fy = (0.45 + (r() - 0.5) * 0.15) * h;
  const sc = longS / 6, ss = (r() * 1e5) | 0, sm = longS / 14;
  const lightAt = (x, y) => {
    let veil = 0.03 * kk, refl = 0;
    if (lamp) { const d = Math.hypot(x - lx, y - ly) / half; refl += (gloss * 0.9 * Math.exp(-Math.pow(d / (0.08 + 0.25 * (1 - gloss)), 2)) + 0.25 * Math.exp(-d / 0.5)) * kk; veil += 0.08 * kk; }
    if (flash) { const d = Math.hypot(x - fx, y - fy) / half; refl += (gloss * 1.4 * Math.exp(-Math.pow(d / (0.045 + 0.2 * (1 - gloss)), 2)) + 0.35 * Math.exp(-d / 0.3)) * kk; veil += 0.05 * kk; }
    if (day) { const u = x / w; refl += 0.18 * kk * smooth(0.35, 0.0, u) * (0.6 + 0.4 * gloss); veil += 0.1 * kk; }
    if (me) {
      const u = (x - w * 0.5) / w, v = (y - h * 0.62) / h;
      const head = Math.hypot(u / 0.14, (v + 0.12) / 0.18), body = Math.hypot(u / 0.38, (v - 0.32) / 0.3);
      refl += (smooth(1.2, 0.8, head) + smooth(1.15, 0.85, body)) * 0.22 * kk; veil += 0.12 * kk;
    }
    const smudge = smooth(0.45, 0.8, fbm2(x / sm, y / sm * 0.6, ss)) * 0.8 + 0.2 * fbm2(x / sc, y / sc, ss + 1);
    return [veil, refl * (0.85 + 0.3 * smudge)];
  };
  const FV = lowField(w, h, 6, (x, y) => lightAt(x, y)[0]), FR = lowField(w, h, 6, (x, y) => lightAt(x, y)[1]);
  // pantalla que refleja (tinta electrónica): la luz de la habitación la ilumina como a un papel
  const amb = D.reflective ? (lamp ? [1.08, 0.97, 0.8] : flash ? [0.98, 1.0, 1.04] : day ? [0.97, 1.0, 1.03] : [0.92, 0.92, 0.92]) : null;
  const AF = D.reflective ? lowField(w, h, 8, (x, y) => {
    if (flash) { const d = Math.hypot(x - fx, y - fy) / half; return lerp(1, 1.15 / Math.pow(1 + d * d / 0.5, 2), kk); }
    if (lamp) { const d = Math.hypot(x - lx, y - ly) / half; return lerp(1, 1.12 / Math.pow(1 + d * d / 0.4, 1.4), kk); }
    if (me) { const u = (x - w * 0.5) / w, v = (y - h * 0.9) / h; return 1 - 0.4 * kk * smooth(1.2, 0.6, Math.hypot(u / 0.3, v / 0.35)); }
    return 1;
  }) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // las bandas no son rectas del todo: algo inclinadas y onduladas, distintas en cada versión
      const yb = y + x * bTilt + Math.sin(x * bWf * 6.283) * bWob;
      const ph0 = 2 * Math.PI * yb / bPer + bPh;
      const band = bA ? 1 - bA * Math.pow(0.5 + 0.5 * Math.cos(ph0), bSharp) - bA * bBig * Math.pow(0.5 + 0.5 * Math.cos(ph0 * 0.5), 12) : 1;
      const j = (y * w + x) * 4;
      const veil = FV(x, y), refl = FR(x, y), ma = MA ? MA(x, y) : 0;
      let p0 = 0, p1 = 0;
      if (ma) {
        const nx = x / longS - 0.5, ny = y / longS - 0.5;
        const f0 = fr[0], f1 = fr[1];
        p0 = 2 * Math.PI * (((x - f0.x0) * f0.ca + (y - f0.y0) * f0.sa) / f0.per + f0.bend * (nx * nx + ny * ny) * 8);
        p1 = 2 * Math.PI * (((x - f1.x0) * f1.ca + (y - f1.y0) * f1.sa) / f1.per + f1.bend * (nx * nx - ny * ny) * 8);
      }
      const af = AF ? AF(x, y) : 1;
      for (let c = 0; c < 3; c++) {
        let v = px[j + c] * band;
        if (amb) v *= amb[c] * af;
        if (ma) v *= 1 + ma * (Math.cos(p0 + (colored ? c * 2.094 : 0)) + fr[1].a * Math.cos(p1 + (colored ? c * 2.094 : 0)) * 0.6);
        v += (255 - v) * Math.min(0.9, refl) + 255 * veil * (1 - v / 255) * 0.6;
        px[j + c] = v;
      }
    }
  }
}

// ================================================================ API: PAPEL DE FONDO
async function renderPaper(opts) {
  const { w, h, ppm, state, assets } = opts;
  const prog = opts.onProgress || (async () => {});
  await catalogs(assets);
  const st = Object.assign({}, P.DEFAULT_STATE, state || {});
  if (isScreen(st)) return renderScreen(opts, st, false);     // pantalla encendida en blanco, para trabajar encima
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
  B.border = await genBorde(S, st, assets, B);
  if (B.border && !st._final) {
    // papel de fondo: la hoja ya recortada (alfa), con el contorno doblado por los pliegues
    // (con su sombra debajo, también transparente: se ve sobre lo que pongas detrás)
    const BR = B.border, FD = B.fold, alb = B.alb, o6 = [0, 0, 0, 0, 0, 0], cx = w / 2, cy = h / 2, pk = FD ? FD.panelK : 0;
    const Aw = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (pk) { const z = FD.panel(x, y) * pk; sx -= (x - cx) * z; sy -= (y - cy) * z; }
      borderAt(BR, w, h, sx, sy, o6);
      const j = (y * w + x) * 4, Cc = o6[5];
      for (let c = 0; c < 3; c++) alb[j + c] = lerp(alb[j + c], BR.core[c], Cc) * o6[1 + c];
      Aw[y * w + x] = o6[0];
    }
    const sh = sheetShadow(S, st, Aw);
    for (let o = 0; o < N; o++) {
      const a = Aw[o], A2 = a + sh[o] * (1 - a), j = o * 4;
      if (A2 > 0.002) { const f = a / A2; alb[j] *= f; alb[j + 1] *= f; alb[j + 2] *= f; }
      alb[j + 3] = A2 * 255;
    }
  }
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
  ventana: { lx: -0.95, ly: 0.3, rk: 1.3, fk: 1.4, tex: 1.2 },
  foco: { lx: -0.2, ly: -0.6, rk: 0.6, fk: 0.75, tex: 1.0 },
  flash: { lx: 0, ly: -0.3, rk: 0.1, fk: 0.25, tex: 0.78 },
  sombra: { lx: -0.3, ly: -0.9, rk: 0.35, fk: 0.55, tex: 0.92 },
  lampara: { lx: 0.85, ly: -0.55, rk: 1.1, fk: 1.2, tex: 1.12 }
};
function lightDir(id) { const L = LIGHT[id] || LIGHT.ninguna; const n = Math.hypot(L.lx, L.ly) || 1; return [L.lx / n, L.ly / n, L]; }

// ================================================================ API: APLICAR (render final)
async function renderFinal(opts) {
  const { w, h, ppm, assets, art, artComponents } = opts;
  const prog = opts.onProgress || (async () => {});
  const st0 = Object.assign({}, P.DEFAULT_STATE, opts.state || {});
  await catalogs(assets);
  if (isScreen(st0)) return renderScreen(opts, st0, true);
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
  const scale = clamp(def(st.scale, 1), 0.04, 10);
  const reliefK = clamp(def(paper.rough, 0.02) / 0.03, 0.2, 3) * def(paper.reliefAdj, 1);
  const Hs = new Float32Array(N), tmp = new Float32Array(N);
  const tk = 1 / (S.texK || 1);
  for (let o = 0; o < N; o++) Hs[o] = D[o] * tk;
  const gSig = clamp(def(paper.grainMm, 0.12) * scale * ppm * 0.85, 0.7, 10);
  gaussBlur(Hs, w, h, gSig, tmp);
  let g2 = 0, gn = 0;
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) { const o = y * w + x; const gx = Hs[o + 1] - Hs[o - 1], gy = Hs[o + w] - Hs[o - w]; g2 += gx * gx + gy * gy; gn++; }
  const ginv = 1 / (Math.sqrt(g2 / Math.max(1, gn)) || 1e-4);
  // superficies construidas: relieve grande (juntas, grumos, poros) que rompe y desvía la tinta, y que la luz revela
  let Hb = null, gbInv = 1, dispB = 0, rkB = 0;
  if (paper.dispMm) {
    Hb = new Float32Array(N);
    for (let o = 0; o < N; o++) Hb[o] = D[o] * tk;
    gaussBlur(Hb, w, h, Math.max(0.8, def(paper.heightMm, 0.6) * ppm * scale), tmp);
    let b2 = 0, bn = 0;
    for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) { const o = y * w + x; const a = Hb[o + 1] - Hb[o - 1], c = Hb[o + w] - Hb[o - w]; b2 += a * a + c * c; bn++; }
    gbInv = 1 / (Math.sqrt(b2 / Math.max(1, bn)) || 1e-4);
    dispB = paper.dispMm * ppm * Math.pow(scale, 0.8) * clamp(def(st.grain, 1), 0, 4) * Math.pow(kk, 0.8) * 0.3;
  }
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
  if (Hb) rkB = (0.025 + Lp.rk * 0.06) * kk * Math.min(2, paper.dispMm);
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
  // superficies: lo que se pinta en una pared es pintura que tapa (si no, en un ladrillo oscuro no se lee nada);
  // tapa más cuanto más oscura es la superficie, y la textura sigue viéndose como luces y sombras
  let opq = 0, sL = 1;
  if (paper.material === 'surface' && inkMode === 'multiply') {
    let sm = 0, n = 0; for (let o = 0; o < N; o += 53) { const q = o * 4; sm += alb[q] * 0.2126 + alb[q + 1] * 0.7152 + alb[q + 2] * 0.0722; n++; }
    sL = Math.max(8, sm / Math.max(1, n));
    opq = clamp(0.45 + 0.5 * (1 - sL / 235), 0.45, 0.9);
  }
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
  const BR = B.border, b6 = [0, 0, 0, 0, 0, 0], Afin = BR ? new Float32Array(N) : null;
  await prog(0.55, 'Imprimiendo en el papel…');
  for (let y = 1; y < h - 1; y++) {
    if ((y & 255) === 0) await prog(0.55 + 0.25 * y / h, 'Imprimiendo en el papel…');
    for (let x = 1; x < w - 1; x++) {
      const o = y * w + x, j = o * 4;
      // gradiente del relieve del papel (dirección en la que la tinta "resbala" hacia los valles)
      const gx = (Hs[o + 1] - Hs[o - 1]) * ginv, gy = (Hs[o + w] - Hs[o - w]) * ginv;
      let sx = x - gx * disp, sy = y - gy * disp;
      if (camK) { const f = F[o]; sx -= f * (x - cxp) * camK / ppm; sy -= f * (y - cyp) * camK / ppm; }
      if (FD) {
        FD.sample(x, y, fq); sx -= fq[1] * fDisp; sy -= fq[1] * fDisp * 0.65;
        if (FD.panelK) { const z = FD.panel(x, y) * FD.panelK; sx -= (x - cxp) * z; sy -= (y - cyp) * z; }
      }
      let gbx = 0, gby = 0;
      if (Hb) {
        gbx = (Hb[o + 1] - Hb[o - 1]) * gbInv; gby = (Hb[o + w] - Hb[o - w]) * gbInv;
        sx -= clamp(gbx, -3, 3) * dispB; sy -= clamp(gby, -3, 3) * dispB;
      }
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
      if (inkMode === 'multiply') {
        r = pr * (1 - a0 * cover); g = pg * (1 - a1 * cover); b = pb * (1 - a2 * cover);
        if (opq > 0 && al > 0.003) {
          const tm = Math.pow(clamp((pr * 0.2126 + pg * 0.7152 + pb * 0.0722) / sL, 0.45, 1.5), 0.55);
          const t = opq * al * cover * Math.min(1, (a0 + a1 + a2) / Math.max(0.05, 3 * al) * 3);
          r = lerp(r, cA[0] * 255 * tm, t); g = lerp(g, cA[1] * 255 * tm, t); b = lerp(b, cA[2] * 255 * tm, t);
        }
      }
      else { const t = al * cover, dd = 1 + D[o] * 0.6; r = lerp(pr, cA[0] * 255 * dd, t); g = lerp(pg, cA[1] * 255 * dd, t); b = lerp(pb, cA[2] * 255 * dd, t); }
      // lo que se vería sin efectos (para intensidades bajas)
      const o0 = (y * w + x) * comps, al0 = comps === 4 ? art[o0 + 3] / 255 : 1;
      const b0r = lerp(alb[j], art[o0], al0), b0g = lerp(alb[j + 1], art[o0 + 1], al0), b0b = lerp(alb[j + 2], art[o0 + 2], al0);
      r = lerp(b0r, r, mixK); g = lerp(b0g, g, mixK); b = lerp(b0b, b, mixK);
      // la luz de la foto revela el relieve del grano y la forma de la hoja
      let shade = 1;
      if (rk) shade += clamp(-(gx * Lx + gy * Ly) * rk, -0.12, 0.12);
      if (Hb) shade += clamp(-(gbx * Lx + gby * Ly) * rkB, -0.25, 0.2);
      if (fk) shade += clamp(-((F[o + 1] - F[o - 1]) * Lx + (F[o + w] - F[o - w]) * Ly) * 0.5 * ppm * fk * 0.06, -0.14, 0.14);
      if (Cb && rk) shade += clamp(((Cb[o + 1] - Cb[o - 1]) * Lx + (Cb[o + w] - Cb[o - w]) * Ly) * 0.06 * kk, -0.05, 0.05);
      if (FD) shade *= clamp(1 + fq[0] * fShK, 0.3, 1.6);
      let alpha = 255;
      if (BR) {
        // borde de la hoja leído donde cae la tinta (sigue pliegues, forma de la hoja y cámara): el alma clara que
        // asoma no lleva tinta, y el filo trae sus sombras y su tostado
        borderAt(BR, w, h, sx, sy, b6);
        const K = b6[4], Cc = b6[5];
        if (K > 0.004) { r = lerp(r, alb[j], K); g = lerp(g, alb[j + 1], K); b = lerp(b, alb[j + 2], K); }
        if (Cc > 0.004) { r = lerp(r, BR.core[0], Cc); g = lerp(g, BR.core[1], Cc); b = lerp(b, BR.core[2], Cc); }
        r *= b6[1]; g *= b6[2]; b *= b6[3]; Afin[o] = b6[0];
      }
      out[j] = r * shade; out[j + 1] = g * shade; out[j + 2] = b * shade; out[j + 3] = alpha;
    }
  }
  // bordes de 1 px
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const j = (y * w + x) * 4, jj = ((y === 0 ? 1 : h - 2) * w + clamp(x, 1, w - 2)) * 4; out[j] = out[jj]; out[j + 1] = out[jj + 1]; out[j + 2] = out[jj + 2]; out[j + 3] = out[jj + 3]; }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const j = (y * w + x) * 4, jj = (y * w + (x === 0 ? 1 : w - 2)) * 4; out[j] = out[jj]; out[j + 1] = out[jj + 1]; out[j + 2] = out[jj + 2]; out[j + 3] = out[jj + 3]; }
  // con borde: la hoja (y su sombra) sobre la mesa blanca; el resultado es una imagen entera
  if (BR) {
    for (let x = 0; x < w; x++) { Afin[x] = Afin[w + x]; Afin[(h - 1) * w + x] = Afin[(h - 2) * w + x]; }
    for (let y = 0; y < h; y++) { Afin[y * w] = Afin[y * w + 1]; Afin[y * w + w - 1] = Afin[y * w + w - 2]; }
    const sh = sheetShadow(S, st, Afin), bg = [250, 250, 248];
    S.bgFill = bg;
    for (let o = 0; o < N; o++) {
      const a = Afin[o], j = o * 4, t = (1 - a) * (1 - sh[o]);
      out[j] = out[j] * a + bg[0] * t; out[j + 1] = out[j + 1] * a + bg[1] * t; out[j + 2] = out[j + 2] * a + bg[2] * t; out[j + 3] = 255;
    }
  }
  await prog(0.82, 'Fotografiando…');
  await applyOverlay(S, st, out, assets, prog);
  photo(S, st, out, B, paper);
  await prog(1, 'Listo');
  return { rgba: new Uint8Array(out.buffer) };
}

// ================================================================ SOBREPONER (vidrio, cristal, plástico delante)
// El vidrio está a una DISTANCIA del papel (slider): lo de detrás se ve desviado en proporción a la pendiente del
// vidrio por esa distancia (refracción). Pegado al papel apenas deforma; al alejarlo, cada caña de un acanalado
// comprime e invierte la imagen, cada gota de lluvia es una lentecita, y el esmerilado desenfoca cada vez más.
// Encima, el vidrio devuelve luz (reflejos de la propia foto de la textura), tiñe un poco, y puede llevar malla
// metálica (armado) y suciedad (huellas, grasa, polvo).
async function applyOverlay(S, st, px, assets, prog) {
  const fam = st.sobre || 'ninguno';
  const cat = cache.overlays && cache.overlays[fam];
  if (!cat || !cat.items || !cat.items.length) return;
  const { w, h, ppm, N } = S;
  const kk = clamp(S.k, 0, 2), k1 = Math.min(1, kk);
  if (kk <= 0) return;
  const n = cat.items.length, it = cat.items[(((def(st.sobreVar, 0) | 0) % n) + n) % n];
  const RI = await loadImg(assets, 'overlays/' + it.r), NI = await loadImg(assets, 'overlays/' + it.n);
  const MI = it.m ? await loadImg(assets, 'overlays/' + it.m) : null;
  const tw = RI.width, th = RI.height;
  const dist = clamp(def(st.sobreDist, 0.25), 0, 1) * 40;                       // mm entre vidrio y papel
  const refl = clamp(def(st.sobreRefl, 1), 0, 3) * def(cat.refl, 0.35) * k1;
  const dirt = cat.dirt ? clamp(def(st.sobreDirt, 0.25), 0, 1) * k1 : 0;
  // transparencia: 1 = vidrio limpio; al bajarla el vidrio está gastado (velo lechoso, arañazos, rozaduras)
  const wear = (1 - clamp(def(st.sobreTrans, 1), 0, 1)) * Math.min(1.3, kk);
  const scale = clamp(def(st.sobreScale, 1), 0.25, 4);
  const sxT = tw / (it.tileMm[0] * scale * ppm), syT = th / (it.tileMm[1] * scale * ppm);   // px de textura por px
  const r = rng((S.seed + (def(st.sobreVar, 0) | 0) * 31) * 7 + 3);
  const ox = r() * tw, oy = r() * th;
  const wrap = (v, m) => { v %= m; return v < 0 ? v + m : v; };
  const bil = (img, ch, u, v) => {
    u = wrap(u, img.width); v = wrap(v, img.height);
    const W = img.width, Hh = img.height, c = img.channels, d = img.data;
    const x0 = u | 0, y0 = v | 0, x1 = x0 + 1 < W ? x0 + 1 : 0, y1 = y0 + 1 < Hh ? y0 + 1 : 0, fx = u - x0, fy = v - y0;
    const a = d[(y0 * W + x0) * c + ch], b = d[(y0 * W + x1) * c + ch], e = d[(y1 * W + x0) * c + ch], f = d[(y1 * W + x1) * c + ch];
    return ((a + (b - a) * fx) * (1 - fy) + (e + (f - e) * fx) * fy) / 255;
  };
  await prog(0.84, 'Vidrio delante…');
  // ---- 1) refracción: lo de detrás, desviado (con una pizca de dispersión de color en el vidrio)
  const D = dist * ppm * 0.55 * def(cat.refr, 0.6) * Math.sqrt(kk);
  const disp = fam === 'plastico' ? 0 : 0.012;
  if (D > 0.05) {
    const src = new Uint8ClampedArray(px);
    const samp = (sx, sy, c) => {
      sx = sx < 0 ? 0 : sx > w - 1.001 ? w - 1.001 : sx; sy = sy < 0 ? 0 : sy > h - 1.001 ? h - 1.001 : sy;
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, o = (iy * w + ix) * 4 + c;
      return (src[o] * (1 - fx) + src[o + 4] * fx) * (1 - fy) + (src[o + w * 4] * (1 - fx) + src[o + w * 4 + 4] * fx) * fy;
    };
    for (let y = 0; y < h; y++) {
      if ((y & 511) === 0) await prog(0.84 + 0.04 * y / h, 'Vidrio delante…');
      const v = oy + y * syT;
      for (let x = 0; x < w; x++) {
        const u = ox + x * sxT;
        const gx = (bil(NI, 0, u, v) * 255 - 128) / 126, gy = (bil(NI, 1, u, v) * 255 - 128) / 126;
        const j = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const dk = D * (1 + (c - 1) * disp);
          px[j + c] = samp(x - gx * dk, y - gy * dk, c);
        }
      }
    }
  }
  // ---- 2) difusión: el esmerilado (y un poco cualquier vidrio rugoso) desenfoca más cuanto más lejos está el papel
  // el vidrio gastado también difunde: microarañazos que abren la luz (más cuanto más lejos está el papel)
  const sig = (def(cat.frost, 0) + 0.45 * wear * wear) * (dist * ppm * 0.11 + 0.15 * ppm) * Math.sqrt(kk) + wear * wear * 0.3 * ppm;
  if (sig > 0.5) {
    const tmp = new Float32Array(N), ch = new Float32Array(N);
    for (let c = 0; c < 3; c++) {
      for (let o = 0; o < N; o++) ch[o] = px[o * 4 + c];
      gaussBlur(ch, w, h, sig, tmp);
      for (let o = 0; o < N; o++) px[o * 4 + c] = ch[o];
    }
  }
  // ---- 3) suciedad sobre el vidrio: huellas de dedos, grasa y polvo (difunden luz: velo claro)
  let haze = null, hw = 0, hh = 0;
  const hf = 4;
  if (dirt > 0 && cache.imperf) {
    hw = Math.ceil(w / hf); hh = Math.ceil(h / hf); haze = new Float32Array(hw * hh);
    const pmm = ppm / hf;
    const stamp = async (cid, count, mmA, mmB, strength) => {
      const C = cache.imperf[cid]; if (!C || !C.items) return;
      for (let i = 0; i < count; i++) {
        const itm = C.items[(r() * C.items.length) | 0], img = await loadImg(assets, 'imperf/' + itm.file);
        const sizePx = lerp(mmA, mmB, r()) * pmm, sc = sizePx / Math.max(img.width, img.height);
        const cx = r() * hw, cy = r() * hh, rot = r() * 6.283, ca = Math.cos(rot), sa = Math.sin(rot), st2 = strength * lerp(0.5, 1, r());
        const ext = Math.ceil(sizePx * 0.75);
        for (let yy = Math.max(0, (cy - ext) | 0); yy < Math.min(hh, cy + ext); yy++) for (let xx = Math.max(0, (cx - ext) | 0); xx < Math.min(hw, cx + ext); xx++) {
          const dx = (xx - cx) / sc, dy = (yy - cy) / sc;
          const u = dx * ca + dy * sa + img.width / 2, v = -dx * sa + dy * ca + img.height / 2;
          if (u < 0 || v < 0 || u >= img.width - 1 || v >= img.height - 1) continue;
          const o = ((v | 0) * img.width + (u | 0)) * img.channels;
          const dd = 1 - (img.data[o] + img.data[o + (img.channels > 1 ? 1 : 0)] + img.data[o + (img.channels > 2 ? 2 : 0)]) / 765;
          haze[yy * hw + xx] += dd * st2;
        }
      }
    };
    await stamp('huella_grasa', Math.round(2 + 6 * dirt), 16, 24, 1.6);      // dedos
    await stamp('grasa', Math.round(1 + 2 * dirt), 40, 80, 0.5);            // limpiado a medias
    for (let i = 0, nd = Math.round(400 * dirt * (w * h) / (2480 * 3508)); i < nd; i++) {   // motas de polvo
      const xx = (r() * hw) | 0, yy = (r() * hh) | 0; haze[yy * hw + xx] += lerp(0.3, 1, r());
    }
    gaussBlur(haze, hw, hh, 0.8, new Float32Array(hw * hh));
  }
  // ---- 3b) desgaste: arañazos (líneas finas que dispersan la luz) y rozaduras (zonas mates a manchas)
  let SC = null, scuff = null;
  if (wear > 0.01) {
    SC = new Float32Array(N);
    const area = (w * h) / (2480 * 3508);
    // grupos de arañazos paralelos (al limpiar o deslizar algo encima) y arañazos sueltos
    const groups = Math.round((4 + 22 * wear) * Math.max(0.3, area)), loose = Math.round((30 + 420 * wear) * Math.max(0.3, area));
    const line = (x0, y0, ang, len, v, curv) => {
      const steps = Math.max(2, Math.round(len)); let x = x0, y = y0, a = ang;
      for (let i = 0; i < steps; i++) {
        const fade = Math.sin(Math.PI * i / steps);            // empiezan y acaban finos
        const xi = x | 0, yi = y | 0;
        if (xi >= 0 && yi >= 0 && xi < w && yi < h) { const o = yi * w + xi, vv = v * (0.4 + 0.6 * fade) * (0.6 + 0.4 * r()); if (vv > SC[o]) SC[o] = vv; }
        a += curv; x += Math.cos(a); y += Math.sin(a);
      }
    };
    for (let g = 0; g < groups; g++) {
      const cx = r() * w, cy = r() * h, ang = r() * Math.PI, nl = 3 + ((r() * 12) | 0), spread = lerp(3, 18, r()) * ppm;
      for (let i = 0; i < nl; i++) {
        const off = (r() - 0.5) * spread, len = lerp(8, 70, Math.pow(r(), 1.5)) * ppm;
        line(cx - Math.sin(ang) * off + (r() - 0.5) * 10 * ppm, cy + Math.cos(ang) * off + (r() - 0.5) * 10 * ppm, ang + (r() - 0.5) * 0.06, len, lerp(0.35, 1, r()), (r() - 0.5) * 0.0015);
      }
    }
    for (let i = 0; i < loose; i++) line(r() * w, r() * h, r() * Math.PI * 2, lerp(1, 25, Math.pow(r(), 2)) * ppm, lerp(0.2, 0.8, r()), (r() - 0.5) * 0.01);
    gaussBlur(SC, w, h, Math.max(0.45, 0.04 * ppm), new Float32Array(N));
    let mx = 0; for (let o = 0; o < N; o += 7) if (SC[o] > mx) mx = SC[o];
    if (mx > 0) for (let o = 0; o < N; o++) SC[o] = Math.min(1, SC[o] / (mx * 0.55));
    const cs = 35 * ppm, ss = (S.seed * 13 + 77) | 0;
    scuff = lowField(w, h, Math.max(4, Math.round(ppm * 2)), (x, y) => smooth(0.3, 0.75, fbm2(x / cs, y / cs, ss)));
  }
  // ---- 4) tinte del vidrio, malla, reflejos y velo
  const tint = (cat.tint || [0.97, 0.975, 0.975]).map(t => 1 - (1 - t) * k1);
  const mc = it.meshColor || [1, 1, 1];
  const veil = 0.02 * k1 + 0.05 * def(cat.frost, 0) * k1;
  for (let y = 0; y < h; y++) {
    const v = oy + y * syT;
    for (let x = 0; x < w; x++) {
      const u = ox + x * sxT, j = (y * w + x) * 4;
      let rr = bil(RI, 0, u, v);
      rr = rr * refl;
      const m = MI ? bil(MI, 0, u, v) * k1 : 0;
      let hz = 0;
      if (haze) { const hx = Math.min(hw - 1, (x / hf) | 0), hy = Math.min(hh - 1, (y / hf) | 0); hz = Math.min(1, haze[hy * hw + hx]) * dirt * 0.32; }
      for (let c = 0; c < 3; c++) {
        let val = px[j + c] * tint[c];
        val += (200 - val) * veil;
        if (m > 0.01) val = val * (1 - 0.86 * m) + 70 * mc[c] * m;            // alambre de acero (u óxido)
        val += (255 - val) * Math.min(1, rr);                                   // reflejos (pantalla)
        val += (235 - val) * hz;                                                // huellas y polvo
        if (SC) {
          const sf = scuff(x, y);
          val += (226 - val) * Math.min(0.85, wear * (0.32 + 0.3 * sf));            // velo lechoso, desigual
          val += (250 - val) * Math.min(0.9, SC[y * w + x] * (0.35 + 0.45 * wear)); // arañazos
        }
        px[j + c] = val;
      }
    }
  }
}

// ================================================================ FOTOGRAFÍA
// Luz de la toma. Cada luz tiene su forma real y, si se elige, SE NOTA:
//  escáner  luz plana y fría, negros firmes, blancos casi a tope; sombra donde el papel se levanta del cristal
//  día      luz suave de cielo, algo fría, cae poco a poco hacia una esquina, la foto queda algo apagada
//  ventana  luz lateral fuerte: un lado claro, el otro en penumbra fría; sombra suave del marco de la ventana
//  lámpara  bombilla cálida (tungsteno sin corregir: naranja), charco de luz en una esquina, el resto cae a oscuro
//  foco     círculo de luz definido, fuera queda en penumbra
//  flash    centro quemado (reflejo del flash en el papel), caída rápida hacia las esquinas, frío y contrastado
//  sombra   el móvil y la mano tapan la luz: sombra blanda que entra desde abajo
const LUZ = {
  ninguna: {},
  escaner: { expo: 1.03, white: 0.975, black: 0.025, tint: [0.99, 1.0, 1.02], lift: 0.32, contrast: 0.1, scanYellow: 1 },
  dia: { expo: 0.84, white: 0.93, black: 0.05, tint: [0.965, 0.995, 1.055], grad: [0.85, -0.8, 0.26], vig: 0.3, contrast: -0.04 },
  ventana: { expo: 0.86, white: 0.93, black: 0.05, tint: [1.02, 1.0, 0.97], side: 0.58, frame: 0.22, coolShadow: 0.1, vig: 0.25, contrast: 0.06 },
  lampara: { expo: 0.9, white: 0.92, black: 0.06, tint: [1.16, 0.97, 0.66], pool: [0.92, 0.04, 0.62], poolK: 0.68, vig: 0.3, contrast: 0.05 },
  foco: { expo: 0.98, white: 0.93, black: 0.05, tint: [1.07, 1.0, 0.88], spot: [0.5, 0.42, 0.36, 0.3], outside: 0.4, vig: 0.2, contrast: 0.08 },
  flash: { expo: 1.0, white: 0.95, black: 0.05, tint: [0.97, 1.0, 1.05], hot: [0.5, 0.44], fall: 0.72, glare: 0.9, vig: 0.1, contrast: 0.05 },
  sombra: { expo: 0.88, white: 0.93, black: 0.05, tint: [0.97, 1.0, 1.04], grad: [0.1, -0.9, 0.12], phone: 0.5, vig: 0.25, contrast: 0.02 }
};
function photo(S, st, px, B, paper) {
  const { w, h } = S;
  const k = clamp(S.k, 0, 2), kl = Math.min(1.5, k);
  const luz = st.luz || 'ninguna', cal = st.calidad || 'perfecta';
  const expo = Math.pow(2, clamp(def(st.exposure, 0), -1.5, 1.5) * 0.8);
  const diag = Math.hypot(w, h), half = diag / 2;
  const L = LUZ[luz] || {};
  if (luz !== 'ninguna' || expo !== 1) {
    const r = rng((S.seed + (def(st.seedFoto, 0) | 0) * 7717) * 5 + 9);
    const jx = (r() - 0.5) * 0.12, jy = (r() - 0.5) * 0.1;
    const lerpK = (v, base) => base + (v - base) * kl;
    const tint = (L.tint || [1, 1, 1]).map(v => lerpK(v, 1));
    const white = lerpK(def(L.white, 1), 1), black = lerpK(def(L.black, 0), 0) * 255;
    const con = def(L.contrast, 0) * kl;
    const ex0 = lerpK(def(L.expo, 1), 1) * expo;
    const vig = def(L.vig, 0) * kl;
    // lado del escáner donde el papel se separa del cristal (y la ventana / lámpara: de qué lado viene la luz)
    // (la luz de ventana y lámpara viene del mismo lado que el relieve del grano: izquierda y arriba-derecha)
    const side = (L.side || L.pool) ? 1 : (r() < 0.5 ? 1 : -1);
    const E = lowField(w, h, 6, (x, y) => {
      const u = x / w, v = y / h, rx = (x - w / 2) / half, ry = (y - h / 2) / half;
      let e = 1;
      if (L.lift) {                              // escáner: el papel se levanta en un canto → sombra degradada
        const d = side > 0 ? u : 1 - u;
        e *= 1 - L.lift * kl * Math.pow(1 - smooth(0, 0.09, d), 1.6);
      }
      if (L.grad) {                              // luz de cielo: degradado amplio hacia una esquina
        const [gx, gy, gk] = L.grad, t = (rx * gx + ry * gy) / Math.hypot(gx, gy);
        e *= 1 + gk * kl * t * 0.5;
      }
      if (L.side) {                              // ventana: un lado claro, el otro en penumbra
        const t = side > 0 ? u : 1 - u;
        e *= lerp(1.12, 1 - L.side * kl, smooth(-0.1, 1.15, t));
      }
      if (L.frame) {                             // sombra blanda del marco de la ventana (cruz de travesaños)
        const fx = (side > 0 ? u : 1 - u) - (0.62 + jx), fy = v - (0.4 + jy) + 0.18 * (side > 0 ? u : 1 - u);
        const bar = Math.max(Math.exp(-fx * fx / 0.0016), Math.exp(-fy * fy / 0.0012));
        e *= 1 - L.frame * kl * bar;
      }
      if (L.pool) {                              // lámpara: charco de luz en una esquina
        const px0 = side > 0 ? L.pool[0] : 1 - L.pool[0];
        const dx = (u - px0) * w / half, dy = (v - L.pool[1]) * h / half, q = (dx * dx + dy * dy) / (L.pool[2] * L.pool[2]);
        e *= lerp(1, 1.2 / Math.pow(1 + q, 1.4), L.poolK * kl);
      }
      if (L.spot) {                              // foco: círculo de luz definido
        const [cx, cy, rxx, ryy] = L.spot, dx = (u - cx - jx) / rxx, dy = (v - cy - jy) / ryy, d = Math.sqrt(dx * dx + dy * dy);
        e *= lerp(1.06, 1 - (1 - L.outside) * kl, smooth(0.78, 1.12, d));
      }
      if (L.hot) {                               // flash: ley del cuadrado inverso + cos⁴ (caída rápida a las esquinas)
        const dx = (u - L.hot[0] - jx * 0.5) * w / half, dy = (v - L.hot[1] - jy * 0.5) * h / half;
        e *= lerp(1, 1.18 / Math.pow(1 + (dx * dx + dy * dy) / (L.fall * L.fall), 2), kl);
      }
      if (L.phone) {                             // sombra del móvil y la mano, desde abajo
        const cxp = 0.5 + jx * 2, dxp = (u - cxp) / 0.2, dyp = (v - 1.12) / 0.42;
        const hand = Math.sqrt(((u - cxp - 0.2 * side) / 0.18) ** 2 + ((v - 1.0) / 0.25) ** 2);
        const m = Math.max(smooth(1.25, 0.7, Math.sqrt(dxp ** 4 + dyp ** 2)), smooth(1.3, 0.6, hand) * 0.85);
        e *= 1 - L.phone * kl * m;
      }
      e *= 1 / Math.pow(1 + (rx * rx + ry * ry) * vig, 2);
      return e * ex0;
    });
    // reflejo del flash: zona quemada (más donde el papel brilla: tóner, grasa, cera)
    const gl = B.gloss;
    const G = L.glare ? lowField(w, h, 6, (x, y) => {
      const dx = (x / w - L.hot[0] - jx * 0.5) * w / half, dy = (y / h - L.hot[1] - jy * 0.5) * h / half;
      return L.glare * kl * Math.exp(-(dx * dx + dy * dy) / 0.02);
    }) : null;
    const sy = L.scanYellow ? clamp(def(paper.translucency, 0.25), 0, 1) * 0.04 * k : 0;
    const D = B.D, dinvP = 1 / (S.dstd || 0.01);
    const cool = def(L.coolShadow, 0) * kl;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, j = o * 4;
      const e = E(x, y);
      let g = 0;
      if (G) {
        // reflejo del flash: no es un velo, es brillo especular que sólo devuelven las partes del relieve que miran a
        // la cámara (crestas del grano, virutas, fibras) y lo que brilla (tóner, grasa, cera). La textura se sigue viendo.
        const gv = G(x, y);
        if (gv > 0.004) {
          const hn = D ? D[o] * dinvP : 0;
          const crest = smooth(-0.2, 1.8, hn);
          g = gv * (0.06 + 0.55 * crest * crest + (gl ? gl[o] / 255 * 0.9 : 0));
        }
      }
      else if (gl && gl[o] && luz !== 'escaner' && luz !== 'ninguna') g = gl[o] / 255 * 0.05 * kl;
      const sh = cool * clamp(1 - e, 0, 1);
      for (let c = 0; c < 3; c++) {
        let v = px[j + c] * e * tint[c];
        if (c === 2) v *= 1 + sh - sy; else if (c === 0) v *= 1 - sh * 0.6;
        if (con) v = 128 + (v - 128) * (1 + con);
        v += (255 - v) * Math.min(0.85, g);
        v = black + clamp(v, 0, 255) * white * (255 - black) / 255;
        px[j + c] = v;
      }
    }
  }
  if (cal === 'perfecta') { if (def(st.encuadre, 0) > 0) captureGeometry(S, st, px, {}, k); return; }
  quality(S, st, px, cal, k);
}

// Calidad de la captura. Todo se mide respecto a una RESOLUCIÓN EFECTIVA (lado largo, px): por mucho que el
// documento sea grande, una foto de móvil antiguo tiene el detalle de ~900 px.
//   res        lado largo efectivo · motion: trepidación (fracción del lado largo) · focus: desenfoque extra
//   denoise    el «acuarelado» de los móviles: borra la textura fina y deja los bordes
//   sharpen    halos de enfoque digital · clarity: contraste local (HDR del móvil)
//   noise/chroma  ruido de luminancia (más en las sombras) y manchas de color, al tamaño del píxel efectivo
//   jpeg       bloques de 8×8 px efectivos · ca: aberración cromática · barrel: distorsión del objetivo
//   halation   halo rojizo alrededor de las luces (película) · grain: grano a dos escalas
const QUAL = {
  escaner_pro: { res: 3200, sharpen: 0.45, noise: 0.8, contrast: 0.05, white: 0.03, dust: 0.4, rot: 0.4 },
  escaner_oficina: { res: 1600, sharpen: 1.1, noise: 2.2, contrast: 0.2, white: 0.1, desat: 0.2, streak: 1, dust: 1.6, jpeg: 0.45, rot: 1.3 },
  movil: { res: 1700, motion: 0.0022, sharpen: 1.25, denoise: 0.75, clarity: 0.35, noise: 6, chroma: 5, sat: 0.1, contrast: 0.06, jpeg: 0.45,
    vig: 0.3, ca: 0.6, rot: 1.9, persp: 0.05, edge: 3.2, barrel: 0.018 },
  movil_antiguo: { res: 900, motion: 0.004, focus: 0.45, sharpen: 0.8, denoise: 0.4, noise: 13, chroma: 12, jpeg: 1, ca: 2.2,
    cast: [1.04, 1.05, 0.84], vig: 0.5, contrast: 0.14, white: 0.07, sat: -0.12, rot: 2.6, persp: 0.08, edge: 5, barrel: 0.04 },
  fotocopia: { res: 1300, gray: 1, copy: 1, toner: 1, white: 0.12, noise: 3, streak: 2.5, dust: 3, border: 1, rot: 1.1 },
  analogica: { res: 1500, focus: 0.5, grain: 1, halation: 0.75, fade: 0.09, cast: [1.05, 1.0, 0.88], vig: 0.45, sat: -0.14, contrast: 0.06,
    diffusion: 0.18, dust: 1.2, hairs: 1, rot: 1.5, persp: 0.035, edge: 3.6, barrel: 0.022 }
};
function quality(S, st, px, cal, k) {
  const { w, h, N } = S;
  const Q = QUAL[cal];
  if (!Q) return;
  const kq = Math.min(1.6, k), longS = Math.max(w, h);
  const r = rng((S.seed + (def(st.seedFoto, 0) | 0) * 7717) * 3 + 77);
  // factor entre el documento y la resolución efectiva (cuanto mayor, más se pierde)
  const f = Math.max(1, longS / lerp(longS, Q.res || longS, Math.min(1, kq)));
  const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let o = 0; o < N; o++) { ch[0][o] = px[o * 4]; ch[1][o] = px[o * 4 + 1]; ch[2][o] = px[o * 4 + 2]; }
  const tmp = new Float32Array(N), bl = new Float32Array(N);
  if (Q.gray) for (let o = 0; o < N; o++) { const l = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11; ch[0][o] = ch[1][o] = ch[2][o] = l; }
  // 1) resolución efectiva + desenfoque del objetivo
  const sigR = (0.55 * f + (Q.focus || 0) * f * kq) * def(st._soft, 1);
  if (S.hasAlpha) { const A = new Float32Array(N); for (let o = 0; o < N; o++) A[o] = px[o * 4 + 3]; ch.push(A); }
  const nch = ch.length;
  if (sigR > 0.45) for (let c = 0; c < nch; c++) gaussBlur(ch[c], w, h, sigR, tmp);
  // 2) trepidación: barrido en una dirección
  if (Q.motion) {
    const len = Q.motion * longS * kq * def(st._soft, 1) * lerp(0.6, 1.2, r()), ang = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2);
    if (len > 1) {
      const taps = Math.min(9, Math.max(3, Math.round(len))), dx = Math.cos(ang) * len / (taps - 1), dy = Math.sin(ang) * len / (taps - 1);
      for (let c = 0; c < nch; c++) {
        const a = ch[c]; tmp.set(a);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let s = 0;
          for (let t = 0; t < taps; t++) {
            const xx = clamp(Math.round(x + (t - (taps - 1) / 2) * dx), 0, w - 1), yy = clamp(Math.round(y + (t - (taps - 1) / 2) * dy), 0, h - 1);
            s += tmp[yy * w + xx];
          }
          a[y * w + x] = s / taps;
        }
      }
    }
  }
  // 3) aberración cromática (rojo hacia fuera, azul hacia dentro; crece hacia los bordes)
  if (Q.ca) {
    const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), s = Q.ca * kq * f;
    const r0 = new Float32Array(ch[0]), b0 = new Float32Array(ch[2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / R, dy = (y - cy) / R;
      const xr = clamp(Math.round(x + dx * s), 0, w - 1), yr = clamp(Math.round(y + dy * s), 0, h - 1);
      const xb = clamp(Math.round(x - dx * s), 0, w - 1), yb = clamp(Math.round(y - dy * s), 0, h - 1);
      ch[0][y * w + x] = r0[yr * w + xr]; ch[2][y * w + x] = b0[yb * w + xb];
    }
  }
  // 4) reducción de ruido del móvil: aplana la textura fina (papel «de acuarela»), conserva los bordes
  if (Q.denoise) {
    const am = Q.denoise * kq;
    for (let c = 0; c < 3; c++) {
      bl.set(ch[c]); gaussBlur(bl, w, h, 1.6 * f, tmp);
      const a = ch[c];
      for (let o = 0; o < N; o++) { const d = a[o] - bl[o]; a[o] = bl[o] + d * (1 - am * smooth(14, 3, Math.abs(d))); }
    }
  }
  // 5) contraste local (HDR del móvil) y halos de enfoque
  if (Q.clarity) {
    const L = new Float32Array(N); for (let o = 0; o < N; o++) L[o] = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11;
    gaussBlur(L, w, h, longS / 45, tmp);
    const am = Q.clarity * kq;
    for (let o = 0; o < N; o++) { const l = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11, d = (l - L[o]) * am; ch[0][o] += d; ch[1][o] += d; ch[2][o] += d; }
  }
  if (Q.sharpen) {
    for (let c = 0; c < 3; c++) { bl.set(ch[c]); gaussBlur(bl, w, h, 1.3 * f, tmp); const a = ch[c]; for (let o = 0; o < N; o++) a[o] += (a[o] - bl[o]) * Q.sharpen * kq; }
  }
  // 6) difusión (película): las luces se abren un poco · halation: halo rojo-anaranjado alrededor de lo claro
  if (Q.diffusion || Q.halation) {
    const Hm = new Float32Array(N);
    for (let o = 0; o < N; o++) { const l = ch[0][o] * 0.3 + ch[1][o] * 0.59 + ch[2][o] * 0.11; Hm[o] = Math.max(0, l - 175) / 80; }
    gaussBlur(Hm, w, h, longS / 160, tmp);
    const dk = (Q.diffusion || 0) * kq * 60, hk = (Q.halation || 0) * kq * 70;
    for (let o = 0; o < N; o++) { const v = Hm[o]; if (v <= 0.001) continue; ch[0][o] += v * (dk + hk); ch[1][o] += v * (dk + hk * 0.35); ch[2][o] += v * dk * 0.8; }
  }
  // 7) JPEG: bloques de 8×8 píxeles efectivos que se aplanan donde hay poco detalle
  if (Q.jpeg) {
    const bs = Math.max(8, Math.round(8 * f)), jk = Q.jpeg * kq;
    for (let c = 0; c < 3; c++) {
      const a = ch[c];
      for (let by = 0; by < h; by += bs) for (let bx = 0; bx < w; bx += bs) {
        let s = 0, s2 = 0, n = 0;
        const ye = Math.min(h, by + bs), xe = Math.min(w, bx + bs);
        for (let y = by; y < ye; y += 2) for (let x = bx; x < xe; x += 2) { const v = a[y * w + x]; s += v; s2 += v * v; n++; }
        const m = s / n, varr = s2 / n - m * m;
        const t = jk * clamp(1 - varr / (c === 1 ? 260 : 600), 0, 1) * (c === 1 ? 0.75 : 1);   // el color se comprime más
        if (t <= 0.01) continue;
        for (let y = by; y < ye; y++) for (let x = bx; x < xe; x++) { const o = y * w + x; a[o] = lerp(a[o], m, t); }
      }
    }
  }
  // 8) tono, color, ruido y grano (por píxel)
  const nz = (Q.noise || 0) * kq, chn = (Q.chroma || 0) * kq, cellN = Math.max(1, f * 0.9);
  const sNoise = (x, y, s) => {     // ruido al tamaño del píxel efectivo (manchitas, no puntos sueltos)
    const gx = x / cellN, gy = y / cellN, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const a = hashi(ix, iy, s), b = hashi(ix + 1, iy, s), c = hashi(ix, iy + 1, s), d = hashi(ix + 1, iy + 1, s);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy - 0.5;
  };
  const gr = (Q.grain || 0) * kq, gC1 = Math.max(1, longS / 2600), gC2 = gC1 * 3.2;
  const con = (Q.contrast || 0) * kq, white = (Q.white || 0) * kq, desat = (Q.desat || 0) * kq, sat = (Q.sat || 0) * kq, fade = (Q.fade || 0) * kq;
  const cast = (Q.cast || [1, 1, 1]).map(v => 1 + (v - 1) * kq);
  const vig = (Q.vig || 0) * kq, diag = Math.hypot(w, h) / 2;
  const toner = (Q.toner || 0) * kq, streak = (Q.streak || 0) * kq, copy = (Q.copy || 0) * kq;
  const sx0 = (r() * 1e5) | 0;
  // fotocopia: rayas de tambor en posiciones fijas
  const lines = []; if (streak) for (let i = 0; i < 3 + ((r() * 4) | 0); i++) lines.push([r() * w, lerp(0.4, 2, r()) * Math.max(1, longS / 2500), lerp(0.15, 0.6, r())]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x, j = o * 4;
    let R = ch[0][o], G = ch[1][o], Bb = ch[2][o];
    let l = R * 0.2126 + G * 0.7152 + Bb * 0.0722;
    if (desat || sat) { const s = 1 - desat + sat; R = l + (R - l) * s; G = l + (G - l) * s; Bb = l + (Bb - l) * s; }
    R *= cast[0]; G *= cast[1]; Bb *= cast[2];
    if (con) { R = 128 + (R - 128) * (1 + con); G = 128 + (G - 128) * (1 + con); Bb = 128 + (Bb - 128) * (1 + con); }
    if (copy) {
      // fotocopiadora: los grises medios se van a blanco o a negro (curva muy dura) y el fondo queda moteado
      const t = clamp(l / 255, 0, 1), c2 = 1 / (1 + Math.exp(-(t - 0.55) * (6 + 10 * copy)));
      const v = lerp(t, c2, Math.min(1, copy)) * 255 - (sNoise(x * 0.25, y * 0.25, sx0 + 3) + 0.5) * 22 * copy * (t > 0.6 ? 1 : 0.3);
      R = G = Bb = v;
    }
    if (white) { const ff = 1 / (1 - white); R *= ff; G *= ff; Bb *= ff; }
    if (fade) { R = R * (1 - fade) + 255 * fade * 0.5 + 10 * fade; G = G * (1 - fade) + 255 * fade * 0.48 + 10 * fade; Bb = Bb * (1 - fade) + 255 * fade * 0.42 + 10 * fade; }
    if (vig) { const rr = ((x - w / 2) ** 2 + (y - h / 2) ** 2) / (diag * diag); const vf = 1 - vig * rr * (0.6 + 0.4 * rr); R *= vf; G *= vf; Bb *= vf; }
    l = R * 0.2126 + G * 0.7152 + Bb * 0.0722;
    if (nz) { const n = sNoise(x, y, 11) * 2 * nz * (0.45 + 1.6 * Math.pow(1 - clamp(l / 255, 0, 1), 1.5)); R += n; G += n; Bb += n; }
    if (chn) { const a = sNoise(x * 0.5, y * 0.5, 21) * chn * 2, b = sNoise(x * 0.5, y * 0.5, 22) * chn * 2; R += a; Bb += b; G -= (a + b) * 0.3; }
    if (gr) {   // grano de película: dos escalas, más en los medios tonos
      const mid = 0.5 + 1.2 * (1 - Math.abs(l - 128) / 128);
      const n = ((hashi(x / gC1 | 0, y / gC1 | 0, 5) - 0.5) * 13 + sNoise(x / gC2 * cellN, y / gC2 * cellN, 6) * 18) * gr * mid;
      R += n; G += n * 0.97; Bb += n * 1.05;
    }
    if (toner && hashi(x, y, 31) < 0.0012 * toner) { R *= 0.3; G *= 0.3; Bb *= 0.3; }
    if (streak) {
      let s = (hashi(0, y >> 1, 41) - 0.5) * 3 * streak;
      for (const ln of lines) { const d = Math.abs(x - ln[0]); if (d < ln[1] * 2) s -= ln[2] * 120 * streak * Math.max(0, 1 - d / (ln[1] * 2)) * (0.6 + 0.4 * hashi(x, y >> 3, 43)); }
      R += s; G += s; Bb += s;
    }
    px[j] = R; px[j + 1] = G; px[j + 2] = Bb;
    if (nch > 3) px[j + 3] = ch[3][o];
  }
  // 9) polvo del cristal / de la película y pelos
  const area = (w * h) / (2480 * 3508), scaleK = Math.max(1, longS / 3000);
  if (Q.dust) {
    const n = Math.round(40 * Q.dust * kq * Math.max(0.4, area));
    for (let i = 0; i < n; i++) {
      const x0 = r() * w, y0 = r() * h, rad = lerp(0.6, 2.6, Math.pow(r(), 2)) * scaleK, op = lerp(0.25, 0.8, r()), dark = Q.gray || r() < 0.85;
      const R2 = Math.ceil(rad + 2);
      for (let y = Math.max(0, (y0 - R2) | 0); y < Math.min(h, y0 + R2); y++) for (let x = Math.max(0, (x0 - R2) | 0); x < Math.min(w, x0 + R2); x++) {
        const t = clamp(rad - Math.hypot(x - x0, y - y0) + 0.5, 0, 1) * op; if (t <= 0) continue;
        const j = (y * w + x) * 4; for (let c = 0; c < 3; c++) px[j + c] = dark ? px[j + c] * (1 - t * 0.75) : px[j + c] + (255 - px[j + c]) * t * 0.7;
      }
    }
  }
  if (Q.hairs) {
    const n = Math.round(4 * Q.hairs * kq * Math.max(0.5, area));
    for (let i = 0; i < n; i++) {
      let x = r() * w, y = r() * h, a = r() * 6.28; const len = lerp(80, 400, r()) * scaleK, white2 = r() < 0.5;
      for (let s = 0; s < len; s++) {
        a += (r() - 0.5) * 0.08; x += Math.cos(a); y += Math.sin(a);
        const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
        const j = (yi * w + xi) * 4; for (let c = 0; c < 3; c++) px[j + c] = white2 ? px[j + c] + (255 - px[j + c]) * 0.6 : px[j + c] * 0.35;
      }
    }
  }
  // fotocopia: borde oscuro del cristal y sombra del canto de la hoja
  if (Q.border) {
    const bw = Math.max(3, Math.round(longS * 0.006)) * kq;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y); if (d > bw * 3) continue;
      const t = smooth(bw * 3, 0, d) * (0.5 + 0.5 * hashi(x >> 2, y >> 2, 51)), j = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) px[j + c] *= 1 - 0.75 * t;
    }
  }
  captureGeometry(S, st, px, Q, k);
}

// La toma nunca es perfecta: la hoja queda girada, con perspectiva (el móvil no está paralelo), el objetivo curva
// las rectas (barril) y los márgenes se desenfocan (profundidad de campo; más en el lado que queda más lejos).
// Se recorta lo justo para que no aparezcan esquinas vacías.
function captureGeometry(S, st, px, Q, k) {
  const { w, h, N } = S;
  const kk = Math.min(1.6, k);
  // Encuadre (0 = de frente): cuanto más alto, la cámara está más girada e inclinada, descentrada y más cerca;
  // sólo se recorta (nunca se inventa lo que queda fuera), así que al máximo lo del centro casi se sale del plano.
  // curva suave: los primeros tramos tuercen poco, el final ya es una foto muy mala
  // reparto: 0-25 % casi imperceptible (un pelo girada), 50 % foto normal de móvil, 100 % muy torcida y desenfocada
  const enc = clamp(def(st.encuadre, 0), 0, 1), ep = Math.pow(enc, 2.2), e2 = ep * ep, ef = Math.pow(enc, 1.6);
  const rot = (Q.rot || 0) * kk + 11 * ep, persp = (Q.persp || 0) * kk + 0.3 * ep,
    barrel = (Q.barrel || 0) * kk + 0.04 * ep, edge = ((Q.edge || 0) * kk * def(st._soft, 1) + 8 * Math.pow(enc, 1.8)) * Math.max(w, h) / 2000;
  if (rot <= 0 && persp <= 0 && edge <= 0 && barrel <= 0) return;
  const r = rng((S.seed + (def(st.seedFoto, 0) | 0) * 7717) * 3 + 41);
  const th = (r() < 0.5 ? -1 : 1) * rot * (0.6 + 0.4 * r()) * Math.PI / 180;
  const pa = r() * Math.PI * 2, pxk = Math.cos(pa) * persp * (0.7 + 0.3 * r()), pyk = Math.sin(pa) * persp * (0.7 + 0.3 * r());
  const ca = Math.cos(th), sa = Math.sin(th), asp = w / h;
  const map = (u, v, z, out) => {
    const rb = 1 + barrel * (u * u + v * v);               // barril: lo de los bordes se ve más hacia dentro
    u *= rb; v *= rb;
    const x = u * asp, y = v;
    const xs = (x * ca - y * sa) / asp, ys = x * sa + y * ca;
    const ww = 1 + pxk * xs + pyk * ys;
    out[0] = xs / ww * z; out[1] = ys / ww * z;
  };
  const t = [0, 0];
  // descentrado (hacia dónde apunta la cámara) y acercamiento extra
  const oa = r() * Math.PI * 2, offX = Math.cos(oa) * 0.3 * ep, offY = Math.sin(oa) * 0.3 * ep;
  let z = 1;
  for (let i = 0; i <= 16; i++) for (const [u, v] of [[-1 + i / 8, -1], [-1 + i / 8, 1], [-1, -1 + i / 8], [1, -1 + i / 8]]) {
    map(u, v, 1, t);
    if (Math.abs(t[0]) > 1e-6) z = Math.min(z, (1 - Math.abs(offX)) / Math.abs(t[0]));
    if (Math.abs(t[1]) > 1e-6) z = Math.min(z, (1 - Math.abs(offY)) / Math.abs(t[1]));
  }
  z *= 0.998 * (1 - 0.2 * e2);
  // con borde la hoja está recortada sobre transparente: no hace falta recortar para tapar esquinas vacías, se ve la
  // hoja entera girada (y lo que queda fuera es transparente)
  const NQ = S.hasAlpha ? 4 : 3;
  if (S.hasAlpha || S.bgFill) z = 1 - 0.03 * Math.min(1, rot / 4) - 0.08 * e2;
  if (rot > 0 || persp > 0 || barrel > 0) {
    const src = new Uint8ClampedArray(px);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      map((2 * x + 1) / w - 1, (2 * y + 1) / h - 1, z, t);
      let sx = (t[0] + offX + 1) * w / 2 - 0.5, sy = (t[1] + offY + 1) * h / 2 - 0.5;
      const j = (y * w + x) * 4;
      if (S.hasAlpha && (sx < -1 || sy < -1 || sx > w || sy > h)) { px[j + 3] = 0; continue; }
      if (S.bgFill && (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5)) { px[j] = S.bgFill[0]; px[j + 1] = S.bgFill[1]; px[j + 2] = S.bgFill[2]; continue; }
      sx = sx < 0 ? 0 : sx > w - 1.001 ? w - 1.001 : sx; sy = sy < 0 ? 0 : sy > h - 1.001 ? h - 1.001 : sy;
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, a = (iy * w + ix) * 4, b = a + 4, c = a + w * 4, d = c + 4;
      for (let q = 0; q < NQ; q++) px[j + q] = (src[a + q] * (1 - fx) + src[b + q] * fx) * (1 - fy) + (src[c + q] * (1 - fx) + src[d + q] * fx) * fy;
    }
  }
  if (edge > 0.3) {
    const tmp = new Float32Array(N), b1 = [], b2 = [];
    for (let q = 0; q < NQ; q++) {
      const a = new Float32Array(N); for (let o = 0; o < N; o++) a[o] = px[o * 4 + q];
      const c = new Float32Array(a); gaussBlur(a, w, h, edge * 0.5, tmp); gaussBlur(c, w, h, edge, tmp); b1.push(a); b2.push(c);
    }
    const pn = Math.hypot(pxk, pyk) || 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (2 * x + 1) / w - 1, v = (2 * y + 1) / h - 1;
      const far = persp > 0 ? (pxk * u + pyk * v) / pn * 0.45 : 0;
      // zona enfocada: más pequeña cuanto peor el encuadre, y desplazada hacia donde está más cerca
      const m2 = smooth(0.4 - 0.32 * ef, 1.15 - 0.45 * ef, Math.sqrt(u * u * 0.8 + v * v * 0.8) + far * (1 + 1.5 * ef));
      if (m2 <= 0) continue;
      const o = y * w + x, j = o * 4;
      for (let q = 0; q < NQ; q++) {
        const lo = lerp(px[j + q], b1[q][o], Math.min(1, m2 * 2)), hi = b2[q][o];
        px[j + q] = m2 > 0.5 ? lerp(lo, hi, (m2 - 0.5) * 2) : lo;
      }
    }
  }
}

function pxPerMm(w, h, resolution) {
  if (resolution && resolution >= 150) return resolution / 25.4;
  return Math.max(w, h) / 297;
}

module.exports = { renderPaper, renderFinal, pxPerMm, catalogs, presets: P, MATERIAL_NO, _cache: cache };
