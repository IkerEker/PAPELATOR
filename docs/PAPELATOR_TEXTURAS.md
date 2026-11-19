# PAPELATOR — Cómo funciona y cómo usa las texturas
*(Ficha para unificar todas las texturas de los plugins en un repositorio común)*

- **Plugin:** PAPELATOR 3.17.0, panel UXP para Photoshop 24.2 o superior.
- **Repositorio actual:** `IkerEker/PAPELATOR` (rama `main`).
- **Fecha:** 19-11-2026.
- **Va acompañada de dos tablas:**
  - `PAPELATOR_inventario_texturas.csv` (481 filas): cada textura procesada que lleva el plugin y su foto original.
  - `PAPELATOR_fuentes_originales.csv` (784 filas): cada foto original del repositorio, con su huella md5, si se usa y con qué está duplicada.

---

## 0. Resumen para quien vaya a unificar

1. PAPELATOR **no lee las fotos originales en tiempo de ejecución**. Lee unos **derivados ya procesados**: PNG de 8 bits y JSON dentro de `plugin/assets/`, empaquetados en el `.ccx`. Esos derivados los generan unos scripts de Python (`tools/build_*.py`) a partir de las fotos originales.
2. Al repositorio común le pido sobre todo **las fotos originales** y **unos metadatos estables**. El procesado sigue siendo propio de PAPELATOR (formatos y calibraciones muy específicos).
3. Cada derivado guarda de qué original sale. Si los originales cambian de ruta o de nombre, basta con una tabla de correspondencias `id_común → ruta`. Después se regeneran los derivados con los mismos scripts.
4. **Escala física:** todo en PAPELATOR va en **milímetros reales**. Cada original necesita saber cuánto mide en la realidad, o cómo medirlo. Es el dato más importante que debería llevar el repositorio común.
5. **Lo que puede ser común entre plugins:** los originales y, si interesa, algunos derivados genéricos:
   - tiles de papel sin costura;
   - recortes con alfa (manchas, fibras, bordes);
   - mapas de sombreado de pliegues;
   - mapas normales de vidrios.

---

## 1. Qué hace PAPELATOR

PAPELATOR convierte cualquier lámina de Photoshop en algo **impreso sobre una superficie real y fotografiado o escaneado**. El panel tiene dos pestañas en una sola ventana: *Presets* (sencilla) y *Avanzado*.

**Secciones del panel:**
- **Fondo**, organizado en tres familias:
  - *Papel*: Oficina y escuela, Bellas artes, Rústicos, Translúcidos.
  - *Superficies*: Madera y cartón, Paredes, Suelos y piedra, Metal.
  - *Pantallas*: móvil OLED, LCD, portátil viejo, tele de tubo, LED gigante y libro electrónico.
- **Color del papel:** el suyo, dos sugeridos o elegir con el selector de Photoshop.
- **Estado:** Nuevo, Usado, Escuela, Oficina, Con manchas, Antiguo y Humedad, más el slider de antigüedad. Cada estado coloca imperfecciones reales.
- **Pliegues:** de 1 a 6 veces, arrugado y muy arrugado.
- **Borde de la hoja:** Corte limpio, Gastado o Rasgado, con un slider de desgaste. La hoja queda recortada, con su sombra.
- **Calco:** lo que transparenta del reverso.
- **Sobreponer:** vidrios y plásticos delante.
- **Al aplicar:** luz (escáner, natural, lámpara, flash…), calidad (escáner, móvil, fotocopia, analógica) y encuadre.

**Dos botones:**
- **Papel de fondo:** crea la capa de papel para trabajar encima.
- **Aplicar:** «imprime» las capas visibles en ese papel y simula la foto o el escaneo. Es un único paso del historial.

---

## 2. Arquitectura

```
Fotos originales (carpetas del repo)          ← lo que iría al repositorio común
        │  tools/build_*.py  (Python: numpy, scipy, Pillow, OpenCV, scikit-image)
        ▼
plugin/assets/*.json + PNG 8 bits              ← derivados propios de PAPELATOR (≈ 290 MB)
        │  empaquetado en el .ccx
        ▼
plugin/src/engine.js (JavaScript puro)         ← motor: compone todo en memoria
plugin/src/png.js                              ← decodificador PNG propio (UXP no trae zlib)
plugin/main.js, index.html, styles.css         ← panel UXP, lectura/escritura de capas
```

