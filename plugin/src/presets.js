/* PAPELATOR · presets (estado, calco, luz, calidad, impresión, colores) */
'use strict';

// colores de papel rápidos ('original' = el color propio de la textura)
const COLORS = [
  { id: 'original', name: 'Original', hex: null },
  { id: 'blanco', name: 'Blanco', hex: '#f6f5f1' },
  { id: 'marfil', name: 'Marfil', hex: '#f2ead8' },
  { id: 'crema', name: 'Crema', hex: '#eee1c3' },
  { id: 'hueso', name: 'Hueso', hex: '#e7e1d3' },
  { id: 'gris', name: 'Gris', hex: '#d8d8d4' },
  { id: 'amarillo', name: 'Amarillo', hex: '#f4e9b0' },
  { id: 'rosa', name: 'Rosa', hex: '#f2ddd6' },
  { id: 'azul', name: 'Azul', hex: '#dce6ee' },
  { id: 'verde', name: 'Verde', hex: '#e0e9d9' },
  { id: 'kraft', name: 'Kraft', hex: '#b88d62' },
  { id: 'negro', name: 'Negro', hex: '#2c2b2a' }
];

// Estado del papel: cada preset cuenta una historia distinta.
// edad: antigüedad (0 nuevo · 1 muy viejo) → amarilleo desigual, cantos tostados, tinta envejecida.
// v: imperfecciones (número de veces; polvo/fibras/foxing = piezas por A4)
//    especiales: manoseo (suciedad de las manos en la esquina inferior), cockle (ondulación por humedad),
//    manchado (envejecimiento irregular de hoja completa), sol (un lado expuesto a la luz).
const ESTADOS = [
  { id: 'nuevo', name: 'Nuevo', desc: 'Recién salido del paquete', edad: 0, v: { fibras: 2, nodulos: 6, polvo: 12 } },
  { id: 'usado', name: 'Usado', desc: 'Manoseado unos meses', edad: 0.08, v: { manoseo: 0.35, huella_grasa: 1, polvo: 35, fibras: 2, cockle: 0.15 } },
  { id: 'escuela', name: 'Escuela', desc: 'Goma, lápiz y apuntes', edad: 0.1, v: { grafito: 1, goma: 2, escritura: 1, huella_grasa: 1, manoseo: 0.4, polvo: 40, cockle: 0.2 } },
  { id: 'bar', name: 'Mesa de bar', desc: 'Café, grasa y ceniza', edad: 0.12, v: { cafe: 1, salp_cafe: 1, huella_grasa: 2, grasa: 1, quemadura: 1, manoseo: 0.35, polvo: 35, cockle: 0.25 } },
  { id: 'oficial', name: 'Documento oficial', desc: 'Sellado y mecanografiado', edad: 0.3, v: { sello_seco: 1, mecano: 1, huella_tinta: 1, manoseo: 0.25, polvo: 40, foxing: 12, manchado: 0.3 } },
  { id: 'libro', name: 'Libro viejo', desc: 'Cantos tostados y foxing', edad: 0.55, v: { foxing: 45, polvo: 60, manoseo: 0.5, manchado: 0.35, fibras: 3 } },
  { id: 'correo', name: 'Correo antiguo', desc: 'Matasellos y viaje', edad: 0.45, v: { matasellos: 1, huella_tinta: 1, foxing: 35, manoseo: 0.35, polvo: 70, manchado: 0.4, cockle: 0.3 } },
  { id: 'archivo', name: 'Archivado años', desc: 'Carpeta, ácido y polvo', edad: 0.65, v: { foxing: 70, polvo: 160, manchado: 0.8, adhesivo: 1, descamacion: 25, fibras: 4, manoseo: 0.2, cockle: 0.3 } },
  { id: 'sol', name: 'Expuesto al sol', desc: 'Un lado tostado por la luz', edad: 0.35, v: { sol: 1, polvo: 45, manchado: 0.4, cockle: 0.2 } },
  { id: 'humedad', name: 'Humedad', desc: 'Agua, moho y ondulación', edad: 0.4, v: { agua: 2, humedad: 1, foxing: 120, polvo: 70, manchado: 0.6, cockle: 0.8 } },
  { id: 'taller', name: 'Taller', desc: 'Grasa, huellas y barro', edad: 0.15, v: { grasa: 2, huella_tinta: 2, huella_grasa: 3, barro: 1, grafito: 1, manoseo: 0.8, polvo: 130, cockle: 0.35 } },
  { id: 'velas', name: 'Velas y ceniza', desc: 'Cera, quemaduras y calor', edad: 0.2, v: { cera: 2, quemadura: 2, calor: 1, polvo: 35, manoseo: 0.2 } },
  { id: 'abandonado', name: 'Sótano abandonado', desc: 'Inundado y olvidado', edad: 0.9, v: { agua: 3, humedad: 2, foxing: 220, barro: 1, polvo: 320, sangrado: 1, manchado: 1, manoseo: 0.2, cockle: 1 } }
];

