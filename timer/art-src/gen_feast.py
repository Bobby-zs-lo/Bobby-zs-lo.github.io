"""Generate feeding.png + feeding.json sprite sheet for the Poke Feast theme.
Run from timer/art-src/:  python gen_feast.py
Outputs: timer/assets/feeding.png + feeding.json

QUALITY CENTERPIECE: Pikachu is drawn as a SMOOTH, high-res cartoon (NOT chunky
16-bit pixels) by SUPERSAMPLING (rendered 4x with filled curves/ellipses, then
LANCZOS-downsampled so edges are anti-aliased). The goal is instant "that's
Pikachu" recognition: long black-tipped ears, big round black eyes, prominent red
cheeks, the iconic lightning-bolt tail, pear body, cream belly.

Frame contract (HARD — must match js/themes/feast scene):
--------------------------------------------------------
Sitting (facing LEFT toward the plate), 150x140, for belly stage s in 0..3:
  pika_s{s}_idle0  eyes open
  pika_s{s}_idle1  blink
  pika_s{s}_lean   leaning/reaching left toward the plate
  pika_s{s}_chew0  chew cycle a
  pika_s{s}_chew1  chew cycle b
  pika_s{s}_chew2  chew cycle c
Finale (STANDING, front-ish, belly stage 3 baked), 150x170:
  pika_stand, pika_charge0, pika_charge1, pika_thunder, pika_happy
Food (~44x40), i in 0..13, normal + half-eaten:
  food_{i}, food_{i}_bit
Props:
  plate (~320x110), crumb0, crumb1
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import save
from PIL import Image, ImageDraw

random.seed(7)

# ── Pikachu palette (exact hexes from the brief) ──────────────────────────────
BODY   = (255, 222, 0, 255)     # #FFDE00 body yellow
BODY_S = (232, 185, 62, 255)    # #E8B93E shadow
BODY_H = (255, 243, 166, 255)   # #FFF3A6 highlight
CHEEK  = (255, 59, 48, 255)     # #FF3B30 red cheeks
CHEEK_H = (255, 138, 128, 255)  # cheek highlight
BLK    = (26, 26, 26, 255)      # #1A1A1A ears/eyes
EARIN  = (154, 91, 46, 255)     # #9A5B2E inner ear
TAILC  = (138, 90, 43, 255)     # #8A5A2B tail + back stripes
TAIL_U = (201, 138, 61, 255)    # #C98A3D tail underside
BELLY  = (255, 240, 194, 255)   # #FFF0C2 belly cream
MOUTH  = (122, 48, 32, 255)     # #7A3020 mouth interior
TONGUE = (232, 110, 110, 255)
WHT    = (255, 255, 255, 255)
OUTL   = (176, 128, 34, 255)    # darkened body tone outline (soft, not black)
SPARK  = (255, 251, 214, 255)   # white/cream spark dots
BOLT   = (255, 236, 90, 255)    # electric bolt

SSAMP = 4


class HD:
    """Supersampled drawing surface; .out() -> LANCZOS-downsampled AA frame."""
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

    def rrect(self, x0, y0, x1, y1, r, c):
        k = self.k
        self.d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=r * k, fill=c)

    def erase_ell(self, cx, cy, rx, ry):
        k = self.k
        self.d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=(0, 0, 0, 0))

    def arc_pts(self, cx, cy, rx, ry, a0, a1, n=16):
        pts = []
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
        return pts

    def out(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


# ── Lightning-bolt tail (ribbon: zigzag centerline widening toward flat top) ──
def _ribbon(center, widths):
    """Build a closed boundary polygon for a variable-width ribbon."""
    left, right = [], []
    n = len(center)
    for i in range(n):
        px, py = center[i]
        if i == 0:
            dx, dy = center[1][0] - px, center[1][1] - py
        elif i == n - 1:
            dx, dy = px - center[i - 1][0], py - center[i - 1][1]
        else:
            dx, dy = center[i + 1][0] - center[i - 1][0], center[i + 1][1] - center[i - 1][1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        w = widths[i] / 2
        left.append((px + nx * w, py + ny * w))
        right.append((px - nx * w, py - ny * w))
    return left + right[::-1]


def draw_tail(hd, bx, by, scale=1.0):
    """Iconic Pikachu lightning-bolt tail: yellow zigzag with brown base,
    flat wide top, rising up-and-right behind the body."""
    def S(x, y):
        return (bx + x * scale, by + y * scale)
    # sharp zigzag centerline with pronounced horizontal swings + widening
    center = [S(0, 0), S(13, -14), S(-6, -26), S(16, -40), S(0, -52), S(20, -58)]
    widths = [w * scale for w in (8, 11, 14, 18, 22, 26)]
    outline = _ribbon(center, [w + 3 * scale for w in widths])
    body = _ribbon(center, widths)
    hd.poly(outline, OUTL)
    hd.poly(body, BODY)                         # yellow bolt (upper 2/3 look)
    # brown base: lower two centerline segments stay brown (classic tail base)
    base_c = center[:3]
    base_w = widths[:3]
    hd.poly(_ribbon(base_c, [w + 3 * scale for w in base_w]), OUTL)
    hd.poly(_ribbon(base_c, base_w), TAILC)
    # lighter underside stripe on the brown base front edge
    hd.line([S(3, -2), S(15, -14)], TAIL_U, 3 * scale)
    # brown base patch where tail meets body
    hd.ell(bx + 1 * scale, by - 3 * scale, 10 * scale, 8 * scale, TAILC)
    # highlight on the yellow flat top
    hd.line([S(8, -50), S(18, -56)], BODY_H, 3 * scale)


# ── Soft 3-tone body blob (base + shadow below + highlight above) ─────────────
def blob(hd, cx, cy, rx, ry, outline=True):
    if outline:
        hd.ell(cx, cy, rx + 2, ry + 2, OUTL)
    hd.ell(cx, cy, rx, ry, BODY)
    hd.ell(cx + rx * 0.18, cy + ry * 0.42, rx * 0.72, ry * 0.5, BODY_S)
    hd.ell(cx - rx * 0.2, cy - ry * 0.42, rx * 0.62, ry * 0.42, BODY_H)
    hd.ell(cx, cy, rx, ry, BODY)  # re-lay a faint base so shadow/hl stay subtle
    hd.ell(cx + rx * 0.22, cy + ry * 0.5, rx * 0.62, ry * 0.4, BODY_S)
    hd.ell(cx - rx * 0.22, cy - ry * 0.46, rx * 0.5, ry * 0.34, BODY_H)


# ── Long ear (tapered), yellow with black top ~30% ────────────────────────────
def draw_ear(hd, base, tip, wb, wt=2.4):
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L, dx / L
    def quad(bw, tw, c):
        hd.poly([(base[0] + nx * bw, base[1] + ny * bw),
                 (tip[0] + nx * tw, tip[1] + ny * tw),
                 (tip[0] - nx * tw, tip[1] - ny * tw),
                 (base[0] - nx * bw, base[1] - ny * bw)], c)
    quad(wb + 2, wt + 2, OUTL)
    quad(wb, wt, BODY)
    # black tip: last ~34%
    t = 0.66
    mid = (base[0] + dx * t, base[1] + dy * t)
    mw = wb + (wt - wb) * t
    hd.poly([(mid[0] + nx * mw, mid[1] + ny * mw),
             (tip[0] + nx * wt, tip[1] + ny * wt),
             (tip[0] - nx * wt, tip[1] - ny * wt),
             (mid[0] - nx * mw, mid[1] - ny * mw)], BLK)
    # subtle brown inner shading near base
    hd.line([(base[0], base[1] + 1), (mid[0], mid[1])], EARIN, 1.6)
    # highlight streak on the yellow part
    hd.line([(base[0] - nx * (wb * 0.3), base[1] - ny * (wb * 0.3)),
             (mid[0] - nx * (mw * 0.3), mid[1] - ny * (mw * 0.3))], BODY_H, 1.8)


def draw_eye(hd, cx, cy, r, kind='open'):
    if kind == 'blink':
        hd.line(hd.arc_pts(cx, cy, r + 1, r * 0.7, 20, 160), BLK, 2.6)
    elif kind == 'happy':          # ^ upward content arc
        hd.line(hd.arc_pts(cx, cy + r * 0.5, r + 1, r, 200, 340), BLK, 2.8)
    elif kind == 'x':              # squeezed-shut X
        hd.line([(cx - r, cy - r), (cx + r, cy + r)], BLK, 2.8)
        hd.line([(cx - r, cy + r), (cx + r, cy - r)], BLK, 2.8)
    else:                          # big round black eye + white catchlight
        hd.cir(cx, cy, r, BLK)
        hd.cir(cx - r * 0.32, cy - r * 0.38, r * 0.34, WHT)
        hd.cir(cx + r * 0.28, cy + r * 0.24, r * 0.14, (90, 90, 90, 255))


def draw_cheek(hd, cx, cy, r):
    hd.cir(cx, cy, r + 1.4, OUTL)
    hd.cir(cx, cy, r, CHEEK)
    hd.cir(cx - r * 0.3, cy - r * 0.3, r * 0.4, CHEEK_H)


# ══════════════════════════════════════════════════════════════════════════════
#  SITTING PIKACHU (150x140, facing LEFT)
# ══════════════════════════════════════════════════════════════════════════════
PIKA_W, PIKA_H = 150, 140

def draw_pika_sit(hd, stage, pose):
    grow = 1 + 0.08 * stage
    lean = pose == 'lean'
    chew = pose.startswith('chew')
    # jaw / cheek-bulge choreography
    jaw = {'chew0': 2, 'chew1': 3.5, 'chew2': 1}.get(pose, 0)
    bulgeL = pose in ('chew0', 'chew2')
    bulgeR = pose == 'chew1'
    hx_off = -4 if lean else 0     # head tips toward plate

    # body centre (lower pear)
    bx, by = 78, 104
    brx, bry = 30 * grow, 27 * (1 + 0.05 * stage)

    # tail behind
    draw_tail(hd, bx + brx * 0.7, by - 6)

    # back foot (far)
    hd.ell(96, 130, 12, 7, OUTL); hd.ell(96, 129, 10, 5.5, BODY)

    # lower body
    blob(hd, bx, by, brx, bry)
    # cream belly patch (grows with stage; clearly a ball belly at stage 3)
    bvis = 0.5 + 0.18 * stage
    hd.ell(bx - 6, by + 4, brx * bvis, bry * (0.55 + 0.12 * stage), BELLY)

    # near foot (front)
    hd.ell(58, 132, 13, 7.5, OUTL); hd.ell(58, 131, 11, 6, BODY)
    hd.ell(55, 132, 4, 2.4, BODY_S)

    # ── head ──
    hxc, hyc, hr = 70 + hx_off, 56, 33
    # ears (attach at head top, angle up-and-back = up-right)
    draw_ear(hd, (hxc - 12, hyc - 26), (hxc - 26 + hx_off, 8), 9)
    draw_ear(hd, (hxc + 12, hyc - 28), (hxc + 34, 4), 9.5)
    # head fill
    hd.cir(hxc, hyc, hr + 2, OUTL)
    hd.cir(hxc, hyc, hr, BODY)
    hd.ell(hxc + 8, hyc + 12, hr * 0.7, hr * 0.5, BODY_S)
    hd.ell(hxc - 8, hyc - 12, hr * 0.62, hr * 0.5, BODY_H)

    # cheeks (near cheek prominent, far cheek smaller)
    draw_cheek(hd, hxc - 20, hyc + 15 + jaw * 0.4, 11 + (2.5 if bulgeL else 0))
    draw_cheek(hd, hxc + 22, hyc + 12, 8 + (2 if bulgeR else 0))

    # eyes
    ek = {'idle1': 'blink', 'chew1': 'blink'}.get(pose, 'open')
    draw_eye(hd, hxc - 15, hyc - 2, 7.5, ek)
    draw_eye(hd, hxc + 16, hyc - 4, 6.8, ek)

    # nose (tiny triangle) at muzzle front-left
    nx, ny = hxc - 33, hyc + 6
    hd.poly([(nx, ny), (nx + 5, ny - 2.5), (nx + 5, ny + 2.5)], BLK)

    # mouth
    my = hyc + 12 + jaw
    if chew or lean:
        hd.ell(hxc - 22, my, 6.5, 4.5 + jaw * 0.5, MOUTH)
        hd.ell(hxc - 22, my + 1.5, 3.6, 2.2, TONGUE)
    else:  # classic w-shape
        hd.line(hd.arc_pts(hxc - 27, my, 4, 3, 20, 160), MOUTH, 1.8)
        hd.line(hd.arc_pts(hxc - 19, my, 4, 3, 20, 160), MOUTH, 1.8)

    # ── arms ──
    if lean:  # near arm reaches down-left toward the plate
        hd.line([(bx - 14, by - 4), (44, 118), (34, 122)], OUTL, 9)
        hd.line([(bx - 14, by - 4), (44, 118), (34, 122)], BODY, 6.5)
        hd.ell(33, 123, 6, 5, OUTL); hd.ell(33, 122, 4.4, 3.6, BODY)
    else:
        hd.ell(bx - brx * 0.7, by - 2, 8, 11, OUTL)
        hd.ell(bx - brx * 0.7, by - 2, 6, 9, BODY)
    # far arm resting on belly
    hd.ell(bx + brx * 0.3, by + 2, 7, 9, OUTL)
    hd.ell(bx + brx * 0.3, by + 2, 5, 7, BODY)


# ══════════════════════════════════════════════════════════════════════════════
#  STANDING PIKACHU (150x170, front-ish, belly stage 3)
# ══════════════════════════════════════════════════════════════════════════════
STAND_W, STAND_H = 150, 170

def bolt_glyph(hd, cx, cy, s, c):
    """Small lightning bolt centred at cx,cy scaled by s."""
    p = [(-3, -8), (2, -8), (-1, -1), (4, -1), (-4, 9), (-1, 0), (-5, 0)]
    hd.poly([(cx + x * s, cy + y * s) for x, y in p], c)


def draw_pika_stand(hd, pose):
    crouch = {'charge0': 6, 'charge1': 12}.get(pose, 0)
    cheekR = {'charge0': 14, 'charge1': 16, 'thunder': 14}.get(pose, 12)
    armsUp = pose == 'thunder'
    hxc, hyc, hr = 75, 52 + crouch * 0.4, 36

    # tail behind (bigger)
    draw_tail(hd, 108, 118)

    # ── legs / feet ──
    fy = 162
    for sgn in (-1, 1):
        fx = 75 + sgn * 20
        hd.ell(fx, fy, 15, 9, OUTL); hd.ell(fx, fy - 1, 12.5, 7, BODY)

    # ── body (big round belly, stage 3) ──
    by = 118 + crouch
    blob(hd, 75, by, 42, 44 - crouch * 0.5)
    hd.ell(75, by + 6, 30, 30, BELLY)

    # ── arms ──
    if armsUp:
        for sgn in (-1, 1):
            sx = 75 + sgn * 30
            hd.line([(sx, by - 26), (sx + sgn * 14, by - 58), (sx + sgn * 18, by - 74)], OUTL, 12)
            hd.line([(sx, by - 26), (sx + sgn * 14, by - 58), (sx + sgn * 18, by - 74)], BODY, 9)
            hd.ell(sx + sgn * 18, by - 76, 7, 6, OUTL); hd.ell(sx + sgn * 18, by - 76, 5.2, 4.4, BODY)
    else:
        for sgn in (-1, 1):
            sx = 75 + sgn * 38
            dyx = 6 if pose in ('charge0', 'charge1') else 0
            hd.ell(sx, by - 10 + dyx, 9, 13, OUTL); hd.ell(sx, by - 10 + dyx, 7, 11, BODY)

    # ── head ──
    draw_ear(hd, (hxc - 15, hyc - 28), (hxc - 30, 6), 10)
    draw_ear(hd, (hxc + 15, hyc - 28), (hxc + 30, 4), 10)
    hd.cir(hxc, hyc, hr + 2, OUTL)
    hd.cir(hxc, hyc, hr, BODY)
    hd.ell(hxc, hyc + 14, hr * 0.7, hr * 0.5, BODY_S)
    hd.ell(hxc - 10, hyc - 12, hr * 0.55, hr * 0.45, BODY_H)

    # cheeks (both prominent)
    draw_cheek(hd, hxc - 26, hyc + 16, cheekR)
    draw_cheek(hd, hxc + 26, hyc + 16, cheekR)

    # eyes
    ek = {'thunder': 'x', 'happy': 'happy'}.get(pose, 'open')
    draw_eye(hd, hxc - 13, hyc - 2, 8, ek)
    draw_eye(hd, hxc + 13, hyc - 2, 8, ek)

    # nose
    hd.poly([(hxc - 3, hyc + 8), (hxc + 3, hyc + 8), (hxc, hyc + 11)], BLK)

    # mouth
    if pose == 'thunder':
        hd.ell(hxc, hyc + 20, 9, 11, MOUTH)
        hd.ell(hxc, hyc + 24, 5, 5, TONGUE)
    elif pose == 'happy':
        hd.line(hd.arc_pts(hxc, hyc + 14, 7, 5, 20, 160), MOUTH, 2.2)
    else:
        hd.line(hd.arc_pts(hxc - 5, hyc + 15, 4, 3, 20, 160), MOUTH, 1.8)
        hd.line(hd.arc_pts(hxc + 3, hyc + 15, 4, 3, 20, 160), MOUTH, 1.8)

    # spark dots around cheeks (charging)
    if pose in ('charge0', 'charge1'):
        n = 5 if pose == 'charge0' else 8
        for i in range(n):
            a = i * (2 * math.pi / n)
            rr = 24 + (i % 3) * 4
            for cx0 in (hxc - 26, hxc + 26):
                sx = cx0 + math.cos(a) * rr
                sy = hyc + 16 + math.sin(a) * rr
                hd.poly([(sx - 2, sy), (sx, sy - 3), (sx + 2, sy), (sx, sy + 3)], SPARK)
    # thunderbolts (thunder + charge1)
    if pose == 'thunder':
        for bx0, by0, s in [(28, 40, 2.0), (122, 44, 2.0), (18, 96, 1.6), (132, 92, 1.6)]:
            bolt_glyph(hd, bx0, by0, s, BOLT)
            bolt_glyph(hd, bx0, by0, s * 0.5, WHT)
    if pose == 'happy':
        for sx, sy, sr in [(30, 30, 4), (120, 28, 3), (112, 70, 2.5)]:
            hd.poly([(sx - sr, sy), (sx, sy - sr * 1.8), (sx + sr, sy), (sx, sy + sr * 1.8)], SPARK)
            hd.poly([(sx - sr * 1.8, sy), (sx, sy - sr), (sx + sr * 1.8, sy), (sx, sy + sr)], SPARK)


# ══════════════════════════════════════════════════════════════════════════════
#  FOOD (44x40) — smooth HD, normal + half-eaten (bite arc + interior exposed)
# ══════════════════════════════════════════════════════════════════════════════
FOOD_W, FOOD_H = 44, 40
CX, CY = 22, 20

def _shade(hd, cx, cy, rx, ry, base, dark, light):
    hd.ell(cx, cy, rx, ry, base)
    hd.ell(cx + rx * 0.2, cy + ry * 0.35, rx * 0.7, ry * 0.6, dark)
    hd.ell(cx - rx * 0.25, cy - ry * 0.35, rx * 0.5, ry * 0.4, light)

# interior (exposed-flesh) colour per food index
INTERIOR = {
    0: (255, 246, 214, 255), 1: (255, 150, 160, 255), 2: (245, 224, 180, 255),
    3: (255, 255, 255, 255), 4: (214, 170, 110, 255), 5: (255, 236, 150, 255),
    6: (250, 240, 225, 255), 7: (240, 248, 210, 255), 8: (255, 236, 180, 255),
    9: (232, 200, 150, 255), 10: (255, 255, 255, 255), 11: (120, 78, 52, 255),
    12: (120, 80, 150, 255), 13: (210, 40, 30, 255),
}

def draw_food(hd, i):
    if i in (0, 7):  # apples (0 red, 7 green)
        if i == 0:
            base, dk, lt = (228, 46, 42, 255), (180, 26, 30, 255), (255, 120, 110, 255)
        else:
            base, dk, lt = (150, 205, 60, 255), (108, 170, 40, 255), (210, 240, 150, 255)
        _shade(hd, CX - 3, CY + 2, 14, 15, base, dk, lt)
        _shade(hd, CX + 6, CY + 2, 10, 14, base, dk, lt)
        hd.cir(CX - 8, CY - 5, 4, lt)
        hd.line([(CX, CY - 13), (CX + 2, CY - 20)], (110, 74, 44, 255), 2.4)
        hd.poly([(CX + 2, CY - 19), (CX + 11, CY - 22), (CX + 8, CY - 15)], (70, 160, 60, 255))
    elif i in (1,):  # strawberry
        hd.poly([(CX, CY + 16), (CX - 13, CY - 3), (CX + 13, CY - 3)], (222, 40, 46, 255))
        hd.ell(CX, CY - 3, 13, 8, (222, 40, 46, 255))
        hd.ell(CX + 3, CY + 3, 8, 8, (180, 24, 34, 255))
        hd.ell(CX - 4, CY - 3, 6, 4, (255, 120, 120, 255))
        for sx, sy in [(-6, 2), (2, 5), (7, 0), (-2, 10), (5, -4), (-8, -2)]:
            hd.poly([(CX + sx, CY + sy - 1), (CX + sx + 1.4, CY + sy + 1), (CX + sx - 1.4, CY + sy + 1)], (255, 236, 120, 255))
        # green calyx
        for a in range(-2, 3):
            hd.poly([(CX, CY - 11), (CX + a * 4, CY - 3), (CX + a * 4 + 2, CY - 4)], (70, 165, 60, 255))
    elif i == 2:  # pancake stack + syrup + butter
        for k, yy in enumerate((CY + 8, CY + 2, CY - 4)):
            hd.ell(CX, yy, 16 - k * 0.5, 5.5, (222, 170, 96, 255))
            hd.ell(CX, yy - 1, 15 - k * 0.5, 4.5, (238, 196, 130, 255))
        # syrup drips
        hd.ell(CX, CY - 5, 15, 4, (150, 96, 40, 255))
        for dx in (-10, -2, 8):
            hd.line([(CX + dx, CY - 5), (CX + dx, CY + 4 + (dx % 3))], (150, 96, 40, 255), 3)
        hd.rrect(CX - 5, CY - 11, CX + 5, CY - 5, 2, (255, 236, 130, 255))  # butter
    elif i in (3, 10):  # onigiri (10 has umeboshi dot)
        hd.poly([(CX, CY - 15), (CX - 15, CY + 12), (CX + 15, CY + 12)], (200, 150, 40, 255))  # subtle outline via bg? keep
        hd.poly([(CX, CY - 14), (CX - 14, CY + 11), (CX + 14, CY + 11)], (250, 250, 250, 255))
        hd.poly([(CX - 6, CY - 8), (CX + 6, CY - 8), (CX + 2, CY - 2), (CX - 2, CY - 2)], (240, 240, 240, 255))
        hd.rrect(CX - 9, CY + 4, CX + 9, CY + 12, 2, (40, 40, 46, 255))  # nori band
        if i == 10:
            hd.cir(CX, CY - 6, 3, (220, 60, 60, 255))
    elif i in (4, 11):  # cookies (4 tan, 11 chocolate)
        if i == 4:
            _shade(hd, CX, CY, 15, 14, (214, 158, 92, 255), (176, 120, 66, 255), (240, 200, 140, 255))
            chip = (96, 60, 34, 255)
        else:
            _shade(hd, CX, CY, 15, 14, (110, 70, 44, 255), (78, 48, 30, 255), (150, 100, 66, 255))
            chip = (56, 34, 22, 255)
        for cx0, cy0 in [(-6, -4), (5, -6), (7, 4), (-4, 6), (0, 1), (-9, 2), (10, -1)]:
            hd.cir(CX + cx0, CY + cy0, 2.4, chip)
    elif i == 5:  # corn cob
        hd.ell(CX + 2, CY, 9, 15, (245, 210, 90, 255))
        for gy in range(-13, 14, 4):
            for gx in range(-6, 10, 4):
                hd.cir(CX + 2 + gx, CY + gy, 1.9, (255, 232, 120, 255))
        # husk leaves
        hd.poly([(CX - 6, CY + 6), (CX - 15, CY + 15), (CX - 5, CY + 13)], (110, 180, 70, 255))
        hd.poly([(CX - 7, CY - 4), (CX - 16, CY - 2), (CX - 6, CY + 4)], (130, 195, 80, 255))
    elif i == 6:  # drumstick
        hd.ell(CX + 3, CY - 2, 12, 11, (188, 120, 62, 255))
        hd.ell(CX + 6, CY + 1, 8, 8, (150, 92, 46, 255))
        hd.ell(CX + 1, CY - 6, 5, 4, (222, 168, 110, 255))
        hd.line([(CX - 4, CY + 4), (CX - 14, CY + 13)], (240, 232, 214, 255), 6)  # bone
        hd.cir(CX - 14, CY + 13, 4, (250, 246, 236, 255))
        hd.cir(CX - 16, CY + 11, 3, (250, 246, 236, 255))
    elif i == 8:  # sandwich (triangle)
        hd.poly([(CX - 15, CY + 10), (CX + 15, CY + 10), (CX, CY - 14)], (232, 196, 130, 255))  # bread
        hd.poly([(CX - 12, CY + 6), (CX + 12, CY + 6), (CX, CY - 6)], (255, 232, 120, 255))     # cheese
        hd.poly([(CX - 13, CY + 9), (CX + 13, CY + 9), (CX, CY + 2)], (120, 190, 80, 255))      # lettuce
        hd.poly([(CX - 9, CY + 8), (CX + 9, CY + 8), (CX, CY + 2)], (222, 70, 60, 255))         # tomato
        hd.line([(CX - 15, CY + 10), (CX + 15, CY + 10)], (200, 160, 100, 255), 2)
    elif i == 9:  # pink donut
        hd.cir(CX, CY, 15, (232, 200, 150, 255))
        hd.ell(CX, CY - 1, 15, 12, (245, 138, 178, 255))  # icing
        hd.ell(CX - 5, CY - 5, 7, 4, (255, 190, 214, 255))
        hd.cir(CX, CY, 5.5, (0, 0, 0, 0))  # hole
        hd.cir(CX, CY, 6, (232, 200, 150, 255))
        hd.cir(CX, CY, 5, (0, 0, 0, 0))
        for _ in range(9):  # sprinkles
            a = random.uniform(0, 6.28); rr = random.uniform(8, 13)
            sx, sy = CX + math.cos(a) * rr, CY + math.sin(a) * rr
            col = random.choice([(255, 255, 255, 255), (120, 200, 255, 255), (255, 240, 120, 255), (150, 255, 150, 255)])
            hd.line([(sx - 1.6, sy - 1.6), (sx + 1.6, sy + 1.6)], col, 1.8)
    elif i == 12:  # blueberries cluster
        for bx0, by0, r in [(-6, -3, 7), (5, -5, 7), (7, 5, 7), (-4, 6, 7), (0, 1, 7)]:
            hd.cir(CX + bx0, CY + by0, r, (70, 90, 170, 255))
            hd.cir(CX + bx0 - 1, CY + by0 - 1, r * 0.5, (120, 140, 220, 255))
            hd.cir(CX + bx0, CY + by0, 1.6, (40, 50, 110, 255))  # calyx star
    elif i == 13:  # KETCHUP BOTTLE (eaten last, Pikachu-fan nod)
        hd.rrect(CX - 8, CY - 10, CX + 8, CY + 17, 4, (222, 40, 36, 255))  # body
        hd.ell(CX, CY + 8, 8, 9, (222, 40, 36, 255))
        hd.rrect(CX - 6, CY - 14, CX + 6, CY - 8, 2, (232, 232, 232, 255))  # cap
        hd.rrect(CX - 3, CY - 18, CX + 3, CY - 13, 1, (232, 232, 232, 255))  # nozzle
        hd.rrect(CX - 6, CY - 2, CX + 6, CY + 10, 2, (250, 245, 235, 255))   # label
        hd.line([(CX - 4, CY + 1), (CX + 4, CY + 1)], (222, 40, 36, 255), 1.6)
        hd.line([(CX - 4, CY + 5), (CX + 4, CY + 5)], (232, 180, 60, 255), 1.6)
        hd.line([(CX - 7, CY - 6), (CX - 7, CY + 3)], (255, 150, 140, 255), 2)  # shine


def carve_bite(hd, i):
    """Remove a scalloped bite from the top-right + expose interior colour."""
    interior = INTERIOR[i]
    # bite notch: a couple of overlapping erases at top-right edge
    if i == 13:  # ketchup: bite the top corner of the bottle body
        hd.erase_ell(CX + 7, CY - 9, 7, 7)
        hd.erase_ell(CX + 3, CY - 12, 5, 5)
        hd.ell(CX + 2, CY - 6, 4, 3, interior)
        return
    bx, by = CX + 10, CY - 8
    hd.erase_ell(bx, by, 8, 8)
    hd.erase_ell(bx - 5, by + 4, 5.5, 5.5)
    # exposed interior: small flesh blobs just inside the cut
    for ex, ey, er in [(bx - 3, by + 4, 3.2), (bx - 6, by + 8, 2.6), (bx - 1, by + 8, 2.4)]:
        hd.cir(ex, ey, er, interior)
    # a couple seed/detail dots for fruit
    if i in (0, 7):
        hd.cir(bx - 4, by + 6, 1.1, (70, 46, 26, 255))


# ══════════════════════════════════════════════════════════════════════════════
#  PROPS
# ══════════════════════════════════════════════════════════════════════════════
def draw_plate(hd):
    w, h = 320, 110
    cx, cy = w / 2, h / 2 + 6
    hd.ell(cx, cy + 10, 150, 34, (0, 0, 0, 60))       # soft shadow
    hd.ell(cx, cy, 150, 40, (208, 210, 220, 255))     # rim
    hd.ell(cx, cy - 2, 150, 40, (246, 246, 250, 255))
    hd.ell(cx, cy, 120, 30, (224, 226, 236, 255))     # inner well rim
    hd.ell(cx, cy - 1, 116, 28, (252, 252, 255, 255)) # cream inner
    hd.line(hd.arc_pts(cx, cy - 4, 130, 30, 190, 240), WHT, 3)  # top highlight arc


def draw_crumb(hd, kind):
    if kind == 0:
        hd.poly([(4, 8), (2, 3), (7, 2), (9, 6)], (214, 160, 96, 255))
        hd.cir(4, 4, 1.4, (240, 200, 140, 255))
    else:
        hd.cir(4, 5, 2.6, (196, 140, 84, 255))
        hd.cir(3, 4, 1.2, (232, 190, 130, 255))


# ══════════════════════════════════════════════════════════════════════════════
#  BUILD SHEET (shelf packer)
# ══════════════════════════════════════════════════════════════════════════════
items = []   # (name, w, h, drawfn)

for s in range(4):
    for pose in ('idle0', 'idle1', 'lean', 'chew0', 'chew1', 'chew2'):
        items.append((f'pika_s{s}_{pose}', PIKA_W, PIKA_H,
                      (lambda st, po: (lambda hd: draw_pika_sit(hd, st, po)))(s, pose)))

for name in ('pika_stand', 'pika_charge0', 'pika_charge1', 'pika_thunder', 'pika_happy'):
    items.append((name, STAND_W, STAND_H,
                  (lambda p: (lambda hd: draw_pika_stand(hd, p)))(name.replace('pika_', '')
                                                                  if name != 'pika_stand' else 'stand')))

for i in range(14):
    items.append((f'food_{i}', FOOD_W, FOOD_H, (lambda k: (lambda hd: draw_food(hd, k)))(i)))
    def _mk(k):
        def f(hd):
            draw_food(hd, k); carve_bite(hd, k)
        return f
    items.append((f'food_{i}_bit', FOOD_W, FOOD_H, _mk(i)))

items.append(('plate', 320, 110, draw_plate))
items.append(('crumb0', 12, 12, lambda hd: draw_crumb(hd, 0)))
items.append(('crumb1', 12, 12, lambda hd: draw_crumb(hd, 1)))

PAD = 2
MAXW = 1100
x = y = rowh = 0
placed = {}
for name, w, h, fn in items:
    if x + w > MAXW:
        x = 0; y += rowh + PAD; rowh = 0
    placed[name] = (x, y, w, h, fn)
    x += w + PAD
    rowh = max(rowh, h)
SHEET_W = MAXW
SHEET_H = y + rowh + PAD

img = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 0))
frames = {}
for name, (px, py, w, h, fn) in placed.items():
    hd = HD(w, h)
    fn(hd)
    img.alpha_composite(hd.out(), (px, py))
    frames[name] = [px, py, w, h]

# ── verify: all expected frames present, in-bounds, non-overlapping ──
expected = []
for s in range(4):
    for pose in ('idle0', 'idle1', 'lean', 'chew0', 'chew1', 'chew2'):
        expected.append(f'pika_s{s}_{pose}')
expected += ['pika_stand', 'pika_charge0', 'pika_charge1', 'pika_thunder', 'pika_happy']
for i in range(14):
    expected += [f'food_{i}', f'food_{i}_bit']
expected += ['plate', 'crumb0', 'crumb1']

missing = [n for n in expected if n not in frames]
assert not missing, f'MISSING frames: {missing}'
for n, (fx, fy, fw, fh) in frames.items():
    assert fx >= 0 and fy >= 0 and fx + fw <= SHEET_W and fy + fh <= SHEET_H, f'{n} out of bounds'
names = list(frames)
for a in range(len(names)):
    xa, ya, wa, ha = frames[names[a]]
    for b in range(a + 1, len(names)):
        xb, yb, wb, hb = frames[names[b]]
        if not (xa + wa <= xb or xb + wb <= xa or ya + ha <= yb or yb + hb <= ya):
            raise AssertionError(f'OVERLAP {names[a]} vs {names[b]}')

save(img, frames, 'feeding')
print(f'sheet {SHEET_W}x{SHEET_H}  frames={len(frames)}  expected={len(expected)}')
