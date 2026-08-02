#!/usr/bin/env python3
"""Generate the bright guofeng (rice-paper / light ink-wash) art set.

Palette direction (明亮轻快国风):
- paper: warm rice-white with subtle grain
- mountains: soft celadon greens, layered mist
- accents: warm gold + a touch of cinnabar
- characters: chibi-guoman cultivators (face, hair bun, layered robes, realm props)
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "resources" / "art"
SS = 4


def rgb(value: str, alpha: int = 255):
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def gradient(size, top, bottom):
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        draw.line([(0, y), (size[0], y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return image


def save(image, relative):
    path = OUT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def texture(size, amount=8):
    random.seed(20261003)
    tex = Image.new("L", size, 128)
    tex.putdata([max(0, min(255, 128 + random.randint(-amount, amount))) for _ in range(size[0] * size[1])])
    return tex.filter(ImageFilter.GaussianBlur(0.6))


def rounded_mask(size, radius):
    mask = Image.new("L", (size[0] * SS, size[1] * SS), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] * SS - 1, size[1] * SS - 1), radius * SS, fill=255)
    return mask.resize(size, Image.LANCZOS)


def panel(size, top, bottom, border, radius, border_width):
    """Flat-fill panel with uniform radius. No gradient per Uncodixify."""
    fill = Image.new("RGBA", size, (top[0], top[1], top[2], top[3] if len(top) > 3 else 255))
    mask = rounded_mask(size, radius)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    image.paste(fill, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((border_width // 2, border_width // 2, size[0] - border_width, size[1] - border_width), radius, outline=border, width=border_width)
    return image


def texture_overlay(image, amount):
    size = image.size
    alpha = Image.new("L", size, amount)
    tex = texture(size, amount)
    return Image.alpha_composite(image, Image.merge("RGBA", (tex, tex, tex, alpha)))


def warm_vignette(image, strength=30):
    """Very light cool-blue edge tint — keeps the clear blue-white feel."""
    size = image.size
    vignette = Image.new("L", size, 0)
    draw = ImageDraw.Draw(vignette)
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=255, width=140)
    vignette = vignette.filter(ImageFilter.GaussianBlur(130))
    cool = Image.new("RGBA", size, (188, 210, 232, strength))
    return Image.composite(cool, image, vignette)


def gold_dust(draw, count, y0, y1, seed, alpha_lo=30, alpha_hi=80):
    random.seed(seed)
    for _ in range(count):
        x, y = random.randint(0, 719), random.randint(y0, y1)
        radius = random.random() ** 3 * 2.4 + 0.4
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(216, 168, 84, random.randint(alpha_lo, alpha_hi)))


def mountains_layer(size, ridges, blur):
    """Soft celadon mountain ridges: [(top_y, height, color)] far → near."""
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    for top_y, height, color in ridges:
        layer = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        points = [(-120, size[1])]
        for x in range(-120, size[0] + 120, 24):
            points.append((x, top_y + math.sin(x * 0.011) * 26 + math.sin(x * 0.031 + 1.7) * 9))
        points.extend([(size[0] + 120, top_y + height), (size[0] + 120, size[1])])
        draw.polygon(points, fill=color)
        image = Image.alpha_composite(image, layer.filter(ImageFilter.GaussianBlur(blur)))
    return image


def mist_band(image, y0, y1, count, color, blur=14):
    size = image.size
    mist = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(mist)
    random.seed(2026)
    for _ in range(count):
        x, y = random.randint(0, size[0]), random.randint(y0, y1)
        radius = random.randint(90, 220)
        draw.ellipse((x - radius, y - radius // 4, x + radius, y + radius // 4), fill=color)
    return Image.alpha_composite(image, mist.filter(ImageFilter.GaussianBlur(blur)))


def birds(draw, spots):
    """Two-stroke ink birds."""
    for x, y, s in spots:
        draw.arc((x - 10 * s, y - 6 * s, x + 2 * s, y + 6 * s), 200, 340, fill=(70, 96, 120, 200), width=3)
        draw.arc((x - 2 * s, y - 6 * s, x + 10 * s, y + 6 * s), 200, 340, fill=(70, 96, 120, 200), width=3)


def home_background():
    size = (720, 1280)
    image = gradient(size, rgb("#fdfeff")[:3], rgb("#e0edf7")[:3]).convert("RGBA")

    # pale-gold sun, top-right (kept as the single warm accent)
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for radius, alpha in ((150, 40), (104, 60)):
        gd.ellipse((520 - radius, 150 - radius, 520 + radius, 150 + radius), fill=(244, 214, 148, alpha))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(46)))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((478, 108, 562, 192), fill=(248, 226, 168, 190))

    # layered blue mountains (far → near), misty soft
    image = Image.alpha_composite(image, mountains_layer(size, [
        (660, 240, rgb("#d3e4f2", 120)),
        (770, 260, rgb("#b9d3e9", 135)),
        (880, 280, rgb("#9cc0da", 150)),
    ], blur=22))
    image = mist_band(image, 700, 900, 30, (255, 255, 255, 90))

    # distant hill for depth near the bottom
    image = Image.alpha_composite(image, mountains_layer(size, [(1050, 280, rgb("#84accc", 140))], blur=18))
    image = mist_band(image, 990, 1130, 20, (248, 252, 255, 105))

    draw = ImageDraw.Draw(image, "RGBA")
    birds(draw, [(150, 300, 1.4), (215, 335, 1.0), (560, 420, 1.2)])
    gold_dust(draw, 40, 180, 1080, 20261003, 25, 65)

    return texture_overlay(warm_vignette(image, 14), 3)


def character(index, filename):
    """Chibi-guoman cultivator. Realm 0..5 with distinct robe/crown/prop."""
    palettes = [
        # robe, robe_dark, sash, hair, skin, prop_color, prop_kind
        ("#a9b9c6", "#8ea2b1", "#7189a0", "#3a3128", "#f6e3d0", "#9db4c4", "none"),        # 0 凡人
        ("#8fc1e3", "#6aa0c8", "#46759e", "#33291f", "#f7e5d2", "#eef4f8", "whisk"),       # 1 练气
        ("#f0f5f8", "#d5e1ea", "#5d8fa8", "#2c261e", "#f7e6d4", "#7fa3c4", "sword"),       # 2 筑基
        ("#e9e2cc", "#d6cba6", "#b08d46", "#302718", "#f7e6d4", "#e08f3e", "gourd"),       # 3 金丹
        ("#9db0dc", "#7c90c4", "#5568a0", "#2c261e", "#f7e6d4", "#8fd0c2", "pearls"),      # 4 元婴
        ("#f6fafd", "#e2ecf4", "#7fa3c4", "#e8edf2", "#f8e9d8", "#a8cbe8", "halo"),        # 5 化神
    ]
    robe, robe_dark, sash, hair, skin, prop_color, prop = palettes[index]
    hair = rgb(hair)
    skin = rgb(skin)
    robe_c, robe_d, sash_c, prop_c = rgb(robe), rgb(robe_dark), rgb(sash), rgb(prop_color)
    ink = (74, 64, 48, 230)

    size = (512, 512)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    cx = size[0] // 2

    # ground shadow
    draw.ellipse((cx - 150, 448, cx + 150, 484), fill=(100, 130, 156, 50))

    # behind-body props first (halo, back sword)
    if prop == "halo":  # golden halo behind
        draw.ellipse((cx - 172, 40, cx + 172, 384), outline=(168, 203, 232, 170), width=10)
        draw.ellipse((cx - 150, 62, cx + 150, 362), outline=(198, 222, 242, 110), width=5)
    elif prop == "sword":  # sword on the back (scabbard over the shoulder)
        draw.line((cx - 100, 132, cx + 92, 400), fill=(90, 78, 58, 235), width=11)
        draw.line((cx - 100, 132, cx + 92, 400), fill=prop_c, width=5)
        draw.line((cx - 116, 140, cx - 84, 122), fill=(196, 90, 70, 240), width=13)

    # back cape / wide sleeves behind the body
    draw.polygon([(cx - 118, 208), (cx - 158, 420), (cx - 66, 430), (cx - 62, 216)], fill=robe_d)
    draw.polygon([(cx + 118, 208), (cx + 158, 420), (cx + 66, 430), (cx + 62, 216)], fill=robe_d)

    # robe skirt with a center slit
    draw.polygon([(cx - 96, 300), (cx + 96, 300), (cx + 122, 458), (cx - 122, 458)], fill=robe_c)
    draw.line((cx, 316, cx, 448), fill=robe_d, width=5)
    draw.arc((cx - 96, 286, cx + 96, 380), 20, 160, fill=robe_d, width=5)

    # torso
    draw.rounded_rectangle((cx - 84, 168, cx + 84, 322), 40, fill=robe_c)
    # inner white collar (crossed lapels)
    draw.polygon([(cx - 30, 168), (cx + 2, 168), (cx - 34, 236), (cx - 62, 214)], fill=(252, 248, 238, 255))
    draw.polygon([(cx + 30, 168), (cx - 2, 168), (cx + 34, 236), (cx + 62, 214)], fill=(252, 248, 238, 255))
    draw.line((cx - 46, 176, cx - 18, 238), fill=robe_d, width=6)
    draw.line((cx + 46, 176, cx + 18, 238), fill=robe_d, width=6)
    # sash + hanging ribbon
    draw.rounded_rectangle((cx - 86, 288, cx + 86, 316), 14, fill=sash_c)
    draw.polygon([(cx + 20, 312), (cx + 40, 312), (cx + 34, 372), (cx + 18, 368)], fill=sash_c)

    # front sleeves (big guoman sleeves, hands peek out)
    draw.polygon([(cx - 84, 200), (cx - 128, 330), (cx - 84, 352), (cx - 58, 220)], fill=robe_c)
    draw.polygon([(cx + 84, 200), (cx + 128, 330), (cx + 84, 352), (cx + 58, 220)], fill=robe_c)
    draw.ellipse((cx - 116, 330, cx - 88, 358), fill=skin)
    draw.ellipse((cx + 88, 330, cx + 116, 358), fill=skin)

    # legs / shoes
    draw.rounded_rectangle((cx - 62, 440, cx - 12, 474), 16, fill=robe_d)
    draw.rounded_rectangle((cx + 12, 440, cx + 62, 474), 16, fill=robe_d)

    # head: back hair → face → bangs → bun
    draw.ellipse((cx - 52, 60, cx + 52, 168), fill=hair)                     # back hair
    draw.ellipse((cx - 40, 84, cx + 40, 172), fill=skin)                     # face
    draw.polygon([(cx - 44, 108), (cx - 18, 84), (cx + 18, 84), (cx + 44, 108), (cx + 44, 128), (cx - 44, 128)], fill=hair)
    draw.ellipse((cx - 18, 56, cx + 18, 92), fill=hair)                      # top bun
    draw.ellipse((cx - 9, 48, cx + 9, 66), fill=hair)                        # bun knot
    if index >= 2:                                                           # hairpin across the bun
        draw.line((cx - 34, 62, cx + 34, 62), fill=prop_c, width=6)
        draw.ellipse((cx + 30, 56, cx + 42, 68), fill=prop_c)

    # gentle guoman face: brows, eyes, blush, mouth
    draw.arc((cx - 30, 116, cx - 8, 132), 200, 340, fill=ink, width=4)
    draw.arc((cx + 8, 116, cx + 30, 132), 200, 340, fill=ink, width=4)
    for ex in (cx - 19, cx + 19):
        draw.ellipse((ex - 8, 132, ex + 8, 148), fill=(255, 255, 255, 240))
        draw.ellipse((ex - 4, 136, ex + 4, 148), fill=(58, 48, 38, 255))
        draw.ellipse((ex - 2, 137, ex + 1, 140), fill=(255, 255, 255, 220))
    draw.ellipse((cx - 32, 146, cx - 22, 152), fill=(240, 170, 150, 90))
    draw.ellipse((cx + 22, 146, cx + 32, 152), fill=(240, 170, 150, 90))
    draw.arc((cx - 7, 154, cx + 7, 164), 20, 160, fill=ink, width=3)

    # realm props (held / floating ones live on top)
    if prop == "whisk":  # 拂尘 in the right hand
        draw.line((cx + 96, 246, cx + 128, 330), fill=prop_c, width=7)
        for dx in (-14, -7, 0, 7, 14):
            draw.line((cx + 128, 330, cx + 128 + dx, 396), fill=(244, 240, 228, 235), width=5)
    elif prop == "gourd":  # gourd at the waist
        draw.ellipse((cx - 58, 306, cx - 10, 354), fill=prop_c)
        draw.ellipse((cx - 42, 294, cx - 20, 314), fill=prop_c)
        draw.line((cx - 44, 322, cx - 24, 322), fill=(120, 74, 30, 220), width=4)
    elif prop == "pearls":  # floating jade pearls
        for px, py, pr in ((cx - 128, 236, 13), (cx + 132, 262, 11), (cx - 118, 330, 9)):
            draw.ellipse((px - pr, py - pr, px + pr, py + pr), fill=prop_c)
            draw.ellipse((px - pr + 3, py - pr + 3, px, py), fill=(255, 255, 255, 130))

    save(image.filter(ImageFilter.GaussianBlur(0.4)), f"characters/{filename}")


def chest(index, filename):
    palettes = [
        ("#d2b183", "#a8815a", "#f0dcb4", "#7a5a34"),   # fansu: light wood
        ("#8fb8dc", "#6494bc", "#cfe6f6", "#4a7098"),   # xiuzhen: azure
        ("#e8c87a", "#c9a34e", "#f6e6b0", "#96702c"),   # tiandao: gold
    ]
    body, dark, bright, trim = palettes[index]
    size = (300, 240)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((28, 166, 272, 226), fill=(120, 100, 60, 70))
    draw.rounded_rectangle((35, 90, 265, 205), 24, fill=rgb(dark))
    draw.rounded_rectangle((38, 92, 262, 145), 22, fill=rgb(body))
    draw.rounded_rectangle((45, 32, 255, 112), 45, fill=rgb(body))
    draw.rounded_rectangle((58, 44, 242, 98), 34, fill=rgb(dark))
    draw.line((150, 44, 150, 90), fill=rgb(bright, 235), width=10)
    draw.rounded_rectangle((124, 82, 176, 134), 14, fill=rgb(bright))
    draw.ellipse((142, 96, 158, 112), fill=rgb(trim, 255))
    draw.rectangle((40, 145, 260, 153), fill=rgb(bright, 200))
    for x in (62, 238):
        draw.rounded_rectangle((x - 9, 100, x + 9, 195), 8, fill=rgb(trim, 210))
    # lid highlight
    draw.arc((70, 34, 230, 92), 200, 340, fill=(255, 250, 232, 170), width=6)
    if index == 2:
        draw.arc((95, 12, 205, 122), 200, 340, fill=(255, 224, 150, 220), width=8)
    save(image.filter(ImageFilter.GaussianBlur(0.4)), f"boxes/{filename}")


def button(kind, filename):
    """Flat buttons, radius 12, no gradient. Dark navy + gold palette."""
    styles = {
        "primary":   ((200, 155, 60, 255),  (255, 220, 120, 240), 12),
        "secondary": ((30, 41, 70, 255),   (200, 160, 60, 220), 12),
        "ghost":     ((20, 30, 55, 230),   (120, 140, 170, 180), 10),
    }
    fill, border, width = styles[kind]
    save(panel((240, 80), fill, fill, border, 12, width), f"ui/{filename}")


def progress(kind, filename):
    """Dark track, gold fill, radius 10."""
    if kind == "bg":
        save(panel((120, 36), (20, 30, 55, 255), (20, 30, 55, 255), (120, 140, 170, 200), 10, 2), f"ui/{filename}")
    else:
        save(panel((120, 36), (200, 155, 60, 255), (200, 155, 60, 255), (255, 220, 120, 230), 10, 2), f"ui/{filename}")


def icon(kind, filename):
    """Light paper chip + deep ink strokes (readable on bright pages)."""
    size = (144, 144)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((12, 12, 132, 132), 36, fill=(255, 255, 255, 240))
    draw.rounded_rectangle((18, 18, 126, 126), 30, outline=(127, 163, 196, 235), width=4)
    ink = (64, 96, 128, 245)
    gold = (216, 168, 84, 250)
    if kind == "lingshi":
        draw.polygon([(72, 22), (112, 72), (72, 122), (32, 72)], fill=gold)
        draw.polygon([(72, 40), (98, 72), (72, 104), (46, 72)], fill=(250, 238, 200, 255))
        draw.polygon([(72, 22), (112, 72), (72, 122), (32, 72)], outline=(138, 100, 32, 250), width=4)
    elif kind == "xiuwei":
        draw.arc((32, 35, 112, 115), 210, 340, fill=gold, width=10)
        draw.ellipse((63, 63, 81, 81), fill=(214, 90, 70, 255))
    elif kind == "jiyuan":
        draw.ellipse((40, 40, 104, 104), outline=gold, width=8)
        draw.line((52, 92, 92, 52), fill=gold, width=8)
    elif kind == "box":
        draw.rounded_rectangle((34, 52, 110, 112), 10, fill=(201, 164, 104, 255))
        draw.arc((42, 35, 102, 75), 180, 360, fill=(154, 122, 68, 255), width=8)
        draw.rectangle((66, 62, 78, 92), fill=(250, 240, 208, 255))
        draw.rounded_rectangle((34, 52, 110, 112), 10, outline=(74, 112, 152, 250), width=4)
    elif kind == "collection":
        for x in (48, 96):
            draw.ellipse((x - 16, 34, x + 16, 66), fill=(226, 132, 106, 255))
        draw.polygon([(72, 55), (103, 100), (41, 100)], fill=gold)
    elif kind == "shop":
        draw.rounded_rectangle((38, 58, 106, 112), 8, outline=gold, width=7)
        draw.arc((42, 34, 102, 72), 180, 360, fill=gold, width=8)
    elif kind == "settings":
        draw.ellipse((48, 48, 96, 96), outline=ink, width=9)
        draw.ellipse((63, 63, 81, 81), fill=ink)
    elif kind == "ad":
        draw.polygon([(46, 42), (84, 70), (46, 100)], fill=(214, 90, 70, 255))
        draw.rounded_rectangle((84, 34, 106, 108), 8, fill=(214, 90, 70, 255))
    save(image, f"ui/icons/{filename}")


def rain_background():
    """Daylight rain: pale blue sky, white strokes, faint hills."""
    size = (720, 1280)
    image = gradient(size, rgb("#eaf3f9")[:3], rgb("#d0e2ef")[:3]).convert("RGBA")
    image = Image.alpha_composite(image, mountains_layer(size, [
        (600, 280, rgb("#c8dcec", 105)),
        (800, 300, rgb("#accbe2", 120)),
        (1020, 300, rgb("#92b4d0", 135)),
    ], blur=22))
    image = mist_band(image, 680, 900, 26, (255, 255, 255, 95))
    random.seed(20261004)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(170):
        x, y = random.randint(0, 719), random.randint(0, 1279)
        h = random.randint(18, 52)
        draw.line((x, y, x - 5, y + h), fill=(255, 255, 255, random.randint(60, 120)), width=2)
    gold_dust(draw, 40, 120, 1100, 20261004)
    return texture_overlay(warm_vignette(image, 14), 3)


def result_background():
    """Bright paper with a soft golden aura and floating dust."""
    size = (720, 1280)
    image = gradient(size, rgb("#fbfdff")[:3], rgb("#e6f0f8")[:3]).convert("RGBA")
    cx, cy = size[0] // 2, 520
    for radius, alpha in ((620, 36), (450, 60), (280, 90), (150, 122)):
        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(150, 190, 226, alpha))
        image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(80)))
    # faint warm core for the "success" feel
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cx - 170, cy - 170, cx + 170, cy + 170), fill=(246, 218, 150, 60))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(70)))
    # light clouds
    image = mist_band(image, 140, 380, 14, (255, 255, 255, 100))
    image = mist_band(image, 940, 1140, 12, (255, 255, 255, 80))
    random.seed(20261005)
    draw = ImageDraw.Draw(image, "RGBA")
    gold_dust(draw, 80, 120, 1150, 20261005, 45, 100)
    return texture_overlay(warm_vignette(image, 40), 4)


def drop(type_name, filename):
    colors = {"gold": ("#ffe6a2", "#b98332"), "blue": ("#c6ecf6", "#4d7fa8"), "red": ("#ffb3a5", "#8c2b25")}[type_name]
    size = (120, 120)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((18, 18, 102, 102), fill=rgb(colors[1], 235))
    draw.ellipse((28, 28, 92, 92), fill=rgb(colors[0], 245))
    draw.ellipse((40, 38, 66, 64), fill=(255, 255, 255, 125))
    save(image, f"ui/{filename}")


def simple_icon(kind, filename):
    size = (144, 144)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    ink = (90, 74, 46, 240)
    gold = (170, 126, 52, 245)
    if kind == "timer":
        draw.ellipse((32, 32, 112, 112), outline=gold, width=10)
        draw.line((72, 72, 72, 43), fill=gold, width=10)
        draw.line((72, 72, 96, 82), fill=gold, width=8)
    elif kind == "back":
        draw.line((92, 30, 54, 72), fill=ink, width=12)
        draw.line((54, 72, 92, 114), fill=ink, width=12)
    elif kind == "close":
        draw.line((44, 44, 100, 100), fill=ink, width=12)
        draw.line((100, 44, 44, 100), fill=ink, width=12)
    elif kind == "lock":
        draw.rounded_rectangle((38, 70, 106, 114), 12, fill=gold)
        draw.arc((52, 34, 92, 84), 180, 360, fill=gold, width=10)
    elif kind == "purify":
        draw.ellipse((36, 36, 108, 108), outline=(90, 140, 170, 245), width=10)
        draw.line((54, 90, 90, 54), fill=(90, 140, 170, 245), width=8)
        draw.line((54, 54, 90, 90), fill=(90, 140, 170, 245), width=8)
    save(image, f"ui/icons/{filename}")


def m7_icon(kind, filename):
    """M7 交互深化新图标：灵光符文（圆满三连）与聚灵法印（磁吸咒）。

    与 simple_icon 同风格：透明底、金/青蓝笔画、圆角几何。
    """
    size = (144, 144)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    gold = (216, 168, 84, 250)
    gold_soft = (240, 208, 130, 235)
    azure = (90, 140, 170, 245)
    if kind == "rune":
        # 灵光符文：金色菱形封印 + 内部三道符纹 + 四角灵点
        draw.polygon([(72, 10), (134, 72), (72, 134), (10, 72)], outline=gold, width=7)
        draw.polygon([(72, 30), (114, 72), (72, 114), (30, 72)], outline=gold_soft, width=4)
        draw.line((72, 48, 72, 96), fill=gold, width=7)
        draw.line((58, 62, 86, 62), fill=gold, width=6)
        draw.line((58, 82, 86, 82), fill=gold, width=6)
        for cx, cy in ((72, 4), (140, 72), (72, 140), (4, 72)):
            draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=gold_soft)
    elif kind == "juling":
        # 聚灵法印：青蓝法环 + 内旋涡（磁吸）+ 三粒灵尘内聚
        draw.ellipse((16, 16, 128, 128), outline=azure, width=9)
        draw.arc((40, 40, 104, 104), 20, 250, fill=azure, width=8)
        draw.arc((52, 52, 92, 92), 200, 430, fill=(90, 140, 170, 210), width=6)
        for cx, cy, r in ((108, 52, 7), (50, 104, 6), (46, 46, 5)):
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=gold)
        draw.ellipse((64, 64, 80, 80), fill=gold_soft)
    elif kind == "quest":
        # 修行任务：金色卷轴 + 青蓝勾选
        draw.rounded_rectangle((28, 36, 116, 116), 12, fill=(250, 243, 224, 245), outline=gold, width=6)
        draw.rounded_rectangle((20, 28, 124, 52), 10, fill=gold)
        for y in (66, 84):
            draw.line((44, y, 100, y), fill=(170, 140, 84, 235), width=6)
        draw.line((52, 102, 68, 112), fill=(90, 140, 170, 245), width=7)
        draw.line((68, 112, 96, 84), fill=(90, 140, 170, 245), width=7)
    elif kind == "expedition":
        # 云游历练：斗笠 + 行囊杖
        draw.polygon([(72, 16), (130, 62), (14, 62)], outline=azure, width=8)
        draw.arc((44, 40, 100, 84), 0, 180, fill=(170, 126, 52, 240), width=6)
        draw.rounded_rectangle((30, 74, 90, 118), 12, outline=gold, width=7)
        draw.line((72, 74, 72, 106), fill=gold, width=6)
        draw.line((104, 44, 104, 118), fill=(90, 74, 46, 235), width=8)
    elif kind == "illusion":
        # 心魔幻境：紫青魔纹之眼
        draw.polygon([(72, 18), (130, 72), (72, 126), (14, 72)], outline=(122, 96, 170, 245), width=8)
        draw.ellipse((44, 48, 100, 96), outline=(90, 140, 170, 245), width=7)
        draw.ellipse((60, 60, 84, 84), fill=(214, 90, 70, 245))
        draw.ellipse((66, 66, 78, 78), fill=(255, 226, 200, 245))
    elif kind == "ludao":
        # 论道：双玉论道（两枚交叠灵玉 + 论道金光）
        draw.ellipse((20, 44, 84, 108), outline=azure, width=8)
        draw.ellipse((60, 44, 124, 108), outline=gold, width=8)
        draw.line((72, 14, 72, 44), fill=gold, width=6)
        draw.polygon([(72, 4), (86, 22), (58, 22)], fill=gold)
        draw.ellipse((42, 62, 62, 82), fill=(90, 140, 170, 200))
        draw.ellipse((82, 62, 102, 82), fill=(216, 168, 84, 200))
    save(image, f"ui/icons/{filename}")


def write_image_meta(relative):
    """按 Cocos 自动裁边约定写出 .meta（与 image importer 格式一致），返回实际裁剪框。"""
    import json
    import uuid as uuid_lib

    path = OUT / relative
    image = Image.open(path)
    raw_w, raw_h = image.size
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()  # (l, t, r, b)，含 alpha>0 的像素
    if bbox is None:
        bbox = (0, 0, raw_w, raw_h)
    left, top, right, bottom = bbox
    trim_x, trim_y = left, top
    trim_w, trim_h = right - left, bottom - top
    off_x = (left + trim_w / 2) - raw_w / 2
    off_y = -((top + trim_h / 2) - raw_h / 2)
    uid = str(uuid_lib.uuid4())
    uv = [
        trim_x, raw_h - (trim_y + trim_h),
        trim_x + trim_w, raw_h - (trim_y + trim_h),
        trim_x, raw_h - trim_y,
        trim_x + trim_w, raw_h - trim_y,
    ]
    nuv = [v / raw_w if i % 2 == 0 else v / raw_h for i, v in enumerate(uv)]
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": uid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{uid}@6c48a",
                "displayName": path.stem,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": uid,
                    "isUuid": True,
                    "visible": False,
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": f"{uid}@f9941",
                "displayName": path.stem,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": off_x,
                    "offsetY": off_y,
                    "trimX": trim_x,
                    "trimY": trim_y,
                    "width": trim_w,
                    "height": trim_h,
                    "rawWidth": raw_w,
                    "rawHeight": raw_h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [
                            -trim_w / 2, -trim_h / 2, 0,
                            trim_w / 2, -trim_h / 2, 0,
                            -trim_w / 2, trim_h / 2, 0,
                            trim_w / 2, trim_h / 2, 0,
                        ],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": uv,
                        "nuv": nuv,
                        "minPos": [-trim_w / 2, -trim_h / 2, 0],
                        "maxPos": [trim_w / 2, trim_h / 2, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{uid}@6c48a",
                    "atlasUuid": "",
                    "trimType": "auto",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": f"{uid}@6c48a",
        },
    }
    meta_path = path.with_suffix(".png.meta")
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[meta] {relative}: trim=({trim_x},{trim_y},{trim_w},{trim_h}) uuid={uid[:8]}…")


def main():
    save(home_background(), "ui/bg_home.png")
    save(panel((128, 128), (20, 27, 61, 255), (20, 27, 61, 255), (200, 160, 60, 220), 12, 3), "ui/panel_dark_9s.png")
    save(panel((128, 128), (26, 36, 76, 255), (26, 36, 76, 255), (200, 160, 60, 200), 12, 3), "ui/panel_paper_9s.png")
    button("primary", "btn_primary_gold_9s.png")
    button("secondary", "btn_secondary_dark_9s.png")
    button("ghost", "btn_ghost_dark_9s.png")
    progress("bg", "progress_bg_9s.png")
    progress("fill", "progress_fill_gold_9s.png")
    names = ["char_realm_00", "char_realm_01", "char_realm_02", "char_realm_03", "char_realm_04", "char_realm_05"]
    for index, name in enumerate(names):
        character(index, f"{name}.png")
    boxes = ["box_fansu", "box_xiuzhen", "box_tiandao"]
    for index, name in enumerate(boxes):
        chest(index, f"{name}.png")
    for name in ["lingshi", "xiuwei", "jiyuan", "box", "collection", "shop", "settings", "ad"]:
        icon(name, f"icon_{name}.png")
    save(rain_background(), "ui/bg_rain.png")
    save(result_background(), "ui/bg_result.png")
    for name in ["gold", "blue", "red"]:
        drop(name, f"raindrop_{name}.png")
    for name in ["timer", "back", "close", "lock", "purify"]:
        simple_icon(name, f"icon_{name}.png")
    # M7 交互深化：圆满三连符文 + 聚灵法印（生成后即写 meta）
    for name in ["rune", "juling"]:
        m7_icon(name, f"icon_{name}.png")
        write_image_meta(f"ui/icons/icon_{name}.png")
    # M8 日常循环：修行任务 / 云游历练 / 心魔幻境
    for name in ["quest", "expedition", "illusion", "ludao"]:
        m7_icon(name, f"icon_{name}.png")
        write_image_meta(f"ui/icons/icon_{name}.png")


if __name__ == "__main__":
    main()
