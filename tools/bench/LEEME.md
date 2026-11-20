# Banco de pruebas de velocidad · PAPELATOR

Dos bancos con **los mismos trabajos, la misma lámina, los mismos tamaños (A4 a 150 y 300 ppp) y la misma semilla**
(`plugin/src/banco_comun.js`). Los dos guardan la **huella** de cada resultado (FNV-1a de los píxeles): si un arreglo de
velocidad cambia un solo byte, cambia la huella. Las medidas de la sandbox no valen como referencia: se mide en el PC de Iker.

## 1. En Photoshop (lo que cuenta)

Menú del panel PAPELATOR (☰, arriba a la derecha) › **Banco de pruebas (velocidad)…**

- Abre documentos temporales (A4 150 y 300 ppp), mide y los cierra sin guardar. No toca tus documentos.
- Por trabajo, en frío (texturas sin cargar) y en caliente: leer capas (`getPixels`), cada fase del motor, crear capa y
  escribir capa (`putPixels`), y cuánto se tarda en leer y decodificar las texturas.
- Dice qué ofrece el anfitrión (Photoshop, UXP, Workers, WebGL/WebGPU, WebAssembly SIMD, núcleos): es lo que decide si se
  puede usar la gráfica desde el plugin.
- Al terminar pide dónde guardar el JSON (`banco_papelator_<fecha>.json`); también queda una copia en la carpeta de datos
  del plugin. Ese JSON es el que hay que pasarle a Claude.
- Tarda unos minutos. Deja Photoshop tranquilo mientras tanto.

## 2. Solo el motor, sin Photoshop (Node)

Doble clic en `tools\bench\banco.bat` (necesita Node 18+). O:

```
node tools/bench/banco.js                 # los 17 trabajos × 2 tamaños, frío + 3 en caliente
node tools/bench/banco.js --rapido        # solo 150 ppp, 1 repetición
node tools/bench/banco.js --solo movil,todo_junto
PAPELATOR_PLUGIN=<otra carpeta plugin> node tools/bench/banco.js   # medir otra versión con el mismo banco
```

Escribe `tools/bench/resultados/motor_<PC>_<fecha>.json`.

**Las huellas de los dos bancos deben coincidir** para el mismo trabajo y tamaño (el motor es el mismo JavaScript). Si no
coinciden, el motor no da lo mismo en Photoshop que en Node (o Photoshop gestiona el color de la lámina): avisar.

## 3. Regla

Cada arreglo de velocidad se queda solo si la prueba exacta da idéntico (`tools/test/verificar_assets.py`,
`tools/test/referencia/comprobar.py`, huellas del banco) y el banco mejora en el PC de Iker.
