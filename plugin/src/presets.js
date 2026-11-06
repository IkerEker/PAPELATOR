/* PAPELATOR · presets (estado, calco, luz, calidad, colores) */
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
// Números = cuántas veces aparece cada imperfección (las de polvo/fibras/foxing son piezas por A4).
const ESTADOS = [
  { id: 'nuevo', name: 'Nuevo', desc: 'Recién salido del paquete', v: { fibras: 3, nodulos: 8, polvo: 25 } },
  { id: 'oficina', name: 'Oficina', desc: 'Usado a diario', v: { huella_grasa: 2, huella_tinta: 1, clip: 1, grafito: 1, goma: 1, polvo: 70, fibras: 3, nodulos: 6 } },
  { id: 'escuela', name: 'Escuela', desc: 'Apuntes, goma y lápiz', v: { grafito: 2, goma: 3, escritura: 1, salp_tinta: 1, huella_grasa: 1, fibras: 3, polvo: 60 } },
  { id: 'bar', name: 'Mesa de bar', desc: 'Café, grasa y ceniza', v: { cafe: 2, salp_cafe: 1, huella_grasa: 2, grasa: 1, quemadura: 1, polvo: 50 } },
  { id: 'oficial', name: 'Documento oficial', desc: 'Sellado, mecanografiado y archivado', v: { sello_seco: 1, mecano: 1, clip: 1, huella_tinta: 1, polvo: 40, foxing: 20 } },
  { id: 'correo', name: 'Correo antiguo', desc: 'Matasellos y viaje', v: { matasellos: 1, huella_tinta: 1, foxing: 50, adhesivo: 1, polvo: 90, edad: 0.4 } },
  { id: 'archivo', name: 'Archivado años', desc: 'Carpeta, óxido y ácido', v: { foxing: 90, polvo: 220, acida: 1, adhesivo: 1, clip: 1, descamacion: 40, fibras: 4, edad: 0.6 } },
  { id: 'sol', name: 'Expuesto al sol', desc: 'Amarilleado desigual', v: { uv: 2, calor: 1, acida: 1, polvo: 60, sol: 1, edad: 0.3 } },
  { id: 'humedad', name: 'Humedad', desc: 'Agua, moho y manchas', v: { agua: 3, humedad: 2, foxing: 160, polvo: 100, edad: 0.35 } },
  { id: 'taller', name: 'Taller', desc: 'Grasa, huellas y barro', v: { grasa: 3, huella_tinta: 3, huella_grasa: 3, barro: 1, grafito: 1, polvo: 180 } },
  { id: 'velas', name: 'Velas y ceniza', desc: 'Cera, quemaduras y calor', v: { cera: 3, quemadura: 2, grasa: 1, calor: 1, polvo: 40 } },
  { id: 'abandonado', name: 'Sótano abandonado', desc: 'Inundado y olvidado', v: { agua: 4, humedad: 3, foxing: 300, barro: 2, polvo: 450, sangrado: 1, edad: 0.9 } }
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

// Luz de la fotografía (al Aplicar)
const LUCES = [
  { id: 'ninguna', name: 'Sin foto' },
  { id: 'escaner', name: 'Escáner' },
  { id: 'dia', name: 'Luz de día' },
  { id: 'ventana', name: 'Ventana lateral' },
  { id: 'foco', name: 'Foco central' },
  { id: 'flash', name: 'Flash de móvil' },
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
  version: 2,
  seed: 11,
  intensity: 50,                      // 0 = casi sin cambio · 50 = sutil (por defecto) · 100 = muy marcado
  paper: 'folio',
  color: 'original',                  // id de COLORS o '#rrggbb'
  scale: 1,                           // escala de la textura (1 = tamaño real)
  texture: 1,                         // contraste de la textura
  patternColor: '',                   // color de las líneas impresas (vacío = original)
  patternOpacity: 1,
  estado: 'nuevo',
  estadoAmount: 1,
  custom: null,                       // recuentos por imperfección (panel de ajustes)
  calco: 'ninguno',
  calcoAmount: 1,                     // cuánto se transparenta
  calcoBleed: 1,                      // traspaso de tinta (rotulador, fluorescente)
  calcoPressure: 1,                   // relieve de la presión (boli)
  calcoBlur: 1,
  inkMode: 'multiply',
  grain: 1,                           // desplazamiento de la tinta por el grano
  absorb: 1,                          // la tinta se mete en el papel (huecos, sangrado)
  luz: 'ninguna',
  exposure: 0,                        // -1 más oscura · +1 más clara
  calidad: 'perfecta',
  hideOriginals: true
};

module.exports = { COLORS, ESTADOS, CALCOS, LUCES, CALIDADES, DEFAULT_STATE };
