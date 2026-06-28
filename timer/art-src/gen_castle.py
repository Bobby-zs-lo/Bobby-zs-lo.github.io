"""Generate castle.png + castle.json sprite sheet (16-bit fidelity, RGBA transparent bg).
Run from timer/art-src/:  python gen_castle.py

Frames
------
castle_full   [0,   0,   206, 254]  full fortress (keep+towers+windows+cannons+portcullis+banners)
stone         [0,   256, 10,  6  ]  placeable stone block
worker0       [12,  256, 14,  18 ]  builder hammer-up
worker1       [28,  256, 14,  18 ]  builder hammer-down
worker_walk0  [44,  256, 14,  18 ]  builder walking step 0
worker_walk1  [60,  256, 14,  18 ]  builder walking step 1
flag          [76,  256, 22,  14 ]  pennant (pointing right, pole on left)
cannon_fire0  [100, 256, 12,  10 ]  muzzle flash frame 0 (small)
cannon_fire1  [114, 256, 12,  10 ]  muzzle flash frame 1 (large)
torch0        [128, 256, 6,   10 ]  torch flame frame 0
torch1        [136, 256, 6,   10 ]  torch flame frame 1
firework0     [0,   278, 28,  28 ]  burst frame 0 (core)
firework1     [30,  278, 28,  28 ]  burst frame 1 (mid)
firework2     [60,  278, 28,  28 ]  burst frame 2 (full)
"""
import sys, os, math, random
random.seed(7)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save
from PIL import Image, ImageDraw

# ── Palette ────────────────────────────────────────────────────────────────────
GOLD   = (255, 210,  80, 255)
GOLD_H = (255, 240, 170, 255)
GOLD_D = (180, 130,  30, 255)
MG     = (255,  45, 180, 255)   # magenta
CY     = (  0, 229, 255, 255)   # cyan
BR     = [(132,108,168,255),(104,82,138,255),(78,58,108,255),(56,40,82,255)]
MOR    = ( 36,  22,  54, 255)   # mortar
HIL    = (186, 156, 224, 255)   # highlight

def lc(a, b, t):
    """Lerp two RGBA tuples."""
    return tuple(max(0, min(255, int(a[i] + (b[i]-a[i])*t))) for i in range(4))

# ── Sheet ──────────────────────────────────────────────────────────────────────
SW, SH = 220, 320
img = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
d   = ImageDraw.Draw(img)
px  = img.load()
frames = {}

def R(x, y, w, h, c):
    if w <= 0 or h <= 0: return
    # clamp to sheet bounds
    x2, y2 = min(x+w-1, SW-1), min(y+h-1, SH-1)
    if x > SW-1 or y > SH-1 or x2 < 0 or y2 < 0: return
    d.rectangle([max(x,0), max(y,0), x2, y2], fill=c)

def PP(x, y, c):
    if 0 <= x < SW and 0 <= y < SH:
        px[x, y] = c

# ── Castle-full drawing helpers (ported from reference_bit16.py) ────────────────

