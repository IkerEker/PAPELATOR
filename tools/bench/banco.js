// PAPELATOR · banco de pruebas de velocidad del MOTOR (Node, sin Photoshop). En el PC de Iker: banco.bat
//   node tools/bench/banco.js [--rapido] [--repes 3] [--salida archivo.json]
// Mismos trabajos, lámina, tamaños y semilla que el banco del panel (plugin/src/banco_comun.js). Mide por trabajo:
//   · frío (caché vacía: incluye leer y decodificar las texturas) y caliente (texturas ya cargadas; mediana de N),
//   · el tiempo de cada fase del motor (los mensajes de progreso que ve el usuario) y la memoria máxima,
//   · la huella del resultado: si un arreglo de velocidad cambia un solo byte, cambia la huella.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(process.env.PAPELATOR_PLUGIN || path.join(__dirname, '../../plugin'));   // otra versión: PAPELATOR_PLUGIN=<carpeta plugin>
const { decodePNG } = require(ROOT + '/src/png.js');
const B = require(ROOT + '/src/banco_comun.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RAPIDO = args.includes('--rapido');
const REPES = +opt('--repes', RAPIDO ? 1 : 3);
const SALIDA = opt('--salida', path.join(__dirname, 'resultados', 'motor_' + os.hostname() + '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'));
const SOLO = opt('--solo', null);

function motorNuevo() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(ROOT) && !k.endsWith('banco_comun.js')) delete require.cache[k];
  return require(ROOT + '/src/engine.js');
}
async function medir(E, st, w, h, ppp, art) {
  let tDec = 0, nDec = 0, bytes = 0;
  const assets = {
    json: async (n) => JSON.parse(fs.readFileSync(ROOT + '/assets/' + n, 'utf8')),
    image: async (p) => { const a = performance.now(); const buf = fs.readFileSync(ROOT + '/assets/' + p); bytes += buf.length; const img = decodePNG(buf); tDec += performance.now() - a; nDec++; return img; }
  };
  const F = B.fases(() => performance.now()); F.marca('Preparar');
  let pico = process.memoryUsage().rss;
  const onProgress = async (v, msg) => { if (msg) F.marca(msg); const m = process.memoryUsage().rss; if (m > pico) pico = m; };
  const t0 = performance.now();
  const res = await E.renderFinal({ w, h, ppm: ppp / 25.4, state: Object.assign({ seed: 3 }, st), assets, art, artComponents: 4, backArt: { data: art, channels: 4 }, onProgress });
  const total = performance.now() - t0;
  return { total, fases: F.fin(), tDec, nDec, mb: bytes / 1e6, mem: pico / 1e6, huella: B.huella(res.rgba) };
}
(async () => {
  const out = { banco: 'PAPELATOR · motor (Node)', version: require(ROOT + '/manifest.json').version, fecha: new Date().toISOString(),
    maquina: { host: os.hostname(), cpu: (os.cpus()[0] || {}).model, nucleos: os.cpus().length, ram_gb: Math.round(os.totalmem() / 1e9), so: os.platform() + ' ' + os.release(), node: process.version },
    repes: REPES, resultados: [] };
  const tam = RAPIDO ? B.TAMANOS.slice(0, 1) : B.TAMANOS;
  for (const [w, h, ppp] of tam) {
    const art = B.laminaSobreBlanco(w, h);   // lo mismo que lee el banco del panel en Photoshop
    for (const [nombre, st] of B.TRABAJOS) {
      if (SOLO && !SOLO.split(',').includes(nombre)) continue;
      const E = motorNuevo();
      const f = await medir(E, st, w, h, ppp, art);
      const c = []; for (let r = 0; r < REPES; r++) c.push(await medir(E, st, w, h, ppp, art));
      c.sort((a, b) => a.total - b.total); const med = c[c.length >> 1];
      const det = c.every(x => x.huella === f.huella);
      out.resultados.push({ trabajo: nombre, w, h, frio_ms: Math.round(f.total), caliente_ms: Math.round(med.total), texturas_ms: Math.round(f.tDec),
        texturas_n: f.nDec, texturas_mb: +f.mb.toFixed(1), fases_frio: f.fases, fases_caliente: med.fases, mem_max_mb: Math.round(Math.max(f.mem, ...c.map(x => x.mem))),
        huella: f.huella, determinista: det });
      console.log(`${w}x${h}  ${nombre.padEnd(22)} frío ${String(Math.round(f.total)).padStart(6)} ms (texturas ${Math.round(f.tDec)} ms)  caliente ${String(Math.round(med.total)).padStart(6)} ms  ${f.huella}${det ? '' : '  NO DETERMINISTA'}`);
    }
  }
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(out, null, 1));
  console.log('Resultados en', SALIDA);
})().catch(e => { console.error(e); process.exit(1); });