**Restricciones técnicas que condicionan los formatos:**
- **PNG:** solo PNG de **8 bits** sin entrelazado (gris, gris+alfa, RGB, RGBA o paleta). No se admiten 16 bits, JPG ni WebP, porque el decodificador es propio.
- **Lectura local:** el plugin solo lee archivos de su carpeta (`localFileSystem: plugin`). En Photoshop no puede leer un repositorio externo; los derivados tienen que ir dentro del `.ccx`.
- **El motor también corre en Node:** las pruebas se hacen en `tools/test/` (`run2.js`, `batch.js`, `smoke2.js`, `layout2.js`).

---

## 3. Convenciones comunes de todos los derivados

| Convención | Detalle |
|---|---|
| Escala física | Todo en **mm reales**. El motor convierte con los px/mm del documento (`ppm` = resolución / 25,4; si no hay resolución, lado largo / 297). |
| Tileable | Los fondos (papeles, superficies, vidrios) son **tiles sin costura**. Los que tienen patrón (rayas, cuadrícula, ladrillos, azulejos) se recortan a un **número entero de periodos** para que las líneas casen. |
| Separar luz y color | Casi nunca se usa el color de la foto. Se guarda la **luminancia relativa** (detalle, relieve, sombreado) y el color lo pone el motor (el papel elegido, el color elegido). Así una textura vale para cualquier color. |
| Codificación del detalle | Valor 8 bits con **128 = neutro**. Desviación real = `(v - 128) / gain`; `gain` se guarda en el JSON. |
| Luz multiplicativa | En bordes y esquinas: `RGB = luz / 2` (128 = ×1). |
| Alfa | Recortes de croma o de fondo negro con **alfa fino** (fibras semitransparentes) y color sin contaminar por el verde. |
| Variantes | Cada «tipo» agrupa varias texturas reales. El botón ⟳ pasa a la siguiente. |

---

## 4. Cada familia de texturas: de dónde sale, qué se guarda y cómo se usa

### 4.1 Papeles (44 texturas de papel + 6 pantallas procedurales)

- **Fuente:** `texturas_tileables/` (78 fotos de papel). Los índices de origen están en `tools/indices/pap_index.json`.
- **Scripts:** `build_papers.py` (+ `build_extras.py`, `build_grids.py`, `papers_fix.py`).
- **Proceso:**
  1. Se quita el degradado de luz de la foto.
  2. Se hace tileable por mezcla en los bordes.
  3. Se separa la tinta impresa en los papeles con patrón.
  4. Se mide el grano y la rugosidad (`rough`, `grainMm`).
- **Derivados en `plugin/assets/papers/`:**
  - `<id>_d.png`: detalle en gris (grano, fibras, relieve), con 128 = neutro y ganancia `gain`.
  - `<id>_c.png`: color propio a baja resolución (solo en los tipos `color`: kraft, pergamino, motas…).
  - `<id>_ink.png`: líneas impresas, en los tipos `pattern` (rayado, cuadrícula, milimetrado, punteado, isométrico, pentagrama). Los milimetrados se **sintetizan** con geometría exacta de 1, 5 y 10 mm (`build_grids.py`).
- **Ficha en `papers.json`:**
  - identidad y fuente: `id`, `name`, `group`, `kind` (neutral, color, pattern o screen), `source` (foto original);
  - escala: `tileMm` (lo que mide el tile en la realidad), `size`;
  - detalle: `gain`, `detailStd`, `rough`, `grainMm`;
  - color y comportamiento: `color` (color medio), `translucency`, `ageK` (cuánto envejece);
  - opcionales: `mix` (anti-repetición), `material`.
- **Uso:** el papel = color × (1 + detalle), con anti-repetición (dos lecturas desplazadas mezcladas por ruido). El detalle sirve también de **mapa de desplazamiento** de la tinta y de relieve que revela la luz.
- **Miniaturas:** `plugin/assets/swatches/<id>.png`.

### 4.2 Madera y cartón (31)

- **Fuente:** `NUEVAS_NUEVAS/` (fotos de abedul, OSB, aglomerado, cartón de caja, kraft) + 2 cartones ondulados antiguos.
- **Script:** `build_boards.py`. Mismo formato que los papeles, con `material: wood | carton`. La onda del cartón se recorta a un número entero de periodos (6,5 mm).

