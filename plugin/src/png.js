/* PAPELATOR · decodificador PNG mínimo (sin dependencias).
   Soporta PNG de 8 bits: gris (0), RGB (2), paleta (3), gris+alfa (4), RGBA (6), sin entrelazado.
   Incluye un descompresor DEFLATE (RFC 1951) propio porque UXP no trae zlib. */
'use strict';

// ------------------------------------------------------------------ inflate
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// tabla de Huffman canónica -> búsqueda rápida por 9 bits + desbordamiento
function buildHuff(lengths, n) {
  let maxLen = 0;
  for (let i = 0; i < n; i++) if (lengths[i] > maxLen) maxLen = lengths[i];
  const count = new Uint16Array(16), next = new Uint16Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  let code = 0;
  for (let b = 1; b <= 15; b++) { code = (code + count[b - 1]) << 1; next[b] = code; }
  // tabla completa indexada por bits invertidos de longitud maxLen
  const size = 1 << maxLen;
  const table = new Int32Array(size).fill(-1);
  for (let s = 0; s < n; s++) {
    const len = lengths[s]; if (!len) continue;
    let c = next[len]++;
    // invertir bits
    let r = 0; for (let i = 0; i < len; i++) { r = (r << 1) | (c & 1); c >>= 1; }
    for (let k = r; k < size; k += 1 << len) table[k] = (s << 4) | len;
  }
  return { table, maxLen };
}

function inflate(data, expectedSize) {
  let out = new Uint8Array(expectedSize || data.length * 4);
  let op = 0;
  let pos = 0, bitbuf = 0, bitcnt = 0;
  const len = data.length;
  function need(n) {
    while (bitcnt < n) { bitbuf |= (pos < len ? data[pos] : 0) << bitcnt; pos++; bitcnt += 8; }
  }
  function bits(n) { need(n); const v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v; }
  function ensure(n) {
    if (op + n <= out.length) return;
    let ns = out.length * 2; while (ns < op + n) ns *= 2;
    const o2 = new Uint8Array(ns); o2.set(out); out = o2;
  }
  function decode(h) {
    need(h.maxLen);
    const e = h.table[bitbuf & ((1 << h.maxLen) - 1)];
    if (e < 0) throw new Error('PNG: código Huffman inválido');
    const l = e & 15; bitbuf >>>= l; bitcnt -= l;
    return e >> 4;
  }
  let fixedL = null, fixedD = null;
  let final = 0;
  while (!final) {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitbuf = 0; bitcnt = 0;
      const ln = data[pos] | (data[pos + 1] << 8); pos += 4;
      ensure(ln); out.set(data.subarray(pos, pos + ln), op); op += ln; pos += ln;
      continue;
    }
    let lh, dh;
    if (type === 1) {
      if (!fixedL) {
        const l = new Uint8Array(288);
        for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9;
        for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
        fixedL = buildHuff(l, 288);
        const d = new Uint8Array(30).fill(5); fixedD = buildHuff(d, 30);
      }
      lh = fixedL; dh = fixedD;
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CLORDER[i]] = bits(3);
      const ch = buildHuff(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = decode(ch);
        if (sym < 16) lens[i++] = sym;
        else if (sym === 16) { const r = 3 + bits(2), v = lens[i - 1]; for (let k = 0; k < r; k++) lens[i++] = v; }
        else if (sym === 17) { const r = 3 + bits(3); for (let k = 0; k < r; k++) lens[i++] = 0; }
        else { const r = 11 + bits(7); for (let k = 0; k < r; k++) lens[i++] = 0; }
      }
      lh = buildHuff(lens.subarray(0, hlit), hlit);
      dh = buildHuff(lens.subarray(hlit), hdist);
    } else throw new Error('PNG: bloque DEFLATE desconocido');
    for (;;) {
      const sym = decode(lh);
      if (sym < 256) { if (op >= out.length) ensure(1); out[op++] = sym; }
      else if (sym === 256) break;
      else {
        const li = sym - 257;
        const L = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0);
        const ds = decode(dh);
        const D = DBASE[ds] + (DEXT[ds] ? bits(DEXT[ds]) : 0);
        ensure(L);
        let s = op - D;
        for (let k = 0; k < L; k++) out[op++] = out[s++];
      }
    }
  }
  return out.subarray(0, op);
}

// ------------------------------------------------------------------ PNG
function readU32(b, p) { return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }

function decodePNG(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] !== 137 || b[1] !== 80) throw new Error('No es un PNG');
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0;
  const idat = []; let idatLen = 0; let palette = null, trns = null;
  while (p < b.length) {
    const ln = readU32(b, p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const d = b.subarray(p + 8, p + 8 + ln);
    if (type === 'IHDR') { w = readU32(d, 0); h = readU32(d, 4); depth = d[8]; ctype = d[9]; inter = d[12]; }
    else if (type === 'PLTE') palette = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') { idat.push(d); idatLen += ln; }
    else if (type === 'IEND') break;
    p += 12 + ln;
  }
  if (depth !== 8 || inter) throw new Error('PNG no soportado (profundidad ' + depth + ')');
  const comp = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : 4;
  const z = new Uint8Array(idatLen); let zo = 0;
  for (const c of idat) { z.set(c, zo); zo += c.length; }
  const stride = w * comp;
  const raw = inflate(z.subarray(2), (stride + 1) * h);
  const px = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= comp ? px[dst + x - comp] : 0, up = y ? px[dst - stride + x] : 0, c = (x >= comp && y) ? px[dst - stride + x - comp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
      px[dst + x] = v & 255;
    }
  }
  if (ctype === 3) {   // paleta -> RGB
    const o = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { const k = px[i] * 3; o[i * 3] = palette[k]; o[i * 3 + 1] = palette[k + 1]; o[i * 3 + 2] = palette[k + 2]; }
    return { width: w, height: h, channels: 3, data: o };
  }
  return { width: w, height: h, channels: comp, data: px };
}

module.exports = { decodePNG, inflate };
