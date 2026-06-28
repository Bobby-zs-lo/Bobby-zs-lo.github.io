"""Mockup: detailed castle built SECTION-BY-SECTION with visible WOODEN scaffolding
(removed per section/milestone), + knight hand clarification."""
from PIL import Image, ImageDraw, ImageFont
import math
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def R(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],fill=c)
def Ro(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],outline=c)

# castle palette (matches reference_bit16)
BR=[(132,108,168),(104,82,138),(78,58,108),(56,40,82)]; MOR=(36,22,54); HIL=(186,156,224)
GLOW=(255,206,120); GLOW2=(255,150,60); CAN=(58,58,74); GOLD=(255,210,80); GOLDd=(180,130,30)
MG=(255,45,180); CY=(0,229,255)
WOOD=(156,104,58); WOODl=(196,150,98); WOODd=(98,62,32); LASH=(40,26,18); CLOUD=(196,214,224)

CW,CH=224,250                  # full castle canvas
KX,KW=58,108                   # keep x, width
GY=240                         # ground baseline within canvas
KEEP_TOP=GY-150
TOWER_W=28
TX1,TX2=KX-22,KX+KW-6
TOWER_TOP=GY-184

def bricks(d,x,y,w,h):
    bw,bh=8,6
    for by in range(y,y+h,bh):
        off=((by//bh)%2)*4
        for bx in range(x-off,x+w,bw):
            xx=max(x,bx); ww=min(x+w,bx+bw)-xx
            if ww<=0: continue
            hh=min(bh,y+h-by)
            tone=BR[(bx*5+by*3)//bw%2]
            R(d,xx,by,ww,hh,tone); R(d,xx,by,ww,1,lerp(tone,HIL,0.5)); R(d,xx,by+hh-1,ww,1,MOR)
    R(d,x,y,2,h,HIL); R(d,x+w-2,y,2,h,BR[3])

def litwin(d,x,y):
    R(d,x-1,y-1,11,15,BR[3])
    for i in range(13): R(d,x,y+i,9,1,lerp(GLOW,GLOW2,i/13))
    R(d,x+4,y,1,13,BR[3]); R(d,x,y+6,9,1,BR[3])
def cannon(d,x,y):
    R(d,x,y,16,7,CAN); R(d,x,y,16,2,(110,110,128)); R(d,x+14,y+1,5,5,(16,16,24)); R(d,x-3,y+6,6,4,(40,40,54))
def banner(d,x,y,col):
    for i in range(28): R(d,x,y+i,12,1,lerp(lerp(col,(255,255,255),0.3),col,i/28))
    d.polygon([(x,y+28),(x+6,y+22),(x+12,y+28)],fill=lerp(col,(0,0,0),0.2)); R(d,x+4,y+7,5,5,GOLD)
def torch(d,x,y):
    R(d,x,y,3,8,(120,80,50)); R(d,x-1,y-6,5,6,GLOW2); R(d,x,y-9,3,3,GOLD)

def draw_castle_full():
    """Full detailed castle on transparent canvas."""
    im=Image.new("RGBA",(CW,CH),(0,0,0,0)); d=ImageDraw.Draw(im)
    # towers
    for tx in (TX1,TX2):
        bricks(d,tx,TOWER_TOP,TOWER_W,GY-TOWER_TOP)
        litwin(d,tx+9,TOWER_TOP+34); litwin(d,tx+9,TOWER_TOP+70)
    # keep
    bricks(d,KX,KEEP_TOP,KW,GY-KEEP_TOP)
    # windows grid
    for ry in range(KEEP_TOP+22,GY-54,38):
        for rx in range(KX+18,KX+KW-18,38): litwin(d,rx,ry)
    # cannons
    cannon(d,KX-6,GY-104); cannon(d,KX+KW-10,GY-104); cannon(d,KX-6,GY-64); cannon(d,KX+KW-10,GY-64)
    # portcullis gate
    gx=KX+KW//2-16; R(d,gx,GY-46,32,46,(14,8,24))
    for i in range(gx,gx+32,5): R(d,i,GY-46,1,46,(74,58,100))
    for j in range(GY-46,GY,6): R(d,gx,j,32,1,(74,58,100))
    R(d,gx-2,GY-50,36,4,BR[2]); R(d,gx-2,GY-50,36,1,HIL)
    # banners
    banner(d,KX+12,KEEP_TOP+12,MG); banner(d,KX+KW-24,KEEP_TOP+12,CY)
    # torches mounted on keep wall
    torch(d,KX+6,GY-30); torch(d,KX+KW-9,GY-30)
    return im

def battlements(d,x,y,w):
    for i in range(0,w,14): R(d,x+i,y-7,9,9,BR[1]); R(d,x+i,y-7,9,1,HIL); R(d,x+i,y,9,2,BR[3])

CASTLE=draw_castle_full()

def wooden_scaffold(d, x0, x1, yTop, yBot):
    """Reference-style timber scaffolding wrapping a section between yTop..yBot."""
    # clouds at base
    for cxp in (x0-6,x1-2,(x0+x1)//2-8):
        for k in range(3):
            R(d,cxp-4+k*5,yBot-3+ (k%2)*2,8,5,CLOUD)
    # vertical poles (outer + one mid)
    poles=[x0-6,x0+ (x1-x0)//2-1, x1+2]
    for px in poles:
        R(d,px,yTop-6,3,yBot-yTop+10,WOOD); R(d,px,yTop-6,1,yBot-yTop+10,WOODl)
    # horizontal platforms / planks at 3 levels
    levels=[yBot-2, (yTop+yBot)//2, yTop+4]
    for ly in levels:
        R(d,x0-7,ly,(x1-x0)+12,3,WOOD); R(d,x0-7,ly,(x1-x0)+12,1,WOODl); R(d,x0-7,ly+3,(x1-x0)+12,1,WOODd)
        # lashings where planks meet poles
        for px in poles: R(d,px-1,ly-1,4,5,LASH)
    # diagonal cross-braces between levels
    for a,b in zip(levels[:-1],levels[1:]):
        d.line([(x0-6,a),(x0+(x1-x0)//2,b)],fill=WOODd,width=1)
        d.line([(x1+2,a),(x0+(x1-x0)//2,b)],fill=WOODd,width=1)
    # ladder on the right pole
    lx=x1+2
    d.line([(lx+5,yTop-6),(lx+5,yBot)],fill=WOOD); d.line([(lx+9,yTop-6),(lx+9,yBot)],fill=WOOD)
    for ry in range(yTop-4,yBot,6): R(d,lx+5,ry,5,2,WOODl)

def castle_frame(reveal_y, active=None, complete=False):
    """reveal_y: world Y above which castle is NOT yet built (lower y = taller).
       active: (x0,x1,yTop,yBot) section currently scaffolded (None if between/komplete)."""
    W,H=CW,260
    img=Image.new("RGB",(W,H),(43,12,61)); d=ImageDraw.Draw(img)
    horizon=GY
    for y in range(horizon): d.line([(0,y),(W,y)],fill=lerp((43,12,61),(255,94,148),y/horizon))
    R(d,0,horizon,W,H-horizon,(28,8,42))
    vp=(W//2,horizon)
    for gx in range(-8,9): d.line([vp,(W//2+gx*40,H)],fill=(150,40,110))
    # paste castle revealed from bottom up to reveal_y
    if reveal_y < GY:
        band=CASTLE.crop((0,reveal_y,CW,GY))
        img.paste(band,(0,reveal_y),band)
    d=ImageDraw.Draw(img)
    if complete:
        battlements(d,KX,KEEP_TOP,KW)
        for tx in (TX1,TX2): battlements(d,tx,TOWER_TOP,TOWER_W)
    if active:
        wooden_scaffold(d,*active)
        # builder on the mid platform of the active section
        x0,x1,yTop,yBot=active; ply=(yTop+yBot)//2
        wx=(x0+x1)//2-6
        R(d,wx,ply-13,12,13,(58,140,182)); R(d,wx,ply-13,12,3,(120,205,238))
        R(d,wx+2,ply-20,8,7,(245,212,165)); R(d,wx+1,ply-23,10,4,(214,62,62))
        R(d,wx+11,ply-20,3,9,WOOD); R(d,wx+12,ply-23,6,5,(150,150,162))
    # flagpole + climbing flag
    px=TX2+TOWER_W+8; ptop=GY-190; R(d,px,ptop,2,GY-ptop,(206,206,222))
    frac=(GY-reveal_y)/(GY-TOWER_TOP)
    fy=ptop+int((GY-ptop)*(1-min(1,frac)))
    d.polygon([(px+2,fy),(px+22,fy+7),(px+2,fy+14)],fill=GOLD)
    # scanline
    o=Image.new("RGBA",(W,H),(0,0,0,0)); dd=ImageDraw.Draw(o)
    for y in range(0,H,2): dd.line([(0,y),(W,y)],fill=(0,0,0,46))
    img=img.convert("RGBA"); img.alpha_composite(o); return img.convert("RGB")

# Build narrative: section bands bottom->top
# section1 lower keep, section2 mid keep, section3 upper keep + towers
frames=[
  (castle_frame(GY-40, active=(KX,KX+KW,GY-78,GY-40)), "1. section building behind scaffold"),
  (castle_frame(GY-78, active=None), "2. milestone: scaffold removed, section revealed"),
  (castle_frame(GY-78, active=(KX,KX+KW,GY-118,GY-78)), "3. next section scaffolded, rising"),
  (castle_frame(GY-150, active=(TX1,TX2+TOWER_W,GY-184,GY-150)), "4. towers section scaffolded"),
  (castle_frame(TOWER_TOP, active=None, complete=True), "5. complete (scaffold gone, battlements)"),
]
sc=3; cw=CW*sc; ch=260*sc; gap=14; lab=26
W=gap+len(frames)*(cw+gap); Hh=lab+ch+gap
sheet=Image.new("RGB",(W,Hh),(22,16,34)); sd=ImageDraw.Draw(sheet)
try: f=ImageFont.truetype("arialbd.ttf",17)
except: f=ImageFont.load_default()
x=gap
for im,lbl in frames:
    sheet.paste(im.resize((cw,ch),Image.NEAREST),(x,lab)); sd.text((x+2,6),lbl,font=f,fill=GOLD); x+=cw+gap
OUT=r"C:\Users\Bobby\AppData\Local\Temp\claude\C--Users-Bobby-OneDrive-Dokumenter-GitHub-8-bit-timer\880c6e84-dcdf-466d-9865-d382b47be2e4\scratchpad"
sheet.save(OUT+r"\fix2_castle.png"); print("castle", sheet.size)

# downscaled view for inspection
sheet.resize((1960,int(1960*Hh/W)),Image.NEAREST).save(OUT+r"\fix2_castle_view.png")
print("view saved")
