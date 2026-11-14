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
const puts = []; const layerData = {};
const ps = { app: { activeDocument: doc }, constants: { ElementPlacement: { PLACEAFTER: 'placeAfter', PLACEBEFORE: 'placeBefore' } },
  core: { async executeAsModal(fn) { return fn({ hostControl: { async suspendHistory() { return 5; }, async resumeHistory() {} }, reportProgress() {}, isCancelled: false }); } },
  imaging: { async createImageDataFromBuffer(b, o) { if (b.length !== o.width * o.height * o.components) throw new Error('size'); return { buf: new Uint8Array(b), w: o.width, h: o.height, c: o.components, dispose() {} }; }, async encodeImageData() { return 'QUJD'; }, async putPixels(o) { puts.push(o); layerData[o.layerID] = o.imageData; },
    async getPixels(o) { if (o.layerID) { const L = layerData[o.layerID]; if (!L) throw new Error('vacía'); return { imageData: { width: L.w, height: L.h, components: L.c, async getData() { return L.buf; }, dispose() {} }, sourceBounds: { left: 0, top: 0 } }; } const tw = o.targetSize ? o.targetSize.width : W; const th = o.targetSize ? Math.round(H * tw / W) : H; const d = new Uint8Array(tw * th * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = (i / 4 % tw < tw / 2) ? 20 : 255; d[i + 3] = 255; } return { imageData: { width: tw, height: th, components: 4, async getData() { return d; }, dispose() {} }, sourceBounds: { left: 0, top: 0 } }; } },
  action: { async batchPlay() {}, addNotificationListener() {} } };
function fsEntry(p) { return { async getEntry(n) { return fsEntry(path.join(p, n)); }, async read(o) { return o.format === 'utf8' ? fs.readFileSync(p, 'utf8') : new Uint8Array(fs.readFileSync(p)).buffer; } }; }
let panels = null;
const uxp = { entrypoints: { setup(o) { panels = o.panels; } }, storage: { formats: { utf8: 'utf8', binary: 'binary' }, localFileSystem: { async getPluginFolder() { return fsEntry(ROOT); } } } };
const orig = Module._load; Module._load = function (r, ...a) { if (r === 'uxp') return uxp; if (r === 'photoshop') return ps; return orig.call(this, r, ...a); };
require(ROOT + '/main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  panels.papelator.show({ node: new El('uxp-panel') });
  await sleep(2500);
  const $ = id => document.getElementById(id);
  console.log('swatches', $('s-swatches').querySelectorAll('.sw').length, 'thumb', String(($('p-thumb') || {}).src).slice(0, 25));
  console.log('chips color/estado/calco/luz/calidad', ['s-colors', 's-estado', 's-calco', 's-luz', 's-calidad'].map(i => $(i).querySelectorAll(i === 's-colors' ? '.csw' : '.chip').length).join('/'));
  $('s-estado').querySelectorAll('.chip')[3].fire('click');
  $('s-calco').querySelectorAll('.chip')[3].fire('click'); $('s-pliegue').querySelectorAll('.chip')[2].fire('click'); $('s-r-pliegue').fire('click'); $('s-r-estado').fire('click'); $('s-r-papel').fire('click'); $('s-sobre').querySelectorAll('.chip')[1].fire('click'); $('s-r-sobre').fire('click');
  $('s-colors').querySelectorAll('.csw')[2].fire('click');
  const sl = $('p-sections').querySelectorAll('sp-slider'); console.log('sliders', sl.length);
  sl[5].value = 3; sl[5].fire('change');
  $('s-paper').fire('click'); await sleep(2500);
  console.log('status:', $('s-status').textContent);
  console.log('layers:', doc.layers.map(l => l.name).join(' | '));
  $('s-luz').querySelectorAll('.chip')[3].fire('click'); $('s-r-luz').fire('click'); $('s-calidad').querySelectorAll('.chip')[2].fire('click'); $('s-r-calidad').fire('click');
  $('s-apply').fire('click'); await sleep(3000);
  console.log('status:', $('s-status').textContent);
  console.log('layers:', doc.layers.map(l => l.name + (l.visible ? '' : '(oculta)')).join(' | '));
  $('s-r-luz').fire('click'); $('s-apply').fire('click'); await sleep(3000);
  console.log('2ª vez:', $('s-status').textContent);
  console.log('layers:', doc.layers.map(l => l.name).join(' | '));
  // Ctrl+Z / fusionar: 3ª vez sin tocar nada → reescribe; tras «fusionar» (pintar sobre el resultado) → capa nueva encima
  await sleep(1500);
  $('s-apply').fire('click'); await sleep(2500);
  console.log('3ª vez (sin cambios de arte):', $('s-status').textContent.slice(0, 40), '|', doc.layers.map(l => l.name).join(' | '));
  const res = doc.layers.filter(l => l.name === 'PAPELATOR · Resultado')[0]; layerData[res.id].buf.fill(77, 0, 4000);
  $('s-apply').fire('click'); await sleep(2500);
  console.log('tras fusionar/pintar el resultado:', $('s-status').textContent.slice(0, 40), '|', doc.layers.map(l => l.name).join(' | '));
  // pantalla: se ocultan las secciones de papel y se filtran luz y calidad
  // superficies: ladrillo no se pinta (sin color), gotelé sí; nunca pliegues ni calco
  const seg = () => $('s-groups').querySelectorAll('.segb');
  seg()[1].fire('click'); await sleep(200);
  const subs = () => $('s-groups').querySelectorAll('.chip');
  console.log('superficies: subgrupos', subs().length, subs().map ? subs().map(c => c.textContent).join(',') : '');
  const pick = async (label) => { const c = Array.from(subs()).filter(x => x.textContent.indexOf(label) >= 0)[0]; if (c) c.fire('click'); await sleep(200); };
  subs()[1].fire('click'); await sleep(200);
  const sws = $('s-swatches').querySelectorAll('.sw'); sws[0].fire('click'); await sleep(300);
  const show = () => ['color', 'estado', 'pliegue', 'calco'].map(k => k + ':' + $('s-sec-' + k).style.display).join(' ') + ' relieve:' + $('s-reliefwrap').style.display + ' estados:' + $('s-estado').querySelectorAll('.chip').length;
  console.log(' ', JSON.parse(store['papelator3.state']).paper, show());
  const goteleIdx = 4;
  console.log('  gotelé swatch', goteleIdx); if (goteleIdx >= 0) { sws[goteleIdx].fire('click'); await sleep(300); console.log(' ', JSON.parse(store['papelator3.state']).paper, show()); }
  seg()[seg().length - 1].fire('click'); await sleep(200);
  $('s-swatches').querySelectorAll('.sw')[1].fire('click'); await sleep(300);
  console.log('pantalla:', JSON.parse(store['papelator3.state']).paper, 'pliegues', $('s-sec-pliegue').style.display, 'estado', $('s-sec-estado').style.display,
    'opciones', $('s-screenopts').style.display, 'luces', $('s-luz').querySelectorAll('.chip').length, 'calidades', $('s-calidad').querySelectorAll('.chip').length);
  $('s-apply').fire('click'); await sleep(3000); console.log('aplicar pantalla:', $('s-status').textContent);
  const st = JSON.parse(store['papelator3.state']); console.log('state', st.paper, st.estado, st.calco, st.color, st.luz, st.calidad, !!st.custom);
  process.exit(0); // fin
})().catch(e => { console.error('FAIL', e); process.exit(1); });
