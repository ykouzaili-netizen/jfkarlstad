"""Klipper ut föreningens tio medaljer ur förlagan (styrelsen 2026-10-08) till public/assets/medaljer/medalj-01…10.png.

Bakgrunden blir genomskinlig och texten under varje medalj tas inte med. Kör från repots rot:
    python3 tools/design/klipp-medaljer.py sökväg/till/forlagan.png
"""
import numpy as np
from PIL import Image, ImageFilter
from collections import deque
import sys
src=sys.argv[1]  # förlagan: tio medaljer i två rader på krämvit bakgrund, med namn under
im=np.array(Image.open(src).convert('RGB')).astype(float)
cols=[(39,205),(207,371),(377,541),(545,711),(714,879)]
rows=[(32+12,32+342),(520+12,520+372)]
STARS={5,10}  # bara stjärnorna har genombrutna hål där bakgrunden syns
bgc=np.array([248,243,224.])
def components(A):
    H,W=A.shape; lab=np.zeros((H,W),int); sizes={}; cur=0
    for y in range(H):
        for x in range(W):
            if A[y,x] and not lab[y,x]:
                cur+=1; q=deque([(y,x)]); lab[y,x]=cur; n=0; edge=False
                while q:
                    yy,xx=q.popleft(); n+=1
                    if yy in (0,H-1) or xx in (0,W-1): edge=True
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny,nx=yy+dy,xx+dx
                        if 0<=ny<H and 0<=nx<W and A[ny,nx] and not lab[ny,nx]: lab[ny,nx]=cur; q.append((ny,nx))
                sizes[cur]=(n,edge)
    return lab,sizes
n=0
for (y0,y1) in rows:
    for (x0,x1) in cols:
        n+=1
        p=im[y0:y1, x0+5:x1-4]
        R,G,B=p[...,0],p[...,1],p[...,2]
        bright=(R+G+B)/3
        bgish=(bright>222)&((R-B)>6)&((R-B)<48)
        lab,sizes=components(bgish)
        holes=[k for k,(sz,e) in sizes.items() if (not e) and sz>12] if n in STARS else []
        bg=np.isin(lab,[k for k,(sz,e) in sizes.items() if e]+holes)
        fl,fs=components(~bg)
        fg=fl==max(fs,key=lambda k:fs[k][0])
        mk=Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
        fg=(np.array(mk)>127)&~np.isin(lab,holes)
        m=Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
        a=np.clip((np.array(m).astype(float)/255-0.15)/0.7,0,1)
        edge=(a>0)&(a<1)
        dist=np.sqrt(((p-bgc)**2).sum(-1))
        mix=np.clip(1-dist/90,0,0.8)[...,None]
        clean=np.clip((p-bgc*mix)/(1-mix),0,255)
        rgb=np.where(edge[...,None],clean,p)
        rgba=np.dstack([rgb,a*255]).astype(np.uint8)
        ys,xs=np.where(rgba[...,3]>0)
        rgba=rgba[ys.min():ys.max()+1, xs.min():xs.max()+1]
        pad=np.zeros((rgba.shape[0]+8,rgba.shape[1]+8,4),np.uint8); pad[4:-4,4:-4]=rgba
        Image.fromarray(pad,'RGBA').save(f'public/assets/medaljer/medalj-{n:02d}.png', optimize=True)
        print(n, pad.shape[1], pad.shape[0])
