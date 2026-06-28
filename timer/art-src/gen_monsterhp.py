"""Generate monsterhp.png + monsterhp.json sprite sheet (16-bit, Task B).
Run from timer/art-src/:  python gen_monsterhp.py
Outputs:  timer/assets/monsterhp.png + monsterhp.json

Sheet layout (576 x 248 RGBA, transparent bg):
  Row 0  y=0   h=52  hero frames (28w standard, 36w sword)
  Row 1  y=54  h=40  effect frames
  Row 2  y=96  h=82  beast full/attack/hurt frames (80w)
  Row 3  y=180 h=50  beast_dead (80w)
  Row 4  y=232 h=14  hpframe (120w)
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save, rect, h2c, lerp_color

# ── Palette ───────────────────────────────────────────────────────────────────
# Hero / Cyan knight  (4-tone armor)
A0=h2c('#00e8ff'); A1=h2c('#009ab8'); A2=h2c('#005070'); A3=h2c('#002438')
ST=(196,210,224,255); STH=(235,245,255,255)
GD=(255,200,60,255); GDH=(255,240,150,255); GDD=(160,120,20,255)
CP=(185,18,95,255);  CPH=(220,60,130,255);  CPD=(100,8,50,255)
PL=(255,40,175,255); PLH=(255,160,220,255)
SK=(245,210,160,255)
SWH=(255,255,255,255); SWM=(210,228,252,255); SWD=(130,155,200,255)
BWC=(165,105,48,255);  BWD=(105,60,22,255);   BSTR=(220,235,255,255)
MG=(255,45,180,255);   CY=(0,229,255,255);    CYH=(180,250,255,255)
WHT=(255,255,255,255); IMP=(255,220,40,255);   YEL=(255,210,0,255)
BLK=(10,5,20,255);     RED=(222,28,28,255)

# Beast / Purple demon  (4-tone)
B0=(232,182,255,255); B1=(188,118,238,255); B2=(120,58,195,255); B3=(72,26,135,255)
BHI=(252,222,255,255); BTE=(242,242,244,255)
HRT=(188,0,48,255)

HPFULL=(57,255,20,255); HPLOW=(255,45,180,255)

SW,SH=576,248
img,d=new_sheet(SW,SH)
frames={}

# ── Low-level helpers ─────────────────────────────────────────────────────────
def px(x,y,c):
    if 0<=x<SW and 0<=y<SH: img.putpixel((x,y),c)

def line_px(x0,y0,x1,y1,c,w=1):
    """Bresenham line, w=thickness."""
    dx=abs(x1-x0); dy=abs(y1-y0)
    sx=1 if x0<x1 else -1; sy=1 if y0<y1 else -1
    err=dx-dy; x,y=x0,y0
    while True:
        for ow in range(w):
            px(x,y+ow,c); px(x+ow,y,c)
        if x==x1 and y==y1: break
        e2=2*err
        if e2>-dy: err-=dy; x+=sx
        if e2<dx:  err+=dx; y+=sy

def circle(bx,by,r,c,fill=True):
    for dy in range(-r,r+1):
        dx=int(math.sqrt(max(0,r*r-dy*dy)))
        if fill:
            rect(d,bx-dx,by+dy,dx*2+1,1,c)
        else:
            rect(d,bx-dx,by+dy,1,1,c); rect(d,bx+dx,by+dy,1,1,c)

def tri(pts,c):
    d.polygon(pts,fill=c)

# ═══════════════════════════════════════════════════════════════════════════════
#  HERO DRAWING  (frame 28×52 standard, 36×52 sword)
#  Origin (bx,by) = top-left of frame.
#  Feet land at by+51 (bottom of frame, gives 52px height, ~28×40 visible art
#  with plume above).
# ═══════════════════════════════════════════════════════════════════════════════

def h_plume(bx,by):
    """Magenta plume on helmet top."""
    cx=bx+14
    for k in range(6):
        px2=cx-5+k*2
        ph=5+(3-abs(k-2))
        rect(d,px2,by+1,2,ph,PL)
        rect(d,px2,by+1,1,max(1,ph//2),PLH)
    rect(d,cx-5,by+5,12,2,PLH)

def h_helm(bx,by,bob=0,lean=0):
    HX=bx+8+lean; HY=by+5+bob
    rect(d,HX,HY,12,11,ST)
    rect(d,HX,HY,12,2,STH)
    rect(d,HX-1,HY+3,2,7,ST); rect(d,HX+12,HY+3,2,7,ST)  # cheeks
    rect(d,HX,HY+3,12,2,GD);  rect(d,HX,HY+3,12,1,GDH)   # brow band
    rect(d,HX+1,HY+7,10,4,A3)                              # visor dark
    for gi in range(3): rect(d,HX+2+gi*3,HY+8,2,1,A1)     # slit glints
    rect(d,HX+3,HY+11,6,2,SK)                              # chin/neck

def h_cape(bx,by,bob=0,lean=0):
    CPts=[(bx+10+lean,by+16+bob),(bx+2,by+25),(bx+1,by+46),(bx+7,by+51),(bx+12+lean,by+33+bob)]
    tri(CPts,CPD)
    CPts2=[(bx+10+lean,by+16+bob),(bx+3,by+26),(bx+3,by+44),(bx+8,by+50),(bx+12+lean,by+32+bob)]
    tri(CPts2,CP)
    rect(d,bx+3,by+27,1,14,CPH)

def h_body(bx,by,bob=0,lean=0):
    # Pauldrons
    rect(d,bx+3+lean,by+16+bob,7,6,ST);  rect(d,bx+3+lean,by+16+bob,7,1,STH)
    rect(d,bx+4+lean,by+19+bob,2,2,A2)
    rect(d,bx+18+lean,by+16+bob,7,6,ST); rect(d,bx+18+lean,by+16+bob,7,1,STH)
    rect(d,bx+20+lean,by+19+bob,2,2,A2)
    # Chest
    rect(d,bx+8+lean,by+16+bob,12,13,A1)
    rect(d,bx+8+lean,by+16+bob,12,2,A0)
    rect(d,bx+8+lean,by+26+bob,12,2,A2)
    rect(d,bx+9+lean,by+18+bob,10,1,A2); rect(d,bx+9+lean,by+21+bob,10,1,A2)
    rect(d,bx+13+lean,by+16+bob,2,13,A0)   # center ridge
    # Belt
    rect(d,bx+8+lean,by+29+bob,12,3,GDD)
    rect(d,bx+8+lean,by+29+bob,12,1,GD)
    rect(d,bx+13+lean,by+30+bob,2,2,GDH)
    # Arms
    rect(d,bx+3+lean,by+21+bob,4,9,A1); rect(d,bx+3+lean,by+21+bob,1,9,A0)
    rect(d,bx+21+lean,by+21+bob,4,9,A1); rect(d,bx+24+lean,by+21+bob,1,9,A0)
    rect(d,bx+3+lean,by+30+bob,4,4,A2); rect(d,bx+21+lean,by+30+bob,4,4,A2)  # gauntlets
    # Tassets
    rect(d,bx+8+lean,by+32+bob,6,5,A1);  rect(d,bx+14+lean,by+32+bob,6,5,A1)
    rect(d,bx+8+lean,by+32+bob,12,1,A0)

def h_legs_stand(bx,by,lean=0):
    rect(d,bx+9+lean,by+37,5,11,A2); rect(d,bx+9+lean,by+37,1,11,A1)
    rect(d,bx+14+lean,by+37,5,11,A2); rect(d,bx+17+lean,by+37,1,11,A1)
    rect(d,bx+9+lean,by+39,5,3,ST); rect(d,bx+14+lean,by+39,5,3,ST)  # knees
    rect(d,bx+8+lean,by+48,7,4,A3); rect(d,bx+8+lean,by+48,7,1,A2)
    rect(d,bx+14+lean,by+48,7,4,A3); rect(d,bx+14+lean,by+48,7,1,A2)

def h_legs_run(bx,by,f=0):
    if f==0:
        rect(d,bx+7,by+35,5,14,A2); rect(d,bx+7,by+35,1,14,A1)   # left fwd
        rect(d,bx+16,by+39,5,9,A2); rect(d,bx+19,by+39,1,9,A1)   # right back
        rect(d,bx+6,by+49,8,3,A3);  rect(d,bx+15,by+47,6,3,A3)
    else:
        rect(d,bx+16,by+35,5,14,A2); rect(d,bx+19,by+35,1,14,A1) # right fwd
        rect(d,bx+7,by+39,5,9,A2);   rect(d,bx+7,by+39,1,9,A1)   # left back
        rect(d,bx+15,by+49,8,3,A3);  rect(d,bx+6,by+47,6,3,A3)

def h_shield(bx,by,bob=0,lean=0):
    SX=bx+lean-3; SY=by+21+bob
    tri([(SX+4,SY),(SX,SY+4),(SX,SY+14),(SX+5,SY+18),(SX+10,SY+14),(SX+10,SY+4),(SX+6,SY)],GDD)
    tri([(SX+4,SY+1),(SX+1,SY+4),(SX+1,SY+13),(SX+5,SY+16),(SX+9,SY+13),(SX+9,SY+4),(SX+6,SY+1)],GD)
    rect(d,SX+4,SY+6,2,2,GDH); rect(d,SX+2,SY+8,6,1,MG); rect(d,SX+1,SY+4,1,8,GDH)

def h_backsword(bx,by,bob=0,lean=0):
    """Large broadsword stowed on back – blade angling up-right from left shoulder.
    Call BEFORE body so it renders behind armor."""
    bx0=bx+8+lean; by0=by+17+bob
    # angle ~-1.1 rad: mostly up, slightly right (blade visible above left shoulder)
    ang=-1.1
    dx=math.cos(ang); dy=math.sin(ang)
    length=24
    for i in range(length):
        sx=round(bx0+dx*i); sy=round(by0+dy*i)
        w=3 if i<length-3 else max(1,3-(i-(length-3)))
        col=SWM if i>length//2 else SWD
        rect(d,sx-1,sy,w,1,col)
        if i%4==0: rect(d,sx,sy,1,1,SWH)           # center highlight
    # Bright tip
    sx_tip=round(bx0+dx*length); sy_tip=round(by0+dy*length)
    rect(d,sx_tip-1,sy_tip,2,2,SWH)
    # Crossguard at shoulder (horizontally across)
    rect(d,bx0-4,by0-1,10,2,GD)
    rect(d,bx0-4,by0-1,10,1,GDH)
    # Short grip stub below guard
    rect(d,bx0-1,by0+1,2,5,BWC)
    for gi in range(2): rect(d,bx0-1,by0+2+gi*2,2,1,BWD)

def h_sword_big_idle(bx,by,bob=0,lean=0):
    """Large 2-handed broadsword resting point-down in front, both hands on grip."""
    sx=bx+13+lean                # sword centre x in frame
    bt=by+18+bob                 # guard top y
    # Blade: 30px, tapering to tip
    for i in range(30):
        w=4 if i<25 else max(1,4-(i-24))
        col=SWH if i<2 else (SWM if i<21 else SWD)
        rect(d,sx-w//2,bt+i,w,1,col)
        if i%3==0: rect(d,sx,bt+i,1,1,SWH)         # centre highlight
    rect(d,sx,bt+30,1,2,SWD)                        # pointed tip
    # Wide crossguard
    rect(d,bx+5+lean,bt-1,18,2,GD)
    rect(d,bx+5+lean,bt-1,18,1,GDH)
    # Long 2-handed grip
    rect(d,sx-1,bt+1,3,12,BWC)
    for gi in range(5): rect(d,sx-1,bt+2+gi*2,3,1,BWD)
    # Pommel
    rect(d,sx-2,bt+13,5,3,GD)
    rect(d,sx,bt+13,1,1,GDH)
    # Both gauntlets gripping the handle
    rect(d,bx+7+lean,bt,7,5,A2)                     # upper/right hand
    rect(d,bx+10+lean,bt+6,7,5,A2)                  # lower/left hand

def h_bow(bx,by,draw_state=0,bob=0,lean=0):
    """Bow held IN FRONT (right side of frame, facing monster).
    Left arm extended right to grip bow; right hand near cheek draws string.
    draw_state: 0=nocked, 1=drawn, 2=loose."""
    BX=bx+21+lean                  # bow stave x (right portion of frame)
    BY=by+12+bob                   # bow top
    bh=26                          # bow visible height
    # Bow stave: vertical arc bulging left (toward hero's body)
    for i in range(bh):
        t=i/max(1,bh-1)
        arc=-int(3*math.sin(t*math.pi))   # negative = arc curves left
        rect(d,BX+arc,BY+i,2,1,BWC if (i//2)%2==0 else BWD)
    mid_y=BY+bh//2
    # String
    if draw_state==0:               # nocked: straight string + arrow right
        for sy in range(BY,BY+bh): px(BX+1,sy,BSTR)
        rect(d,bx+10+lean,mid_y,11,1,SWM)           # shaft
        rect(d,bx+21+lean,mid_y-1,4,3,YEL)          # head
    elif draw_state==1:             # drawn: string pulled back + arrow
        pull=5
        for i in range(bh):
            t2=1-abs(2*i/bh-1)
            px(BX+1-int(pull*t2),BY+i,BSTR)
        rect(d,bx+12+lean,mid_y,9,1,SWM)            # shaft
        rect(d,bx+21+lean,mid_y-1,4,3,YEL)          # head
        rect(d,bx+14+lean,by+23+bob,5,4,A2)         # right gauntlet drawing string
    else:                           # loose: string relaxed, no arrow
        for sy in range(BY,BY+bh): px(BX+1,sy,BSTR)
    # Left arm extended forward (horizontal) to grip bow
    rect(d,bx+3+lean,by+26+bob,18,4,A1)
    rect(d,bx+3+lean,by+26+bob,1,4,A0)              # arm edge
    rect(d,bx+18+lean,by+24+bob,4,6,A2)             # gripping gauntlet

def h_cast(bx,by,glow=False,bob=0,lean=0):
    """Raise sword hand with magic orb."""
    # Right arm raised
    rect(d,bx+20+lean,by+14+bob,4,15,A1); rect(d,bx+23+lean,by+14+bob,1,15,A0)
    rect(d,bx+20+lean,by+29+bob,4,4,A2)  # gauntlet
    # Magic orb at tip
    c=PLH if glow else PL
    circle(bx+22+lean,by+11+bob,5,MG,fill=True)
    circle(bx+22+lean,by+11+bob,3,c,fill=True)
    circle(bx+22+lean,by+11+bob,1,WHT,fill=True)
    if glow:
        for r in range(7,10):
            for dy in range(-r,r+1):
                dx=int(math.sqrt(max(0,r*r-dy*dy)))
                fx=bx+22+lean; fy=by+11+bob+dy
                if 0<=fx-dx<SW and 0<=fy<SH:
                    existing=img.getpixel((fx-dx,fy))
                    if existing[3]==0: px(fx-dx,fy,(MG[0],MG[1],MG[2],60))
                if 0<=fx+dx<SW and 0<=fy<SH:
                    existing=img.getpixel((fx+dx,fy))
                    if existing[3]==0: px(fx+dx,fy,(MG[0],MG[1],MG[2],60))

def h_win(bx,by,bob=0,lean=0):
    """Victory pose: sword raised high, left arm out."""
    # Sword raised diagonally up-right from right hand
    for i in range(26):
        t=i/25.0
        sx=bx+21+lean+i; sy=by+14+bob-int(12*t)
        rect(d,sx,sy,2,2,SWM if i>0 else SWH)
        if i%4==0: rect(d,sx,sy,1,1,SWH)
    rect(d,bx+46+lean,by+1+bob,2,4,SWH)  # tip
    rect(d,bx+19+lean,by+17+bob,6,2,GD)
    rect(d,bx+21+lean,by+19+bob,2,7,BWC)
    rect(d,bx+20+lean,by+26+bob,4,3,GD)
    # Left arm out (celebrating)
    rect(d,bx+3+lean,by+19+bob,4,7,A1)
    rect(d,bx+3+lean,by+26+bob,4,4,A0)  # gauntlet raised

# ── Sword swing frames (36×52 frames, body at left, blade sweeps right) ──────
def h_sword0(bx,by):
    """Overhead windup: sword raised HIGH diagonally. NO shield – 2-handed grip."""
    bob=0; lean=2
    h_cape(bx,by,bob,lean); h_helm(bx,by,bob,lean)
    h_body(bx,by,bob,lean); h_legs_stand(bx,by,lean)
    # Big sword raised overhead - blade going up-right, LARGE
    for i in range(28):
        t=i/27.0
        sx=bx+22+i; sy=by+14-int(18*t)
        rect(d,sx,sy,2,3,SWM)
        if i%3==0: rect(d,sx,sy,2,1,SWH)
        if i>24: rect(d,sx,sy,2,3,SWH)  # tip bright
    rect(d,bx+49,by-4,3,6,SWH)           # tip
    rect(d,bx+19,by+16,8,3,GD); rect(d,bx+19,by+16,8,1,GDH)  # guard
    # Both hands on grip (big 2-handed grip)
    rect(d,bx+22,by+19,2,9,BWC)
    for gi in range(4): rect(d,bx+22,by+20+gi*2,2,1,BWD)
    rect(d,bx+21,by+28,4,4,GD); rect(d,bx+22,by+28,2,1,GDH)  # pommel

def h_sword1(bx,by):
    """Mid diagonal slash: sword sweeping right and slightly down."""
    bob=0; lean=4
    h_cape(bx,by,bob,lean); h_helm(bx,by,bob,lean)
    h_body(bx,by,bob,lean); h_legs_stand(bx,by,lean)
    # Sword sweeping mid-diagonal (forward thrust)
    for i in range(28):
        t=i/27.0
        sx=bx+21+i; sy=by+16+int(8*t)
        rect(d,sx,sy,3,2,SWM)
        if i%4==0: rect(d,sx,sy,2,1,SWH)
    rect(d,bx+48,by+23,3,4,SWH)  # tip
    rect(d,bx+18,by+18,5,5,GD); rect(d,bx+18,by+18,5,1,GDH)  # guard
    rect(d,bx+16,by+22,2,8,BWC); rect(d,bx+14,by+22,2,8,BWC)  # two-hand grip
    for gi in range(4): rect(d,bx+14,by+23+gi*2,2,1,BWD)
    rect(d,bx+13,by+30,5,3,GD)

def h_sword2(bx,by):
    """Low follow-through: blade pointing down-right after the swing."""
    bob=0; lean=3
    h_cape(bx,by,bob,lean); h_helm(bx,by,bob,lean)
    h_body(bx,by,bob,lean); h_legs_stand(bx,by,lean)
    # Blade angling down-right (follow-through)
    for i in range(26):
        t=i/25.0
        sx=bx+20+i; sy=by+24+int(16*t)
        rect(d,sx,sy,3,2,SWM)
        if i%4==0: rect(d,sx,sy,2,1,SWH)
    rect(d,bx+45,by+41,3,5,SWH)  # tip
    rect(d,bx+17,by+25,5,5,GD); rect(d,bx+17,by+25,5,1,GDH)
    rect(d,bx+14,by+29,2,8,BWC); rect(d,bx+12,by+29,2,8,BWC)
    for gi in range(4): rect(d,bx+12,by+30+gi*2,2,1,BWD)
    rect(d,bx+11,by+37,5,3,GD)

# ── Assemble hero frames ──────────────────────────────────────────────────────
def draw_hero(bx,by,bob=0,lean=0,legs='stand',legs_f=0,
              weapon='sword',draw_state=0,glow=False,win=False):
    # Stowed back-sword drawn FIRST so body/arms overdraw its base (behind effect)
    # Only for bow and cast – sword combo run frames carry the sword in-hand
    if weapon in ('bow','cast'):
        h_backsword(bx,by,bob,lean)
    h_plume(bx,by)
    h_helm(bx,by,bob,lean)
    h_cape(bx,by,bob,lean)
    h_body(bx,by,bob,lean)
    if legs=='stand': h_legs_stand(bx,by,lean)
    else: h_legs_run(bx,by,legs_f)
    if weapon=='sword':
        h_sword_big_idle(bx,by,bob,lean)   # NO shield; big 2-handed sword
    elif weapon=='bow':
        h_bow(bx,by,draw_state,bob,lean)   # bow in front, sword on back
    elif weapon=='cast':
        h_cast(bx,by,glow,bob,lean)        # NO shield; sword on back
    elif weapon=='win':
        h_win(bx,by,bob,lean)

# Row 0: hero frames (y=0, h=52)
# hero_idle0
draw_hero(0,0,bob=0)
frames['hero_idle0']=[0,0,28,52]

# hero_idle1 (1px breathing bob)
draw_hero(30,0,bob=1)
frames['hero_idle1']=[30,0,28,52]

# hero_draw0 (bow, nocked)
draw_hero(60,0,weapon='bow',draw_state=0)
frames['hero_draw0']=[60,0,28,52]

# hero_draw1 (bow, fully drawn)
draw_hero(90,0,weapon='bow',draw_state=1)
frames['hero_draw1']=[90,0,28,52]

# hero_loose (bow, just released)
draw_hero(120,0,weapon='bow',draw_state=2)
frames['hero_loose']=[120,0,28,52]

# hero_run0 (dash, leaning forward)
draw_hero(150,0,lean=3,legs='run',legs_f=0,weapon='sword')
frames['hero_run0']=[150,0,28,52]

# hero_run1 (dash, stride 2)
draw_hero(180,0,lean=3,legs='run',legs_f=1,weapon='sword')
frames['hero_run1']=[180,0,28,52]

# hero_sword0 (overhead windup, 36w)
h_plume(210,0); h_sword0(210,0)
frames['hero_sword0']=[210,0,36,52]

# hero_sword1 (mid diagonal slash, 36w)
h_plume(252,0); h_sword1(252,0)
frames['hero_sword1']=[252,0,36,52]

# hero_sword2 (low follow-through, 36w)
h_plume(294,0); h_sword2(294,0)
frames['hero_sword2']=[294,0,36,52]

# hero_cast0 (raise hand, no glow)
draw_hero(336,0,weapon='cast',glow=False)
frames['hero_cast0']=[336,0,28,52]

# hero_cast1 (full glow)
draw_hero(366,0,weapon='cast',glow=True)
frames['hero_cast1']=[366,0,28,52]

# hero_win (victory)
draw_hero(396,0,weapon='win')
frames['hero_win']=[396,0,28,52]

# ═══════════════════════════════════════════════════════════════════════════════
#  EFFECTS   (Row 1, y=54)
# ═══════════════════════════════════════════════════════════════════════════════
EY=54  # row 1 y-offset

# arrow (16×4)
rect(d,0,EY+1,12,1,SWM); rect(d,0,EY+1,12,1,SWH)  # shaft
rect(d,12,EY,3,4,YEL)                               # arrowhead
rect(d,14,EY+1,2,2,SWH)                             # tip
rect(d,0,EY+2,4,1,(180,80,30,255))                  # fletching dark
rect(d,0,EY+3,3,1,YEL)                              # fletching bright
frames['arrow']=[0,EY,16,4]

# magic0 (12×12 glowing bolt, dim)
MX0=18; MY0=EY
circle(MX0+6,MY0+6,5,MG,fill=True)
circle(MX0+6,MY0+6,3,PLH,fill=True)
circle(MX0+6,MY0+6,1,WHT,fill=True)
frames['magic0']=[MX0,MY0,12,12]

# magic1 (12×12, bright pulsing)
MX1=32; MY1=EY
circle(MX1+6,MY1+6,5,MG,fill=True)
circle(MX1+6,MY1+6,4,PLH,fill=True)
circle(MX1+6,MY1+6,2,WHT,fill=True)
rect(d,MX1+5,MY1,2,12,MG)    # vertical spike
rect(d,MX1,MY1+5,12,2,MG)    # horizontal spike
frames['magic1']=[MX1,MY1,12,12]

# slash0 (36×40 large cyan/white sword slash arc frame 1)
SL0X=46; SL0Y=EY
PAL_SL={'.':(0,0,0,0),'W':WHT,'C':CY,'H':CYH,'M':MG}
SLASH0=[
    '...........W........................',
    '..........WCC....................W..',
    '.........WCCH..................WCC..',
    '.......WWCCH..............WWWCCH...',
    '.....WCCCH............WWCCCCH......',
    '...WCCCCH........WWCCCCCH..........',
    '..WCCCCH....WWCCCCCCH..............',
    '.WCCCCHWWCCCCCCCH...................',
    'WCCCCCCCCCCH........................',
    'WCCCCCCCH...........................',
    'WCCCCH.............................',
    'WCH....MM..........................',
    'H.....MMMM.........................',
    '......MMMMM........................',
    '.......MMMM........................',
    '........MMM........................',
    '.......MMM..........................',
    '......MM............................',
    '.....M..............................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
]
for ry,row in enumerate(SLASH0):
    for rx,ch in enumerate(row):
        c=PAL_SL.get(ch)
        if c and c[3]>0: img.putpixel((SL0X+rx,SL0Y+ry),c)
frames['slash0']=[SL0X,SL0Y,36,40]

# slash1 (36×40 larger, more spread - second frame of slash arc)
SL1X=84; SL1Y=EY
PAL_SL2={'.':(0,0,0,0),'W':WHT,'C':CY,'H':CYH,'M':(200,100,255,255)}
SLASH1=[
    '....W...............................',
    '....WCC....W........................',
    '...WCCH...WCC.......................',
    '..WCCH....WCC.......................',
    '..WCH.WWCCCCH......................',
    '.WCHWWCCCCCCH......................',
    '.WWCCCCCCCCH.......................',
    'WCCCCCCCCH.........................',
    'WCCCCCCH...........................',
    'WCCCH....MMM.......................',
    'WH......MMMMM......................',
    '........MMMMMM.....................',
    '.........MMMMM.....................',
    '..........MMMM.....................',
    '...........MMM.....................',
    '...........MM.......................',
    '..........M.........................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
]
for ry,row in enumerate(SLASH1):
    for rx,ch in enumerate(row):
        c=PAL_SL2.get(ch)
        if c and c[3]>0: img.putpixel((SL1X+rx,SL1Y+ry),c)
frames['slash1']=[SL1X,SL1Y,36,40]

# impact (18×18 burst)
IX=122; IY=EY
circle(IX+9,IY+9,7,IMP,fill=True)
circle(IX+9,IY+9,4,WHT,fill=True)
circle(IX+9,IY+9,2,(255,90,0,255),fill=True)
# Spikes
for ang in range(0,360,45):
    rad=math.radians(ang)
    for r in range(7,10):
        sx=IX+9+int(r*math.cos(rad)); sy=IY+9+int(r*math.sin(rad))
        if 0<=sx<SW and 0<=sy<SH: px(sx,sy,IMP)
    for r in range(10,13):
        sx=IX+9+int(r*math.cos(rad)); sy=IY+9+int(r*math.sin(rad))
        if 0<=sx<SW and 0<=sy<SH: px(sx,sy,YEL)
frames['impact']=[IX,IY,18,18]

# skull (12×12)
SKX=142; SKY=EY
PAL_SK={'.':(0,0,0,0),'W':BTE,'B':BLK,'Y':YEL}
SKULL=[
    '....WWWW....',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WWWWWWWWWWWW',
    'WWBBBWWBBBWW',
    'WWBBBWWBBBWW',
    'WWWWWWWWWWWW',
    '.WWWWWWWWWW.',
    '..WWBBBBWW..',
    '..WBWWWBW...',
    '...WWWWWW...',
]
for ry,row in enumerate(SKULL):
    for rx,ch in enumerate(row):
        c=PAL_SK.get(ch)
        if c and c[3]>0: img.putpixel((SKX+rx,SKY+ry),c)
frames['skull']=[SKX,SKY,12,12]

# ═══════════════════════════════════════════════════════════════════════════════
#  BEAST  (Row 2, y=96, h=82)
#  Origin (bx,by): feet at by+81 (bottom of 80×82 box)
#  Layout in box: horns y=0..15, head y=12..38, body y=36..68, arms y=28..72, legs y=64..82
# ═══════════════════════════════════════════════════════════════════════════════
BY_ROW=96

def beast_base(bx,by,variant=0,hurt=0):
    """
    Draw full beast. variant: 0=idle_still, 1=idle_shifted, 2=attack0, 3=attack1
    hurt: 0-3 wound level.
    """
    off_x=0; off_y=0
    if variant==1: off_y=1                  # gentle breathing bob
    elif variant==2: off_x=4                # lunge forward
    elif variant==3: off_x=6; off_y=-2     # full lunge

    bxx=bx+off_x; byy=by+off_y

    # ── Horns (2 pairs, 4-tone purple) ────────────────────────────────────
    # Left horn pair
    tri([(bxx+18,byy+14),(bxx+10,byy),(bxx+24,byy+12)],B2)
    tri([(bxx+18,byy+14),(bxx+12,byy+2),(bxx+22,byy+12)],B1)
    rect(d,bxx+13,byy+2,3,8,B0)  # horn highlight
    # Inner left horn
    tri([(bxx+26,byy+12),(bxx+20,byy+2),(bxx+32,byy+12)],B3)
    rect(d,bxx+22,byy+4,2,5,B2)

    # Right horn pair
    tri([(bxx+60,byy+14),(bxx+68,byy),(bxx+56,byy+12)],B2)
    tri([(bxx+60,byy+14),(bxx+66,byy+2),(bxx+58,byy+12)],B1)
    rect(d,bxx+63,byy+2,3,8,B0)
    # Inner right horn
    tri([(bxx+52,byy+12),(bxx+58,byy+2),(bxx+48,byy+12)],B3)
    rect(d,bxx+54,byy+4,2,5,B2)

    # ── Head (52×26) ──────────────────────────────────────────────────────
    HX=bxx+14; HY=byy+12
    rect(d,HX,HY,52,26,B1)
    rect(d,HX,HY,52,3,BHI)          # top highlight
    rect(d,HX,HY,4,26,B2)           # left shadow
    rect(d,HX+48,HY,4,26,B3)        # right shadow
    # Brow ridge
    rect(d,HX+4,HY+4,44,3,B2)
    rect(d,HX+4,HY+4,44,1,B0)       # brow highlight

    # Eyes  (menacing slanted)
    for ei,(ex,ey_) in enumerate([(HX+5,HY+8),(HX+31,HY+8)]):
        rect(d,ex,ey_,16,9,RED)
        rect(d,ex+1,ey_+1,14,7,YEL)
        rect(d,ex+4,ey_+2,8,5,BLK)  # pupil slit
        rect(d,ex+6,ey_+3,4,3,(255,30,30,255))  # pupil glow
        # Angry brow slash
        for bi in range(7):
            rect(d,ex+bi,ey_-3+bi//3,2,1,B3)

    # Snout
    rect(d,HX+16,HY+18,20,8,B3)
    rect(d,HX+18,HY+21,4,3,BLK);  rect(d,HX+26,HY+21,4,3,BLK)  # nostrils

    # Teeth (grin)
    rect(d,HX+6,HY+23,40,4,B3)     # gum dark bar
    for ti in range(6):
        rect(d,HX+7+ti*7,HY+22,5,6,BTE)   # tooth
        rect(d,HX+8+ti*7,HY+23,3,2,WHT)   # tooth highlight

    # ── Neck ──────────────────────────────────────────────────────────────
    rect(d,bxx+30,byy+37,20,6,B1)
    rect(d,bxx+30,byy+37,20,1,BHI)

    # ── Body (58×28) ──────────────────────────────────────────────────────
    BDX=bxx+11; BDY=byy+42
    rect(d,BDX,BDY,58,28,B1)
    rect(d,BDX,BDY,58,3,BHI)        # body top highlight
    rect(d,BDX,BDY,6,28,B2)         # left shadow
    rect(d,BDX+52,BDY,6,28,B3)      # right shadow
    # Belly scales (lighter belly area)
    rect(d,BDX+14,BDY+6,30,16,BHI)
    for sy2 in range(BDY+8,BDY+20,6):
        for sx2 in range(BDX+16,BDX+42,8):
            rect(d,sx2,sy2,5,4,lerp_color(BHI,B1,0.4))  # scale pattern

    # ── Arms (two sides) ──────────────────────────────────────────────────
    # Left arm (from left shoulder, hanging/raised based on variant)
    LA_raise = 4 if variant>=2 else 0
    rect(d,bxx+2,byy+40-LA_raise,14,24,B1)
    rect(d,bxx+2,byy+40-LA_raise,14,2,BHI)
    rect(d,bxx+2,byy+40-LA_raise,3,24,B2)    # arm shadow
    # Left claws
    for ci in range(3):
        rect(d,bxx+3+ci*4,byy+63-LA_raise,3,8,B3)
        rect(d,bxx+4+ci*4,byy+63-LA_raise,1,6,B2)

    # Right arm (raised more during attack)
    RA_raise=10 if variant>=2 else 2
    RA_shift=8 if variant>=2 else 0
    rect(d,bxx+64+RA_shift,byy+34-RA_raise,14,24,B1)
    rect(d,bxx+64+RA_shift,byy+34-RA_raise,14,2,BHI)
    rect(d,bxx+75+RA_shift,byy+34-RA_raise,3,24,B3)
    # Right claws (pointing forward during attack)
    for ci in range(3):
        if variant>=2:
            rect(d,bxx+70+RA_shift+ci*4,byy+55-RA_raise,8,3,B3)
            rect(d,bxx+78+RA_shift+ci*4,byy+55-RA_raise,1,1,BHI)
        else:
            rect(d,bxx+65+ci*4,byy+57,3,8,B3)
            rect(d,bxx+66+ci*4,byy+57,1,6,B2)

    # ── Tail stub ─────────────────────────────────────────────────────────
    tri([(bxx+6,byy+44),(bxx,byy+56),(bxx+14,byy+50)],B2)
    rect(d,bxx+2,byy+48,4,4,B1)

    # ── Legs ──────────────────────────────────────────────────────────────
    rect(d,bxx+18,byy+68,14,14,B3)
    rect(d,bxx+18,byy+68,14,2,B2)
    rect(d,bxx+16,byy+80,18,2,(38,16,58,255))  # foot dark
    rect(d,bxx+48,byy+68,14,14,B3)
    rect(d,bxx+48,byy+68,14,2,B2)
    rect(d,bxx+46,byy+80,18,2,(38,16,58,255))

    # ── Wound overlays ────────────────────────────────────────────────────
    if hurt>=1:
        # Level 1: head gash, small body mark
        rect(d,bxx+30,byy+15,16,2,HRT)
        rect(d,bxx+26,byy+22,4,4,HRT)   # eye X (left eye damaged)
        # X over left eye
        for di in range(6): rect(d,bxx+7+di,byy+8+di,1,1,RED)
        for di in range(6): rect(d,bxx+7+di,byy+13-di,1,1,RED)
    if hurt>=2:
        # Level 2: more gashes, gritted teeth change
        rect(d,bxx+20,byy+44,24,3,HRT)  # body slash
        rect(d,bxx+4,byy+40,8,2,HRT)    # arm gash
        rect(d,bxx+38,byy+20,10,3,HRT)  # head gash
        # Gritted teeth (darker, grimacing)
        rect(d,bxx+14+6,byy+12+23,40,4,B3)
        for ti in range(4):
            rect(d,bxx+14+7+ti*10,byy+12+22,7,6,BTE)
    if hurt>=3:
        # Level 3: severe - both eyes X'd out
        for di in range(6):
            rect(d,bxx+7+di,byy+8+di,1,1,RED)
            rect(d,bxx+7+di,byy+13-di,1,1,RED)
            rect(d,bxx+33+di,byy+8+di,1,1,RED)
            rect(d,bxx+33+di,byy+13-di,1,1,RED)
        rect(d,bxx+10,byy+38,60,3,HRT)  # massive body wound
        rect(d,bxx+2,byy+42,14,4,HRT)   # left arm wound


# beast_idle0
beast_base(0,BY_ROW,variant=0,hurt=0)
frames['beast_idle0']=[0,BY_ROW,80,82]

# beast_idle1 (slight bob)
beast_base(82,BY_ROW,variant=1,hurt=0)
frames['beast_idle1']=[82,BY_ROW,80,82]

# beast_attack0 (lunge start)
beast_base(164,BY_ROW,variant=2,hurt=0)
frames['beast_attack0']=[164,BY_ROW,80,82]

# beast_attack1 (full lunge/swipe)
beast_base(246,BY_ROW,variant=3,hurt=0)
frames['beast_attack1']=[246,BY_ROW,80,82]

# beast_hurt1 (first wound tier)
beast_base(328,BY_ROW,variant=0,hurt=1)
frames['beast_hurt1']=[328,BY_ROW,80,82]

# beast_hurt2 (second wound tier)
beast_base(410,BY_ROW,variant=0,hurt=2)
frames['beast_hurt2']=[410,BY_ROW,80,82]

# beast_hurt3 (critical wounds, X eyes)
beast_base(492,BY_ROW,variant=0,hurt=3)
frames['beast_hurt3']=[492,BY_ROW,80,82]

# ═══════════════════════════════════════════════════════════════════════════════
#  BEAST DEAD  (Row 3, y=180, h=50, 80×50)
# ═══════════════════════════════════════════════════════════════════════════════
DDX=0; DDY=180
# Flattened body, lying on side
rect(d,DDX+4,DDY+14,70,22,B1)
rect(d,DDX+4,DDY+14,70,2,BHI)
rect(d,DDX+4,DDY+32,70,4,B3)
# Head lying (angled, on right side)
rect(d,DDX+46,DDY+6,28,18,B1)
rect(d,DDX+46,DDY+6,28,2,BHI)
rect(d,DDX+74,DDY+6,4,18,B3)
# X eyes (dead)
for ei,ex in [(0,DDX+50),(1,DDX+62)]:
    for di in range(5):
        rect(d,ex+di,DDY+9+di,1,1,BLK)
        rect(d,ex+4-di,DDY+9+di,1,1,BLK)
# Teeth visible
rect(d,DDX+48,DDY+18,26,4,B3)
for ti in range(4): rect(d,DDX+50+ti*6,DDY+17,4,5,BTE)
# Arms flopped
rect(d,DDX+2,DDY+24,20,10,B3); rect(d,DDX+2,DDY+24,20,2,B2)
rect(d,DDX+50,DDY+26,16,8,B3); rect(d,DDX+50,DDY+26,16,2,B2)
# Horns lying flat
tri([(DDX+4,DDY+12),(DDX,DDY+4),(DDX+14,DDY+13)],B2)
tri([(DDX+18,DDY+12),(DDX+14,DDY+3),(DDX+28,DDY+13)],B2)
# Wound marks
rect(d,DDX+10,DDY+16,30,3,HRT)
rect(d,DDX+30,DDY+8,14,2,HRT)
frames['beast_dead']=[DDX,DDY,80,50]

# ═══════════════════════════════════════════════════════════════════════════════
#  HP FRAME  (Row 4, y=232, 120×14)
# ═══════════════════════════════════════════════════════════════════════════════
HFX=0; HFY=232
rect(d,HFX,HFY,120,14,A3)
rect(d,HFX+1,HFY+1,118,12,BLK)
rect(d,HFX,HFY,4,2,CY); rect(d,HFX+116,HFY,4,2,CY)
rect(d,HFX,HFY+12,4,2,CY); rect(d,HFX+116,HFY+12,4,2,CY)
rect(d,HFX+2,HFY+2,116,10,A3)
frames['hpframe']=[HFX,HFY,120,14]

# ── Save ──────────────────────────────────────────────────────────────────────
save(img,frames,'monsterhp')
print("Frames generated:")
for name,(x,y,w,h) in sorted(frames.items()):
    print(f"  {name:18s} [{x:3d},{y:3d},{w:2d},{h:2d}]")
