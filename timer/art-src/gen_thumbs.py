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
#  DRAGON thumb (silhouette – coming soon)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0D = h2c('#0a0520')
SKY1D = h2c('#1a0840')
GND_D = h2c('#060310')
HORZ_D = 72
fill_sky(d, SKY0D, SKY1D, HORZ_D)
fill_ground(d, GND_D, HORZ_D)
# Moon
draw_circle_fill(d, 70, 20, 12, (220, 220, 180, 255))
draw_circle_fill(d, 74, 16, 10, SKY0D)  # crescent
# Dragon silhouette
DRG = (30, 10, 50, 255)
# Body
rect(d, 20, 58, 56, 30, DRG)
# Neck + head
rect(d, 56, 38, 14, 24, DRG)
rect(d, 58, 28, 18, 14, DRG)   # head
rect(d, 72, 26, 8, 4, DRG)     # snout
# Wing (left)
rect(d, 4,  36, 26, 20, DRG)
rect(d, 2,  32, 10,  8, DRG)
rect(d, 10, 28,  8,  6, DRG)
# Tail
rect(d, 4,  72, 20, 10, DRG)
rect(d, 2,  78, 10, 6, DRG)
save_png(img.convert('RGBA'), 'thumb_dragon.png')

# ════════════════════════════════════════════════════════════════════════════════
#  BRIDGE thumb (silhouette – coming soon)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0B = h2c('#0c1a2e')
SKY1B = h2c('#1a3a5c')
GND_B = h2c('#080c12')
HORZ_B = 64
fill_sky(d, SKY0B, SKY1B, HORZ_B)
fill_ground(d, GND_B, HORZ_B)
BRG = (20, 40, 70, 255)
# Canyon walls
rect(d,  0, 72, 22, 56, BRG)
rect(d, 74, 72, 22, 56, BRG)
# Bridge span
rect(d, 18, 68, 60, 4, BRG)
# Cables / tower
rect(d, 46, 48, 4, 20, BRG)   # tower
for ci in range(3):
    d.line([(22, 68), (46, 48)], fill=(40,80,120,220), width=1)
    d.line([(76, 68), (48, 48)], fill=(40,80,120,220), width=1)
# Stars
for sx, sy in [(10,10),(30,20),(60,8),(80,15),(45,30)]:
    rect(d, sx, sy, 2, 2, (200,220,255,200))
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
#  FEEDING thumb (silhouette – coming soon)
# ════════════════════════════════════════════════════════════════════════════════
img, d = new_sheet(TW, TH)
SKY0F = h2c('#0f1a0f')
SKY1F = h2c('#1a3020')
GND_F = h2c('#080f08')
HORZ_F = 66
fill_sky(d, SKY0F, SKY1F, HORZ_F)
fill_ground(d, GND_F, HORZ_F)
FDG = (20, 50, 20, 255)
FOOD = h2c('#39ff14')
# Monster (center)
rect(d, 30, 78, 36, 34, FDG)  # body
rect(d, 36, 62, 24, 20, FDG)  # head
rect(d, 40, 58,  6, 6, FDG)   # left horn
rect(d, 50, 58,  6, 6, FDG)   # right horn
rect(d, 20, 82, 12, 18, FDG)  # left arm
rect(d, 64, 82, 12, 18, FDG)  # right arm
# Food item (glowing in hand)
draw_circle_fill(d, 24, 90, 7, FOOD)
rect(d, 22, 89, 4, 1, (0,0,0,0))  # bite mark
# Crumbs / food particles
for cx, cy in [(10,94),(8,88),(12,98),(62,92)]:
    draw_circle_fill(d, cx, cy, 2, FOOD)
save_png(img.convert('RGBA'), 'thumb_feeding.png')

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
