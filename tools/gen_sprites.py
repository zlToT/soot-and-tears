"""Export individual pixel sprites for the Phaser prototype.

The character/enemy art lives in the style-preview renderer for now; this
script calls those draw functions on transparent layers and writes one PNG per
frame. Later this becomes the real asset pipeline (atlas + manifest).
"""

from __future__ import annotations

import importlib.util
import math
import os
import random

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "sprites")
PREVIEW = r"D:\Work\phaser_project\sixroom\.tmp\style_preview\gen_style_preview_pixel.py"

spec = importlib.util.spec_from_file_location("pixel_preview", PREVIEW)
m = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(m)

OUTL = m.OUTL
INK = m.INK
FLOOR_D = (72, 55, 42, 255)
FLOOR_M = (78, 60, 45, 255)
FLOOR_L = (84, 65, 49, 255)
WALL_D = (40, 30, 23, 255)
WALL_M = (54, 41, 31, 255)
WALL_L = (68, 52, 39, 255)
MORTAR = (30, 22, 17, 255)
BONE = m.BONE
GOLD = m.GOLD
FIRE = m.FIRE
FIRE_L = m.FIRE_L
RED = m.RED
RED_D = m.RED_D
TEAR = m.TEAR
TEAR_L = m.TEAR_L


def save(img: Image.Image, rel: str):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("png", rel, img.size)


def hero_frames():
    for facing in ("down", "left", "right", "up"):
        for frame in (0, 1):
            img = Image.new("RGBA", (26, 34), (0, 0, 0, 0))
            m.hero(img, 13, 20, facing, frame)
            save(img, f"hero/{facing}_{frame}.png")


def enemy_frames():
    data = [
        ("grub", m.grub, 28, 20, 14, 10),
        ("moth", m.moth, 28, 24, 14, 12),
        ("spitter", m.spitter, 24, 24, 12, 12),
        ("rat", m.tin_rat, 26, 16, 13, 8),
    ]
    for name, fn, w, h, cx, cy in data:
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        fn(img, cx, cy)
        save(img, f"enemy/{name}.png")


def tear():
    img = Image.new("RGBA", (8, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(4, 0), (7, 5), (6, 9), (2, 9), (1, 5)], fill=OUTL)
    d.polygon([(4, 1), (6, 5), (5, 8), (3, 8), (2, 5)], fill=TEAR)
    d.point((3, 4), fill=TEAR_L)
    d.point((3, 5), fill=TEAR_L)
    save(img, "fx/tear.png")


def heart(mode: str, rel: str):
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    m.heart_icon(img, 0, 0, mode)
    save(img, rel)


