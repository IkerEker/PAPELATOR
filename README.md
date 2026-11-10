# PAPELATOR

Plugin de Photoshop (UXP) para convertir láminas, ilustraciones y textos en papel real: textura tileable a escala real,
imperfecciones colocadas con lógica, calco del reverso y un render final con aspecto de fotografía o escaneo.
Pensado para ser **sutil**: el papel acompaña, la lámina sigue siendo la protagonista.

## Uso

Dos paneles (menú **Plugins › PAPELATOR**):

- **PAPELATOR** (presets): intensidad del filtro, papel, escala, color, estado, calco, luz y calidad de la foto.
  - **Papel de fondo**: genera el papel en la capa inferior del documento para trabajar encima.
  - **Aplicar**: imprime todas las capas visibles en el papel (tinta desplazada por las fibras, huecos en el grano,
    raspaduras que se comen la tinta) y aplica la luz y la calidad de fotografía elegidas.
- **PAPELATOR · Ajustes**: todos los parámetros finos (cada imperfección por separado, calco, tinta, foto…).

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
python3 build_grids.py && python3 papers_fix.py
python3 imperf_tune.py       # una sola vez, sobre los mapas originales
```

Requiere Python 3 con numpy, scipy, opencv, scikit-image y Pillow.

## Instalar

Empaquetar la carpeta `plugin/` como `.ccx` (zip con `manifest.json` en la raíz) y hacer doble clic,
o cargar `plugin/manifest.json` desde **UXP Developer Tool › Add Plugin**.
