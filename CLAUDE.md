# PAPELATOR · guía para Claude

Plugin UXP de Photoshop: imprime la lámina en papel o superficie real y la fotografía o escanea.
Motor: `plugin/src/engine.js` (JS puro, también corre en Node). Herramientas de construcción: `tools/` (Python).
Contexto largo: `CONTEXTO.md`. Ficha de texturas: `docs/PAPELATOR_TEXTURAS.md` y `TEXTURAS/plugins/papelator.md`.

## Biblioteca y velocidad (orden de Iker, 20-11-2026; texto completo: TEXTURAS/plugins/ORDEN_PLUGINS.md)
- Material SOLO de la biblioteca IkerEker/TEXTURAS (rama atlas) + Biblioteca/ local (TEXTURAS_ROOT). Nada de bancos propios.
- Buscar SIEMPRE con el método de 7 pasos de ORDEN_PLUGINS.md (varias palabras → --resumen → abrir familias → recorrer
  clases → filtrar con --donde/--min → --parecidos → ficha + mirar la `hoja`). Incluye ab:, collage, vídeo y sonido.
  No revisar bancos enteros: las fichas ya están hechas. Releer el índice en cada conversación.
- Construir leyendo por id (or:/tx:/ab:) vía indice/indice.json. El plugin lleva dentro lo que usa: funciona sin Claude ni internet.
- Si falta algo: «PEDIDO PARA LA BIBLIOTECA:» al final de la respuesta; nunca dibujarlo/descargarlo dentro del plugin.
- Prueba exacta antes y después de todo cambio; cualquier diferencia → Iker decide con antes/después.
- Velocidad: medir con el banco de pruebas en el PC de Iker; GPU donde se pueda, con camino CPU de respaldo;
  una versión GPU que no dé idéntico queda apagada hasta que Iker diga sí. Gráficas de Iker: 2 × RTX 4090 (24 GB c/u), 64 GB RAM.
- El código, las herramientas y las pruebas se quedan en este repo; solo se quitan carpetas de material ya migradas.

## Casa local (orden de Iker, 20-11-2026; texto: TEXTURAS/plugins/ORDEN_CARPETA_LOCAL.md)
- El plugin vive en C:\Users\ikerg\Biblioteca\plugins\papelator\ (git local, sin GitHub). Única carpeta conectada: Biblioteca.
- Copia de seguridad: git bundle --all en Biblioteca\plugins\_respaldos\ tras cada sesión (guardar 3).
- Material SOLO por id desde Biblioteca\TEXTURAS (buscar.py, método de la ORDEN 1); nada repetido dentro del plugin.
  Lo nuevo → «PEDIDO PARA LA BIBLIOTECA».
- No tocar otros plugins, TEXTURAS, ACIDBITE, originales ni _fuentes. Borrar solo con permiso de Iker.
- Prueba exacta antes y después de cada cambio. El plugin construido funciona solo, sin Claude ni internet.
- Sin conversión de finales de línea (`.gitattributes: * -text`): los JSON del plugin tienen que conservar sus bytes.

## Prueba exacta de PAPELATOR
1. `python3 tools/test/verificar_assets.py` → «822 PNG comprobados, 0 distintos» y los 6 JSON con su md5
   (sin Python, en Windows: `tools\test\verificar_assets.ps1` → «828 archivos … 0 distintos»).
2. `python3 tools/verificar_fuentes.py` → todas las fuentes se leen de la biblioteca con su md5 de siempre.
3. Si algo se regenera o cambia el motor: `python3 tools/test/referencia/comprobar.py` → 60 de 60 renders idénticos.
4. Velocidad: `tools/bench/` (LEEME.md). Banco en Photoshop: menú del panel ☰ › «Banco de pruebas (velocidad)…».

## Fuentes (fotos): solo de la biblioteca
- Las fotos ya no están en este repo. `tools/common.py → fuente()` lee cada una por id (`tools/fuentes_id.json`: nombre de
  siempre → `or:<md5>`) en `TEXTURAS_ROOT` y comprueba su md5. Sin `TEXTURAS_ROOT` las herramientas paran.
- Material nuevo: se busca en la biblioteca (método de 7 pasos) y se añade el id a `fuentes_id.json`; nunca fotos sueltas aquí.

## No hacer
- **No regenerar assets sin antes/después.** Las herramientas actuales NO reproducen todo lo que lleva el plugin (comprobado
  20-11-2026): pliegues (grupos arrugado/muy arrugado), tiras de borde, manchado de hoja completa, milimetrados
  (`build_grids.py` no es reproducible y se ejecuta al importarlo) e imperfecciones (`imperf.json` lleva ajustes a mano;
  `imperf_tune.py` no es idempotente). Lo que sí es exacto: leer de la biblioteca da lo mismo que leer las fotos de antes.
- Commits con el trailer de la sesión. Trabajar en rama; no fusionar en `main` sin el OK de Iker.
