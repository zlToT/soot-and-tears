"""Generates the first two boss sprites as PNGs."""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "sprites", "boss")

OUTL = (22, 13, 9, 255)


def c(value: int) -> tuple[int, int, int, int]:
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF, 255)


def ellipse(d, cx, cy, rx, ry, color):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)


def rect(d, x, y, w, h, color):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def save(img: Image.Image, name: str):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("png", name, img.size)


def granny():
    img = Image.new("RGBA", (52, 50), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # dress / pot belly
    ellipse(d, 26, 34, 21, 15, OUTL)
    ellipse(d, 26, 34, 20, 14, c(0x4A3A34))
    # apron
    ellipse(d, 26, 37, 12, 11, OUTL)
    ellipse(d, 26, 37, 11, 10, c(0x6B5A3C))
    rect(d, 20, 30, 12, 3, c(0x8A7450))
    # arms
    ellipse(d, 6, 30, 5, 8, OUTL)
    ellipse(d, 7, 30, 4, 7, c(0x8C5A3C))
    ellipse(d, 46, 30, 5, 8, OUTL)
    ellipse(d, 45, 30, 4, 7, c(0x8C5A3C))
    # head
    ellipse(d, 26, 17, 12, 11, OUTL)
    ellipse(d, 26, 17, 11, 10, c(0xC9A07A))
    # headscarf
    ellipse(d, 26, 8, 13, 6, OUTL)
    ellipse(d, 26, 8, 12, 5, c(0x8C3A2C))
    ellipse(d, 26, 3, 5, 3, c(0x8C3A2C))
    # eyes + mouth
    rect(d, 20, 16, 3, 2, c(0x1A100C))
    rect(d, 30, 16, 3, 2, c(0x1A100C))
    rect(d, 24, 22, 5, 2, c(0x1A100C))
    # ladle
    rect(d, 44, 8, 2, 16, c(0x8A6A48))
    ellipse(d, 45, 6, 3, 2, OUTL)
    ellipse(d, 45, 6, 2, 1, c(0x8A6A48))
    save(img, "granny.png")


def flyking():
    img = Image.new("RGBA", (48, 44), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # wings
    ellipse(d, 9, 20, 7, 11, OUTL)
    ellipse(d, 9, 20, 6, 10, c(0x8A8F86))
    ellipse(d, 39, 20, 7, 11, OUTL)
    ellipse(d, 39, 20, 6, 10, c(0x8A8F86))
    # body
    ellipse(d, 24, 27, 14, 14, OUTL)
    ellipse(d, 24, 27, 13, 13, c(0x3A3A2A))
    rect(d, 18, 22, 12, 2, c(0x5A5A3A))
    rect(d, 18, 28, 12, 1, c(0x5A5A3A))
    # head
    ellipse(d, 24, 13, 10, 9, OUTL)
    ellipse(d, 24, 13, 9, 8, c(0x4A4A32))
    # compound eyes
    ellipse(d, 17, 12, 4, 4, OUTL)
    ellipse(d, 17, 12, 3, 3, c(0x8C2A22))
    ellipse(d, 31, 12, 4, 4, OUTL)
    ellipse(d, 31, 12, 3, 3, c(0x8C2A22))
    rect(d, 17, 11, 1, 1, c(0xFFD0A0))
    rect(d, 31, 11, 1, 1, c(0xFFD0A0))
    # crown
    for x in (18, 23, 28):
        d.polygon([(x, 4), (x + 2, 8), (x + 4, 4)], fill=OUTL)
        d.polygon([(x + 1, 5), (x + 2, 7), (x + 3, 5)], fill=c(0xE8C064))
    # legs
    for x in (16, 22, 28, 34):
        rect(d, x, 38, 2, 5, OUTL)
    save(img, "flyking.png")


def tumor():
    img = Image.new("RGBA", (64, 56), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 32, 30, 29, 25, OUTL)
    ellipse(d, 32, 30, 28, 24, c(0x6B2A22))
    ellipse(d, 18, 20, 9, 8, c(0x8C3A2C))
    ellipse(d, 46, 24, 8, 7, c(0x8C3A2C))
    ellipse(d, 32, 42, 10, 7, c(0x8C3A2C))
    # veins
    for x0, y0, x1, y1 in ((12, 14, 28, 34), (52, 16, 36, 36), (24, 48, 32, 40)):
        d.line([(x0, y0), (x1, y1)], fill=c(0x3A1612), width=1)
    # eyes
    ellipse(d, 20, 26, 5, 5, c(0xD8CBB0))
    ellipse(d, 20, 26, 2, 2, c(0x1A100C))
    ellipse(d, 44, 28, 5, 5, c(0xD8CBB0))
    ellipse(d, 44, 28, 2, 2, c(0x1A100C))
    ellipse(d, 32, 36, 4, 4, c(0xD8CBB0))
    ellipse(d, 32, 36, 2, 2, c(0x8C2A22))
    # spikes
    for x in (12, 24, 40, 52):
        d.polygon([(x, 48), (x + 4, 56), (x + 8, 48)], fill=OUTL)
    save(img, "tumor.png")


def grandpa():
    img = Image.new("RGBA", (56, 54), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # coat
    ellipse(d, 28, 38, 21, 15, OUTL)
    ellipse(d, 28, 38, 20, 14, c(0x3A3440))
    rect(d, 24, 28, 8, 20, c(0x4A4452))
    # beard
    ellipse(d, 28, 28, 10, 8, OUTL)
    ellipse(d, 28, 28, 9, 7, c(0xD8CBB0))
    # head
    ellipse(d, 28, 17, 11, 10, OUTL)
    ellipse(d, 28, 17, 10, 9, c(0xC9A07A))
    # top hat
    rect(d, 19, 0, 18, 8, OUTL)
    rect(d, 20, 1, 16, 6, c(0x1A100C))
    rect(d, 15, 7, 26, 3, OUTL)
    # eyes
    rect(d, 22, 16, 3, 2, c(0x1A100C))
    rect(d, 31, 16, 3, 2, c(0x1A100C))
    # arms + lantern
    ellipse(d, 6, 34, 5, 8, OUTL)
    ellipse(d, 7, 34, 4, 7, c(0x3A3440))
    ellipse(d, 50, 34, 5, 8, OUTL)
    ellipse(d, 49, 34, 4, 7, c(0x3A3440))
    rect(d, 46, 40, 7, 8, OUTL)
    rect(d, 47, 41, 5, 6, c(0xE8C064))
    save(img, "grandpa.png")


def chandelier():
    img = Image.new("RGBA", (48, 56), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # chain
    rect(d, 23, 0, 2, 16, c(0x6B7076))
    # ring
    ellipse(d, 24, 20, 15, 4, OUTL)
    ellipse(d, 24, 20, 14, 3, c(0x8A6A48))
    # candles
    for x in (8, 24, 40):
        rect(d, x, 10, 3, 10, c(0xD8CBB0))
        ellipse(d, x + 1, 7, 2, 3, c(0xE8C064))
    # heart
    ellipse(d, 18, 30, 7, 7, OUTL)
    ellipse(d, 30, 30, 7, 7, OUTL)
    d.polygon([(10, 32), (38, 32), (24, 50)], fill=OUTL)
    ellipse(d, 18, 30, 6, 6, c(0x8C2A22))
    ellipse(d, 30, 30, 6, 6, c(0x8C2A22))
    d.polygon([(11, 32), (37, 32), (24, 48)], fill=c(0x8C2A22))
    # highlight
    rect(d, 16, 26, 3, 3, c(0xC0503C))
    save(img, "chandelier.png")


def drain_head():
    img = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 15, 15, 14, 13, OUTL)
    ellipse(d, 15, 15, 13, 12, c(0x6B4A34))
    ellipse(d, 15, 17, 7, 6, OUTL)
    ellipse(d, 15, 17, 6, 5, c(0x8C2A22))
    for x in (10, 14, 18):
        d.polygon([(x, 12), (x + 3, 12), (x + 1, 15)], fill=c(0xD8CBB0))
    ellipse(d, 9, 9, 3, 3, c(0xD8CBB0))
    ellipse(d, 9, 9, 1, 1, c(0x1A100C))
    ellipse(d, 21, 9, 3, 3, c(0xD8CBB0))
    ellipse(d, 21, 9, 1, 1, c(0x1A100C))
    save(img, "drain_head.png")


def drain_body():
    img = Image.new("RGBA", (22, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 11, 11, 10, 10, OUTL)
    ellipse(d, 11, 11, 9, 9, c(0x5A3E2C))
    ellipse(d, 11, 9, 5, 4, c(0x7A5A40))
    for x, y in ((6, 6), (16, 6), (6, 16), (16, 16)):
        d.point((x, y), fill=c(0x3A2418))
    save(img, "drain_body.png")


def greedgut_head():
    img = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 20, 20, 19, 18, OUTL)
    ellipse(d, 20, 20, 18, 17, c(0x7A6A3C))
    ellipse(d, 20, 24, 12, 9, OUTL)
    ellipse(d, 20, 24, 11, 8, c(0x8C2A22))
    for x in (12, 17, 22, 27):
        d.polygon([(x, 17), (x + 4, 17), (x + 2, 21)], fill=c(0xD8CBB0))
    ellipse(d, 12, 12, 4, 4, c(0xD8CBB0))
    ellipse(d, 12, 12, 2, 2, c(0x1A100C))
    ellipse(d, 28, 12, 4, 4, c(0xD8CBB0))
    ellipse(d, 28, 12, 2, 2, c(0x1A100C))
    save(img, "greedgut_head.png")


def greedgut_body():
    img = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 15, 15, 14, 13, OUTL)
    ellipse(d, 15, 15, 13, 12, c(0x6B5A34))
    ellipse(d, 15, 17, 8, 6, c(0x8A7448))
    for x, y in ((8, 8), (22, 8), (8, 22), (22, 22)):
        d.point((x, y), fill=c(0x3A2A18))
    save(img, "greedgut_body.png")



def attic():
    img = Image.new("RGBA", (40, 70), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 12, 0, 16, 34, OUTL)
    rect(d, 13, 1, 14, 32, c(0x3A3440))
    rect(d, 15, 22, 10, 18, OUTL)
    rect(d, 16, 22, 8, 17, c(0x4A4452))
    ellipse(d, 20, 44, 10, 8, OUTL)
    ellipse(d, 20, 44, 9, 7, c(0x2A2028))
    rect(d, 10, 48, 20, 14, OUTL)
    rect(d, 11, 49, 18, 12, c(0x6B4A34))
    rect(d, 11, 57, 18, 4, c(0x3A2418))
    rect(d, 13, 52, 3, 2, c(0x8A6A48))
    save(img, "attic.png")


def armor_head():
    img = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 15, 15, 14, 13, OUTL)
    ellipse(d, 15, 15, 13, 12, c(0x6B7076))
    rect(d, 7, 10, 16, 3, c(0x9AA0A4))
    rect(d, 7, 18, 16, 3, c(0x4A5056))
    ellipse(d, 11, 13, 3, 3, c(0xFF7A5A))
    ellipse(d, 19, 13, 3, 3, c(0xFF7A5A))
    d.polygon([(9, 23), (21, 23), (18, 29), (12, 29)], fill=OUTL)
    save(img, "armor_head.png")


def armor_body():
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 12, 12, 11, 11, OUTL)
    ellipse(d, 12, 12, 10, 10, c(0x6B7076))
    rect(d, 5, 10, 14, 4, c(0x9AA0A4))
    for x in (7, 16):
        d.point((x, 6), fill=c(0x3A4046))
        d.point((x, 17), fill=c(0x3A4046))
    save(img, "armor_body.png")