### 4.3 Superficies construidas (71)

- **Fuente:** `NUEVAS SUPERFICIES/`, que reúne 16 tipos:
  - paredes: ladrillo, bloque de hormigón, sillería, azulejo, gotelé, pared lisa, pintura con grumos, yeso veneciano;
  - suelos y piedra: hormigón, hormigón encofrado, adoquín, terrazo, granito, asfalto;
  - metal: acero cepillado, metal oxidado.
- **Script:** `build_surfaces.py`.
- **Proceso:**
  - Los aparejos (ladrillo, bloque, adoquín, azulejo…) se recortan a un **periodo entero** por autocorrelación.
  - Las superficies que se pintan en la realidad se guardan solo como relieve (`colorable: true`; el color lo elige el usuario). Las de color propio no se pueden pintar.
- **Campos extra:** `dispMm` (cuánto se desvía la tinta, en mm) y `heightMm` (escala del relieve que la desvía).
- **Uso:** a partir del detalle se construye un mapa de alturas. La tinta se desplaza por su gradiente, se sombrea con la luz de la foto y, en superficies, tapa como pintura.

### 4.4 Imperfecciones (33 categorías, 145 piezas)

- **Fuentes:**
  - `imperfecciones/` (147 fotos; índice en `tools/indices/imp_index.json`);
  - `NUEVAS/TEXTURA_IMPERFECCIONES/` (35 fotos de grapas, clips, pinzas, medias lunas y arruguitas; índice `nimp_index.json`).
- **Scripts:** `build_imperf.py`, `build_imperf2.py`, `imperf_tune.py` (color real del café) y `build_extras.py` (manchado de hoja completa).
- **Tipos de pieza:**
  - **stamp:** mancha entera recortada (`<cat>_<n>.png` + máscara `_m.png` opcional). Tiene un tamaño real en mm (`size`), un modo de fusión (`multiply`, `grease`, `relief`, `erase`, `wax`) y una regla de colocación (`place`: cualquier sitio, cantos, esquina de grapa, zona de clip, abajo…).
  - **sprites:** **atlas** de piezas sueltas (gotas, motas de foxing, fibras, polvo, grumos) con rectángulo y tamaño de cada pieza (`<cat>_atlas.png`, `sprites[].r`, `mm`).
  - **lines:** renglones de hendiduras de escritura y de máquina, con su interlineado real (`pitch_mm`).
  - **sheet:** manchado a hoja completa.
- **Uso:** cada «estado» es una receta de cuántas piezas de cada categoría se colocan, según la antigüedad. Cada pieza se erosiona con ruido para que ninguna repetición sea igual. Además: relieve (`relief`), absorción en los valles del grano y ondulación por humedad.

### 4.5 Pliegues (76)

- **Fuente:** `NUEVAS/PLIEGUES/` (81 fotos de hojas dobladas y arrugadas; índice `tools/fold_sources.json`).
- **Script:** `build_folds.py`.
- **Derivado:** `folds/p<grupo>_<n>.png`, el **sombreado real** de la hoja (sin la luz de la toma ni el grano de su papel) a tamaño A4. Codificación 128 = plano, con `gain` y `strength`.
- **Grupos:** 1 a 6 pliegues, arrugado y muy arrugado.
- **Uso:** multiplica papel y tinta. De él salen el desplazamiento de la tinta, las aristas donde la tinta se levanta y la altura de cada panel (para que el contorno de la hoja haga un codo en cada pliegue).

### 4.6 Sobreponer: vidrios y plásticos (49)

- **Fuente:** `SOBREPONER/` (49 fotos sobre negro).
- **Script:** `build_overlays.py`.
- **Derivados:**
  - `overlays/<id>_r.png`: reflejos;
  - `<id>_n.png`: normal / pendiente del vidrio (RG, 128 = plano) para la refracción;
  - `<id>_m.png`: malla metálica del vidrio armado.
  - Todos son tiles con `tileMm`.
- **Familias:** acanalado, ondulado, martillado, armado, esmerilado, lluvia y plástico.
- **Uso:** la refracción es la pendiente multiplicada por la distancia vidrio-papel (slider). Luego vienen el esmerilado, los reflejos, el tinte y el desgaste.

