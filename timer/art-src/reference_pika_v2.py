"""APPROVED style reference for the V2 Poke-Feast Pikachu (2026-07-04).

Source of truth for the character look (project convention: reference_*.py
mockups are authoritative — port their drawing when regenerating sheets).
Construction rules proven here and implemented in gen_feast.py:
  * ONE consistent 3/4-left projection (features shift by FX, nothing on the rim)
  * unified silhouette (outline pass first, fills second; ears merge via
    outline-before-head-fill + fill-after-head-fill two-pass draw)
  * flat cel shading: chocolate outline #4A3212, same-hue shadow #F0B900,
    NO white speculars, NO cream belly sticker
  * eyes wide-set at cheek height, single catchlight upper-right
  * cheeks flat #E8442C in the lower-outer face quadrant, slight (~15%) bulge
  * centred tiny nose + w-mouth (>=2.4px stroke so it reads at scene scale)
  * broad leaf ears, black outer ~35% only
  * flat hard-cornered zigzag bolt tail with brown base wedge, from the lower back
  * capsule limbs (round caps, no pipe-seam rings); nibble pose = paws + food at mouth

Run: python reference_pika_v2.py  ->  writes reference_pika_v2.png beside it.
"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.dirname(os.path.abspath(__file__))
SS = 4

# palette — flat cel, warm chocolate outline (not mustard)
BODY   = (255, 222, 0, 255)
SHAD   = (240, 185, 0, 255)      # same-hue shadow, not brown-ochre
OUTL   = (74, 50, 18, 255)       # dark chocolate outline, reads crisp
CHEEK  = (232, 68, 44, 255)      # flat red-orange, no gloss
CHEEK_D= (196, 52, 32, 255)
BLK    = (26, 26, 26, 255)
BROWN  = (138, 90, 43, 255)      # tail base / back stripes
TAIL_U = (201, 138, 61, 255)
MOUTH_D= (94, 44, 22, 255)
TONGUE = (238, 120, 110, 255)
WHT    = (255, 255, 255, 255)

W, H = 150, 140

class HD:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w*SS, h*SS), (0,0,0,0))
        self.d = ImageDraw.Draw(self.img)
    def ell(self, cx, cy, rx, ry, c):
        self.d.ellipse([(cx-rx)*SS,(cy-ry)*SS,(cx+rx)*SS,(cy+ry)*SS], fill=c)
    def cir(self, cx, cy, r, c): self.ell(cx, cy, r, r, c)
    def poly(self, pts, c): self.d.polygon([(x*SS,y*SS) for x,y in pts], fill=c)
    def line(self, pts, c, w):
        self.d.line([(x*SS,y*SS) for x,y in pts], fill=c, width=max(1,int(w*SS)), joint='curve')
    def arc_pts(self, cx, cy, rx, ry, a0, a1, n=20):
        return [(cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n)),
                 cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))) for i in range(n+1)]
    def out(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)

def grow_poly(pts, cx, cy, m):
    return [(cx+(x-cx)*m, cy+(y-cy)*m) for x,y in pts]

def bolt_tail(hd, bx, by, s=1.0):
    """Flat hard-cornered lightning-bolt tail, one polygon, brown base wedge."""
    def P(x,y): return (bx+x*s, by+y*s)
    # zigzag silhouette: narrow at base -> broad flat top, sharp corners
    pts = [P(0,0), P(9,-9), P(2,-16), P(16,-28), P(8,-33), P(26,-52),
           P(40,-50), P(30,-38), P(38,-40), P(24,-22), P(31,-20), P(12,-4)]
    cx = sum(p[0] for p in pts)/len(pts); cy = sum(p[1] for p in pts)/len(pts)
    hd.poly(grow_poly(pts, cx, cy, 1.14), OUTL)
    hd.poly(pts, BODY)
    # brown base wedge (classic)
    base = [P(0,0), P(9,-9), P(2,-16), P(13,-25), P(20,-16), P(12,-4)]
    bcx = sum(p[0] for p in base)/len(base); bcy = sum(p[1] for p in base)/len(base)
    hd.poly(grow_poly(base, bcx, bcy, 1.16), OUTL)
    hd.poly(base, BROWN)
    hd.line([P(4,-6), P(12,-14)], TAIL_U, 2.2*s)

def _taper_strip(pts_w):
    """Closed polygon around a centreline of (x, y, width) tuples."""
    left, right = [], []
    for i, (x, y, ww) in enumerate(pts_w):
        if i == 0: dx, dy = pts_w[1][0]-x, pts_w[1][1]-y
        elif i == len(pts_w)-1: dx, dy = x-pts_w[i-1][0], y-pts_w[i-1][1]
        else: dx, dy = pts_w[i+1][0]-pts_w[i-1][0], pts_w[i+1][1]-pts_w[i-1][1]
        L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
        left.append((x+nx*ww/2, y+ny*ww/2)); right.append((x-nx*ww/2, y-ny*ww/2))
    return left + right[::-1]

def lerp2(a, b, t): return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)

def ear_outline(hd, base, tip, wb, curve):
    """Outline pass only — call BEFORE the head fill."""
    hd.poly(_taper_strip(_ear_segs(base, tip, wb, curve, grow=3.4)), OUTL)

def ear_fill(hd, base, tip, wb, curve):
    """Fill pass — call AFTER the head fill so the base merges seamlessly."""
    hd.poly(_taper_strip(_ear_segs(base, tip, wb, curve)), BODY)
    # black tip: outer ~35% only, tapering smoothly to the point
    segs = _ear_segs(base, tip, wb, curve)
    a, b, c = segs
    p0 = lerp2((b[0], b[1]), (c[0], c[1]), 0.3)
    w0 = b[2] + (c[2] - b[2]) * 0.3
    hd.poly(_taper_strip([(p0[0], p0[1], w0), (c[0], c[1], c[2])]), BLK)

def _ear_segs(base, tip, wb, curve, grow=0.0):
    """Leaf-shaped ear centreline: base -> mid (widest bulge) -> pointed tip."""
    bx, by = base; tx, ty = tip
    mx = (bx+tx)/2 + (ty-by)*curve*0.5
    my = (by+ty)/2 - (tx-bx)*curve*0.5
    return [(bx, by, wb+grow), (mx, my, wb*0.88+grow), (tx, ty, 2.2+grow*0.8)]

def draw_pika_v2(pose='idle'):
    hd = HD(W, H)
    FX = -6            # 3/4 facing-left offset: features shift toward -x
    hxc, hyc = 72, 58  # head centre
    hrx, hry = 37, 31  # head wider than tall
    bx, by = 76, 106   # body centre
    brx, bry = 31, 26

    chew = pose == 'chew'
    hold = pose in ('hold', 'chew')

    # ── tail first (behind everything), from LOWER BACK, clearly clear of head
    bolt_tail(hd, bx+brx*0.8, by+6, 1.0)

    # ── ear geometry: broad leaf shapes, bases INSIDE the head so fills merge
    earL = ((hxc-20, hyc-hry*0.55), (hxc-38, hyc-hry-22), 19, 0.30)
    earR = ((hxc+22, hyc-hry*0.5), (hxc+46, hyc-hry-20), 20, -0.26)
    ear_outline(hd, *earR)
    ear_outline(hd, *earL)

    # ── unified body: one outline pass around head+body, then fills
    hd.ell(bx, by, brx+2.6, bry+2.6, OUTL)
    hd.ell(hxc, hyc, hrx+2.6, hry+2.6, OUTL)
    # feet embedded in silhouette (outline pass)
    hd.ell(bx-19, by+24, 12.5, 7.5, OUTL)
    hd.ell(bx+15, by+25, 11.5, 7, OUTL)
    # fills
    hd.ell(bx, by, brx, bry, BODY)
    hd.ell(hxc, hyc, hrx, hry, BODY)
    hd.ell(bx-19, by+24, 10.4, 5.8, BODY)
    hd.ell(bx+15, by+25, 9.4, 5.3, BODY)
    # ear fills AFTER the head fill → bases merge seamlessly, no seam line
    ear_fill(hd, *earR)
    ear_fill(hd, *earL)
    # flat cel shadow: single crescent at the body bottom only (same hue)
    hd.ell(bx, by+bry*0.55, brx*0.8, bry*0.35, SHAD)
    hd.ell(bx, by+bry*0.55-4, brx*0.78, bry*0.33, BODY)   # carve crescent
    # toe nicks (both feet, short)
    hd.line([(bx-22, by+22),(bx-22, by+26)], OUTL, 1.4)
    hd.line([(bx-16, by+22),(bx-16, by+27)], OUTL, 1.4)
    hd.line([(bx+12, by+23),(bx+12, by+27)], OUTL, 1.3)
    hd.line([(bx+17, by+23),(bx+17, by+27)], OUTL, 1.3)

    # back stripes: two flat horizontal bands on the back edge, clear of tail
    hd.line(hd.arc_pts(bx+brx*0.16, by-15, brx*0.52, 3.5, -22, 22), BROWN, 5.6)
    hd.line(hd.arc_pts(bx+brx*0.16, by-5, brx*0.48, 3.5, -22, 22), BROWN, 5.6)

    # ── face (consistent 3/4: everything shifts by FX, nothing on the rim) ──
    eye_y = hyc - 1
    # eyes wide-set, lower half of face
    for ex, er in ((hxc-20+FX, 8.8), (hxc+20+FX*0.4, 8.1)):
        hd.cir(ex, eye_y, er, BLK)
        hd.cir(ex+er*0.30, eye_y-er*0.34, er*0.36, WHT)     # catchlight SAME side
    # cheeks: lower-outer quadrant, mostly ON the face, outer edge just
    # nudging past the silhouette (~15% of the disc) — never below the jaw
    for cx_, cy_, r_ in ((hxc-hrx*0.70+FX*0.5, hyc+hry*0.40, 11),
                         (hxc+hrx*0.70, hyc+hry*0.36, 10)):
        hd.cir(cx_, cy_, r_+1.6, OUTL)
        hd.cir(cx_, cy_, r_, CHEEK)
        hd.line(hd.arc_pts(cx_, cy_, r_*0.72, r_*0.72, 40, 140), CHEEK_D, 1.6)
    # tiny nose just left of centre (NOT on the rim)
    hd.ell(hxc-4+FX, hyc+6, 2.2, 1.4, BLK)
    # mouth: centred under the nose — w-smile or open chew
    mxc, myc = hxc-4+FX, hyc+13
    if chew:
        hd.ell(mxc, myc+1, 6.5, 5.2, OUTL)
        hd.ell(mxc, myc+1, 5.2, 4.0, MOUTH_D)
        hd.ell(mxc, myc+3.2, 3.4, 1.8, TONGUE)
    else:
        hd.line(hd.arc_pts(mxc-4.5, myc, 4.6, 3.4, 15, 165), OUTL, 2.4)
        hd.line(hd.arc_pts(mxc+4.5, myc, 4.6, 3.4, 15, 165), OUTL, 2.4)

    # ── arms ──
    if hold:
        # both paws up holding an apple AT the mouth (iconic nibble pose);
        # the apple covers the lower mouth, fat stubby arms, paws on the fruit
        axc, ayc = mxc, myc + 7
        hd.cir(axc, ayc, 10.6, OUTL)
        hd.cir(axc, ayc, 9.2, (214, 40, 60, 255))
        hd.ell(axc-3, ayc-3, 3.0, 2.1, (255, 150, 160, 255))
        hd.line([(axc, ayc-9), (axc+1.5, ayc-12)], (90, 60, 20, 255), 2.0)
        for sx in (-1, 1):
            # bent arm: shoulder -> elbow -> paw on the fruit (capsule ends)
            sh = (bx+sx*brx*0.72, by-14)
            el = (axc+sx*15, ayc+13)
            paw = (axc+sx*7.5, ayc+2)
            hd.line([sh, el, paw], OUTL, 10.5); hd.cir(sh[0], sh[1], 5.2, OUTL); hd.cir(paw[0], paw[1], 5.2, OUTL)
            hd.line([sh, el, paw], BODY, 7.6);  hd.cir(sh[0], sh[1], 3.8, BODY); hd.cir(paw[0], paw[1], 3.8, BODY)
    else:
        # short fat arms resting toward the belly front — capsules, no seams
        for sx in (-1, 1):
            sh = (bx+sx*brx*0.8, by-14)
            paw = (bx+sx*brx*0.4, by-3)
            hd.line([sh, paw], OUTL, 12); hd.cir(sh[0], sh[1], 6, OUTL); hd.cir(paw[0], paw[1], 6, OUTL)
            hd.line([sh, paw], BODY, 8.8); hd.cir(sh[0], sh[1], 4.4, BODY); hd.cir(paw[0], paw[1], 4.4, BODY)

    return hd.out()

mock_idle = draw_pika_v2('idle')
mock_chew = draw_pika_v2('chew')

UP = 3
board = Image.new('RGB', (W*UP*2 + 36, H*UP + 40), (238, 238, 244))
d = ImageDraw.Draw(board)
for i, (im, lab) in enumerate([(mock_idle, 'V2 reference idle'), (mock_chew, 'V2 reference nibble')]):
    big = im.resize((W*UP, H*UP), Image.LANCZOS)
    board.paste(big, (12 + i*(W*UP + 12), 28), big)
    d.text((12 + i*(W*UP + 12), 8), lab, fill=(20, 20, 20))
board.save(os.path.join(OUT, 'reference_pika_v2.png'))
print('wrote reference_pika_v2.png')
