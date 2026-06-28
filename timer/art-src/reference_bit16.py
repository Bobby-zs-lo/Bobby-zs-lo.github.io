"""16-bit fidelity mockup: finer pixels, multi-tone shading, dithering, neon glow."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random
random.seed(7)
W,H=300,440
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def R(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],fill=c)
def Ro(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],outline=c)
def dith(d,x,y,w,h,c1,c2):
    for yy in range(y,y+h):
        for xx in range(x,x+w):
            d.point((xx,yy), fill=c1 if (xx+yy)%2==0 else c2)

def neon_layer(drawfn):
    """draw bright shapes on transparent, blur for glow, composite under."""
    g=Image.new("RGBA",(W,H),(0,0,0,0)); gd=ImageDraw.Draw(g); drawfn(gd)
    glow=g.filter(ImageFilter.GaussianBlur(3))
    return glow,g

def sky(d,skyt,skyb,horizon):
    for y in range(horizon):
        t=y/horizon; c=lerp(skyt,skyb,t)
        d.line([(0,y),(W,y)],fill=c)
        if 0<t<1 and y%2==0:  # subtle dither band
            c2=lerp(skyt,skyb,min(1,t+0.04))
            for xx in range(0,W,2): d.point((xx,y),fill=c2)
    # stars
    for _ in range(40):
        sx=random.randint(0,W-1); sy=random.randint(0,int(horizon*0.5))
        d.point((sx,sy),fill=(255,255,255))

def sun(d,cx,cy,r,top,bot):
    for dy in range(-r,r):
        dx=int(math.sqrt(max(0,r*r-dy*dy)))
        if dx==0: continue
        if dy>0 and ((dy-1)//5)%2==1: continue
        t=(dy+r)/(2*r); c=lerp(top,bot,t)
        d.line([(cx-dx,cy+dy),(cx+dx,cy+dy)],fill=c)
        # dither edge of bands
        if dy>0 and (dy)%5==0:
            for xx in range(cx-dx,cx+dx,2): d.point((xx,cy+dy),fill=lerp(top,bot,min(1,t+0.06)))

def grid(d,horizon,col):
    R(d,0,horizon,W,H-horizon,lerp(col,(6,4,12),0.7))
    vp=(W//2,horizon)
    for gx in range(-10,11): d.line([vp,(W//2+gx*40,H)],fill=col)
    yy=horizon; step=6
    while yy<H: d.line([(0,yy),(W,yy)],fill=col); yy+=step; step=int(step*1.4)+1

def scan(img):
    o=Image.new("RGBA",(W,H),(0,0,0,0)); dd=ImageDraw.Draw(o)
    for y in range(0,H,2): dd.line([(0,y),(W,y)],fill=(0,0,0,42))
    img=img.convert("RGBA"); img.alpha_composite(o); return img.convert("RGB")

GOLD=(255,210,80); GOLD_H=(255,240,170); GOLD_D=(180,130,30)
MG=(255,45,180); CY=(0,229,255)

# brick with 4 tones + cracks
BR=[(132,108,168),(104,82,138),(78,58,108),(56,40,82)]; MOR=(36,22,54); HIL=(186,156,224)
def bricks(d,x,y,w,h):
    bw,bh=8,5
    for by in range(y,y+h,bh):
        off=((by//bh)%2)*4
        for bx in range(x-off,x+w,bw):
            xx=max(x,bx); ww=min(x+w,bx+bw)-xx
            if ww<=0: continue
            hh=min(bh,y+h-by)
            tone=BR[(bx*7+by*3)//bw%2]  # 2 base tones
            R(d,xx,by,ww,hh,tone)
            R(d,xx,by,ww,1,lerp(tone,HIL,0.5))
            R(d,xx,by+hh-1,ww,1,MOR)
            if (bx//bw+by//bh)%9==0: R(d,xx+1,by+1,1,2,BR[3])  # crack speck
    R(d,x,y,2,h,HIL); R(d,x+w-2,y,2,h,BR[3])

def litwin(d,x,y):
    R(d,x-1,y-1,12,18,BR[3])
    for i in range(16): R(d,x,y+i,10,1,lerp((255,235,180),(255,150,60),i/16))
    R(d,x+4,y,2,16,BR[3]); R(d,x,y+7,10,2,BR[3])  # mullions
def slit(d,x,y):
    R(d,x,y,2,14,(16,10,26)); R(d,x-2,y+4,6,2,(16,10,26)); R(d,x,y+2,1,9,GOLD)
def cannon(d,x,y,fire):
    R(d,x,y,18,8,(58,58,74)); R(d,x,y,18,2,(110,110,128)); R(d,x,y+6,18,2,(28,28,38))
    R(d,x+16,y+1,5,6,(16,16,24))
    R(d,x-3,y+6,7,5,(40,40,54)); R(d,x-2,y+10,3,3,(24,24,34))
    if fire:
        for rr in range(8,0,-1): d.ellipse([x+18-rr,y+4-rr,x+18+rr,y+4+rr],fill=lerp((255,90,0),GOLD,rr/8))
def banner(d,x,y,col):
    for i in range(34): R(d,x,y+i,14,1,lerp(lerp(col,(255,255,255),0.3),col,i/34))
    d.polygon([(x,y+34),(x+7,y+27),(x+14,y+34)],fill=lerp(col,(0,0,0),0.2))
    R(d,x+4,y+8,6,6,GOLD); R(d,x+5,y+9,4,4,GOLD_D)
def pennant(d,x,y,col): d.polygon([(x,y),(x,y+16),(x+18,y+8)],fill=col); R(d,x,y,2,18,(210,210,225))

def castle_scene():
    img=Image.new("RGB",(W,H),(43,12,61)); d=ImageDraw.Draw(img)
    horizon=346
    sky(d,(43,12,61),(255,94,148),horizon)
    sun(d,150,108,62,(255,225,120),(255,46,136))
    grid(d,horizon,(150,40,110))
    R(d,16,horizon-3,268,6,BR[3])
    kx,kw,kh=74,152,188; ky=horizon-kh
    bricks(d,kx,ky,kw,kh)
    for i in range(0,kw,14): R(d,kx+i,ky-9,9,9,BR[1]); R(d,kx+i,ky-9,9,1,HIL); R(d,kx+i,ky,9,2,BR[3])
    for ry in range(ky+28,horizon-58,42):
        for rx in range(kx+22,kx+kw-22,42): litwin(d,rx,ry)
    for rx in range(kx+40,kx+kw-26,42): slit(d,rx,ky+16)
    cannon(d,kx-6,horizon-118,True); cannon(d,kx+kw-12,horizon-118,False)
    cannon(d,kx-6,horizon-74,False); cannon(d,kx+kw-12,horizon-74,True)
    gx=kx+kw//2-20; R(d,gx,horizon-56,40,56,(14,8,24))
    for i in range(gx,gx+40,5): R(d,i,horizon-56,1,56,(74,58,100))
    for j in range(horizon-56,horizon,6): R(d,gx,j,40,1,(74,58,100))
    R(d,gx-3,horizon-60,46,5,BR[2]); R(d,gx-3,horizon-60,46,1,HIL)
    banner(d,kx+14,ky+12,MG); banner(d,kx+kw-28,ky+12,CY)
    for tx,pen in ((kx-26,MG),(kx+kw-4,CY)):
        th=kh+38; ty=horizon-th; bricks(d,tx,ty,30,th)
        for i in range(0,30,9): R(d,tx+i,ty-9,6,9,BR[1]); R(d,tx+i,ty-9,6,1,HIL)
        litwin(d,tx+9,ty+34); slit(d,tx+12,ty+72); pennant(d,tx+13,ty-26,pen)
    # worker
    wx=kx+kw-58; wy=ky-4
    R(d,wx,wy,13,15,(58,140,182)); R(d,wx,wy,13,3,(120,205,238))
    R(d,wx+2,wy-8,9,8,(245,212,165)); R(d,wx+1,wy-11,11,4,(214,62,62))
    R(d,wx+12,wy-8,3,11,(150,96,60)); R(d,wx+13,wy-12,7,6,(120,120,132))
    R(d,wx-5,wy-3,12,8,HIL); Ro(d,wx-5,wy-3,12,8,MOR)
    # flagpole
    px=262; ptop=horizon-232; R(d,px,ptop,4,horizon-ptop,(206,206,222)); R(d,px,ptop,1,horizon-ptop,(255,255,255))
    R(d,px-1,ptop-5,6,5,GOLD)
    for m in range(1,6):
        my=horizon-int((horizon-ptop)*m/5); R(d,px-5,my,4,1,CY)
    fy=ptop+int((horizon-ptop)*(1-0.64))
    for i in range(20): d.line([(px+4,fy+i*1),(px+4+int(34*(1-abs(i-10)/10)),fy+i)],fill=GOLD)
    R(d,px+9,fy+6,7,7,MG)
    # torches with glow
    def torch(gd):
        for txp in (kx+8,kx+kw-14):
            gd.ellipse([txp-5,horizon-72,txp+7,horizon-58],fill=(255,150,40,180))
    glow,_=neon_layer(torch); img=img.convert("RGBA"); img.alpha_composite(glow); img=img.convert("RGB"); d=ImageDraw.Draw(img)
    for txp in (kx+8,kx+kw-14):
        R(d,txp,horizon-62,3,9,(120,80,50)); R(d,txp-1,horizon-69,5,7,(255,140,40)); R(d,txp,horizon-72,3,4,GOLD)
    R(d,10,10,104,30,(18,6,32)); Ro(d,10,10,104,30,CY)
    return scan(img)

# ---- battle ----
def knight(d,x,y):
    s=[(0,229,255),(0,165,215),(0,112,158),(0,70,110)]; st=(196,210,224)
    R(d,x+10,y+58,9,22,s[2]); R(d,x+24,y+58,9,22,s[2]); R(d,x+10,y+58,3,22,s[0]); R(d,x+24,y+58,3,22,s[0])
    R(d,x+9,y+78,11,6,(18,20,30)); R(d,x+23,y+78,11,6,(18,20,30))
    d.polygon([(x+8,y+12),(x-8,y+66),(x+14,y+58)],fill=(190,30,112)); d.polygon([(x+8,y+12),(x-1,y+48),(x+10,y+52)],fill=(128,18,80))
    R(d,x+6,y+12,30,48,s[1])
    for py in range(y+18,y+56,8): R(d,x+8,py,26,3,s[0]); R(d,x+8,py+5,26,2,s[3])
    R(d,x+18,y+14,5,44,s[3])
    R(d,x+1,y+14,9,14,st); R(d,x+32,y+14,9,14,st)  # pauldrons
    for rv in (y+16,y+20,y+24): R(d,x+3,rv,2,2,(230,240,250)); R(d,x+35,rv,2,2,(230,240,250))
    R(d,x+10,y-8,22,22,st); R(d,x+10,y-8,22,5,s[0]); R(d,x+14,y+1,14,3,(20,25,40)); R(d,x+14,y+8,14,2,(20,25,40))
    R(d,x+14,y-3,14,7,(245,216,172))
    for k in range(7): R(d,x+10+k*2,y-22,2,15,MG)
    R(d,x+13,y-24,16,5,MG)
    d.polygon([(x-10,y+18),(x+8,y+18),(x+8,y+40),(x-1,y+54),(x-10,y+40)],fill=GOLD)
    d.polygon([(x-7,y+21),(x+5,y+21),(x+5,y+37),(x-1,y+47),(x-7,y+37)],fill=GOLD_H)
    R(d,x-3,y+26,5,12,MG)
    d.line([(x+34,y+18),(x+70,y-16)],fill=(238,250,255),width=5); d.line([(x+35,y+19),(x+71,y-15)],fill=CY,width=2)
    R(d,x+30,y+14,11,11,GOLD); R(d,x+34,y+24,4,9,GOLD_D)
def beast(d,x,y):
    b=[(212,150,255),(178,108,236),(132,66,196),(96,40,150)]; be=(232,192,255)
    R(d,x+18,y+70,16,20,b[3]); R(d,x+54,y+70,16,20,b[3]); R(d,x+18,y+70,16,3,b[1]); R(d,x+54,y+70,16,3,b[1])
    R(d,x+16,y+88,20,6,(38,16,58)); R(d,x+52,y+88,20,6,(38,16,58))
    R(d,x+8,y+26,76,52,b[1]); R(d,x+8,y+26,76,4,be); R(d,x+8,y+26,7,52,b[2]); R(d,x+77,y+26,7,52,b[3])
    R(d,x+24,y+44,44,28,be)
    for sx in range(x+26,x+66,8):
        for sy in range(y+46,y+70,8): R(d,sx,sy,5,5,lerp(be,b[2],0.35))
    R(d,x+80,y+24,22,10,b[1]); R(d,x+100,y+14,10,18,b[3])
    for cl in range(3): d.polygon([(x+100+cl*4,y+8),(x+102+cl*4,y+14),(x+98+cl*4,y+14)],fill=(236,214,255))
    R(d,x+2,y+44,11,20,b[1])
    R(d,x+20,y-10,52,38,b[1]); R(d,x+20,y-10,52,4,be); R(d,x+20,y-10,7,38,b[2])
    d.polygon([(x+22,y-10),(x+13,y-40),(x+36,y-8)],fill=b[1]); d.polygon([(x+13,y-40),(x+20,y-38),(x+34,y-10)],fill=b[3])
    d.polygon([(x+70,y-10),(x+79,y-40),(x+56,y-8)],fill=b[1]); d.polygon([(x+79,y-40),(x+72,y-38),(x+58,y-10)],fill=b[3])
    R(d,x+26,y-2,18,3,b[3]); R(d,x+50,y-2,18,3,b[3])
    d.line([(x+28,y+6),(x+42,y+18)],fill=(32,16,48),width=4); d.line([(x+28,y+18),(x+42,y+6)],fill=(32,16,48),width=4)
    R(d,x+52,y+8,16,7,(255,210,0)); R(d,x+56,y+9,5,5,(32,16,48))
    R(d,x+30,y+22,34,9,(170,30,62))
    for i in range(0,34,5): R(d,x+30+i,y+22,3,9,(255,242,242))
    R(d,x+72,y-4,5,10,CY)  # sweat
    R(d,x+48,y+48,3,18,b[3]); R(d,x+38,y+64,14,3,b[3])
    for rr in range(10,0,-1): d.ellipse([x+4-rr,y+8-rr,x+4+rr,y+8+rr],fill=lerp((255,90,0),(255,230,0),rr/10))
def battle_scene():
    img=Image.new("RGB",(W,H),(26,11,46)); d=ImageDraw.Draw(img)
    horizon=346
    sky(d,(26,11,46),(0,180,205),horizon)
    sun(d,150,110,60,(255,225,80),(255,90,0))
    grid(d,horizon,(0,150,140))
    R(d,0,horizon-2,W,4,(8,30,30))
    bx,by_,bw=150,150,128
    R(d,bx-2,by_-2,bw+4,13,(20,10,30)); Ro(d,bx-2,by_-2,bw+4,13,MG)
    R(d,bx,by_,bw,9,(40,16,40)); R(d,bx,by_,int(bw*0.4),9,MG); R(d,bx,by_,int(bw*0.4),2,(255,160,225))
    R(d,bx-15,by_-3,12,13,(232,232,242)); R(d,bx-12,by_,2,2,(20,10,30)); R(d,bx-7,by_,2,2,(20,10,30))
    knight(d,40,236); beast(d,168,224)
    R(d,10,10,104,30,(20,8,40)); Ro(d,10,10,104,30,CY)
    return scan(img)

scale=2
cas=castle_scene().resize((W*scale,H*scale),Image.NEAREST)
bat=battle_scene().resize((W*scale,H*scale),Image.NEAREST)
gap=30; head=42
sheet=Image.new("RGB",(cas.width+bat.width+gap*3, cas.height+head+gap),(14,12,22))
sd=ImageDraw.Draw(sheet)
try: f=ImageFont.truetype("arialbd.ttf",26)
except: f=ImageFont.load_default()
sheet.paste(cas,(gap,head)); sheet.paste(bat,(gap*2+cas.width,head))
sd.text((gap,10),"CASTLE — 16-bit (shading, dither, glow, detail)",font=f,fill=GOLD)
sd.text((gap*2+cas.width,10),"BATTLE — 16-bit knight vs hurting monster",font=f,fill=CY)
out=r"C:\Users\Bobby\AppData\Local\Temp\claude\C--Users-Bobby-OneDrive-Dokumenter-GitHub-8-bit-timer\880c6e84-dcdf-466d-9865-d382b47be2e4\scratchpad\bit16.png"
sheet.save(out); print("saved",out,sheet.size)
