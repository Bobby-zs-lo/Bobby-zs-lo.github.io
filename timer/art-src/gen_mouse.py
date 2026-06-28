"""Generate mouse.png + mouse.json sprite sheet for the Mouse Timer theme.
Run from timer/art-src/:  python gen_mouse.py
Outputs: timer/assets/mouse.png + mouse.json

MIXED FIDELITY (intentional): the apples / cores / cheese / crumb are 16-bit
dithered PIXEL art. The MOUSE is a smooth, high-res cartoon character drawn by
SUPERSAMPLING (rendered ~4x with filled curves, downsampled with LANCZOS) so its
edges are anti-aliased — NOT chunky pixels. The scene draws the mouse with
imageSmoothing ENABLED and everything else with nearest-neighbor.

Pixel frames (HARD contract with js/themes/mouse.js)
----------------------------------------------------
apple        full red apple (cell = remaining time)
apple_bite   apple with a bite taken (active cell, mouse mid-eat)
core         eaten apple core (persists)
cheese       cheese wedge (final goal cell)
crumb        4x4 yellow crumb particle

HD mouse frames (128x112 box each, smooth/anti-aliased, facing LEFT)
--------------------------------------------------------------------
mouse_eat0   chew cycle a: neutral, mouth closed, holding apple
mouse_eat1   chew cycle b: body squash + mouth open + cheek puff
mouse_eat2   chew cycle c: neutral (mouth closed)
mouse_eat3   chew cycle d: squash + mouth open + crumb fleck
mouse_hop0   hop: crouch  (squashed, gathering)
mouse_hop1   hop: airborne (stretched, legs tucked)
mouse_hop2   hop: land    (squashed, absorbing)
mouse_cheese finale beat: nibbling a cheese chunk, medium belly
mouse_full   finale end : big round belly, happy closed eyes, sparkle

Small (simplified) PIXEL tier — used by the scene when cells get tiny (e.g.
60-min grids) so apples/cores/cheese still read cleanly instead of muddy
downscales of the detailed sprites (the mouse always uses the smooth HD frames):
apple_s      12x13 simplified apple
core_s       12x13 simplified core
cheese_s     14x11 simplified cheese wedge
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import save

from PIL import Image, ImageDraw

# ── Sheet ───────────────────────────────────────────────────────────────────────
# Top-left region (y<=72) holds the 16-bit PIXEL sprites (apples/cores/cheese/
# crumb + small tier). The HD ANTI-ALIASED mouse frames live in a separate region
# lower down (y>=96), supersampled+downsampled so their edges stay smooth.
SW, SH = 540, 470
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
#  HD MOUSE  — smooth supersampled cartoon mouse (facing LEFT)
#  Rendered at 4x with filled curves, then LANCZOS-downsampled so edges are
#  ANTI-ALIASED (no chunky pixels). Original cute grey cartoon design.
# ═════════════════════════════════════════════════════════════════════════════════
# Supersample factor: draw big, then LANCZOS-downsample for smooth AA edges.
SSAMP = 4
FW, FH = 128, 112          # every HD mouse frame is this fixed box (stable centring)

# ── Cartoon mouse palette (opaque RGBA) ───────────────────────────────────────
M_OUT   = (94, 86, 108, 255)     # soft dark outline (not harsh black)
M_BASE  = (179, 183, 198, 255)   # body grey
M_SHADE = (147, 151, 170, 255)   # underside shadow grey
M_LIGHT = (227, 230, 239, 255)   # belly / highlight
M_PAW   = (200, 203, 216, 255)   # paws / feet
EARP    = (246, 184, 202, 255)   # ear inner pink
EARP_D  = (228, 153, 179, 255)   # ear inner pink shadow
NOSEP   = (241, 128, 152, 255)   # nose pink
NOSEP_H = (255, 180, 198, 255)   # nose highlight
M_EYE   = (47, 41, 52, 255)      # friendly dark eye
TAILP   = (215, 171, 183, 255)   # tail pink-grey
WHISK   = (206, 208, 220, 215)   # whiskers (slightly translucent)
MOUTH_D = (122, 64, 80, 255)     # open mouth
TONGUE  = (229, 122, 138, 255)
SMILE   = (120, 74, 86, 255)
# held snack colours (smooth — part of the character, distinct from grid apples)
AP_R, AP_RD, AP_RH = (227, 64, 64, 255), (189, 38, 46, 255), (255, 152, 142, 255)
AP_STM = (122, 84, 52, 255)
CHS, CHS_D, CHS_H = (255, 207, 86, 255), (233, 169, 42, 255), (206, 138, 22, 255)
SPK = (255, 247, 212, 255)       # finale sparkle


class HD:
    """A supersampled drawing surface; .out() returns the AA-downsampled frame."""
    def __init__(self, w, h):
        self.w, self.h, self.k = w, h, SSAMP
        self.img = Image.new('RGBA', (w * SSAMP, h * SSAMP), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def ell(self, cx, cy, rx, ry, c):
        k = self.k
        self.d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=c)

    def cir(self, cx, cy, r, c):
        self.ell(cx, cy, r, r, c)

    def poly(self, pts, c):
        k = self.k
        self.d.polygon([(x * k, y * k) for x, y in pts], fill=c)

    def line(self, pts, c, w):
        k = self.k
        self.d.line([(x * k, y * k) for x, y in pts], fill=c, width=max(1, int(w * k)), joint='curve')

    def out(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def hd_tail(hd, p0, p1, p2, w0, w1, col, outline):
    """Smooth tapering tail along a quadratic Bezier (outline pass, then fill)."""
    N = 26
    samp = []
    for i in range(N + 1):
        t = i / N
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        w = w0 + (w1 - w0) * t
        samp.append((x, y, w))
    for x, y, w in samp:
        hd.cir(x, y, w / 2 + 1.5, outline)
    for x, y, w in samp:
        hd.cir(x, y, max(0.6, w / 2), col)


def draw_mouse(hd, belly=0, mouth='closed', eyes='open', hold='apple',
               squash=0.0, sparkle=False, crumb=False, legs='sit'):
    """Draw the cartoon mouse (facing LEFT) into an HD surface.
       belly 0..2 (round-belly finale); mouth closed|open|happy;
       squash >0 squashes (crouch/chew bob), <0 stretches (mid-hop);
       legs sit|crouch|tuck|rest; hold None|'apple'|'cheese'."""
    syf = 1.0 - 0.15 * squash          # vertical squash/stretch
    sxf = 1.0 + 0.12 * squash
    base = 96.0
    bg = belly

    bry = 31 * syf * (1 + 0.09 * bg)
    brx = 31 * sxf * (1 + 0.07 * bg)
    BX = 82.0
    BY = base + 4 - bry                # body centre (bottom rests near `base`)
    hr = 25 * (1 + 0.015 * bg)
    HX = 44.0
    HY = BY - 6                        # head centre
    MX, MY, mr = 26.0, HY + 8, 13.0    # muzzle

    # ── Tail (behind body) ──
    hd_tail(hd, (BX + 22, BY + 4), (126, BY - 10), (112, HY - 26), 9.0, 2.2, TAILP, M_OUT)

    # ── Back ear ──
    bex, bey, ber = 60.0, HY - 22, 16.0
    hd.cir(bex, bey, ber + 1.6, M_OUT)
    hd.cir(bex, bey, ber, M_BASE)
    hd.cir(bex + 1, bey + 1, ber - 5, EARP)
    hd.cir(bex + 2, bey + 3, ber - 8, EARP_D)

    # ── Body + head + muzzle: outline pass, then fill pass (no inner seams) ──
    hd.ell(BX, BY, brx + 1.7, bry + 1.7, M_OUT)
    hd.cir(HX, HY, hr + 1.7, M_OUT)
    hd.cir(MX, MY, mr + 1.7, M_OUT)
    hd.ell(BX, BY, brx, bry, M_BASE)
    hd.cir(HX, HY, hr, M_BASE)
    hd.cir(MX, MY, mr, M_BASE)

    # soft 3-tone shading (opaque ellipses kept inside the silhouette)
    hd.ell(58, BY + 10 * syf, 22 * sxf * (1 + 0.06 * bg), 16 * syf * (1 + 0.08 * bg), M_LIGHT)
    hd.ell(97, BY + 6, 12, 9, M_SHADE)
    hd.cir(HX - 5, HY - 8, 7.5, M_LIGHT)

    # ── Feet ──
    if legs in ('sit', 'crouch', 'rest'):
        fy = base + (3 if legs == 'crouch' else 1)
        for fx in (70, 46):
            hd.ell(fx, fy, 9, 5.2, M_OUT)
            hd.ell(fx, fy - 0.4, 7.4, 4.0, M_PAW)
    elif legs == 'tuck':
        for fx in (62, 50):
            hd.ell(fx, BY + 19, 6, 4, M_OUT)
            hd.ell(fx, BY + 18.6, 4.6, 2.9, M_PAW)

    # ── Front ear (over the head) ──
    fex, fey, fer = 36.0, HY - 25, 19.0
    hd.cir(fex, fey, fer + 1.6, M_OUT)
    hd.cir(fex, fey, fer, M_BASE)
    hd.cir(fex - 1, fey + 1, fer - 5, EARP)
    hd.cir(fex - 1, fey + 3, fer - 9, EARP_D)

    # ── Nose ──
    hd.cir(15.5, MY + 1, 6.2 + 1.5, M_OUT)
    hd.cir(15.5, MY + 1, 6.2, NOSEP)
    hd.cir(13.5, MY - 1, 2.2, NOSEP_H)

    # ── Whiskers ──
    for wy in (-3.0, 2.0, 7.0):
        hd.line([(17, MY + wy * 0.55), (2, MY + wy * 1.25)], WHISK, 1.2)

    # ── Eye ──
    if eyes == 'happy':
        hd.line([(31, HY - 2), (36, HY - 6), (41, HY - 2)], M_EYE, 2.4)
    else:
        hd.cir(37, HY - 2, 5.4 + 1.1, M_OUT)
        hd.cir(37, HY - 2, 5.0, M_EYE)
        hd.cir(35.2, HY - 3.6, 1.9, (255, 255, 255, 255))

    # ── Mouth ──
    if mouth == 'open':
        hd.cir(30, MY + 4, 6.5, M_BASE)                 # cheek puff
        hd.ell(24, MY + 11, 5.2, 4.2, MOUTH_D)
        hd.ell(24, MY + 12.5, 3.2, 2.0, TONGUE)
    elif mouth == 'happy':
        hd.line([(17, MY + 8), (24, MY + 12), (31, MY + 8)], SMILE, 2.2)
    else:
        hd.line([(20, MY + 10), (28, MY + 10)], SMILE, 1.8)

    # ── Arms + held snack (front-most) ──
    if hold == 'apple':
        ax, ay, ar = 26.0, BY + 15, 10.0
        hd.cir(ax, ay, ar + 1.5, M_OUT)
        hd.cir(ax, ay, ar, AP_R)
        hd.ell(ax + 3.5, ay + 3.5, ar * 0.55, ar * 0.55, AP_RD)
        hd.cir(ax - 4, ay - 4, 3.4, AP_RH)
        hd.line([(ax, ay - ar + 1), (ax + 1.5, ay - ar - 3)], AP_STM, 2.0)
        for px, py in ((ax - 7, ay + 2), (ax + 7, ay + 4)):
            hd.ell(px, py, 5.4, 4.0, M_OUT)
            hd.ell(px, py - 0.4, 4.1, 3.0, M_PAW)
    elif hold == 'cheese':
        op = [(7, MY + 10), (31, MY + 1), (31, MY + 19)]
        pts = [(9, MY + 10), (29, MY + 3), (29, MY + 17)]
        hd.poly(op, M_OUT)
        hd.poly(pts, CHS)
        hd.poly([(20, MY + 7), (28, MY + 5), (28, MY + 11)], CHS_D)
        hd.cir(22, MY + 11, 1.6, CHS_H)
        hd.cir(25, MY + 8, 1.3, CHS_H)
        for px, py in ((12, MY + 17), (28, MY + 17)):
            hd.ell(px, py, 5.2, 3.8, M_OUT)
            hd.ell(px, py - 0.4, 3.9, 2.9, M_PAW)

    # paws resting on the round belly (full finale)
    if legs == 'rest':
        for px in (44, 58):
            hd.ell(px, BY + 15, 6.0, 4.4, M_OUT)
            hd.ell(px, BY + 14.6, 4.6, 3.2, M_PAW)

    # ── Crumb flecks (mid-chew) ──
    if crumb:
        for cxx, cyy, rr in [(11, MY + 17, 1.9), (7, MY + 11, 1.4), (14, MY + 21, 1.6)]:
            hd.cir(cxx, cyy, rr, (236, 196, 120, 255))

    # ── Sparkle / "burp" twinkle (finale) ──
    if sparkle:
        for spx, spy, sr in [(92, HY - 30, 5.0), (73, HY - 35, 3.0)]:
            hd.poly([(spx - sr, spy), (spx, spy - sr), (spx + sr, spy), (spx, spy + sr)], SPK)
            hd.poly([(spx - sr * 0.45, spy), (spx, spy - sr * 1.7),
                     (spx + sr * 0.45, spy), (spx, spy + sr * 1.7)], SPK)


def render_mouse(x, y, name, **pose):
    hd = HD(FW, FH)
    draw_mouse(hd, **pose)
    img.alpha_composite(hd.out(), (x, y))
    frames[name] = [x, y, FW, FH]

# Eat / chew cycle (body squash bob + jaw/cheek chew while holding an apple)
render_mouse(  0, 96, 'mouse_eat0', belly=0, mouth='closed', hold='apple', squash=0.0)
render_mouse(132, 96, 'mouse_eat1', belly=0, mouth='open',   hold='apple', squash=0.55)
render_mouse(264, 96, 'mouse_eat2', belly=0, mouth='closed', hold='apple', squash=0.12)
render_mouse(396, 96, 'mouse_eat3', belly=0, mouth='open',   hold='apple', squash=0.55, crumb=True)
# Hop / move (crouch -> airborne -> land) — used to skip to the next apple
render_mouse(  0, 216, 'mouse_hop0', belly=0, mouth='closed', hold=None, squash=0.95, legs='crouch')
render_mouse(132, 216, 'mouse_hop1', belly=0, mouth='open',   hold=None, squash=-0.85, legs='tuck')
render_mouse(264, 216, 'mouse_hop2', belly=0, mouth='closed', hold=None, squash=0.70, legs='crouch')
# Finale: nibbling cheese, then content big-belly with a sparkle
render_mouse(  0, 336, 'mouse_cheese', belly=1, mouth='open',  hold='cheese', squash=0.20)
render_mouse(132, 336, 'mouse_full',   belly=2, mouth='happy', eyes='happy', hold=None,
             squash=0.30, sparkle=True, legs='rest')

# ═════════════════════════════════════════════════════════════════════════════════
#  SMALL (simplified) TIER — clean tiny sprites for dense grids (e.g. 60 min)
#  Placed on a fresh row at y=58 so they never overlap the detailed sprites.
# ═════════════════════════════════════════════════════════════════════════════════
def draw_apple_s(ox, oy):
    # FLAT shading (no dither) so it stays clean when the scene up-scales it.
    cx, cy = ox + 6, oy + 7
    rx, ry = 5.3, 5.1
    for y in range(oy, oy + 13):
        for x in range(ox, ox + 12):
            nx = (x - cx) / rx; ny = (y - cy) / ry
            r2 = nx * nx + ny * ny
            if r2 > 1.0:
                continue
            col = RED[1]                       # solid body
            if nx + ny > 0.55:
                col = RED[2]                    # shadow side (lower-right)
            if nx + ny > 1.10:
                col = RED[3]
            if r2 > 0.86:
                col = RED[3]                    # crisp silhouette rim
            sx, sy = nx + 0.42, ny + 0.40
            if sx * sx + sy * sy < 0.13:
                col = R_SPEC                    # single highlight blob (upper-left)
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
            P(x, y, RED[2] if x > cx else RED[1])
    for y in range(oy + 4, oy + 10):   # cream hourglass waist
        t = (y - (oy + 4)) / 6.0
        hw = 4 - int(2.0 * math.sin(t * math.pi))
        if hw < 1:
            hw = 1
        for x in range(cx - hw, cx + hw + 1):
            P(x, y, FLESH[3] if abs(x - cx) >= hw - 1 else FLESH[1])
    P(cx - 1, oy + 6, SEED)            # seeds
    P(cx + 1, oy + 7, SEED)
    for y in range(oy + 9, oy + 12):   # bottom red skin cap
        hw = (y - (oy + 8))
        if hw > 4:
            hw = 4
        for x in range(cx - hw, cx + hw + 1):
            P(x, y, RED[2] if x > cx else RED[1])

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

draw_apple_s(0, 58)
frames['apple_s'] = [0, 58, 12, 13]
draw_core_s(14, 58)
frames['core_s'] = [14, 58, 12, 13]
draw_cheese_s(28, 58)
frames['cheese_s'] = [28, 58, 14, 11]
# (no mouse_s tier: the smooth HD mouse downscales cleanly at any cell size.)

# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'mouse')
print('Frames:')
for n, (x, y, w, h) in sorted(frames.items()):
    print(f'  {n:13s} [{x:3d},{y:3d},{w:2d},{h:2d}]')
