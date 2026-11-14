# PAPELATOR

Plugin de Photoshop (UXP) para convertir láminas, ilustraciones y textos en papel real: textura tileable a escala real,
imperfecciones colocadas con lógica, calco del reverso y un render final con aspecto de fotografía o escaneo.
Pensado para ser **sutil**: el papel acompaña, la lámina sigue siendo la protagonista.

## Uso

Una sola ventana (menú **Plugins › PAPELATOR**) con dos pestañas:

- **Presets**: intensidad del filtro, papel, escala, color, estado, calco, luz y calidad de la foto.
  - **Papel de fondo**: genera el papel en la capa inferior del documento para trabajar encima.
  - **Aplicar**: imprime todas las capas visibles en el papel (tinta desplazada por las fibras, huecos en el grano,
    raspaduras que se comen la tinta) y aplica la luz y la calidad de fotografía elegidas.
- **Avanzado**: todos los parámetros finos (cada imperfección por separado, calco, tinta, foto…).

**Pliegues**: 1 a 6 veces o arrugado. Cada opción reúne las hojas reales fotografiadas de ese tipo; ⟳ pasa a la
siguiente. Se usa el sombreado real de la foto (sin la luz de la toma ni el grano de su papel), a resolución completa
y ampliado en bicúbico: multiplica papel y tinta por igual. De esa misma textura salen un desplazamiento suave
(como «Desplazar» de Photoshop con la textura desenfocada) y las aristas donde la tinta se levanta.
Sliders: intensidad y bordes desgastados.

**Antigüedad**: al aplicar, la tinta envejece con el papel: los colorantes se van con la luz (amarillo y magenta antes
que cian), el negro pierde fuerza y vira a pardo, y la tinta se levanta en las fibras altas, a manchas y a escamas,
más donde el papel está más tostado (cantos, zona al sol).

**⟳ en cada sección**: otra versión de esa sección (otra variante del papel, otra colocación de las imperfecciones,
otra hoja doblada, otro calco, otra luz o calidad de la misma familia) sin tocar el resto.

**Sobreponer**: un vidrio o plástico delante del documento (acanalado, ondulado, martillado, armado, esmerilado,
lluvia, plástico). El slider es la **distancia al papel**: pegado casi no deforma; al alejarlo cada caña, ola o gota
actúa como una lente (desplaza, comprime e invierte lo de detrás) y el esmerilado desenfoca más. Encima van los
reflejos reales de la textura, el tinte del vidrio, la malla del armado y (en Avanzado) huellas y polvo.

**Maderas y cartones**: madera de abedul, OSB, aglomerado, cartón de caja, cartón kraft y cartón ondulado. No se
doblan ni transparentan y no cogen imperfecciones propias del papel (foxing, fibras, hendiduras de escritura…).

**Dónde está cada fondo** (sección 1): arriba se elige la familia y debajo el grupo.
- **Papel** → Oficina y escuela · Bellas artes · Rústicos · Translúcidos
- **Superficies** → Madera y cartón · Paredes · Suelos y piedra · Metal
- **Pantallas** → móviles, monitores, televisores, LED, libro electrónico

**Superficies construidas** (16 tipos, 71 texturas tileables; ⟳ pasa a la siguiente):
- *Paredes*: ladrillo, bloque de hormigón, sillería, azulejo, gotelé, pared lisa, pintura con grumos, yeso veneciano.
- *Suelos y piedra*: hormigón, hormigón encofrado, adoquín, terrazo, granito, asfalto.
- *Metal*: acero cepillado, metal oxidado.

Cada una tiene su **relieve**: la tinta se desplaza y se rompe en las juntas, los grumos y los poros, y la luz de la
foto lo sombrea. Slider **Relieve** para más o menos. Sólo se pueden **pintar** las que en la vida real se pintan
(gotelé, pared lisa, pintura, yeso, azulejo, bloque de hormigón); ladrillo, piedra, hormigón visto, asfalto y metal
guardan su color y la sección de color desaparece. En ninguna hay pliegues ni calco, y de estado sólo Nuevo, Usado,
Con manchas y Humedad (sin foxing, grapas, escritura ni nada propio del papel).

