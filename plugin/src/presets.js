/* PAPELATOR · presets (estado, calco, luz, calidad, impresión, colores) */
'use strict';

// colores de papel rápidos ('original' = el color propio de la textura)
const COLORS = [
  { id: 'original', name: 'Original', hex: null },
  { id: 'blanco', name: 'Blanco', hex: '#f6f5f1' },
  { id: 'marfil', name: 'Marfil', hex: '#f2ead8' },
  { id: 'crema', name: 'Crema', hex: '#eee1c3' },
  { id: 'gris', name: 'Gris', hex: '#d8d8d4' },
  { id: 'rosa', name: 'Rosa', hex: '#f2ddd6' },
  { id: 'azul', name: 'Azul', hex: '#dce6ee' },
  { id: 'negro', name: 'Negro', hex: '#2c2b2a' }
];

// Tipos de papel (lo que se elige). Cada tipo agrupa sus variantes reales; ⟳ pasa a la siguiente.
const PAPER_TYPES = [
  { id: 'folio', name: 'Folio', group: 'Lisos', papers: ['folio', 'papel_fino', 'bristol'] },
  { id: 'acuarela_fina', name: 'Acuarela fina', group: 'Lisos', papers: ['acuarela_fino', 'acuarela_satinada'] },
  { id: 'acuarela_gruesa', name: 'Acuarela gruesa', group: 'Lisos', papers: ['acuarela_grueso', 'acuarela_grueso_2'] },
  { id: 'algodon', name: 'Algodón', group: 'Lisos', papers: ['algodon', 'algodon_crema'] },
  { id: 'verjurado', name: 'Verjurado', group: 'Lisos', papers: ['verjurado', 'verjurado_marfil'] },
  { id: 'periodico', name: 'Periódico', group: 'Lisos', papers: ['periodico', 'periodico_gris'] },
  { id: 'rayado', name: 'Rayado', group: 'Impresos', papers: ['rayado', 'rayado_tenue'] },
  { id: 'cuadriculado', name: 'Cuadriculado', group: 'Impresos', papers: ['cuadricula', 'cuadricula_clara'] },
  { id: 'milimetrado', name: 'Milimetrado', group: 'Impresos', papers: ['milimetrado_azul', 'milimetrado_naranja', 'milimetrado'] },
  { id: 'punteado', name: 'Punteado', group: 'Impresos', papers: ['punteado', 'punteado_suave'] },
  { id: 'isometrico', name: 'Isométrico', group: 'Impresos', papers: ['isometrico', 'triangular'] },
  { id: 'pentagrama', name: 'Pentagrama', group: 'Impresos', papers: ['pentagrama'] },
  { id: 'kraft', name: 'Kraft', group: 'Rústicos', papers: ['kraft', 'kraft_claro'] },
  { id: 'reciclado', name: 'Reciclado', group: 'Rústicos', papers: ['reciclado', 'reciclado_motas'] },
  { id: 'hecho_mano', name: 'Hecho a mano', group: 'Rústicos', papers: ['hecho_mano', 'hecho_mano_fibroso', 'hecho_mano_grumos'] },
  { id: 'arroz', name: 'Arroz', group: 'Rústicos', papers: ['arroz', 'arroz_artesanal', 'arroz_dorado'] },
  { id: 'pergamino', name: 'Pergamino', group: 'Rústicos', papers: ['pergamino', 'pergamino_oscuro', 'pergamino_blanco'] },
  { id: 'carton', name: 'Cartón', group: 'Rústicos', papers: ['corrugado', 'corrugado_fino'] },
  { id: 'cartulina', name: 'Cartulina gris', group: 'Rústicos', papers: ['cartulina_gris', 'reciclado_gris'] },
  { id: 'vegetal', name: 'Vegetal', group: 'Translúcidos', papers: ['vegetal', 'vegetal_arrugado'] },
  { id: 'encerado', name: 'Encerado', group: 'Translúcidos', papers: ['encerado', 'horno'] }
];