def rock():
    img = Image.new("RGBA", (22, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([1, 3, 20, 16], fill=OUTL)
    d.ellipse([2, 4, 19, 15], fill=(108, 94, 76, 255))
    d.ellipse([4, 5, 15, 12], fill=(132, 116, 92, 255))
    d.rectangle([5, 12, 12, 13], fill=(76, 64, 50, 255))
    d.point((6, 7), fill=(156, 138, 110, 255))
    save(img, "terrain/rock.png")


def shadow():
    img = Image.new("RGBA", (20, 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([1, 1, 18, 6], fill=(0, 0, 0, 90))
    save(img, "fx/shadow.png")


def floor_tiles():
    rng = random.Random(41)
    for i in range(3):
        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        base = [FLOOR_D, FLOOR_M, FLOOR_L][i]
        d.rectangle([0, 0, 31, 31], fill=base)
        # A single hairline of grout, no bevel: the grid should be felt, not counted.
        d.line([(0, 0), (31, 0)], fill=(62, 47, 36, 255))
        d.line([(0, 0), (0, 31)], fill=(66, 50, 38, 255))
        for _ in range(18):
            x, y = rng.randrange(3, 30), rng.randrange(3, 30)
            c = (48, 36, 27, 255) if rng.random() < 0.55 else (96, 76, 56, 255)
            d.point((x, y), fill=c)
        if i == 1:
            for _ in range(4):
                x, y = rng.randrange(6, 26), rng.randrange(6, 26)
                d.point((x, y), fill=(42, 31, 23, 255))
                d.point((x + 1, y + 1), fill=(42, 31, 23, 255))
        if i == 2:
            d.point((8, 9), fill=m.MOSS)
            d.point((9, 9), fill=m.MOSS)
            d.point((8, 10), fill=m.MOSS)
            d.point((21, 22), fill=m.MOSS)
        save(img, f"terrain/floor_{i}.png")


def baked_floor():
    w, h = 576, 288
    img = Image.new("RGBA", (w, h), (52, 39, 30, 255))
    d = ImageDraw.Draw(img)
    rng = random.Random(0xB4A5E)
    tile = 32
    for ty in range(0, h, tile):
        for tx in range(0, w, tile):
            base = rng.choices([FLOOR_D, FLOOR_M, FLOOR_L], weights=[2, 7, 1])[0]
            d.rectangle([tx, ty, tx + tile - 1, ty + tile - 1], fill=base)
            d.line([(tx, ty), (tx + tile - 1, ty)], fill=(64, 49, 37, 255))
            d.line([(tx, ty), (tx, ty + tile - 1)], fill=(66, 50, 38, 255))
            for _ in range(16):
                x, y = tx + rng.randrange(3, 29), ty + rng.randrange(3, 29)
                c = (48, 36, 27, 255) if rng.random() < 0.6 else (96, 76, 56, 255)
                d.point((x, y), fill=c)
            if rng.random() < 0.18:
                x, y = tx + rng.randrange(8, 24), ty + rng.randrange(8, 24)
                for _ in range(4):
                    d.point((x, y), fill=(42, 31, 23, 255))
                    x += rng.choice([-1, 0, 1])
                    y += rng.choice([0, 1])
            if rng.random() < 0.1:
                x, y = tx + rng.randrange(3, 26), ty + rng.randrange(3, 26)
                d.point((x, y), fill=m.MOSS)
                d.point((x + 1, y), fill=m.MOSS)
                d.point((x, y + 1), fill=m.MOSS)

    # Large organic mottling: this is what kills the "wallpaper" read.
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for _ in range(22):
        cx, cy = rng.randrange(0, w), rng.randrange(0, h)
        rx, ry = rng.randrange(30, 90), rng.randrange(20, 60)
        col = (18, 12, 8, 20) if rng.random() < 0.6 else (140, 110, 80, 12)
        od.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col)
    img.alpha_composite(overlay)

    # Dried blood pools with a few satellite dots.
    blood = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blood)
    for _ in range(5):
        cx, cy = rng.randrange(40, w - 40), rng.randrange(40, h - 40)
        rx, ry = rng.randrange(12, 30), rng.randrange(8, 18)
        bd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(84, 22, 18, 90))
        for _ in range(7):
            a = rng.random() * 6.283
            dist = rng.randrange(rx, rx * 2)
            px = int(cx + math.cos(a) * dist)
            py = int(cy + math.sin(a) * dist * 0.7)
            r = rng.randrange(1, 4)
            bd.ellipse([px - r, py - r, px + r, py + r], fill=(84, 22, 18, 80))
    img.alpha_composite(blood)
    save(img, "terrain/floor_baked.png")


def wall_tile():
    img = Image.new("RGBA", (32, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 23], fill=MORTAR)
    for row in range(2):
        y = row * 12
        off = -8 if row % 2 else 0
        for x in range(off, 32, 16):
            d.rectangle([x + 1, y + 1, x + 15, y + 11], fill=WALL_M)
            d.line([(x + 1, y + 1), (x + 15, y + 1)], fill=(76, 58, 44, 255))
            d.line([(x + 1, y + 11), (x + 15, y + 11)], fill=WALL_D)
            d.point((x + 3, y + 3), fill=(64, 49, 37, 255))
    save(img, "terrain/wall.png")


def wall_v_tile():
    img = Image.new("RGBA", (24, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 23, 31], fill=MORTAR)
    for row in range(4):
        y = row * 8
        off = -6 if row % 2 else 0
        for x in range(off, 24, 12):
            d.rectangle([x + 1, y + 1, x + 11, y + 7], fill=WALL_M if row % 2 == 0 else WALL_D)
            d.line([(x + 1, y + 1), (x + 11, y + 1)], fill=(72, 55, 42, 255))
    save(img, "terrain/wall_v.png")


def glow():
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            dx = (x - size / 2) / (size / 2)
            dy = (y - size / 2) / (size / 2)
            d = (dx * dx + dy * dy) ** 0.5
            a = max(0.0, 1.0 - d) ** 2
            px[x, y] = (255, 154, 70, int(a * 150))
    save(img, "fx/glow.png")


def vignette():
    w, h = 640, 360
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    for y in range(h):
        for x in range(w):
            dx = (x - w / 2) / (w / 2)
            dy = (y - h / 2) / (h / 2)
            d = (dx * dx + dy * dy) ** 0.5
            if d <= 0.62:
                continue
            a = min(1.0, (d - 0.62) * 1.6)
            if bayer[y % 4][x % 4] / 16.0 < a:
                px[x, y] = (8, 5, 4, int(150 * a))
    save(img, "fx/vignette.png")


def door(open_state: bool):
    img = Image.new("RGBA", (48, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 47, 23], fill=(28, 19, 14, 255))
    d.rectangle([2, 2, 45, 23], fill=(12, 8, 6, 255) if open_state else (38, 25, 18, 255))
    if not open_state:
        d.rectangle([6, 4, 41, 23], fill=(88, 56, 34, 255))
        d.rectangle([6, 4, 41, 5], fill=(118, 78, 46, 255))
        for x in (14, 24, 34):
            d.rectangle([x, 4, x + 1, 23], fill=(60, 38, 22, 255))
        d.rectangle([21, 14, 26, 16], fill=GOLD)
        d.point((23, 15), fill=OUTL)
    else:
        d.rectangle([8, 8, 39, 23], fill=(10, 6, 4, 255))
        d.rectangle([10, 20, 37, 23], fill=(64, 44, 28, 255))
        d.rectangle([10, 20, 37, 20], fill=(116, 82, 52, 255))
    save(img, "terrain/door_open.png" if open_state else "terrain/door_closed.png")


def torch():
    img = Image.new("RGBA", (12, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([5, 8, 6, 19], fill=OUTL)
    d.rectangle([4, 18, 7, 19], fill=(48, 30, 20, 255))
    d.polygon([(6, 0), (10, 6), (8, 11), (4, 11), (2, 6)], fill=OUTL)
    d.polygon([(6, 1), (9, 6), (7, 10), (5, 10), (3, 6)], fill=FIRE)
    d.polygon([(6, 3), (7, 6), (6, 9), (5, 6)], fill=FIRE_L)
    save(img, "terrain/torch.png")


def favicon():
    img = Image.new("RGBA", (16, 16), (20, 13, 10, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([1, 1, 14, 14], fill=(52, 38, 28, 255))
    d.polygon([(8, 2), (13, 8), (11, 14), (5, 14), (3, 8)], fill=OUTL)
    d.polygon([(8, 3), (12, 8), (10, 13), (6, 13), (4, 8)], fill=TEAR)
    d.point((6, 7), fill=TEAR_L)
    d.point((6, 8), fill=TEAR_L)
    path = os.path.join(ROOT, "public", "favicon.png")
    img.save(path)
    print("png favicon.png")


if __name__ == "__main__":
    hero_frames()
    enemy_frames()
    tear()
    heart("full", "ui/heart_full.png")
    heart("half", "ui/heart_half.png")
    heart("empty", "ui/heart_empty.png")
    rock()
    shadow()
    floor_tiles()
    baked_floor()
    wall_tile()
    wall_v_tile()
    door(False)
    door(True)
    torch()
    glow()
    vignette()
    favicon()
    print("done", OUT)
