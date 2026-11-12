/* PAPELATOR v2 · plugin UXP para Photoshop
   Panel 1 (presets): papel, color, estado, calco, fotografía + intensidad del filtro.
   Panel 2 (ajustes): todos los parámetros finos. Ambos comparten estado. */
'use strict';

const uxp = require('uxp');
const ps = require('photoshop');
const app = ps.app, core = ps.core, imaging = ps.imaging, constants = ps.constants;
const engine = require('./src/engine.js');
const { decodePNG } = require('./src/png.js');
const P = engine.presets;

const TAG = 'PAPELATOR ·';
const PAPER_NAME = 'PAPELATOR · Papel de fondo';
const RESULT_NAME = 'PAPELATOR · Resultado';
const MAX_PIXELS = 80e6;

// =============================================================== assets (desde la carpeta del plugin)
let pluginFolder = null;
async function entry(path) {
  if (!pluginFolder) pluginFolder = await uxp.storage.localFileSystem.getPluginFolder();
  let e = pluginFolder;
  for (const part of path.split('/')) e = await e.getEntry(part);
  return e;
}
const assets = {
  json: async (name) => JSON.parse(await (await entry('assets/' + name)).read({ format: uxp.storage.formats.utf8 })),
  image: async (path) => decodePNG(new Uint8Array(await (await entry('assets/' + path)).read({ format: uxp.storage.formats.binary })))
};

// =============================================================== estado
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function merge(base, o) {
  if (!isObj(o)) return base;
  Object.keys(o).forEach(k => { if (k in base) base[k] = (isObj(base[k]) && isObj(o[k])) ? merge(base[k], o[k]) : o[k]; });
  return base;
}
function loadJSON(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }

let state = merge(clone(P.DEFAULT_STATE), loadJSON('papelator3.state'));
// v4: la intensidad global ya no está en el panel principal; vuelve a la de referencia
if ((state.version | 0) < 4) { state.intensity = 50; state.version = 4; }
if (P.PLIEGUE_ALIAS[state.pliegue]) { state.pliegue = P.PLIEGUE_ALIAS[state.pliegue]; state.pliegueVar = 0; }
if (!P.PLIEGUES.some(x => x.id === state.pliegue)) state.pliegue = 'ninguno';
const ui = merge({ live: true, group: null, tab: 'simple', open: { general: true, papel: true } }, loadJSON('papelator2.ui'));
let papers = [], imperfCats = {}, foldCats = {}, calcoCats = {};

const refreshers = [];
let thumbTimer = null, liveTimer = null;
function changed(opts) {
  opts = opts || {};
  saveJSON('papelator3.state', state);
  refreshers.forEach(fn => { try { fn(opts.source); } catch (e) { console.log(e); } });
  if (thumbTimer) clearTimeout(thumbTimer);
  thumbTimer = setTimeout(updateThumbs, 250);
  if (ui.live && opts.live !== false) {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(liveUpdate, 500);
  }
}

// =============================================================== mensajes
let busy = false, pending = null;
let simpleRoot = null, proRoot = null;
function byId(id) {
  let el = document.getElementById(id);
  if (!el && proRoot) el = proRoot.querySelector('#' + id);
  if (!el && simpleRoot) el = simpleRoot.querySelector('#' + id);
  return el;
}
function setStatus(msg, err) {
  ['s-status', 'p-status'].forEach(id => { const el = byId(id); if (el) { el.textContent = msg || ''; el.className = 'status' + (err === true ? ' err' : err === 'busy' ? ' busy' : ''); } });
}
const tick = () => new Promise(r => setTimeout(r, 0));