// Estado del papel: cada preset cuenta una historia distinta.
// edad: antigüedad (0 nuevo · 1 muy viejo) → amarilleo desigual, cantos tostados, tinta envejecida.
// v: imperfecciones (número de veces; polvo/fibras/foxing = piezas por A4)
//    especiales: manoseo (suciedad de las manos en la esquina inferior), cockle (ondulación por humedad),
//    manchado (envejecimiento irregular de hoja completa), sol (un lado expuesto a la luz).
const ESTADOS = [
  { id: 'nuevo', name: 'Nuevo', desc: 'Recién salido del paquete', edad: 0, v: { fibras: 2, nodulos: 6, polvo: 12 } },
  { id: 'usado', name: 'Usado', desc: 'Manoseado unos meses', edad: 0.08, v: { manoseo: 0.35, huella_grasa: 1, polvo: 35, fibras: 2, cockle: 0.15, media_luna: 1 } },
  { id: 'escuela', name: 'Escuela', desc: 'Goma, lápiz y apuntes', edad: 0.1, v: { grafito: 1, goma: 2, escritura: 1, huella_grasa: 1, manoseo: 0.4, polvo: 40, cockle: 0.2, grapa_agujero: 1, media_luna: 1, arruguita: 1 } },
  { id: 'bar', name: 'Mesa de bar', desc: 'Café, grasa y ceniza', edad: 0.12, v: { cafe: 1, salp_cafe: 1, huella_grasa: 2, grasa: 1, quemadura: 1, manoseo: 0.35, polvo: 35, cockle: 0.25, arruguita: 1 } },
  { id: 'oficial', name: 'Documento oficial', desc: 'Sellado y mecanografiado', edad: 0.3, v: { sello_seco: 1, mecano: 1, huella_tinta: 1, manoseo: 0.25, polvo: 40, foxing: 12, manchado: 0.3, grapa_marca: 1, grapa_agujero: 1, clip_huella: 1 } },
  { id: 'libro', name: 'Libro viejo', desc: 'Cantos tostados y foxing', edad: 0.55, v: { foxing: 45, polvo: 60, manoseo: 0.5, manchado: 0.35, fibras: 3, media_luna: 1 } },
  { id: 'correo', name: 'Correo antiguo', desc: 'Matasellos y viaje', edad: 0.45, v: { matasellos: 1, huella_tinta: 1, foxing: 35, manoseo: 0.35, polvo: 70, manchado: 0.4, cockle: 0.3, media_luna: 2, arruguita: 1 } },
  { id: 'archivo', name: 'Archivado años', desc: 'Carpeta, ácido y polvo', edad: 0.65, v: { foxing: 70, polvo: 160, manchado: 0.8, adhesivo: 1, descamacion: 25, fibras: 4, manoseo: 0.2, cockle: 0.3, grapa_agujero: 2, clip_huella: 1, pinza: 1, media_luna: 1 } },
  { id: 'sol', name: 'Expuesto al sol', desc: 'Un lado tostado por la luz', edad: 0.35, v: { sol: 1, polvo: 45, manchado: 0.4, cockle: 0.2 } },
  { id: 'humedad', name: 'Humedad', desc: 'Agua, moho y ondulación', edad: 0.4, v: { agua: 2, humedad: 1, foxing: 120, polvo: 70, manchado: 0.6, cockle: 0.8, arruguita: 1 } },
  { id: 'taller', name: 'Taller', desc: 'Grasa, huellas y barro', edad: 0.15, v: { grasa: 2, huella_tinta: 2, huella_grasa: 3, barro: 1, grafito: 1, manoseo: 0.8, polvo: 130, cockle: 0.35, arruguita: 2, media_luna: 1, grapa_marca: 1 } },
  { id: 'velas', name: 'Velas y ceniza', desc: 'Cera, quemaduras y calor', edad: 0.2, v: { cera: 2, quemadura: 2, calor: 1, polvo: 35, manoseo: 0.2 } },
  { id: 'abandonado', name: 'Sótano abandonado', desc: 'Inundado y olvidado', edad: 0.9, v: { agua: 3, humedad: 2, foxing: 220, barro: 1, polvo: 320, sangrado: 1, manchado: 1, manoseo: 0.2, cockle: 1, grapa_agujero: 1, clip_huella: 1, arruguita: 2, media_luna: 2 } }
];