### 4.7 Calco: lo que transparenta del reverso (4 documentos)

- **Fuente:** se generan en los scripts (`build_calco.py`, `build_rotulador.py`) con tipografía y con trazos de `APOYO/TRAZOS/` (2 fotos).
- **Derivados:** `calco/*.png`, tinta en gris a tamaño A4 (más charcos de rotulador, flúor y presión).
- **«Tu documento»:** usa el propio arte espejado y no necesita textura.

### 4.8 Bordes de la hoja (14 tiras + 40 esquinas)

- **Fuente:** `BORDES/` (163 fotos sobre croma verde o negro; 156 distintas). Las listas usadas están en `tools/bordes_sets.json`.
- **Scripts:** `build_bordes.py` + `bordes_matte.py` (recorte con alfa fino) + `bordes_v1.py` (utilidades).
- **Tiras** (`bordes/<tipo>.png`: RGB = luz/2, A = alfa, a 20 px/mm; `<tipo>_k.png` = alma clara que asoma):
  - **Tipos:** blanco, bisel (papel de color), periódico, acuarela, washi, artesanal, kraft, gris, vegetal, viejo, viejo_roto, espiral, carton_roto, cartón.
  - **Calibración:** cada foto se calibra **a escala real** por algo físico: el ancho de la franja de fibras, el ancho del alma, el paso de la espiral (6,35 mm), el paso de las ondas del cartón (7 mm) o la anchura de la foto.
  - **Solo el filo:** se quita la forma grande del desgarro y se quedan los dientes, las fibras y las muescas. La luz de la foto se usa solo a 0,5-3 mm del filo.
  - **Empalme:** todas las fotos de un tipo se empalman en una tira cíclica.
- **Esquinas** (`bordes/esq_<tipo>_<n>.png` + `_f.png`, la solapa: el dorso, sin tinta):
  - Hay orejas limpias, orejas estropeadas y esquinas viejas.
  - Se guardan con la oreja a 20 mm; el motor las escala al tamaño que toque.
- **Uso:**
  - La forma grande del desgarro la genera el motor a escala de hoja; la tira se lee relativa a esa línea.
  - Las fibras no llevan tinta.
  - La hoja lleva su sombra (procedural) y, al aplicar, queda sobre fondo blanco.
- **Descartadas, con motivo:**
  - cartones con las ondas en arco (vistos de canto, no desde arriba);
  - quemados;
  - esquinas de cartón;
  - fotos con restos de verde o mal encuadradas.

### 4.9 Lo que es procedural (sin textura)

- **Pantallas:** subpíxeles, moiré, bandas, reflejos, fósforos y mura.
- **Fotografía y escaneo:** luz, viñeta, ruido, JPEG, aberración, trepidación, perspectiva y desenfoque.
- **Envejecimiento:** color del envejecimiento y desgaste de la tinta.
- **La hoja:** sombra de la hoja, curvatura y ondulación.

---

## 5. Estado de las carpetas de fotos originales (detalle en `PAPELATOR_fuentes_originales.csv`)

| Carpeta | Fotos | Usadas | Sin usar | Peso | Contenido |
|---|---|---|---|---|---|
| `texturas_tileables/` | 78 | 46 | 32 | 199 MB | papeles (los sin usar: repetidos, sustituidos por milimetrados sintéticos o descartados por calidad) |
| `imperfecciones/` | 147 | 138 | 9 | 253 MB | manchas, salpicaduras, foxing, grafito, goma, adhesivo, sellos… |
| `NUEVAS/` | 116 | 109 | 7 | 205 MB | `PLIEGUES/` (81) y `TEXTURA_IMPERFECCIONES/` (35) |
| `NUEVAS_NUEVAS/` | 31 | 29 | 2 | 109 MB | maderas y cartones |
| `NUEVAS SUPERFICIES/` | 71 | 71 | 0 | 243 MB | paredes, suelos, piedra, metal |
| `SOBREPONER/` | 49 | 49 | 0 | 112 MB | vidrios y plásticos sobre negro |
| `BORDES/` | 163 | 74 | 89 | 380 MB | bordes y esquinas sobre croma (ver 4.8) |
| `APOYO/` | 129 | 2 | 127 | 320 MB | material de apoyo: trazos, manchas con forma, texturas tileables (casi todo sin usar) |