// =============================================================== documento
function activeDoc() { try { return app.activeDocument || null; } catch (e) { return null; } }
function docInfo(doc) {
  const w = Math.round(Number(doc.width)), h = Math.round(Number(doc.height));
  return { w, h, ppm: engine.pxPerMm(w, h, Number(doc.resolution) || 72) };
}
function checkDoc(doc) {
  if (!doc) throw new Error('Abre un documento primero.');
  if (String(doc.mode || '').indexOf('RGB') < 0) throw new Error('El documento debe estar en RGB (Imagen › Modo › Color RGB).');
  if (String(doc.bitsPerChannel || '').indexOf('32') >= 0) throw new Error('Los documentos de 32 bits no están soportados. Pásalo a 8 o 16 bits.');
  const d = docInfo(doc);
  if (d.w * d.h > MAX_PIXELS) throw new Error('Documento demasiado grande (' + Math.round(d.w * d.h / 1e6) + ' MP). Máximo 80 MP.');
  return d;
}
function allLayers(layers, out) {
  out = out || [];
  for (let i = 0; i < layers.length; i++) { const l = layers[i]; out.push(l); if (l.layers && l.layers.length) allLayers(l.layers, out); }
  return out;
}
function tagged(doc, exact) { return allLayers(doc.layers).filter(l => (exact ? l.name === exact : String(l.name).indexOf(TAG) === 0)); }
async function createLayer(doc, name) {
  let layer = null;
  try {
    if (typeof doc.createPixelLayer === 'function') layer = await doc.createPixelLayer({ name: name });
    else if (typeof doc.createLayer === 'function') layer = await doc.createLayer({ name: name });
  } catch (e) { layer = null; }
  if (!layer) {
    await ps.action.batchPlay([{ _obj: 'make', _target: [{ _ref: 'layer' }], using: { _obj: 'layer', name: name } }], {});
    layer = doc.activeLayers[0];
  }
  if (layer.name !== name) layer.name = name;
  return layer;
}
async function putFull(doc, layer, rgba, w, h) {
  let buf = rgba;
  if (String(doc.bitsPerChannel).indexOf('16') >= 0) { buf = new Uint16Array(rgba.length); for (let i = 0; i < rgba.length; i++) buf[i] = Math.round(rgba[i] * 32768 / 255); }
  const id = await imaging.createImageDataFromBuffer(buf, { width: w, height: h, components: 4, colorSpace: 'RGB', chunky: true });
  try { await imaging.putPixels({ documentID: doc.id, layerID: layer.id, imageData: id, replace: true, targetBounds: { left: 0, top: 0 } }); }
  finally { id.dispose(); }
}
async function moveToBottom(doc, layer) {
  const top = doc.layers, last = top[top.length - 1];
  if (last.id === layer.id) return;
  if (last.isBackgroundLayer) {
    if (top.length >= 2 && top[top.length - 2].id === layer.id) return;
    await layer.move(last, constants.ElementPlacement.PLACEBEFORE);
  } else await layer.move(last, constants.ElementPlacement.PLACEAFTER);
}
async function moveToTop(doc, layer) { const first = doc.layers[0]; if (first.id !== layer.id) await layer.move(first, constants.ElementPlacement.PLACEBEFORE); }
async function readComposite(doc, w, h, targetW) {
  const opt = { documentID: doc.id, componentSize: 8, colorSpace: 'RGB' };
  if (targetW) opt.targetSize = { width: targetW };
  const res = await imaging.getPixels(opt);
  const idt = res.imageData;
  const data = await idt.getData({ chunky: true });
  const comps = idt.components, iw = idt.width, ih = idt.height, sb = res.sourceBounds || { left: 0, top: 0 };
  idt.dispose();
  if (targetW) return { data, comps, w: iw, h: ih };
  if (iw === w && ih === h) return { data, comps, w, h };
  const full = new Uint8Array(w * h * 4);
  for (let y = 0; y < ih; y++) {
    const ty = y + (sb.top | 0); if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < iw; x++) {
      const tx = x + (sb.left | 0); if (tx < 0 || tx >= w) continue;
      const s = (y * iw + x) * comps, d = (ty * w + tx) * 4;
      full[d] = data[s]; full[d + 1] = data[s + 1]; full[d + 2] = data[s + 2]; full[d + 3] = comps === 4 ? data[s + 3] : 255;
    }
  }
  return { data: full, comps: 4, w, h };
}

async function runModal(name, fn) {
  if (busy) { pending = { name, fn }; setStatus('En cola…', 'busy'); return; }
  busy = true;
  setStatus('Empezando…', 'busy');
  await tick();
  try {
    const doc = activeDoc();
    const d = checkDoc(doc);
    await core.executeAsModal(async (ctx) => {
      let sid = null;
      try { sid = await ctx.hostControl.suspendHistory({ documentID: doc.id, name: name }); } catch (e) { sid = null; }
      const onProgress = async (v, msg) => {
        setStatus(Math.round(v * 100) + '% · ' + msg, 'busy');
        try { ctx.reportProgress({ value: Math.min(0.99, v), commandName: msg }); } catch (e) { /* sin barra */ }
        await tick();
        if (ctx.isCancelled) throw new Error('Cancelado.');
      };
      try { await fn(doc, d, onProgress); if (sid !== null) await ctx.hostControl.resumeHistory(sid, true); }
      catch (e) { if (sid !== null) { try { await ctx.hostControl.resumeHistory(sid, false); } catch (_) { /* nada */ } } throw e; }
    }, { commandName: name });
  } catch (e) {
    console.log('PAPELATOR error', e);
    const msg = (e && e.message) ? e.message : String(e);
    setStatus('Error: ' + msg, true);
    busy = false; pending = null;
    return;
  }
  busy = false;
  if (pending) { const p = pending; pending = null; runModal(p.name, p.fn); }
}

