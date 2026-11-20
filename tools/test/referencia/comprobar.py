"""Los 60 renders de referencia de PAPELATOR: tienen que salir idénticos (md5 de los píxeles RGBA).

    python3 tools/test/referencia/comprobar.py          (desde cualquier carpeta; necesita Node y Pillow)

Genera la lámina art.raw si falta (tools/test/mkart.py 1240 1754, md5 4527b81a…), renderiza con batch.js y compara.
Hechos con Node v22.23.4; otra versión de Node podría variar algún bit (sin verificar).
"""
import hashlib, json, os, subprocess, sys
from PIL import Image
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # tools/test
R = os.path.join(T, 'referencia')
os.makedirs(os.path.join(R, 'salida'), exist_ok=True)
art = os.path.join(T, 'art.raw')
if not os.path.exists(art) or os.path.getsize(art) != 1240 * 1754 * 4:
    subprocess.run([sys.executable, 'mkart.py', '1240', '1754'], cwd=T, check=True)
m = hashlib.md5(open(art, 'rb').read()).hexdigest()
if m != '4527b81a1bf49b86e9767e7ae6bae2ab': print('AVISO: art.raw distinto (otras fuentes del sistema):', m)
subprocess.run(['node', '--max-old-space-size=6000', 'batch.js', os.path.join('referencia', 'referencia.json')], cwd=T, check=True, stdout=subprocess.DEVNULL)
esperado = json.load(open(os.path.join(R, 'hashes.json')))
mal = [k for k, v in esperado.items() if hashlib.md5(Image.open(os.path.join(R, 'salida', k)).convert('RGBA').tobytes()).hexdigest() != v]
for k in mal: print('CAMBIA', k)
print(len(esperado) - len(mal), 'de', len(esperado), 'renders idénticos')
sys.exit(1 if mal else 0)
