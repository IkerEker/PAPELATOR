# PAPELATOR · contexto completo para seguir en un chat nuevo

> Pega o adjunta este archivo al empezar el chat nuevo. Todo el proyecto está en GitHub:
> **https://github.com/IkerEker/PAPELATOR** (rama `main`, último commit «Una sola ventana con dos pestañas: Presets y Avanzado»).
> Versión actual del plugin: **3.9.0** (`plugin/manifest.json`). Instalable: `dist/PAPELATOR.ccx`.

---

## 1. Qué es

Plugin **UXP para Adobe Photoshop** (instalable como `.ccx`) que hace que una lámina, ilustración o texto parezca
**impreso en papel real y fotografiado/escaneado**. Idioma de la interfaz y del código: español.

Flujo de uso:
1. **«Papel de fondo»**: genera el papel (textura, color, estado, pliegues, calco) en una capa inferior
   `PAPELATOR · Papel de fondo`, como guía para trabajar encima.
2. **«Aplicar»**: lee todas las capas visibles (el arte), lo imprime en el papel (tinta desplazada por el grano,
   huecos, envejecimiento de la tinta, pliegues, desgaste) y aplica la luz y la calidad de foto/escáner.
   Crea la capa `PAPELATOR · Resultado` arriba y **deja todas las demás capas tal cual** (no oculta nada).
   Todo va en un único paso de historial (Ctrl/Cmd+Z lo deshace).

## 2. Cómo trabaja el usuario (Iker) y qué espera

- Quiere **realismo** y, sobre todo, **sutileza**. Cuando algo «queda falso» lo dice sin rodeos; hay que pensar la
  física del papel/tinta/luz y verificar con renders antes de entregar.
- **Pocas opciones y muy concretas**. Nada de diez variantes como botones: un preset por tipo y un botón pequeño **⟳**
  en cada sección para «generar otra versión» (otra variante del mismo tipo / otra colocación).
- Lo que sea «más o menos» va en **sliders**, no en presets.
- Usar **sus texturas tal cual** cuando se ven bien (p. ej. los pliegues: se usa el sombreado real de la foto).
- Va mandando correcciones en varios mensajes seguidos («espera, te digo más cosas»): se aplican todas y al final
  se empaqueta una versión.
- Entregar siempre: `.ccx` nuevo + commit y push a GitHub + muestras visuales cuando el cambio es visual.
- Commits terminan con:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01VPHARAd7TpqkPDoQ1SasoU`
  (en un chat nuevo, usa la línea de sesión que te indique ese chat).

## 3. Estado actual de la interfaz (una ventana, dos pestañas)

### Pestaña «Presets»
| Sección | Opciones | ⟳ de la sección |
|---|---|---|
| 1 · Papel | 4 grupos → 21 tipos (ver §5) + slider **Escala de la textura** | siguiente variante del tipo + otra colocación de la textura |
| 2 · Color del papel | Original, Blanco, Marfil, Crema, Gris, Rosa, Azul, Negro | — |
| 3 · Estado | Nuevo, Usado, Escuela, Oficina, Con manchas, Antiguo, Humedad + slider **Antigüedad** | siguiente receta de la familia + otra colocación de imperfecciones |
| 4 · Pliegues | Sin pliegues, 1–6 veces, Arrugado + sliders **Intensidad** y **Bordes desgastados** | siguiente hoja real del grupo |
| 5 · Calco | Sin calco, Tu documento, Texto impreso, A mano + slider **Intensidad del calco** | siguiente variante (notas de rotulador) y luego el siguiente de la familia |
| 6 · Al aplicar | **Luz**: Sin foto, Escáner, Luz natural, Lámpara, Flash · slider Más oscura/Más clara · **Calidad**: Perfecta, Escáner, Móvil, Fotocopia, Analógica | Luz y Calidad tienen su ⟳ (variante + otro giro/perspectiva) |

Arriba: ⟳ grande = cambia todo (semilla global). Pie fijo: «Papel de fondo», «Aplicar», «Quitar papel de fondo»,
casilla «En vivo», línea de estado.
**Quitado a petición del usuario** del panel principal: intensidad global del filtro, miniatura de vista previa,
selector de impresión (queda Offset por defecto).

### Pestaña «Avanzado»
Todos los parámetros finos (intensidad global, semilla, papel concreto, color hex, contraste de textura, cada
imperfección por separado, edad, calco: trasluz/traspaso/presión/desenfoque, impresión: offset/tipografía/inkjet/láser,
tinta opaca/transparente, grano, envejecimiento de tinta, absorción, luz, exposición, calidad) + miniatura.

## 4. Arquitectura

```
plugin/
  manifest.json      UXP manifest v5, un único panel "papelator", host PS ≥ 24.2.0, permiso localFileSystem: plugin
  index.html         #app → pestañas + #simple (Presets) + #pro (Avanzado); cada una con .scroll y .footer
  styles.css         flexbox (UXP no tiene grid/gap); .tabs/.tab, .mini (botón ⟳), chips, swatches
  main.js            UI, estado (localStorage 'papelator3.state', ui 'papelator2.ui'), Photoshop (executeAsModal,
                     imaging.getPixels/putPixels, suspendHistory), carga de assets desde la carpeta del plugin
  src/engine.js      motor en JS puro (también corre en Node para pruebas): renderPaper() y renderFinal()
  src/presets.js     presets, familias, DEFAULT_STATE (version 4)
  src/png.js         decodificador PNG propio (8 bits: gris, RGB, paleta, gris+alfa, RGBA) — UXP no trae zlib
  assets/            papers/ (_d detalle, _c color, _ink líneas), swatches/, imperf/, calco/, folds/ + *.json