// ---------- acciones
function paperJob() {
  return async (doc, d, onProgress) => {
    const t0 = Date.now();
    let backArt = null;
    if (state.calco === 'documento') {
      const mine = tagged(doc); const vis = mine.map(l => l.visible);
      mine.forEach(l => { l.visible = false; });
      const c = await readComposite(doc, d.w, d.h);
      backArt = { data: c.data, channels: c.comps };
      mine.forEach((l, i) => { l.visible = vis[i]; });
    }
    const res = await engine.renderPaper({ w: d.w, h: d.h, ppm: d.ppm, state, assets, backArt, onProgress });
    for (const l of tagged(doc, PAPER_NAME)) await l.delete();
    const layer = await createLayer(doc, PAPER_NAME);
    await putFull(doc, layer, res.rgba, d.w, d.h);
    await moveToBottom(doc, layer);
    setStatus('Papel listo (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s). Trabaja encima y pulsa «Aplicar» al terminar.');
  };
}
async function doPaper() { await runModal('Papelator · Papel de fondo', paperJob()); }

async function doApply() {
  await runModal('Papelator · Aplicar', async (doc, d, onProgress) => {
    const t0 = Date.now();
    // para leer sólo tu arte se ocultan un momento las capas de PAPELATOR; al terminar todo queda tal cual estaba
    const mine = tagged(doc), vis = mine.map(l => l.visible);
    mine.forEach(l => { l.visible = false; });
    await onProgress(0.02, 'Leyendo las capas…');
    const comp = await readComposite(doc, d.w, d.h);
    const res = await engine.renderFinal({ w: d.w, h: d.h, ppm: d.ppm, state, assets, art: comp.data, artComponents: comp.comps,
      backArt: state.calco === 'documento' ? { data: comp.data, channels: comp.comps } : null, onProgress });
    comp.data = null;
    const layer = await createLayer(doc, RESULT_NAME);
    await putFull(doc, layer, res.rgba, d.w, d.h);
    await moveToTop(doc, layer);
    mine.forEach((l, i) => { try { l.visible = vis[i]; } catch (e) { /* capa borrada */ } });
    setStatus('Aplicado en «' + RESULT_NAME + '» (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s). Ctrl/Cmd+Z lo deshace de una vez.');
  });
}
async function doRemove() {
  await runModal('Papelator · Quitar papel', async (doc) => {
    const old = tagged(doc, PAPER_NAME);
    for (const l of old) await l.delete();
    setStatus(old.length ? 'Papel de fondo eliminado.' : 'No había papel de fondo.');
  });
}
function liveUpdate() {
  const doc = activeDoc(); if (!doc) return;
  let has = false;
  try { has = tagged(doc, PAPER_NAME).filter(l => l.visible).length > 0; } catch (e) { has = false; }
  if (has) runModal('Papelator · Papel de fondo', paperJob());
}

// =============================================================== miniatura
async function toDataURL(rgb, w, h) {
  const id = await imaging.createImageDataFromBuffer(rgb, { width: w, height: h, components: 3, colorSpace: 'RGB', colorProfile: 'sRGB IEC61966-2.1', chunky: true });
  try { return 'data:image/jpeg;base64,' + await imaging.encodeImageData({ imageData: id, base64: true }); }
  finally { id.dispose(); }
}
function flatten(rgba, w, h) {
  const rgb = new Uint8Array(w * h * 3);
  for (let o = 0; o < w * h; o++) { rgb[o * 3] = rgba[o * 4]; rgb[o * 3 + 1] = rgba[o * 4 + 1]; rgb[o * 3 + 2] = rgba[o * 4 + 2]; }
  return rgb;
}
let thumbBusy = false, thumbAgain = false;
async function updateThumbs() {
  if (busy) { if (thumbTimer) clearTimeout(thumbTimer); thumbTimer = setTimeout(updateThumbs, 700); return; }
  if (thumbBusy) { thumbAgain = true; return; }
  thumbBusy = true;
  try {
    const doc = activeDoc();
    let w = 2480, h = 3508, ppm = 11.81, note = 'A4 de ejemplo';
    let art = null, comps = 4;
    if (doc) { try { const d = docInfo(doc); w = d.w; h = d.h; ppm = d.ppm; note = 'Tu documento'; } catch (e) { /* sin doc */ } }
    const sc = Math.min(240 / w, 300 / h);
    let tw = Math.max(16, Math.round(w * sc)), th = Math.max(16, Math.round(h * sc));
    if (doc) {
      try {
        if (!tagged(doc).filter(l => l.visible).length) {
          const c = await readComposite(doc, w, h, tw);
          if (c && c.w > 4) { art = c.data; comps = c.comps; tw = c.w; th = c.h; note += ' · con tu arte'; }
        }
      } catch (e) { art = null; }
    }
    const tppm = ppm * (tw / w);
    const res = art ? await engine.renderFinal({ w: tw, h: th, ppm: tppm, state, assets, art, artComponents: comps, backArt: { data: art, channels: comps } })
      : await engine.renderPaper({ w: tw, h: th, ppm: tppm, state, assets });
    const url = await toDataURL(flatten(res.rgba, tw, th), tw, th);
    ['s-thumb', 'p-thumb'].forEach(id => { const el = byId(id); if (el) el.src = url; });
    ['s-thumbnote', 'p-thumbnote'].forEach(id => { const el = byId(id); if (el) el.textContent = note; });
  } catch (e) { console.log('miniatura', e); }
  thumbBusy = false;
  if (thumbAgain) { thumbAgain = false; setTimeout(updateThumbs, 60); }
}

