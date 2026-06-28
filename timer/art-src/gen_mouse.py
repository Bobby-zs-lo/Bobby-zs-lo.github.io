"""Generate mouse.png + mouse.json sprite sheet for the Mouse Timer theme.
Run from timer/art-src/:  python gen_mouse.py
Outputs: timer/assets/mouse.png + mouse.json

Original high-detail pixel art (dithered "32-bit feel") for a Mouse-Timer style
grid-depletion countdown: a mouse eats a row/grid of apples (turning them into
cores) advancing toward a cheese-wedge goal, then sits content with a full belly.

Frames (HARD contract with js/themes/mouse.js)
----------------------------------------------
apple        full red apple (cell = remaining time)
apple_bite   apple with a bite taken (active cell, mouse mid-eat)
core         eaten apple core (persists)
cheese       cheese wedge (final goal cell)
crumb        4x4 yellow crumb particle
mouse_eat0   mouse eating, jaw up   (chew frame 0)
mouse_eat1   mouse eating, jaw down (chew frame 1)
mouse_cheese mouse nibbling the cheese (finale beat)
mouse_full   content mouse with big round belly (finale end)

Small (simplified) tier — used by the scene when cells get tiny (e.g. 60-min
grids) so apples/cores/cheese/mouse still read cleanly instead of muddy
downscales of the detailed sprites:
apple_s      12x13 simplified apple
core_s       12x13 simplified core
cheese_s     14x11 simplified cheese wedge
mouse_s      14x12 simplified mouse (facing left)
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import save

from PIL import Image, ImageDraw

# ── Sheet ───────────────────────────────────────────────────────────────────────
SW, SH = 140, 80
img = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
d   = ImageDraw.Draw(img)
frames = {}

def A(c):
    return c if len(c) == 4 else (c[0], c[1], c[2], 255)

def P(x, y, c):
    if 0 <= x < SW and 0 <= y < SH:
        img.putpixel((int(x), int(y)), A(c))

def R(x, y, w, h, c):
    if w <= 0 or h <= 0:
        return
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=A(c))

# ── Ordered-dither shading ──────────────────────────────────────────────────────
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

def shade(ramp, t, x, y):
    """Pick a tone from ramp (light->dark) for darkness t in 0..1 with 4x4 dither."""
    n = len(ramp)
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    f = t * (n - 1)
    base = int(f)
    frac = f - base
    thr = (BAYER[y % 4][x % 4] + 0.5) / 16.0
    idx = base + (1 if frac > thr else 0)
    if idx < 0: idx = 0
    if idx > n - 1: idx = n - 1
    return ramp[idx]

# ── Palettes ────────────────────────────────────────────────────────────────────
R_SPEC = (255, 158, 150)
RED    = [(255, 96, 86), (236, 55, 48), (200, 28, 28), (150, 18, 22), (96, 10, 18)]
STM_L, STM_D = (158, 104, 58), (96, 58, 30)
LF_L, LF_M, LF_D = (130, 214, 104), (70, 170, 70), (36, 110, 46)

FLESH = [(255, 247, 224), (248, 232, 186), (230, 205, 150), (200, 170, 112), (172, 138, 86)]
SEED  = (66, 42, 22)

CH      = [(255, 233, 120), (255, 205, 60), (245, 170, 30), (205, 128, 18), (168, 98, 12)]
CH_RIND = (250, 224, 150)
CH_HOLE = (196, 124, 14)
CH_HOLE_S = (158, 92, 8)

GREY  = [(228, 231, 236), (198, 202, 211), (162, 167, 178), (122, 128, 140), (88, 94, 106)]
M_BELLY = (236, 238, 242)
EAR_IN  = (242, 170, 188)
EAR_IN_D = (214, 132, 154)
NOSE    = (240, 122, 142)
EYE     = (38, 32, 36)
WHT     = (255, 255, 255)
TAIL    = [(186, 168, 168), (150, 132, 134), (112, 96, 100)]

# ═════════════════════════════════════════════════════════════════════════════════
#  APPLE  (22x26)  — origin (ox,oy)
# ═════════════════════════════════════════════════════════════════════════════════
def draw_apple(ox, oy, bite=False):
    cx, cy = ox + 11, oy + 16          # body centre
    rx, ry = 9.6, 9.2
    # bite carve circle (right side)
    bcx, bcy, bcr = ox + 17.5, oy + 14, 6.2
    for y in range(oy + 5, oy + 26):
        for x in range(ox + 1, ox + 21):
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            r2 = nx * nx + ny * ny
            if r2 > 1.0:
                continue
            # bite cut-out
            if bite:
                if (x - bcx) ** 2 + (y - bcy) ** 2 <= bcr * bcr:
                    continue
            dark = 0.5 + 0.40 * nx + 0.46 * ny
            # rim darkening near silhouette edge
            if r2 > 0.80:
                dark += 0.28
            col = shade(RED, dark, x, y)
            # specular highlight blob upper-left
            sx, sy = nx + 0.46, ny + 0.42
            if sx * sx + sy * sy < 0.10:
                col = R_SPEC
            if sx * sx + sy * sy < 0.025:
                col = (255, 210, 200)
            P(x, y, col)
    # top dimple shadow
    R(cx - 1, oy + 6, 2, 2, RED[3])
    # stem
    R(cx - 1, oy + 2, 2, 5, STM_D)
    R(cx - 1, oy + 2, 1, 5, STM_L)
    # leaf (upper-right of stem)
    for ly in range(4):
        lw = [3, 4, 4, 2][ly]
        R(cx + 1, oy + 3 + ly, lw, 1, LF_M)
    R(cx + 1, oy + 3, 1, 3, LF_L)
    R(cx + 3, oy + 5, 1, 2, LF_D)
    P(cx + 2, oy + 4, LF_L)
    # bite flesh rim + seeds
    if bite:
        for y in range(oy + 5, oy + 26):
            for x in range(ox + 1, ox + 21):
                if (x - bcx) ** 2 + (y - bcy) ** 2 <= bcr * bcr:
                    continue
                # a thin cream rim hugging the carve edge
                dd = math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2)
                nx = (x - cx) / rx; ny = (y - cy) / ry
                if nx * nx + ny * ny <= 1.0 and bcr < dd <= bcr + 1.7:
                    P(x, y, shade(FLESH, 0.35 + 0.4 * ((y - bcy) / bcr), x, y))
        R(int(bcx) - 1, int(bcy) - 1, 2, 2, SEED)
        P(int(bcx) - 2, int(bcy) + 2, SEED)

draw_apple(0, 0, bite=False)
frames['apple'] = [0, 0, 22, 26]
draw_apple(24, 0, bite=True)
frames['apple_bite'] = [24, 0, 22, 26]

# ═════════════════════════════════════════════════════════════════════════════════
#  CORE  (22x26)  — hourglass apple core
# ═════════════════════════════════════════════════════════════════════════════════
def draw_core(ox, oy):
    cx = ox + 11
    # stem
    R(cx - 1, oy + 2, 2, 5, STM_D)
    R(cx - 1, oy + 2, 1, 5, STM_L)
    # top red skin cap
    for y in range(oy + 7, oy + 11):
        hw = 7 - (y - (oy + 7))
        for x in range(cx - hw, cx + hw):
            dark = 0.45 + 0.4 * ((x - cx) / 8.0) + 0.2 * ((y - oy - 7) / 4.0)
            P(x, y, shade(RED, dark, x, y))
    # cream flesh hourglass body
    for y in range(oy + 10, oy + 21):
        t = (y - (oy + 10)) / 10.0
        hw = 6 - int(3.2 * math.sin(t * math.pi))   # narrow in the middle
        if hw < 2: hw = 2
        for x in range(cx - hw, cx + hw):
            dark = 0.30 + 0.42 * abs((x - cx) / max(1, hw)) + 0.18 * t
            P(x, y, shade(FLESH, dark, x, y))
    # seeds in the waist
    R(cx - 2, oy + 14, 2, 3, SEED)
    R(cx + 1, oy + 15, 2, 3, SEED)
    # bottom red skin cap
    for y in range(oy + 20, oy + 25):
        hw = (y - (oy + 19))
        if hw > 7: hw = 7
        for x in range(cx - hw, cx + hw):
            dark = 0.5 + 0.4 * ((x - cx) / 8.0) + 0.2 * ((oy + 25 - y) / 5.0)
            P(x, y, shade(RED, dark, x, y))
    # blossom end
    R(cx - 1, oy + 24, 2, 1, RED[4])

draw_core(48, 0)
frames['core'] = [48, 0, 22, 26]

# ═════════════════════════════════════════════════════════════════════════════════
#  CHEESE  (26x20)  — chunky wedge with holes
# ═════════════════════════════════════════════════════════════════════════════════
def draw_cheese(ox, oy):
    # Wedge front face: triangle, tip top-left, wide bottom-right.
    # top edge from (2,12) up to (23,4); bottom flat at y=17.
    tipx, tipy = ox + 2, oy + 12
    topx, topy = ox + 23, oy + 4
    boty = oy + 17
    for x in range(ox + 2, ox + 24):
        tt = (x - tipx) / float(topx - tipx)
        topedge = tipy + (topy - tipy) * tt
        topedge = int(round(topedge))
        for y in range(topedge, boty + 1):
            # darkness: right & bottom darker, near top edge lighter
            dark = 0.30 + 0.40 * ((x - tipx) / float(topx - tipx)) + 0.22 * ((y - topedge) / max(1, boty - topedge))
            P(x, y, shade(CH, dark, x, y))
    # bright cut rind along the top edge
    for x in range(ox + 2, ox + 24):
        tt = (x - tipx) / float(topx - tipx)
        topedge = int(round(tipy + (topy - tipy) * tt))
        P(x, topedge, CH_RIND)
        P(x, topedge + 1, CH[0])
    # bottom shadow lip
    R(ox + 2, boty, 22, 1, CH[3])
    R(ox + 3, oy + 18, 21, 1, CH[4])
    # holes
    for hx, hy, hr in [(ox + 11, oy + 11, 2), (ox + 17, oy + 9, 2), (ox + 19, oy + 14, 1)]:
        for yy in range(hy - hr, hy + hr + 1):
            for xx in range(hx - hr, hx + hr + 1):
                if (xx - hx) ** 2 + (yy - hy) ** 2 <= hr * hr:
                    P(xx, yy, CH_HOLE)
        P(hx + hr - 1, hy + hr - 1, CH_HOLE_S)
        P(hx - hr, hy - hr, CH[0])

draw_cheese(72, 0)
frames['cheese'] = [72, 0, 26, 20]

# ── CRUMB (4x4) ──────────────────────────────────────────────────────────────────
R(100, 1, 3, 3, (255, 214, 80))
P(100, 1, (255, 240, 170))
P(102, 3, (220, 150, 30))
frames['crumb'] = [100, 0, 4, 4]

# ═════════════════════════════════════════════════════════════════════════════════
#  MOUSE  — shared body builder, facing LEFT (snout at left)
# ═════════════════════════════════════════════════════════════════════════════════
def mouse_body(ox, oy, belly=0, jaw=0, happy=False, hold=None):
    """belly: 0 normal .. 2 stuffed; jaw: 0 up/1 down; happy: closed eyes;
       hold: None|'cheese'|'apple' small item at the mouth."""
    # ── Tail (from lower-right curling back) ──
    for i in range(10):
        tx = ox + 21 + int(2.4 * math.sin(i * 0.5))
        ty = oy + 18 - i
        P(tx, ty, TAIL[1])
        P(tx + 1, ty, TAIL[2])
    R(ox + 20, oy + 18, 3, 2, TAIL[1])

    # ── Body blob (right) ──
    bcx, bcy = ox + 14, oy + 15
    brx = 8.0 + belly * 1.2
    bry = 6.5 + belly * 1.6
    for y in range(oy + 6, oy + 24):
        for x in range(ox + 5, ox + 24):
            nx = (x - bcx) / brx; ny = (y - bcy) / bry
            r2 = nx * nx + ny * ny
            if r2 > 1.0:
                continue
            dark = 0.42 + 0.40 * nx + 0.40 * ny
            if r2 > 0.82:
                dark += 0.25
            col = shade(GREY, dark, x, y)
            P(x, y, col)
    # belly highlight patch (lighter underside-left)
    for y in range(oy + 13, oy + 23):
        for x in range(ox + 8, ox + 18):
            nx = (x - (bcx - 2)) / (brx * 0.7); ny = (y - (bcy + 3)) / (bry * 0.75)
            if nx * nx + ny * ny <= 1.0:
                P(x, y, M_BELLY)

    # ── Head (left), pointed snout ──
    hcx, hcy = ox + 8, oy + 13
    for y in range(oy + 7, oy + 21):
        for x in range(ox + 1, ox + 14):
            nx = (x - hcx) / 6.2; ny = (y - hcy) / 6.0
            r2 = nx * nx + ny * ny
            # taper the snout toward the left
            if x < hcx:
                r2 = ((x - hcx) / (6.2 - (hcx - x) * 0.28)) ** 2 + ny * ny
            if r2 > 1.0:
                continue
            dark = 0.40 + 0.42 * nx + 0.36 * ny
            if r2 > 0.84:
                dark += 0.22
            P(x, y, shade(GREY, dark, x, y))
    # snout tip + nose
    R(ox + 1, oy + 13, 2, 3, GREY[2])
    P(ox + 0, oy + 14, NOSE)
    P(ox + 1, oy + 14, NOSE)
    P(ox + 1, oy + 15, (210, 96, 116))

    # ── Ear (big round, upper) ──
    ecx, ecy, er = ox + 11, oy + 6, 5
    for y in range(ecy - er, ecy + er + 1):
        for x in range(ecx - er, ecx + er + 1):
            dd = (x - ecx) ** 2 + (y - ecy) ** 2
            if dd <= er * er:
                if dd <= (er - 2) ** 2:
                    P(x, y, EAR_IN if (x + y) % 5 else EAR_IN_D)
                else:
                    dark = 0.42 + 0.4 * ((x - ecx) / er) + 0.3 * ((y - ecy) / er)
                    P(x, y, shade(GREY, dark, x, y))

    # ── Eye ──
    if happy:
        # closed happy arc ^
        P(ox + 6, oy + 11, EYE); P(ox + 7, oy + 10, EYE); P(ox + 8, oy + 11, EYE)
    else:
        R(ox + 6, oy + 10, 2, 3, EYE)
        P(ox + 6, oy + 10, WHT)
    # whiskers
    P(ox + 0, oy + 12, GREY[4]); P(ox + 0, oy + 17, GREY[4])

    # ── Front paws (near mouth, holding) ──
    R(ox + 3, oy + 17, 3, 2, GREY[1])
    R(ox + 5, oy + 18, 3, 2, GREY[1])

    # ── Mouth / held item ──
    my = oy + 16 + (1 if jaw else 0)
    if hold == 'cheese':
        # little cheese triangle at mouth
        for k in range(4):
            R(ox + 2, my - 1 + k, 5 - k, 1, CH[1])
        P(ox + 2, my - 1, CH[0]); P(ox + 4, my + 1, CH[3])
    elif hold == 'apple':
        R(ox + 2, my - 1, 4, 4, RED[1])
        P(ox + 2, my - 1, R_SPEC); P(ox + 5, my + 2, RED[3])
    else:
        # plain chewing mouth
        R(ox + 2, my, 3, 1, GREY[4])
    # happy full mouth: tiny smile
    if happy:
        R(ox + 3, oy + 17, 4, 1, (120, 84, 92))

    # paws resting on belly when stuffed
    if belly >= 2:
        R(ox + 9, oy + 18, 3, 2, GREY[1])
        R(ox + 12, oy + 19, 3, 2, GREY[1])

# mouse_eat0 (jaw up)
mouse_body(0, 28, belly=0, jaw=0, hold='apple')
frames['mouse_eat0'] = [0, 28, 26, 24]
# mouse_eat1 (jaw down)
mouse_body(28, 28, belly=0, jaw=1, hold='apple')
frames['mouse_eat1'] = [28, 28, 26, 24]
# mouse_cheese (nibbling cheese; frame 30 wide)
mouse_body(56, 28, belly=1, jaw=1, hold='cheese')
frames['mouse_cheese'] = [56, 28, 30, 26]
# mouse_full (content, big belly, happy)
mouse_body(90, 28, belly=2, jaw=0, happy=True, hold=None)
frames['mouse_full'] = [90, 28, 30, 24]

# ═════════════════════════════════════════════════════════════════════════════════
#  SMALL (simplified) TIER — clean tiny sprites for dense grids (e.g. 60 min)
#  Placed on a fresh row at y=58 so they never overlap the detailed sprites.
# ═════════════════════════════════════════════════════════════════════════════════
def draw_apple_s(ox, oy):
    cx, cy = ox + 6, oy + 7
    rx, ry = 5.3, 5.1
    for y in range(oy, oy + 13):
        for x in range(ox, ox + 12):
            nx = (x - cx) / rx; ny = (y - cy) / ry
            r2 = nx * nx + ny * ny
            if r2 > 1.0:
                continue
            dark = 0.50 + 0.42 * nx + 0.42 * ny
            if r2 > 0.70:
                dark += 0.18
            col = shade(RED, dark, x, y)
            sx, sy = nx + 0.45, ny + 0.40
            if sx * sx + sy * sy < 0.12:
                col = R_SPEC
            P(x, y, col)
    P(cx, oy + 2, RED[3])              # top dimple
    R(cx, oy + 1, 1, 3, STM_D)         # stem
    P(cx, oy + 1, STM_L)
    R(cx + 1, oy + 2, 2, 1, LF_M)      # leaf
    P(cx + 2, oy + 1, LF_L)

def draw_core_s(ox, oy):
    cx = ox + 6
    R(cx, oy + 1, 1, 2, STM_D)         # stem
    for y in range(oy + 3, oy + 5):    # top red skin cap
        hw = 4 - (y - (oy + 3))
        for x in range(cx - hw, cx + hw + 1):
            P(x, y, shade(RED, 0.50 + 0.30 * ((x - cx) / 4.0), x, y))
    for y in range(oy + 4, oy + 10):   # cream hourglass waist
        t = (y - (oy + 4)) / 6.0
        hw = 4 - int(2.0 * math.sin(t * math.pi))
        if hw < 1:
            hw = 1
        for x in range(cx - hw, cx + hw + 1):
            P(x, y, shade(FLESH, 0.32 + 0.40 * abs((x - cx) / max(1, hw)), x, y))
    P(cx - 1, oy + 6, SEED)            # seeds
    P(cx + 1, oy + 7, SEED)
    for y in range(oy + 9, oy + 12):   # bottom red skin cap
        hw = (y - (oy + 8))
        if hw > 4:
            hw = 4
        for x in range(cx - hw, cx + hw + 1):
            P(x, y, shade(RED, 0.50 + 0.30 * ((x - cx) / 4.0), x, y))

def draw_cheese_s(ox, oy):
    tipx, tipy = ox + 1, oy + 7
    topx, topy = ox + 12, oy + 2
    boty = oy + 9
    for x in range(ox + 1, ox + 13):
        tt = (x - tipx) / float(topx - tipx)
        topedge = int(round(tipy + (topy - tipy) * tt))
        for y in range(topedge, boty + 1):
            dark = 0.30 + 0.40 * ((x - tipx) / float(topx - tipx)) + 0.22 * ((y - topedge) / max(1, boty - topedge))
            P(x, y, shade(CH, dark, x, y))
        P(x, topedge, CH_RIND)
    R(ox + 1, boty, 12, 1, CH[3])      # bottom lip
    for hx, hy in [(ox + 6, oy + 6), (ox + 9, oy + 5)]:   # holes
        P(hx, hy, CH_HOLE); P(hx + 1, hy, CH_HOLE)
        P(hx, hy + 1, CH_HOLE_S)

def draw_mouse_s(ox, oy):
    # facing LEFT (snout left), mirrors the detailed mouse
    for i in range(5):                 # tail curling back-right
        P(ox + 11 + (i % 2), oy + 9 - i, TAIL[1])
    bcx, bcy = ox + 8, oy + 7          # body blob (right)
    for y in range(oy + 2, oy + 12):
        for x in range(ox + 3, ox + 13):
            nx = (x - bcx) / 4.5; ny = (y - bcy) / 4.2
            if nx * nx + ny * ny > 1.0:
                continue
            P(x, y, shade(GREY, 0.45 + 0.40 * nx + 0.40 * ny, x, y))
    for y in range(oy + 7, oy + 11):   # belly highlight
        for x in range(ox + 5, ox + 10):
            nx = (x - (bcx - 1)) / 3.0; ny = (y - (bcy + 2)) / 2.6
            if nx * nx + ny * ny <= 1.0:
                P(x, y, M_BELLY)
    hcx, hcy = ox + 4, oy + 7          # head (left), tapered snout
    for y in range(oy + 4, oy + 12):
        for x in range(ox, ox + 8):
            nx = (x - hcx) / 3.4; ny = (y - hcy) / 3.2
            if nx * nx + ny * ny > 1.0:
                continue
            P(x, y, shade(GREY, 0.45 + 0.42 * nx + 0.36 * ny, x, y))
    P(ox, oy + 8, NOSE)                # nose tip
    ecx, ecy, er = ox + 6, oy + 3, 2   # ear
    for y in range(ecy - er, ecy + er + 1):
        for x in range(ecx - er, ecx + er + 1):
            dd = (x - ecx) ** 2 + (y - ecy) ** 2
            if dd <= er * er:
                P(x, y, EAR_IN if dd <= 1 else GREY[2])
    P(ox + 3, oy + 7, EYE)             # eye

draw_apple_s(0, 58)
frames['apple_s'] = [0, 58, 12, 13]
draw_core_s(14, 58)
frames['core_s'] = [14, 58, 12, 13]
draw_cheese_s(28, 58)
frames['cheese_s'] = [28, 58, 14, 11]
draw_mouse_s(44, 58)
frames['mouse_s'] = [44, 58, 14, 12]

# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'mouse')
print('Frames:')
for n, (x, y, w, h) in sorted(frames.items()):
    print(f'  {n:13s} [{x:3d},{y:3d},{w:2d},{h:2d}]')
