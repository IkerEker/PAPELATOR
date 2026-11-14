// node swatches.js id1 id2 ...  -> plugin/assets/swatches/{id}.png (112 px ≈ 32 mm de papel)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { assets, E } = require('./run2.js');
function png(file, w, h, rgba) { // RGB
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = rgba[(y * w + x) * 4 + c];
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
(async () => {
  for (const id of process.argv.slice(2)) {
    const P0 = require('../../plugin/assets/papers.json').filter(p => p.id === id)[0];
    const ppm = P0 && P0.material === 'surface' ? 112 / (P0.tileMm[0] * 0.45) : 3.5;
    const res = await E.renderPaper({ w: 112, h: 112, ppm, state: { paper: id, seed: 5, intensity: 60 }, assets });
    png(path.resolve(__dirname, '../../plugin/assets/swatches/' + id + '.png'), 112, 112, res.rgba);
    console.log(id);
  }
})();