// =============================================================== DOM
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function chip(label, on, onClick, dot) {
  const c = h('div', 'chip' + (on ? ' on' : ''));
  if (dot) { const d = h('span', 'dot'); d.style.backgroundColor = dot; c.appendChild(d); }
  c.appendChild(h('span', '', label));
  c.addEventListener('click', onClick);
  return c;
}
// familias: el panel muestra pocas opciones; cada una agrupa variantes reales y ⟳ pasa a la siguiente
const GROUPS = ['Oficina y escuela', 'Bellas artes', 'Rústicos', 'Translúcidos'];
function typeOf(paperId) { return P.PAPER_TYPES.filter(t => t.papers.indexOf(paperId) >= 0)[0] || P.PAPER_TYPES[0]; }
function famOf(list, id) { return list.filter(f => f.items.indexOf(id) >= 0)[0] || null; }
function nextIn(arr, cur) { const i = arr.indexOf(cur); return arr[(i + 1) % arr.length]; }

// =============================================================== PANEL 1 · PRESETS
function buildSimple() {
  const groupsEl = byId('s-groups'), swEl = byId('s-swatches');
  if (!ui.group || GROUPS.indexOf(ui.group) < 0) ui.group = typeOf(state.paper).group;
  function renderGroups() {
    groupsEl.innerHTML = '';
    GROUPS.forEach(g => groupsEl.appendChild(chip(g, g === ui.group, () => { ui.group = g; saveJSON('papelator2.ui', ui); renderGroups(); renderSwatches(); })));
  }
  function renderSwatches() {
    swEl.innerHTML = '';
    const cur = typeOf(state.paper);
    P.PAPER_TYPES.filter(t => t.group === ui.group).forEach(t => {
      const on = t.id === cur.id;
      const shown = on ? state.paper : t.papers[0];
      const d = h('div', 'sw' + (on ? ' on' : ''));
      const img = h('img', 'img'); img.src = 'assets/swatches/' + shown + '.png';
      d.appendChild(img); d.appendChild(h('div', 'lbl', t.name + (t.papers.length > 1 && on ? ' · ' + (t.papers.indexOf(state.paper) + 1) + '/' + t.papers.length : '')));
      d.addEventListener('click', () => { if (!on) state.paper = t.papers[0]; changed({ source: 'simple' }); });
      swEl.appendChild(d);
    });
  }
  function chipRow(el, list, isOn, set, dotFn) {
    el.innerHTML = '';
    list.forEach(it => el.appendChild(chip(it.name, isOn(it), () => { set(it); changed({ source: 'simple' }); }, dotFn ? dotFn(it) : null)));
  }
  // familia elegida: si ya estás en ella se conserva la variante; si no, la primera
  const pickFam = (key, it) => { if (it.items.indexOf(state[key]) < 0) state[key] = it.items[0]; };
  function renderChips() {
    chipRow(byId('s-colors'), P.COLORS, it => state.color === it.id, it => { state.color = it.id; }, it => it.hex || 'transparent');
    chipRow(byId('s-estado'), P.ESTADO_FAMILIAS, it => !state.custom && it.items.indexOf(state.estado) >= 0, it => {
      state.custom = null; pickFam('estado', it);
      const e = P.ESTADOS.filter(x => x.id === state.estado)[0]; if (e) state.edad = e.edad;
    });
    chipRow(byId('s-pliegue'), P.PLIEGUES, it => state.pliegue === it.id, it => { if (state.pliegue !== it.id) { state.pliegue = it.id; state.pliegueVar = 0; } });
    chipRow(byId('s-calco'), P.CALCO_FAMILIAS, it => it.items.indexOf(state.calco) >= 0, it => pickFam('calco', it));
    chipRow(byId('s-luz'), P.LUZ_FAMILIAS, it => it.items.indexOf(state.luz) >= 0, it => pickFam('luz', it));
    chipRow(byId('s-calidad'), P.CALIDAD_FAMILIAS, it => it.items.indexOf(state.calidad) >= 0, it => pickFam('calidad', it));
    if (byId('s-impresion')) chipRow(byId('s-impresion'), P.IMPRESIONES, it => state.impresion === it.id, it => { state.impresion = it.id; });
  }
  function sliders() {
    const sc = byId('s-scale'), ex = byId('s-exposure'), ed = byId('s-edad');
    const pa = byId('s-plamt'), pw = byId('s-plwear');
    pa.value = Math.round(state.pliegueAmount * 100); byId('s-plamtval').textContent = Math.round(state.pliegueAmount * 100) + '%';
    pw.value = Math.round(state.pliegueWear * 100); byId('s-plwearval').textContent = Math.round(state.pliegueWear * 100) + '%';
    byId('s-plopts').style.display = state.pliegue && state.pliegue !== 'ninguno' ? 'block' : 'none';
    byId('s-calcoopts').style.display = state.calco && state.calco !== 'ninguno' ? 'block' : 'none';
    byId('s-calcoamt').value = Math.round(state.calcoAmount * 100); byId('s-calcoval').textContent = Math.round(state.calcoAmount * 100) + '%';
    ed.value = Math.round(state.edad * 100); byId('s-edadval').textContent = Math.round(state.edad * 100) + '%';
    sc.value = Math.round(state.scale * 100); byId('s-scaleval').textContent = Math.round(state.scale * 100) + '%';
    ex.value = Math.round(state.exposure * 100); byId('s-expval').textContent = (state.exposure > 0 ? '+' : '') + Math.round(state.exposure * 100);
  }
  renderGroups(); renderSwatches(); renderChips(); sliders();
  const live = byId('s-live'); live.checked = !!ui.live;
  refreshers.push(src => {
    if (src !== 'simple') { const g = typeOf(state.paper).group; if (g !== ui.group) { ui.group = g; renderGroups(); } }
    renderSwatches(); renderChips(); sliders();
    live.checked = !!ui.live;
  });
  const bindSlider = (id, valId, apply, fmt) => {
    const el = byId(id);
    el.addEventListener('input', e => { byId(valId).textContent = fmt(Number(e.target.value)); });
    el.addEventListener('change', e => { apply(Number(e.target.value)); changed({ source: 'slider' }); });
  };
  bindSlider('s-scale', 's-scaleval', v => { state.scale = v / 100; }, v => v + '%');
  bindSlider('s-exposure', 's-expval', v => { state.exposure = v / 100; }, v => (v > 0 ? '+' : '') + v);
  bindSlider('s-edad', 's-edadval', v => { state.edad = v / 100; }, v => v + '%');
  bindSlider('s-plamt', 's-plamtval', v => { state.pliegueAmount = v / 100; }, v => v + '%');
  bindSlider('s-plwear', 's-plwearval', v => { state.pliegueWear = v / 100; }, v => v + '%');
  bindSlider('s-calcoamt', 's-calcoval', v => { state.calcoAmount = v / 100; }, v => v + '%');
  // ⟳ de cada sección: otra versión de eso, sin tocar lo demás
  const dice = (id, fn) => { const el = byId(id); if (el) el.addEventListener('click', () => { fn(); changed({ source: 'simple' }); }); };
  dice('s-r-papel', () => { state.paper = nextIn(typeOf(state.paper).papers, state.paper); state.seedPaper = (state.seedPaper | 0) + 1; });
  dice('s-r-estado', () => { const f = famOf(P.ESTADO_FAMILIAS, state.estado); if (f && !state.custom) state.estado = nextIn(f.items, state.estado); state.seedEstado = (state.seedEstado | 0) + 1; });
  dice('s-r-pliegue', () => {
    const pre = P.PLIEGUES.filter(p => p.id === state.pliegue)[0];
    const cat = pre && foldCats[pre.group];
    const n = cat ? cat.items.length : 1;
    state.pliegueVar = ((state.pliegueVar | 0) + 1) % n;
  });
  dice('s-r-calco', () => {
    // primero las variantes del mismo calco (p. ej. otra nota a rotulador); al acabarlas, el siguiente de la familia
    const f = famOf(P.CALCO_FAMILIAS, state.calco), info = calcoCats[state.calco] || {}, n = (info.inks || []).length;
    state.seedCalco = (state.seedCalco | 0) + 1;
    if (f && (!n || state.seedCalco % n === 0)) state.calco = nextIn(f.items, state.calco);
  });
  dice('s-r-luz', () => { const f = famOf(P.LUZ_FAMILIAS, state.luz); if (f) state.luz = nextIn(f.items, state.luz); state.seedFoto = (state.seedFoto | 0) + 1; });
  dice('s-r-calidad', () => { const f = famOf(P.CALIDAD_FAMILIAS, state.calidad); if (f) state.calidad = nextIn(f.items, state.calidad); state.seedFoto = (state.seedFoto | 0) + 1; });
  byId('s-paper').addEventListener('click', doPaper);
  byId('s-apply').addEventListener('click', doApply);
  byId('s-remove').addEventListener('click', doRemove);
  byId('s-dice').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 9999); changed({ source: 'simple' }); });
  live.addEventListener('change', e => { ui.live = !!e.target.checked; saveJSON('papelator2.ui', ui); refreshers.forEach(fn => fn('live')); });
}