def hush():
    img = Image.new("RGBA", (56, 56), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 28, 28, 27, 26, OUTL)
    ellipse(d, 28, 28, 26, 25, c(0xD8D2C0))
    ellipse(d, 28, 34, 18, 14, OUTL)
    ellipse(d, 28, 34, 17, 13, c(0x120C0A))
    for x in (16, 24, 32, 40):
        d.polygon([(x, 22), (x + 5, 22), (x + 2, 28)], fill=c(0xD8D2C0))
    ellipse(d, 18, 18, 5, 4, OUTL)
    ellipse(d, 18, 18, 4, 3, c(0x8C2A22))
    ellipse(d, 38, 18, 5, 4, OUTL)
    ellipse(d, 38, 18, 4, 3, c(0x8C2A22))
    save(img, "hush.png")

def pitlord():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 32, 38, 26, 24, OUTL)
    ellipse(d, 32, 38, 25, 23, c(0x3A2A3A))
    ellipse(d, 32, 22, 14, 12, OUTL)
    ellipse(d, 32, 22, 13, 11, c(0x4A3A4A))
    for x in (22, 32, 42):
        ellipse(d, x, 24, 3, 4, c(0xE8C064))
        rect(d, x - 1, 24, 2, 3, c(0x1A100C))
    d.polygon([(18, 8), (24, 16), (14, 14)], fill=OUTL)
    d.polygon([(46, 8), (40, 16), (50, 14)], fill=OUTL)
    for x in (10, 20, 44, 54):
        d.polygon([(x, 52), (x + 4, 64), (x + 8, 52)], fill=OUTL)
    save(img, "pitlord.png")


