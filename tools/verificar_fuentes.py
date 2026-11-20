"""Comprueba que TODAS las fuentes de PAPELATOR se leen de la biblioteca común con sus bytes de siempre.

    python tools/verificar_fuentes.py            (usa TEXTURAS_ROOT; solo biblioteca estándar de Python)

Para cada nombre de fuentes_id.json: id → TEXTURAS/indice/indice.json (campo archivo) → archivo en TEXTURAS_ROOT →
md5 == el del id (or:<md5>). Es lo mismo que hace common.fuente() al construir, pero de todas a la vez.
Sale con código 1 si falta algo o si algún md5 no es el de siempre.
"""
import hashlib, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
raiz = os.environ.get('TEXTURAS_ROOT')
if not raiz:
    sys.exit('Falta TEXTURAS_ROOT (carpeta Biblioteca con TEXTURAS/ dentro).')
tabla = json.load(open(os.path.join(AQUI, 'fuentes_id.json'), encoding='utf-8'))
idx = {a['id']: a for a in json.load(open(os.path.join(raiz, 'TEXTURAS', 'indice', 'indice.json'), encoding='utf-8'))['assets']}
mal, vistos = [], {}
for nombre, i in tabla.items():
    if i in vistos: continue
    a = idx.get(i)
    if not a: mal.append(('NO ESTÁ EN EL ÍNDICE', nombre, i)); vistos[i] = False; continue
    p = os.path.join(raiz, a['archivo'])
    if not os.path.exists(p): mal.append(('FALTA', nombre, p)); vistos[i] = False; continue
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    ok = h.hexdigest() == i.split(':', 1)[1] if i.startswith('or:') else h.hexdigest() == a.get('md5')
    if not ok: mal.append(('MD5 DISTINTO', nombre, p))
    vistos[i] = ok
for m in mal: print(*m)
print(len(tabla), 'nombres de fuente ·', len(vistos), 'archivos distintos en la biblioteca ·',
      'todos con su md5 de siempre' if not mal else f'{len(mal)} PROBLEMAS')
sys.exit(1 if mal else 0)