// =============================================================== PANEL 2 · AJUSTES
const pct = v => Math.round(v * 100) + '%';
// recuentos de imperfecciones: [máximo, paso]
const CAT_RANGE = { polvo: [600, 10], foxing: [400, 10], fibras: [30, 1], nodulos: [60, 2], descamacion: [200, 5], sol: [1, 0.05], manoseo: [1.5, 0.05], cockle: [1.5, 0.05], manchado: [1.5, 0.05] };
const SPECIAL = { manoseo: 'Suciedad de las manos', cockle: 'Ondulación por humedad', sol: 'Un lado expuesto al sol' };
function buildSections() {
  const estadoItems = [
    { t: 'picker', path: 'estado', label: 'Preset de estado', options: () => P.ESTADOS.map(e => [e.id, e.name]).concat([['custom', 'Personalizado']]),
      onSet: v => { if (v === 'custom') { state.custom = clone(currentCounts()); } else { state.estado = v; state.custom = null; const e = P.ESTADOS.filter(x => x.id === v)[0]; if (e) state.edad = e.edad; } return true; } },
    { t: 'slider', path: 'edad', label: 'Antigüedad', min: 0, max: 1.2, step: 0.01, fmt: pct },
    { t: 'slider', path: 'estadoAmount', label: 'Cantidad general', min: 0, max: 2, step: 0.05, fmt: pct }
  ];
  const cats = Object.keys(imperfCats).concat(['manoseo', 'cockle', 'sol']);
  cats.forEach(cid => {
    const name = SPECIAL[cid] || imperfCats[cid].name;
    const rg = CAT_RANGE[cid] || (imperfCats[cid] && imperfCats[cid].kind === 'stamp' ? [6, 1] : [4, 1]);
    estadoItems.push({ t: 'slider', cat: cid, label: name, min: 0, max: rg[0], step: rg[1], fmt: v => (rg[1] < 1 ? pct(v) : String(v)) });
  });
  return [
    { id: 'general', title: 'General', items: [
      { t: 'slider', path: 'intensity', label: 'Intensidad del filtro', min: 0, max: 100, step: 1, fmt: v => v + '%' },
      { t: 'slider', path: 'seed', label: 'Variación (semilla)', min: 1, max: 999, step: 1, fmt: v => '#' + v }
    ] },
    { id: 'papel', title: 'Papel', items: [
      { t: 'picker', path: 'paper', label: 'Tipo de papel', options: () => papers.map(p => [p.id, p.group + ' · ' + p.name]) },
      { t: 'text', path: 'color', label: 'Color (hex) o «original»', placeholder: '#f2ead8' },
      { t: 'slider', path: 'scale', label: 'Escala de la textura', min: 0.25, max: 4, step: 0.05, fmt: pct },
      { t: 'slider', path: 'texture', label: 'Contraste de la textura', min: 0, max: 2.5, step: 0.05, fmt: pct },
      { t: 'text', path: 'patternColor', label: 'Color de las líneas impresas (hex, vacío = original)', placeholder: '#6e9ed6' },
      { t: 'slider', path: 'patternOpacity', label: 'Intensidad de las líneas', min: 0, max: 1.5, step: 0.05, fmt: pct }
    ] },
    { id: 'estado', title: 'Estado e imperfecciones', items: estadoItems },
    { id: 'pliegues', title: 'Pliegues y arrugas', items: [
      { t: 'picker', path: 'pliegue', label: 'Cómo se dobló', options: () => P.PLIEGUES.map(c => [c.id, c.name]) },
      { t: 'slider', path: 'pliegueAmount', label: 'Relieve de los pliegues', min: 0, max: 2.5, step: 0.05, fmt: pct },
      { t: 'slider', path: 'pliegueWear', label: 'Desgaste de las aristas (tinta levantada)', min: 0, max: 3, step: 0.05, fmt: pct },
      { t: 'slider', path: 'pliegueVar', label: 'Hoja real del grupo', min: 0, max: 28, step: 1, fmt: v => '#' + (v + 1) }
    ] },
    { id: 'calco', title: 'Calco', items: [
      { t: 'picker', path: 'calco', label: 'Documento de detrás', options: () => P.CALCOS.map(c => [c.id, c.name]) },
      { t: 'slider', path: 'calcoAmount', label: 'Trasluz', min: 0, max: 3, step: 0.05, fmt: pct },
      { t: 'slider', path: 'calcoBleed', label: 'Traspaso de tinta', min: 0, max: 3, step: 0.05, fmt: pct },
      { t: 'slider', path: 'calcoPressure', label: 'Presión (relieve)', min: 0, max: 3, step: 0.05, fmt: pct },
      { t: 'slider', path: 'calcoBlur', label: 'Desenfoque', min: 0.2, max: 3, step: 0.05, fmt: pct }
    ] },
    { id: 'aplicar', title: 'Aplicar (tinta)', items: [
      { t: 'picker', path: 'impresion', label: 'Técnica de impresión', options: () => P.IMPRESIONES.map(c => [c.id, c.name]) },
      { t: 'picker', path: 'inkMode', label: 'Tipo de tinta', options: () => [['multiply', 'Transparente (se suma al papel)'], ['normal', 'Opaca (serigrafía, blanco)']] },
      { t: 'slider', path: 'grain', label: 'Deformación por el grano del papel', min: 0, max: 4, step: 0.05, fmt: pct },
      { t: 'slider', path: 'inkAge', label: 'Envejecimiento de la tinta', min: 0, max: 2, step: 0.05, fmt: pct },
      { t: 'slider', path: 'absorb', label: 'Absorción (huecos en el grano)', min: 0, max: 3, step: 0.05, fmt: pct },

    ] },
    { id: 'foto', title: 'Fotografía', items: [
      { t: 'picker', path: 'luz', label: 'Luz', options: () => P.LUCES.map(c => [c.id, c.name]) },
      { t: 'slider', path: 'exposure', label: 'Más oscura · Más clara', min: -1, max: 1, step: 0.05, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) },
      { t: 'picker', path: 'calidad', label: 'Calidad', options: () => P.CALIDADES.map(c => [c.id, c.name]) }
    ] }
  ];
}
function currentCounts() {
  if (state.custom) return state.custom;
  const e = P.ESTADOS.filter(x => x.id === state.estado)[0] || P.ESTADOS[0];
  return e.v;
}
function getPath(path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), state); }
function setPath(path, v) { const ks = path.split('.'); let o = state; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

function buildPro() {
  const host = byId('p-sections');
  const controls = [];
  buildSections().forEach(sec => {
    const grp = h('div', 'grp'), head = h('div', 'grphead');
    const tw = h('span', 'tw', ui.open[sec.id] ? '▾' : '▸');
    head.appendChild(tw); head.appendChild(h('span', 'tt', sec.title));
    const body = h('div', 'grpbody' + (ui.open[sec.id] ? '' : ' closed'));
    head.addEventListener('click', () => { ui.open[sec.id] = !ui.open[sec.id]; saveJSON('papelator2.ui', ui); body.className = 'grpbody' + (ui.open[sec.id] ? '' : ' closed'); tw.textContent = ui.open[sec.id] ? '▾' : '▸'; });
    grp.appendChild(head); grp.appendChild(body);
    sec.items.forEach(it => {
      const row = h('div', 'row');
      const getV = () => it.cat ? Number(currentCounts()[it.cat] || 0) : getPath(it.path);
      const setV = v => {
        if (it.cat) { if (!state.custom) state.custom = clone(currentCounts()); state.custom[it.cat] = v; }
        else setPath(it.path, v);
      };
      const src = 'pro:' + (it.path || it.cat);
      if (it.t === 'slider') {
        const lab = h('div', 'rl'); const val = h('span', 'rv', '');
        lab.appendChild(h('span', '', it.label)); lab.appendChild(val); row.appendChild(lab);
        const sl = document.createElement('sp-slider');
        sl.setAttribute('min', String(it.min)); sl.setAttribute('max', String(it.max)); sl.setAttribute('step', String(it.step));
        sl.setAttribute('value', String(getV()));
        const upd = e => { const v = Number(e.target.value); val.textContent = it.fmt(v); return v; };
        sl.addEventListener('input', upd);
        sl.addEventListener('change', e => { setV(upd(e)); changed({ source: src }); });
        row.appendChild(sl);
        controls.push({ src, set: () => { const v = Number(getV()); sl.value = v; val.textContent = it.fmt(v); } });
      } else if (it.t === 'picker') {
        row.appendChild(h('div', 'rl', it.label));
        const pk = document.createElement('sp-picker'); pk.setAttribute('size', 's');
        const menu = document.createElement('sp-menu'); menu.setAttribute('slot', 'options');
        const opts = it.options();
        opts.forEach(o => { const mi = document.createElement('sp-menu-item'); mi.textContent = o[1]; mi.setAttribute('value', o[0]); menu.appendChild(mi); });
        pk.appendChild(menu);
        pk.addEventListener('change', e => {
          const i = e.target.selectedIndex; if (i === undefined || i < 0 || !opts[i]) return;
          const v = opts[i][0];
          if (!(it.onSet && it.onSet(v))) setPath(it.path, v);
          changed({ source: src });
        });
        row.appendChild(pk);
        controls.push({ src, set: () => {
          const cur = it.path === 'estado' && state.custom ? 'custom' : getPath(it.path);
          const items = menu.querySelectorAll('sp-menu-item');
          for (let i = 0; i < items.length; i++) { if (opts[i][0] === cur) items[i].setAttribute('selected', ''); else items[i].removeAttribute('selected'); }
          try { pk.selectedIndex = opts.map(o => o[0]).indexOf(cur); } catch (e) { /* UXP antiguo */ }
        } });
      } else if (it.t === 'check') {
        const cb = document.createElement('sp-checkbox'); cb.textContent = it.label;
        cb.addEventListener('change', e => { setPath(it.path, !!e.target.checked); changed({ source: src }); });
        row.appendChild(cb);
        controls.push({ src, set: () => { cb.checked = !!getPath(it.path); } });
      } else if (it.t === 'text') {
        row.appendChild(h('div', 'rl', it.label));
        const tf = document.createElement('sp-textfield'); tf.setAttribute('size', 's'); tf.setAttribute('placeholder', it.placeholder || '');
        tf.addEventListener('change', e => { setPath(it.path, String(e.target.value || '').trim() || (it.path === 'color' ? 'original' : '')); changed({ source: src }); });
        row.appendChild(tf);
        controls.push({ src, set: () => { tf.value = getPath(it.path) || ''; } });
      }
      body.appendChild(row);
    });
    host.appendChild(grp);
  });
  const refreshAll = s => controls.forEach(c => { if (s !== c.src) { try { c.set(); } catch (e) { /* aún no montado */ } } });
  refreshAll();
  refreshers.push(s => { refreshAll(s); const live = byId('p-live'); if (live) live.checked = !!ui.live; });
  byId('p-paper').addEventListener('click', doPaper);
  byId('p-apply').addEventListener('click', doApply);
  byId('p-remove').addEventListener('click', doRemove);
  byId('p-reset').addEventListener('click', () => { const keep = { paper: state.paper }; state = Object.assign(clone(P.DEFAULT_STATE), keep); changed({ source: 'reset' }); });
  const live = byId('p-live'); live.checked = !!ui.live;
  live.addEventListener('change', e => { ui.live = !!e.target.checked; saveJSON('papelator2.ui', ui); refreshers.forEach(fn => fn('live')); });
}

// =============================================================== arranque
const appRoot = document.getElementById('app');
simpleRoot = document.getElementById('simple');
proRoot = document.getElementById('pro');
// pestañas: primero los presets, luego las opciones avanzadas (comparten estado y botones)
function showTab(t) {
  ui.tab = t === 'pro' ? 'pro' : 'simple'; saveJSON('papelator2.ui', ui);
  simpleRoot.style.display = ui.tab === 'simple' ? 'flex' : 'none';
  proRoot.style.display = ui.tab === 'pro' ? 'flex' : 'none';
  const ts = document.getElementById('tab-simple'), tp = document.getElementById('tab-pro');
  if (ts) ts.className = 'tab' + (ui.tab === 'simple' ? ' on' : '');
  if (tp) tp.className = 'tab' + (ui.tab === 'pro' ? ' on' : '');
  if (ui.tab === 'pro') updateThumbs();
}
document.getElementById('tab-simple').addEventListener('click', () => showTab('simple'));
document.getElementById('tab-pro').addEventListener('click', () => showTab('pro'));
let ready = null;
function init() {
  if (!ready) ready = (async () => {
    const cat = await engine.catalogs(assets);
    papers = cat.papers; imperfCats = cat.imperf; foldCats = cat.folds || {}; calcoCats = cat.calco || {};
    if (!papers.filter(p => p.id === state.paper).length) state.paper = papers[0].id;
  })();
  return ready;
}
let builtSimple = false, builtPro = false;
const shown = [];
function panelHeight(root) {
  const p = root.parentNode;
  const W = typeof window !== 'undefined' ? window : {};
  const cands = [p && p.clientHeight, p && p.offsetHeight, W.innerHeight, document.documentElement && document.documentElement.clientHeight, document.body && document.body.clientHeight];
  for (const v of cands) if (v && v > 50) return v;
  return 0;
}
function fitHeights() {
  for (const root of shown) {
    const hgt = panelHeight(root);
    if (hgt && root._h !== hgt) { root._h = hgt; root.style.height = hgt + 'px'; }
  }
}
function attach(root, arg) {
  const node = arg && arg.node ? arg.node : arg;
  if (node && typeof node.appendChild === 'function' && root.parentNode !== node && node !== root) { try { node.appendChild(root); } catch (e) { /* queda en el body */ } }
  if (shown.indexOf(root) < 0) shown.push(root);
  fitHeights(); setTimeout(fitHeights, 50); setTimeout(fitHeights, 400);
}
try { if (typeof window !== 'undefined') window.addEventListener('resize', fitHeights); } catch (e) { /* sin evento */ }
setInterval(fitHeights, 400);
uxp.entrypoints.setup({
  panels: {
    papelator: { show(arg) {
      attach(appRoot, arg); showTab(ui.tab || 'simple');
      if (!builtSimple) { builtSimple = builtPro = true; init().then(() => { buildSimple(); buildPro(); updateThumbs(); }).catch(e => setStatus('No se pudieron cargar las texturas: ' + e.message, true)); }
    } }
  }
});
try {
  ps.action.addNotificationListener(['select', 'open', 'close'], () => { if (thumbTimer) clearTimeout(thumbTimer); thumbTimer = setTimeout(updateThumbs, 500); });
} catch (e) { /* sin notificaciones */ }
