"""High-detail Direction-B mockup: ornate castle (windows, cannons, banners) + detailed battle."""
from PIL import Image, ImageDraw, ImageFont
import math
W,H=240,350
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def R(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],fill=c)
def Ro(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],outline=c)
def bg(skyt,skyb,sunt,sunb,grid,horizon=276,sunx=120,suny=92,sunr=50,glow=True):
    img=Image.new("RGB",(W,H),skyt); d=ImageDraw.Draw(img)
    for y in range(horizon): d.line([(0,y),(W,y)],fill=lerp(skyt,skyb,y/horizon))
    if glow:
        for rr in range(sunr+30,sunr,-1):
            t=(rr-sunr)/30; d.ellipse([sunx-rr,suny-rr,sunx+rr,suny+rr],fill=lerp(skyb,sunt,(1-t)*0.18))
    for dy in range(-sunr,sunr):
        dx=int(math.sqrt(max(0,sunr*sunr-dy*dy)))
        if dx==0: continue
        if dy>0 and ((dy-1)//4)%2==1: continue
        d.line([(sunx-dx,suny+dy),(sunx+dx,suny+dy)],fill=lerp(sunt,sunb,(dy+sunr)/(2*sunr)))
    R(d,0,horizon,W,H-horizon,lerp(skyt,(8,4,16),0.5))
    vp=(W//2,horizon)
    for gx in range(-8,9): d.line([vp,(W//2+gx*44,H)],fill=grid)
    yy=horizon; step=6
    while yy<H: d.line([(0,yy),(W,yy)],fill=grid); yy+=step; step=int(step*1.42)+1
    return img,d
def scan(img):
    o=Image.new("RGBA",(W,H),(0,0,0,0)); dd=ImageDraw.Draw(o)
    for y in range(0,H,2): dd.line([(0,y),(W,y)],fill=(0,0,0,48))
    img=img.convert("RGBA"); img.alpha_composite(o); return img.convert("RGB")

BL=(124,100,160); BM=(92,70,126); BD=(60,42,90); MOR=(38,24,56); HIL=(176,144,216)
GLOW=(255,206,120); CAN=(46,46,60); CAN_D=(22,22,32); SPARK=(255,180,70)
GOLD=(255,210,80); MG=(255,45,180); CY=(0,229,255)

def bricks(d,x,y,w,h):
    bw,bh=10,7
    for by in range(y,y+h,bh):
        off=((by//bh)%2)*5
        for bx in range(x-off,x+w,bw):
            xx=max(x,bx); ww=min(x+w,bx+bw)-xx
            if ww<=0: continue
            hh=min(bh,y+h-by)
            tone=BL if ((bx//bw+by//bh)%3==0) else BM
            R(d,xx,by,ww,hh,tone)
            R(d,xx,by,ww,1,lerp(tone,HIL,0.6))      # top highlight
            R(d,xx,by+hh-1,ww,1,MOR)                # bottom shadow
    R(d,x,y,2,h,HIL)                                # left lit edge
    R(d,x+w-2,y,2,h,BD)                             # right shadow edge

def merlons(d,x,y,w):
    for i in range(0,w,12):
        R(d,x+i,y-7,7,7,BM); R(d,x+i,y-7,7,1,HIL); R(d,x+i,y,7,2,BD)

def arrowslit(d,x,y):
    R(d,x,y,3,12,(18,12,28)); R(d,x-2,y+3,7,3,(18,12,28))
    R(d,x+1,y+1,1,8,GLOW)  # faint glow inside

def litwindow(d,x,y):  # arched glowing window
    R(d,x-1,y-1,10,14,BD); R(d,x,y,8,12,GLOW); R(d,x+1,y+1,6,5,(255,235,180))
    R(d,x,y,8,1,(255,240,200)); R(d,x+3,y,2,12,BD)  # cross frame
def cannon(d,x,y,firing=False):
    R(d,x,y,16,7,CAN); R(d,x,y,16,2,(80,80,96)); R(d,x+14,y+1,4,5,CAN_D)  # barrel + muzzle
    R(d,x-3,y+5,6,4,(34,34,46))  # carriage
    if firing:
        R(d,x+18,y,6,7,SPARK); R(d,x+24,y+1,4,5,(255,230,140))
        for a in range(5):
            an=-0.6+a*0.3; R(d,x+22+int(7*math.cos(an)),y+3+int(7*math.sin(an)),2,2,(255,150,40))
def banner(d,x,y,col):
    R(d,x,y,12,30,col); d.polygon([(x,y+30),(x+6,y+24),(x+12,y+30)],fill=col)
    R(d,x,y,12,3,lerp(col,(255,255,255),0.4)); R(d,x+4,y+8,4,4,GOLD)
def pennant(d,x,y,col):
    d.polygon([(x,y),(x,y+14),(x+16,y+7)],fill=col); R(d,x,y,2,16,(210,210,225))

def castle_scene():
    img,d=bg((43,12,61),(255,94,148),(255,221,102),(255,46,136),(150,40,110))
    gy=276
    R(d,12,gy-3,216,6,BD)  # ground ledge
    # ---- main keep ----
    kx,kw=58,124; kh=150; ky=gy-kh
    bricks(d,kx,ky,kw,kh)
    merlons(d,kx,ky,kw)
    # lit windows grid
    for ry in range(ky+24,gy-46,34):
        for rx in range(kx+16,kx+kw-16,34):
            litwindow(d,rx,ry)
    # arrow slits between
    for rx in range(kx+30,kx+kw-20,34):
        arrowslit(d,rx,ky+12)
    # cannons protruding from mid level (firing one)
    cannon(d,kx-6,gy-92,firing=True)
    cannon(d,kx+kw-10,gy-92,firing=False)
    # portcullis gate
    gx=kx+kw//2-16
    R(d,gx,gy-44,32,44,(16,10,26))
    for i in range(gx,gx+32,5): R(d,i,gy-44,1,44,(70,55,95))
    for j in range(gy-44,gy,6): R(d,gx,j,32,1,(70,55,95))
    R(d,gx-2,gy-48,36,5,BD); R(d,gx-2,gy-48,36,1,HIL)  # arch
    # hanging banners
    banner(d,kx+10,ky+10,MG); banner(d,kx+kw-22,ky+10,CY)
    # ---- corner towers (taller, conical-ish crenellated) ----
    for tx,pen in ((kx-22,MG),(kx+kw-4,CY)):
        th=kh+30; ty=gy-th
        bricks(d,tx,ty,26,th)
        for i in range(0,26,8): R(d,tx+i,ty-8,5,8,BM); R(d,tx+i,ty-8,5,1,HIL)
        litwindow(d,tx+8,ty+30); arrowslit(d,tx+10,ty+60)
        pennant(d,tx+11,ty-22,pen)
    # ---- worker laying a stone on the keep top ----
    wx=kx+kw-46; wy=ky-2
    R(d,wx,wy,11,13,(60,140,180)); R(d,wx,wy,11,3,(120,200,235))  # body
    R(d,wx+2,wy-7,7,7,(245,210,160)); R(d,wx+1,wy-9,9,3,(210,60,60))  # head+cap
    R(d,wx+10,wy-7,3,9,(150,96,60)); R(d,wx+11,wy-10,6,5,(120,120,130))  # hammer
    R(d,wx-4,wy-3,10,7,HIL); Ro(d,wx-4,wy-3,10,7,MOR)  # stone being placed
    R(d,wx+16,wy-9,2,2,CY); R(d,wx+18,wy-6,2,2,CY)  # spark
    # ---- flagpole with climbing flag + tier markers ----
    px=214; ptop=gy-186; R(d,px,ptop,3,gy-ptop,(200,200,215)); R(d,px-1,ptop-4,5,4,GOLD)
    for m in range(1,6):
        my=gy-int((gy-ptop)*m/5); R(d,px-4,my,3,1,CY)
    fy=ptop+int((gy-ptop)*(1-0.62))
    d.polygon([(px+3,fy),(px+30,fy+9),(px+3,fy+18)],fill=GOLD); R(d,px+8,fy+5,6,6,MG)
    # torches with neon flame
    for txp in (kx+6,kx+kw-10):
        R(d,txp,gy-58,2,8,(120,80,50)); R(d,txp-1,gy-64,4,6,(255,140,40)); R(d,txp,gy-67,2,3,GOLD)
    # clock
    R(d,8,8,84,24,(18,6,32)); Ro(d,8,8,84,24,(0,245,212))
    return scan(img)

# ---------------- detailed battle ----------------
def knight(d,x,y):
    s1=(0,229,255); s2=(0,150,200); s3=(0,95,140); st=(190,205,220)
    # legs/greaves
    R(d,x+8,y+48,8,18,s2); R(d,x+20,y+48,8,18,s2); R(d,x+8,y+48,3,18,s1); R(d,x+20,y+48,3,18,s1)
    R(d,x+7,y+64,10,5,(20,22,32)); R(d,x+19,y+64,10,5,(20,22,32))
    # cape
    d.polygon([(x+6,y+10),(x-6,y+56),(x+12,y+50)],fill=(180,30,110)); d.polygon([(x+6,y+10),(x-2,y+40),(x+8,y+44)],fill=(120,18,76))
    # torso plates
    R(d,x+5,y+10,26,40,s2); R(d,x+5,y+10,26,3,s1)
    for py in (y+18,y+28,y+38): R(d,x+7,py,22,2,s1); R(d,x+7,py+4,22,2,s3)
    R(d,x+15,y+12,5,36,s3)  # center seam
    R(d,x+2,y+12,7,12,st); R(d,x+27,y+12,7,12,st)  # pauldrons
    # head+helm with visor
    R(d,x+9,y-6,18,18,st); R(d,x+9,y-6,18,4,s1); R(d,x+12,y+2,12,3,(20,25,40)); R(d,x+12,y+8,12,2,(20,25,40))
    R(d,x+12,y-1,12,6,(245,215,170))
    for k in range(6): R(d,x+9+k*2,y-16,2,11,MG)  # plume
    R(d,x+12,y-18,12,5,MG)
    # kite shield with emblem
    d.polygon([(x-8,y+16),(x+6,y+16),(x+6,y+34),(x-1,y+46),(x-8,y+34)],fill=GOLD)
    d.polygon([(x-6,y+18),(x+4,y+18),(x+4,y+32),(x-1,y+40),(x-6,y+32)],fill=(255,235,150))
    R(d,x-3,y+22,4,10,MG)
    # longsword swinging, glowing edge
    d.line([(x+30,y+16),(x+62,y-14)],fill=(235,248,255),width=4)
    d.line([(x+31,y+17),(x+63,y-13)],fill=CY,width=1)
    R(d,x+27,y+13,9,9,GOLD); R(d,x+30,y+22,3,8,(190,140,40))
    for a in range(6):
        an=-0.4+a*0.16; R(d,x+50+int(16*math.cos(an)),y-2+int(16*math.sin(an)),2,2,(255,255,255))
def beast(d,x,y):
    b1=(199,125,255); b2=(150,80,210); b3=(105,45,160); be=(225,180,255)
    # legs
    R(d,x+16,y+62,14,18,b3); R(d,x+48,y+62,14,18,b3); R(d,x+16,y+62,14,3,b2); R(d,x+48,y+62,14,3,b2)
    R(d,x+14,y+78,18,5,(40,18,60)); R(d,x+46,y+78,18,5,(40,18,60))
    # body with belly shading
    R(d,x+8,y+24,68,46,b1); R(d,x+8,y+24,68,4,be); R(d,x+8,y+24,6,46,b2); R(d,x+70,y+24,6,46,b3)
    R(d,x+22,y+40,40,24,be)  # belly
    for sx in range(x+24,x+60,9): R(d,sx,y+44,5,5,lerp(be,b2,0.4))
    # arms: one fighting back (raised claw)
    R(d,x+72,y+22,20,9,b1); R(d,x+90,y+14,9,16,b3)
    for cl in range(3): R(d,x+90+cl*3,y+8,2,8,(230,210,255))  # claws
    R(d,x+2,y+40,10,18,b1)  # other arm
    # head tilted in pain
    R(d,x+18,y-8,48,34,b1); R(d,x+18,y-8,48,4,be); R(d,x+18,y-8,6,34,b2)
    # horns/ears
    d.polygon([(x+20,y-8),(x+12,y-34),(x+32,y-6)],fill=b1); d.polygon([(x+12,y-34),(x+18,y-32),(x+30,y-8)],fill=b3)
    d.polygon([(x+64,y-8),(x+72,y-34),(x+52,y-6)],fill=b1); d.polygon([(x+72,y-34),(x+66,y-32),(x+54,y-8)],fill=b3)
    # brow furrowed
    R(d,x+24,y+0,16,3,b3); R(d,x+46,y+0,16,3,b3)
    # eyes: left X (shut in pain), right squint
    d.line([(x+26,y+6),(x+38,y+16)],fill=(30,15,45),width=3); d.line([(x+26,y+16),(x+38,y+6)],fill=(30,15,45),width=3)
    R(d,x+48,y+8,14,6,(255,210,0)); R(d,x+52,y+9,4,4,(30,15,45))
    # gritted mouth
    R(d,x+28,y+20,30,8,(170,30,60))
    for i in range(0,30,5): R(d,x+28+i,y+20,2,8,(255,240,240))
    # sweat drop + wounds
    R(d,x+66,y-2,4,8,CY); R(d,x+44,y+44,3,16,b3); R(d,x+34,y+58,12,3,b3)
    # impact burst near hit side
    R(d,x+2,y+6,14,14,(255,90,0))
    for a in range(8):
        an=a*math.pi/4; R(d,x+8+int(11*math.cos(an)),y+12+int(11*math.sin(an)),3,3,(255,230,0))
def battle_scene():
    img,d=bg((26,11,46),(0,170,200),(255,221,0),(255,90,0),(0,150,140))
    gy=276; R(d,0,gy-2,W,4,(8,30,30))
    # boss HP bar above monster (clear of clock)
    bx,by_,bw=120,150,100
    R(d,bx-2,by_-2,bw+4,12,(20,10,30)); Ro(d,bx-2,by_-2,bw+4,12,MG)
    R(d,bx,by_,bw,8,(40,16,40)); R(d,bx,by_,int(bw*0.38),8,MG); R(d,bx,by_,int(bw*0.38),2,(255,150,220))
    R(d,bx-13,by_-3,10,12,(230,230,240)); R(d,bx-11,by_,2,2,(20,10,30)); R(d,bx-7,by_,2,2,(20,10,30))
    knight(d,30,194)
    beast(d,128,184)
    R(d,8,8,84,24,(20,8,40)); Ro(d,8,8,84,24,(0,229,255))
    return scan(img)

scale=3
cas=castle_scene().resize((W*scale,H*scale),Image.NEAREST)
bat=battle_scene().resize((W*scale,H*scale),Image.NEAREST)
gap=34; head=44
sheet=Image.new("RGB",(cas.width+bat.width+gap*3, cas.height+head+gap),(14,12,22))
sd=ImageDraw.Draw(sheet)
try: f=ImageFont.truetype("arialbd.ttf",28)
except: f=ImageFont.load_default()
sheet.paste(cas,(gap,head)); sheet.paste(bat,(gap*2+cas.width,head))
sd.text((gap,10),"CASTLE — detailed (windows, cannons, banners, towers, torches)",font=f,fill=GOLD)
sd.text((gap*2+cas.width,10),"BATTLE — detailed knight vs hurting monster",font=f,fill=CY)
out=r"C:\Users\Bobby\AppData\Local\Temp\claude\C--Users-Bobby-OneDrive-Dokumenter-GitHub-8-bit-timer\880c6e84-dcdf-466d-9865-d382b47be2e4\scratchpad\detail_b.png"
sheet.save(out); print("saved",out,sheet.size)
