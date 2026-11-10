const Module = require('module'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../../plugin');
class El { constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.className = ''; this.style = {}; this.dataset = {}; this.attrs = {}; this.listeners = {}; this._text = ''; this.id = ''; this.value = undefined; this.checked = false; }
  set textContent(v) { this._text = String(v); this.children = []; } get textContent() { return this._text; }
  set innerHTML(v) { this.children = []; }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; } removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t, props) { (this.listeners[t] || []).forEach(f => f(Object.assign({ target: this }, props || {}))); }
  walk(f) { f(this); this.children.forEach(c => c.walk(f)); }
  querySelectorAll(sel) { const out = []; this.walk(e => { if (e === this) return; if (sel[0] === '.') { if ((' ' + e.className + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0) out.push(e); } else if (sel[0] === '#') { if (e.id === sel.slice(1)) out.push(e); } else if (e.tagName === sel.toUpperCase()) out.push(e); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; } }
// construir DOM a partir de index.html (ids)
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const body = new El('body');
function mk(tag, id, parent) { const e = new El(tag); e.id = id; parent.appendChild(e); return e; }
const simple = mk('div', 'simple', body), pro = mk('div', 'pro', body);
const ids = [...html.matchAll(/<([\w-]+)[^>]*id="([\w-]+)"/g)].map(m => [m[1], m[2]]).filter(x => x[1] !== 'simple' && x[1] !== 'pro');
for (const [tag, id] of ids) mk(tag, id, id.startsWith('p-') ? pro : simple);
global.document = { createElement: t => new El(t), getElementById: id => { let f = null; [simple, pro].forEach(r => r.walk(e => { if (!f && e.id === id) f = e; })); return f; } };
const store = {}; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
let lid = 10; const W = 300, H = 420;
function layer(name) { return { id: lid++, name, visible: true, isBackgroundLayer: false, async move(t, p) { const L = doc.layers; L.splice(L.indexOf(this), 1); let i = L.indexOf(t); if (p === 'placeAfter') i++; L.splice(i, 0, this); }, async delete() { doc.layers.splice(doc.layers.indexOf(this), 1); } }; }
const bg = layer('Fondo'); bg.isBackgroundLayer = true;
const doc = { id: 1, width: W, height: H, resolution: 72, mode: 'RGBColorMode', bitsPerChannel: 'bitDepth8', layers: [layer('Texto'), bg], async createPixelLayer(o) { const l = layer(o.name); this.layers.unshift(l); return l; }, activeLayers: [] };
const puts = [];
const ps = { app: { activeDocument: doc }, constants: { ElementPlacement: { PLACEAFTER: 'placeAfter', PLACEBEFORE: 'placeBefore' } },
  core: { async executeAsModal(fn) { return fn({ hostControl: { async suspendHistory() { return 5; }, async resumeHistory() {} }, reportProgress() {}, isCancelled: false }); } },
  imaging: { async createImageDataFromBuffer(b, o) { if (b.length !== o.width * o.height * o.components) throw new Error('size'); return { dispose() {} }; }, async encodeImageData() { return 'QUJD'; }, async putPixels(o) { puts.push(o); },
    async getPixels(o) { const tw = o.targetSize ? o.targetSize.width : W; const th = o.targetSize ? Math.round(H * tw / W) : H; const d = new Uint8Array(tw * th * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = (i / 4 % tw < tw / 2) ? 20 : 255; d[i + 3] = 255; } return { imageData: { width: tw, height: th, components: 4, async getData() { return d; }, dispose() {} }, sourceBounds: { left: 0, top: 0 } }; } },
  action: { async batchPlay() {}, addNotificationListener() {} } };
function fsEntry(p) { return { async getEntry(n) { return fsEntry(path.join(p, n)); }, async read(o) { return o.format === 'utf8' ? fs.readFileSync(p, 'utf8') : new Uint8Array(fs.readFileSync(p)).buffer; } }; }
let panels = null;
const uxp = { entrypoints: { setup(o) { panels = o.panels; } }, storage: { formats: { utf8: 'utf8', binary: 'binary' }, localFileSystem: { async getPluginFolder() { return fsEntry(ROOT); } } } };
const orig = Module._load; Module._load = function (r, ...a) { if (r === 'uxp') return uxp; if (r === 'photoshop') return ps; return orig.call(this, r, ...a); };
require(ROOT + '/main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  panels.papelator.show({ node: new El('uxp-panel') });
  panels.papelatorAjustes.show({ node: new El('uxp-panel') });
  await sleep(2500);
  const $ = id => document.getElementById(id);
  console.log('swatches', $('s-swatches').querySelectorAll('.sw').length, 'thumb', String($('s-thumb').src).slice(0, 25));
  console.log('chips color/estado/calco/luz/calidad', ['s-colors', 's-estado', 's-calco', 's-luz', 's-calidad'].map(i => $(i).querySelectorAll('.chip').length).join('/'));
  $('s-estado').querySelectorAll('.chip')[3].fire('click');
  $('s-calco').querySelectorAll('.chip')[4].fire('click');
  $('s-colors').querySelectorAll('.chip')[2].fire('click');
  const sl = $('p-sections').querySelectorAll('sp-slider'); console.log('sliders', sl.length);
  sl[5].value = 3; sl[5].fire('change');
  $('s-paper').fire('click'); await sleep(2500);
  console.log('status:', $('s-status').textContent);
  console.log('layers:', doc.layers.map(l => l.name).join(' | '));
  $('s-luz').querySelectorAll('.chip')[4].fire('click'); $('s-calidad').querySelectorAll('.chip')[3].fire('click');
  $('s-apply').fire('click'); await sleep(3000);
  console.log('status:', $('s-status').textContent);
  console.log('layers:', doc.layers.map(l => l.name + (l.visible ? '' : '(oculta)')).join(' | '));
  const st = JSON.parse(store['papelator3.state']); console.log('state', st.paper, st.estado, st.calco, st.color, st.luz, st.calidad, !!st.custom);
  process.exit(0); // fin
})().catch(e => { console.error('FAIL', e); process.exit(1); });
