# PAPELATOR y la biblioteca común (TEXTURAS)

Desde el 20-11-2026 las **fotos fuente ya no viven en este repo**: se leen de la biblioteca de Iker al construir.
El plugin (`plugin/`, el `.ccx`) **no cambia**: lleva dentro sus texturas procesadas y funciona sin internet ni Claude.

## Qué hace falta en cada ordenador (una vez)

1. Montar la biblioteca **antes de fusionar esta rama en `main`** (el montaje copia los originales desde `main` de PAPELATOR):
   `python TEXTURAS/tools/atlas/montar_biblioteca.py --raiz D:/Biblioteca`
2. Variable de entorno `TEXTURAS_ROOT=D:/Biblioteca` (la carpeta que contiene `TEXTURAS/` y `originales/`).
3. Comprobar: `python tools/verificar_fuentes.py` → «784 nombres de fuente · 753 archivos distintos … con su md5 de siempre».

## Cómo se lee

- `tools/fuentes_id.json`: nombre de siempre de cada foto (el que citan las listas de los scripts y los JSON del plugin) → id
  de la biblioteca (`or:<md5>`). 784 nombres, 753 archivos (las 31 parejas duplicadas comparten id).
- `tools/common.py → fuente(nombre)`: id → `TEXTURAS/indice/indice.json` (campo `archivo`) → ruta en `TEXTURAS_ROOT`, y
  comprueba el md5 la primera vez. Todas las lecturas de fotos de `tools/` pasan por ahí.

## Prueba exacta (20-11-2026)

| Prueba | Resultado |
|---|---|
| `tools/test/verificar_assets.py` (822 PNG + 6 JSON del plugin) | 0 distintos antes y después |
| `tools/verificar_fuentes.py` (las 784 fuentes desde la biblioteca) | todas con su md5 de siempre |
| Todas las herramientas (salvo `build_grids.py`) ejecutadas con las fotos del repo y con la biblioteca | 840 archivos generados, **0 distintos** |
| `tools/test/referencia/comprobar.py` (60 renders) | 60 de 60 idénticos |

**Aviso:** las herramientas actuales no reproducen todos los assets que lleva el plugin (123 de 840 salen distintos aunque
se lea de las fotos de siempre: pliegues arrugados, tiras de borde, manchado de hoja, milimetrados, ajustes de imperfecciones).
Por eso **no se regenera nada**: el `.ccx` sigue con sus assets de siempre. Regenerar una familia es un cambio de resultado
que decide Iker con antes/después.
