"""Generate high-aesthetic narrative pixel art assets for:
  1. Gundam Mech Lab Assembly & Catapult Sortie (mech)
  2. Living Deep Sea Aquarium & Leviathan Chomp (abyss)
  3. Chrono-Warp Living Eras & Reverse Hourglass (alchemy)

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
# 1. THEME 1: GUNDAM MECH LAB ASSEMBLY & CATAPULT SORTIE (mech)
# ════════════════════════════════════════════════════════════════════════════════
def gen_mech():
    TW, TH = 96, 128
    # ── Thumbnail ──
    img = Image.new('RGBA', (TW, TH), (12, 14, 24, 255))
    d = ImageDraw.Draw(img)
    # Hangar Lab Wall & Diagnostic Panels
    for y in range(TH):
        t = y / TH
        d.line([(0, y), (TW, y)], fill=lerp_color(h2c('#121626'), h2c('#1c2238'), t))
    # Laboratory Server Racks & Diagnostics
    for y_led in range(15, 60, 8):
        d.rectangle([4, y_led, 14, y_led + 4], fill=h2c('#00f5d4', 200))
        d.rectangle([TW - 16, y_led, TW - 6, y_led + 4], fill=h2c('#ffd166', 200))
    # Stationary Floor Launch Pad with Caution Stripes
    d.rectangle([10, TH - 22, TW - 10, TH - 8], fill=h2c('#22283a'))
    for hx in range(14, TW - 14, 8):
        d.polygon([(hx, TH - 12), (hx + 4, TH - 12), (hx + 2, TH - 8), (hx - 2, TH - 8)], fill=h2c('#ffd166'))
    # Gundam RX-78
    cx, cy = TW // 2, 68
    # Torso
    d.rectangle([cx - 10, cy - 8, cx + 10, cy + 12], fill=h2c('#2b55b8')) # Navy chest
    d.rectangle([cx - 8, cy + 12, cx + 8, cy + 22], fill=h2c('#e6e8f2')) # White waist
    d.rectangle([cx - 5, cy + 2, cx + 5, cy + 9], fill=h2c('#d92534')) # Red cockpit
    d.rectangle([cx - 9, cy - 4, cx - 4, cy], fill=h2c('#ffd166')) # Yellow vent L
    d.rectangle([cx + 4, cy - 4, cx + 9, cy], fill=h2c('#ffd166')) # Yellow vent R
    # Head & V-fin
    d.rectangle([cx - 6, cy - 18, cx + 6, cy - 8], fill=h2c('#ffffff'))
    d.polygon([(cx, cy - 12), (cx - 12, cy - 24), (cx - 9, cy - 24)], fill=h2c('#ffd166'))
    d.polygon([(cx, cy - 12), (cx + 12, cy - 24), (cx + 9, cy - 24)], fill=h2c('#ffd166'))
    d.rectangle([cx - 2, cy - 20, cx + 2, cy - 16], fill=h2c('#d92534'))
    d.point((cx - 3, cy - 11), fill=h2c('#00ff88'))
    d.point((cx + 3, cy - 11), fill=h2c('#00ff88'))
    draw_radial_glow(img, cx, cy - 11, 8, (0, 255, 136, 180), (0, 0, 0, 0))
    # Shoulders & Arms (holding beam rifle & shield)
    d.rectangle([cx - 16, cy - 9, cx - 10, cy + 8], fill=h2c('#ffffff'))
    d.rectangle([cx + 10, cy - 9, cx + 16, cy + 8], fill=h2c('#ffffff'))
    d.rectangle([cx + 12, cy + 2, cx + 22, cy + 18], fill=h2c('#d92534')) # Red shield
    d.rectangle([cx - 18, cy + 8, cx - 14, cy + 24], fill=h2c('#3a4050')) # Rifle
    # Legs & Red Feet on pad
    d.rectangle([cx - 9, cy + 22, cx - 2, cy + 44], fill=h2c('#ffffff'))
    d.rectangle([cx + 2, cy + 22, cx + 9, cy + 44], fill=h2c('#ffffff'))
    d.rectangle([cx - 11, cy + 42, cx - 1, cy + 46], fill=h2c('#d92534'))
    d.rectangle([cx + 1, cy + 42, cx + 11, cy + 46], fill=h2c('#d92534'))
    # Welder Drone hovering
    d.rectangle([cx - 30, cy - 22, cx - 18, cy - 14], fill=h2c('#505a72'))
    d.point((cx - 24, cy - 18), fill=h2c('#00f5d4'))
    d.line([(cx - 20, cy - 14), (cx - 10, cy - 4)], fill=h2c('#ffd166'), width=2)
    draw_radial_glow(img, cx - 10, cy - 4, 8, (255, 255, 255, 255), (255, 150, 0, 0))

    img.save(os.path.join(ASSETS, 'thumb_mech.png'))
    print("  Wrote thumb_mech.png (Gundam)")

    # ── Spritesheet (mech.png + mech.json) ──
    SW, SH = 384, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Inner Frame Skeleton (32x48) - Legs & Spine
    fx, fy = 0, 0
    sd.rectangle([fx + 13, fy + 4, fx + 19, fy + 24], fill=h2c('#505868'))
    sd.rectangle([fx + 10, fy + 24, fx + 14, fy + 46], fill=h2c('#3a4050'))
    sd.rectangle([fx + 18, fy + 24, fx + 22, fy + 46], fill=h2c('#3a4050'))
    sd.rectangle([fx + 7, fy + 44, fx + 14, fy + 47], fill=h2c('#282c38'))
    sd.rectangle([fx + 18, fy + 44, fx + 25, fy + 47], fill=h2c('#282c38'))
    add_f('frame_legs', fx, fy, 32, 48)

    # 2. Torso Armor Module (32x32)
    tx, ty = 34, 0
    sd.rectangle([tx + 6, ty + 4, tx + 26, ty + 20], fill=h2c('#2b55b8'))
    sd.rectangle([tx + 12, ty + 12, tx + 20, ty + 24], fill=h2c('#d92534'))
    sd.rectangle([tx + 7, ty + 8, tx + 11, ty + 12], fill=h2c('#ffd166'))
    sd.rectangle([tx + 21, ty + 8, tx + 25, ty + 12], fill=h2c('#ffd166'))
    add_f('armor_torso', tx, ty, 32, 32)

    # 3. Gundam Head with Golden V-Fin (24x24)
    hx, hy = 68, 0
    sd.rectangle([hx + 7, hy + 9, hx + 17, hy + 22], fill=h2c('#ffffff'))
    sd.polygon([(hx + 12, hy + 13), (hx + 2, hy + 2), (hx + 5, hy + 2)], fill=h2c('#ffd166'))
    sd.polygon([(hx + 12, hy + 13), (hx + 22, hy + 2), (hx + 19, hy + 2)], fill=h2c('#ffd166'))
    sd.rectangle([hx + 10, hy + 5, hx + 14, hy + 9], fill=h2c('#d92534'))
    sd.point((hx + 9, hy + 15), fill=h2c('#00ff88'))
    sd.point((hx + 15, hy + 15), fill=h2c('#00ff88'))
    add_f('gundam_head', hx, hy, 24, 24)

    # 4. Articulated Arms: Beam Rifle & Shield (24x36)
    ax, ay = 94, 0
    sd.rectangle([ax + 4, ay + 2, ax + 20, ay + 14], fill=h2c('#ffffff'))
    sd.rectangle([ax + 8, ay + 14, ax + 14, ay + 26], fill=h2c('#d0d4de'))
    sd.rectangle([ax + 6, ay + 22, ax + 18, ay + 34], fill=h2c('#3a4050'))
    add_f('arm_rifle', ax, ay, 24, 36)

    # 5. Welder Drone (24x24)
    dx, dy = 120, 0
    sd.rectangle([dx + 4, dy + 4, dx + 20, dy + 14], fill=h2c('#4a5568'))
    sd.rectangle([dx + 9, dy + 7, dx + 15, dy + 11], fill=h2c('#00f5d4')) # Sensor lens
    sd.line([(dx + 12, dy + 14), (dx + 18, dy + 22)], fill=h2c('#ffd166'), width=2)
    add_f('weld_arm', dx, dy, 24, 24)

    # 6. Vernier Jet Boost Flames (24x36)
    for i in range(3):
        vx, vy = 146 + i * 26, 0
        w = 10 + i * 2
        sd.polygon([(vx + 12 - w//2, vy + 2), (vx + 12 + w//2, vy + 2), (vx + 12, vy + 30 + i * 2)], fill=h2c('#ff5500'))
        sd.polygon([(vx + 12 - w//4, vy + 2), (vx + 12 + w//4, vy + 2), (vx + 12, vy + 20)], fill=h2c('#ffd166'))
        sd.polygon([(vx + 12 - 2, vy + 2), (vx + 12 + 2, vy + 2), (vx + 12, vy + 10)], fill=h2c('#ffffff'))
        add_f(f'jet_flame{i}', vx, vy, 24, 36)

    # 7. Massive Lab Blast Hangar Doors (36x64 each)
    door_x, door_y = 226, 0
    sd.rectangle([door_x, door_y, door_x + 36, door_y + 64], fill=h2c('#1c2030'))
    sd.rectangle([door_x + 4, door_y + 4, door_x + 32, door_y + 60], fill=h2c('#262d42'))
    # Heavy lock bolts & hazard stripe
    for by in range(door_y + 8, door_y + 56, 12):
        sd.rectangle([door_x + 28, by, door_x + 34, by + 4], fill=h2c('#ffd166'))
    add_f('hangar_door', door_x, door_y, 36, 64)

    # 8. Fixed Floor Launch Cradle Pad (64x20)
    lx, ly = 264, 0
    sd.rectangle([lx, ly, lx + 64, ly + 14], fill=h2c('#2b3244'))
    sd.rectangle([lx, ly + 14, lx + 64, ly + 18], fill=h2c('#1a1f2c'))
    # Foot clamp brackets
    sd.rectangle([lx + 16, ly - 4, lx + 24, ly + 8], fill=h2c('#ffd166'))
    sd.rectangle([lx + 40, ly - 4, lx + 48, ly + 8], fill=h2c('#ffd166'))
    add_f('launch_cradle', lx, ly, 64, 20)

    # 9. Sparks (16x16)
    for i in range(3):
        sx, sy = 330, i * 18
        sd.point((sx + 6, sy + 6), fill=h2c('#ffffff'))
        sd.point((sx + 10, sy + 8), fill=h2c('#ffd166'))
        sd.point((sx + 8, sy + 12), fill=h2c('#ff8800'))
        add_f(f'spark{i}', sx, sy, 16, 16)

    simg.save(os.path.join(ASSETS, 'mech.png'))
    with open(os.path.join(ASSETS, 'mech.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote mech.png+json (Gundam Lab & Hangar Sortie)")

# ════════════════════════════════════════════════════════════════════════════════
# 2. THEME 2: LIVING DEEP SEA AQUARIUM & LEVIATHAN CHOMP (abyss)
# ════════════════════════════════════════════════════════════════════════════════
def gen_abyss():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    # Ocean gradient
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#074868'), h2c('#01050d'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Swimming fish in background (aquarium life)
    d.polygon([(18, 30), (28, 26), (28, 34)], fill=h2c('#ff6b4a')) # Clownfish
    d.polygon([(70, 48), (80, 44), (80, 52)], fill=h2c('#00f5d4')) # Blue tang

    # Bathysphere Submersible
    cx, cy = TW // 2, 48
    draw_circle_fill(d, cx, cy, 14, h2c('#b87d3b'))
    draw_circle_fill(d, cx, cy, 7, h2c('#00f5d4'))
    # Headlight beam
    d.polygon([(cx - 8, cy + 10), (cx + 8, cy + 10), (cx + 38, TH - 25), (cx - 38, TH - 25)], fill=(0, 245, 212, 40))

    # Giant Leviathan JAWS rising from the bottom!
    jaw_y = TH - 20
    draw_radial_glow(img, cx, jaw_y, 30, (0, 255, 150, 180), (0, 0, 0, 0))
    d.ellipse([cx - 24, jaw_y - 12, cx - 14, jaw_y - 4], fill=h2c('#ffdd00'))
    d.ellipse([cx + 14, jaw_y - 12, cx + 24, jaw_y - 4], fill=h2c('#ffdd00'))
    d.point((cx - 19, jaw_y - 8), fill=h2c('#000000'))
    d.point((cx + 19, jaw_y - 8), fill=h2c('#000000'))
    for fx in range(cx - 30, cx + 32, 8):
        d.polygon([(fx, TH), (fx + 4, TH), (fx + 2, jaw_y + 4)], fill=h2c('#ffffff'))

    img.save(os.path.join(ASSETS, 'thumb_abyss.png'))
    print("  Wrote thumb_abyss.png (Leviathan Chomp)")

    # ── Spritesheet (abyss.png + abyss.json) ──
    SW, SH = 384, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Bathysphere Sub (32x32)
    bx, by = 0, 0
    draw_circle_fill(sd, bx + 16, by + 16, 14, h2c('#c98a44'))
    draw_circle_fill(sd, bx + 16, by + 16, 7, h2c('#00f5d4'))
    sd.rectangle([bx + 14, by + 1, bx + 18, by + 5], fill=h2c('#8c5923'))
    add_f('submersible', bx, by, 32, 32)

    # 2. Sea Turtle (36x24) - animated flippers
    tx, ty = 36, 0
    draw_circle_fill(sd, tx + 18, ty + 12, 10, h2c('#3b8c54'))
    sd.point((tx + 29, ty + 12), fill=h2c('#ffffff'))
    sd.line([(tx + 14, ty + 2), (tx + 25, ty + 8)], fill=h2c('#2b683e'), width=3)
    sd.line([(tx + 14, ty + 22), (tx + 25, ty + 16)], fill=h2c('#2b683e'), width=3)
    add_f('sea_turtle', tx, ty, 36, 24)

    # 3. Giant Kraken Squid (36x40)
    kx, ky = 76, 0
    draw_circle_fill(sd, kx + 18, ky + 14, 12, h2c('#9c3b4a'))
    sd.ellipse([kx + 22, ky + 10, kx + 28, ky + 16], fill=h2c('#ffd166'))
    sd.point((kx + 25, ky + 13), fill=h2c('#000000'))
    for t_i in [6, 12, 18, 24, 30]:
        sd.line([(kx + 18, ky + 22), (kx + t_i, ky + 38)], fill=h2c('#b84658'), width=2)
    add_f('kraken_squid', kx, ky, 36, 40)

    # 4. Sunken Atlantean Column (24x48)
    cx, cy = 116, 0
    sd.rectangle([cx + 4, cy + 4, cx + 20, cy + 8], fill=h2c('#6a8c88'))
    sd.rectangle([cx + 6, cy + 8, cx + 18, cy + 42], fill=h2c('#4a6864'))
    sd.rectangle([cx + 2, cy + 42, cx + 22, cy + 46], fill=h2c('#6a8c88'))
    # Glowing cyan glyph
    sd.line([(cx + 10, cy + 20), (cx + 14, cy + 20)], fill=h2c('#00f5d4'), width=2)
    sd.line([(cx + 12, cy + 18), (cx + 12, cy + 26)], fill=h2c('#00f5d4'), width=2)
    add_f('atlantis_column', cx, cy, 24, 48)

    # 5. Colossal Leviathan JAWS (72x56)
    jx, jy = 144, 0
    draw_radial_glow(simg, jx + 36, jy + 28, 26, (0, 255, 170, 220), (0, 0, 0, 0))
    sd.polygon([(jx + 4, jy + 10), (jx + 36, jy + 2), (jx + 68, jy + 10), (jx + 56, jy + 28), (jx + 16, jy + 28)], fill=h2c('#03241b'))
    for tooth_x in range(jx + 12, jx + 62, 6):
        sd.polygon([(tooth_x, jy + 24), (tooth_x + 3, jy + 24), (tooth_x + 1, jy + 34)], fill=h2c('#ffffff'))
    sd.ellipse([jx + 16, jy + 8, jx + 24, jy + 14], fill=h2c('#ffd166'))
    sd.ellipse([jx + 48, jy + 8, jx + 56, jy + 14], fill=h2c('#ffd166'))
    sd.point((jx + 20, jy + 11), fill=h2c('#000000'))
    sd.point((jx + 52, jy + 11), fill=h2c('#000000'))
    add_f('leviathan_jaws', jx, jy, 72, 56)

    # 6. Colorful Tropical Reef Fish (16x12 each)
    fx1, fy1 = 220, 0
    sd.polygon([(fx1 + 2, fy1 + 6), (fx1 + 10, fy1 + 2), (fx1 + 14, fy1 + 6), (fx1 + 10, fy1 + 10)], fill=h2c('#ff6b4a')) # Clownfish
    sd.line([(fx1 + 7, fy1 + 3), (fx1 + 7, fy1 + 9)], fill=h2c('#ffffff'), width=2)
    add_f('fish_clown', fx1, fy1, 16, 12)

    fx2, fy2 = 240, 0
    sd.polygon([(fx2 + 2, fy2 + 6), (fx2 + 10, fy2 + 2), (fx2 + 14, fy2 + 6), (fx2 + 10, fy2 + 10)], fill=h2c('#00f5d4')) # Blue Tang
    sd.point((fx2 + 12, fy2 + 6), fill=h2c('#ffd166'))
    add_f('fish_tang', fx2, fy2, 16, 12)

    # 7. Bioluminescent Jellyfish (16x24)
    jx1, jy1 = 260, 0
    draw_circle_fill(sd, jx1 + 8, jy1 + 8, 6, h2c('#b5179e', 220))
    for tj in [4, 8, 12]:
        sd.line([(jx1 + tj, jy1 + 12), (jx1 + tj + (tj%2)*2, jy1 + 22)], fill=h2c('#00f5d4', 180), width=1)
    add_f('jellyfish_glow', jx1, jy1, 16, 24)

    # 8. Deep-Sea Anglerfish with Glowing Lure (24x20)
    an_x, an_y = 280, 0
    sd.rectangle([an_x + 6, an_y + 6, an_x + 22, an_y + 18], fill=h2c('#121820'))
    sd.polygon([(an_x + 14, an_y + 16), (an_x + 22, an_y + 16), (an_x + 18, an_y + 20)], fill=h2c('#000000')) # Jaws
    # Teeth
    sd.point((an_x + 16, an_y + 15), fill=h2c('#ffffff'))
    sd.point((an_x + 19, an_y + 15), fill=h2c('#ffffff'))
    # Angler stalk & glowing bulb
    sd.line([(an_x + 10, an_y + 6), (an_x + 18, an_y + 2)], fill=h2c('#6a7888'), width=1)
    draw_circle_fill(sd, an_x + 20, an_y + 2, 2, h2c('#ffd166'))
    add_f('anglerfish', an_x, an_y, 24, 20)

    # 9. Gulper Eel (32x16)
    gx, gy = 308, 0
    sd.polygon([(gx + 12, gy + 4), (gx + 30, gy + 4), (gx + 22, gy + 12)], fill=h2c('#1a202c'))
    sd.point((gx + 24, gy + 6), fill=h2c('#00f5d4')) # eye
    sd.line([(gx + 2, gy + 8), (gx + 12, gy + 8)], fill=h2c('#1a202c'), width=2) # tail
    sd.point((gx + 2, gy + 8), fill=h2c('#00ffbb')) # glowing tail tip
    add_f('gulper_eel', gx, gy, 32, 16)

    # Bubbles (16x16)
    for i in range(3):
        ux, uy = 344 + i * 12, 0
        r = 2 + i * 2
        sd.ellipse([ux + 6 - r, uy + 6 - r, ux + 6 + r, uy + 6 + r], outline=h2c('#00f5d4', 200))
        add_f(f'bubble{i}', ux, uy, 16, 16)

    simg.save(os.path.join(ASSETS, 'abyss.png'))
    with open(os.path.join(ASSETS, 'abyss.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote abyss.png+json (Living Aquarium & Leviathan Chomp)")

# ════════════════════════════════════════════════════════════════════════════════
# 3. THEME 3: CHRONO-WARP: LIVING ERAS & REVERSE HOURGLASS (alchemy)
# ════════════════════════════════════════════════════════════════════════════════
def gen_alchemy():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (18, 10, 24, 255))
    d = ImageDraw.Draw(img)
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#2b1038'), h2c('#0a0312'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Big unmistakable Ornate Celestial Hourglass
    cx, cy = TW // 2, 54
    hw, hh = 20, 36
    # Brass top & bottom arch caps
    d.rectangle([cx - hw, cy - hh, cx + hw, cy - hh + 6], fill=h2c('#d4af37'))
    d.rectangle([cx - hw, cy + hh - 6, cx + hw, cy + hh], fill=h2c('#d4af37'))
    # Golden finials
    draw_circle_fill(d, cx, cy - hh - 3, 4, h2c('#ffd166'))
    draw_circle_fill(d, cx, cy + hh + 3, 4, h2c('#ffd166'))
    # Side filigree pillars
    d.line([(cx - hw + 2, cy - hh), (cx - hw + 2, cy + hh)], fill=h2c('#aa820a'), width=2)
    d.line([(cx + hw - 2, cy - hh), (cx + hw - 2, cy + hh)], fill=h2c('#aa820a'), width=2)
    # Glass Bulbs
    d.polygon([(cx - 14, cy - hh + 6), (cx + 14, cy - hh + 6), (cx + 3, cy - 2), (cx - 3, cy - 2)], fill=h2c('#ffffff', 40))
    d.polygon([(cx - 3, cy + 2), (cx + 3, cy + 2), (cx + 14, cy + hh - 6), (cx - 14, cy + hh - 6)], fill=h2c('#ffffff', 40))
    # Reverse Upward Flowing Sand
    d.polygon([(cx - 10, cy + 18), (cx + 10, cy + 18), (cx + 2, cy + 4), (cx - 2, cy + 4)], fill=h2c('#ffd166'))
    d.line([(cx, cy + 18), (cx, cy - 18)], fill=h2c('#00f5d4'), width=2) # Upward beam
    d.polygon([(cx - 2, cy - 4), (cx + 2, cy - 4), (cx + 10, cy - 20), (cx - 10, cy - 20)], fill=h2c('#ffd166'))

    # Pyramids & Prehistoric silhouettes at bottom
    d.polygon([(8, TH), (26, TH - 20), (44, TH)], fill=h2c('#d4af37', 180))
    d.polygon([(52, TH), (74, TH - 28), (96, TH)], fill=h2c('#9c2828', 180))

    img.save(os.path.join(ASSETS, 'thumb_alchemy.png'))
    print("  Wrote thumb_alchemy.png (Chrono-Warp)")

    # ── Spritesheet (alchemy.png + alchemy.json) ──
    SW, SH = 384, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Grand Ornate Celestial Hourglass (44x70) - Unmistakable hourglass
    gx, gy = 0, 0
    # Top & bottom brass plates
    sd.rectangle([gx + 4, gy + 4, gx + 40, gy + 10], fill=h2c('#d4af37'))
    sd.rectangle([gx + 4, gy + 60, gx + 40, gy + 66], fill=h2c('#d4af37'))
    draw_circle_fill(sd, gx + 22, gy + 3, 3, h2c('#ffd166')) # Top finial
    draw_circle_fill(sd, gx + 22, gy + 67, 3, h2c('#ffd166')) # Bottom finial
    # Support pillars
    sd.line([(gx + 6, gy + 10), (gx + 6, gy + 60)], fill=h2c('#aa820a'), width=3)
    sd.line([(gx + 38, gy + 10), (gx + 38, gy + 60)], fill=h2c('#aa820a'), width=3)
    # Glass bulbs contour
    sd.polygon([(gx + 10, gy + 11), (gx + 34, gy + 11), (gx + 24, gy + 32), (gx + 20, gy + 32)], outline=h2c('#ffffff', 180))
    sd.polygon([(gx + 20, gy + 38), (gx + 24, gy + 38), (gx + 34, gy + 59), (gx + 10, gy + 59)], outline=h2c('#ffffff', 180))
    add_f('hourglass_frame', gx, gy, 44, 70)

    # 2. Cyberpunk Hover-Car (28x14) - Epoch 1
    cx1, cy1 = 48, 0
    sd.polygon([(cx1 + 2, cy1 + 7), (cx1 + 10, cy1 + 2), (cx1 + 24, cy1 + 2), (cx1 + 27, cy1 + 7), (cx1 + 22, cy1 + 12), (cx1 + 6, cy1 + 12)], fill=h2c('#1a1c2e'))
    sd.rectangle([cx1 + 10, cy1 + 4, cx1 + 18, cy1 + 7], fill=h2c('#00f5d4')) # cockpit
    sd.line([(cx1 + 26, cy1 + 6), (cx1 + 28, cy1 + 6)], fill=h2c('#ff007f'), width=2) # jet trail
    add_f('hover_car', cx1, cy1, 28, 14)

    # 3. Victorian Steam Train (40x26) - Epoch 2
    vx, vy = 80, 0
    sd.rectangle([vx + 6, vy + 8, vx + 36, vy + 22], fill=h2c('#1a1c22'))
    sd.rectangle([vx + 28, vy + 2, vx + 38, vy + 12], fill=h2c('#3a2418'))
    sd.rectangle([vx + 10, vy + 2, vx + 15, vy + 8], fill=h2c('#d4af37'))
    draw_circle_fill(sd, vx + 14, vy + 22, 3, h2c('#8c5923'))
    draw_circle_fill(sd, vx + 26, vy + 22, 3, h2c('#8c5923'))
    add_f('steam_train', vx, vy, 40, 26)

    # 4. Egyptian Great Pyramid (44x32) - Epoch 3
    px, py = 124, 0
    sd.polygon([(px + 2, py + 30), (px + 22, py + 4), (px + 42, py + 30)], fill=h2c('#d4af37'))
    sd.polygon([(px + 22, py + 4), (px + 42, py + 30), (px + 30, py + 30)], fill=h2c('#9c7816'))
    add_f('pyramid', px, py, 44, 32)

    # 5. Desert Camel (28x22) - Epoch 3
    mx, my = 172, 0
    sd.rectangle([mx + 6, my + 6, mx + 20, my + 14], fill=h2c('#b8860b'))
    draw_circle_fill(sd, mx + 13, my + 4, 4, h2c('#9c6e08')) # hump
    sd.line([(mx + 8, my + 14), (mx + 8, my + 21)], fill=h2c('#9c6e08'), width=2) # legs
    sd.line([(mx + 18, my + 14), (mx + 18, my + 21)], fill=h2c('#9c6e08'), width=2)
    sd.line([(mx + 20, my + 8), (mx + 26, my + 3)], fill=h2c('#b8860b'), width=2) # neck & head
    add_f('camel', mx, my, 28, 22)

    # 6. Roaring T-Rex Dinosaur (40x40) - Epoch 4
    dx, dy = 204, 0
    sd.rectangle([dx + 16, dy + 6, dx + 36, dy + 18], fill=h2c('#4a6c38'))
    sd.polygon([(dx + 24, dy + 14), (dx + 36, dy + 14), (dx + 28, dy + 22)], fill=h2c('#2d4420'))
    sd.point((dx + 26, dy + 9), fill=h2c('#ffd166'))
    sd.rectangle([dx + 8, dy + 14, dx + 24, dy + 30], fill=h2c('#4a6c38'))
    sd.polygon([(dx + 2, dy + 22), (dx + 8, dy + 18), (dx + 10, dy + 26)], fill=h2c('#4a6c38'))
    sd.rectangle([dx + 12, dy + 28, dx + 20, dy + 38], fill=h2c('#3a542b'))
    add_f('trex', dx, dy, 40, 40)

    # 7. Flying Pterodactyl (32x20) - Epoch 4
    ptx, pty = 248, 0
    sd.polygon([(ptx + 2, pty + 4), (ptx + 16, pty + 10), (ptx + 30, pty + 4), (ptx + 18, pty + 16), (ptx + 14, pty + 16)], fill=h2c('#5c4033'))
    sd.point((ptx + 16, pty + 8), fill=h2c('#ffd166'))
    add_f('pterodactyl', ptx, pty, 32, 20)

    # 8. Primordial Flaming Meteor (24x24) - Epoch 5
    fx, fy = 284, 0
    draw_circle_fill(sd, fx + 12, fy + 12, 6, h2c('#ff5500'))
    sd.point((fx + 12, fy + 12), fill=h2c('#ffffff'))
    sd.line([(fx + 4, fy + 4), (fx + 10, fy + 10)], fill=h2c('#ffd166'), width=2)
    add_f('meteor', fx, fy, 24, 24)

    # 9. Cosmic Singularity (28x28) - Pre-Bang
    sx, sy = 312, 0
    draw_radial_glow(simg, sx + 14, sy + 14, 12, (255, 255, 255, 255), (0, 245, 212, 0))
    draw_circle_fill(sd, sx + 14, sy + 14, 4, h2c('#ffffff'))
    add_f('singularity', sx, sy, 28, 28)

    # Cosmic Sparks (16x16)
    for i in range(3):
        cs_x, cs_y = 344 + i * 13, 0
        draw_circle_fill(sd, cs_x + 6, cs_y + 6, 2 + i, h2c('#00f5d4'))
        sd.point((cs_x + 6, cs_y + 6), fill=h2c('#ffffff'))
        add_f(f'cosmic_spark{i}', cs_x, cs_y, 16, 16)

    simg.save(os.path.join(ASSETS, 'alchemy.png'))
    with open(os.path.join(ASSETS, 'alchemy.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote alchemy.png+json (Chrono-Warp Living Eras & Grand Hourglass)")

if __name__ == '__main__':
    print("Generating elevated narrative assets for 3 themes...")
    gen_mech()
    gen_abyss()
    gen_alchemy()
    print("All assets successfully generated!")
