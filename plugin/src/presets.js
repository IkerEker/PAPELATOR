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

// Color: el panel enseña sólo 4 muestras: el color propio del papel, dos que existen de verdad en ESE papel y
// «elegir» (selector de color de Photoshop). Clave = id del tipo (PAPER_TYPES); '_' = cualquier otro.
const COLOR_SUGERIDOS = {
  folio: [['#f1e9d6', 'Ahuesado'], ['#f5ecb4', 'Amarillo pastel']],
  periodico: [['#f0d2bf', 'Salmón (prensa económica)'], ['#e4d3a3', 'Amarillento']],
  rayado: [['#f6eb9e', 'Amarillo de bloc'], ['#f1e9d6', 'Ahuesado']],
  cuadriculado: [['#f1e9d6', 'Ahuesado'], ['#dcebd4', 'Verde pastel']],
  milimetrado: [['#f1e9d6', 'Ahuesado'], ['#e9ddb6', 'Amarillento']],
  punteado: [['#f1e9d6', 'Ahuesado'], ['#2c2b2a', 'Negro']],
  isometrico: [['#f1e9d6', 'Ahuesado'], ['#dbe6f0', 'Azul pálido']],
  pentagrama: [['#eee1c3', 'Crema'], ['#e3d2a8', 'Envejecido']],
  acuarela_fina: [['#efe6d0', 'Natural'], ['#dcdad4', 'Gris claro']],
  acuarela_gruesa: [['#efe5cc', 'Natural'], ['#d8dfe2', 'Gris azulado']],
  algodon: [['#f7f6f2', 'Blanco'], ['#eee1c3', 'Crema']],
  verjurado: [['#c9d3db', 'Azul Ingres'], ['#e3cfa0', 'Ocre']],
  arroz: [['#f5f3ee', 'Blanco'], ['#efd8d3', 'Rosa washi']],
  cartulina: [['#2b2a29', 'Negra'], ['#d8c8a6', 'Arena']],
  kraft: [['#ebe6dc', 'Kraft blanco'], ['#33302c', 'Kraft negro']],
  reciclado: [['#cfccc5', 'Gris'], ['#e9dfc8', 'Crema']],
  hecho_mano: [['#ece2cc', 'Natural'], ['#ebd4cd', 'Rosa pétalo']],
  pergamino: [['#efe2c0', 'Claro'], ['#d6bc84', 'Antiguo']],
  vegetal: [['#d9e5ee', 'Azul'], ['#f1e9b8', 'Amarillo']],
  horno: [['#d8b78a', 'Sin blanquear'], ['#f5f3ee', 'Blanco']],
  sup_bloques: [['#ecebe6', 'Pintado de blanco'], ['#b9c6cf', 'Azul grisáceo']],
  sup_azulejo: [['#b8d3c3', 'Verde agua'], ['#a8c3d8', 'Azul']],
  sup_gotele: [['#ecc9b2', 'Salmón'], ['#d6d5d0', 'Gris perla']],
  sup_pared_lisa: [['#d6d5d0', 'Gris perla'], ['#c8d3bf', 'Verde salvia']],
  sup_pintura: [['#eceae4', 'Blanco'], ['#c98a6a', 'Terracota']],
  sup_yeso: [['#c9c6bf', 'Gris piedra'], ['#d9b8ad', 'Rosa empolvado']],
  _: [['#f2ead8', 'Marfil'], ['#dce6ee', 'Azul']]
};

