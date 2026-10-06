"""Generate art assets for Mech, Abyss, and Alchemy themes.

Outputs:
  timer/assets/thumb_mech.png, mech.png, mech.json
  timer/assets/thumb_abyss.png, abyss.png, abyss.json
  timer/assets/thumb_alchemy.png, alchemy.png, alchemy.json
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
# 1. THEME 1: MECH (CYBERPUNK ORBITAL LAUNCH)
# ════════════════════════════════════════════════════════════════════════════════
def gen_mech():
    TW, TH = 96, 128
    # ── Thumbnail ──
    img = Image.new('RGBA', (TW, TH), (12, 10, 20, 255))
    d = ImageDraw.Draw(img)
    # Shaft perspective walls
    for y in range(TH):
        t = y / TH
        wall_col = lerp_color(h2c('#181028'), h2c('#080410'), t)
        d.line([(0, y), (TW, y)], fill=wall_col)
    # Shaft vertical guide rails
    d.line([(14, 0), (14, TH)], fill=h2c('#00f5d4', 80))
    d.line([(TW - 15, 0), (TW - 15, TH)], fill=h2c('#00f5d4', 80))
    # Hazard yellow stripes on side gantries
    for gy in range(10, TH, 16):
        d.line([(2, gy), (12, gy + 8)], fill=h2c('#ffd166', 220), width=2)
        d.line([(TW - 14, gy), (TW - 4, gy + 8)], fill=h2c('#ffd166', 220), width=2)
    # Overhead open blast doors with starry sky
    d.polygon([(24, 0), (TW - 25, 0), (TW - 32, 22), (31, 22)], fill=h2c('#050114'))
    d.point((42, 8), fill=h2c('#ffffff'))
    d.point((56, 14), fill=h2c('#00f5d4'))
    # Mech Silhouette & Glowing Visor
    cx, cy = TW // 2, 76
    # Body chassis
    d.rectangle([cx - 14, cy - 20, cx + 14, cy + 18], fill=h2c('#221e35'))
    d.rectangle([cx - 18, cy - 14, cx + 18, cy - 4], fill=h2c('#35304e')) # shoulders
    # Visor glow
    d.rectangle([cx - 8, cy - 18, cx + 8, cy - 15], fill=h2c('#00f5d4'))
    draw_radial_glow(img, cx, cy - 16, 10, (0, 245, 212, 160), (0, 0, 0, 0))
    # Rocket Thrusters under mech
    draw_radial_glow(img, cx - 8, cy + 26, 14, (0, 245, 212, 220), (255, 100, 0, 0))
    draw_radial_glow(img, cx + 8, cy + 26, 14, (0, 245, 212, 220), (255, 100, 0, 0))
    d.polygon([(cx - 12, cy + 18), (cx - 4, cy + 18), (cx - 8, cy + 34)], fill=h2c('#ffffff'))
    d.polygon([(cx + 4, cy + 18), (cx + 12, cy + 18), (cx + 8, cy + 34)], fill=h2c('#ffffff'))
    img.save(os.path.join(ASSETS, 'thumb_mech.png'))
    print("  Wrote thumb_mech.png")

    # ── Spritesheet (mech.png + mech.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # mech_body (48x48)
    mx, my = 0, 0
    sd.rectangle([mx + 12, my + 8, mx + 36, my + 44], fill=h2c('#28223d')) # torso
    sd.rectangle([mx + 6, my + 14, mx + 42, my + 26], fill=h2c('#3d3558')) # shoulders
    sd.rectangle([mx + 16, my + 6, mx + 32, my + 16], fill=h2c('#1a152b')) # head
    sd.line([(mx + 18, my + 10), (mx + 30, my + 10)], fill=h2c('#00f5d4'), width=2) # visor
    sd.rectangle([mx + 20, my + 24, mx + 28, my + 32], fill=h2c('#ff2a5f')) # chest reactor
    add_f('mech_body', mx, my, 48, 48)

    # gantry_left, gantry_right (24x48)
    gx, gy = 52, 0
    sd.rectangle([gx, gy, gx + 20, gy + 48], fill=h2c('#221c33'))
    for i in range(4):
        sd.line([(gx + 2, gy + i * 12), (gx + 18, gy + i * 12 + 8)], fill=h2c('#ffd166'), width=2)
    add_f('gantry_left', gx, gy, 24, 48)

    gx2, gy2 = 80, 0
    sd.rectangle([gx2 + 4, gy2, gx2 + 24, gy2 + 48], fill=h2c('#221c33'))
    for i in range(4):
        sd.line([(gx2 + 6, gy2 + i * 12), (gx2 + 22, gy2 + i * 12 + 8)], fill=h2c('#ffd166'), width=2)
    add_f('gantry_right', gx2, gy2, 24, 48)

    # thruster_flame0..2 (16x32)
    for i in range(3):
        tx, ty = 110 + i * 20, 0
        w = 8 + i * 2
        sd.polygon([(tx + 8 - w//2, ty + 2), (tx + 8 + w//2, ty + 2), (tx + 8, ty + 26 + i * 2)], fill=h2c('#00f5d4'))
        sd.polygon([(tx + 8 - w//4, ty + 2), (tx + 8 + w//4, ty + 2), (tx + 8, ty + 16)], fill=h2c('#ffffff'))
        add_f(f'flame{i}', tx, ty, 16, 32)

    # warning sign (32x16)
    wx, wy = 175, 0
    sd.rectangle([wx, wy, wx + 32, wy + 16], fill=h2c('#ff2a5f'))
    sd.rectangle([wx + 2, wy + 2, wx + 30, wy + 14], fill=h2c('#100515'))
    sd.line([(wx + 8, wy + 8), (wx + 24, wy + 8)], fill=h2c('#ffd166'), width=2)
    add_f('warning_hud', wx, wy, 32, 16)

    # sparks (16x16)
    for i in range(3):
        sx, sy = 210 + i * 15, 0
        sd.point((sx + 4, sy + 4), fill=h2c('#ffffff'))
        sd.point((sx + 8, sy + 8), fill=h2c('#ffd166'))
        sd.point((sx + 5, sy + 10), fill=h2c('#00f5d4'))
        add_f(f'spark{i}', sx, sy, 16, 16)

    simg.save(os.path.join(ASSETS, 'mech.png'))
    with open(os.path.join(ASSETS, 'mech.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote mech.png+json")

# ════════════════════════════════════════════════════════════════════════════════
# 2. THEME 2: ABYSS (DEEP SEA LEVIATHAN)
# ════════════════════════════════════════════════════════════════════════════════
def gen_abyss():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    # Ocean gradient: sunlight cyan at top to midnight abyss at bottom
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#063852'), h2c('#010712'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # God rays at surface
    for rx in [15, 38, 65, 82]:
        d.polygon([(rx, 0), (rx + 8, 0), (rx + 22, 50), (rx - 5, 50)], fill=(0, 245, 212, 18))

    # Bathysphere Submersible
    cx, cy = TW // 2, 45
    draw_circle_fill(d, cx, cy, 14, h2c('#b87d3b')) # bronze hull
    draw_circle_fill(d, cx, cy, 11, h2c('#855422'))
    draw_circle_fill(d, cx, cy, 6, h2c('#00f5d4'))  # glowing porthole
    # Dual Headlight Cones shining down into darkness
    d.polygon([(cx - 10, cy + 10), (cx + 10, cy + 10), (cx + 35, TH), (cx - 35, TH)], fill=(0, 245, 212, 35))

    # Bioluminescent Jellyfish
    draw_radial_glow(img, 24, 75, 12, (0, 245, 212, 180), (0, 0, 0, 0))
    d.arc([18, 68, 30, 80], 180, 0, fill=h2c('#ffffff'))
    for jx in [20, 24, 28]:
        d.line([(jx, 74), (jx - 2, 86)], fill=h2c('#00f5d4', 200))

    # Giant Leviathan Eye emerging in the deep trench
    draw_radial_glow(img, cx, 108, 16, (0, 255, 170, 220), (0, 0, 0, 0))
    d.ellipse([cx - 12, 104, cx + 12, 112], fill=h2c('#00382b'))
    d.ellipse([cx - 4, 104, cx + 4, 112], fill=h2c('#00ffbb'))
    img.save(os.path.join(ASSETS, 'thumb_abyss.png'))
    print("  Wrote thumb_abyss.png")

    # ── Spritesheet (abyss.png + abyss.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # submersible (32x32)
    bx, by = 0, 0
    draw_circle_fill(sd, bx + 16, by + 16, 14, h2c('#c98a44'))
    draw_circle_fill(sd, bx + 16, by + 16, 7, h2c('#00f5d4'))
    sd.rectangle([bx + 14, by + 1, bx + 18, by + 5], fill=h2c('#8c5923')) # hatch
    sd.rectangle([bx + 1, by + 14, bx + 5, by + 18], fill=h2c('#ffd166')) # lamp
    add_f('submersible', bx, by, 32, 32)

    # jelly0..2 (24x24)
    for i in range(3):
        jx, jy = 36 + i * 26, 0
        jcol = h2c('#00f5d4') if i == 0 else h2c('#9d4edd') if i == 1 else h2c('#ffd166')
        sd.arc([jx + 4, jy + 2, jx + 20, jy + 14], 180, 0, fill=jcol)
        for tx in [jx + 6, jx + 12, jx + 18]:
            sd.line([(tx, jy + 8), (tx + ((i*2)%3 - 1), jy + 20)], fill=jcol)
        add_f(f'jelly{i}', jx, jy, 24, 24)

    # anglerfish (32x24)
    ax, ay = 118, 0
    draw_circle_fill(sd, ax + 16, ay + 12, 10, h2c('#12222b'))
    sd.point((ax + 20, ay + 9), fill=h2c('#ffffff')) # eye
    sd.arc([ax + 8, ay + 1, ax + 18, ay + 12], 180, 360, fill=h2c('#ffffff')) # lure rod
    sd.point((ax + 8, ay + 4), fill=h2c('#00f5d4')) # glowing bulb
    add_f('anglerfish', ax, ay, 32, 24)

    # leviathan_head (48x48)
    lx, ly = 154, 0
    draw_radial_glow(simg, lx + 24, ly + 24, 22, (0, 255, 170, 180), (0, 0, 0, 0))
    sd.polygon([(lx + 4, ly + 24), (lx + 24, ly + 8), (lx + 44, ly + 24), (lx + 24, ly + 40)], fill=h2c('#042b24'))
    # Crown frills
    sd.polygon([(lx + 12, ly + 8), (lx + 16, ly + 2), (lx + 20, ly + 8)], fill=h2c('#00ffbb'))
    sd.polygon([(lx + 28, ly + 8), (lx + 32, ly + 2), (lx + 36, ly + 8)], fill=h2c('#00ffbb'))
    # Eyes
    sd.ellipse([lx + 16, ly + 20, lx + 22, ly + 26], fill=h2c('#ffffff'))
    sd.ellipse([lx + 26, ly + 20, lx + 32, ly + 26], fill=h2c('#ffffff'))
    sd.point((lx + 19, ly + 23), fill=h2c('#00ffbb'))
    sd.point((lx + 29, ly + 23), fill=h2c('#00ffbb'))
    add_f('leviathan_head', lx, ly, 48, 48)

    # bubble0..2 (16x16)
    for i in range(3):
        ux, uy = 206 + i * 16, 0
        r = 2 + i * 2
        sd.ellipse([ux + 8 - r, uy + 8 - r, ux + 8 + r, uy + 8 + r], outline=h2c('#00f5d4', 200))
        sd.point((ux + 8 - r + 1, uy + 8 - r + 1), fill=h2c('#ffffff'))
        add_f(f'bubble{i}', ux, uy, 16, 16)

    simg.save(os.path.join(ASSETS, 'abyss.png'))
    with open(os.path.join(ASSETS, 'abyss.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote abyss.png+json")

# ════════════════════════════════════════════════════════════════════════════════
# 3. THEME 3: ALCHEMY (THE HOURGLASS OF LIQUID LIGHT)
# ════════════════════════════════════════════════════════════════════════════════
def gen_alchemy():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (15, 8, 18, 255))
    d = ImageDraw.Draw(img)
    # Mahogany / mystical velvet background
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#1c0b20'), h2c('#0a040d'), t)
        d.line([(0, y), (TW, y)], fill=col)

    cx, cy = TW // 2, 64
    # Sacred Geometry Mandala circle behind
    d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], outline=h2c('#ffd166', 90))
    d.polygon([(cx, cy - 36), (cx + 31, cy + 18), (cx - 31, cy + 18)], outline=h2c('#00f5d4', 70))
    d.polygon([(cx, cy + 36), (cx + 31, cy - 18), (cx - 31, cy - 18)], outline=h2c('#00f5d4', 70))

    # Ornate Brass Hourglass Frame
    hw, hh = 26, 44
    d.rectangle([cx - hw, cy - hh, cx + hw, cy - hh + 4], fill=h2c('#d4af37')) # top plate
    d.rectangle([cx - hw, cy + hh - 4, cx + hw, cy + hh], fill=h2c('#d4af37')) # bottom plate
    d.line([(cx - hw + 2, cy - hh), (cx - hw + 2, cy + hh)], fill=h2c('#aa820a'), width=2)
    d.line([(cx + hw - 2, cy - hh), (cx + hw - 2, cy + hh)], fill=h2c('#aa820a'), width=2)

    # Top bulb (liquid light)
    d.polygon([(cx - 18, cy - hh + 6), (cx + 18, cy - hh + 6), (cx + 3, cy - 2), (cx - 3, cy - 2)], outline=h2c('#ffffff', 140))
    d.polygon([(cx - 14, cy - 24), (cx + 14, cy - 24), (cx + 2, cy - 3), (cx - 2, cy - 3)], fill=h2c('#ffd166', 220))

    # Capillary stream
    d.line([(cx, cy - 2), (cx, cy + 16)], fill=h2c('#ffffff'), width=1)

    # Bottom bulb filling with liquid light
    d.polygon([(cx - 3, cy + 2), (cx + 3, cy + 2), (cx + 18, cy + hh - 6), (cx - 18, cy + hh - 6)], outline=h2c('#ffffff', 140))
    d.polygon([(cx - 15, cy + 22), (cx + 15, cy + 22), (cx + 17, cy + hh - 6), (cx - 17, cy + hh - 6)], fill=h2c('#00f5d4', 230))
    draw_radial_glow(img, cx, cy + 30, 16, (0, 245, 212, 180), (212, 175, 55, 0))

    img.save(os.path.join(ASSETS, 'thumb_alchemy.png'))
    print("  Wrote thumb_alchemy.png")

    # ── Spritesheet (alchemy.png + alchemy.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # drop0..2 (16x16)
    for i in range(3):
        dx, dy = i * 18, 0
        sd.polygon([(dx + 8, dy + 2), (dx + 12, dy + 12), (dx + 4, dy + 12)], fill=h2c('#ffd166'))
        sd.point((dx + 8, dy + 8), fill=h2c('#ffffff'))
        add_f(f'drop{i}', dx, dy, 16, 16)

    # runes: rune_fire, rune_water, rune_air, rune_aether (16x16)
    for i, rname in enumerate(['rune_fire', 'rune_water', 'rune_air', 'rune_aether']):
        rx, ry = 56 + i * 18, 0
        sd.rectangle([rx + 2, ry + 2, rx + 14, ry + 14], outline=h2c('#d4af37'))
        if i == 0: sd.polygon([(rx + 8, ry + 4), (rx + 13, ry + 12), (rx + 3, ry + 12)], outline=h2c('#ff2a5f'))
        elif i == 1: sd.polygon([(rx + 8, ry + 12), (rx + 13, ry + 4), (rx + 3, ry + 4)], outline=h2c('#00f5d4'))
        elif i == 2: sd.line([(rx + 4, ry + 8), (rx + 12, ry + 8)], fill=h2c('#ffffff'))
        else: draw_circle_fill(sd, rx + 8, ry + 8, 3, h2c('#9d4edd'))
        add_f(rname, rx, ry, 16, 16)

    # lotus_petal (24x24) - used in finale bloom
    px, py = 130, 0
    draw_radial_glow(simg, px + 12, py + 12, 10, (255, 255, 255, 255), (0, 245, 212, 0))
    sd.polygon([(px + 12, py + 2), (px + 20, py + 12), (px + 12, py + 22), (px + 4, py + 12)], fill=h2c('#00f5d4', 210))
    sd.line([(px + 12, py + 4), (px + 12, py + 20)], fill=h2c('#ffffff'))
    add_f('lotus_petal', px, py, 24, 24)

    # gear0, gear1 (24x24)
    for i in range(2):
        gx, gy = 160 + i * 28, 0
        gr = 9
        draw_circle_fill(sd, gx + 12, gy + 12, gr, h2c('#d4af37'))
        draw_circle_fill(sd, gx + 12, gy + 12, 4, h2c('#150812'))
        for tdeg in range(0, 360, 45):
            trad = math.radians(tdeg)
            sd.line([(gx + 12, gy + 12), (gx + 12 + int(11 * math.cos(trad)), gy + 12 + int(11 * math.sin(trad)))], fill=h2c('#aa820a'), width=2)
        add_f(f'gear{i}', gx, gy, 24, 24)

    simg.save(os.path.join(ASSETS, 'alchemy.png'))
    with open(os.path.join(ASSETS, 'alchemy.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote alchemy.png+json")

if __name__ == '__main__':
    print("Generating assets for 3 new themes...")
    gen_mech()
    gen_abyss()
    gen_alchemy()
    print("Done!")