- **Duplicados exactos** (mismo md5) dentro del repo: **31**. Están marcados en la columna `duplicada_con` del CSV.
- **Columna `usada_en_plugin`:** «sí» significa que algún derivado actual sale de esa foto. «No» significa que hoy no se usa, aunque puede servir a otros plugins.

---

## 6. Lo que PAPELATOR necesita del repositorio común

1. **Originales intactos:** nunca sobrescritos ni recomprimidos. PNG o JPG a máxima resolución.
2. **Un identificador estable por archivo** (que no cambie aunque se mueva o se renombre) y un **manifiesto** (JSON o CSV) con, como mínimo:
   - `id`, `ruta`, `md5`, `ancho_px`, `alto_px`;
   - `categoria` (papel, superficie, madera, carton, imperfeccion, pliegue, vidrio, borde, esquina, trazo, mancha…) y `subtipo` (p. ej. «kraft», «cerco de café», «acanalado»);
   - `fondo`: `croma_verde`, `negro`, `blanco`, `ninguno (textura a sangre)`;
   - `tileable`: sí o no;
   - **`ancho_real_mm`** (o `null` si se desconoce): lo que mide la foto en la realidad;
   - `origen`: foto o IA, y la herramienta;
   - `duplicado_de`: si es una copia;
   - `etiquetas` libres y `usado_por`: qué plugins la usan.
3. **Taxonomía de carpetas por lo que es**, no por cuándo se subió (hoy tengo `NUEVAS`, `NUEVAS_NUEVAS`…). Propuesta:
   ```
   texturas/
     papel/<subtipo>/            superficie/<pared|suelo|piedra|metal>/<subtipo>/   madera/  carton/
     imperfeccion/<subtipo>/     pliegue/<1..6|arrugado|muy_arrugado>/
     vidrio/<acanalado|ondulado|…>/   borde/<rasgado|gastado|espiral|carton>/   esquina/<oreja|gastada>/
     trazo/   mancha/   fuego/   humo/   burbuja/   moho/   …
   manifiesto.json
   ```
4. **Derivados:** los míos seguirían generándose con mis scripts. Pueden vivir en el repo común (`derivados/papelator/`) o seguir en el repo del plugin. Lo importante es que **se puedan regenerar** desde los originales y que cada derivado apunte al `id` de su original (ya lo guardo como `source`/`src`).
5. **Sin perder la escala:** si una foto se reescala o se recorta en el repositorio común, hay que actualizar `ancho_real_mm`. Si no, cambian las calibraciones (papeles, superficies y bordes dependen de ella).

---

## 7. Cómo adaptaré PAPELATOR cuando exista el repositorio común

1. Añadir `TEXTURAS_ROOT` (ruta al repositorio común) y leer `manifiesto.json`.
2. Cambiar las listas de fuentes de los scripts (`PAPERS`, `TYPES`, `BOARDS`, `CATS`, índices, `bordes_sets.json`, `fold_sources.json`) a **ids del manifiesto** en vez de rutas.
3. Regenerar todos los derivados y comprobar con las pruebas (`tools/test`) que el resultado es el mismo.
4. El plugin seguirá llevando sus derivados dentro del `.ccx`: UXP no puede leer carpetas externas sin pedir permiso al usuario.

---

## 8. Regenerar todo (referencia)

```bash
cd tools
python3 build_papers.py && python3 build_extras.py && python3 build_grids.py && python3 papers_fix.py
python3 build_boards.py                      # madera y cartón
PAPELATOR_TMP=/tmp/sup python3 build_surfaces.py
python3 build_imperf.py && python3 build_imperf2.py && python3 imperf_tune.py   # imperf_tune sólo una vez
python3 build_calco.py && python3 build_rotulador.py
python3 build_folds.py
python3 build_overlays.py
PAPELATOR_TMP=/tmp/bordes python3 build_bordes.py     # bordes y esquinas (caché de recortes en PAPELATOR_TMP)
cd test && node swatches.js <ids>                     # miniaturas
cd ../../plugin && zip -qr -X ../dist/PAPELATOR.ccx . -x '.*'
```

**Requisitos:** Python 3 (numpy, scipy, Pillow, opencv-python, scikit-image) y Node 18+ (Playwright solo para las capturas del panel).