def pale():
    img = Image.new("RGBA", (56, 60), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(28, 2), (50, 26), (44, 58), (12, 58), (6, 26)], fill=OUTL)
    d.polygon([(28, 5), (46, 27), (41, 55), (15, 55), (10, 27)], fill=c(0xD8D2C0))
    ellipse(d, 28, 22, 10, 9, c(0x1A100C))
    ellipse(d, 22, 30, 4, 3, c(0x8C2A22))
    ellipse(d, 34, 30, 4, 3, c(0x8C2A22))
    rect(d, 24, 40, 8, 2, c(0x8C2A22))
    # wings
    d.polygon([(6, 24), (2, 12), (12, 20)], fill=c(0x8A8F86))
    d.polygon([(50, 24), (54, 12), (44, 20)], fill=c(0x8A8F86))
    save(img, "pale.png")


def nameless():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ellipse(d, 32, 34, 30, 28, OUTL)
    ellipse(d, 32, 34, 29, 27, c(0x1A1418))
    ellipse(d, 32, 30, 16, 14, c(0x120C10))
    ellipse(d, 32, 30, 14, 12, c(0x5A2A2A))
    for x in (24, 32, 40):
        ellipse(d, x, 28, 3, 4, c(0xFFD0A0))
    for i in range(10):
        import math
        a = math.pi * 2 * i / 10
        x = int(32 + math.cos(a) * 26)
        y = int(34 + math.sin(a) * 24)
        ellipse(d, x, y, 2, 2, c(0x8C2A22))
    save(img, "nameless.png")
if __name__ == "__main__":
    granny()
    flyking()
    tumor()
    grandpa()
    chandelier()
    drain_head()
    drain_body()
    greedgut_head()
    greedgut_body()
    attic()
    armor_head()
    armor_body()
    hush()
    pitlord()
    pale()
    nameless()
    print("done", OUT)
