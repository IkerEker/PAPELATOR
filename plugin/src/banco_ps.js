/* PAPELATOR · banco de pruebas DENTRO de Photoshop (menú del panel ☰ › «Banco de pruebas…»).
   Para medir en el PC de Iker lo que la sandbox no puede: el motor en UXP, el intercambio de píxeles con Photoshop
   (getPixels / putPixels) y qué ofrece el anfitrión (Workers, WebGL, WebAssembly…) para una posible vía por GPU.
   Crea documentos temporales, mide, los cierra sin guardar y escribe un JSON. No toca los documentos del usuario
   ni cambia nada del resultado normal del plugin. */
'use strict';
const B = require('./banco_comun.js');

const PS_TRABAJOS = ['papel_folio', 'papel_kraft_libro', 'humedad_abandonado', 'pliegue_4_ventana', 'borde_rasgado', 'vidrio_acanalado', 'movil', 'todo_junto'];

function anfitrion(api) {
  const { ps, uxp, imaging, version } = api;
  const cap = { plugin: version };
  try { cap.photoshop = ps.app.version; } catch (e) { cap.photoshop = '?'; }
  try { cap.uxp = (uxp.versions && (uxp.versions.uxp || JSON.stringify(uxp.versions))) || '?'; } catch (e) { cap.uxp = '?'; }
  try { cap.so = require('os').platform() + ' ' + require('os').release(); } catch (e) { cap.so = '?'; }
  const tipo = (n) => { try { return typeof globalThis[n]; } catch (e) { return 'error'; } };
  ['Worker', 'SharedArrayBuffer', 'Atomics', 'WebAssembly', 'OffscreenCanvas', 'ImageData', 'createImageBitmap'].forEach(n => { cap[n] = tipo(n); });
  try { cap.nucleos = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null; } catch (e) { cap.nucleos = null; }
  try { cap.webgpu = !!(typeof navigator !== 'undefined' && navigator.gpu); } catch (e) { cap.webgpu = 'error'; }
  for (const k of ['webgl2', 'webgl', '2d']) {
    try { const c = document.createElement('canvas'); const g = c && c.getContext ? c.getContext(k) : null; cap['canvas_' + k] = g ? 'sí' : 'no'; }
    catch (e) { cap['canvas_' + k] = 'error: ' + e.message; }
  }
  try { cap.imaging = Object.keys(imaging).sort(); } catch (e) { cap.imaging = []; }
  // WebAssembly con SIMD (otra vía rápida en CPU, sin cambiar el resultado si se hace bien)
  try { cap.wasm_simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { cap.wasm_simd = 'no'; }
  return cap;
}

async function bancoPS(api) {
  const { ps, uxp, imaging, engine, assetsBase, createLayer, putFull, readComposite, setStatus, tick } = api;
  const app = ps.app, now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const out = { banco: 'PAPELATOR · Photoshop', fecha: new Date().toISOString(), anfitrion: anfitrion(api), resultados: [], errores: [] };
  // las texturas se leen como siempre, pero midiendo cuánto cuesta leerlas y decodificarlas
  let tDec = 0, nDec = 0;
  const assets = { json: assetsBase.json, image: async (p) => { const a = now(); const img = await assetsBase.image(p); tDec += now() - a; nDec++; return img; } };
  const vaciarCache = () => { const c = engine._cache; for (const k of Object.keys(c)) delete c[k]; c.mips = {}; };
  await ps.core.executeAsModal(async (ctx) => {
    for (const [w, h, ppp] of B.TAMANOS) {
      let doc = null;
      try {
        let t = now();
        doc = await app.documents.add({ width: w, height: h, resolution: ppp, mode: 'RGBColorMode', fill: 'white', name: 'PAPELATOR banco ' + w + 'x' + h });
        const tNuevo = now() - t;
        const art = B.lamina(w, h);
        t = now(); const capa = await createLayer(doc, 'lámina'); await putFull(doc, capa, art, w, h); const tPutArte = now() - t;
        for (const [nombre, st] of B.TRABAJOS) {
          if (PS_TRABAJOS.indexOf(nombre) < 0) continue;
          for (const frio of [true, false]) {
            setStatus('Banco de pruebas · ' + w + '×' + h + ' · ' + nombre + (frio ? ' (frío)' : '') + '…', 'busy'); await tick();
            if (frio) vaciarCache();
            tDec = 0; nDec = 0;
            const r = { trabajo: nombre, w, h, frio, nuevo_doc_ms: Math.round(tNuevo), put_lamina_ms: Math.round(tPutArte) };
            let t0 = now();
            const comp = await readComposite(doc, w, h);
            r.leer_capas_ms = Math.round(now() - t0);
            const F = B.fases(now); F.marca('Preparar');
            t0 = now();
            const res = await engine.renderFinal({ w, h, ppm: ppp / 25.4, state: Object.assign({ seed: 3 }, st), assets, art: comp.data, artComponents: comp.comps,
              backArt: st.calco === 'documento' ? { data: comp.data, channels: comp.comps } : null, onProgress: async (v, m) => { if (m) F.marca(m); } });
            r.motor_ms = Math.round(now() - t0); r.fases = F.fin(); r.texturas_ms = Math.round(tDec); r.texturas_n = nDec;
            t0 = now(); const lay = await createLayer(doc, 'resultado ' + nombre); r.crear_capa_ms = Math.round(now() - t0);
            t0 = now(); await putFull(doc, lay, res.rgba, w, h); r.escribir_capa_ms = Math.round(now() - t0);
            r.total_ms = r.leer_capas_ms + r.motor_ms + r.crear_capa_ms + r.escribir_capa_ms;
            r.huella = B.huella(res.rgba);
            try { await lay.delete(); } catch (e) { /* nada */ }
            out.resultados.push(r);
          }
        }
      } catch (e) { out.errores.push(w + 'x' + h + ': ' + ((e && e.message) || e)); }
      finally {
        if (doc) { try { if (doc.closeWithoutSaving) await doc.closeWithoutSaving(); else await doc.close(ps.constants.SaveOptions.DONOTSAVECHANGES); } catch (e) { out.errores.push('cerrar: ' + e.message); } }
      }
    }
  }, { commandName: 'Papelator · Banco de pruebas' });
  vaciarCache();
  // guardar: en la carpeta de datos del plugin y, si se puede, donde diga el usuario
  const nombre = 'banco_papelator_' + out.fecha.slice(0, 16).replace(/[:T]/g, '-') + '.json';
  const texto = JSON.stringify(out, null, 1);
  let donde = '';
  try { const f = await uxp.storage.localFileSystem.getDataFolder(); const file = await f.createFile(nombre, { overwrite: true }); await file.write(texto); donde = file.nativePath || nombre; } catch (e) { out.errores.push('guardar: ' + e.message); }
  try { const g = await uxp.storage.localFileSystem.getFileForSaving(nombre, { types: ['json'] }); if (g) { await g.write(texto); donde = g.nativePath || donde; } } catch (e) { /* cancelado */ }
  return { donde, out };
}

module.exports = { bancoPS, anfitrion };
