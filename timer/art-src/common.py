"""Shared helpers for Pixel Timer art generators."""
from PIL import Image, ImageDraw
import json, os, math

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')


def new_sheet(w, h):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img, frames, name):
    os.makedirs(ASSETS, exist_ok=True)
    img.save(os.path.join(ASSETS, name + '.png'))
    with open(os.path.join(ASSETS, name + '.json'), 'w') as f:
        json.dump(frames, f, indent=2)
    print(f'wrote {name}.png+json  size={img.size}  frames={len(frames)}')


def rect(d, x, y, w, h, c):
    if w <= 0 or h <= 0:
        return
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def h2c(hex_str, a=255):
    """Convert #rrggbb to (r,g,b,a) tuple."""
    s = hex_str.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def draw_pattern(img, palette, pat, ox, oy):
    """Draw a pixel pattern. pat is a list of equal-length strings.
    Each char maps to a color (or None/'.') via palette dict."""
    px = img.load()
    for ry, row in enumerate(pat):
        for rx, ch in enumerate(row):
            col = palette.get(ch)
            if col is not None:
                px[ox + rx, oy + ry] = col


def lerp_color(c1, c2, t):
    """Linearly interpolate between two RGBA tuples."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))


def draw_circle_fill(d, cx, cy, r, col):
    """Filled circle using horizontal spans."""
    for dy in range(-r, r + 1):
        dx = int(math.sqrt(max(0, r * r - dy * dy)))
        if dx >= 0:
            d.rectangle([cx - dx, cy + dy, cx + dx, cy + dy], fill=col)


def draw_circle_outline(d, cx, cy, r, col, thickness=1):
    """Hollow circle outline."""
    for dy in range(-r - thickness, r + thickness + 1):
        for dx in range(-r - thickness, r + thickness + 1):
            dist = math.sqrt(dx * dx + dy * dy)
            if r - thickness <= dist <= r:
                d.point((cx + dx, cy + dy), fill=col)
