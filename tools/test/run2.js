// Pruebas del motor en Node: node run2.js '{json}'
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.resolve(__dirname, '../../plugin');
const { decodePNG } = require(ROOT + '/src/png.js');
const E = require(ROOT + '/src/engine.js');
const assets = {
  json: async (n) => JSON.parse(fs.readFileSync(ROOT + '/assets/' + n, 'utf8')),
  image: async (p) => decodePNG(fs.readFileSync(ROOT + '/assets/' + p))
};
function png(file, w, h, rgba) {
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 3 })), chunk('IEND', Buffer.alloc(0))]));
}
module.exports = { png, assets, E };
async function main() {
  const cfg = JSON.parse(process.argv[2]);
  const w = cfg.w || 1240, h = cfg.h || 1754, ppm = cfg.ppm || w / 210;
  let art = null;
  if (cfg.art) art = new Uint8Array(fs.readFileSync(cfg.art));
  const t = Date.now();
  let res;
  if (cfg.final) res = await E.renderFinal({ w, h, ppm, state: cfg.state, assets, art, artComponents: 4, backArt: art ? { data: art, channels: 4 } : null });
  else res = await E.renderPaper({ w, h, ppm, state: cfg.state, assets, backArt: art ? { data: art, channels: 4 } : null });
  console.log(cfg.out, Date.now() - t, 'ms');
  png(cfg.out, w, h, res.rgba);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
