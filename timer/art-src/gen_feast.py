"""Generate feeding.png + feeding.json sprite sheet for the Poke Feast theme.
Run from timer/art-src/:  python gen_feast.py
Outputs: timer/assets/feeding.png + feeding.json

QUALITY CENTERPIECE: Pikachu is drawn as a SMOOTH, high-res cartoon (NOT chunky
16-bit pixels) by SUPERSAMPLING (rendered 4x with filled curves/ellipses, then
LANCZOS-downsampled so edges are anti-aliased). The goal is instant "that's
Pikachu" recognition: long black-tipped leaf ears, big wide-set round eyes,
flat red cheeks that bulge the face silhouette, centred nose + w-mouth, the
flat zigzag lightning-bolt tail from the lower back, solid-yellow body.

V2 construction rules (style source of truth: reference_pika_v2.py):
  * ONE consistent 3/4-left projection for sit poses (features shift by FX;
    nothing sits on the silhouette rim), front view for finale stand poses.
  * Unified silhouette: outline pass for head+body+feet first, fills second;
    ear outlines before the head fill, ear fills after (seamless merge).
  * Flat cel shading: one chocolate outline, one same-hue shadow crescent,
    NO white speculars, NO cream belly sticker (belly growth = proportions).

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

# ── Pikachu palette (flat cel; chocolate outline, same-hue shadow) ────────────
BODY   = (255, 222, 0, 255)     # #FFDE00 body yellow
SHAD   = (240, 185, 0, 255)     # #F0B900 same-hue shadow (NOT brown-ochre)
OUTL   = (74, 50, 18, 255)      # #4A3212 dark chocolate outline, one weight
CHEEK  = (232, 68, 44, 255)     # #E8442C flat red-orange cheeks (no gloss)
CHEEK_D = (196, 52, 32, 255)    # cheek under-arc
BLK    = (26, 26, 26, 255)      # #1A1A1A ears/eyes
TAILC  = (138, 90, 43, 255)     # #8A5A2B tail base + back stripes
TAIL_U = (201, 138, 61, 255)    # tail underside accent
MOUTH  = (122, 48, 32, 255)     # #7A3020 mouth interior
TONGUE = (232, 110, 110, 255)
WHT    = (255, 255, 255, 255)
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


# ── V2 character construction helpers ─────────────────────────────────────────
def _taper_strip(pts_w):
    """Closed polygon around a centreline of (x, y, width) tuples."""
    left, right = [], []
    for i, (x, y, ww) in enumerate(pts_w):
        if i == 0:
            dx, dy = pts_w[1][0] - x, pts_w[1][1] - y
        elif i == len(pts_w) - 1:
            dx, dy = x - pts_w[i - 1][0], y - pts_w[i - 1][1]
        else:
            dx, dy = pts_w[i + 1][0] - pts_w[i - 1][0], pts_w[i + 1][1] - pts_w[i - 1][1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        left.append((x + nx * ww / 2, y + ny * ww / 2))
        right.append((x - nx * ww / 2, y - ny * ww / 2))
    return left + right[::-1]


def lerp2(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def bolt_tail(hd, bx, by, s=1.0):
    """Flat hard-cornered lightning-bolt tail from the LOWER back: one zigzag
    polygon widening to a broad flat top, plus the classic brown base wedge."""
    def P(x, y):
        return (bx + x * s, by + y * s)
    pts = [P(0, 0), P(9, -9), P(2, -16), P(16, -28), P(8, -33), P(26, -52),
           P(40, -50), P(30, -38), P(38, -40), P(24, -22), P(31, -20), P(12, -4)]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    hd.poly([(cx + (x - cx) * 1.14, cy + (y - cy) * 1.14) for x, y in pts], OUTL)
    hd.poly(pts, BODY)
    base = [P(0, 0), P(9, -9), P(2, -16), P(13, -25), P(20, -16), P(12, -4)]
    bcx = sum(p[0] for p in base) / len(base)
    bcy = sum(p[1] for p in base) / len(base)
    hd.poly([(bcx + (x - bcx) * 1.16, bcy + (y - bcy) * 1.16) for x, y in base], OUTL)
    hd.poly(base, TAILC)
    hd.line([P(4, -6), P(12, -14)], TAIL_U, 2.2 * s)


def _ear_segs(base, tip, wb, curve, grow=0.0):
    """Leaf-shaped ear centreline: base -> mid bulge -> pointed tip."""
    bx, by = base
    tx, ty = tip
    mx = (bx + tx) / 2 + (ty - by) * curve * 0.5
    my = (by + ty) / 2 - (tx - bx) * curve * 0.5
    return [(bx, by, wb + grow), (mx, my, wb * 0.88 + grow), (tx, ty, 2.2 + grow * 0.8)]


def ear_outline(hd, base, tip, wb, curve):
    """Ear outline pass — call BEFORE the head fill."""
    hd.poly(_taper_strip(_ear_segs(base, tip, wb, curve, grow=3.4)), OUTL)


def ear_fill(hd, base, tip, wb, curve):
    """Ear fill pass — call AFTER the head fill so the base merges seamlessly.
    Black tip = outer ~35% only, tapering with the leaf."""
    segs = _ear_segs(base, tip, wb, curve)
    hd.poly(_taper_strip(segs), BODY)
    a, b, c = segs
    p0 = lerp2((b[0], b[1]), (c[0], c[1]), 0.3)
    w0 = b[2] + (c[2] - b[2]) * 0.3
    hd.poly(_taper_strip([(p0[0], p0[1], w0), (c[0], c[1], c[2])]), BLK)


def capsule(hd, pts, w, fill):
    """Stroke a polyline with round end caps (no pipe-seam rings)."""
    hd.line(pts, fill, w)
    hd.cir(pts[0][0], pts[0][1], w / 2, fill)
    hd.cir(pts[-1][0], pts[-1][1], w / 2, fill)


def arm(hd, pts, w=8.8):
    capsule(hd, pts, w + 3.2, OUTL)
    capsule(hd, pts, w, BODY)


def v2_eye(hd, cx, cy, r, kind='open'):
    if kind == 'blink':
        hd.line(hd.arc_pts(cx, cy, r + 1, r * 0.7, 20, 160), BLK, 2.6)
    elif kind == 'happy':          # ^ upward content arc
        hd.line(hd.arc_pts(cx, cy + r * 0.5, r + 1, r, 200, 340), BLK, 2.8)
    elif kind == 'shutL':          # > squeezed-shut shout (left eye)
        hd.line([(cx - r, cy - r * 0.7), (cx + r * 0.6, cy), (cx - r, cy + r * 0.7)], BLK, 2.8)
    elif kind == 'shutR':          # < squeezed-shut shout (right eye)
        hd.line([(cx + r, cy - r * 0.7), (cx - r * 0.6, cy), (cx + r, cy + r * 0.7)], BLK, 2.8)
    else:                          # open: big round black eye, ONE catchlight upper-right
        hd.cir(cx, cy, r, BLK)
        hd.cir(cx + r * 0.30, cy - r * 0.34, r * 0.36, WHT)


def v2_cheek(hd, cx, cy, r):
    hd.cir(cx, cy, r + 1.6, OUTL)
    hd.cir(cx, cy, r, CHEEK)
    hd.line(hd.arc_pts(cx, cy, r * 0.72, r * 0.72, 40, 140), CHEEK_D, 1.6)


# ══════════════════════════════════════════════════════════════════════════════
#  SITTING PIKACHU (150x140, 3/4 facing LEFT toward the plate)
# ══════════════════════════════════════════════════════════════════════════════
PIKA_W, PIKA_H = 150, 140
GROUND = 134                     # character baseline inside the box


def draw_pika_sit(hd, stage, pose):
    lean = pose == 'lean'
    chew = pose.startswith('chew')
    jaw = {'chew0': 1.2, 'chew1': 3.2, 'chew2': 0.6}.get(pose, 0)
    bulgeL = 2.2 if pose in ('chew0', 'chew2') else 0
    bulgeR = 2.0 if pose == 'chew1' else 0

    # sitting body: pear planted ON the ground, growing with belly stage;
    # the head drifts back/up slightly as the belly rounds out (leaning back)
    brx = 33 * (1 + 0.075 * stage)
    bry = 29 * (1 + 0.06 * stage)
    bx = 78
    by = GROUND - bry
    hxc = 68 + 2 * stage - (4 if lean else 0)
    hyc = 50 + 1.5 * stage
    hrx, hry = 34, 29
    FX = -6                       # 3/4-left feature shift (never on the rim)

    # tail first (behind everything), from the LOWER back
    bolt_tail(hd, bx + brx * 0.6, GROUND - 14, 1.0)

    # ears: outline pass BEFORE the head fill
    earL = ((hxc - 18, hyc - hry * 0.5), (hxc - 36, 8), 17, 0.30)
    earR = ((hxc + 20, hyc - hry * 0.45), (hxc + 42, 10), 18, -0.26)
    ear_outline(hd, *earR)
    ear_outline(hd, *earL)

    # unified silhouette: outlines first, fills second
    hd.ell(bx, by, brx + 2.6, bry + 2.6, OUTL)
    hd.ell(hxc, hyc, hrx + 2.6, hry + 2.6, OUTL)
    hd.ell(52, GROUND - 4, 12.5, 7, OUTL)        # near foot, pointing forward
    hd.ell(88, GROUND - 2, 11.5, 6.5, OUTL)      # far foot
    hd.ell(bx, by, brx, bry, BODY)
    hd.ell(hxc, hyc, hrx, hry, BODY)
    hd.ell(52, GROUND - 4.5, 10.6, 5.6, BODY)
    hd.ell(88, GROUND - 2.5, 9.6, 5.2, BODY)
    ear_fill(hd, *earR)
    ear_fill(hd, *earL)
    # flat cel shadow: single same-hue crescent at the body bottom
    hd.ell(bx, by + bry * 0.58, brx * 0.78, bry * 0.30, SHAD)
    hd.ell(bx, by + bry * 0.58 - 3.5, brx * 0.76, bry * 0.28, BODY)
    # toe nicks (near foot)
    hd.line([(49, GROUND - 7), (49, GROUND - 2)], OUTL, 1.3)
    hd.line([(55, GROUND - 8), (55, GROUND - 2)], OUTL, 1.3)

    # two brown back stripes on the 3/4 back edge (clear of tail + arms)
    hd.line(hd.arc_pts(bx + brx * 0.42, by - bry * 0.45, brx * 0.5, 4, -28, 28), TAILC, 6)
    hd.line(hd.arc_pts(bx + brx * 0.44, by - bry * 0.08, brx * 0.46, 4, -28, 28), TAILC, 6)

    # ── face (consistent 3/4-left) ──
    ek = 'blink' if pose == 'idle1' else ('happy' if pose == 'chew1' else 'open')
    v2_eye(hd, hxc - 19 + FX, hyc - 1, 8.2, ek)
    v2_eye(hd, hxc + 19 + FX * 0.4, hyc - 1, 7.6, ek)
    v2_cheek(hd, hxc - hrx * 0.70 + FX * 0.5, hyc + hry * 0.40, 10.5 + bulgeL)
    v2_cheek(hd, hxc + hrx * 0.70, hyc + hry * 0.36, 9.5 + bulgeR)
    hd.ell(hxc - 4 + FX, hyc + 5, 2.1, 1.4, BLK)             # tiny nose
    mxc, myc = hxc - 4 + FX, hyc + 12 + jaw
    if pose == 'chew1' or lean:
        # open mouth (mid-chew / anticipation)
        hd.ell(mxc, myc + 1, 5.6, 4.4 + jaw * 0.3, OUTL)
        hd.ell(mxc, myc + 1, 4.4, 3.4 + jaw * 0.3, MOUTH)
        hd.ell(mxc, myc + 2.6, 2.8, 1.5, TONGUE)
    else:
        # closed w-smile (chew0/chew2 carry motion via jaw offset + cheek bulge)
        hd.line(hd.arc_pts(mxc - 4.5, myc, 4.6, 3.4, 15, 165), OUTL, 2.4)
        hd.line(hd.arc_pts(mxc + 4.5, myc, 4.6, 3.4, 15, 165), OUTL, 2.4)

    # ── arms (drawn last; shoulders sit ON the silhouette edge and the arm
    #    breaks OUTSIDE it, so it reads as a limb, not a slit in the belly) ──
    shL = (bx - brx * 0.88, by - bry * 0.45)
    if lean:
        # near arm reaches out-and-down toward the plate, clear of the body
        arm(hd, [shL, (36, 112), (27, 121)])
    elif chew:
        # near paw up at the mouth (nibble); the far arm is hidden behind the
        # head in 3/4 view — a crossing far arm reads as a strap, so none drawn
        arm(hd, [shL, (bx - brx - 5, by - bry * 0.1), (mxc - 4, myc + 7)])
    else:
        # idle: near arm hugs the body's front edge, paw at the lap
        arm(hd, [shL, (bx - brx * 0.72, by + bry * 0.28)])


# ══════════════════════════════════════════════════════════════════════════════
#  STANDING PIKACHU (150x170, front view, belly stage 3 baked)
# ══════════════════════════════════════════════════════════════════════════════
STAND_W, STAND_H = 150, 170
SGROUND = 164


def bolt_glyph(hd, cx, cy, s, c):
    """Small lightning bolt centred at cx,cy scaled by s."""
    p = [(-3, -8), (2, -8), (-1, -1), (4, -1), (-4, 9), (-1, 0), (-5, 0)]
    hd.poly([(cx + x * s, cy + y * s) for x, y in p], c)


def draw_pika_stand(hd, pose):
    crouch = {'charge0': 5, 'charge1': 10}.get(pose, 0)
    cheekR = {'charge0': 12.5, 'charge1': 13.5, 'thunder': 13}.get(pose, 11.5)
    armsUp = pose == 'thunder'
    happy = pose == 'happy'

    # stage-3 round body standing on short tucked legs
    brx = 40
    bry = 42 - crouch * 0.5
    bx = 75
    by = SGROUND - 12 - bry + crouch * 0.5
    hrx, hry = 35, 30
    hyc = by - bry - hry + 26 + crouch * 0.3
    hxc = 75

    bolt_tail(hd, bx + brx * 0.62, SGROUND - 26, 1.05)

    earL = ((hxc - 20, hyc - hry * 0.45), (hxc - 40, hyc - hry - 26), 18, 0.28)
    earR = ((hxc + 20, hyc - hry * 0.45), (hxc + 40, hyc - hry - 26), 18, -0.28)
    ear_outline(hd, *earR)
    ear_outline(hd, *earL)

    # unified silhouette: outlines first, fills second
    hd.ell(bx, by, brx + 2.6, bry + 2.6, OUTL)
    hd.ell(hxc, hyc, hrx + 2.6, hry + 2.6, OUTL)
    for sgn in (-1, 1):
        hd.ell(bx + sgn * 18, SGROUND - 6, 13.5, 8, OUTL)
    hd.ell(bx, by, brx, bry, BODY)
    hd.ell(hxc, hyc, hrx, hry, BODY)
    for sgn in (-1, 1):
        hd.ell(bx + sgn * 18, SGROUND - 6.5, 11.6, 6.6, BODY)
    ear_fill(hd, *earR)
    ear_fill(hd, *earL)
    hd.ell(bx, by + bry * 0.6, brx * 0.75, bry * 0.26, SHAD)
    hd.ell(bx, by + bry * 0.6 - 3.5, brx * 0.73, bry * 0.24, BODY)
    for sgn in (-1, 1):   # toe nicks
        hd.line([(bx + sgn * 18 - 3, SGROUND - 9), (bx + sgn * 18 - 3, SGROUND - 4)], OUTL, 1.3)
        hd.line([(bx + sgn * 18 + 3, SGROUND - 9), (bx + sgn * 18 + 3, SGROUND - 4)], OUTL, 1.3)

    # ── face (front view; features centred, never on the rim) ──
    if pose == 'thunder':
        v2_eye(hd, hxc - 16, hyc - 2, 8, 'shutL')
        v2_eye(hd, hxc + 16, hyc - 2, 8, 'shutR')
    elif happy:
        v2_eye(hd, hxc - 16, hyc - 2, 8, 'happy')
        v2_eye(hd, hxc + 16, hyc - 2, 8, 'happy')
    else:
        v2_eye(hd, hxc - 16, hyc - 2, 8.4, 'open')
        v2_eye(hd, hxc + 16, hyc - 2, 8.4, 'open')
    v2_cheek(hd, hxc - hrx * 0.72, hyc + hry * 0.38, cheekR)
    v2_cheek(hd, hxc + hrx * 0.72, hyc + hry * 0.38, cheekR)
    hd.ell(hxc, hyc + 5, 2.2, 1.5, BLK)
    if pose == 'thunder':
        # wide open shout-grin (triumph, NOT a horror "O")
        hd.ell(hxc, hyc + 14, 8.5, 6.5, OUTL)
        hd.ell(hxc, hyc + 14, 7, 5.2, MOUTH)
        hd.ell(hxc, hyc + 16.5, 4.5, 2.4, TONGUE)
    elif happy:
        hd.line(hd.arc_pts(hxc, hyc + 12, 8, 5.5, 15, 165), OUTL, 2.6)
    else:
        hd.line(hd.arc_pts(hxc - 4.5, hyc + 12, 4.6, 3.4, 15, 165), OUTL, 2.4)
        hd.line(hd.arc_pts(hxc + 4.5, hyc + 12, 4.6, 3.4, 15, 165), OUTL, 2.4)

    # ── arms ──
    if armsUp:
        for sgn in (-1, 1):
            arm(hd, [(bx + sgn * brx * 0.72, by - bry * 0.45),
                     (bx + sgn * (brx * 0.72 + 12), by - bry - 24),
                     (bx + sgn * (brx * 0.72 + 16), by - bry - 38)], 9.5)
    elif pose in ('charge0', 'charge1'):
        for sgn in (-1, 1):   # arms braced back/down while crouching
            arm(hd, [(bx + sgn * brx * 0.78, by - bry * 0.3), (bx + sgn * brx * 0.9, by + 10)], 9)
    else:
        for sgn in (-1, 1):   # short arms angled outward-down, breaking the side
            arm(hd, [(bx + sgn * brx * 0.8, by - bry * 0.42), (bx + sgn * (brx + 3), by - bry * 0.02)], 9)

    # spark dots around the cheeks (charging)
    if pose in ('charge0', 'charge1'):
        n = 5 if pose == 'charge0' else 8
        for i in range(n):
            a = i * (2 * math.pi / n)
            rr = 22 + (i % 3) * 4
            for cx0 in (hxc - hrx * 0.72, hxc + hrx * 0.72):
                sx = cx0 + math.cos(a) * rr
                sy = hyc + hry * 0.38 + math.sin(a) * rr
                hd.poly([(sx - 2, sy), (sx, sy - 3), (sx + 2, sy), (sx, sy + 3)], SPARK)
    # thunderbolts around the frame (thunder pose)
    if pose == 'thunder':
        for bx0, by0, s in [(24, 38, 2.0), (126, 42, 2.0), (16, 96, 1.6), (134, 92, 1.6)]:
            bolt_glyph(hd, bx0, by0, s, BOLT)
            bolt_glyph(hd, bx0, by0, s * 0.5, WHT)
    if happy:
        for sx, sy, sr in [(28, 30, 4), (122, 28, 3), (114, 70, 2.5)]:
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
