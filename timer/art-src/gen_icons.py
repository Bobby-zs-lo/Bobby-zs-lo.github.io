"""Generate PWA icons: icon-192.png, icon-512.png, icon-maskable.png.

Design: neon pixel clock glyph on dark (#0a0a1a) background.
Cyan (#00e5ff) hour/minute hands, magenta (#ff2db4) tick marks,
yellow (#ffde00) center dot.  Maskable has 20% safe-area padding.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import new_sheet, save, rect, h2c, draw_circle_fill, lerp_color
from PIL import Image, ImageDraw

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(ASSETS, exist_ok=True)

BG      = h2c('#0a0a1a')
CYAN    = h2c('#00e5ff')
MAGENTA = h2c('#ff2db4')
YELLOW  = h2c('#ffde00')
PANEL   = h2c('#140a26')
WHITE   = (230, 230, 255, 255)


def draw_icon(size, padding=0):
    """Draw a pixel-clock icon at given size. padding reduces content area."""
    img, d = new_sheet(size, size)
    # Background
    rect(d, 0, 0, size, size, BG)

    # Content area (accounting for safe-zone padding)
    cs = size - padding * 2   # content size
    ox, oy = padding, padding  # content origin

    # Outer circle (clock face)
    cx, cy = ox + cs // 2, oy + cs // 2
    r_outer = cs // 2 - cs // 14
    r_face  = r_outer - max(2, size // 64)

    # Draw dark panel circle
    draw_circle_fill(d, cx, cy, r_outer, PANEL)
    draw_circle_fill(d, cx, cy, r_face, (8, 4, 20, 255))

    # Tick marks (12 at each hour)
    for i in range(12):
        angle = i * math.pi / 6 - math.pi / 2
        r_in  = r_face - max(3, size // 48)
        r_out = r_face - 1
        col = MAGENTA if i % 3 == 0 else (80, 40, 80, 200)
        t_len = max(2, size // 48) if i % 3 == 0 else max(1, size // 80)
        for rr in range(int(r_in), int(r_out) + 1):
            px = cx + round(rr * math.cos(angle))
            py = cy + round(rr * math.sin(angle))
            rect(d, px - t_len // 2, py - t_len // 2, t_len, t_len, col)

    # Hour hand (pointing to ~10)
    hand_angle_h = (10 / 12) * 2 * math.pi - math.pi / 2
    hand_len_h = int(r_face * 0.52)
    hand_w_h = max(2, size // 80)
    for rr in range(0, hand_len_h + 1):
        hpx = cx + round(rr * math.cos(hand_angle_h))
        hpy = cy + round(rr * math.sin(hand_angle_h))
        rect(d, hpx - hand_w_h, hpy - hand_w_h, hand_w_h * 2 + 1, hand_w_h * 2 + 1, CYAN)

    # Minute hand (pointing to ~2)
    hand_angle_m = (2 / 12) * 2 * math.pi - math.pi / 2
    hand_len_m = int(r_face * 0.72)
    hand_w_m = max(1, size // 100)
    for rr in range(0, hand_len_m + 1):
        hpx = cx + round(rr * math.cos(hand_angle_m))
        hpy = cy + round(rr * math.sin(hand_angle_m))
        rect(d, hpx - hand_w_m, hpy - hand_w_m, hand_w_m * 2 + 1, hand_w_m * 2 + 1, CYAN)

    # Center dot
    r_dot = max(3, size // 48)
    draw_circle_fill(d, cx, cy, r_dot, YELLOW)
    draw_circle_fill(d, cx, cy, r_dot - 1, (255, 255, 120, 255))

    # Pixel "8-bit" corner decorations (small squares)
    corner_sz = max(2, size // 64)
    corners = [(ox, oy), (ox + cs - corner_sz, oy),
               (ox, oy + cs - corner_sz), (ox + cs - corner_sz, oy + cs - corner_sz)]
    for (ccx, ccy) in corners:
        rect(d, ccx, ccy, corner_sz, corner_sz, MAGENTA)

    # Glow ring (thin outer ring in cyan)
    r_ring = r_outer + max(1, size // 128)
    for angle_i in range(360):
        angle = angle_i * math.pi / 180
        rx = cx + round(r_ring * math.cos(angle))
        ry = cy + round(r_ring * math.sin(angle))
        if 0 <= rx < size and 0 <= ry < size:
            d.point((rx, ry), fill=(0, 200, 220, 120))

    return img


def save_icon(img, name):
    path = os.path.join(ASSETS, name)
    img.save(path)
    print(f'  wrote {name}  {img.size}')


# 192×192
img192 = draw_icon(192, padding=0)
save_icon(img192, 'icon-192.png')

# 512×512
img512 = draw_icon(512, padding=0)
save_icon(img512, 'icon-512.png')

# Maskable 512×512 with 20% safe-area padding (102px per side)
safe = int(512 * 0.10)  # 10% each side = 20% total safe zone
img_mask = draw_icon(512, padding=safe)
save_icon(img_mask, 'icon-maskable.png')

print('Icons done.')
