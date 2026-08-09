#!/usr/bin/env python3
"""Generate web/favicon.png (64px) in the Paper-Mario paper-craft style.

Cream paper #FFF6E4 card with plum ink #3A2B46 outline, hard-offset shadow,
warm gold #FFB63D "V", slight hand-cut rotation. Drawn at 4x then downscaled.
"""
from PIL import Image, ImageDraw

S = 4  # supersample factor; final size 64 -> canvas 256
CREAM = (255, 246, 228, 255)
PLUM = (58, 43, 70, 255)
GOLD = (255, 182, 61, 255)

img = Image.new("RGBA", (64 * S, 64 * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def p(*pts):
    return [(x * S, y * S) for x, y in pts]

# card geometry (matches favicon.svg): bounding boxes at 4x scale
shadow = (9 * S, 11 * S, 58 * S, 60 * S)
card = (6 * S, 7 * S, 55 * S, 56 * S)
radius = 11 * S

# hard-offset shadow layer, then cream paper card with plum outline
d.rounded_rectangle(shadow, radius=radius, fill=PLUM)
d.rounded_rectangle(card, radius=radius, fill=CREAM, outline=PLUM,
                    width=int(2.5 * S))

# warm gold V with plum ink outline
vee = p((18, 19), (25.5, 19), (31, 36), (36.5, 19), (44, 19),
        (35.5, 44), (31, 50), (26.5, 44))
d.polygon(vee, fill=GOLD, outline=PLUM, width=int(2.5 * S))

# tiny stitched star accent
star = p((47, 14), (48.6, 17.6), (52.2, 19.2), (48.6, 20.8),
         (47, 24.4), (45.4, 20.8), (41.8, 19.2), (45.4, 17.6))
d.polygon(star, fill=CREAM, outline=PLUM, width=int(1.6 * S))

# hand-cut tilt: rotate -1.5 deg around center, transparent outside
img = img.rotate(1.5, resample=Image.BICUBIC, expand=False)

img = img.resize((64, 64), Image.LANCZOS)
img.save("web/favicon.png")
print("wrote web/favicon.png (64x64)")
