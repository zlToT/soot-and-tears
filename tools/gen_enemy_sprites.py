"""Generates the 8 newer enemy sprites as PNGs (self-contained, no preview import).

Same shapes as the in-game canvas textures, exported once so the art lives in
public/assets like the rest of the sprites.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "sprites", "enemy")

OUTL = (22, 13, 9, 255)


def c(value: int) -> tuple[int, int, int, int]:
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF, 255)


def ellipse(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, color):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)


def rect(d: ImageDraw.ImageDraw, x, y, w, h, color):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def save(img: Image.Image, name: str):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("png", name, img.size)


def hop():
    img = Image.new("RGBA", (22, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 11, 10, 9, 6, OUTL)
    ellipse(d, 11, 10, 8, 5, c(0x6B4630))
    ellipse(d, 9, 7, 4, 2, c(0x8A6A48))
    rect(d, 7, 9, 2, 2, c(0x1A100C))
    rect(d, 13, 9, 2, 2, c(0x1A100C))
    rect(d, 7, 9, 1, 1, c(0xD8CBB0))
    rect(d, 13, 9, 1, 1, c(0xD8CBB0))
    rect(d, 8, 12, 6, 1, c(0x1A100C))
    save(img, "hop.png")


def boom_moth():
    img = Image.new("RGBA", (26, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 6, 11, 4, 6, OUTL)
    ellipse(d, 6, 11, 3, 5, c(0x6B3A2A))
    ellipse(d, 20, 11, 4, 6, OUTL)
    ellipse(d, 20, 11, 3, 5, c(0x6B3A2A))
    ellipse(d, 13, 12, 5, 6, OUTL)
    ellipse(d, 13, 12, 4, 5, c(0x8A4A34))
    rect(d, 12, 2, 1, 6, OUTL)
    ellipse(d, 13, 2, 2, 2, c(0xE8C064))
    rect(d, 10, 12, 2, 2, c(0x1A100C))
    rect(d, 15, 12, 2, 2, c(0x1A100C))
    save(img, "boom_moth.png")


def toad():
    img = Image.new("RGBA", (26, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 13, 12, 10, 6, OUTL)
    ellipse(d, 13, 12, 9, 5, c(0x4F6B3A))
    ellipse(d, 7, 8, 3, 3, OUTL)
    ellipse(d, 7, 8, 2, 2, c(0x6F8A58))
    ellipse(d, 19, 8, 3, 3, OUTL)
    ellipse(d, 19, 8, 2, 2, c(0x6F8A58))
    rect(d, 6, 8, 1, 1, OUTL)
    rect(d, 18, 8, 1, 1, OUTL)
    rect(d, 9, 14, 8, 1, c(0x1A100C))
    rect(d, 3, 16, 4, 3, c(0x3A4A2A))
    rect(d, 19, 16, 4, 3, c(0x3A4A2A))
    save(img, "toad.png")


def maw():
    img = Image.new("RGBA", (26, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 13, 12, 9, 8, OUTL)
    ellipse(d, 13, 12, 8, 7, c(0x2A1A14))
    ellipse(d, 13, 14, 6, 4, c(0x8C2A22))
    rect(d, 9, 12, 1, 3, c(0xD8CBB0))
    rect(d, 12, 12, 1, 3, c(0xD8CBB0))
    rect(d, 15, 12, 1, 3, c(0xD8CBB0))
    ellipse(d, 13, 6, 2, 2, c(0xD8CBB0))
    rect(d, 13, 6, 1, 1, c(0x1A100C))
    save(img, "maw.png")


def doll():
    img = Image.new("RGBA", (22, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 11, 7, 6, 6, OUTL)
    ellipse(d, 11, 7, 5, 5, c(0x6B5A3C))
    rect(d, 6, 12, 10, 11, OUTL)
    rect(d, 7, 13, 8, 9, c(0x7A6644))
    rect(d, 3, 13, 3, 8, OUTL)
    rect(d, 4, 14, 2, 6, c(0x6B5A3C))
    rect(d, 16, 13, 3, 8, OUTL)
    rect(d, 17, 14, 2, 6, c(0x6B5A3C))
    rect(d, 8, 6, 2, 2, c(0x1A100C))
    rect(d, 13, 6, 2, 2, c(0x1A100C))
    rect(d, 9, 15, 1, 4, c(0xA89060))
    rect(d, 7, 23, 3, 4, OUTL)
    rect(d, 12, 23, 3, 4, OUTL)
    save(img, "doll.png")


def mask():
    img = Image.new("RGBA", (24, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 5, 10, 14, 12, OUTL)
    rect(d, 6, 11, 12, 10, c(0x6B7076))
    rect(d, 5, 3, 14, 9, OUTL)
    rect(d, 6, 4, 12, 7, c(0x9AA0A4))
    rect(d, 8, 8, 8, 2, c(0x1A100C))
    rect(d, 8, 9, 1, 1, c(0xFF7A5A))
    rect(d, 2, 12, 4, 5, OUTL)
    rect(d, 3, 13, 3, 3, c(0x6B7076))
    rect(d, 18, 12, 4, 5, OUTL)
    rect(d, 19, 13, 3, 3, c(0x6B7076))
    rect(d, 8, 22, 3, 5, OUTL)
    rect(d, 13, 22, 3, 5, OUTL)
    rect(d, 11, 0, 2, 4, c(0xA04434))
    save(img, "mask.png")


def vis():
    img = Image.new("RGBA", (18, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(4):
        y = 5 + i * 6
        ellipse(d, 9, y, 5 - i * 0.8, 4, OUTL)
        ellipse(d, 9, y, 4 - i * 0.8, 3, c(0x8A3A34))
    ellipse(d, 9, 5, 2, 2, c(0xD85040))
    rect(d, 9, 4, 1, 1, c(0xFFD0A0))
    save(img, "vis.png")


def shade_moth():
    img = Image.new("RGBA", (24, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 6, 11, 5, 6, OUTL)
    ellipse(d, 6, 11, 4, 5, c(0x33263F))
    ellipse(d, 18, 11, 5, 6, OUTL)
    ellipse(d, 18, 11, 4, 5, c(0x33263F))
    ellipse(d, 12, 12, 4, 6, OUTL)
    ellipse(d, 12, 12, 3, 5, c(0x5A3A6A))
    rect(d, 10, 7, 1, 1, c(0xE8B070))
    rect(d, 14, 7, 1, 1, c(0xE8B070))
    rect(d, 11, 2, 1, 4, OUTL)
    rect(d, 13, 2, 1, 4, OUTL)
    ellipse(d, 12, 2, 1, 1, c(0xA070D0))
    save(img, "shade_moth.png")


def split_grub():
    img = Image.new("RGBA", (28, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 7, 10, 5, 5, OUTL)
    ellipse(d, 7, 10, 4, 4, c(0x6B4A32))
    ellipse(d, 14, 10, 6, 6, OUTL)
    ellipse(d, 14, 10, 5, 5, c(0x7A5638))
    ellipse(d, 22, 9, 4, 4, OUTL)
    ellipse(d, 22, 9, 3, 3, c(0x8A6440))
    rect(d, 21, 12, 1, 1, c(0x1A100C))
    rect(d, 24, 12, 1, 1, c(0x1A100C))
    rect(d, 14, 5, 1, 10, c(0x2A1A10))
    rect(d, 3, 15, 4, 1, c(0x2A1A10))
    rect(d, 19, 15, 4, 1, c(0x2A1A10))
    save(img, "split_grub.png")


def thorn_roll():
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(8):
        import math as _m
        angle = i * _m.pi / 4
        cx = 12 + _m.cos(angle) * 9
        cy = 12 + _m.sin(angle) * 9
        d.polygon(
            [
                (cx + _m.cos(angle) * 3, cy + _m.sin(angle) * 3),
                (cx + _m.cos(angle + 2.4) * 3, cy + _m.sin(angle + 2.4) * 3),
                (cx + _m.cos(angle - 2.4) * 3, cy + _m.sin(angle - 2.4) * 3),
            ],
            fill=c(0x9A8A70),
        )
    ellipse(d, 12, 12, 9, 9, OUTL)
    ellipse(d, 12, 12, 8, 8, c(0x6B5A44))
    ellipse(d, 9, 11, 2, 2, c(0x1A100C))
    ellipse(d, 14, 11, 2, 2, c(0x1A100C))
    rect(d, 12, 14, 2, 1, c(0x2A1A10))
    save(img, "thorn_roll.png")


if __name__ == "__main__":
    hop()
    boom_moth()
    toad()
    maw()
    doll()
    mask()
    vis()
    shade_moth()
    split_grub()
    thorn_roll()
    print("done", OUT)
