"""Generate rich narrative art assets for Gundam Launch, Deep Abyss Leviathan, and Chrono-Warp themes.

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
# 1. THEME 1: GUNDAM ASSEMBLY & CATAPULT LAUNCH (mech)
# ════════════════════════════════════════════════════════════════════════════════
def gen_mech():
    TW, TH = 96, 128
    # ── Thumbnail ──
    img = Image.new('RGBA', (TW, TH), (15, 18, 28, 255))
    d = ImageDraw.Draw(img)
    # Hangar bay background with industrial trusses
    for y in range(TH):
        t = y / TH
        d.line([(0, y), (TW, y)], fill=lerp_color(h2c('#101420'), h2c('#1e2436'), t))
    # Catapult deck runway lines
    for i in range(0, TW, 16):
        d.line([(i, 80), (i + 8, TH)], fill=h2c('#ffd166', 180), width=2)
    # Gundam silhouette standing on launch deck
    cx, cy = TW // 2, 60
    # Torso (White/Blue/Red)
    d.rectangle([cx - 12, cy - 8, cx + 12, cy + 14], fill=h2c('#2b55b8')) # Blue chest
    d.rectangle([cx - 10, cy + 14, cx + 10, cy + 26], fill=h2c('#e8e8f0')) # White waist
    d.rectangle([cx - 6, cy + 2, cx + 6, cy + 10], fill=h2c('#d92534')) # Red cockpit hatch
    # Yellow chest vents
    d.rectangle([cx - 10, cy - 4, cx - 4, cy], fill=h2c('#ffd166'))
    d.rectangle([cx + 4, cy - 4, cx + 10, cy], fill=h2c('#ffd166'))
    # White Head & Golden V-Fin
    d.rectangle([cx - 6, cy - 20, cx + 6, cy - 8], fill=h2c('#ffffff'))
    d.polygon([(cx, cy - 14), (cx - 14, cy - 26), (cx - 11, cy - 26)], fill=h2c('#ffd166')) # Left V-fin
    d.polygon([(cx, cy - 14), (cx + 14, cy - 26), (cx + 11, cy - 26)], fill=h2c('#ffd166')) # Right V-fin
    d.rectangle([cx - 2, cy - 22, cx + 2, cy - 18], fill=h2c('#d92534')) # Red forehead jewel
    # Green eyes glow
    d.point((cx - 3, cy - 12), fill=h2c('#00ff88'))
    d.point((cx + 3, cy - 12), fill=h2c('#00ff88'))
    draw_radial_glow(img, cx, cy - 12, 10, (0, 255, 136, 180), (0, 0, 0, 0))
    # Shoulders & White Legs
    d.rectangle([cx - 18, cy - 10, cx - 12, cy + 10], fill=h2c('#ffffff'))
    d.rectangle([cx + 12, cy - 10, cx + 18, cy + 10], fill=h2c('#ffffff'))
    d.rectangle([cx - 11, cy + 26, cx - 2, cy + 54], fill=h2c('#ffffff'))
    d.rectangle([cx + 2, cy + 26, cx + 11, cy + 54], fill=h2c('#ffffff'))
    # Red feet
    d.rectangle([cx - 13, cy + 52, cx - 1, cy + 56], fill=h2c('#d92534'))
    d.rectangle([cx + 1, cy + 52, cx + 13, cy + 56], fill=h2c('#d92534'))
    # Construction gantry arms with welding sparks
    d.line([(8, 45), (cx - 16, cy - 6)], fill=h2c('#ffd166'), width=2)
    d.line([(TW - 8, 40), (cx + 16, cy - 6)], fill=h2c('#ffd166'), width=2)
    draw_radial_glow(img, cx - 16, cy - 6, 8, (255, 255, 255, 255), (255, 170, 0, 0))

    img.save(os.path.join(ASSETS, 'thumb_mech.png'))
    print("  Wrote thumb_mech.png (Gundam)")

    # ── Spritesheet (mech.png + mech.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Inner Frame Skeleton (32x48) - Legs & Spine
    fx, fy = 0, 0
    sd.rectangle([fx + 14, fy + 4, fx + 18, fy + 24], fill=h2c('#505868')) # Spine
    sd.rectangle([fx + 10, fy + 24, fx + 13, fy + 46], fill=h2c('#3a4050')) # Left leg frame
    sd.rectangle([fx + 19, fy + 24, fx + 22, fy + 46], fill=h2c('#3a4050')) # Right leg frame
    sd.rectangle([fx + 8, fy + 44, fx + 14, fy + 47], fill=h2c('#282c38'))
    sd.rectangle([fx + 18, fy + 44, fx + 24, fy + 47], fill=h2c('#282c38'))
    add_f('frame_legs', fx, fy, 32, 48)

    # 2. Torso Armor Module (32x32)
    tx, ty = 34, 0
    sd.rectangle([tx + 6, ty + 4, tx + 26, ty + 20], fill=h2c('#2b55b8')) # Blue chest
    sd.rectangle([tx + 12, ty + 12, tx + 20, ty + 24], fill=h2c('#d92534')) # Red cockpit
    sd.rectangle([tx + 7, ty + 8, tx + 11, ty + 12], fill=h2c('#ffd166')) # Yellow vent L
    sd.rectangle([tx + 21, ty + 8, tx + 25, ty + 12], fill=h2c('#ffd166')) # Yellow vent R
    add_f('armor_torso', tx, ty, 32, 32)

    # 3. Gundam Head with Golden V-Fin (24x24)
    hx, hy = 68, 0
    sd.rectangle([hx + 7, hy + 9, hx + 17, hy + 22], fill=h2c('#ffffff'))
    # Golden V-Fin
    sd.polygon([(hx + 12, hy + 13), (hx + 2, hy + 2), (hx + 5, hy + 2)], fill=h2c('#ffd166'))
    sd.polygon([(hx + 12, hy + 13), (hx + 22, hy + 2), (hx + 19, hy + 2)], fill=h2c('#ffd166'))
    sd.rectangle([hx + 10, hy + 5, hx + 14, hy + 9], fill=h2c('#d92534')) # Red jewel
    # Twin green eyes
    sd.point((hx + 9, hy + 15), fill=h2c('#00ff88'))
    sd.point((hx + 15, hy + 15), fill=h2c('#00ff88'))
    add_f('gundam_head', hx, hy, 24, 24)

    # 4. Shoulder Armor & Arm with Beam Rifle (24x36)
    ax, ay = 94, 0
    sd.rectangle([ax + 4, ay + 2, ax + 20, ay + 14], fill=h2c('#ffffff')) # White shoulder
    sd.rectangle([ax + 8, ay + 14, ax + 14, ay + 26], fill=h2c('#d0d4de')) # Arm
    sd.rectangle([ax + 6, ay + 22, ax + 18, ay + 34], fill=h2c('#3a4050')) # Rifle barrel
    add_f('arm_rifle', ax, ay, 24, 36)

    # 5. Articulated Robotic Welding Arm (32x24)
    rx, ry = 120, 0
    sd.line([(rx + 2, ry + 12), (rx + 16, ry + 4)], fill=h2c('#ffd166'), width=3)
    sd.line([(rx + 16, ry + 4), (rx + 28, ry + 16)], fill=h2c('#ffd166'), width=2)
    sd.rectangle([rx + 26, ry + 14, rx + 30, ry + 18], fill=h2c('#505868')) # Torch tip
    add_f('weld_arm', rx, ry, 32, 24)

    # 6. Vernier Jet Boost Thruster Plumes (24x36)
    for i in range(3):
        vx, vy = 154 + i * 26, 0
        w = 10 + i * 2
        sd.polygon([(vx + 12 - w//2, vy + 2), (vx + 12 + w//2, vy + 2), (vx + 12, vy + 30 + i * 2)], fill=h2c('#ff5500'))
        sd.polygon([(vx + 12 - w//4, vy + 2), (vx + 12 + w//4, vy + 2), (vx + 12, vy + 20)], fill=h2c('#ffd166'))
        sd.polygon([(vx + 12 - 2, vy + 2), (vx + 12 + 2, vy + 2), (vx + 12, vy + 10)], fill=h2c('#ffffff'))
        add_f(f'jet_flame{i}', vx, vy, 24, 36)

    # Sparks (16x16)
    for i in range(3):
        sx, sy = 232, i * 18
        sd.point((sx + 6, sy + 6), fill=h2c('#ffffff'))
        sd.point((sx + 10, sy + 8), fill=h2c('#ffd166'))
        sd.point((sx + 8, sy + 12), fill=h2c('#ff8800'))
        add_f(f'spark{i}', sx, sy, 16, 16)

    simg.save(os.path.join(ASSETS, 'mech.png'))
    with open(os.path.join(ASSETS, 'mech.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote mech.png+json (Gundam)")

# ════════════════════════════════════════════════════════════════════════════════
# 2. THEME 2: DEEP SEA LEVIATHAN CHOMP (abyss)
# ════════════════════════════════════════════════════════════════════════════════
def gen_abyss():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    # Ocean gradient: sunlight cyan at top to midnight abyss at bottom
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#074868'), h2c('#01050d'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Bathysphere Submersible
    cx, cy = TW // 2, 45
    draw_circle_fill(d, cx, cy, 14, h2c('#b87d3b'))
    draw_circle_fill(d, cx, cy, 7, h2c('#00f5d4')) # porthole
    # Headlight beam pointing into the darkness below
    d.polygon([(cx - 8, cy + 10), (cx + 8, cy + 10), (cx + 38, TH - 25), (cx - 38, TH - 25)], fill=(0, 245, 212, 35))

    # Giant Leviathan JAWS rising from the bottom!
    jaw_y = TH - 20
    draw_radial_glow(img, cx, jaw_y, 30, (0, 255, 150, 180), (0, 0, 0, 0))
    # Two glowing slit eyes
    d.ellipse([cx - 24, jaw_y - 12, cx - 14, jaw_y - 4], fill=h2c('#ffdd00'))
    d.ellipse([cx + 14, jaw_y - 12, cx + 24, jaw_y - 4], fill=h2c('#ffdd00'))
    d.point((cx - 19, jaw_y - 8), fill=h2c('#000000'))
    d.point((cx + 19, jaw_y - 8), fill=h2c('#000000'))
    # Razor fangs
    for fx in range(cx - 30, cx + 32, 8):
        d.polygon([(fx, TH), (fx + 4, TH), (fx + 2, jaw_y + 4)], fill=h2c('#ffffff'))

    img.save(os.path.join(ASSETS, 'thumb_abyss.png'))
    print("  Wrote thumb_abyss.png (Leviathan Chomp)")

    # ── Spritesheet (abyss.png + abyss.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Bathysphere Sub (32x32)
    bx, by = 0, 0
    draw_circle_fill(sd, bx + 16, by + 16, 14, h2c('#c98a44'))
    draw_circle_fill(sd, bx + 16, by + 16, 7, h2c('#00f5d4'))
    sd.rectangle([bx + 14, by + 1, bx + 18, by + 5], fill=h2c('#8c5923'))
    add_f('submersible', bx, by, 32, 32)

    # 2. Sea Turtle (32x24) - Surface stage
    tx, ty = 36, 0
    draw_circle_fill(sd, tx + 16, ty + 12, 9, h2c('#3b8c54'))
    sd.point((tx + 26, ty + 12), fill=h2c('#ffffff')) # head
    sd.line([(tx + 12, ty + 3), (tx + 22, ty + 8)], fill=h2c('#2b683e'), width=2) # flipper
    sd.line([(tx + 12, ty + 21), (tx + 22, ty + 16)], fill=h2c('#2b683e'), width=2)
    add_f('sea_turtle', tx, ty, 32, 24)

    # 3. Giant Kraken Squid (32x36) - Twilight stage
    kx, ky = 72, 0
    draw_circle_fill(sd, kx + 16, ky + 12, 10, h2c('#9c3b4a'))
    sd.ellipse([kx + 20, ky + 9, kx + 25, ky + 14], fill=h2c('#ffd166')) # eye
    sd.point((kx + 22, ky + 11), fill=h2c('#000000'))
    # Tentacles
    for t_i in [6, 12, 18, 24]:
        sd.line([(kx + 16, ky + 18), (kx + t_i, ky + 34)], fill=h2c('#b84658'), width=2)
    add_f('kraken_squid', kx, ky, 32, 36)

    # 4. Sunken Atlantean Column (24x40) - Ancient stage
    cx, cy = 108, 0
    sd.rectangle([cx + 4, cy + 4, cx + 20, cy + 8], fill=h2c('#6a8c88'))
    sd.rectangle([cx + 6, cy + 8, cx + 18, cy + 34], fill=h2c('#4a6864'))
    sd.rectangle([cx + 2, cy + 34, cx + 22, cy + 38], fill=h2c('#6a8c88'))
    add_f('atlantis_column', cx, cy, 24, 40)

    # 5. Colossal Leviathan JAWS (64x48) - Finale Chomp!
    jx, jy = 136, 0
    draw_radial_glow(simg, jx + 32, jy + 24, 22, (0, 255, 170, 200), (0, 0, 0, 0))
    # Upper jaw & fangs
    sd.polygon([(jx + 4, jy + 8), (jx + 32, jy + 2), (jx + 60, jy + 8), (jx + 48, jy + 22), (jx + 16, jy + 22)], fill=h2c('#042820'))
    # Razor teeth
    for tooth_x in range(jx + 12, jx + 52, 6):
        sd.polygon([(tooth_x, jy + 20), (tooth_x + 3, jy + 20), (tooth_x + 1, jy + 28)], fill=h2c('#ffffff'))
    # Glowing yellow slit eyes
    sd.ellipse([jx + 14, jy + 6, jx + 22, jy + 12], fill=h2c('#ffd166'))
    sd.ellipse([jx + 42, jy + 6, jx + 50, jy + 12], fill=h2c('#ffd166'))
    sd.point((jx + 18, jy + 9), fill=h2c('#000000'))
    sd.point((jx + 46, jy + 9), fill=h2c('#000000'))
    add_f('leviathan_jaws', jx, jy, 64, 48)

    # Bubbles (16x16)
    for i in range(3):
        ux, uy = 204 + i * 16, 0
        r = 2 + i * 2
        sd.ellipse([ux + 8 - r, uy + 8 - r, ux + 8 + r, uy + 8 + r], outline=h2c('#00f5d4', 200))
        add_f(f'bubble{i}', ux, uy, 16, 16)

    simg.save(os.path.join(ASSETS, 'abyss.png'))
    with open(os.path.join(ASSETS, 'abyss.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote abyss.png+json (Leviathan Chomp)")

# ════════════════════════════════════════════════════════════════════════════════
# 3. THEME 3: CHRONO-WARP: EARTH IN REVERSE (alchemy)
# ════════════════════════════════════════════════════════════════════════════════
def gen_alchemy():
    TW, TH = 96, 128
    img = Image.new('RGBA', (TW, TH), (18, 10, 24, 255))
    d = ImageDraw.Draw(img)
    # Temporal vortex sky
    for y in range(TH):
        t = y / TH
        col = lerp_color(h2c('#2b1038'), h2c('#0a0312'), t)
        d.line([(0, y), (TW, y)], fill=col)

    # Panoramic eras silhouette at bottom
    # Pyramids & Volcano
    d.polygon([(10, TH), (28, TH - 22), (46, TH)], fill=h2c('#d4af37', 160)) # Pyramid
    d.polygon([(52, TH), (74, TH - 30), (96, TH)], fill=h2c('#9c2828', 180)) # Volcano
    d.point((74, TH - 32), fill=h2c('#ff5500')) # Lava spark

    # Central Chrono-Device (Ornate Antique Hourglass of Time)
    cx, cy = TW // 2, 54
    # Time warp rings around hourglass
    d.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], outline=h2c('#00f5d4', 120))
    d.ellipse([cx - 24, cy - 24, cx + 24, cy + 24], outline=h2c('#ffd166', 150))
    # Hourglass Frame
    hw, hh = 18, 32
    d.rectangle([cx - hw, cy - hh, cx + hw, cy - hh + 4], fill=h2c('#d4af37'))
    d.rectangle([cx - hw, cy + hh - 4, cx + hw, cy + hh], fill=h2c('#d4af37'))
    d.line([(cx - hw + 2, cy - hh), (cx - hw + 2, cy + hh)], fill=h2c('#aa820a'), width=2)
    d.line([(cx + hw - 2, cy - hh), (cx + hw - 2, cy + hh)], fill=h2c('#aa820a'), width=2)
    # Glowing upward sands of time (reversing time!)
    d.polygon([(cx - 10, cy + 12), (cx + 10, cy + 12), (cx + 2, cy + 2), (cx - 2, cy + 2)], fill=h2c('#00f5d4', 220))
    d.polygon([(cx - 2, cy - 2), (cx + 2, cy - 2), (cx + 10, cy - 14), (cx - 10, cy - 14)], fill=h2c('#ffd166', 220))
    d.line([(cx, cy + 12), (cx, cy - 12)], fill=h2c('#ffffff'), width=1) # Upward sand stream

    img.save(os.path.join(ASSETS, 'thumb_alchemy.png'))
    print("  Wrote thumb_alchemy.png (Chrono-Warp)")

    # ── Spritesheet (alchemy.png + alchemy.json) ──
    SW, SH = 256, 128
    simg, sd = new_sheet(SW, SH)
    frames = {}
    def add_f(n, x, y, w, h): frames[n] = [x, y, w, h]

    # 1. Victorian Steam Train (36x24) - 1880s
    vx, vy = 0, 0
    sd.rectangle([vx + 6, vy + 8, vx + 32, vy + 22], fill=h2c('#1a1c22')) # boiler
    sd.rectangle([vx + 26, vy + 2, vx + 34, vy + 12], fill=h2c('#3a2418')) # cab
    sd.rectangle([vx + 10, vy + 2, vx + 14, vy + 8], fill=h2c('#d4af37')) # smokestack
    draw_circle_fill(sd, vx + 12, vy + 20, 3, h2c('#8c5923')) # wheels
    draw_circle_fill(sd, vx + 22, vy + 20, 3, h2c('#8c5923'))
    add_f('steam_train', vx, vy, 36, 24)

    # 2. Egyptian Great Pyramid (36x28) - 2500 BC
    px, py = 40, 0
    sd.polygon([(px + 2, py + 26), (px + 18, py + 4), (px + 34, py + 26)], fill=h2c('#d4af37'))
    sd.polygon([(px + 18, py + 4), (px + 34, py + 26), (px + 24, py + 26)], fill=h2c('#9c7816')) # shadow side
    add_f('pyramid', px, py, 36, 28)

    # 3. Roaring T-Rex Dinosaur (36x36) - 65 Million BC
    dx, dy = 80, 0
    # Head & snapping jaws
    sd.rectangle([dx + 16, dy + 6, dx + 32, dy + 18], fill=h2c('#4a6c38'))
    sd.polygon([(dx + 22, dy + 14), (dx + 32, dy + 14), (dx + 26, dy + 22)], fill=h2c('#2d4420')) # open lower jaw
    sd.point((dx + 22, dy + 9), fill=h2c('#ffd166')) # eye
    # Body & powerful legs
    sd.rectangle([dx + 8, dy + 14, dx + 22, dy + 28], fill=h2c('#4a6c38'))
    sd.polygon([(dx + 2, dy + 20), (dx + 8, dy + 16), (dx + 10, dy + 24)], fill=h2c('#4a6c38')) # tail
    sd.rectangle([dx + 12, dy + 26, dx + 18, dy + 35], fill=h2c('#3a542b')) # leg
    add_f('trex', dx, dy, 36, 36)

    # 4. Primordial Meteor (24x24) - 4.5 Billion BC
    mx, my = 120, 0
    draw_circle_fill(sd, mx + 12, my + 12, 6, h2c('#ff5500'))
    sd.point((mx + 12, my + 12), fill=h2c('#ffffff'))
    sd.line([(mx + 4, my + 4), (mx + 10, my + 10)], fill=h2c('#ffd166'), width=2)
    add_f('meteor', mx, my, 24, 24)

    # 5. Chrono-Hourglass Frame (32x48)
    hx, hy = 148, 0
    sd.rectangle([hx + 4, hy + 2, hx + 28, hy + 6], fill=h2c('#d4af37')) # top plate
    sd.rectangle([hx + 4, hy + 42, hx + 28, hy + 46], fill=h2c('#d4af37')) # bottom plate
    sd.line([(hx + 6, hy + 2), (hx + 6, hy + 46)], fill=h2c('#aa820a'), width=2)
    sd.line([(hx + 26, hy + 2), (hx + 26, hy + 46)], fill=h2c('#aa820a'), width=2)
    add_f('hourglass_frame', hx, hy, 32, 48)

    # Big Bang cosmic particles (16x16)
    for i in range(3):
        cx, cy = 184 + i * 18, 0
        draw_circle_fill(sd, cx + 8, cy + 8, 3 + i, h2c('#00f5d4'))
        sd.point((cx + 8, cy + 8), fill=h2c('#ffffff'))
        add_f(f'cosmic_spark{i}', cx, cy, 16, 16)

    simg.save(os.path.join(ASSETS, 'alchemy.png'))
    with open(os.path.join(ASSETS, 'alchemy.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print("  Wrote alchemy.png+json (Chrono-Warp)")

if __name__ == '__main__':
    print("Generating narrative assets for 3 themes...")
    gen_mech()
    gen_abyss()
    gen_alchemy()
    print("Done!")
