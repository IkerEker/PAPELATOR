import json, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
from common import ASSETS
cat = {p['id']: p for p in json.load(open(ASSETS + '/papers.json'))}
ids = sys.argv[2:]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
S = 300
sheet = Image.new('RGB', (len(ids) * (S + 6), S + 20), (40, 40, 40)); d = ImageDraw.Draw(sheet)
for k, pid in enumerate(ids):
    p = cat[pid]
    det = np.asarray(Image.open(f'{ASSETS}/papers/{pid}_d.png'), np.float32)
    det = 1 + (det - 128) / p['gain']
    col = np.array(p['color'], np.float32) / 255
    rgb = det[..., None] * col
    if p['kind'] == 'color':
        c = Image.open(f'{ASSETS}/papers/{pid}_c.png').resize(det.shape[::-1], Image.BILINEAR)
        tint = np.asarray(c, np.float32) / 255 * 2
        lumc = col @ [0.2126, 0.7152, 0.0722]
        rgb = det[..., None] * lumc * tint
    if p['kind'] == 'pattern':
        ink = np.asarray(Image.open(f'{ASSETS}/papers/{pid}_ink.png').convert('RGB'), np.float32) / 255
        rgb = rgb * ink
    t = np.tile(rgb, (2, 2, 1))
    h, w = rgb.shape[:2]
    crop = t[h - S // 2:h + S // 2, w - S // 2:w + S // 2]
    im = Image.fromarray(np.clip(crop * 255, 0, 255).astype(np.uint8))
    sheet.paste(im, (k * (S + 6), 0)); d.text((k * (S + 6) + 2, S + 2), pid, font=font, fill=(255, 220, 80))
sheet.save(sys.argv[1])
