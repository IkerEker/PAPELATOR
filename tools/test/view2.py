import sys
from PIL import Image
ims=[Image.open(f).convert('RGBA') for f in sys.argv[2:]]
bg=lambda im: Image.alpha_composite(Image.new('RGBA',im.size,(120,140,120,255)),im).convert('RGB')
th=[bg(im).resize((int(im.width*620/im.height),620),Image.LANCZOS) for im in ims]
W=sum(t.width+8 for t in th)
out=Image.new('RGB',(W,620),(40,40,40)); x=0
for t in th: out.paste(t,(x,0)); x+=t.width+8
out.save(sys.argv[1],quality=90)
