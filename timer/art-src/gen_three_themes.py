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
    # ── Thumbnail ── (Dexter's Laboratory cool slate-blue & industrial gray secret lab)
    img = Image.new('RGBA', (TW, TH), (65, 82, 107, 255))
    d = ImageDraw.Draw(img)
    # Hangar Lab Wall: Cool slate-blue modular wall panels
    for y in range(int(TH * 0.70)):
        t = y / (TH * 0.70)
        d.line([(0, y), (TW, y)], fill=lerp_color(h2c('#495c76'), h2c('#36455b'), t))
    # Modular wall panel vertical seams & rivets
    for px in [22, 48, 74]:
        d.line([(px, 0), (px, int(TH * 0.70))], fill=h2c('#253243'), width=1)
        for ry in range(12, int(TH * 0.70), 16):
            d.point((px - 2, ry), fill=h2c('#6f84a1'))
            d.point((px + 2, ry), fill=h2c('#6f84a1'))

    # Overhead ceiling girder & fluorescent light fixture
    d.rectangle([0, 0, TW, 8], fill=h2c('#283546'))
    d.rectangle([20, 2, TW - 20, 6], fill=h2c('#e8f4fc'))
    # Downward fluorescent light cone
    d.polygon([(24, 6), (TW - 24, 6), (TW - 8, int(TH * 0.70)), (8, int(TH * 0.70))], fill=(225, 245, 255, 25))

    # Left Wall: Mainframe Computer Server Rack with Green Oscilloscope
    d.rectangle([2, 14, 18, int(TH * 0.70) - 4], fill=h2c('#263446'))
    d.rectangle([4, 18, 16, 28], fill=h2c('#121d2a'))
    # Green oscilloscope sine wave
    d.line([(5, 23), (8, 20), (11, 26), (15, 23)], fill=h2c('#39ff14'), width=1)
    for y_led in range(32, 58, 6):
        d.rectangle([4, y_led, 8, y_led + 3], fill=h2c('#00f5d4'))
        d.rectangle([11, y_led, 15, y_led + 3], fill=h2c('#ffd166'))

    # Right Wall: Diagnostics Rack & Bubbling Coolant Tube
    d.rectangle([TW - 18, 14, TW - 2, int(TH * 0.70) - 4], fill=h2c('#263446'))
    d.rectangle([TW - 16, 18, TW - 11, 54], fill=h2c('#00f5d4', 160)) # Cyan coolant tube
    d.point((TW - 14, 26), fill=h2c('#ffffff'))
    d.point((TW - 13, 38), fill=h2c('#ffffff'))
    for y_led in range(18, 54, 7):
        d.rectangle([TW - 9, y_led, TW - 4, y_led + 4], fill=h2c('#ff2a5f'))

    # Solid Industrial Steel/Slate Floor (STATIONARY!)
    floor_y = int(TH * 0.70)
    d.rectangle([0, floor_y, TW, TH], fill=h2c('#546377'))
    # Steel tile bevels & gridlines
    for gy in range(floor_y + 10, TH, 10):
        d.line([(0, gy), (TW, gy)], fill=h2c('#354050'), width=1)
    for gx in range(14, TW, 18):
        d.line([(gx, floor_y), (gx, TH)], fill=h2c('#354050'), width=1)

    # Hazard Caution Stripe Perimeter on Floor
    for hx in range(0, TW, 10):
        d.polygon([(hx, floor_y), (hx + 5, floor_y), (hx + 3, floor_y + 4), (hx - 2, floor_y + 4)], fill=h2c('#ffd166'))
        d.polygon([(hx + 5, floor_y), (hx + 10, floor_y), (hx + 8, floor_y + 4), (hx + 3, floor_y + 4)], fill=h2c('#1c2430'))

    # Stationary Launch Cradle Pad on Floor
    d.rectangle([TW // 2 - 28, floor_y + 2, TW // 2 + 28, floor_y + 14], fill=h2c('#3f5068'))
    d.rectangle([TW // 2 - 26, floor_y + 4, TW // 2 + 26, floor_y + 10], fill=h2c('#50637e'))
    # Foot clamp brackets
    d.rectangle([TW // 2 - 18, floor_y - 2, TW // 2 - 10, floor_y + 6], fill=h2c('#ffd166'))
    d.rectangle([TW // 2 + 10, floor_y - 2, TW // 2 + 18, floor_y + 6], fill=h2c('#ffd166'))

    # Gundam RX-78 in Center
    cx, cy = TW // 2, 62
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
    d.rectangle([cx - 30, cy - 22, cx - 18, cy - 14], fill=h2c('#c0cad8'))
    d.point((cx - 24, cy - 18), fill=h2c('#00f5d4'))
    d.line([(cx - 20, cy - 14), (cx - 10, cy - 4)], fill=h2c('#ffd166'), width=2)
    draw_radial_glow(img, cx - 10, cy - 4, 8, (255, 255, 255, 255), (255, 150, 0, 0))

    img.save(os.path.join(ASSETS, 'thumb_mech.png'))
    print("  Wrote thumb_mech.png (Dexter's Lab Gundam)")

    # ── Spritesheet (mech.png + mech.json) ──
    SW, SH = 384, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Inner Frame Skeleton (32x48) - Legs & Spine
    fx, fy = 0, 0
    sd.rectangle([fx + 13, fy + 4, fx + 19, fy + 24], fill=h2c('#606c80'))
    sd.rectangle([fx + 10, fy + 24, fx + 14, fy + 46], fill=h2c('#444e5f'))
    sd.rectangle([fx + 18, fy + 24, fx + 22, fy + 46], fill=h2c('#444e5f'))
    sd.rectangle([fx + 7, fy + 44, fx + 14, fy + 47], fill=h2c('#303846'))
    sd.rectangle([fx + 18, fy + 44, fx + 25, fy + 47], fill=h2c('#303846'))
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

    # 5. Welder Drone (24x24) - Dexter Lab clean style
    dx, dy = 120, 0
    sd.rectangle([dx + 4, dy + 4, dx + 20, dy + 14], fill=h2c('#c0cad8'))
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

    # 7. Massive Lab Blast Hangar Doors (36x64 each) - Titanium Slate-Blue
    door_x, door_y = 226, 0
    sd.rectangle([door_x, door_y, door_x + 36, door_y + 64], fill=h2c('#3f5068'))
    sd.rectangle([door_x + 3, door_y + 4, door_x + 33, door_y + 60], fill=h2c('#516582'))
    # Inner bevel trim
    sd.rectangle([door_x + 6, door_y + 8, door_x + 30, door_y + 56], fill=h2c('#465772'))
    # Heavy lock bolts & hazard stripe
    for by in range(door_y + 8, door_y + 56, 12):
        sd.rectangle([door_x + 27, by, door_x + 33, by + 4], fill=h2c('#ffd166'))
    add_f('hangar_door', door_x, door_y, 36, 64)

    # 8. Fixed Floor Launch Cradle Pad (64x20) - Industrial Slate-Gray
    lx, ly = 264, 0
    sd.rectangle([lx, ly, lx + 64, ly + 14], fill=h2c('#42536b'))
    sd.rectangle([lx, ly + 14, lx + 64, ly + 18], fill=h2c('#2a3648'))
    sd.rectangle([lx + 4, ly + 3, lx + 60, ly + 9], fill=h2c('#576a86'))
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
    print("  Wrote mech.png+json (Dexter's Lab Secret Hangar)")

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
    # ── Thumbnail: Grand Ornate Celestial Hourglass across Time & Space ──
    img = Image.new('RGBA', (TW, TH), (12, 6, 20, 255))
    d = ImageDraw.Draw(img)

    # Cosmic gradient sky transitioning from deep violet-indigo to cosmic dawn gold
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#1a082b'), h2c('#07020d'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Distant cosmic nebula clouds
    draw_radial_glow(img, TW // 2, 45, 36, (120, 30, 160, 90), (0, 0, 0, 0))
    draw_radial_glow(img, TW // 2, 55, 24, (0, 245, 212, 70), (0, 0, 0, 0))

    # Background Epoch Vignettes on horizon (Bottom):
    # Left: Cyberpunk skyscrapers with glowing neon windows
    d.rectangle([0, TH - 36, 16, TH], fill=h2c('#0d1226'))
    d.rectangle([14, TH - 48, 30, TH], fill=h2c('#141834'))
    d.rectangle([18, TH - 42, 21, TH - 40], fill=h2c('#00f5d4'))
    d.rectangle([24, TH - 36, 27, TH - 34], fill=h2c('#ff007f'))
    d.rectangle([6, TH - 28, 9, TH - 26], fill=h2c('#ffd166'))
    # Right: Great Golden Pyramid & Desert Dunes
    d.polygon([(TW - 38, TH), (TW - 20, TH - 30), (TW - 2, TH)], fill=h2c('#d4af37'))
    d.polygon([(TW - 20, TH - 30), (TW - 2, TH), (TW - 10, TH)], fill=h2c('#aa820a'))
    d.polygon([(TW - 20, TH - 30), (TW - 16, TH - 24), (TW - 24, TH - 24)], fill=h2c('#fff3aa')) # electrum cap
    # Undulating sand dune foreground
    d.polygon([(0, TH - 8), (40, TH - 14), (TW, TH - 6), (TW, TH), (0, TH)], fill=h2c('#855d14'))

    # Center: The Grand Celestial Hourglass
    cx, cy = TW // 2, 52
    hw, hh = 24, 40

    # Rotating Astrolabe Rings (Sinusoidal perspective projection)
    # Ring 1: tilted 30 deg
    d.ellipse([cx - 28, cy - 8, cx + 28, cy + 8], outline=h2c('#ffd166', 220), width=1)
    # Ring 2: tilted counter
    d.ellipse([cx - 24, cy - 18, cx + 24, cy + 18], outline=h2c('#00f5d4', 160), width=1)
    d.point((cx - 26, cy), fill=h2c('#ffffff'))
    d.point((cx + 26, cy), fill=h2c('#ffffff'))

    # Top & Bottom Ornate Plinths (Brass & Gold)
    # Top Cap
    d.rectangle([cx - hw + 2, cy - hh, cx + hw - 2, cy - hh + 4], fill=h2c('#ffe082'))
    d.rectangle([cx - hw, cy - hh + 4, cx + hw, cy - hh + 9], fill=h2c('#d4af37'))
    d.rectangle([cx - hw + 4, cy - hh + 9, cx + hw - 4, cy - hh + 11], fill=h2c('#aa820a'))
    draw_circle_fill(d, cx, cy - hh - 4, 4, h2c('#ffd166')) # Sun finial
    d.point((cx, cy - hh - 4), fill=h2c('#ffffff'))

    # Bottom Cap
    d.rectangle([cx - hw + 4, cy + hh - 11, cx + hw - 4, cy + hh - 9], fill=h2c('#aa820a'))
    d.rectangle([cx - hw, cy + hh - 9, cx + hw, cy + hh - 4], fill=h2c('#d4af37'))
    d.rectangle([cx - hw + 2, cy + hh - 4, cx + hw - 2, cy + hh], fill=h2c('#ffe082'))
    draw_circle_fill(d, cx, cy + hh + 4, 4, h2c('#ffd166')) # Moon finial
    d.point((cx, cy + hh + 4), fill=h2c('#ffffff'))

    # Spiral Carved Brass Columns
    for col_x in [cx - hw + 3, cx + hw - 3]:
        d.line([(col_x, cy - hh + 11), (col_x, cy + hh - 11)], fill=h2c('#ffd166'), width=3)
        d.line([(col_x - 1, cy - hh + 11), (col_x - 1, cy + hh - 11)], fill=h2c('#aa820a'), width=1)
        for gy in range(cy - hh + 14, cy + hh - 12, 8):
            d.point((col_x, gy), fill=h2c('#fff3aa'))

    # Center Astrolabe Gimbal Waist Ring
    d.rectangle([cx - 8, cy - 3, cx + 8, cy + 3], fill=h2c('#ffd166'))
    d.point((cx, cy), fill=h2c('#00f5d4'))

    # Glass Crystal Bulbs (Top & Bottom)
    top_bulb = [(cx - 18, cy - hh + 11), (cx + 18, cy - hh + 11), (cx + 5, cy - 3), (cx - 5, cy - 3)]
    d.polygon(top_bulb, fill=h2c('#122a3a', 90), outline=h2c('#ffffff', 140))
    d.line([(cx - 15, cy - hh + 14), (cx - 7, cy - 10)], fill=h2c('#ffffff', 180), width=1)

    bot_bulb = [(cx - 5, cy + 3), (cx + 5, cy + 3), (cx + 18, cy + hh - 11), (cx - 18, cy + hh - 11)]
    d.polygon(bot_bulb, fill=h2c('#122a3a', 90), outline=h2c('#ffffff', 140))
    d.line([(cx - 15, cy + hh - 14), (cx - 7, cy + 10)], fill=h2c('#ffffff', 180), width=1)

    # Reverse Upward Flowing Sand / Quantum Plasma
    d.polygon([(cx - 12, cy + 18), (cx + 12, cy + 18), (cx + 4, cy + 4), (cx - 4, cy + 4)], fill=h2c('#d4af37', 220))
    d.line([(cx, cy + 22), (cx, cy - 22)], fill=h2c('#00f5d4'), width=2)
    d.line([(cx, cy + 14), (cx, cy - 14)], fill=h2c('#ffffff'), width=1)
    d.polygon([(cx - 4, cy - 4), (cx + 4, cy - 4), (cx + 14, cy - 22), (cx - 14, cy - 22)], fill=h2c('#ffe082', 230))
    d.ellipse([cx - 8, cy - 26, cx + 8, cy - 16], fill=h2c('#ffd166'))
    d.point((cx - 3, cy - 21), fill=h2c('#00f5d4'))
    d.point((cx + 3, cy - 21), fill=h2c('#ff007f'))

    draw_radial_glow(img, cx, cy, 14, (0, 245, 212, 140), (0, 0, 0, 0))

    img.save(os.path.join(ASSETS, 'thumb_alchemy.png'))
    print("  Wrote elevated thumb_alchemy.png")

    # ── Spritesheet (alchemy.png + alchemy.json) ──
    SW, SH = 512, 160
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Grand Ornate Celestial Hourglass Frame (64x92)
    gx, gy = 0, 0
    gw, gh = 64, 92
    cx_f, cy_f = gx + gw // 2, gy + gh // 2
    hw_f, hh_f = 26, 42

    # Top Cap Filigree & Moldings
    sd.rectangle([cx_f - hw_f + 4, cy_f - hh_f, cx_f + hw_f - 4, cy_f - hh_f + 3], fill=h2c('#ffe082'))
    sd.rectangle([cx_f - hw_f, cy_f - hh_f + 3, cx_f + hw_f, cy_f - hh_f + 9], fill=h2c('#d4af37'))
    sd.rectangle([cx_f - hw_f + 3, cy_f - hh_f + 9, cx_f + hw_f - 3, cy_f - hh_f + 12], fill=h2c('#aa820a'))
    # Sun Crest finial
    draw_circle_fill(sd, cx_f, cy_f - hh_f - 3, 4, h2c('#ffd166'))
    sd.point((cx_f, cy_f - hh_f - 3), fill=h2c('#ffffff'))
    sd.point((cx_f - 2, cy_f - hh_f - 4), fill=h2c('#fff3aa'))
    sd.point((cx_f + 2, cy_f - hh_f - 4), fill=h2c('#fff3aa'))

    # Bottom Cap Filigree & Moldings
    sd.rectangle([cx_f - hw_f + 3, cy_f + hh_f - 12, cx_f + hw_f - 3, cy_f + hh_f - 9], fill=h2c('#aa820a'))
    sd.rectangle([cx_f - hw_f, cy_f + hh_f - 9, cx_f + hw_f, cy_f + hh_f - 3], fill=h2c('#d4af37'))
    sd.rectangle([cx_f - hw_f + 4, cy_f + hh_f - 3, cx_f + hw_f - 4, cy_f + hh_f], fill=h2c('#ffe082'))
    # Moon Crest finial
    draw_circle_fill(sd, cx_f, cy_f + hh_f + 3, 4, h2c('#ffd166'))
    sd.point((cx_f, cy_f + hh_f + 3), fill=h2c('#ffffff'))

    # Ornate Brass Side Columns with carved spiral fluting
    for col_x in [cx_f - hw_f + 4, cx_f + hw_f - 4]:
        sd.line([(col_x - 1, cy_f - hh_f + 12), (col_x - 1, cy_f + hh_f - 12)], fill=h2c('#aa820a'), width=1)
        sd.line([(col_x, cy_f - hh_f + 12), (col_x, cy_f + hh_f - 12)], fill=h2c('#ffd166'), width=2)
        sd.line([(col_x + 1, cy_f - hh_f + 12), (col_x + 1, cy_f + hh_f - 12)], fill=h2c('#fff3aa'), width=1)
        for ry in range(cy_f - hh_f + 16, cy_f + hh_f - 14, 10):
            sd.line([(col_x - 2, ry), (col_x + 2, ry)], fill=h2c('#d4af37'), width=2)

    # Astrolabe Waist Joint
    sd.rectangle([cx_f - 10, cy_f - 4, cx_f + 10, cy_f + 4], fill=h2c('#ffd166'))
    sd.rectangle([cx_f - 8, cy_f - 2, cx_f + 8, cy_f + 2], fill=h2c('#ffe082'))
    draw_circle_fill(sd, cx_f, cy_f, 2, h2c('#00f5d4'))

    # Crystal Glass Bulb Profiles (Crisp double bevel)
    sd.polygon([(cx_f - 20, cy_f - hh_f + 12), (cx_f + 20, cy_f - hh_f + 12),
                (cx_f + 5, cy_f - 4), (cx_f - 5, cy_f - 4)],
               outline=h2c('#ffffff', 200))
    sd.polygon([(cx_f - 18, cy_f - hh_f + 14), (cx_f + 18, cy_f - hh_f + 14),
                (cx_f + 4, cy_f - 5), (cx_f - 4, cy_f - 5)],
               outline=h2c('#a0e6ff', 120))
    sd.line([(cx_f - 16, cy_f - hh_f + 16), (cx_f - 7, cy_f - 12)], fill=h2c('#ffffff', 220), width=2)

    sd.polygon([(cx_f - 5, cy_f + 4), (cx_f + 5, cy_f + 4),
                (cx_f + 20, cy_f + hh_f - 12), (cx_f - 20, cy_f + hh_f - 12)],
               outline=h2c('#ffffff', 200))
    sd.polygon([(cx_f - 4, cy_f + 5), (cx_f + 4, cy_f + 5),
                (cx_f + 18, cy_f + hh_f - 14), (cx_f - 18, cy_f + hh_f - 14)],
               outline=h2c('#a0e6ff', 120))
    sd.line([(cx_f - 16, cy_f + hh_f - 16), (cx_f - 7, cy_f + 12)], fill=h2c('#ffffff', 220), width=2)

    add_f('hourglass_frame', gx, gy, gw, gh)

    # 2. Great Pyramid of Giza (64x40) - Epoch 3 (Egypt)
    px, py = 68, 0
    sd.polygon([(px + 2, py + 38), (px + 32, py + 2), (px + 62, py + 38)], fill=h2c('#e5b842'))
    sd.polygon([(px + 32, py + 2), (px + 62, py + 38), (px + 40, py + 38)], fill=h2c('#aa8214'))
    for ty in range(py + 8, py + 38, 5):
        sd.line([(px + 2 + int((ty - py) * 0.75), ty), (px + 62 - int((ty - py) * 0.75), ty)], fill=h2c('#8a680e'), width=1)
    sd.polygon([(px + 29, py + 7), (px + 32, py + 2), (px + 35, py + 7)], fill=h2c('#ffffff'))
    sd.polygon([(px + 32, py + 2), (px + 36, py + 7), (px + 35, py + 7)], fill=h2c('#ffd166'))
    add_f('pyramid', px, py, 64, 40)

    # 3. Companion Pyramid (40x26)
    p2x, p2y = 136, 0
    sd.polygon([(p2x + 2, p2y + 24), (p2x + 20, p2y + 2), (p2x + 38, p2y + 24)], fill=h2c('#d4af37'))
    sd.polygon([(p2x + 20, p2y + 2), (p2x + 38, p2y + 24), (p2x + 26, p2y + 24)], fill=h2c('#9c7816'))
    sd.polygon([(p2x + 18, p2y + 6), (p2x + 20, p2y + 2), (p2x + 22, p2y + 6)], fill=h2c('#fff3aa'))
    add_f('pyramid_small', p2x, p2y, 40, 26)

    # 4. Volcano with Molten Caldera & Lava Rivers (60x44) - Epoch 4 (Jurassic)
    vx, vy = 180, 0
    sd.polygon([(vx + 4, vy + 42), (vx + 22, vy + 6), (vx + 38, vy + 6), (vx + 56, vy + 42)], fill=h2c('#221a1f'))
    sd.polygon([(vx + 30, vy + 6), (vx + 38, vy + 6), (vx + 56, vy + 42), (vx + 40, vy + 42)], fill=h2c('#141014'))
    sd.ellipse([vx + 22, vy + 4, vx + 38, vy + 9], fill=h2c('#ff3300'))
    sd.ellipse([vx + 25, vy + 5, vx + 35, vy + 8], fill=h2c('#ffee44'))
    sd.line([(vx + 28, vy + 8), (vx + 24, vy + 18), (vx + 20, vy + 30), (vx + 16, vy + 42)], fill=h2c('#ff4400'), width=2)
    sd.line([(vx + 27, vy + 9), (vx + 24, vy + 18), (vx + 21, vy + 28)], fill=h2c('#ffee44'), width=1)
    sd.line([(vx + 34, vy + 8), (vx + 38, vy + 22), (vx + 44, vy + 42)], fill=h2c('#ff2200'), width=2)
    add_f('volcano', vx, vy, 60, 44)

    # 5. Roaring T-Rex Dino - Frame 1 (48x44) - Epoch 4
    tx1, ty1 = 244, 0
    sd.rectangle([tx1 + 14, ty1 + 14, tx1 + 34, ty1 + 30], fill=h2c('#3d6632'))
    sd.rectangle([tx1 + 24, ty1 + 4, tx1 + 44, ty1 + 16], fill=h2c('#3d6632'))
    sd.polygon([(tx1 + 32, ty1 + 16), (tx1 + 44, ty1 + 16), (tx1 + 36, ty1 + 24)], fill=h2c('#284520'))
    for i in range(4):
        sd.point((tx1 + 34 + i * 2, ty1 + 15), fill=h2c('#ffffff'))
        sd.point((tx1 + 34 + i * 2, ty1 + 17), fill=h2c('#ffffff'))
    sd.point((tx1 + 32, ty1 + 8), fill=h2c('#ffd166'))
    sd.point((tx1 + 33, ty1 + 8), fill=h2c('#000000'))
    sd.polygon([(tx1 + 2, ty1 + 18), (tx1 + 16, ty1 + 18), (tx1 + 14, ty1 + 26)], fill=h2c('#3d6632'))
    sd.line([(tx1 + 28, ty1 + 22), (tx1 + 32, ty1 + 26)], fill=h2c('#284520'), width=2)
    sd.rectangle([tx1 + 18, ty1 + 28, tx1 + 26, ty1 + 42], fill=h2c('#284520'))
    sd.rectangle([tx1 + 22, ty1 + 40, tx1 + 30, ty1 + 43], fill=h2c('#1e3318'))
    sd.rectangle([tx1 + 8, ty1 + 26, tx1 + 16, ty1 + 38], fill=h2c('#3d6632'))
    sd.rectangle([tx1 + 10, ty1 + 36, tx1 + 18, ty1 + 39], fill=h2c('#1e3318'))
    add_f('trex_walk1', tx1, ty1, 48, 44)

    # 6. Roaring T-Rex Dino - Frame 2 (48x44)
    tx2, ty2 = 296, 0
    sd.rectangle([tx2 + 14, ty2 + 14, tx2 + 34, ty2 + 30], fill=h2c('#3d6632'))
    sd.rectangle([tx2 + 24, ty2 + 3, tx2 + 45, ty2 + 15], fill=h2c('#3d6632'))
    sd.polygon([(tx2 + 30, ty2 + 15), (tx2 + 45, ty2 + 15), (tx2 + 34, ty2 + 26)], fill=h2c('#284520'))
    for i in range(5):
        sd.point((tx2 + 33 + i * 2, ty2 + 14), fill=h2c('#ffffff'))
        sd.point((tx2 + 33 + i * 2, ty2 + 17), fill=h2c('#ffffff'))
    sd.point((tx2 + 32, ty2 + 7), fill=h2c('#ff5500'))
    sd.polygon([(tx2 + 2, ty2 + 14), (tx2 + 16, ty2 + 18), (tx2 + 14, ty2 + 26)], fill=h2c('#3d6632'))
    sd.line([(tx2 + 28, ty2 + 21), (tx2 + 33, ty2 + 24)], fill=h2c('#284520'), width=2)
    sd.rectangle([tx2 + 12, ty2 + 28, tx2 + 20, ty2 + 42], fill=h2c('#284520'))
    sd.rectangle([tx2 + 14, ty2 + 40, tx2 + 22, ty2 + 43], fill=h2c('#1e3318'))
    sd.rectangle([tx2 + 24, ty2 + 26, tx2 + 32, ty2 + 38], fill=h2c('#3d6632'))
    sd.rectangle([tx2 + 26, ty2 + 36, tx2 + 34, ty2 + 39], fill=h2c('#1e3318'))
    add_f('trex_walk2', tx2, ty2, 48, 44)

    # 7. Brachiosaurus Sauropod Silhouette (44x40) - Epoch 4
    bx, by = 348, 0
    sd.line([(bx + 30, by + 4), (bx + 20, by + 22)], fill=h2c('#1e301e'), width=4)
    draw_circle_fill(sd, bx + 32, by + 4, 3, h2c('#1e301e'))
    sd.ellipse([bx + 4, by + 18, bx + 28, by + 34], fill=h2c('#1e301e'))
    sd.line([(bx + 4, by + 24), (bx + 0, by + 30)], fill=h2c('#1e301e'), width=2)
    sd.line([(bx + 8, by + 30), (bx + 8, by + 39)], fill=h2c('#142214'), width=3)
    sd.line([(bx + 14, by + 30), (bx + 14, by + 39)], fill=h2c('#142214'), width=3)
    sd.line([(bx + 22, by + 28), (bx + 22, by + 39)], fill=h2c('#142214'), width=3)
    add_f('brachiosaur', bx, by, 44, 40)

    # 8. Victorian Iron Steam Locomotive 4-4-0 (52x28) - Epoch 2
    lx, ly = 396, 0
    sd.rectangle([lx + 12, ly + 8, lx + 44, ly + 20], fill=h2c('#1b2026'))
    sd.rectangle([lx + 34, ly + 4, lx + 50, ly + 20], fill=h2c('#4a2211'))
    sd.rectangle([lx + 38, ly + 6, lx + 44, ly + 12], fill=h2c('#ffe082'))
    sd.rectangle([lx + 16, ly + 2, lx + 20, ly + 8], fill=h2c('#1b2026'))
    sd.rectangle([lx + 14, ly + 1, lx + 22, ly + 3], fill=h2c('#ffd166'))
    draw_circle_fill(sd, lx + 28, ly + 6, 3, h2c('#ffd166'))
    sd.polygon([(lx + 4, ly + 22), (lx + 12, ly + 14), (lx + 12, ly + 22)], fill=h2c('#9c2828'))
    sd.rectangle([lx + 6, ly + 10, lx + 12, ly + 16], fill=h2c('#ffd166'))
    sd.point((lx + 8, ly + 13), fill=h2c('#ffffff'))
    draw_circle_fill(sd, lx + 18, ly + 22, 4, h2c('#8c5923'))
    draw_circle_fill(sd, lx + 30, ly + 22, 4, h2c('#8c5923'))
    draw_circle_fill(sd, lx + 42, ly + 22, 4, h2c('#8c5923'))
    sd.line([(lx + 18, ly + 22), (lx + 42, ly + 22)], fill=h2c('#d4af37'), width=2)
    add_f('steam_train', lx, ly, 52, 28)

    # 9. Victorian Railway Carriage (36x22) - Epoch 2
    rc_x, rc_y = 452, 0
    sd.rectangle([rc_x + 2, rc_y + 4, rc_x + 34, rc_y + 16], fill=h2c('#3a1f18'))
    sd.rectangle([rc_x + 4, rc_y + 2, rc_x + 32, rc_y + 4], fill=h2c('#1b2026'))
    for wx in range(rc_x + 6, rc_x + 30, 6):
        sd.rectangle([wx, rc_y + 6, wx + 4, rc_y + 11], fill=h2c('#ffe082'))
    draw_circle_fill(sd, rc_x + 8, rc_y + 18, 3, h2c('#1b2026'))
    draw_circle_fill(sd, rc_x + 28, rc_y + 18, 3, h2c('#1b2026'))
    add_f('carriage', rc_x, rc_y, 36, 22)

    # Row 1 (y=44..100)
    # 10. Great Sphinx of Giza (40x24) - Epoch 3 (Egypt)
    sx, sy = 68, 44
    sd.rectangle([sx + 4, sy + 10, sx + 32, sy + 22], fill=h2c('#c99834'))
    sd.rectangle([sx + 26, sy + 18, sx + 38, sy + 22], fill=h2c('#b07f24'))
    sd.rectangle([sx + 20, sy + 2, sx + 32, sy + 12], fill=h2c('#c99834'))
    sd.polygon([(sx + 18, sy + 4), (sx + 34, sy + 4), (sx + 30, sy + 12), (sx + 22, sy + 12)], fill=h2c('#204488'))
    sd.point((sx + 26, sy + 6), fill=h2c('#ffd166'))
    sd.point((sx + 28, sy + 6), fill=h2c('#000000'))
    add_f('sphinx', sx, sy, 40, 24)

    # 11. Desert Camel with Royal Saddle Rug (32x26) - Epoch 3
    mx, my = 112, 44
    sd.rectangle([mx + 6, my + 8, mx + 22, my + 16], fill=h2c('#b8860b'))
    draw_circle_fill(sd, mx + 14, my + 6, 5, h2c('#9c6e08'))
    sd.rectangle([mx + 10, my + 7, mx + 18, my + 13], fill=h2c('#d92534'))
    sd.line([(mx + 10, my + 13), (mx + 18, my + 13)], fill=h2c('#ffd166'), width=1)
    sd.line([(mx + 22, my + 12), (mx + 28, my + 4)], fill=h2c('#b8860b'), width=3)
    sd.rectangle([mx + 26, my + 2, mx + 31, my + 6], fill=h2c('#9c6e08'))
    sd.line([(mx + 8, my + 16), (mx + 8, my + 24)], fill=h2c('#9c6e08'), width=2)
    sd.line([(mx + 12, my + 16), (mx + 12, my + 24)], fill=h2c('#785505'), width=2)
    sd.line([(mx + 18, my + 16), (mx + 18, my + 24)], fill=h2c('#9c6e08'), width=2)
    sd.line([(mx + 22, my + 16), (mx + 22, my + 24)], fill=h2c('#785505'), width=2)
    add_f('camel', mx, my, 32, 26)

    # 12. Nile Date Palm Tree (24x36) - Epoch 3
    plx, ply = 148, 44
    sd.line([(plx + 12, ply + 34), (plx + 10, ply + 14)], fill=h2c('#7a4f1a'), width=3)
    sd.polygon([(plx + 10, ply + 14), (plx + 2, ply + 6), (plx + 4, ply + 16)], fill=h2c('#2d6a2e'))
    sd.polygon([(plx + 10, ply + 14), (plx + 22, ply + 6), (plx + 20, ply + 16)], fill=h2c('#2d6a2e'))
    sd.polygon([(plx + 10, ply + 14), (plx + 12, ply + 2), (plx + 15, ply + 12)], fill=h2c('#3e8a3f'))
    sd.polygon([(plx + 10, ply + 14), (plx + 4, ply + 20), (plx + 9, ply + 22)], fill=h2c('#1e4f20'))
    sd.polygon([(plx + 10, ply + 14), (plx + 20, ply + 20), (plx + 15, ply + 22)], fill=h2c('#1e4f20'))
    add_f('palm_tree', plx, ply, 24, 36)

    # 13. Nile River Felucca Sailboat (28x28) - Epoch 3
    flx, fly = 176, 46
    sd.polygon([(flx + 2, fly + 22), (flx + 26, fly + 22), (flx + 22, fly + 26), (flx + 6, fly + 26)], fill=h2c('#6a401a'))
    sd.polygon([(flx + 8, fly + 22), (flx + 24, fly + 2), (flx + 22, fly + 22)], fill=h2c('#f4ebd0'))
    sd.line([(flx + 8, fly + 22), (flx + 24, fly + 2)], fill=h2c('#3a2410'), width=1)
    add_f('felucca', flx, fly, 28, 28)

    # 14. Cyberpunk Spinner / Cruiser (36x14) - Epoch 1
    spx, spy = 208, 48
    sd.polygon([(spx + 2, spy + 7), (spx + 8, spy + 2), (spx + 30, spy + 2),
                (spx + 35, spy + 7), (spx + 28, spy + 12), (spx + 6, spy + 12)], fill=h2c('#12162a'))
    sd.rectangle([spx + 10, spy + 3, spx + 24, spy + 7], fill=h2c('#00f5d4'))
    sd.point((spx + 14, spy + 4), fill=h2c('#ffffff'))
    sd.rectangle([spx + 32, spy + 4, spx + 35, spy + 9], fill=h2c('#ff007f'))
    sd.line([(spx + 35, spy + 6), (spx + 38, spy + 6)], fill=h2c('#ff80bf'), width=2)
    add_f('hover_car', spx, spy, 36, 14)

    # 15. Cyberpunk High-Speed Skimmer (30x12) - Epoch 1
    skx, sky = 248, 48
    sd.polygon([(skx + 2, sky + 6), (skx + 10, sky + 2), (skx + 26, sky + 2),
                (skx + 29, sky + 6), (skx + 22, sky + 10), (skx + 6, sky + 10)], fill=h2c('#26183a'))
    sd.rectangle([skx + 8, sky + 3, skx + 18, sky + 6], fill=h2c('#ffd166'))
    sd.rectangle([skx + 26, sky + 4, skx + 29, sky + 8], fill=h2c('#00f5d4'))
    add_f('hover_car2', skx, sky, 30, 12)

    # 16. Cyberpunk Neon Holographic Billboard 1 (32x20) - Epoch 1
    hg1_x, hg1_y = 282, 46
    sd.rectangle([hg1_x + 2, hg1_y + 2, hg1_x + 30, hg1_y + 18], fill=h2c('#0a0618'), outline=h2c('#ff007f'))
    sd.line([(hg1_x + 8, hg1_y + 6), (hg1_x + 24, hg1_y + 6)], fill=h2c('#00f5d4'), width=1)
    sd.line([(hg1_x + 16, hg1_y + 6), (hg1_x + 16, hg1_y + 15)], fill=h2c('#00f5d4'), width=1)
    sd.line([(hg1_x + 10, hg1_y + 11), (hg1_x + 22, hg1_y + 11)], fill=h2c('#ffd166'), width=1)
    sd.point((hg1_x + 12, hg1_y + 14), fill=h2c('#ff007f'))
    sd.point((hg1_x + 20, hg1_y + 14), fill=h2c('#ff007f'))
    add_f('hologram_ad1', hg1_x, hg1_y, 32, 20)

    # 17. Cyberpunk Neon Billboard 2 (28x16) - Epoch 1
    hg2_x, hg2_y = 318, 46
    sd.rectangle([hg2_x + 2, hg2_y + 2, hg2_x + 26, hg2_y + 14], fill=h2c('#080d22'), outline=h2c('#00f5d4'))
    sd.ellipse([hg2_x + 6, hg2_y + 5, hg2_x + 22, hg2_y + 11], outline=h2c('#ffd166'))
    draw_circle_fill(sd, hg2_x + 14, hg2_y + 8, 2, h2c('#ff007f'))
    add_f('hologram_ad2', hg2_x, hg2_y, 28, 16)

    # 18. Flying Pterodactyl Wings Up (36x20) - Epoch 4
    pt1_x, pt1_y = 350, 44
    sd.polygon([(pt1_x + 14, pt1_y + 8), (pt1_x + 28, pt1_y + 6), (pt1_x + 20, pt1_y + 12)], fill=h2c('#6b4226'))
    sd.point((pt1_x + 22, pt1_y + 8), fill=h2c('#ffd166'))
    sd.polygon([(pt1_x + 4, pt1_y + 1), (pt1_x + 18, pt1_y + 8), (pt1_x + 12, pt1_y + 14)], fill=h2c('#8c5934'))
    sd.polygon([(pt1_x + 32, pt1_y + 1), (pt1_x + 18, pt1_y + 8), (pt1_x + 24, pt1_y + 14)], fill=h2c('#8c5934'))
    add_f('pterodactyl', pt1_x, pt1_y, 36, 20)

    # 19. Flying Pterodactyl Wings Down (36x20) - Epoch 4
    pt2_x, pt2_y = 390, 44
    sd.polygon([(pt2_x + 14, pt2_y + 8), (pt2_x + 28, pt2_y + 6), (pt2_x + 20, pt2_y + 12)], fill=h2c('#6b4226'))
    sd.point((pt2_x + 22, pt2_y + 8), fill=h2c('#ffd166'))
    sd.polygon([(pt2_x + 4, pt2_y + 18), (pt2_x + 18, pt2_y + 8), (pt2_x + 10, pt2_y + 8)], fill=h2c('#8c5934'))
    sd.polygon([(pt2_x + 32, pt2_y + 18), (pt2_x + 18, pt2_y + 8), (pt2_x + 26, pt2_y + 8)], fill=h2c('#8c5934'))
    add_f('pterodactyl_down', pt2_x, pt2_y, 36, 20)

    # 20. Primordial Fiery Bolide Meteor (32x24) - Epoch 5
    mx1, my1 = 430, 36
    sd.polygon([(mx1 + 2, my1 + 2), (mx1 + 18, my1 + 10), (mx1 + 10, my1 + 18)], fill=h2c('#ff2200', 180))
    sd.polygon([(mx1 + 6, my1 + 6), (mx1 + 20, my1 + 12), (mx1 + 14, my1 + 16)], fill=h2c('#ff8800'))
    draw_circle_fill(sd, mx1 + 22, my1 + 14, 6, h2c('#ffee44'))
    draw_circle_fill(sd, mx1 + 24, my1 + 14, 3, h2c('#ffffff'))
    add_f('meteor', mx1, my1, 32, 24)

    # Row 2 (y=96..160) - Gears, Shards & Big Bang Singularities
    # 21. Small Clockwork Brass Gear (16x16)
    g1x, g1y = 0, 96
    draw_circle_fill(sd, g1x + 8, g1y + 8, 5, h2c('#d4af37'))
    draw_circle_fill(sd, g1x + 8, g1y + 8, 2, h2c('#3a2410'))
    sd.point((g1x + 8, g1y + 1), fill=h2c('#ffd166'))
    sd.point((g1x + 8, g1y + 15), fill=h2c('#ffd166'))
    sd.point((g1x + 1, g1y + 8), fill=h2c('#ffd166'))
    sd.point((g1x + 15, g1y + 8), fill=h2c('#ffd166'))
    add_f('gear_small', g1x, g1y, 16, 16)

    # 22. Medium Clockwork Brass Gear (24x24)
    g2x, g2y = 20, 96
    draw_circle_fill(sd, g2x + 12, g2y + 12, 8, h2c('#d4af37'))
    draw_circle_fill(sd, g2x + 12, g2y + 12, 3, h2c('#221406'))
    for ang_deg in range(0, 360, 45):
        rad = math.radians(ang_deg)
        tx = int(g2x + 12 + math.cos(rad) * 10)
        ty = int(g2y + 12 + math.sin(rad) * 10)
        sd.point((tx, ty), fill=h2c('#ffd166'))
    add_f('gear_med', g2x, g2y, 24, 24)

    # 23-26. Prismatic Shattered Crystal Shards (16x16 each)
    shards = [
        [(2, 2), (14, 6), (8, 14)],
        [(4, 14), (12, 2), (14, 12)],
        [(2, 8), (14, 2), (10, 14), (4, 12)],
        [(6, 2), (14, 14), (2, 10)],
    ]
    for idx, poly in enumerate(shards):
        sx_s, sy_s = 48 + idx * 20, 96
        abs_poly = [(sx_s + pt[0], sy_s + pt[1]) for pt in poly]
        sd.polygon(abs_poly, fill=h2c('#ffffff', 180), outline=h2c('#00f5d4'))
        sd.point((sx_s + 7, sy_s + 7), fill=h2c('#ffffff'))
        add_f(f'crystal_shard{idx}', sx_s, sy_s, 16, 16)

    # 27. Quantum Singularity Core (28x28)
    sqx, sqy = 128, 96
    draw_radial_glow(simg, sqx + 14, sqy + 14, 13, (255, 255, 255, 255), (0, 245, 212, 0))
    draw_circle_fill(sd, sqx + 14, sqy + 14, 5, h2c('#ffffff'))
    draw_circle_fill(sd, sqx + 14, sqy + 14, 2, h2c('#000000'))
    add_f('singularity', sqx, sqy, 28, 28)

    # 28-30. Multi-spectral Cosmic Sparks (16x16)
    for i in range(3):
        cs_x, cs_y = 160 + i * 18, 96
        r = 2 + i * 2
        col = [h2c('#ffd166'), h2c('#00f5d4'), h2c('#ff007f')][i]
        draw_circle_fill(sd, cs_x + 8, cs_y + 8, r, col)
        sd.point((cs_x + 8, cs_y + 8), fill=h2c('#ffffff'))
        add_f(f'cosmic_spark{i}', cs_x, cs_y, 16, 16)

    simg.save(os.path.join(ASSETS, 'alchemy.png'))
    with open(os.path.join(ASSETS, 'alchemy.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote elevated alchemy.png + alchemy.json (Chrono-Warp Living Eras & Grand Hourglass)")

if __name__ == '__main__':
    print("Generating elevated narrative assets for 3 themes...")
    gen_mech()
    gen_abyss()
    gen_alchemy()
    print("All assets successfully generated!")
