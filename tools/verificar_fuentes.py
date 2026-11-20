"""Comprueba que TODAS las fuentes de PAPELATOR se leen de la biblioteca común con sus bytes de siempre.

    TEXTURAS_ROOT=<Biblioteca> python3 tools/verificar_fuentes.py

Para cada nombre de fuentes_id.json: id → índice → archivo en TEXTURAS_ROOT → md5 == el del id (or:<md5>).
Lo mismo que hace common.fuente() al construir, pero de todas a la vez.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

tabla = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fuentes_id.json'), encoding='utf-8'))
ids = set()
for nombre in tabla:
    common.fuente(nombre)          # para con SystemExit si falta o si el md5 no es el de siempre
    ids.add(tabla[nombre])
print(len(tabla), 'nombres de fuente ·', len(ids), 'archivos distintos en la biblioteca · todos con su md5 de siempre')