// Tipos de papel (lo que se elige). Cada tipo agrupa sus variantes reales; ⟳ pasa a la siguiente.
// Organización: tres familias (Papel · Superficies · Pantallas) y dentro, grupos; cada tipo agrupa variantes (⟳).
const FAMILIAS_PAPEL = [
  { id: 'papel', name: 'Papel', groups: ['Oficina y escuela', 'Bellas artes', 'Rústicos', 'Translúcidos'] },
  { id: 'superficies', name: 'Superficies', groups: ['Madera y cartón', 'Paredes', 'Suelos y piedra', 'Metal'] },
  { id: 'pantallas', name: 'Pantallas', groups: ['Pantallas'] }
];
// Qué estados tienen sentido en cada material (en los demás, desaparecen)
const ESTADOS_POR_MATERIAL = {
  paper: null,
  carton: ['nuevo', 'usado', 'oficina', 'manchas', 'humedad'],
  wood: ['nuevo', 'usado', 'manchas', 'humedad'],
  surface: ['nuevo', 'usado', 'manchas', 'humedad']
};
const PAPER_TYPES = [
  { id: 'folio', name: 'Folio', group: 'Oficina y escuela', papers: ['folio', 'papel_fino', 'bristol'] },
  { id: 'periodico', name: 'Periódico', group: 'Oficina y escuela', papers: ['periodico', 'periodico_gris'] },
  { id: 'rayado', name: 'Rayado', group: 'Oficina y escuela', papers: ['rayado', 'rayado_tenue'] },
  { id: 'cuadriculado', name: 'Cuadriculado', group: 'Oficina y escuela', papers: ['cuadricula', 'cuadricula_clara'] },
  { id: 'milimetrado', name: 'Milimetrado', group: 'Oficina y escuela', papers: ['milimetrado_azul', 'milimetrado_naranja', 'milimetrado'] },
  { id: 'punteado', name: 'Punteado', group: 'Oficina y escuela', papers: ['punteado', 'punteado_suave'] },
  { id: 'isometrico', name: 'Isométrico', group: 'Oficina y escuela', papers: ['isometrico', 'triangular'] },
  { id: 'pentagrama', name: 'Pentagrama', group: 'Oficina y escuela', papers: ['pentagrama'] },
  { id: 'acuarela_fina', name: 'Acuarela fina', group: 'Bellas artes', papers: ['acuarela_fino', 'acuarela_satinada'] },
  { id: 'acuarela_gruesa', name: 'Acuarela gruesa', group: 'Bellas artes', papers: ['acuarela_grueso', 'acuarela_grueso_2'] },
  { id: 'algodon', name: 'Algodón', group: 'Bellas artes', papers: ['algodon', 'algodon_crema'] },
  { id: 'verjurado', name: 'Verjurado', group: 'Bellas artes', papers: ['verjurado', 'verjurado_marfil'] },
  { id: 'arroz', name: 'Arroz', group: 'Bellas artes', papers: ['arroz', 'arroz_artesanal', 'arroz_dorado'] },
  { id: 'cartulina', name: 'Cartulina gris', group: 'Bellas artes', papers: ['cartulina_gris'] },
  { id: 'kraft', name: 'Kraft', group: 'Rústicos', papers: ['kraft', 'kraft_claro'] },
  { id: 'reciclado', name: 'Reciclado', group: 'Rústicos', papers: ['reciclado', 'reciclado_motas', 'reciclado_gris'] },
  { id: 'hecho_mano', name: 'Hecho a mano', group: 'Rústicos', papers: ['hecho_mano', 'hecho_mano_fibroso', 'hecho_mano_grumos'] },
  { id: 'pergamino', name: 'Pergamino', group: 'Rústicos', papers: ['pergamino', 'pergamino_oscuro'] },

  { id: 'madera', name: 'Madera', group: 'Madera y cartón', papers: ['madera', 'madera_vetas', 'madera_clara', 'madera_nudos'] },
  { id: 'osb', name: 'OSB', group: 'Madera y cartón', papers: ['osb', 'osb_realista', 'osb_prensado', 'osb_detalle', 'osb_detalle2', 'osb_fino', 'osb_viejo'] },
  { id: 'aglomerado', name: 'Aglomerado', group: 'Madera y cartón', papers: ['aglomerado', 'aglomerado_marron', 'aglomerado_granular', 'aglomerado_uniforme', 'particulas', 'virutas'] },
  { id: 'caja', name: 'Cartón de caja', group: 'Madera y cartón', papers: ['caja', 'caja_4', 'caja_kraft_2', 'caja_kraft_3', 'caja_kraft_4', 'caja_reciclado', 'caja_3', 'caja_kraft', 'caja_kraft_5'] },
  { id: 'carton_kraft', name: 'Cartón kraft', group: 'Madera y cartón', papers: ['carton_kraft', 'carton_kraft_2', 'carton_kraft_3'] },
  { id: 'carton', name: 'Cartón ondulado', group: 'Madera y cartón', papers: ['corrugado', 'corrugado_fino'] },
  { id: 'sup_ladrillo', name: 'Ladrillo', group: 'Paredes', papers: ['ladrillo_1', 'ladrillo_2', 'ladrillo_3', 'ladrillo_4', 'ladrillo_5'] },
  { id: 'sup_bloques', name: 'Bloque de hormigón', group: 'Paredes', papers: ['bloques_1', 'bloques_2', 'bloques_3', 'bloques_4'] },
  { id: 'sup_sillar', name: 'Sillería', group: 'Paredes', papers: ['sillar_1', 'sillar_2', 'sillar_3', 'sillar_4'] },
  { id: 'sup_azulejo', name: 'Azulejo', group: 'Paredes', papers: ['azulejo_1', 'azulejo_2', 'azulejo_3', 'azulejo_4'] },
  { id: 'sup_gotele', name: 'Gotelé', group: 'Paredes', papers: ['gotele_1', 'gotele_2', 'gotele_3', 'gotele_4'] },
  { id: 'sup_pared_lisa', name: 'Pared lisa', group: 'Paredes', papers: ['pared_lisa_1', 'pared_lisa_2', 'pared_lisa_3', 'pared_lisa_4', 'pared_lisa_5'] },
  { id: 'sup_pintura', name: 'Pintura con grumos', group: 'Paredes', papers: ['pintura_1', 'pintura_2', 'pintura_3', 'pintura_4', 'pintura_5'] },
  { id: 'sup_yeso', name: 'Yeso veneciano', group: 'Paredes', papers: ['yeso_1', 'yeso_2', 'yeso_3', 'yeso_4'] },
  { id: 'sup_hormigon', name: 'Hormigón', group: 'Suelos y piedra', papers: ['hormigon_1', 'hormigon_2', 'hormigon_3', 'hormigon_4', 'hormigon_5', 'hormigon_6', 'hormigon_7', 'hormigon_8'] },
  { id: 'sup_encofrado', name: 'Hormigón encofrado', group: 'Suelos y piedra', papers: ['encofrado_1', 'encofrado_2', 'encofrado_3', 'encofrado_4'] },
  { id: 'sup_adoquin', name: 'Adoquín', group: 'Suelos y piedra', papers: ['adoquin_1', 'adoquin_2', 'adoquin_3', 'adoquin_4'] },
  { id: 'sup_terrazo', name: 'Terrazo', group: 'Suelos y piedra', papers: ['terrazo_1', 'terrazo_2', 'terrazo_3', 'terrazo_4'] },
  { id: 'sup_granito', name: 'Granito', group: 'Suelos y piedra', papers: ['granito_1', 'granito_2', 'granito_3', 'granito_4'] },
  { id: 'sup_asfalto', name: 'Asfalto', group: 'Suelos y piedra', papers: ['asfalto_1', 'asfalto_2', 'asfalto_3', 'asfalto_4'] },
  { id: 'sup_acero', name: 'Acero cepillado', group: 'Metal', papers: ['acero_1', 'acero_2', 'acero_3', 'acero_4'] },
  { id: 'sup_oxido', name: 'Metal oxidado', group: 'Metal', papers: ['oxido_1', 'oxido_2', 'oxido_3', 'oxido_4'] },
  { id: 'pantalla_oled', name: 'Móvil OLED', group: 'Pantallas', papers: ['pantalla_oled'] },
  { id: 'pantalla_lcd', name: 'Monitor LCD', group: 'Pantallas', papers: ['pantalla_lcd'] },
  { id: 'pantalla_vieja', name: 'Portátil viejo', group: 'Pantallas', papers: ['pantalla_vieja'] },
  { id: 'pantalla_crt', name: 'Tele de tubo', group: 'Pantallas', papers: ['pantalla_crt'] },
  { id: 'pantalla_led', name: 'LED gigante', group: 'Pantallas', papers: ['pantalla_led'] },
  { id: 'pantalla_eink', name: 'Libro electrónico', group: 'Pantallas', papers: ['pantalla_eink'] },
  { id: 'vegetal', name: 'Vegetal', group: 'Translúcidos', papers: ['vegetal', 'vegetal_arrugado'] },
  { id: 'horno', name: 'Papel de horno', group: 'Translúcidos', papers: ['horno', 'encerado', 'pergamino_blanco'] }
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


// Bordes de la hoja: la hoja deja de llenar el documento y queda recortada con alfa. Cinco maneras, pero cada papel
// tiene SU borde: un folio rasgado deja fibra blanca fina, una libreta se arranca de la espiral, la acuarela tiene
// barbas, el kraft fibra larga, la cartulina gris enseña su alma clara, el cartón ondulado sus ondas…
const BORDES = [
  { id: 'ninguno', name: 'Sin borde' },
  { id: 'recto', name: 'Recto' },
  { id: 'gastado', name: 'Gastado' },
  { id: 'rasgado', name: 'Rasgado' },
  { id: 'roto', name: 'Roto' },
  { id: 'quemado', name: 'Quemado' }
];
// tipo de papel (PAPER_TYPES) -> familia de borde
const BORDE_FAM = {
  folio: 'oficina', milimetrado: 'oficina', isometrico: 'oficina', pentagrama: 'oficina',
  rayado: 'cuaderno', cuadriculado: 'cuaderno', punteado: 'cuaderno',
  periodico: 'periodico',
  acuarela_fina: 'acuarela', acuarela_gruesa: 'acuarela', algodon: 'acuarela', verjurado: 'acuarela',
  arroz: 'washi', hecho_mano: 'artesanal', reciclado: 'reciclado', kraft: 'kraft', pergamino: 'pergamino',
  vegetal: 'vegetal', horno: 'vegetal', cartulina: 'gris',
  caja: 'carton', carton: 'carton', carton_kraft: 'carton_liso'
};
// qué es cada borde en cada familia (lo que se cuenta en el panel) y lo que no existe
const BORDE_NO = { vegetal: ['quemado'], carton: ['quemado'], carton_liso: ['quemado'] };
const BORDE_DESC = {
  recto: 'cortado limpio',
  gastado: { _: 'cantos con muescas y alguna esquina doblada', carton: 'cantos aplastados y raspados', carton_liso: 'cantos aplastados y raspados',
    periodico: 'cantos viejos con muescas y esquinas redondeadas', pergamino: 'cantos viejos con muescas y esquinas redondeadas' },
  rasgado: { _: 'rasgado a mano', cuaderno: 'arrancada de la espiral', acuarela: 'barbas de papel de algodón', washi: 'fibras largas sueltas',
    artesanal: 'barbas gruesas de papel hecho a mano', periodico: 'fibra corta y gris', kraft: 'fibra larga marrón', gris: 'se separa en capas y enseña el alma clara',
    pergamino: 'quebradizo, a escamas', vegetal: 'nítido, con el filo blanquecino', carton: 'se ven las ondas de dentro', carton_liso: 'fibra gruesa deshilachada', reciclado: 'fibra corta, mullida' },
  roto: { _: 'desgarros que entran en la hoja y solapas levantadas', periodico: 'quebradizo, le faltan trozos', pergamino: 'quebradizo, le faltan trozos',
    gris: 'arrancado a capas', carton: 'cara arrancada: se ven las ondas', carton_liso: 'fibra arrancada', kraft: 'fibra arrancada a mechones' },
  quemado: 'cantos quemados y tostados'
};

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
  { id: 'arrugado', name: 'Arrugado', group: 'arrugado' },
  { id: 'muy_arrugado', name: 'Muy arrugado', group: 'muy_arrugado' }
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

// Sobreponer: lo que va delante del documento. ⟳ recorre las texturas reales de cada tipo.
const SOBRES = [
  { id: 'ninguno', name: 'Nada' },
  { id: 'acanalado', name: 'Acanalado' },
  { id: 'ondulado', name: 'Ondulado' },
  { id: 'martillado', name: 'Martillado' },
  { id: 'armado', name: 'Armado' },
  { id: 'esmerilado', name: 'Esmerilado' },
  { id: 'lluvia', name: 'Lluvia' },
  { id: 'plastico', name: 'Plástico' }
];

const DEFAULT_STATE = {
  version: 4,
  seed: 11,
  seedPaper: 0,                       // ⟳ de cada sección
  seedEstado: 0,
  seedFoto: 0,
  seedCalco: 0,
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
  screenZoom: 1,                      // pantalla: tamaño del píxel (cerca/lejos)
  screenBright: 1,                    // pantalla: brillo
  sobre: 'ninguno',                   // vidrio/cristal/plástico delante del papel
  sobreVar: 0,
  sobreDist: 0.25,                    // distancia al papel (0 = pegado · 1 = 4 cm)
  sobreTrans: 1,                      // transparencia (1 = limpio · 0 = gastado, arañado, casi opaco)
  sobreRefl: 1,                       // cuánta luz devuelve
  sobreDirt: 0.25,                    // huellas, grasa y polvo sobre el vidrio
  sobreScale: 1,
  borde: 'ninguno',                   // borde de la hoja (alfa alrededor)
  bordeAmount: 1,                     // cuánto: más lados rasgados, más irregular, más esquinas dobladas
  seedBorde: 0,                       // ⟳
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
  encuadre: 0,                        // 0 = foto de frente · 1 = torcida, descentrada y mal enfocada
  hideOriginals: false
};

module.exports = { BORDES, BORDE_FAM, BORDE_NO, BORDE_DESC, COLOR_SUGERIDOS, FAMILIAS_PAPEL, ESTADOS_POR_MATERIAL, COLORS, SOBRES, PAPER_TYPES, ESTADO_FAMILIAS, CALCO_FAMILIAS, LUZ_FAMILIAS, CALIDAD_FAMILIAS, PLIEGUE_ALIAS, ESTADOS, PLIEGUES, CALCOS, IMPRESIONES, LUCES, CALIDADES, DEFAULT_STATE };