def bricks(x, y, w, h):
    bw, bh = 8, 5
    for by in range(y, y+h, bh):
        off = ((by // bh) % 2) * 4
        bx = x - off
        while bx < x + w:
            xx = max(x, bx); ww = min(x+w, bx+bw) - xx
            if ww > 0:
                hh = min(bh, y+h-by)
                tone = BR[(bx*7+by*3)//bw % 2]
                R(xx, by, ww, hh, tone)
                R(xx, by, ww, 1, lc(tone, HIL, 0.5))
                R(xx, by+hh-1, ww, 1, MOR)
                if (bx//bw + by//bh) % 9 == 0:
                    R(xx+1, by+1, 1, 2, BR[3])
            bx += bw
    R(x, y, 2, h, HIL)
    R(x+w-2, y, 2, h, BR[3])

def litwin(x, y):
    """Lit window 12×18."""
    R(x-1, y-1, 12, 18, BR[3])
    for i in range(16):
        R(x, y+i, 10, 1, lc((255,235,180,255), (255,150,60,255), i/16))
    R(x+4, y,   2, 16, BR[3])  # mullion vertical
    R(x,   y+7, 10,  2, BR[3])  # mullion horizontal

def slit(x, y):
    """Arrow slit 2×14 + crossbar."""
    R(x,   y,   2, 14, (16,10,26,255))
    R(x-2, y+4,  6,  2, (16,10,26,255))
    R(x,   y+2,  1,  9, GOLD)

def draw_banner(x, y, col):
    """Hanging banner 14×38."""
    for i in range(34):
        R(x, y+i, 14, 1, lc(lc(col, (255,255,255,255), 0.3), col, i/34))
    d.polygon([(x,y+34),(x+7,y+27),(x+14,y+34)], fill=lc(col,(0,0,0,255),0.2))
    R(x+4, y+8, 6, 6, GOLD)
    R(x+5, y+9, 4, 4, GOLD_D)

def pennant(x, y, col):
    """Small pennant triangle 20×18 on a 2px pole."""
    d.polygon([(x,y),(x,y+16),(x+18,y+8)], fill=col)
    R(x, y, 2, 18, (210,210,225,255))

def cannon_body(x, y):
    """Cannon barrel + base (no fire), ~21×13."""
    R(x,    y,   18,  8, (58, 58, 74, 255))
    R(x,    y,   18,  2, (110,110,128,255))
    R(x,    y+6, 18,  2, (28, 28, 38, 255))
    R(x+16, y+1,  5,  6, (16, 16, 24, 255))
    R(x-3,  y+6,  7,  5, (40, 40, 54, 255))
    R(x-2,  y+10, 3,  3, (24, 24, 34, 255))

# ── CASTLE_FULL [0,0,206,254] ──────────────────────────────────────────────────
# Reference coords (W=300, horizon=346):
#   kx=74 kw=152 kh=188 ky=158
#   left tower x=48, right tower x=222, both 30px wide, h=226
#   pennant tops at y=94 (ty-26=120-26)
# Sprite offset: OX=47, OY=93 → sprite(0,0)=ref(47,93)
OX, OY = 47, 93
CW, CH = 206, 254
kx, kw, kh = 74, 152, 188
hz = 346
ky_ref = hz - kh  # 158

def cs(rx, ry):
    return rx - OX, ry - OY

# Keep body
bricks(*cs(kx, ky_ref), kw, kh)

# Keep crenellations
for i in range(0, kw, 14):
    mx, my = cs(kx+i, ky_ref-9)
    R(mx, my, 9, 9, BR[1])
    R(mx, my, 9, 1, HIL)
    R(mx, my+9, 9, 2, BR[3])

# Lit windows (two rows)
for ry in range(ky_ref+28, hz-58, 42):
    for rx in range(kx+22, kx+kw-22, 42):
        litwin(*cs(rx, ry))

# Arrow slits near top
for rx in range(kx+40, kx+kw-26, 42):
    slit(*cs(rx, ky_ref+16))

# Four cannons (all unlit in the static sprite)
cannon_body(*cs(kx-6,      hz-118))
cannon_body(*cs(kx+kw-12,  hz-118))
cannon_body(*cs(kx-6,      hz-74))
cannon_body(*cs(kx+kw-12,  hz-74))

# Portcullis (gate)
gx, gy = cs(kx + kw//2 - 20, hz - 56)
R(gx, gy, 40, 56, (14, 8, 24, 255))
for i in range(0, 40, 5):
    R(gx+i, gy, 1, 56, (74, 58, 100, 255))
for j in range(0, 56, 6):
    R(gx, gy+j, 40, 1, (74, 58, 100, 255))
R(gx-3, gy-4, 46, 5, BR[2])
R(gx-3, gy-4, 46, 1, HIL)

# Banners
draw_banner(*cs(kx+14,      ky_ref+12), MG)
draw_banner(*cs(kx+kw-28,   ky_ref+12), CY)

# Towers (left=MG pennant, right=CY pennant)
for tx_ref, pen_col in ((kx-26, MG), (kx+kw-4, CY)):
    th     = kh + 38        # 226
    ty_ref = hz - th        # 120
    tx, ty = cs(tx_ref, ty_ref)
    bricks(tx, ty, 30, th)
    # Tower crenellations
    for i in range(0, 30, 9):
        R(tx+i, ty-9, 6, 9, BR[1])
        R(tx+i, ty-9, 6, 1, HIL)
    litwin(tx+9, ty+34)
    slit(tx+12, ty+72)
    pennant(tx+13, ty-26, pen_col)

# Torches (two, flanking keep entrance)
for txp_ref in (kx+8, kx+kw-14):
    txp, typ = cs(txp_ref, hz-62)
    R(txp,   typ,   3,  9, (120, 80, 50, 255))
    R(txp-1, typ-7, 5,  7, (255,140, 40, 255))
    R(txp,   typ-10,3,  4, GOLD)

# Ground strip
gnd_x, gnd_y = cs(kx-22, hz-3)
R(gnd_x, gnd_y, kw+44, 4, BR[3])

frames['castle_full'] = [0, 0, CW, CH]

# ── STONE [0,256, 10,6] ────────────────────────────────────────────────────────
sx0, sy0 = 0, 256
R(sx0,   sy0,   10, 6, BR[0])
R(sx0,   sy0,   10, 1, HIL)
R(sx0,   sy0+5, 10, 1, MOR)
R(sx0,   sy0,    1, 6, HIL)
R(sx0+9, sy0,    1, 6, BR[3])
frames['stone'] = [sx0, sy0, 10, 6]

# ── WORKER HELPER ──────────────────────────────────────────────────────────────
HAT  = (214,  62,  62, 255)
SKIN = (245, 212, 165, 255)
BODY = ( 58, 140, 182, 255)
SHLD = (120, 205, 238, 255)
ARM  = (150,  96,  60, 255)
TOOL = (120, 120, 132, 255)
LEGC = ( 56,  40,  82, 255)
BOOT = ( 28,  20,  41, 255)

def worker_base(x, y, face_off=0):
    """Common head/body shared by all worker frames."""
    R(x+1+face_off, y,    11, 4, HAT)
    R(x+2+face_off, y+4,   9, 5, SKIN)
    R(x+1,          y+9,  11, 2, SHLD)
    R(x+1,          y+11, 11, 5, BODY)

def worker_legs_stand(x, y):
    R(x+2, y+15, 4, 3, LEGC); R(x+8, y+15, 4, 3, LEGC)
    R(x+1, y+17, 5, 1, BOOT); R(x+7, y+17, 5, 1, BOOT)

# worker0: hammer UP [12,256, 14,18]
wx, wy = 12, 256
worker_base(wx, wy)
R(wx+11, wy+4, 2, 7, ARM)           # raised arm
R(wx+8,  wy,   6, 4, TOOL)          # hammer head above
R(wx+8,  wy,   6, 1, (180,180,190,255))
worker_legs_stand(wx, wy)
frames['worker0'] = [wx, wy, 14, 18]

# worker1: hammer DOWN [28,256, 14,18]
wx, wy = 28, 256
worker_base(wx, wy)
R(wx,    wy+6, 5, 4, TOOL)          # hammer head low left
R(wx,    wy+6, 5, 1, (180,180,190,255))
R(wx+2,  wy+10,2, 5, ARM)           # handle
worker_legs_stand(wx, wy)
frames['worker1'] = [wx, wy, 14, 18]

# worker_walk0: left foot forward [44,256, 14,18]
wx, wy = 44, 256
worker_base(wx, wy, face_off=0)
R(wx+11, wy+9, 2, 5, ARM)           # arm back
R(wx+0,  wy+15, 5, 3, LEGC)        # left leg forward
R(wx+8,  wy+14, 4, 4, LEGC)        # right leg back
R(wx+0,  wy+17, 6, 1, BOOT)
R(wx+8,  wy+17, 4, 1, BOOT)
frames['worker_walk0'] = [wx, wy, 14, 18]

# worker_walk1: right foot forward [60,256, 14,18]
wx, wy = 60, 256
worker_base(wx, wy, face_off=0)
R(wx+1,  wy+9, 2, 5, ARM)          # arm back (opposite)
R(wx+9,  wy+15, 5, 3, LEGC)        # right leg forward
R(wx+2,  wy+14, 4, 4, LEGC)        # left leg back
R(wx+9,  wy+17, 6, 1, BOOT)
R(wx+1,  wy+17, 5, 1, BOOT)
frames['worker_walk1'] = [wx, wy, 14, 18]

# ── FLAG [76,256, 22,14] ───────────────────────────────────────────────────────
fx0, fy0 = 76, 256
R(fx0, fy0, 2, 14, (210,210,225,255))          # pole
for fy in range(14):
    t  = 1.0 - abs(fy - 6.5) / 6.5
    fw = max(1, round(t * 18))
    col = GOLD if fy % 4 != 3 else GOLD_D
    R(fx0+2, fy0+fy, fw, 1, col)
R(fx0+7, fy0+4, 5, 5, MG)                      # emblem
R(fx0+8, fy0+5, 3, 3, (255,120,200,255))
frames['flag'] = [fx0, fy0, 22, 14]

# ── CANNON_FIRE0 [100,256, 12,10] (small flash) ───────────────────────────────
cfx, cfy = 100, 256
for rr in range(5, 0, -1):
    t   = rr / 5
    col = lc((255,255,220,255), (255,90,0,200), 1-t)
    d.ellipse([cfx+6-rr, cfy+5-rr, cfx+6+rr, cfy+5+rr], fill=col)
frames['cannon_fire0'] = [cfx, cfy, 12, 10]

# ── CANNON_FIRE1 [114,256, 12,10] (large flash with sparks) ───────────────────
cfx, cfy = 114, 256
for rr in range(6, 0, -1):
    t   = rr / 6
    col = lc((255,255,230,255), (255,60,0,160), 1-t)
    d.ellipse([cfx+6-rr, cfy+5-rr, cfx+6+rr, cfy+5+rr], fill=col)
for sx2, sy2 in [(cfx,cfy+1),(cfx+11,cfy+2),(cfx+1,cfy+8),(cfx+10,cfy+7)]:
    R(sx2, sy2, 2, 2, GOLD)
frames['cannon_fire1'] = [cfx, cfy, 12, 10]

# ── TORCH0 [128,256, 6,10] (narrow flame) ─────────────────────────────────────
tx0, ty0 = 128, 256
R(tx0+2, ty0+5, 2, 5, (120, 80, 50, 255))   # stick
R(tx0+1, ty0+1, 4, 4, (255,140, 40, 255))   # flame body
R(tx0+2, ty0,   2, 2, GOLD)                  # tip
R(tx0+1, ty0+3, 1, 3, (255, 80,  0, 200))
R(tx0+4, ty0+2, 1, 3, (255, 80,  0, 200))
frames['torch0'] = [tx0, ty0, 6, 10]

# ── TORCH1 [136,256, 6,10] (wide flame) ───────────────────────────────────────
tx0, ty0 = 136, 256
R(tx0+2, ty0+5, 2, 5, (120, 80, 50, 255))   # stick
R(tx0,   ty0+2, 6, 3, (255,130, 30, 255))   # wide flame
R(tx0+1, ty0+1, 4, 3, (255,180, 60, 255))
R(tx0+2, ty0,   2, 2, GOLD)
R(tx0,   ty0+3, 1, 2, (200, 80,  0, 200))
R(tx0+5, ty0+2, 1, 3, (200, 80,  0, 200))
frames['torch1'] = [tx0, ty0, 6, 10]

# ── FIREWORKS [28x28 each] ─────────────────────────────────────────────────────
FIRE_COLS = [
    (255, 221, 102, 255),   # yellow
    (255,  94, 148, 255),   # pink
    (  0, 245, 212, 255),   # cyan
    (255,  46, 136, 255),   # magenta
    (255, 255, 255, 255),   # white
]

def draw_firework(fx, fy, frame_idx):
    radius = [4, 9, 13][frame_idx]
    cx2, cy2 = fx + 14, fy + 14
    for dy in range(-radius, radius+1):
        for dx in range(-radius, radius+1):
            d2 = dx*dx + dy*dy
            if d2 <= radius*radius:
                t = math.sqrt(d2) / radius if radius else 0
                if   t < 0.25: col = FIRE_COLS[4]
                elif t < 0.55: col = FIRE_COLS[0]
                elif t < 0.75: col = FIRE_COLS[3]
                else:          col = FIRE_COLS[1]
                nx, ny = cx2+dx, cy2+dy
                if fx <= nx < fx+28 and fy <= ny < fy+28:
                    px[nx, ny] = col
    if frame_idx >= 1:
        num_rays = 8 + frame_idx*4
        for ri in range(num_rays):
            angle   = ri * 2 * math.pi / num_rays
            ray_len = radius + 3 + frame_idx*2
            for dist in range(radius-1, min(ray_len, 14)):
                rx2 = cx2 + round(dist * math.cos(angle))
                ry2 = cy2 + round(dist * math.sin(angle))
                if fx <= rx2 < fx+28 and fy <= ry2 < fy+28:
                    px[rx2, ry2] = FIRE_COLS[0]
    if frame_idx == 2:
        for ri in range(20):
            angle = ri * 2 * math.pi / 20 + 0.15
            for dist in range(10, 14):
                rx2 = cx2 + round(dist * math.cos(angle))
                ry2 = cy2 + round(dist * math.sin(angle))
                if fx <= rx2 < fx+28 and fy <= ry2 < fy+28:
                    px[rx2, ry2] = FIRE_COLS[2]

for fi, (ffx, ffy) in enumerate([(0,278),(30,278),(60,278)]):
    draw_firework(ffx, ffy, fi)
    frames[f'firework{fi}'] = [ffx, ffy, 28, 28]

# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'castle')
