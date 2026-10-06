"""Generate Supernova spritesheet (supernova.png + supernova.json) and thumbnail (thumb_supernova.png).

Outputs:
  timer/assets/supernova.png
  timer/assets/supernova.json
  timer/assets/thumb_supernova.png
"""
import sys, os, math, json
from PIL import Image, ImageDraw

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(ASSETS, exist_ok=True)

def new_sheet(w, h):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)

def h2c(hex_str, a=255):
    s = hex_str.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))

def draw_circle_fill(d, cx, cy, r, col):
    for dy in range(-r, r + 1):
        dx = int(math.sqrt(max(0, r * r - dy * dy)))
        if dx >= 0:
            d.rectangle([cx - dx, cy + dy, cx + dx, cy + dy], fill=col)

def draw_radial_glow(img, cx, cy, r, center_col, edge_col):
    px = img.load()
    w, h = img.size
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= r:
                t = dist / r
                x = cx + dx
                y = cy + dy
                if 0 <= x < w and 0 <= y < h:
                    col = lerp_color(center_col, edge_col, t)
                    # alpha blend
                    cur = px[x, y]
                    if cur[3] == 0:
                        px[x, y] = col
                    else:
                        alpha = col[3] / 255.0
                        nr = int(cur[0] * (1 - alpha) + col[0] * alpha)
                        ng = int(cur[1] * (1 - alpha) + col[1] * alpha)
                        nb = int(cur[2] * (1 - alpha) + col[2] * alpha)
                        na = min(255, cur[3] + col[3])
                        px[x, y] = (nr, ng, nb, na)

