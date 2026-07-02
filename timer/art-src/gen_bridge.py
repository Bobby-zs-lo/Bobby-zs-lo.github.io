"""Generate bridge.png + bridge.json sprite sheet (16-bit fidelity, RGBA transparent bg).
Run from timer/art-src/:  python gen_bridge.py
Outputs:  timer/assets/bridge.png + bridge.json

Theme: Canyon Bridge. A brave little adventurer must cross a deep synthwave
canyon. An automated golden tower crane places one bridge segment at a time
across the gap. Remaining time = ghostly cyan OUTLINE segments not yet built;
as time passes the crane lowers solid segments into place. At 0:00 the last
segment locks in and the adventurer runs across to safety.

Frames (HARD contract with js/themes/bridge.js)
----------------------------------------------------------------------------------
seg         [  0,  0, 16, 12]  solid bridge segment (deck top + truss below)
seg_ghost   [ 20,  0, 16, 12]  ghostly semi-transparent outline segment
crane_cab   [ 40,  0, 22, 16]  crane base cab on tracks (gold, hazard stripes)
trolley     [ 66,  0, 10,  7]  crane trolley (runs along the jib)
hero_idle0  [  0, 20, 16, 22]  adventurer standing (faces RIGHT)
hero_idle1  [ 18, 20, 16, 22]  adventurer standing, breathe frame
hero_run0   [ 36, 20, 16, 22]  adventurer running, stride 0
hero_run1   [ 54, 20, 16, 22]  adventurer running, stride 1
hero_cheer  [ 72, 20, 16, 22]  adventurer arms up, triumphant
flag        [ 92, 20, 14, 18]  goal flag on the far cliff (cyan pennant)
rock0       [110, 20, 14,  9]  mesa rock large
rock1       [110, 32, 10,  7]  mesa rock small
cactus      [126, 20, 12, 16]  teal saguaro cactus
sparkle0    [140, 20,  9,  9]  twinkle small
sparkle1    [150, 20,  9,  9]  twinkle large
sparkle2    [160, 20,  9,  9]  twinkle medium
puff        [140, 32, 18, 14]  dust / smoke puff
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save

SW, SH = 180, 48
img, d = new_sheet(SW, SH)

# ── Palette ──────────────────────────────────────────────────────────────────────
# Bridge steel (purple-steel, 3-tone) + neon accents
ST_H = (156, 138, 210, 255)   # steel highlight
ST_M = (106,  90, 168, 255)   # steel mid
ST_D = ( 60,  50, 112, 255)   # steel dark
CYA  = (  0, 245, 212, 255)   # deck top edge (accent cyan)
MG   = (255,  45, 180, 255)   # magenta cross-brace
GHO  = (  0, 229, 255, 130)   # ghost outline cyan (semi-transparent)
GHOf = (  0, 229, 255,  60)   # ghost faint interior
# Crane (construction gold)
GD   = (255, 210,  80, 255); GDH = (255, 240, 170, 255); GDD = (176, 128,  32, 255)
GDS  = (110,  76,  16, 255)
HAZ  = ( 34,  20,  44, 255)   # hazard stripe dark
# Hero (kid adventurer)
CAP  = (255,  45, 180, 255); CAPh = (255, 130, 215, 255)   # magenta cap
SKN  = (244, 198, 140, 255); SKNd = (206, 150,  96, 255)
SHT  = (  0, 200, 216, 255); SHTh = ( 95, 240, 255, 255); SHTd = (  0, 112, 126, 255)
PNT  = ( 58,  53,  96, 255); PNTd = ( 36,  32,  62, 255)
BOOT = ( 24,  16,  34, 255)
PACK = (200, 138,  48, 255); PACKd = (140,  90,  26, 255)
EYE  = ( 18,   8,  16, 255)
WHT  = (255, 255, 255, 255)
# Rocks / cactus (canyon flavour)
RK_H = (176,  74, 134, 255); RK_M = (110,  42,  88, 255); RK_D = ( 60,  20,  50, 255)
CACg = ( 31, 143, 122, 255); CACh = ( 63, 212, 176, 255); CACd = ( 18,  90,  76, 255)
# Smoke / dust
SMK  = (168, 140, 186, 255); SMKd = (108,  86, 128, 255)
FY   = (255, 224,  70, 255); FW   = (255, 255, 235, 255)


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


frames = {}

# ═══════════════════════════════════════════════════════════════════════════════
#  BRIDGE SEGMENT  (16 x 12 — deck surface on TOP 4px, steel truss hangs below)
# ═══════════════════════════════════════════════════════════════════════════════
def seg(ox, oy):
    # Deck (walking surface): cyan glow edge + 3-tone steel plating
    R(ox, oy,     16, 1, CYA)
    R(ox, oy + 1, 16, 1, ST_H)
    R(ox, oy + 2, 16, 1, ST_M)
    R(ox, oy + 3, 16, 1, ST_D)
    # Plank seams
    for sx in (ox + 4, ox + 8, ox + 12):
        P(sx, oy + 1, ST_M); P(sx, oy + 2, ST_D)
    # Truss: end posts + bottom chord
    R(ox,      oy + 4, 2, 8, ST_M); R(ox,      oy + 4, 1, 8, ST_H)
    R(ox + 14, oy + 4, 2, 8, ST_D); R(ox + 14, oy + 4, 1, 8, ST_M)
    R(ox, oy + 11, 16, 1, ST_D)
    # Magenta X-brace
    line(ox + 1, oy + 4, ox + 14, oy + 11, MG, 1)
    line(ox + 1, oy + 11, ox + 14, oy + 4, MG, 1)
    # Rivets
    P(ox + 1, oy + 5, GDH); P(ox + 14, oy + 5, GDH)
    return [ox, oy, 16, 12]

frames['seg'] = seg(0, 0)


def seg_ghost(ox, oy):
    # Same silhouette drawn only as a translucent cyan hologram outline
    R(ox, oy, 16, 1, GHO)                       # deck top line
    R(ox, oy + 3, 16, 1, GHOf)                  # deck bottom line
    R(ox,      oy, 1, 12, GHO)                  # left post
    R(ox + 15, oy, 1, 12, GHO)                  # right post
    R(ox, oy + 11, 16, 1, GHO)                  # bottom chord
    line(ox + 1, oy + 4, ox + 14, oy + 11, GHOf, 1)   # faint X
    line(ox + 1, oy + 11, ox + 14, oy + 4, GHOf, 1)
    return [ox, oy, 16, 12]

frames['seg_ghost'] = seg_ghost(20, 0)


# ═══════════════════════════════════════════════════════════════════════════════
#  CRANE CAB  (22 x 16 — tracked base + gold cab; the tower/jib are drawn
#  procedurally in the scene so they can span any canyon width)
# ═══════════════════════════════════════════════════════════════════════════════
def crane_cab(ox, oy):
    by = oy + 15
    # Tracks
    R(ox, by - 3, 22, 4, HAZ)
    R(ox + 1, by - 2, 20, 2, GDS)
    for wx in range(ox + 2, ox + 21, 4):
        P(wx, by - 1, HAZ)
    # Body (gold, 3-tone)
    R(ox + 2, oy + 4, 18, 8, GD)
    R(ox + 2, oy + 4, 18, 1, GDH)
    R(ox + 2, oy + 4, 1, 8, GDH)
    R(ox + 17, oy + 4, 3, 8, GDD)
    # Hazard chevrons on the skirt
    for i in range(4):
        poly([(ox + 3 + i * 5, oy + 10), (ox + 5 + i * 5, oy + 8), (ox + 7 + i * 5, oy + 10),
              (ox + 7 + i * 5, oy + 11), (ox + 5 + i * 5, oy + 9), (ox + 3 + i * 5, oy + 11)], HAZ)
    # Operator cab window (cyan glow)
    R(ox + 4, oy + 5, 6, 4, HAZ)
    R(ox + 5, oy + 6, 4, 2, (0, 229, 255, 255))
    P(ox + 5, oy + 6, (170, 250, 255, 255))
    # Tower socket on top
    R(ox + 12, oy, 6, 5, GDD)
    R(ox + 12, oy, 6, 1, GDH)
    return [ox, oy, 22, 16]

frames['crane_cab'] = crane_cab(40, 0)


def trolley(ox, oy):
    R(ox, oy, 10, 4, GD)
    R(ox, oy, 10, 1, GDH)
    R(ox + 8, oy, 2, 4, GDD)
    # pulley wheels
    R(ox + 1, oy + 4, 3, 3, HAZ); P(ox + 2, oy + 5, GDS)
    R(ox + 6, oy + 4, 3, 3, HAZ); P(ox + 7, oy + 5, GDS)
    return [ox, oy, 10, 7]

frames['trolley'] = trolley(66, 0)


# ═══════════════════════════════════════════════════════════════════════════════
#  HERO  (16 x 22 box, baseline = oy+21, faces RIGHT)
# ═══════════════════════════════════════════════════════════════════════════════
def hero(ox, oy, pose='idle0'):
    by = oy + 21
    breathe = 1 if pose == 'idle1' else 0
    hy = oy + breathe               # head bob
    # Backpack (behind, left side since hero faces right)
    R(ox + 1, hy + 8, 4, 8, PACK)
    R(ox + 1, hy + 8, 4, 1, GDH)
    R(ox + 1, hy + 14, 4, 2, PACKd)
    # Torso (cyan shirt, 3-tone)
    R(ox + 4, hy + 8, 8, 8, SHT)
    R(ox + 4, hy + 8, 1, 8, SHTh)
    R(ox + 10, hy + 8, 2, 8, SHTd)
    # Head + magenta cap
    R(ox + 5, hy + 2, 7, 6, SKN)
    R(ox + 11, hy + 2, 1, 6, SKNd)
    R(ox + 4, hy, 9, 3, CAP)
    R(ox + 4, hy, 9, 1, CAPh)
    R(ox + 10, hy + 2, 4, 1, CAP)          # cap brim (faces right)
    P(ox + 10, hy + 5, EYE)                # eye
    if pose == 'cheer':
        P(ox + 9, hy + 7, EYE)             # open mouth
    # Arms
    if pose == 'cheer':
        R(ox + 2, hy + 2, 2, 7, SHT); R(ox + 2, hy + 1, 2, 2, SKN)     # left arm UP
        R(ox + 12, hy + 2, 2, 7, SHT); R(ox + 12, hy + 1, 2, 2, SKN)   # right arm UP
    elif pose == 'run0':
        R(ox + 3, hy + 9, 2, 5, SHTd); R(ox + 3, hy + 13, 2, 2, SKN)   # back arm down
        R(ox + 11, hy + 7, 3, 3, SHT); R(ox + 13, hy + 7, 2, 2, SKN)   # front arm fwd
    elif pose == 'run1':
        R(ox + 3, hy + 7, 3, 3, SHTd); R(ox + 2, hy + 7, 2, 2, SKN)    # back arm fwd
        R(ox + 11, hy + 9, 2, 5, SHT); R(ox + 11, hy + 13, 2, 2, SKN)  # front arm down
    else:  # idle
        R(ox + 3, hy + 9, 2, 6, SHTd); R(ox + 3, hy + 14, 2, 2, SKN)
        R(ox + 11, hy + 9, 2, 6, SHT); R(ox + 11, hy + 14, 2, 2, SKN)
    # Legs + boots (baseline = by+2 exclusive; feet rows at by..by+1... keep within box)
    if pose == 'run0':
        R(ox + 4, by - 5, 3, 5, PNT);  R(ox + 10, by - 4, 3, 4, PNTd)
        R(ox + 3, by - 1, 4, 2, BOOT); R(ox + 11, by, 4, 2, BOOT)
    elif pose == 'run1':
        R(ox + 5, by - 4, 3, 4, PNTd); R(ox + 9, by - 6, 3, 6, PNT)
        R(ox + 4, by, 4, 2, BOOT);     R(ox + 9, by - 2, 4, 2, BOOT)
    else:
        R(ox + 5, by - 5, 3, 5, PNT);  R(ox + 9, by - 5, 3, 5, PNTd)
        R(ox + 4, by, 4, 2, BOOT);     R(ox + 9, by, 4, 2, BOOT)
    return [ox, oy, 16, 22]

frames['hero_idle0'] = hero(0,  20, 'idle0')
frames['hero_idle1'] = hero(18, 20, 'idle1')
frames['hero_run0']  = hero(36, 20, 'run0')
frames['hero_run1']  = hero(54, 20, 'run1')
frames['hero_cheer'] = hero(72, 20, 'cheer')


# ═══════════════════════════════════════════════════════════════════════════════
#  FLAG  (14 x 18 — goal marker on the far cliff)
# ═══════════════════════════════════════════════════════════════════════════════
def flag(ox, oy):
    R(ox + 2, oy, 1, 18, GDH)                   # pole
    P(ox + 2, oy, FW)                            # pole cap
    poly([(ox + 3, oy + 1), (ox + 13, oy + 4), (ox + 3, oy + 8)], (0, 229, 255, 255))
    poly([(ox + 3, oy + 2), (ox + 10, oy + 4), (ox + 3, oy + 6)], (0, 245, 212, 255))
    R(ox, oy + 17, 6, 1, RK_D)                  # little base mound
    return [ox, oy, 14, 18]

frames['flag'] = flag(92, 20)


# ═══════════════════════════════════════════════════════════════════════════════
#  ROCKS + CACTUS  (cliff-top decoration)
# ═══════════════════════════════════════════════════════════════════════════════
def rock0(ox, oy):
    poly([(ox, oy + 8), (ox + 3, oy + 2), (ox + 7, oy), (ox + 11, oy + 3), (ox + 13, oy + 8)], RK_M)
    poly([(ox + 3, oy + 2), (ox + 7, oy), (ox + 10, oy + 3), (ox + 5, oy + 4)], RK_H)
    R(ox + 1, oy + 7, 12, 2, RK_D)
    return [ox, oy, 14, 9]

def rock1(ox, oy):
    poly([(ox, oy + 6), (ox + 3, oy + 1), (ox + 7, oy), (ox + 9, oy + 6)], RK_M)
    P(ox + 4, oy + 1, RK_H); P(ox + 5, oy + 1, RK_H)
    R(ox + 1, oy + 5, 8, 2, RK_D)
    return [ox, oy, 10, 7]

frames['rock0'] = rock0(110, 20)
frames['rock1'] = rock1(110, 32)

def cactus(ox, oy):
    R(ox + 5, oy + 2, 3, 14, CACg)
    R(ox + 5, oy + 2, 1, 14, CACh)
    R(ox + 5, oy + 1, 3, 1, CACh)
    # left arm
    R(ox + 1, oy + 5, 2, 4, CACg); R(ox + 1, oy + 8, 4, 2, CACg); P(ox + 1, oy + 5, CACh)
    # right arm
    R(ox + 10, oy + 7, 2, 4, CACd); R(ox + 8, oy + 10, 4, 2, CACd)
    # spines
    P(ox + 4, oy + 4, CACh); P(ox + 8, oy + 6, CACd); P(ox + 4, oy + 12, CACd)
    return [ox, oy, 12, 16]

frames['cactus'] = cactus(126, 20)


# ═══════════════════════════════════════════════════════════════════════════════
#  SPARKLES + DUST PUFF  (house-style twinkles)
# ═══════════════════════════════════════════════════════════════════════════════
def sparkle(ox, oy, r):
    cx, cy = ox + 4, oy + 4
    R(cx, cy - r, 1, 2 * r + 1, WHT)
    R(cx - r, cy, 2 * r + 1, 1, WHT)
    if r >= 2:
        P(cx - 1, cy - 1, FY); P(cx + 1, cy + 1, FY)
        P(cx + 1, cy - 1, FY); P(cx - 1, cy + 1, FY)
    P(cx, cy, FW)
    return [ox, oy, 9, 9]

frames['sparkle0'] = sparkle(140, 20, 1)
frames['sparkle1'] = sparkle(150, 20, 4)
frames['sparkle2'] = sparkle(160, 20, 2)

def puff(ox, oy):
    for (cx, cy, r) in [(ox + 6, oy + 9, 5), (ox + 11, oy + 7, 5), (ox + 14, oy + 10, 4)]:
        E(cx, cy, r, r, SMKd)
    for (cx, cy, r) in [(ox + 6, oy + 8, 4), (ox + 11, oy + 6, 4), (ox + 13, oy + 9, 3)]:
        E(cx, cy, r, r, SMK)
    return [ox, oy, 18, 14]

frames['puff'] = puff(140, 32)


# ── Save ───────────────────────────────────────────────────────────────────────
save(img, frames, 'bridge')
print("Frames generated:")
for name, (x, y, w, h) in sorted(frames.items()):
    print(f"  {name:12s} [{x:3d},{y:3d},{w:3d},{h:3d}]")