**Color**: cuatro muestras: el color propio del papel, dos que existen de verdad en ese papel (kraft blanco y
negro, bloc amarillo, periódico salmón…) y la rueda, que abre el selector de color de Photoshop.

**Antigüedad**: no sólo amarillea; cuanto más alta, más marcas (foxing, moho, cercos de agua, polvo, cantos), según
el estado elegido. Humedad al máximo deja la hoja destrozada.

**Borde** (sólo papel y cartón): Sin borde · Recto · Gastado · Rasgado · Roto · Quemado, con ⟳ y slider «Cuánto».
La hoja queda recortada y alrededor es transparente. Cada papel tiene su borde: folio con fibra blanca, papel de color con
el alma blanca a la vista, libreta arrancada de la espiral, acuarela con barbas, washi con fibras largas, kraft con fibra
marrón, cartulina gris en capas, cartón con sus ondas, pergamino quebradizo. Con pliegues, el canto se dobla con la hoja.

**Intensidad del filtro**: 0 % deja la lámina prácticamente igual; 50 % (por defecto) es sutil; 100 % es muy marcado.

## Estructura

```
texturas_tileables/   texturas de papel originales (fuente)
imperfecciones/       imperfecciones originales (fuente)
APOYO/                material de apoyo (trazos, rotuladores, acuarelas)
tools/                scripts que procesan las fuentes y generan los assets del plugin
  build_papers.py     tiles sin costuras (las líneas coinciden), separación tinta/papel, escala física
  build_imperf.py     manchas enteras, relieves, piezas sueltas (gotas, fibras, motas) y renglones de escritura
  build_calco.py      documentos de detrás (periódico, folio, apuntes, rotulador)
  build_extras.py     rugosidad y tamaño de grano de cada papel, manchas de envejecimiento a hoja completa
  build_imperf2.py    imperfecciones sutiles: grapas, agujeros de grapa, clip, pinza, medias lunas, arruguitas
  build_boards.py     maderas (abedul, OSB, aglomerado) y cartones (de caja, kraft) desde NUEVAS_NUEVAS/
  build_surfaces.py   superficies de NUEVAS SUPERFICIES/: aparejo recortado a su periodo, colorable, relieve (dispMm)
  build_bordes.py     bordes de la hoja (BORDES/): tiras tileables con alfa + esquinas (usa bordes_matte.py)
  build_overlays.py   Sobreponer: vidrios y plásticos de SOBREPONER/ -> reflejos + mapa de desplazamiento (+ malla)
  build_rotulador.py  calco de rotulador: notas, etiqueta y lista escritas a mano (cursiva) con charcos de tinta
  build_folds.py      pliegues y arrugas: sombreado real de cada foto (fold_sources.json), agrupado por nº de pliegues
  build_grids.py      milimetrados con geometría exacta (1/5/10 mm) y papel sintetizado sin restos de líneas
  papers_fix.py       correcciones de escala/mezcla (acuarela gruesa, cartón ondulado, verjurado)
  imperf_tune.py      color real del café (los bordes del cerco venían quemados a gris)
plugin/               el plugin UXP (manifest, interfaz, motor y assets procesados)
  src/engine.js       motor (JavaScript puro, se prueba también en Node)
  src/png.js          decodificador PNG propio (UXP no trae zlib)
```

## Regenerar los assets

```
cd tools
python3 build_papers.py      # ~5 min
python3 build_imperf.py      # ~3 min
python3 build_calco.py
python3 build_imperf2.py
python3 build_folds.py       # ~2 min
python3 build_boards.py      # maderas y cartones
python3 build_surfaces.py    # paredes, suelos, piedra y metal (PAPELATOR_TMP=carpeta temporal)
python3 build_overlays.py    # vidrios y plásticos (~10 min)
python3 build_grids.py && python3 papers_fix.py
python3 imperf_tune.py       # una sola vez, sobre los mapas originales
```

Requiere Python 3 con numpy, scipy, opencv, scikit-image y Pillow.

## Instalar

Empaquetar la carpeta `plugin/` como `.ccx` (zip con `manifest.json` en la raíz) y hacer doble clic,
o cargar `plugin/manifest.json` desde **UXP Developer Tool › Add Plugin**.
