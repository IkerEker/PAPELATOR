// miniaturas de las pantallas: un degradado de color visto de cerca, para que se vean sus subpíxeles
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { assets, E } = require('./run2.js');
function png(file, w, h, rgba) {
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = rgba[(y * w + x) * 4 + c];
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
(async () => {
  const W = 112, art = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, t = x / W, u = y / W;
    art[o] = 255 * (0.5 + 0.5 * Math.cos(6.28 * (t + 0.0))); art[o + 1] = 255 * (0.5 + 0.5 * Math.cos(6.28 * (t + 0.33))); art[o + 2] = 255 * (0.5 + 0.5 * Math.cos(6.28 * (t + 0.66)));
    if (u > 0.55) { art[o] = art[o + 1] = art[o + 2] = 255 * (1 - t); }
    art[o + 3] = 255;
  }
  const across = { pantalla_oled: 1, pantalla_lcd: 1, pantalla_vieja: 1, pantalla_crt: 1, pantalla_led: 1, pantalla_eink: 1 };
  for (const id of Object.keys(across)) {
    const zoom = 9 * across[id] / W;
    const res = await E.renderFinal({ w: W, h: W, ppm: 3.5, art, artComponents: 4, assets, state: { paper: id, _pitch: id === 'pantalla_eink' ? 2 : id === 'pantalla_led' ? 14 : 10, intensity: 60, seed: 2 } });
    png(path.resolve(__dirname, '../../plugin/assets/swatches/' + id + '.png'), W, W, res.rgba);
    console.log(id);
  }
})();