tools/               scripts Python que generan los assets desde las fuentes (ver §8) + tools/test (Node)
texturas_tileables/, imperfecciones/, APOYO/, NUEVAS/   fuentes que subió el usuario (no se tocan)
dist/PAPELATOR.ccx   instalable (zip del contenido de plugin/ con manifest en la raíz)
```

### Motor (engine.js) — orden de render
**renderPaper**: `genPaper` (textura tileable a escala real en mm, mipmaps, mezcla anti-repetición salvo patrones,
verjurado `mix:'none'` y cartón `mix:'x'`) → `genAging` (amarilleo por campos: cantos, ruido, mapas de hoja completa
combinando dos mapas —uno girado— sólo oscureciendo; sol con línea recta; suciedad de manos; guarda `B.ageMap` en el
render final) → `genEstado` (imperfecciones con reglas físicas de colocación) → `genCalco` → relieve → `genShape`
(ondulación/curvatura) → `genFolds` (pliegues).
**renderFinal**: vuelve a generar el papel con `_final:true`, desplaza la tinta según el relieve del grano (escala y
rugosidad de cada papel), técnica de impresión, **envejecimiento de tinta**, desgaste en aristas de pliegue,
sombreado de pliegue y luz, `photo()` (luz, tinte, viñeteo, respuesta de cámara) y `quality()` (ruido, JPEG,
desenfoque…) + `captureGeometry()` (giro, perspectiva y desenfoque de márgenes automáticos según la calidad).
Semillas por sección: `seed`, `seedPaper`, `seedEstado`, `seedCalco`, `seedFoto`, `pliegueVar`.

### Decisiones técnicas clave (no deshacer sin motivo)
- **Pliegues**: se aplica el **sombreado real de la foto** (sin la luz de la toma, ajuste cuadrático robusto en log,
  y sin el grano de su papel, bilateral suave), a resolución completa (1055×1491) y con muestreo **bicúbico**.
  Lo más claro del pliegue se normaliza al blanco del papel (si no, en papel blanco se queman las luces y se ve
  plano). Desplazamiento suave tipo «Desplazar» con la textura desenfocada (~0,3 mm). Aristas = contraste fino de
  la textura → la tinta se levanta a tramos (más en cruces y cerca de los bordes; láser > offset > inkjet).
- **Envejecimiento de tinta** (slider Antigüedad, 100 % ≈ 100 años): densidades ópticas; colorantes se desvanecen
  por separado (amarillo 80 %, magenta 70 %, cian 45 % a tope), negro −42 % y vira a pardo, tinta levantada en fibras
  altas, manchas de desgaste de ~7 mm y escamas agrupadas; todo modulado por `B.ageMap` (más en cantos y zona al sol).
- **Milimetrados**: tinta re-trazada con geometría exacta 1/5/10 mm (las fuentes eran incorrectas) y papel sintetizado
  con el espectro del folio.
- **Rotulador (calco)**: 4 notas manuscritas generadas (cursiva asémica: nota con título subrayado, etiqueta en letra
  grande, lista con tachón y marcas) con charcos de tinta; se ven del revés y traspasan.
- Rendimiento: ruidos de baja frecuencia e iluminación en rejilla gruesa (`lowField`). A4 a 300 ppp con todo
  activado ≈ 7–9 s en Node.

## 5. Catálogo actual

**Papeles** (46 texturas en 21 tipos; ⟳ recorre las variantes):
- *Oficina y escuela*: Folio (folio, papel_fino, bristol), Periódico (periodico, periodico_gris), Rayado 8 mm,
  Cuadriculado 5 mm (cuadricula, cuadricula_clara), Milimetrado (azul, naranja, azul y rojo), Punteado 5 mm,
  Isométrico (isometrico, triangular), Pentagrama.
- *Bellas artes*: Acuarela fina (fino, satinada), Acuarela gruesa (2), Algodón (2), Verjurado (2), Arroz (3),
  Cartulina gris.
- *Rústicos*: Kraft (2), Reciclado (reciclado, motas, gris), Hecho a mano (3), Pergamino (2 amarillentos), Cartón
  ondulado (2).
- *Translúcidos*: Vegetal (liso, arrugado), Papel de horno (horno, encerado, pergamino_blanco = pergamino de cocina).

**Estados** (familias → recetas en `ESTADOS`): Nuevo · Usado · Escuela · Oficina (oficial, archivo) · Con manchas
(bar, taller, velas) · Antiguo (libro, correo, sol) · Humedad (humedad, abandonado).

**Imperfecciones** (34 categorías en `imperf.json`): café, salpicaduras de café/tinta, agua, humedad, grasa, sangrado,
barro, foxing, uv, huellas grasientas/de tinta, grafito, hendiduras de escritura y de máquina, adhesivo, quemadura,
goma (6–13 mm, sutil), fibras, nódulos, descamación, polvo, sello en seco (muy sutil), cera, matasellos, calor,
manchado (hoja completa) y las sutiles: marca y agujeros de grapa, huella de clip, marcas de pinza, media luna (uña),
arruguita. Especiales: manoseo, cockle (ondulación), sol.

**Pliegues**: grupos `1`…`6` (líneas de pliegue visibles) y `arrugado` (76 fotos; `tools/fold_sources.json`).

**Luces**: ninguna, escaner, dia, ventana, foco, flash, sombra, lampara. **Calidades**: perfecta, escaner_pro,
escaner_oficina, movil, movil_antiguo, fotocopia, analogica.

## 6. Historial de lo que pidió y se hizo (resumen)
1. v1 rechazada («no me sirve en absoluto») → repositorio GitHub, texturas tileables reales, imperfecciones aisladas.
2. v2/v3: realismo físico, mucho más sutil; quitado preset de oficina con clip oxidado; manchas cuadradas = hoja
   completa; desplazamiento según grano y escala de cada papel.
3. Pliegues (v3.1) + imperfecciones sutiles nuevas (grapas, clip, pinza, medias lunas, arruguitas).
4. Revisión completa (v3.2): milimetrados exactos, acuarela a escala real, cartón y verjurado sin roturas, café pardo,
   envejecimiento sin vetas, sol realista, render más rápido.
5. v3.3: pliegues con sombreado real de las fotos, **menos opciones + ⟳ por sección**, tinta envejecida de verdad.
6. v3.4: fuera impresión del panel; calidad con giro/perspectiva/desenfoque de márgenes; slider de calco; rotulador
   rehecho; sello en seco, goma, hendiduras y presión mucho más sutiles; fuera intensidad global y miniatura del
   panel principal; pliegues sin luces quemadas.
7. v3.4.1: Aplicar deja las capas tal cual; papeles bien catalogados.
8. v3.5.0: **una sola ventana con dos pestañas** (Presets / Avanzado).

## 6b. v3.6.0 — maderas, cartones y Sobreponer
- `NUEVAS_NUEVAS/` (subido por el usuario): 31 fotos → 29 fondos (2 duplicados) en el grupo «Maderas y cartones»:
  Madera (4), OSB (7), Aglomerado (6), Cartón de caja (9), Cartón kraft (3) + Cartón ondulado (2, ya existía).
  `material: wood|carton` en papers.json: sin pliegues, sin calco y sin imperfecciones de papel (MATERIAL_NO en el motor).
- `SOBREPONER/`: 49 vidrios/plásticos sacados de `IkerEker/NEONIZADOR` (TEXTURAS_02 y TEXTURAS_04; los demás de
  ese repo —humo, fuego, VHS, mármol…— no se usan aquí). 7 tipos (acanalado 8, ondulado 6, martillado 6, armado 7,
  esmerilado 3, lluvia 4, plástico 15). Sección «6 · Sobreponer» con ⟳ y slider **Distancia al papel** (0–40 mm);
  en Avanzado: reflejos, huellas/polvo, escala y textura concreta. Sólo actúa al **Aplicar** (va delante del papel).

## 6c. v3.7 — transparencia del vidrio y luz/calidad mucho más marcadas
- Sobreponer › **Transparencia** (Presets y Avanzado): 100 % limpio; al bajar, vidrio gastado: velo lechoso
  desigual, grupos de arañazos paralelos + sueltos, y más difusión.
- **Luz** (`LUZ` en engine.js) y **Calidad** (`QUAL`) reescritas para que se noten mucho a intensidad 50:
  escáner con sombra del canto levantado; día apagado y frío; ventana lateral con sombra del marco; lámpara
  tungsteno naranja con charco de luz; foco circular definido; flash con centro quemado y caída cos⁴; sombra del
  móvil y la mano. Calidad por **resolución efectiva** (móvil 1700 px, antiguo 900, fotocopia 1300, analógica 1500):
  trepidación, reducción de ruido «acuarelada», HDR, halos de enfoque, ruido en manchas y de color, JPEG, aberración,
  barril, giro/perspectiva/desenfoque de márgenes más fuertes; fotocopia con curva dura, tóner, rayas de tambor y
  bordes; analógica con grano a dos escalas, halation, difusión, polvo y pelos.
- Aplicar sobrescribe el resultado anterior si el arte no ha cambiado (huella del compuesto).

## 6d. v3.9 — Pantalla
- Grupo «Pantallas» en «1 · Papel» con 4 pantallas (de mejor a peor): Móvil OLED (PenTile en diamante, negro absoluto),
  Monitor LCD (tira RGB, negro grisáceo, brillo IPS), Portátil viejo (TN: píxel gordo, rejilla marcada, 6 bits con
  tramado, color según el ángulo, fugas de luz), Tele de tubo (rejilla de apertura, líneas de barrido que engordan
  con el brillo, resplandor, convergencia, pantalla curva). `material: 'screen'` en papers.json; motor `renderScreen`.
- Con pantalla se ocultan Color, Estado, Pliegues, Calco y la escala; aparecen «Tamaño del píxel» y «Brillo».
  Luz sin Escáner ni Luz natural; Calidad sin Escáner ni Fotocopia. Madera/cartón ocultan Color, Pliegues y Calco.
  Los números de sección se renumeran según lo visible. En Avanzado se ocultan los grupos que no aplican.
- Fotografiar la pantalla (cualquier luz o calidad móvil/analógica): moiré de colores, bandas del obturador,
  reflejos (lámpara, flash, tu propio reflejo con «Sombra»), huellas que sólo se ven en el reflejo.

## 7. Pendiente / ideas que no se han hecho
- Probar todo dentro de Photoshop real (las pruebas son en Node + simulación del DOM de UXP; el usuario es quien lo
  prueba en Photoshop).
- El usuario dijo que irá pasando **más imperfecciones** con el tiempo: aislarlas igual que `build_imperf2.py`,
  decidir dónde van (reglas en `place()` del motor) y añadirlas con mesura a los estados según antigüedad.
- Calco «Rotulador»: algún punto de tinta aislado; vigilar que siga pareciendo letra real.
- Peso del `.ccx` ≈ 140 MB (pliegues a resolución completa).
- Márgenes y roturas: excluidos en v1 por decisión del usuario (sólo se mantuvo la raspadura de goma).

## 8. Cómo regenerar, probar y empaquetar

Requisitos: Python 3 (numpy, scipy, opencv, scikit-image, Pillow), Node 18+ (y Playwright sólo para `layout.js`).

```bash
cd tools
python3 build_papers.py && python3 build_extras.py     # papeles (≈5 min) + rugosidad/grano + manchado
python3 build_grids.py && python3 papers_fix.py        # milimetrados exactos + correcciones de escala/mezcla
python3 build_imperf.py && python3 build_imperf2.py    # imperfecciones (+ sutiles nuevas)
python3 imperf_tune.py                                 # color del café (UNA sola vez sobre los mapas originales)
python3 build_calco.py && python3 build_rotulador.py   # calcos
python3 build_folds.py                                 # pliegues (≈2 min)
```
Los índices de fuentes están en `tools/indices/*.json` y `tools/fold_sources.json` (rutas relativas al repo).

Pruebas (desde `tools/test`):
```bash
node run2.js '{"final":1,"art":"art.raw","out":"/ruta/salida.png","state":{"paper":"folio","pliegue":"2","edad":0.6,"luz":"dia"}}'
node batch.js trabajos.json      # muchas configuraciones en un proceso
node smoke2.js                   # simula la UI de UXP + Photoshop (debe acabar en «Aplicado en …»)
node layout.js                   # capturas de las pestañas (lay1.png / lay2.png)
node swatches.js id1 id2         # regenera miniaturas de papeles
```
(`art.raw` = RGBA 1240×1754; `python3 mkart.py W H` genera otro.)

Empaquetar:
```bash
cd plugin && rm -f ../dist/PAPELATOR.ccx && zip -qr -X ../dist/PAPELATOR.ccx . -x '.*'
```
Subir versión en `plugin/manifest.json` en cada entrega.

## 9. Instalación (para el usuario)
Doble clic en `PAPELATOR.ccx` (Creative Cloud lo instala) → Photoshop → **Plugins › PAPELATOR**.
Alternativa para desarrollo: UXP Developer Tool → Add Plugin → `plugin/manifest.json`.
Si al instalar sale el error −4, es el manifest (ya se simplificó para el instalador de Creative Cloud).
