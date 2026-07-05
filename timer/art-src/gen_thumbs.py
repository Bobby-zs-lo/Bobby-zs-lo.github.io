"""Generate thumbnail cards (96x128 each) and lock badge (24x24).

Outputs:
  thumb_castle.png      – castle synthwave scene
  thumb_monsterhp.png   – monster arena scene
  thumb_dragon.png      – dragon silhouette (phase-2 placeholder)
  thumb_bridge.png      – canyon bridge silhouette
  thumb_volcano.png     – volcano eruption silhouette
  thumb_feeding.png     – monster feast silhouette
  thumb_lock.png        – 24x24 padlock badge
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save, rect, h2c, draw_circle_fill, lerp_color
from PIL import Image, ImageDraw

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(ASSETS, exist_ok=True)

TW, TH = 96, 128   # thumbnail size

# ── Helper: synthwave sky gradient ────────────────────────────────────────────
def fill_sky(d, sky0, sky1, horizon, w=TW, h=TH):
    for y in range(horizon):
        t = y / max(1, horizon - 1)
        col = lerp_color(sky0, sky1, t)
        d.rectangle([0, y, w - 1, y], fill=col)


def fill_ground(d, gnd, horizon, w=TW, h=TH):
    rect(d, 0, horizon, w, h - horizon, gnd)


def draw_sun(d, cx, cy, r, col_top, col_bot, slit_step=4):
    """Draw a retro sun disc with horizontal slits in lower half."""
    for dy in range(-r, r + 1):
        t = (dy + r) / (2 * r)
        col = lerp_color(col_top, col_bot, max(0.0, (dy) / r))
        dx = int(math.sqrt(max(0, r * r - dy * dy)))
        if dy > 0 and (dy % slit_step) >= slit_step - 1:
            continue  # slit gap
        d.rectangle([cx - dx, cy + dy, cx + dx, cy + dy], fill=col)


def draw_grid(d, vp_x, horizon, w=TW, h=TH, col=(100, 20, 80, 200)):
    """Perspective grid lines on the ground."""
    num_v = 6
    for i in range(num_v + 1):
        bx = i * w // num_v
        d.line([(bx, h), (vp_x, horizon)], fill=col, width=1)
    num_h = 6
    for i in range(1, num_h + 1):
        t = (i / num_h) ** 1.8
        gy = horizon + int((h - horizon) * t)
        d.line([(0, gy), (w, gy)], fill=col, width=1)


def mini_castle(d, x, y, col_stone, col_hi):
    """Draw a tiny castle silhouette."""
    # Foundation
    rect(d, x, y + 34, 40, 4, col_stone)
    # Wall
    rect(d, x + 2, y + 18, 36, 16, col_stone)
    rect(d, x + 2, y + 18, 36, 1, col_hi)
    # Battlements on wall
    for i in range(5):
        rect(d, x + 2 + i * 8, y + 12, 5, 6, col_stone)
        rect(d, x + 2 + i * 8, y + 12, 5, 1, col_hi)
    # Left tower
    rect(d, x, y + 6, 10, 28, col_stone)
    rect(d, x, y + 6, 10, 1, col_hi)
    # Right tower
    rect(d, x + 30, y + 6, 10, 28, col_stone)
    rect(d, x + 30, y + 6, 10, 1, col_hi)
    # Tower tops
    for tx in [x, x + 30]:
        for ci in range(3):
            rect(d, tx + ci * 4, y + 2, 3, 4, col_stone)


def save_png(img, name):
    img.save(os.path.join(ASSETS, name))
    print(f'  wrote {name}  {img.size}')


# ════════════════════════════════════════════════════════════════════════════════
#  CASTLE thumb  — refreshed 16-bit look matching castle.js palette
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0     = h2c('#2b0c3d')   # scene C.sky0
SKY1     = h2c('#ff5e94')   # scene C.sky1
SUN0     = h2c('#ffdd66')   # scene C.sun_top
SUN1     = h2c('#ff2e88')   # scene C.sun_bot
STONE    = h2c('#3a2254')   # keep + wall base (darker)
STONE_MID= h2c('#5c3880')   # mid tone
STONE_HI = h2c('#a878d2')   # scene C.stone_hi highlight
GROUND_C = h2c('#1c082a')   # scene C.ground
GRID_C   = (122, 30, 90, 180)  # scene C.grid approximation
ACCENT   = h2c('#00f5d4')   # scene C.accent (cyan)
GOLD     = h2c('#ffdd66')
HORIZON  = 70

fill_sky(d, SKY0, SKY1, HORIZON)
fill_ground(d, GROUND_C, HORIZON)
draw_sun(d, 48, 36, 18, SUN0, SUN1, slit_step=3)
draw_grid(d, 48, HORIZON, col=GRID_C)

# 16-bit castle: keep (center) + 2 towers, 3-tone shading, lit windows, portcullis, cannons
CX, CY = 10, 66  # castle origin (left edge, foundation top)
CW, CH = 76, 56  # overall bounding box

# --- Foundation
rect(d, CX,       CY+CH-4, CW, 4, STONE)
# --- Main keep (center)
KX, KY = CX+18, CY+8
rect(d, KX, KY, 40, CH-12, STONE)
rect(d, KX, KY, 40, 1, STONE_HI)          # highlight top edge
rect(d, KX, KY, 1, CH-12, STONE_HI)       # highlight left edge
# Keep shading (right side darker)
rect(d, KX+32, KY, 8, CH-12, (42, 20, 58, 255))
# Merlons on keep top (5 merlons, 3-tone)
for i in range(5):
    mx = KX + 2 + i * 8
    rect(d, mx, KY-6, 5, 6, STONE_MID)
    rect(d, mx, KY-6, 5, 1, STONE_HI)
# Portcullis arch
rect(d, KX+14, KY+22, 12, 18, (10, 4, 18, 255))
for pi in range(3):
    rect(d, KX+14+pi*4, KY+22, 1, 18, (60, 40, 80, 200))
# Lit windows — 4-tone glow
for wx, wy in [(KX+6, KY+8), (KX+28, KY+8), (KX+6, KY+16), (KX+28, KY+16)]:
    rect(d, wx, wy, 4, 5, (255, 200, 80, 255))  # warm glow fill
    rect(d, wx, wy, 4, 1, (255, 240, 160, 255)) # bright top
    rect(d, wx+3, wy, 1, 5, (180, 120, 40, 200))# right shadow
# Cannon on left & right of keep
for cx2, cy2 in [(KX-4, KY+14), (KX+36, KY+14)]:
    rect(d, cx2, cy2+2, 8, 5, (50, 30, 70, 255))    # barrel
    rect(d, cx2, cy2+2, 1, 5, (100, 70, 130, 255))  # barrel highlight
    rect(d, cx2-2, cy2, 4, 4, (60, 35, 80, 255))    # carriage
# --- Left tower
LTX, LTY = CX, CY+4
rect(d, LTX, LTY, 20, CH-8, STONE)
rect(d, LTX, LTY, 1, CH-8, STONE_HI)
rect(d, LTX, LTY, 20, 1, STONE_HI)
rect(d, LTX+14, LTY, 6, CH-8, (42, 20, 58, 255))   # shade right
for i in range(3):
    rect(d, LTX+1+i*7, LTY-5, 5, 5, STONE_MID)
    rect(d, LTX+1+i*7, LTY-5, 5, 1, STONE_HI)
rect(d, LTX+6, LTY+8, 4, 5, (255, 200, 80, 255))   # lit window
# --- Right tower
RTX, RTY = CX+CW-20, CY+4
rect(d, RTX, RTY, 20, CH-8, STONE)
rect(d, RTX, RTY, 1, CH-8, STONE_HI)
rect(d, RTX, RTY, 20, 1, STONE_HI)
rect(d, RTX+14, RTY, 6, CH-8, (42, 20, 58, 255))
for i in range(3):
    rect(d, RTX+1+i*7, RTY-5, 5, 5, STONE_MID)
    rect(d, RTX+1+i*7, RTY-5, 5, 1, STONE_HI)
rect(d, RTX+10, RTY+8, 4, 5, (255, 200, 80, 255))  # lit window

# --- Flag pole (tall, right of castle) + pennant climbing to top
FPX, FPY0, FPY1 = 84, 20, HORIZON+2
rect(d, FPX, FPY0, 1, FPY1-FPY0, STONE_HI)
# Pennant (at top, 16-bit wave shape)
for fy in range(9):
    t = 1 - abs(fy - 4) / 4.5
    fw = max(1, round(t * 11))
    col = GOLD if fy < 5 else h2c('#ffa500')
    rect(d, FPX+1, FPY0+fy, fw, 1, col)

# --- Torch glow hints on keep walls
for tx2, ty2 in [(KX+2, KY+30), (KX+34, KY+30)]:
    rect(d, tx2, ty2, 2, 4, h2c('#ff8800'))
    rect(d, tx2, ty2, 2, 1, h2c('#ffee44'))

save_png(img.convert('RGBA'), 'thumb_castle.png')

# ════════════════════════════════════════════════════════════════════════════════
#  MONSTER HP thumb  — refreshed 16-bit look matching monsterhp.js palette
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0M  = h2c('#1a0b2e')   # scene C.sky0
SKY1M  = h2c('#00b4c8')   # scene C.sky1
SUN0M  = h2c('#ffde50')   # scene C.sun_top
SUN1M  = h2c('#ff5500')   # scene C.sun_bot
GND_M  = h2c('#0a1820')   # scene C.ground
GRIDM  = (0, 96, 85, 160) # scene C.grid teal
HORIZM = 68

# Beast palette (acid teal arena + purple beast)
BEAST_LT = h2c('#cc88ff')  # beast body highlight
BEAST_MD = h2c('#9944cc')  # beast body mid
BEAST_DK = h2c('#5a1e8a')  # beast shadow / horns
BEAST_EY = h2c('#ff2db4')  # eyes / hurt glow
# Hero palette (cyan knight)
HERO_LT  = h2c('#00f5d4')  # bright cyan (scene accent)
HERO_MD  = h2c('#0099aa')  # mid cyan
HERO_DK  = h2c('#005566')  # shadow
SWORD_C  = h2c('#e8e8ff')  # broadsword blade

fill_sky(d, SKY0M, SKY1M, HORIZM)
fill_ground(d, GND_M, HORIZM)
draw_sun(d, 48, 32, 14, SUN0M, SUN1M, slit_step=3)
draw_grid(d, 48, HORIZM, col=GRIDM)

# ── HP bar (top-center, matches scene hpframe) ──
HPW, HPH = 80, 10
HPX, HPY = (TW - HPW) // 2, 4
rect(d, HPX,   HPY,   HPW, HPH, h2c('#002233'))       # frame bg
rect(d, HPX+1, HPY+1, HPW-2, HPH-2, h2c('#004455'))   # inner trough
rect(d, HPX+1, HPY+1, round((HPW-2)*0.55), HPH-2, h2c('#39ff14'))  # fill ~55%
rect(d, HPX+1, HPY+1, round((HPW-2)*0.55), 1, h2c('#aaff44'))      # fill top shine
# Skull marker at ~55%
rect(d, HPX + round((HPW-2)*0.55) + 1, HPY+1, 3, HPH-2, h2c('#ff2db4'))

# ── Hero (left, ~16% from left) — 16-bit knight silhouette ──
HX, HY_FEET = 14, 118
# Legs (2-tone)
rect(d, HX,   HY_FEET-10, 4, 10, HERO_MD)
rect(d, HX+6, HY_FEET-10, 4, 10, HERO_MD)
rect(d, HX,   HY_FEET-10, 1, 10, HERO_LT)
# Torso (armor, 3-tone)
rect(d, HX-1, HY_FEET-26, 12, 16, HERO_MD)
rect(d, HX-1, HY_FEET-26, 1, 16, HERO_LT)   # left highlight
rect(d, HX+8, HY_FEET-26, 3, 16, HERO_DK)   # right shadow
# Pauldrons
rect(d, HX-3, HY_FEET-28, 5, 4, HERO_MD)
rect(d, HX+8, HY_FEET-28, 5, 4, HERO_MD)
# Head (plumed helm)
rect(d, HX+1, HY_FEET-36, 8, 10, HERO_MD)
rect(d, HX+1, HY_FEET-36, 1, 10, HERO_LT)
rect(d, HX+2, HY_FEET-40, 3, 4, h2c('#ff2db4'))  # plume (magenta)
# Broadsword (large 2-hander, angled)
for si in range(16):
    t = si / 15.0
    rect(d, HX+10+si, HY_FEET-32+si, 2, 2, SWORD_C if si < 12 else h2c('#aaaacc'))
rect(d, HX+10, HY_FEET-32, 3, 3, h2c('#ffdd66'))  # crossguard

# ── Beast (right, ~62% from left) — 16-bit monster, 3-tone ──
BX, BY_FEET = 58, 118
BW, BH = 32, 42
# Body (3-tone with shading)
rect(d, BX,     BY_FEET-BH, BW,   BH,   BEAST_MD)
rect(d, BX,     BY_FEET-BH, 2,    BH,   BEAST_LT)   # left highlight
rect(d, BX+BW-6,BY_FEET-BH, 6,    BH,   BEAST_DK)   # right shadow
# Head (separate block, eyes)
rect(d, BX+4,  BY_FEET-BH-14, 24, 16, BEAST_MD)
rect(d, BX+4,  BY_FEET-BH-14, 1,  16, BEAST_LT)
rect(d, BX+24, BY_FEET-BH-14, 4,  16, BEAST_DK)
# Eyes (glowing pink/magenta)
rect(d, BX+6,  BY_FEET-BH-8, 4, 3, BEAST_EY)
rect(d, BX+18, BY_FEET-BH-8, 4, 3, BEAST_EY)
rect(d, BX+7,  BY_FEET-BH-8, 2, 1, (255,200,220,255))  # eye shine L
rect(d, BX+19, BY_FEET-BH-8, 2, 1, (255,200,220,255))  # eye shine R
# Horns (2-tone)
rect(d, BX+6,  BY_FEET-BH-22, 5, 10, BEAST_DK)
rect(d, BX+6,  BY_FEET-BH-22, 1, 10, BEAST_LT)
rect(d, BX+21, BY_FEET-BH-22, 5, 10, BEAST_DK)
rect(d, BX+21, BY_FEET-BH-22, 1, 10, BEAST_LT)
# Arms (reaching forward / slightly raised)
rect(d, BX-8,  BY_FEET-BH+6, 10, 20, BEAST_MD)
rect(d, BX-8,  BY_FEET-BH+6, 1,  20, BEAST_LT)
rect(d, BX+BW, BY_FEET-BH+6, 10, 20, BEAST_MD)
# Claws
for ci in range(3):
    rect(d, BX-10+ci*2, BY_FEET-BH+26, 2, 4, BEAST_DK)
# Legs
rect(d, BX+4,  BY_FEET-8, 8, 8, BEAST_DK)
rect(d, BX+20, BY_FEET-8, 8, 8, BEAST_DK)

save_png(img.convert('RGBA'), 'thumb_monsterhp.png')

# ════════════════════════════════════════════════════════════════════════════════
#  DRAGON thumb  — 16-bit sleeping dragon on a gold hoard (matches dragon.js)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0D = h2c('#1a0833')   # scene C.sky0
SKY1D = h2c('#c23a86')   # scene C.sky1
SUN0D = h2c('#ffd166')   # scene C.sun_top
SUN1D = h2c('#ff2e88')   # scene C.sun_bot
GND_D = h2c('#160626')   # scene C.ground
GRIDD = (90, 30, 110, 170)
HORZ_D = 72
fill_sky(d, SKY0D, SKY1D, HORZ_D)
fill_ground(d, GND_D, HORZ_D)
draw_sun(d, 30, 34, 16, SUN0D, SUN1D, slit_step=3)
draw_grid(d, 48, HORZ_D, col=GRIDD)

DG0 = h2c('#ff6048'); DG1 = h2c('#d6282a'); DG2 = h2c('#961824'); DG3 = h2c('#5c0e1c')
BLG = h2c('#f4c68c')
GLD = h2c('#ffd24a'); GLDH = h2c('#ffe9a0'); GLDD = h2c('#b07d20'); GLDS = h2c('#6e4a12')
CYN = h2c('#d8c47e'); BONE = h2c('#ece4be'); WING = h2c('#76161e')

# Gold hoard dome (cx=54), surface coins
MCX, MTOP, MBASE = 54, 78, 105
for yy in range(MTOP, MBASE):
    t = (yy - MTOP) / (MBASE - MTOP)
    hw = int(30 * (t ** 0.6))
    rect(d, MCX - hw, yy, hw * 2, 1, lerp_color(GLDH, GLDD, t * 0.9))
rect(d, MCX - 30, MBASE - 1, 60, 2, GLDS)
for cx, cy in [(40, 96), (54, 100), (68, 97), (60, 92), (46, 90)]:
    draw_circle_fill(d, cx, cy, 2, GLD)
    rect(d, cx - 1, cy - 1, 1, 1, GLDH)

# Treasure chest (far left) with a little gold
rect(d, 6, 92, 18, 13, h2c('#784c28'))
rect(d, 6, 92, 18, 2, h2c('#a26c3c'))
rect(d, 6, 92, 3, 13, h2c('#d8b45a')); rect(d, 21, 92, 3, 13, h2c('#d8b45a'))
rect(d, 9, 94, 12, 5, GLD); rect(d, 9, 94, 12, 1, GLDH)

# Sleeping dragon curled on the hoard (faces left)
# Tail coil (right)
draw_circle_fill(d, 78, 88, 8, DG1); draw_circle_fill(d, 84, 80, 6, DG1)
d.polygon([(86, 78), (92, 70), (88, 80)], fill=DG2)
# Back / shoulder
draw_circle_fill(d, 60, 84, 16, DG1)
draw_circle_fill(d, 46, 88, 11, DG1)
draw_circle_fill(d, 60, 90, 15, DG2)        # lower shadow
draw_circle_fill(d, 60, 80, 12, DG0)        # upper highlight
# Belly
d.ellipse([44, 90, 70, 104], fill=BLG)
# Folded wing (magenta) + cyan ribs
d.polygon([(50, 78), (72, 72), (74, 86), (54, 88)], fill=WING)
for fx, fy in [(74, 86), (68, 88), (60, 87)]:
    d.line([(72, 72), (fx, fy)], fill=CYN, width=1)
# Cyan spinal spikes
for sx, sy, hh in [(52, 74, 7), (60, 72, 8), (68, 74, 7), (76, 78, 5)]:
    d.polygon([(sx - 3, sy), (sx, sy - hh), (sx + 3, sy)], fill=CYN)
# Neck + head resting low-left
draw_circle_fill(d, 40, 92, 8, DG1)
draw_circle_fill(d, 28, 95, 8, DG1)
d.polygon([(16, 96), (28, 90), (28, 100)], fill=DG1)   # snout
d.polygon([(17, 96), (27, 92), (27, 99)], fill=DG2)
rect(d, 18, 95, 2, 1, DG3)                              # nostril
d.line([(24, 92), (30, 92)], fill=DG3, width=1)         # closed eye
# Horns
d.polygon([(30, 89), (38, 80), (33, 90)], fill=BONE)
d.polygon([(26, 90), (31, 81), (29, 90)], fill=BONE)
# Sleep "z"s
for zx, zy, zs in [(34, 70, 4), (40, 62, 5)]:
    rect(d, zx, zy, zs, 1, BLG); rect(d, zx, zy + zs - 1, zs, 1, BLG)
    d.line([(zx + zs - 1, zy), (zx, zy + zs - 1)], fill=BLG, width=1)
save_png(img.convert('RGBA'), 'thumb_dragon.png')

# ════════════════════════════════════════════════════════════════════════════════
#  BRIDGE thumb  — 16-bit canyon + crane + half-built bridge (matches bridge.js)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0B = h2c('#140a33')   # scene C.sky0
SKY1B = h2c('#ff6a4a')   # scene C.sky1
SUN0B = h2c('#ffd166')   # scene C.sun_top
SUN1B = h2c('#ff2e88')   # scene C.sun_bot
GND_B = h2c('#2a0d30')   # scene C.ground
GRIDB = (160, 50, 118, 170)  # scene C.grid approximation
HORZ_B = 66              # deck / cliff-top line
fill_sky(d, SKY0B, SKY1B, HORZ_B)
# Stars
for sx, sy in [(10, 8), (30, 16), (62, 6), (84, 13), (48, 22), (20, 28)]:
    rect(d, sx, sy, 1, 1, (233, 233, 255, 170))
draw_sun(d, 48, 40, 15, SUN0B, SUN1B, slit_step=3)
fill_ground(d, GND_B, HORZ_B)
draw_grid(d, 48, HORZ_B, col=GRIDB)

# Canyon pit carved through the ground (gap x=20..76, walls narrow to bottom)
GX0, GX1 = 20, 76
for yy in range(HORZ_B, TH):
    t = (yy - HORZ_B) / (TH - HORZ_B)
    inn = int(3 * t)
    col = lerp_color(h2c('#240a2c'), h2c('#07030e'), t)
    rect(d, GX0 + inn, yy, (GX1 - inn) - (GX0 + inn), 1, col)
# Wall strata ledges
for k in range(1, 5):
    t = k / 5
    yy = HORZ_B + int((TH - HORZ_B) * t)
    col = lerp_color(h2c('#b04a86'), h2c('#2c0c26'), t)
    rect(d, GX0 + int(3 * t), yy, 4, 1, col)
    rect(d, GX1 - int(3 * t) - 4, yy, 4, 1, col)
# Glowing river at the bottom
rect(d, GX0 + 4, TH - 4, GX1 - GX0 - 8, 2, (0, 229, 255, 60))
rect(d, GX0 + 6, TH - 3, GX1 - GX0 - 12, 1, h2c('#00e5ff'))

# Bridge segments across the gap (7 slots, 4 solid + 3 ghost outlines)
ST_M = h2c('#6a5aa8'); ST_D = h2c('#3c3270'); CYA = h2c('#00f5d4')
MGB = h2c('#ff2db4'); GHO = (0, 229, 255, 130)
SEGW = 8
for i in range(7):
    sx = GX0 + i * SEGW
    if i < 4:   # solid
        rect(d, sx, HORZ_B, SEGW, 1, CYA)
        rect(d, sx, HORZ_B + 1, SEGW, 2, ST_M)
        rect(d, sx, HORZ_B + 3, 1, 5, ST_M); rect(d, sx + SEGW - 1, HORZ_B + 3, 1, 5, ST_D)
        rect(d, sx, HORZ_B + 7, SEGW, 1, ST_D)
        d.line([(sx + 1, HORZ_B + 3), (sx + SEGW - 2, HORZ_B + 7)], fill=MGB, width=1)
        d.line([(sx + 1, HORZ_B + 7), (sx + SEGW - 2, HORZ_B + 3)], fill=MGB, width=1)
    else:       # ghost outline
        rect(d, sx, HORZ_B, SEGW, 1, GHO)
        rect(d, sx, HORZ_B, 1, 8, GHO); rect(d, sx + SEGW - 1, HORZ_B, 1, 8, GHO)
        rect(d, sx, HORZ_B + 7, SEGW, 1, GHO)

# Gold tower crane on the right cliff
GDB = h2c('#ffd24a'); GDDB = h2c('#b0801f'); HAZB = h2c('#22142c')
JIBY = 34
rect(d, 85, JIBY, 1, HORZ_B - JIBY, GDDB)      # tower rails
rect(d, 88, JIBY, 1, HORZ_B - JIBY, GDB)
for zy in range(JIBY, HORZ_B - 4, 5):          # lattice
    d.line([(85, zy), (88, zy + 5)], fill=GDDB, width=1)
rect(d, 16, JIBY, 76, 1, GDB)                  # jib chords
rect(d, 16, JIBY + 2, 76, 1, GDDB)
rect(d, 86, JIBY - 6, 1, 6, GDB)               # apex
d.line([(86, JIBY - 6), (17, JIBY)], fill=(255, 233, 160, 200), width=1)
rect(d, 89, JIBY + 3, 4, 4, HAZB)              # counterweight
rect(d, 80, HORZ_B - 6, 12, 6, GDB)            # cab
rect(d, 80, HORZ_B - 6, 12, 1, h2c('#ffe9a0'))
rect(d, 79, HORZ_B - 2, 14, 2, HAZB)           # tracks
rect(d, 82, HORZ_B - 5, 3, 2, h2c('#00e5ff'))  # cab window
# Trolley + cable + hanging segment over the 5th slot
TRX = GX0 + 4 * SEGW + SEGW // 2
rect(d, TRX - 2, JIBY + 3, 5, 2, GDB)
d.line([(TRX, JIBY + 5), (TRX, 50)], fill=(255, 233, 160, 220), width=1)
rect(d, TRX - 4, 50, 8, 1, CYA)
rect(d, TRX - 4, 51, 8, 2, ST_M)
rect(d, TRX - 4, 53, 1, 4, ST_M); rect(d, TRX + 3, 53, 1, 4, ST_D)

# Hero on the left cliff (magenta cap, cyan shirt)
HXB, HYB = 9, HORZ_B - 12
rect(d, HXB + 1, HYB + 4, 6, 5, h2c('#00c8d8'))     # torso
rect(d, HXB + 1, HYB + 1, 5, 3, h2c('#f4c68c'))     # face
rect(d, HXB, HYB, 7, 2, h2c('#ff2db4'))             # cap
rect(d, HXB + 1, HYB + 9, 2, 3, h2c('#3a3560'))     # legs
rect(d, HXB + 4, HYB + 9, 2, 3, h2c('#24203e'))
rect(d, HXB, HYB + 4, 2, 4, h2c('#c88a30'))          # backpack
# Flag on the far cliff
rect(d, 94, HORZ_B - 14, 1, 14, h2c('#ffe9a0'))
d.polygon([(90, HORZ_B - 13), (94, HORZ_B - 11), (94, HORZ_B - 8)], fill=h2c('#00e5ff'))
# Cactus décor (left edge)
rect(d, 2, HORZ_B - 7, 2, 7, h2c('#1f8f7a'))
rect(d, 0, HORZ_B - 5, 2, 2, h2c('#1f8f7a'))
save_png(img.convert('RGBA'), 'thumb_bridge.png')

# ════════════════════════════════════════════════════════════════════════════════
#  VOLCANO thumb (silhouette – coming soon)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0V = h2c('#1a0400')
SKY1V = h2c('#ff4400')
GND_V = h2c('#0a0200')
HORZ_V = 68
fill_sky(d, SKY0V, SKY1V, HORZ_V)
fill_ground(d, GND_V, HORZ_V)
VOL = (30, 10, 5, 255)
LAVA = h2c('#ff6600')
LAVA2 = h2c('#ffcc00')
# Volcano cone
for vy in range(60):
    vw = 2 + vy * 2
    rect(d, 48 - vw // 2, 68 + vy, vw, 1, VOL)
# Crater lip
rect(d, 34, 68, 28, 3, (50, 20, 10, 255))
# Lava spewing
for ly in range(18):
    lw = max(1, 12 - ly)
    rect(d, 48 - lw // 2, 50 - ly, lw, 2, LAVA if ly < 10 else LAVA2)
# Lava bombs
for bx, by in [(20, 52), (68, 48), (36, 40), (60, 36)]:
    draw_circle_fill(d, bx, by, 3, LAVA)
save_png(img.convert('RGBA'), 'thumb_volcano.png')

# ════════════════════════════════════════════════════════════════════════════════
#  FEEDING (Poke Feast) thumb — chibi Pikachu at a feast, matches feast.js
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
TANF0 = h2c('#F5E3C0')
TANF1 = h2c('#E4C48F')
for y in range(TH):
    d.rectangle([0, y, TW - 1, y], fill=lerp_color(TANF0, TANF1, y / (TH - 1)))

PIKA   = h2c('#FFDE00')
PIKA_H = h2c('#FFEE66')
PIKA_D = h2c('#D9B800')
BLK    = h2c('#221800')
CHEEK  = h2c('#FF3B30')
TAILC  = h2c('#8A5A2B')
PLATE  = h2c('#FFFFFF')
PLATE_D= h2c('#D8D0C0')
FOOD_R = h2c('#C81E1E')
FOOD_G = h2c('#3FA34D')
FOOD_B = h2c('#6B4226')

# Platter (mini white oval), lower-center
PCX, PCY, PRW, PRH = 48, 100, 30, 9
soft = img.load()
d.ellipse([PCX - PRW, PCY - PRH, PCX + PRW, PCY + PRH], fill=PLATE)
d.ellipse([PCX - PRW, PCY - 2, PCX + PRW, PCY + PRH], fill=PLATE_D)
d.ellipse([PCX - PRW + 4, PCY - PRH + 3, PCX + PRW - 4, PCY - 1], fill=PLATE)
# Food dots on the platter
for fx, fy, fc in [(30, 98, FOOD_R), (40, 102, FOOD_G), (56, 101, FOOD_B),
                    (66, 97, FOOD_R), (48, 96, FOOD_G)]:
    draw_circle_fill(d, fx, fy, 3, fc)
    rect(d, fx - 1, fy - 1, 1, 1, (255, 255, 255, 110))

# Pikachu tail (YELLOW zigzag bolt + brown base wedge), behind body right —
# V2 rules: flat cel, no speculars, no cream belly (see reference_pika_v2.py)
TX, TY = 72, 78
d.polygon([(TX, TY), (TX + 6, TY - 6), (TX + 2, TY - 10), (TX + 10, TY - 20),
           (TX + 16, TY - 19), (TX + 11, TY - 13), (TX + 14, TY - 9),
           (TX + 5, TY - 2)], fill=PIKA)
d.polygon([(TX, TY), (TX + 6, TY - 6), (TX + 2, TY - 10), (TX + 6, TY - 12),
           (TX + 8, TY - 7), (TX + 5, TY - 2)], fill=TAILC)

# Pikachu body (flat round blob, one same-hue shade crescent at the bottom)
BXc, BYc, BR = 48, 82, 17
draw_circle_fill(d, BXc, BYc, BR, PIKA)
d.ellipse([BXc - 12, BYc + 9, BXc + 12, BYc + 17], fill=PIKA_D)
d.ellipse([BXc - 12, BYc + 6, BXc + 12, BYc + 14], fill=PIKA)

# Pikachu head (flat round blob, slightly overlapping body)
HXc, HYc, HR = 48, 56, 16
draw_circle_fill(d, HXc, HYc, HR, PIKA)

# Ears (broad leaves, black tips only the outer third)
for ex, tip_dx in [(-10, -6), (10, 6)]:
    ex0, ey0 = HXc + ex, HYc - 10
    ex1, ey1 = HXc + ex + tip_dx, HYc - 34
    d.polygon([(ex0 - 5, ey0), (ex0 + 5, ey0), (ex1 + 2, ey1 + 6), (ex1 - 2, ey1 + 6)], fill=PIKA)
    d.polygon([(ex1 - 3, ey1 + 9), (ex1 + 3, ey1 + 9), (ex1, ey1)], fill=BLK)  # black tip

# Cheeks (flat red, lower-outer face, slight silhouette bulge)
draw_circle_fill(d, HXc - 13, HYc + 6, 5, CHEEK)
draw_circle_fill(d, HXc + 13, HYc + 6, 5, CHEEK)

# Eyes (wide-set black dots) + single catchlight upper-right
for eyx in (HXc - 7, HXc + 7):
    draw_circle_fill(d, eyx, HYc - 1, 3, BLK)
    rect(d, eyx, HYc - 3, 1, 1, (255, 255, 255, 230))

# Nose + w-mouth (centred — the face signature)
rect(d, HXc - 1, HYc + 2, 2, 1, h2c('#5A3A1A'))
d.arc([HXc - 5, HYc + 3, HXc, HYc + 8], 20, 160, fill=h2c('#5A3A1A'))
d.arc([HXc, HYc + 3, HXc + 5, HYc + 8], 20, 160, fill=h2c('#5A3A1A'))

# Arms holding food (small yellow nubs reaching toward platter)
draw_circle_fill(d, BXc - 14, BYc + 8, 4, PIKA)
draw_circle_fill(d, BXc + 15, BYc + 8, 4, PIKA)

# Small white lightning bolt above head (Pikachu signature spark)
LBX, LBY = HXc + 16, HYc - 30
d.polygon([(LBX, LBY), (LBX - 5, LBY + 8), (LBX - 1, LBY + 8),
           (LBX - 4, LBY + 16), (LBX + 5, LBY + 6), (LBX + 1, LBY + 6)],
          fill=(255, 255, 255, 235))
d.polygon([(LBX, LBY), (LBX - 5, LBY + 8), (LBX - 1, LBY + 8), (LBX - 3, LBY + 13)],
          fill=(255, 244, 150, 200))

save_png(img.convert('RGBA'), 'thumb_feeding.png')

# ════════════════════════════════════════════════════════════════════════════════
#  MOUSE TIMER thumb — warm tan card: cheese goal, apples, mouse, a core
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
TAN0 = h2c('#bb9166')
TAN1 = h2c('#a87f53')
for y in range(TH):                       # subtle vertical depth
    d.rectangle([0, y, TW - 1, y], fill=lerp_color(TAN0, TAN1, y / (TH - 1)))

APL  = h2c('#c81e1e'); APL_H = h2c('#ff6056'); APL_D = h2c('#8e1216')
STM  = h2c('#5c3a1c'); LEAF = h2c('#46aa46')
CHE  = h2c('#ffcd3c'); CHE_H = h2c('#ffe98c'); CHE_D = h2c('#cd8412'); HOLE = h2c('#c47c0e')
COR  = h2c('#f6e7b6'); COR_D = h2c('#d6b56c')
GRY  = h2c('#c6cad3'); GRY_D = h2c('#7c818c'); BEL = h2c('#ecedf1')
EARP = h2c('#f2aabc'); CRB = h2c('#ffd650')

def soft_shadow(cx, cy, rw):
    for ddx in range(-rw, rw + 1):
        hh = int(3 * (1 - (ddx / rw) ** 2) ** 0.5)
        for ddy in range(-hh, hh + 1):
            px = img.load()
            x, y = cx + ddx, cy + ddy
            if 0 <= x < TW and 0 <= y < TH:
                base = img.getpixel((x, y))
                px[x, y] = lerp_color(base, (60, 40, 24, 255), 0.22)

def mini_apple(x, y, eaten=False):
    soft_shadow(x + 8, y + 19, 8)
    if eaten:
        # core: red caps + cream waist
        rect(d, x + 5, y + 2, 6, 3, APL)
        for yy in range(5, 13):
            w = 6 - int(3 * math.sin((yy - 5) / 8 * math.pi))
            rect(d, x + 8 - w // 2, y + yy, w, 1, COR if (yy % 2) else COR_D)
        rect(d, x + 3, y + 13, 10, 4, APL); rect(d, x + 3, y + 16, 10, 1, APL_D)
        rect(d, x + 6, y + 7, 1, 2, (66, 42, 22, 255))
        return
    rect(d, x + 7, y + 1, 2, 4, STM)
    rect(d, x + 9, y + 2, 3, 3, LEAF)
    draw_circle_fill(d, x + 8, y + 11, 7, APL)
    draw_circle_fill(d, x + 5, y + 8, 3, APL_H)
    rect(d, x + 12, y + 9, 3, 6, APL_D)

# cheese goal (far left)
soft_shadow(12, 62, 11)
d.polygon([(4, 58), (22, 50), (22, 60), (4, 60)], fill=CHE)
d.polygon([(4, 58), (22, 50), (22, 52), (5, 59)], fill=CHE_H)
rect(d, 4, 60, 19, 2, CHE_D)
for hx, hy in [(11, 56), (17, 53)]:
    draw_circle_fill(d, hx, hy, 2, HOLE)

# row of apples / cores
mini_apple(26, 46, eaten=False)
mini_apple(44, 46, eaten=False)
mini_apple(62, 46, eaten=True)
mini_apple(80, 46, eaten=True)

# mouse (eating, centre-left of the row, facing left)
MXc, MYc = 36, 60
soft_shadow(MXc, 66, 10)
draw_circle_fill(d, MXc + 3, MYc, 8, GRY)       # body
draw_circle_fill(d, MXc + 5, MYc + 3, 5, BEL)   # belly
draw_circle_fill(d, MXc - 4, MYc - 1, 5, GRY)   # head
draw_circle_fill(d, MXc - 1, MYc - 7, 4, GRY)   # ear
draw_circle_fill(d, MXc - 1, MYc - 7, 2, EARP)
rect(d, MXc - 9, MYc, 2, 2, h2c('#f07a8e'))     # nose
rect(d, MXc - 6, MYc - 2, 2, 2, h2c('#262022')) # eye
rect(d, MXc + 9, MYc + 2, 5, 2, GRY_D)          # tail
rect(d, MXc - 9, MYc - 1, 3, 3, APL)            # held apple bit
# crumbs
for cx2, cy2 in [(MXc - 11, MYc - 6), (MXc - 8, MYc - 9), (MXc - 13, MYc - 3)]:
    rect(d, cx2, cy2, 2, 2, CRB)

save_png(img.convert('RGBA'), 'thumb_mouse.png')

# ════════════════════════════════════════════════════════════════════════════════
#  LOCK badge [24x24]
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(24, 24)
LOCK_BG  = (20, 20, 40, 220)
LOCK_COL = (200, 200, 220, 255)
LOCK_DRK = (80, 80, 120, 255)
# Background rounded square
rect(d, 1, 1, 22, 22, LOCK_BG)
# Shackle (top arch)
rect(d, 7,  4, 10, 2, LOCK_COL)   # arch top bar
rect(d, 7,  4,  2, 7, LOCK_COL)   # left bar
rect(d, 15, 4,  2, 7, LOCK_COL)   # right bar
# Padlock body
rect(d, 5, 10, 14, 10, LOCK_COL)
rect(d, 6, 11, 12,  8, LOCK_DRK)
# Keyhole
rect(d, 10, 12, 4, 2, (255, 220, 0, 255))   # keyhole top
rect(d, 11, 14, 2, 4, (255, 220, 0, 255))   # keyhole stem
save_png(img.convert('RGBA'), 'thumb_lock.png')

print('All thumbs done.')
