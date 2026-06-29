"""Generate dragon.png + dragon.json sprite sheet (16-bit fidelity, RGBA transparent bg).
Run from timer/art-src/:  python gen_dragon.py
Outputs:  timer/assets/dragon.png + dragon.json

Theme: a majestic violet dragon asleep on a glittering gold hoard. Sneaky thieves
steal gold into a chest; at 0:00 the dragon wakes, rears, roars and breathes fire.

Frames (HARD contract with js/themes/dragon.js)
----------------------------------------------------------------------------------
dragon_sleep [  0,  0,152,112]  curled, eyes closed, head resting low-left
dragon_wake  [156,  0,152,112]  eye snapped open, head lifted
dragon_roar  [312,  0,152,112]  reared up, jaws wide, neck frill flared
fire0        [  0,116, 48, 30]  fire plume small  (mouth = RIGHT edge, blasts LEFT)
fire1        [ 52,116, 72, 42]  fire plume medium
fire2        [128,116, 96, 52]  fire plume large
chest        [232,116, 48, 34]  open treasure chest (empty; gold fill drawn in scene)
thief_walk0  [  0,170, 18, 24]  hooded thief, empty, step 0 (faces LEFT)
thief_walk1  [ 20,170, 18, 24]  hooded thief, empty, step 1
thief_loot0  [ 40,170, 18, 24]  hooded thief, bulging sack, step 0
thief_loot1  [ 60,170, 18, 24]  hooded thief, bulging sack, step 1
thief_flee   [ 80,170, 18, 24]  thief panicking, arms up (finale)
coin         [102,170, 12, 10]  single gold coin
gem          [116,170, 10, 12]  magenta gem
sparkle0     [128,170,  9,  9]  glitter twinkle small
sparkle1     [140,170,  9,  9]  glitter twinkle large
sparkle2     [152,170,  9,  9]  glitter twinkle medium
puff         [164,170, 18, 14]  smoke / dust puff
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save

SW, SH = 480, 200
img, d = new_sheet(SW, SH)

# ── Palette ──────────────────────────────────────────────────────────────────────
# Dragon body (violet 4-tone)
DG0 = (206, 160, 255, 255)   # light
DG1 = (150,  86, 222, 255)   # mid (body base)
DG2 = ( 96,  46, 156, 255)   # dark
DG3 = ( 58,  24, 100, 255)   # darkest
BL  = (228, 200, 255, 255)   # belly light
BLs = (176, 142, 224, 255)   # belly shade
# Wing membrane (magenta) + cyan ribs
WM  = (196,  74, 170, 255)
WMs = (132,  40, 118, 255)
# Frill / spikes (cyan)
CY  = (  0, 229, 255, 255)
CYd = (  0, 150, 190, 255)
CYh = (170, 250, 255, 255)
# Horns / teeth (bone)
BON = (236, 228, 204, 255)
BONd= (170, 158, 130, 255)
# Eye / mouth
EYG = (255, 221,  64, 255)
EYR = (235,  40,  44, 255)
LID = ( 74,  32, 116, 255)
MTH = (120,  10,  24, 255)   # mouth interior
TNG = (224,  72, 102, 255)   # tongue
BLK = ( 12,   6,  24, 255)
WHT = (255, 255, 255, 255)
# Gold
GD  = (255, 210,  80, 255); GDH = (255, 240, 170, 255)
GDD = (176, 128,  32, 255); GDS = (120,  84,  18, 255)
MG  = (255,  45, 180, 255)
# Fire
FW  = (255, 255, 235, 255); FY = (255, 224,  70, 255)
FO  = (255, 140,  30, 255); FR = (232,  46,  30, 255)
# Chest wood + metal
WD  = (120,  76,  40, 255); WDh = (162, 108,  60, 255); WDd = ( 74,  44,  20, 255)
MTL = (216, 180,  90, 255); MTLd= (150, 116,  40, 255)
CHI = ( 26,  16,  32, 255)   # chest interior dark
# Thief
TC  = ( 48,  44,  78, 255); TCh = ( 84,  78, 124, 255); TCd = ( 26,  22,  46, 255)
FACE= ( 40,  26,  40, 255)
SACK= (150, 112,  60, 255); SACKh=(192, 150,  92, 255); SACKd=( 96,  68,  32, 255)
# Smoke
SMK = (158, 148, 178, 255); SMKd= ( 98,  92, 124, 255)


def lc(a, b, t):
    return tuple(max(0, min(255, int(a[i] + (b[i] - a[i]) * t))) for i in range(4))

def R(x, y, w, h, c):
    if w <= 0 or h <= 0:
        return
    x2, y2 = min(x + w - 1, SW - 1), min(y + h - 1, SH - 1)
    if x > SW - 1 or y > SH - 1 or x2 < 0 or y2 < 0:
        return
    d.rectangle([max(x, 0), max(y, 0), x2, y2], fill=c)

def P(x, y, c):
    if 0 <= x < SW and 0 <= y < SH:
        img.putpixel((x, y), c)

def E(cx, cy, rx, ry, c):
    d.ellipse([int(cx - rx), int(cy - ry), int(cx + rx), int(cy + ry)], fill=c)

def poly(pts, c):
    d.polygon([(int(x), int(y)) for (x, y) in pts], fill=c)

def line(x0, y0, x1, y1, c, w=1):
    d.line([(int(x0), int(y0)), (int(x1), int(y1))], fill=c, width=w)

def blob(cx, cy, rx, ry, base, hi, sh):
    """Shaded organic blob: mid base, lower shadow, upper highlight."""
    E(cx, cy, rx, ry, base)
    E(cx, cy + ry * 0.30, rx * 0.82, ry * 0.66, sh)
    E(cx, cy - ry * 0.42, rx * 0.64, ry * 0.50, hi)


# ═══════════════════════════════════════════════════════════════════════════════
#  DRAGON   (152 x 112 box, baseline = oy+104, faces LEFT)
# ═══════════════════════════════════════════════════════════════════════════════

def d_eye(ex, ey, blaze=False):
    E(ex, ey, 4, 4, (255, 170, 36, 255) if blaze else (210, 150, 40, 255))
    E(ex, ey, 3, 3, EYG)
    R(ex - 1, ey - 3, 2, 6, EYR if blaze else BLK)   # vertical slit pupil
    P(ex - 2, ey - 2, WHT)

def d_horns(hx, hy):
    poly([(hx + 6, hy - 6), (hx + 19, hy - 19), (hx + 11, hy - 3)], BON)
    poly([(hx + 9, hy - 7), (hx + 20, hy - 16), (hx + 13, hy - 4)], BONd)
    poly([(hx + 1, hy - 8), (hx + 8, hy - 21), (hx + 6, hy - 6)], BON)
    poly([(hx + 3, hy - 8), (hx + 9, hy - 19), (hx + 7, hy - 6)], BONd)

def dragon_body(ox, oy):
    BB = oy + 104

    # Tail coil (right), curling up-inward
    for (cx, cy, r) in [(ox + 130, oy + 86, 15), (ox + 142, oy + 70, 12),
                        (ox + 138, oy + 52, 9), (ox + 126, oy + 44, 7)]:
        blob(cx, cy, r, r, DG1, DG0, DG2)
    poly([(ox + 120, oy + 46), (ox + 108, oy + 30), (ox + 124, oy + 40)], DG2)
    poly([(ox + 120, oy + 46), (ox + 113, oy + 34), (ox + 122, oy + 41)], DG1)

    # Main back / haunch + shoulder mass
    blob(ox + 92, oy + 72, 46, 30, DG1, DG0, DG2)
    blob(ox + 58, oy + 78, 26, 24, DG1, DG0, DG2)

    # Belly (light) along bottom front
    E(ox + 68, oy + 92, 28, 14, BLs)
    E(ox + 68, oy + 93, 24, 12, BL)
    for by in range(oy + 86, BB - 2, 5):
        R(ox + 50, by, 36, 1, BLs)

    # Hind leg + clawed foot
    blob(ox + 108, oy + 90, 15, 13, DG2, DG1, DG3)
    R(ox + 102, oy + 96, 16, 10, DG2)
    R(ox + 102, oy + 96, 16, 2, DG1)
    R(ox + 98, BB - 4, 24, 5, DG3)
    for ci in range(4):
        poly([(ox + 100 + ci * 6, BB - 1), (ox + 103 + ci * 6, BB + 4), (ox + 106 + ci * 6, BB - 1)], BON)

    # Foreleg + clawed foot
    blob(ox + 58, oy + 92, 11, 12, DG2, DG1, DG3)
    R(ox + 52, oy + 96, 13, 10, DG2)
    R(ox + 48, BB - 3, 22, 4, DG3)
    for ci in range(4):
        poly([(ox + 50 + ci * 5, BB), (ox + 52 + ci * 5, BB + 4), (ox + 54 + ci * 5, BB)], BON)

    # Folded wing over the back
    line(ox + 64, oy + 60, ox + 104, oy + 46, DG3, 4)
    poly([(ox + 64, oy + 60), (ox + 104, oy + 46), (ox + 110, oy + 66),
          (ox + 92, oy + 73), (ox + 78, oy + 71), (ox + 66, oy + 66)], WM)
    poly([(ox + 68, oy + 61), (ox + 102, oy + 49), (ox + 105, oy + 63),
          (ox + 90, oy + 68), (ox + 78, oy + 67), (ox + 69, oy + 64)], WMs)
    for fx, fy in [(110, 66), (98, 72), (86, 71), (74, 68)]:
        line(ox + 104, oy + 46, ox + fx, oy + fy, CYd, 1)
    poly([(ox + 104, oy + 44), (ox + 111, oy + 37), (ox + 106, oy + 47)], BON)

    # Spinal frill (cyan spikes along back ridge)
    for (sx, sy, hgt) in [(72, 46, 11), (84, 44, 13), (96, 45, 12), (108, 49, 10), (120, 56, 8)]:
        poly([(ox + sx - 5, oy + sy), (ox + sx, oy + sy - hgt), (ox + sx + 5, oy + sy)], CYd)
        poly([(ox + sx - 3, oy + sy), (ox + sx, oy + sy - hgt + 2), (ox + sx + 2, oy + sy)], CY)
    return BB

def dragon_head(ox, oy, pose):
    sx, sy = ox + 54, oy + 66    # shoulder anchor

    if pose == 'sleep':
        hx, hy = ox + 24, oy + 86
        for t in (0.0, 0.34, 0.68):
            nx = sx + (hx - sx) * t; ny = sy + (hy - sy) * t
            blob(nx, ny, 12 - 2 * t, 11 - 2 * t, DG1, DG0, DG2)
        blob(hx, hy, 15, 12, DG1, DG0, DG2)
        poly([(hx - 15, hy + 3), (hx - 2, hy - 5), (hx - 2, hy + 9)], DG1)
        poly([(hx - 14, hy + 3), (hx - 3, hy - 2), (hx - 3, hy + 7)], DG2)
        R(hx - 12, hy + 1, 2, 2, DG3)                 # nostril
        line(hx - 13, hy + 6, hx - 2, hy + 6, DG3, 1)  # closed mouth
        d.arc([hx - 4, hy - 6, hx + 8, hy + 2], 200, 340, fill=LID, width=2)  # closed lid
        line(hx + 1, hy - 3, hx + 6, hy - 3, LID, 1)
        d_horns(hx, hy)
        poly([(hx + 7, hy - 1), (hx + 16, hy - 3), (hx + 8, hy + 4)], CYd)   # ear frill

    elif pose == 'wake':
        hx, hy = ox + 30, oy + 42
        for t in (0.0, 0.3, 0.6, 0.85):
            nx = sx + (hx - sx) * t; ny = sy + (hy - sy) * t
            blob(nx, ny, 12 - 4 * t, 12 - 3 * t, DG1, DG0, DG2)
        blob(hx, hy, 15, 12, DG1, DG0, DG2)
        poly([(hx - 16, hy), (hx - 1, hy - 7), (hx - 1, hy + 7)], DG1)
        poly([(hx - 15, hy), (hx - 2, hy - 4), (hx - 2, hy + 5)], DG2)
        R(hx - 13, hy - 2, 2, 2, DG3)
        line(hx - 15, hy + 4, hx - 2, hy + 4, DG3, 1)
        d_eye(hx + 2, hy - 3)
        d_horns(hx, hy)
        poly([(hx + 7, hy + 1), (hx + 16, hy - 1), (hx + 8, hy + 6)], CYd)

    else:  # roar
        hx, hy = ox + 34, oy + 22
        for t in (0.0, 0.26, 0.5, 0.72, 0.9):
            nx = sx + (hx - sx) * t; ny = sy + (hy - sy) * t
            blob(nx, ny, 13 - 5 * t, 12 - 3 * t, DG1, DG0, DG2)
        # neck frill spikes
        for t in (0.32, 0.56, 0.8):
            nx = sx + (hx - sx) * t; ny = sy + (hy - sy) * t
            poly([(nx + 6, ny - 1), (nx + 16, ny - 8), (nx + 7, ny + 5)], CY)
            poly([(nx + 6, ny - 1), (nx + 13, ny - 6), (nx + 7, ny + 4)], CYh)
        blob(hx, hy, 15, 12, DG1, DG0, DG2)
        # open mouth interior (red)
        poly([(hx - 17, hy - 4), (hx - 2, hy - 2), (hx - 2, hy + 11), (hx - 12, hy + 12)], MTH)
        # upper jaw / snout
        poly([(hx - 17, hy - 6), (hx - 2, hy - 9), (hx - 2, hy - 1)], DG1)
        poly([(hx - 16, hy - 6), (hx - 3, hy - 7), (hx - 3, hy - 2)], DG2)
        # lower jaw dropped
        poly([(hx - 14, hy + 11), (hx - 2, hy + 9), (hx - 1, hy + 15), (hx - 12, hy + 16)], DG2)
        poly([(hx - 13, hy + 11), (hx - 3, hy + 10), (hx - 2, hy + 14), (hx - 11, hy + 15)], DG1)
        # tongue
        R(hx - 11, hy + 5, 6, 2, TNG)
        R(hx - 13, hy + 4, 3, 3, TNG)
        # teeth
        for ti in range(4):
            poly([(hx - 15 + ti * 4, hy - 2), (hx - 13 + ti * 4, hy + 2), (hx - 11 + ti * 4, hy - 2)], BON)
            poly([(hx - 13 + ti * 4, hy + 12), (hx - 11 + ti * 4, hy + 8), (hx - 9 + ti * 4, hy + 12)], BON)
        R(hx - 13, hy - 6, 3, 2, DG3)    # nostril flare
        d_eye(hx + 3, hy - 4, blaze=True)
        d_horns(hx, hy)

def draw_dragon(ox, oy, pose):
    dragon_body(ox, oy)
    dragon_head(ox, oy, pose)

draw_dragon(0,   0, 'sleep'); frames = {'dragon_sleep': [0,   0, 152, 112]}
draw_dragon(156, 0, 'wake');  frames['dragon_wake'] = [156, 0, 152, 112]
draw_dragon(312, 0, 'roar');  frames['dragon_roar'] = [312, 0, 152, 112]


# ═══════════════════════════════════════════════════════════════════════════════
#  FIRE   (mouth = RIGHT edge, plume blasts LEFT)
# ═══════════════════════════════════════════════════════════════════════════════
def fire(ox, oy, w, h):
    cy = oy + h // 2
    mx = ox + w - 1                      # mouth (right)
    # outer red flame body widening then tapering to flickering tip on the left
    poly([(mx, cy - 3), (ox + int(w * 0.55), cy - h // 2), (ox + 2, cy - h // 5),
          (ox, cy), (ox + 2, cy + h // 5), (ox + int(w * 0.55), cy + h // 2), (mx, cy + 3)], FR)
    poly([(mx, cy - 2), (ox + int(w * 0.58), cy - h // 3), (ox + int(w * 0.14), cy),
          (ox + int(w * 0.58), cy + h // 3), (mx, cy + 2)], FO)
    poly([(mx, cy - 1), (ox + int(w * 0.62), cy - h // 6), (ox + int(w * 0.30), cy),
          (ox + int(w * 0.62), cy + h // 6), (mx, cy + 1)], FY)
    E(mx - 6, cy, 6, max(3, h // 8), FW)   # white-hot core at mouth
    return [ox, oy, w, h]

frames['fire0'] = fire(0,   116, 48, 30)
frames['fire1'] = fire(52,  116, 72, 42)
frames['fire2'] = fire(128, 116, 96, 52)


# ═══════════════════════════════════════════════════════════════════════════════
#  CHEST  (open, empty; scene draws the rising gold fill)
# ═══════════════════════════════════════════════════════════════════════════════
def chest(ox, oy):
    # Open lid (tilted back, behind body)
    poly([(ox + 4, oy + 11), (ox + 9, oy), (ox + 39, oy), (ox + 44, oy + 11)], WDd)
    R(ox + 8, oy + 1, 30, 4, WDh)
    R(ox + 6, oy + 9, 36, 2, MTLd)
    # Body box
    R(ox + 2, oy + 13, 44, 20, WD)
    R(ox + 2, oy + 13, 44, 2, WDh)
    R(ox + 2, oy + 31, 44, 2, WDd)
    # Interior
    R(ox + 5, oy + 15, 38, 16, CHI)
    # Vertical metal bands
    for bx in (ox + 2, ox + 22, ox + 43):
        R(bx, oy + 13, 3, 20, MTL)
        R(bx, oy + 13, 3, 1, GDH)
    # Lock
    R(ox + 20, oy + 22, 5, 6, MTLd)
    R(ox + 21, oy + 23, 3, 2, GDH)
    return [ox, oy, 48, 34]

frames['chest'] = chest(232, 116)


# ═══════════════════════════════════════════════════════════════════════════════
#  THIEF  (18 x 24 box, baseline = oy+23, faces LEFT)
# ═══════════════════════════════════════════════════════════════════════════════
def thief(ox, oy, step=0, sack=False, flee=False):
    by = oy + 23
    # Cloak body (hooded, hunched)
    poly([(ox + 4, oy + 6), (ox + 14, oy + 6), (ox + 16, by - 4), (ox + 2, by - 4)], TC)
    R(ox + 3, oy + 7, 12, 12, TC)
    R(ox + 3, oy + 7, 2, 12, TCh)         # left edge highlight
    R(ox + 13, oy + 7, 2, 12, TCd)        # right shadow
    # Hood
    poly([(ox + 3, oy + 7), (ox + 6, oy + 1), (ox + 12, oy + 1), (ox + 15, oy + 7)], TC)
    poly([(ox + 4, oy + 6), (ox + 7, oy + 2), (ox + 11, oy + 2), (ox + 12, oy + 5)], TCh)
    R(ox + 4, oy + 5, 7, 4, FACE)         # shadowed face opening (faces left)
    P(ox + 5, oy + 6, CY)                  # glinting eye
    if flee:
        # Arms thrown up
        R(ox + 1, oy + 1, 2, 6, TC)
        R(ox + 14, oy + 1, 2, 6, TC)
        R(ox, oy, 3, 2, FACE); R(ox + 15, oy, 3, 2, FACE)
    elif sack:
        # Bulging sack over the shoulder
        E(ox + 13, oy + 9, 6, 6, SACK)
        E(ox + 12, oy + 8, 4, 4, SACKh)
        R(ox + 12, oy + 3, 4, 3, SACKd)   # tied neck
        R(ox + 11, oy + 11, 3, 4, TC)     # arm holding it
    else:
        R(ox + 12, oy + 10, 3, 6, TC)     # arm at side
    # Legs (walk cycle)
    if step == 0:
        R(ox + 4, by - 5, 4, 6, TCd); R(ox + 10, by - 4, 4, 5, TCd)
        R(ox + 3, by - 1, 5, 2, BLK);  R(ox + 10, by, 5, 2, BLK)
    else:
        R(ox + 5, by - 4, 4, 5, TCd); R(ox + 9, by - 5, 4, 6, TCd)
        R(ox + 4, by, 5, 2, BLK);     R(ox + 9, by - 1, 5, 2, BLK)
    return [ox, oy, 18, 24]

frames['thief_walk0'] = thief(0,  170, step=0)
frames['thief_walk1'] = thief(20, 170, step=1)
frames['thief_loot0'] = thief(40, 170, step=0, sack=True)
frames['thief_loot1'] = thief(60, 170, step=1, sack=True)
frames['thief_flee']  = thief(80, 170, step=1, flee=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  TREASURE BITS
# ═══════════════════════════════════════════════════════════════════════════════
def coin(ox, oy):
    E(ox + 5, oy + 5, 6, 5, GDD)
    E(ox + 5, oy + 4, 5, 4, GD)
    E(ox + 4, oy + 3, 2, 2, GDH)
    R(ox + 4, oy + 3, 3, 3, GDD)
    return [ox, oy, 12, 10]
frames['coin'] = coin(102, 170)

def gem(ox, oy):
    poly([(ox + 5, oy), (ox + 9, oy + 5), (ox + 5, oy + 11), (ox + 1, oy + 5)], MG)
    poly([(ox + 5, oy + 1), (ox + 7, oy + 5), (ox + 5, oy + 8), (ox + 3, oy + 5)], (255, 150, 220, 255))
    P(ox + 4, oy + 2, WHT)
    return [ox, oy, 10, 12]
frames['gem'] = gem(116, 170)

def sparkle(ox, oy, r):
    cx, cy = ox + 4, oy + 4
    R(cx, cy - r, 1, 2 * r + 1, WHT)
    R(cx - r, cy, 2 * r + 1, 1, WHT)
    if r >= 2:
        P(cx - 1, cy - 1, FY); P(cx + 1, cy + 1, FY)
        P(cx + 1, cy - 1, FY); P(cx - 1, cy + 1, FY)
    P(cx, cy, FW)
    return [ox, oy, 9, 9]
frames['sparkle0'] = sparkle(128, 170, 1)
frames['sparkle1'] = sparkle(140, 170, 4)
frames['sparkle2'] = sparkle(152, 170, 2)

def puff(ox, oy):
    for (cx, cy, r) in [(ox + 6, oy + 9, 5), (ox + 11, oy + 7, 5), (ox + 14, oy + 10, 4)]:
        E(cx, cy, r, r, SMKd)
    for (cx, cy, r) in [(ox + 6, oy + 8, 4), (ox + 11, oy + 6, 4), (ox + 13, oy + 9, 3)]:
        E(cx, cy, r, r, SMK)
    return [ox, oy, 18, 14]
frames['puff'] = puff(164, 170)


# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'dragon')
print("Frames generated:")
for name, (x, y, w, h) in sorted(frames.items()):
    print(f"  {name:13s} [{x:3d},{y:3d},{w:3d},{h:3d}]")
