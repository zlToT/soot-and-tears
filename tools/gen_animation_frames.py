"""Generates the 3-frame loops used by enemies and boss heads.

Frame 0 is the existing PNG. Frame 1/2 are squashed/rematerialised variants
(the same canvas, anchored at the feet for walkers or the centre for flyers),
so Phaser can animate a real frame sequence instead of tweening one still.
Run with the bundled Python (has Pillow):
  python tools/gen_animation_frames.py
"""

from __future__ import annotations

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENEMY_DIR = os.path.join(ROOT, "public", "assets", "sprites", "enemy")
BOSS_DIR = os.path.join(ROOT, "public", "assets", "sprites", "boss")

# Enemies whose silhouette reads better with a wing-flap (centre-anchored).
FLYING = {"moth", "boom_moth", "shade_moth"}

ENEMIES = [
    "grub",
    "moth",
    "spitter",
    "rat",
    "hop",
    "boom_moth",
    "toad",
    "maw",
    "doll",
    "mask",
    "vis",
    "shade_moth",
    "split_grub",
    "thorn_roll",
]

BOSS_HEADS = [
    "granny",
    "flyking",
    "tumor",
    "grandpa",
    "chandelier",
    "drain_head",
    "greedgut_head",
    "attic",
    "armor_head",
    "hush",
    "pitlord",
    "pale",
    "nameless",
    # Boss body segments
    "drain_body",
    "greedgut_body",
    "armor_body",
]


def resized(img: Image.Image, sx: float, sy: float, bottom: bool) -> Image.Image:
    w, h = img.size
    nw = max(1, round(w * sx))
    nh = max(1, round(h * sy))
    small = img.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - nw) // 2
    y = h - nh if bottom else (h - nh) // 2
    canvas.alpha_composite(small, (x, y))
    return canvas


def emit(directory: str, stem: str, frame1: Image.Image, frame2: Image.Image) -> None:
    path = os.path.join(directory, stem)
    frame1.save(f"{path}_1.png", optimize=True)
    frame2.save(f"{path}_2.png", optimize=True)
    print("frames", stem)


def main() -> None:
    for name in ENEMIES:
        path = os.path.join(ENEMY_DIR, f"{name}.png")
        if not os.path.exists(path):
            print("skip missing", path)
            continue
        img = Image.open(path).convert("RGBA")
        flying = name in FLYING
        if flying:
            emit(ENEMY_DIR, name, resized(img, 0.84, 0.97, False), resized(img, 0.93, 0.99, False))
        else:
            emit(ENEMY_DIR, name, resized(img, 1.0, 0.86, True), resized(img, 1.0, 0.94, True))

    for name in BOSS_HEADS:
        path = os.path.join(BOSS_DIR, f"{name}.png")
        if not os.path.exists(path):
            print("skip missing", path)
            continue
        img = Image.open(path).convert("RGBA")
        emit(BOSS_DIR, name, resized(img, 1.0, 0.94, True), resized(img, 1.0, 0.975, True))


if __name__ == "__main__":
    main()