// Pliegues: número de veces que se dobló (líneas de pliegue que se ven) o arrugado. ⟳ recorre las hojas reales
// de ese grupo; el relieve y el desgaste de las aristas son sliders.
const PLIEGUES = [
  { id: 'ninguno', name: 'Sin pliegues' },
  { id: '1', name: '1 vez', group: '1' },
  { id: '2', name: '2 veces', group: '2' },
  { id: '3', name: '3 veces', group: '3' },
  { id: '4', name: '4 veces', group: '4' },
  { id: '5', name: '5 veces', group: '5' },
  { id: '6', name: '6 veces', group: '6' },
  { id: 'arrugado', name: 'Arrugado', group: 'arrugado' }
];
// estados antiguos guardados -> nuevos
const PLIEGUE_ALIAS = { mitad: '1', mitad_gastado: '1', cuatro: '2', cuatro_gastado: '2', seis: '3', ocho: '4', nueve: '4', acordeon: '4',
  cuadricula: '5', casual: 'arrugado', arrugado_suave: 'arrugado', arrugado_plegado: 'arrugado' };

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

// Familias: lo que se ve en el panel principal. Cada una agrupa variantes concretas; ⟳ pasa a la siguiente.
const ESTADO_FAMILIAS = [
  { id: 'nuevo', name: 'Nuevo', items: ['nuevo'] },
  { id: 'usado', name: 'Usado', items: ['usado'] },
  { id: 'escuela', name: 'Escuela', items: ['escuela'] },
  { id: 'oficina', name: 'Oficina', items: ['oficial', 'archivo'] },
  { id: 'manchas', name: 'Con manchas', items: ['bar', 'taller', 'velas'] },
  { id: 'antiguo', name: 'Antiguo', items: ['libro', 'correo', 'sol'] },
  { id: 'humedad', name: 'Humedad', items: ['humedad', 'abandonado'] }
];
const CALCO_FAMILIAS = [
  { id: 'ninguno', name: 'Sin calco', items: ['ninguno'] },
  { id: 'documento', name: 'Tu documento', items: ['documento'] },
  { id: 'impreso', name: 'Texto impreso', items: ['periodico', 'folio'] },
  { id: 'manuscrito', name: 'A mano', items: ['apuntes', 'rotulador'] }
];
const LUZ_FAMILIAS = [
  { id: 'ninguna', name: 'Sin foto', items: ['ninguna'] },
  { id: 'escaner', name: 'Escáner', items: ['escaner'] },
  { id: 'natural', name: 'Luz natural', items: ['dia', 'ventana'] },
  { id: 'lampara', name: 'Lámpara', items: ['lampara', 'foco'] },
  { id: 'movil', name: 'Flash', items: ['flash', 'sombra'] }
];
const CALIDAD_FAMILIAS = [
  { id: 'perfecta', name: 'Perfecta', items: ['perfecta'] },
  { id: 'escaner', name: 'Escáner', items: ['escaner_pro', 'escaner_oficina'] },
  { id: 'movil', name: 'Móvil', items: ['movil', 'movil_antiguo'] },
  { id: 'fotocopia', name: 'Fotocopia', items: ['fotocopia'] },
  { id: 'analogica', name: 'Analógica', items: ['analogica'] }
];

const DEFAULT_STATE = {
  version: 3,
  seed: 11,
  seedPaper: 0,                       // ⟳ de cada sección
  seedEstado: 0,
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
  pliegue: 'ninguno',
  pliegueAmount: 1,                   // cuánto relieve tienen los pliegues
  pliegueWear: 1,                     // cuánto se gastan las aristas (tinta levantada)
  pliegueVar: 0,                      // hoja real dentro del grupo (⟳)
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

module.exports = { COLORS, PAPER_TYPES, ESTADO_FAMILIAS, CALCO_FAMILIAS, LUZ_FAMILIAS, CALIDAD_FAMILIAS, PLIEGUE_ALIAS, ESTADOS, PLIEGUES, CALCOS, IMPRESIONES, LUCES, CALIDADES, DEFAULT_STATE };
