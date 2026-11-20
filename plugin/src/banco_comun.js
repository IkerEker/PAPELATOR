/* PAPELATOR · banco de pruebas: lo que comparten el banco del panel (Photoshop) y el de Node.
   Mismos trabajos, misma lámina, misma semilla, misma huella. No interviene en el uso normal del plugin. */
'use strict';

// lámina de prueba determinista (sin fuentes): titular, texto en barras, bloque, círculo, rayas
function lamina(w, h) {
  const a = new Uint8Array(w * h * 4);
  const s = w / 1240;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; let r = 0, g = 0, b = 0, al = 0;
    const X = x / s, Y = y / s;
    if (Y > 120 && Y < 230 && X > 110 && X < 900 && ((X | 0) % 70) < 52) { r = 20; g = 20; b = 24; al = 255; }
    if (Y > 380 && Y < 900 && X > 115 && X < 1130 && ((Y | 0) % 46) < 22 && ((X * 7 + (Y | 0) * 13) % 97) < 80) { r = g = b = 30; al = 255; }
    if (X > 110 && X < 600 && Y > 1000 && Y < 1300) { r = 230; g = 170; b = 40; al = 255; }
    const dx = X - 900, dy = Y - 1150; if (dx * dx + dy * dy < 200 * 200) { r = 30; g = 90; b = 170; al = 255; }
    if (Y > 1400 && Y < 1664 && X > 110 && X < 1130 && ((Y - 1400) % 22) < 3) { al = 255; }
    if (Y > 1680 && Y < 1700 && X > 110 && X < 1130) { r = g = b = 10; al = 255; }
    a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = al;
  }
  return a;
}

// lo que lee Photoshop del documento del banco (fondo blanco + la lámina encima): la lámina sobre blanco, opaca
function laminaSobreBlanco(w, h) {
  const a = lamina(w, h);
  for (let o = 0; o < a.length; o += 4) if (a[o + 3] === 0) { a[o] = a[o + 1] = a[o + 2] = 255; a[o + 3] = 255; }
  return a;
}

const TRABAJOS = [
  ['papel_folio', { paper: 'folio' }],
  ['papel_kraft_libro', { paper: 'kraft', estado: 'libro', edad: 0.7 }],
  ['imperf_bar', { paper: 'hecho_mano', estado: 'bar', edad: 0.5 }],
  ['humedad_abandonado', { paper: 'pergamino', estado: 'abandonado', edad: 1.2 }],
  ['pliegue_4_ventana', { paper: 'folio', pliegue: '4', luz: 'ventana' }],
  ['muy_arrugado_lampara', { paper: 'periodico', pliegue: 'muy_arrugado', luz: 'lampara' }],
  ['borde_rasgado', { paper: 'folio', borde: 'rasgado', bordeAmount: 0.8 }],
  ['borde_gastado', { paper: 'pergamino', borde: 'gastado', bordeAmount: 0.9 }],
  ['calco_rotulador', { paper: 'folio', calco: 'rotulador', calcoAmount: 2 }],
  ['vidrio_acanalado', { paper: 'folio', sobre: 'acanalado', sobreDist: 0.5 }],
  ['vidrio_plastico', { paper: 'folio', sobre: 'plastico', sobreTrans: 0.5 }],
  ['ladrillo', { paper: 'ladrillo_1' }],
  ['madera_osb', { paper: 'osb' }],
  ['pantalla_crt', { paper: 'pantalla_crt', luz: 'lampara', calidad: 'analogica' }],
  ['movil', { paper: 'folio', calidad: 'movil', encuadre: 0.4, luz: 'dia' }],
  ['fotocopia', { paper: 'folio', calidad: 'fotocopia' }],
  ['todo_junto', { paper: 'kraft', estado: 'correo', edad: 0.8, pliegue: '3', borde: 'rasgado', bordeAmount: 0.6, calco: 'apuntes',
    sobre: 'ondulado', luz: 'lampara', calidad: 'movil' }]
];
// A4 a 150 y 300 ppp
const TAMANOS = [[1240, 1754, 150], [2480, 3508, 300]];

// huella FNV-1a de 32 bits (sin crypto, igual en UXP y en Node): si un arreglo cambia un byte, cambia
function huella(u8) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

// cronómetro de fases a partir de los mensajes de progreso del motor
function fases(now) {
  const lista = []; let cur = null;
  return {
    marca(msg) { const t = now(); if (cur) cur.ms += t - cur.t; cur = lista.find(f => f.fase === msg); if (!cur) { cur = { fase: msg, ms: 0 }; lista.push(cur); } cur.t = t; },
    fin() { this.marca('_fin'); return lista.filter(f => f.fase !== '_fin').map(f => ({ fase: f.fase, ms: Math.round(f.ms) })); }
  };
}

module.exports = { lamina, laminaSobreBlanco, TRABAJOS, TAMANOS, huella, fases };
