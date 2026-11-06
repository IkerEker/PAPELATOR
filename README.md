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
```

Requiere Python 3 con numpy, scipy, opencv, scikit-image y Pillow.

## Instalar

Empaquetar la carpeta `plugin/` como `.ccx` (zip con `manifest.json` en la raíz) y hacer doble clic,
o cargar `plugin/manifest.json` desde **UXP Developer Tool › Add Plugin**.
