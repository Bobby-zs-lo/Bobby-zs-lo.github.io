"""Generate dragon.png + dragon.json sprite sheet (16-bit fidelity, RGBA transparent bg).
Run from timer/art-src/:  python gen_dragon.py
Outputs:  timer/assets/dragon.png + dragon.json

Theme: a fierce RED dragon asleep on a glittering gold hoard. Sneaky thieves
steal gold into a chest; at 0:00 the dragon wakes, rears, roars and breathes a
huge fire plume that roasts the fleeing thieves. Drawn in a chunky 16-bit pixel
style (blocky shaded masses, hard edges) — NOT smooth ellipses.

Frames (HARD contract with js/themes/dragon.js)
----------------------------------------------------------------------------------
dragon_sleep [  0,  0,152,112]  curled, eyes closed, head resting low-left
dragon_wake  [156,  0,152,112]  eye snapped open, head lifted
dragon_roar  [312,  0,152,112]  reared up, jaws wide, neck frill flared
fire0        [  0,120, 64, 40]  fire plume ignite    (mouth = RIGHT edge, blasts LEFT)
fire1        [ 70,120,100, 58]  fire plume medium
fire2        [176,120,140, 78]  fire plume large
fire3        [322,120,176, 96]  fire plume HUGE (climax)
chest        [  0,224, 48, 34]  open treasure chest (empty; gold fill drawn in scene)
thief_walk0  [ 54,224, 18, 24]  hooded thief, empty, step 0 (faces LEFT)
thief_walk1  [ 74,224, 18, 24]  hooded thief, empty, step 1
thief_loot0  [ 94,224, 18, 24]  hooded thief, bulging sack, step 0
thief_loot1  [114,224, 18, 24]  hooded thief, bulging sack, step 1
thief_flee   [134,224, 18, 24]  thief panicking, arms up (finale)
thief_char   [154,224, 18, 24]  thief charred/roasted by the fire (finale)
coin         [176,226, 12, 10]  single gold coin
gem          [192,224, 10, 12]  magenta gem
sparkle0     [206,224,  9,  9]  glitter twinkle small
sparkle1     [218,224,  9,  9]  glitter twinkle large
sparkle2     [230,224,  9,  9]  glitter twinkle medium
puff         [244,224, 18, 14]  smoke / dust puff
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save

SW, SH = 512, 264
img, d = new_sheet(SW, SH)

# ── Palette ──────────────────────────────────────────────────────────────────────
# Dragon body (RED, 4-tone)
RD0 = (255,  96,  72, 255)   # light scarlet highlight
RD1 = (214,  40,  42, 255)   # mid scarlet (body base)
RD2 = (150,  24,  36, 255)   # dark crimson
RD3 = ( 92,  14,  28, 255)   # darkest crimson
# Belly (warm cream)
BLY = (244, 198, 140, 255)
BLYs= (206, 150,  96, 255)
# Cream / pale-gold horns, spines, frills, teeth, claws
CRM = (244, 232, 190, 255)
CRMs= (206, 184, 124, 255)   # pale gold shade
CRMd= (150, 126,  78, 255)
# Wing membrane (dark red) + bone struts (lighter red)
WMB = (118,  22,  32, 255)   # membrane dark
WMBh= (170,  40,  46, 255)   # membrane lighter (toward edge)
WBN = (208,  64,  54, 255)   # wing bone / strut
WBNd= ( 84,  16,  26, 255)
# Eye / mouth
EYG = (255, 214,  80, 255)   # eye yellow
EYO = (255, 150,  30, 255)   # eye blaze orange
PUP = ( 18,   8,  16, 255)   # slit pupil
MTH = ( 96,  12,  22, 255)   # mouth interior
TNG = (224,  80,  92, 255)   # tongue
BLK = ( 14,   7,  20, 255)
WHT = (255, 255, 255, 255)
# Gold (matches scene C.gold*)
GD  = (255, 210,  80, 255); GDH = (255, 240, 170, 255)
GDD = (176, 128,  32, 255); GDS = (120,  84,  18, 255)
MG  = (255,  45, 180, 255)
# Fire
FW  = (255, 255, 235, 255); FY = (255, 224,  70, 255)
FO  = (255, 140,  30, 255); FR = (232,  46,  30, 255)
# Chest wood + metal
WD  = (120,  76,  40, 255); WDh = (162, 108,  60, 255); WDd = ( 74,  44,  20, 255)
MTL = (216, 180,  90, 255); MTLd= (150, 116,  40, 255)
CHI = ( 26,  16,  32, 255)
# Thief
TC  = ( 48,  44,  78, 255); TCh = ( 84,  78, 124, 255); TCd = ( 26,  22,  46, 255)
FACE= ( 40,  26,  40, 255); CYE = (  0, 229, 255, 255)
SACK= (150, 112,  60, 255); SACKh=(192, 150,  92, 255); SACKd=( 96,  68,  32, 255)
# Smoke / char
SMK = (158, 148, 178, 255); SMKd= ( 98,  92, 124, 255)
CHAR= ( 40,  28,  32, 255); CHARh=( 70,  44,  36, 255)


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


# ═══════════════════════════════════════════════════════════════════════════════
#  DRAGON   (152 x 112 box, baseline = oy+104, faces LEFT, curled over the hoard)
#  Chunky shaded masses: dark base poly, mid poly inset from bottom, top highlight.
# ═══════════════════════════════════════════════════════════════════════════════

# Curled body silhouette (back arches center-right, haunch right, chest/neck left).
BODY    = [(46,73),(49,61),(58,52),(76,46),(96,44),(113,47),(127,55),
           (137,67),(142,81),(140,93),(131,102),(110,106),(84,107),(62,106),
           (49,103),(43,92),(42,80)]
BODY_MID= [(46,72),(49,60),(58,51),(76,45),(96,43),(113,46),(127,54),
           (137,66),(141,80),(138,90),(129,98),(110,100),(84,101),(62,100),
           (49,98),(44,90),(43,79)]
BODY_HI = [(50,60),(58,52),(76,46),(96,44),(113,47),(127,55),(132,62),
           (118,57),(100,51),(80,52),(62,57),(53,64)]
BELLY   = [(48,90),(60,84),(82,87),(102,90),(98,101),(70,103),(52,99)]

# Folded bat wing over the back.
WING_MB  = [(60,61),(78,49),(98,42),(112,44),(120,52),
            (116,63),(104,68),(92,71),(78,71),(66,67)]
WING_MBh = [(66,61),(82,53),(98,49),(110,51),(115,58),
            (108,63),(96,66),(82,67),(70,65)]
WING_TIPS= [(118,61),(106,67),(92,71),(78,71)]      # finger ends (claws)

# Cream spine row along the back ridge.
SPINES   = [(58,54),(70,48),(84,45),(98,45),(112,49),(124,57)]

# Tail coil (right), curling up-inward.
TAIL     = [(134,88),(146,82),(151,68),(148,54),(139,45),(129,46),
            (133,55),(141,66),(139,77),(131,82)]


def draw_dragon(ox, oy, pose):
    def Po(pts, c): poly([(ox + x, oy + y) for x, y in pts], c)
    def Re(x, y, w, h, c): R(ox + x, oy + y, w, h, c)
    def Pi(x, y, c): P(ox + x, oy + y, c)
    def El(cx, cy, rx, ry, c): E(ox + cx, oy + cy, rx, ry, c)
    def Li(x0, y0, x1, y1, c, w=1): line(ox + x0, oy + y0, ox + x1, oy + y1, c, w)

    # ── Tail (behind body) ────────────────────────────────────────────────────
    Po(TAIL, RD1)
    Po([(134,88),(146,82),(150,70),(140,74),(133,82)], RD2)        # lower shade
    Po([(129,46),(120,33),(127,49)], CRMs)                          # spade tip back
    Po([(130,47),(122,36),(127,48)], CRM)
    for (tx, ty) in [(150,60),(146,50)]:                            # tail edge spines
        Po([(tx,ty),(tx+7,ty-7),(tx+2,ty+2)], CRMs)

    # ── Body mass (chunky shaded) ─────────────────────────────────────────────
    Po(BODY, RD2)                                                   # shadow base
    Po(BODY_MID, RD1)                                               # mid body
    Po(BODY_HI, RD0)                                                # top highlight
    # Belly
    Po(BELLY, BLY)
    for yy in range(88, 101, 4):
        Re(54, yy, 42, 1, BLYs)

    # ── Legs + claws ──────────────────────────────────────────────────────────
    # Hind leg (right)
    Re(104, 86, 18, 18, RD2); Re(104, 86, 18, 3, RD1)
    Re(100, 100, 26, 5, RD3)
    for ci in range(4):
        Po([(100+ci*6,104),(103+ci*6,109),(106+ci*6,104)], CRM)
    # Foreleg (front, left)
    Re(54, 90, 12, 15, RD2); Re(54, 90, 12, 2, RD1)
    Re(50, 101, 20, 4, RD3)
    for ci in range(4):
        Po([(50+ci*5,104),(52+ci*5,109),(54+ci*5,104)], CRM)

    # ── Folded wing over the back ─────────────────────────────────────────────
    Li(60, 61, 112, 44, WBNd, 4)                                   # arm bone shadow
    Po(WING_MB, WMB)
    Po(WING_MBh, WMBh)
    Li(60, 61, 112, 44, WBN, 2)                                    # arm bone
    for (fx, fy) in WING_TIPS:
        Li(112, 44, fx, fy, WBN, 1)
        Po([(fx-1,fy-1),(fx+2,fy-3),(fx+1,fy+2)], CRMs)           # finger claw

    # ── Cream spine row (over the wing) ───────────────────────────────────────
    for (sx, sy) in SPINES:
        Po([(sx-4,sy),(sx,sy-9),(sx+4,sy)], CRMs)
        Po([(sx-2,sy),(sx,sy-6),(sx+2,sy)], CRM)

    # ── Horns (cream, swept up-and-back), shared helper ───────────────────────
    def horns(hx, hy):
        Po([(hx+2,hy-1),(hx+19,hy-19),(hx+24,hy-14),(hx+8,hy+2)], CRMs)
        Po([(hx+3,hy-2),(hx+17,hy-17),(hx+21,hy-13),(hx+8,hy)], CRM)
        Po([(hx-4,hy-2),(hx+8,hy-22),(hx+13,hy-18),(hx+2,hy+1)], CRMs)
        Po([(hx-3,hy-3),(hx+7,hy-20),(hx+11,hy-17),(hx+2,hy)], CRM)

    def eye(ex, ey, blaze=False):
        El(ex, ey, 5, 4, RD3)
        Re(ex-3, ey-3, 7, 6, EYO if blaze else EYG)
        Re(ex-3, ey-3, 7, 1, (255,242,170,255))
        Re(ex, ey-3, 2, 6, PUP)                                   # vertical slit
        Pi(ex-2, ey-2, WHT)                                       # white glint

    # ══════════════════════════════════════════════════════════════════════════
    if pose == 'sleep':
        # Neck sweeping down-left, head resting low.
        Po([(54,57),(62,69),(44,86),(28,91),(20,87),(36,72),(50,59)], RD1)
        Po([(40,86),(28,91),(22,88),(34,80)], RD2)               # under-neck shade
        # Head (chunky, snout to the left)
        Re(14, 78, 26, 19, RD1)
        Re(14, 78, 26, 3, RD0)
        Re(14, 93, 26, 4, RD2)
        Po([(14,82),(3,90),(14,97)], RD1)                         # snout
        Po([(14,85),(7,90),(14,95)], RD2)
        Re(6, 88, 2, 2, RD3)                                      # nostril
        Li(5, 92, 30, 92, RD3, 1)                                 # closed mouth
        Li(19, 85, 31, 85, CRMd, 1)                               # closed eye lid
        Li(20, 84, 28, 84, RD3, 1)
        Po([(34,86),(45,82),(36,93)], CRMs)                       # cheek frill
        horns(30, 80)

    elif pose == 'wake':
        # Neck more upright, head lifted, eye snapped open.
        Po([(52,57),(63,66),(46,46),(32,44),(26,50),(44,64),(54,61)], RD1)
        Po([(46,46),(32,44),(28,49),(40,55)], RD2)
        Re(18, 40, 26, 20, RD1)
        Re(18, 40, 26, 3, RD0)
        Re(18, 55, 26, 4, RD2)
        Po([(18,44),(7,52),(18,59)], RD1)                         # snout
        Po([(18,47),(11,52),(18,57)], RD2)
        Re(9, 50, 2, 2, RD3)                                      # nostril
        Li(8, 55, 34, 55, RD3, 1)                                 # mouth line
        Po([(34,48),(45,44),(36,55)], CRMs)                       # cheek frill
        eye(31, 48)
        horns(34, 42)

    else:  # roar
        # Tall neck reared up; flared cream frill; jaws WIDE open to the LEFT.
        Po([(52,58),(64,66),(48,30),(36,24),(28,30),(44,60),(54,61)], RD1)
        Po([(48,30),(36,24),(30,29),(42,40)], RD2)
        # Flared neck frill (cream spikes pointing back)
        for t in (0.30, 0.50, 0.70):
            nx = 56 + (38 - 56) * t; ny = 62 + (20 - 62) * t
            Po([(nx+5,ny+1),(nx+16,ny-7),(nx+6,ny+6)], CRMs)
            Po([(nx+5,ny),(nx+13,ny-5),(nx+6,ny+5)], CRM)
        # Head block
        Re(20, 12, 24, 16, RD1)
        Re(20, 12, 24, 3, RD0)
        # Open mouth interior (dark red)
        Po([(15,24),(40,21),(41,33),(18,35)], MTH)
        # Upper jaw / snout
        Po([(16,18),(41,14),(44,23),(19,26)], RD1)
        Po([(16,19),(40,16),(42,22),(19,25)], RD2)
        # Lower jaw dropped
        Po([(18,31),(42,30),(44,38),(20,40)], RD2)
        Po([(19,32),(41,31),(43,37),(21,39)], RD1)
        # Tongue
        Re(20, 29, 9, 3, TNG); Re(17, 28, 4, 3, TNG)
        # Teeth (cream)
        for ti in range(4):
            Po([(20+ti*5,26),(22+ti*5,30),(24+ti*5,26)], CRM)     # upper
            Po([(22+ti*5,31),(24+ti*5,27),(26+ti*5,31)], CRM)     # lower
        Re(17, 19, 2, 2, RD3)                                     # nostril flare
        eye(34, 18, blaze=True)
        horns(38, 14)


draw_dragon(0,   0, 'sleep'); frames = {'dragon_sleep': [0,   0, 152, 112]}
draw_dragon(156, 0, 'wake');  frames['dragon_wake'] = [156, 0, 152, 112]
draw_dragon(312, 0, 'roar');  frames['dragon_roar'] = [312, 0, 152, 112]


# ═══════════════════════════════════════════════════════════════════════════════
#  FIRE   (mouth = RIGHT edge, plume blasts LEFT) — big, flame-like, jagged tongues
# ═══════════════════════════════════════════════════════════════════════════════
def fire(ox, oy, w, h):
    cy = oy + h // 2
    mx = ox + w - 1                                  # mouth (right)
    # Outer red flame body with jagged tongues tapering to flicker tips on the left
    poly([(mx, cy-4), (ox+int(w*0.62), cy-h//2), (ox+int(w*0.40), cy-h//3),
          (ox+int(w*0.26), cy-h//2), (ox+int(w*0.14), cy-h//5), (ox+4, cy-3),
          (ox, cy), (ox+4, cy+3), (ox+int(w*0.14), cy+h//5),
          (ox+int(w*0.26), cy+h//2), (ox+int(w*0.40), cy+h//3),
          (ox+int(w*0.62), cy+h//2), (mx, cy+4)], FR)
    # Mid orange
    poly([(mx, cy-3), (ox+int(w*0.64), cy-h//3), (ox+int(w*0.40), cy-h//5),
          (ox+int(w*0.22), cy-h//4), (ox+int(w*0.12), cy),
          (ox+int(w*0.22), cy+h//4), (ox+int(w*0.40), cy+h//5),
          (ox+int(w*0.64), cy+h//3), (mx, cy+3)], FO)
    # Inner yellow
    poly([(mx, cy-2), (ox+int(w*0.68), cy-h//6), (ox+int(w*0.34), cy),
          (ox+int(w*0.68), cy+h//6), (mx, cy+2)], FY)
    # White-hot core at the mouth
    E(mx-int(w*0.13), cy, max(4, int(w*0.11)), max(3, h//7), FW)
    # Ember flecks riding the plume
    n = max(4, w // 12)
    for i in range(n):
        ex = ox + int(w * 0.08) + i * (w // (n + 1))
        ey = cy + ((i * 53) % h) - h // 2
        P(ex, ey, FY); P(ex+1, ey, FW)
    return [ox, oy, w, h]

frames['fire0'] = fire(0,   120,  64, 40)
frames['fire1'] = fire(70,  120, 100, 58)
frames['fire2'] = fire(176, 120, 140, 78)
frames['fire3'] = fire(322, 120, 176, 96)


# ═══════════════════════════════════════════════════════════════════════════════
#  CHEST  (open, empty; scene draws the rising gold fill)
# ═══════════════════════════════════════════════════════════════════════════════
def chest(ox, oy):
    poly([(ox+4, oy+11), (ox+9, oy), (ox+39, oy), (ox+44, oy+11)], WDd)
    R(ox+8, oy+1, 30, 4, WDh)
    R(ox+6, oy+9, 36, 2, MTLd)
    R(ox+2, oy+13, 44, 20, WD)
    R(ox+2, oy+13, 44, 2, WDh)
    R(ox+2, oy+31, 44, 2, WDd)
    R(ox+5, oy+15, 38, 16, CHI)
    for bx in (ox+2, ox+22, ox+43):
        R(bx, oy+13, 3, 20, MTL)
        R(bx, oy+13, 3, 1, GDH)
    R(ox+20, oy+22, 5, 6, MTLd)
    R(ox+21, oy+23, 3, 2, GDH)
    return [ox, oy, 48, 34]

frames['chest'] = chest(0, 224)


# ═══════════════════════════════════════════════════════════════════════════════
#  THIEF  (18 x 24 box, baseline = oy+23, faces LEFT)
# ═══════════════════════════════════════════════════════════════════════════════
def thief(ox, oy, step=0, sack=False, flee=False):
    by = oy + 23
    poly([(ox+4, oy+6), (ox+14, oy+6), (ox+16, by-4), (ox+2, by-4)], TC)
    R(ox+3, oy+7, 12, 12, TC)
    R(ox+3, oy+7, 2, 12, TCh)
    R(ox+13, oy+7, 2, 12, TCd)
    poly([(ox+3, oy+7), (ox+6, oy+1), (ox+12, oy+1), (ox+15, oy+7)], TC)
    poly([(ox+4, oy+6), (ox+7, oy+2), (ox+11, oy+2), (ox+12, oy+5)], TCh)
    R(ox+4, oy+5, 7, 4, FACE)
    P(ox+5, oy+6, CYE)
    if flee:
        R(ox+1, oy+1, 2, 6, TC)
        R(ox+14, oy+1, 2, 6, TC)
        R(ox, oy, 3, 2, FACE); R(ox+15, oy, 3, 2, FACE)
    elif sack:
        E(ox+13, oy+9, 6, 6, SACK)
        E(ox+12, oy+8, 4, 4, SACKh)
        R(ox+12, oy+3, 4, 3, SACKd)
        R(ox+11, oy+11, 3, 4, TC)
    else:
        R(ox+12, oy+10, 3, 6, TC)
    if step == 0:
        R(ox+4, by-5, 4, 6, TCd); R(ox+10, by-4, 4, 5, TCd)
        R(ox+3, by-1, 5, 2, BLK);  R(ox+10, by, 5, 2, BLK)
    else:
        R(ox+5, by-4, 4, 5, TCd); R(ox+9, by-5, 4, 6, TCd)
        R(ox+4, by, 5, 2, BLK);     R(ox+9, by-1, 5, 2, BLK)
    return [ox, oy, 18, 24]

frames['thief_walk0'] = thief(54, 224, step=0)
frames['thief_walk1'] = thief(74, 224, step=1)
frames['thief_loot0'] = thief(94, 224, step=0, sack=True)
frames['thief_loot1'] = thief(114, 224, step=1, sack=True)
frames['thief_flee']  = thief(134, 224, step=1, flee=True)


def thief_char(ox, oy):
    """Charred, crumpling thief with ember glints + smoke wisp (roasted finale)."""
    by = oy + 23
    poly([(ox+4, oy+8), (ox+14, oy+8), (ox+15, by-3), (ox+3, by-3)], BLK)
    R(ox+4, oy+9, 10, 11, CHAR)
    R(ox+4, oy+9, 10, 2, CHARh)
    R(ox+5, oy+4, 8, 6, BLK)               # slumped head
    R(ox+5, oy+4, 8, 2, CHARh)
    # ember glints
    P(ox+6, oy+12, FO); P(ox+10, oy+15, FY); P(ox+8, oy+18, FO)
    P(ox+12, oy+11, FY); P(ox+8, oy+6, FO)
    # legs buckling
    R(ox+4, by-4, 4, 5, CHAR); R(ox+10, by-3, 4, 4, CHAR)
    R(ox+3, by, 6, 2, BLK); R(ox+10, by, 5, 2, BLK)
    # smoke wisp
    E(ox+9, oy+3, 3, 2, SMK); E(ox+12, oy+1, 2, 2, SMKd)
    return [ox, oy, 18, 24]

frames['thief_char'] = thief_char(154, 224)


# ═══════════════════════════════════════════════════════════════════════════════
#  TREASURE BITS
# ═══════════════════════════════════════════════════════════════════════════════
def coin(ox, oy):
    E(ox+5, oy+5, 6, 5, GDD)
    E(ox+5, oy+4, 5, 4, GD)
    E(ox+4, oy+3, 2, 2, GDH)
    R(ox+4, oy+3, 3, 3, GDD)
    return [ox, oy, 12, 10]
frames['coin'] = coin(176, 226)

def gem(ox, oy):
    poly([(ox+5, oy), (ox+9, oy+5), (ox+5, oy+11), (ox+1, oy+5)], MG)
    poly([(ox+5, oy+1), (ox+7, oy+5), (ox+5, oy+8), (ox+3, oy+5)], (255, 150, 220, 255))
    P(ox+4, oy+2, WHT)
    return [ox, oy, 10, 12]
frames['gem'] = gem(192, 224)

def sparkle(ox, oy, r):
    cx, cy = ox + 4, oy + 4
    R(cx, cy - r, 1, 2 * r + 1, WHT)
    R(cx - r, cy, 2 * r + 1, 1, WHT)
    if r >= 2:
        P(cx - 1, cy - 1, FY); P(cx + 1, cy + 1, FY)
        P(cx + 1, cy - 1, FY); P(cx - 1, cy + 1, FY)
    P(cx, cy, FW)
    return [ox, oy, 9, 9]
frames['sparkle0'] = sparkle(206, 224, 1)
frames['sparkle1'] = sparkle(218, 224, 4)
frames['sparkle2'] = sparkle(230, 224, 2)

def puff(ox, oy):
    for (cx, cy, r) in [(ox + 6, oy + 9, 5), (ox + 11, oy + 7, 5), (ox + 14, oy + 10, 4)]:
        E(cx, cy, r, r, SMKd)
    for (cx, cy, r) in [(ox + 6, oy + 8, 4), (ox + 11, oy + 6, 4), (ox + 13, oy + 9, 3)]:
        E(cx, cy, r, r, SMK)
    return [ox, oy, 18, 14]
frames['puff'] = puff(244, 224)


# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'dragon')
print("Frames generated:")
for name, (x, y, w, h) in sorted(frames.items()):
    print(f"  {name:13s} [{x:3d},{y:3d},{w:3d},{h:3d}]")