# ════════════════════════════════════════════════════════════════════════════════
# 1. GENERATE THUMBNAIL (96x128)
# ════════════════════════════════════════════════════════════════════════════════
def generate_thumbnail():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)

    # Deep space cosmic backdrop with nebula gradient
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#070214'), h2c('#15032a'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Nebula clouds (purple/cyan)
    draw_radial_glow(img, 30, 45, 45, (120, 20, 160, 60), (0, 0, 0, 0))
    draw_radial_glow(img, 70, 85, 40, (0, 180, 220, 50), (0, 0, 0, 0))

    # Background starfield
    import random
    rng = random.Random(42)
    for _ in range(55):
        sx = rng.randint(2, TW - 3)
        sy = rng.randint(2, TH - 3)
        brightness = rng.randint(140, 255)
        hue_roll = rng.random()
        if hue_roll < 0.3:
            star_col = (180, 220, 255, brightness) # blue-white
        elif hue_roll < 0.5:
            star_col = (255, 230, 170, brightness) # gold
        elif hue_roll < 0.6:
            star_col = (255, 170, 220, brightness) # magenta
        else:
            star_col = (255, 255, 255, brightness)
        d.point((sx, sy), fill=star_col)
        if rng.random() < 0.2:
            d.line([(sx - 1, sy), (sx + 1, sy)], fill=star_col)
            d.line([(sx, sy - 1), (sx, sy + 1)], fill=star_col)

    # Celestial Chrono-Ring (Astrolabe orbital track)
    cx, cy = TW // 2, 60
    ring_r = 34
    for a_deg in range(0, 360, 3):
        rad = math.radians(a_deg)
        rx = cx + int(ring_r * math.cos(rad))
        ry = cy + int(ring_r * math.sin(rad))
        if (a_deg % 30) == 0:
            d.rectangle([rx - 1, ry - 1, rx + 1, ry + 1], fill=h2c('#00f5d4', 240))
        elif (a_deg % 10) == 0:
            d.point((rx, ry), fill=h2c('#ffd166', 220))
        else:
            d.point((rx, ry), fill=h2c('#6a4c93', 140))

    # Accretion disk ellipse around center
    disk_a, disk_b = 28, 10
    for a_deg in range(0, 360, 2):
        rad = math.radians(a_deg)
        dx = cx + int(disk_a * math.cos(rad))
        dy = cy + int(disk_b * math.sin(rad))
        # Relativistic Doppler beaming: left approaching side is hot cyan, right is amber
        if math.sin(rad) > 0 or math.cos(rad) < 0:
            d.point((dx, dy), fill=h2c('#00f5d4', 230))
            d.point((dx, dy + 1), fill=h2c('#7000ff', 180))
        else:
            d.point((dx, dy), fill=h2c('#ff5e00', 210))
            d.point((dx, dy + 1), fill=h2c('#ff0055', 160))

    # Star Core (radiant glowing sphere)
    draw_radial_glow(img, cx, cy, 22, (255, 255, 255, 255), (0, 245, 212, 0))
    draw_radial_glow(img, cx, cy, 14, (255, 255, 255, 255), (120, 0, 255, 120))
    draw_circle_fill(d, cx, cy, 7, h2c('#ffffff'))

    # Cross flare spikes
    for length in [16, 26]:
        d.line([(cx - length, cy), (cx + length, cy)], fill=h2c('#ffffff', 180))
        d.line([(cx, cy - length), (cx, cy + length)], fill=h2c('#ffffff', 180))
    for diag in [9, 14]:
        d.line([(cx - diag, cy - diag), (cx + diag, cy + diag)], fill=h2c('#00f5d4', 120))
        d.line([(cx - diag, cy + diag), (cx + diag, cy - diag)], fill=h2c('#00f5d4', 120))

    # Orbiting space comets
    comet_angles = [0.8, 2.5, 4.3]
    for ca in comet_angles:
        cmx = cx + int((ring_r - 4) * math.cos(ca))
        cmy = cy + int((ring_r - 4) * math.sin(ca) * 0.7)
        d.rectangle([cmx - 1, cmy - 1, cmx + 1, cmy + 1], fill=h2c('#ffffff'))
        # tail
        tx = cmx - int(5 * math.cos(ca + 0.3))
        ty = cmy - int(5 * math.sin(ca + 0.3))
        d.line([(cmx, cmy), (tx, ty)], fill=h2c('#00f5d4', 180))

    # Bottom badge text/ornament
    d.line([(10, 112), (TW - 10, 112)], fill=h2c('#00f5d4', 100))
    d.rectangle([TW//2 - 2, 111, TW//2 + 2, 113], fill=h2c('#ffd166'))

    thumb_path = os.path.join(ASSETS, 'thumb_supernova.png')
    img.save(thumb_path)
    print(f'Wrote thumbnail: {thumb_path} ({TW}x{TH})')

# ════════════════════════════════════════════════════════════════════════════════
# 2. GENERATE SPRITESHEET (supernova.png + supernova.json)
# ════════════════════════════════════════════════════════════════════════════════
def generate_sheet():
    SW, SH = 256, 128
    img, d = new_sheet(SW, SH)
    frames = {}

    def add_frame(name, x, y, w, h):
        frames[name] = [x, y, w, h]

    # Sprite 1: core_blue (32x32) - Blue Hypergiant Core
    bx, by = 0, 0
    draw_radial_glow(img, bx + 16, by + 16, 15, (255, 255, 255, 255), (0, 245, 212, 0))
    draw_circle_fill(d, bx + 16, by + 16, 7, h2c('#00f5d4'))
    draw_circle_fill(d, bx + 16, by + 16, 4, h2c('#ffffff'))
    add_frame('core_blue', bx, by, 32, 32)

    # Sprite 2: core_gold (32x32) - Golden Solar Core
    gx, gy = 36, 0
    draw_radial_glow(img, gx + 16, gy + 16, 15, (255, 255, 255, 255), (255, 170, 0, 0))
    draw_circle_fill(d, gx + 16, gy + 16, 7, h2c('#ffbb00'))
    draw_circle_fill(d, gx + 16, gy + 16, 4, h2c('#ffffff'))
    add_frame('core_gold', gx, gy, 32, 32)

    # Sprite 3: core_red (32x32) - Crimson Supergiant Core
    rx, ry = 72, 0
    draw_radial_glow(img, rx + 16, ry + 16, 15, (255, 100, 100, 255), (255, 0, 60, 0))
    draw_circle_fill(d, rx + 16, ry + 16, 7, h2c('#ff2a55'))
    draw_circle_fill(d, rx + 16, ry + 16, 4, h2c('#ffffff'))
    add_frame('core_red', rx, ry, 32, 32)

    # Sprite 4: pulsar (32x32) - High speed neutron star with radiant cross
    px, py = 108, 0
    draw_circle_fill(d, px + 16, py + 16, 5, h2c('#ffffff'))
    draw_circle_fill(d, px + 16, py + 16, 3, h2c('#00f5d4'))
    d.line([(px + 2, py + 16), (px + 30, py + 16)], fill=h2c('#ffffff', 220))
    d.line([(px + 16, py + 2), (px + 16, py + 30)], fill=h2c('#ffffff', 220))
    d.line([(px + 7, py + 7), (px + 25, py + 25)], fill=h2c('#7000ff', 180))
    d.line([(px + 7, py + 25), (px + 25, py + 7)], fill=h2c('#7000ff', 180))
    add_frame('pulsar', px, py, 32, 32)

    # Sprite 5: blackhole (32x32) - Dark singularity with glowing photon sphere
    kx, ky = 144, 0
    draw_radial_glow(img, kx + 16, ky + 16, 15, (0, 245, 212, 180), (120, 0, 255, 0))
    draw_circle_fill(d, kx + 16, ky + 16, 9, h2c('#000000'))
    # Lensing ring
    for deg in range(0, 360, 10):
        rad = math.radians(deg)
        lx = kx + 16 + int(10 * math.cos(rad))
        ly = ky + 16 + int(10 * math.sin(rad))
        d.point((lx, ly), fill=h2c('#00f5d4', 220))
    add_frame('blackhole', kx, ky, 32, 32)

    # Sprite 6: comet0, comet1, comet2 (16x16 each)
    for i, ccol in enumerate(['#00f5d4', '#ffd166', '#ff2a70']):
        cx, cy = 180 + i * 18, 0
        draw_circle_fill(d, cx + 8, cy + 8, 3, h2c('#ffffff'))
        d.point((cx + 8, cy + 8), fill=h2c(ccol))
        d.line([(cx + 4, cy + 8), (cx + 12, cy + 8)], fill=h2c(ccol, 160))
        add_frame(f'comet{i}', cx, cy, 16, 16)

    # Row 2: Glyphs and Asteroids
    # Asteroids: rock0, rock1, rock2 (16x16)
    for i in range(3):
        ax, ay = i * 20, 36
        draw_circle_fill(d, ax + 8, ay + 8, 4 + i, h2c('#5e5070'))
        d.point((ax + 7, ay + 7), fill=h2c('#9c88b8'))
        d.point((ax + 10, ay + 9), fill=h2c('#2b2038'))
        add_frame(f'rock{i}', ax, ay, 16, 16)

    # Runes: rune0, rune1, rune2, rune3 (16x16) - Astrolabe dial markings
    for i in range(4):
        ux, uy = 64 + i * 20, 36
        d.rectangle([ux + 6, uy + 6, ux + 10, uy + 10], outline=h2c('#00f5d4', 220))
        if i == 0:
            d.line([(ux + 4, uy + 8), (ux + 12, uy + 8)], fill=h2c('#ffffff'))
        elif i == 1:
            d.line([(ux + 8, uy + 4), (ux + 8, uy + 12)], fill=h2c('#ffffff'))
        elif i == 2:
            d.line([(ux + 5, uy + 5), (ux + 11, uy + 11)], fill=h2c('#ffd166'))
        else:
            d.line([(ux + 5, uy + 11), (ux + 11, uy + 5)], fill=h2c('#ff2a70'))
        add_frame(f'rune{i}', ux, uy, 16, 16)

    # Sparkles: sparkle0..sparkle3 (16x16)
    for i in range(4):
        sx, sy = 148 + i * 18, 36
        sp_r = 3 + i
        d.line([(sx + 8 - sp_r, sy + 8), (sx + 8 + sp_r, sy + 8)], fill=h2c('#ffffff'))
        d.line([(sx + 8, sy + 8 - sp_r), (sx + 8, sy + 8 + sp_r)], fill=h2c('#ffffff'))
        d.point((sx + 8, sy + 8), fill=h2c('#00f5d4'))
        add_frame(f'sparkle{i}', sx, sy, 16, 16)

    # Save PNG and JSON
    png_path = os.path.join(ASSETS, 'supernova.png')
    json_path = os.path.join(ASSETS, 'supernova.json')
    img.save(png_path)
    with open(json_path, 'w') as f:
        json.dump(frames, f, indent=2)
    print(f'Wrote spritesheet: {png_path} ({SW}x{SH}) + {json_path} ({len(frames)} frames)')

if __name__ == '__main__':
    generate_thumbnail()
    generate_sheet()