// Calco: otro documento por la otra cara
const CALCOS = [
  { id: 'ninguno', name: 'Sin calco' },
  { id: 'documento', name: 'Tu documento', desc: 'El propio diseño visto por detrás' },
  { id: 'periodico', name: 'Periódico', desc: 'Columnas, titular y foto' },
  { id: 'folio', name: 'Folio impreso', desc: 'Texto continuo' },
  { id: 'apuntes', name: 'Apuntes a boli', desc: 'Bolígrafo, tachones y fluorescente' },
  { id: 'rotulador', name: 'Rotulador', desc: 'Traspasa donde se apoya la punta' }
];

// Cómo se imprimió la lámina (al Aplicar)
const IMPRESIONES = [
  { id: 'offset', name: 'Offset', desc: 'Tinta fina que se mete en el papel' },
  { id: 'tipografia', name: 'Tipografía', desc: 'Letra hundida y borde más cargado' },
  { id: 'inkjet', name: 'Inkjet', desc: 'Tinta líquida que se abre en las fibras' },
  { id: 'laser', name: 'Láser / tóner', desc: 'Tóner encima del papel' }
];

// Luz de la fotografía (al Aplicar)
const LUCES = [
  { id: 'ninguna', name: 'Sin foto' },
  { id: 'escaner', name: 'Escáner' },
  { id: 'dia', name: 'Luz de día' },
  { id: 'ventana', name: 'Ventana lateral' },
  { id: 'foco', name: 'Foco central' },
  { id: 'flash', name: 'Flash de móvil' },
  { id: 'sombra', name: 'Sombra del móvil' },
  { id: 'lampara', name: 'Lámpara cálida' }
];

// Calidad de la fotografía / captura
const CALIDADES = [
  { id: 'perfecta', name: 'Perfecta' },
  { id: 'escaner_pro', name: 'Escáner profesional' },
  { id: 'escaner_oficina', name: 'Escáner de oficina' },
  { id: 'movil', name: 'Móvil moderno' },
  { id: 'movil_antiguo', name: 'Móvil antiguo' },
  { id: 'fotocopia', name: 'Fotocopia' },
  { id: 'analogica', name: 'Cámara analógica' }
];

const DEFAULT_STATE = {
  version: 3,
  seed: 11,
  intensity: 50,                      // 0 = casi sin cambio · 50 = sutil (por defecto) · 100 = muy marcado
  paper: 'folio',
  color: 'original',                  // id de COLORS o '#rrggbb'
  scale: 1,                           // escala de la textura (1 = tamaño real)
  texture: 1,                         // contraste de la textura
  patternColor: '',
  patternOpacity: 1,
  estado: 'nuevo',
  edad: 0,                            // antigüedad 0..1
  estadoAmount: 1,
  custom: null,                       // recuentos por imperfección (panel de ajustes)
  calco: 'ninguno',
  calcoAmount: 1,
  calcoBleed: 1,
  calcoPressure: 1,
  calcoBlur: 1,
  impresion: 'offset',
  inkMode: 'multiply',
  inkAge: 1,                          // cuánto envejece la tinta con la antigüedad
  grain: 1,                           // deformación de la tinta por el grano del papel
  absorb: 1,                          // la tinta se mete en el papel (huecos, sangrado)
  luz: 'ninguna',
  exposure: 0,
  calidad: 'perfecta',
  hideOriginals: true
};

module.exports = { COLORS, ESTADOS, CALCOS, IMPRESIONES, LUCES, CALIDADES, DEFAULT_STATE };
