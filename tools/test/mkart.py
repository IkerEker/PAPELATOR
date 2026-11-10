import sys
from PIL import Image, ImageDraw, ImageFont
W,H=int(sys.argv[1]),int(sys.argv[2])
im=Image.new('RGBA',(W,H),(0,0,0,0))
d=ImageDraw.Draw(im)
s=W/1240
F=lambda n,sz: ImageFont.truetype(n,int(sz*s))
serif='/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
sans='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
d.text((int(110*s),int(120*s)),"PAPELATOR",font=F(serif,120),fill=(20,20,24,255))
d.text((int(115*s),int(270*s)),"Informe confidencial · nº 0427",font=F(sans,34),fill=(180,30,40,255))
txt="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
words=txt.split(); y=380; line=""
for wd in words*3:
    if len(line)+len(wd)>52:
        d.text((int(115*s),int(y*s)),line,font=F(sans,30),fill=(30,30,30,255)); y+=46; line=""
    line+=wd+" "
# shapes
d.ellipse([int(700*s),int(950*s),int(1100*s),int(1350*s)],fill=(30,90,170,255))
d.rectangle([int(110*s),int(1000*s),int(600*s),int(1300*s)],fill=(230,170,40,255))
for i in range(12):
    d.line([int(110*s),int((1400+i*22)*s),int(1130*s),int((1400+i*22)*s)],fill=(0,0,0,255),width=max(1,int(3*s)))
d.rectangle([int(110*s),int(1680*s),int(1130*s),int(1700*s)],fill=(10,10,10,255))
im.save('art.png')
open('art.raw','wb').write(im.tobytes())
print(im.size)
