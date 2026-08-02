#!/usr/bin/env python3
"""Generate HD Antialiased Guofeng Icons for 《凡人开仙缘》.

Generates at 4x resolution (576x576) with PIL and downsamples to 144x144 with Lanczos.
Preserves existing UUIDs in .meta files while recalculating exact trim bounding boxes.
"""

from __future__ import annotations
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "assets" / "subres" / "art" / "ui" / "icons"
CANVAS_SIZE = 576  # 4x supersampling
FINAL_SIZE = 144

def create_canvas():
    return Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))

def add_glint(draw, cx, cy, r=18, color=(255, 255, 255, 240)):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    draw.line([(cx - r * 3, cy), (cx + r * 3, cy)], fill=color, width=4)
    draw.line([(cx, cy - r * 3), (cx, cy + r * 3)], fill=color, width=4)

def add_glow_circle(draw, cx, cy, r_list, color=(255, 215, 80)):
    for r, alpha in r_list:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(color[0], color[1], color[2], alpha))

# ── 1. 灵石 (icon_lingshi): 璀璨八面仙晶宝石 ──
def draw_lingshi():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(240, 20), (210, 45), (180, 80)])

    top, bot = (cx, 64), (cx, 512)
    left, right = (80, cy), (496, cy)
    mid_tl, mid_tr = (144, 176), (432, 176)
    mid_bl, mid_br = (144, 400), (432, 400)
    c_top, c_bot = (cx, 160), (cx, 416)
    c_left, c_right = (176, cy), (400, cy)

    # Facets
    draw.polygon([top, mid_tl, c_left, c_top], fill=(255, 248, 195, 245))
    draw.polygon([top, mid_tr, c_right, c_top], fill=(255, 230, 130, 250))
    draw.polygon([mid_tl, left, mid_bl, c_left], fill=(235, 190, 80, 250))
    draw.polygon([mid_tr, right, mid_br, c_right], fill=(215, 160, 55, 250))
    draw.polygon([c_left, mid_bl, bot, c_bot], fill=(195, 140, 45, 250))
    draw.polygon([c_right, mid_br, bot, c_bot], fill=(165, 115, 35, 255))
    # Glowing center table
    draw.polygon([c_top, c_right, c_bot, c_left], fill=(255, 252, 230, 255))

    lines = [
        (top, left), (left, bot), (bot, right), (right, top),
        (top, c_top), (bot, c_bot), (left, c_left), (right, c_right),
        (c_top, c_right), (c_right, c_bot), (c_bot, c_left), (c_left, c_top),
        (mid_tl, c_left), (mid_tr, c_right), (mid_bl, c_left), (mid_br, c_right),
        (top, mid_tl), (top, mid_tr), (bot, mid_bl), (bot, mid_br),
        (mid_tl, left), (mid_tr, right), (mid_bl, left), (mid_br, right),
    ]
    for p1, p2 in lines:
        draw.line([p1, p2], fill=(255, 255, 240, 220), width=6)
        draw.line([p1, p2], fill=(140, 95, 25, 180), width=2)
    draw.polygon([top, mid_tr, right, mid_br, bot, mid_bl, left, mid_tl], outline=(255, 240, 150, 255), width=10)

    add_glint(draw, 220, 195, 16)
    add_glint(draw, 370, 325, 10)
    return img

# ── 2. 宝盒 (icon_box): 仙缘宝匣 ──
def draw_box():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(230, 25), (190, 50)])

    # Chest body
    bx0, by0, bx1, by1 = 96, 220, 480, 460
    draw.rounded_rectangle((bx0, by0, bx1, by1), 28, fill=(35, 24, 62, 255), outline=(230, 185, 75, 255), width=12)

    # Arched lid
    lid_top = 110
    draw.arc((bx0 - 10, lid_top, bx1 + 10, by0 + 80), 180, 360, fill=(245, 195, 80, 255), width=14)
    draw.chord((bx0 - 6, lid_top + 4, bx1 + 6, by0 + 70), 180, 360, fill=(45, 32, 80, 255))

    # Lid handle
    draw.arc((196, 70, 380, 180), 180, 360, fill=(255, 220, 110, 255), width=16)

    # Golden bands
    for x in (180, 396):
        draw.rounded_rectangle((x - 12, by0 - 20, x + 12, by1 + 6), 6, fill=(255, 215, 90, 255))
        draw.line([(x, by0 - 15), (x, by1 + 2)], fill=(255, 245, 190, 220), width=4)

    # Center Jade lock clasp
    draw.rounded_rectangle((236, 210, 340, 330), 16, fill=(225, 175, 60, 255), outline=(255, 240, 150, 255), width=6)
    # Jade inlay
    draw.rounded_rectangle((254, 230, 322, 290), 8, fill=(45, 212, 180, 255), outline=(180, 255, 230, 240), width=4)
    # Keyhole
    draw.ellipse((280, 298, 296, 314), fill=(24, 16, 40, 255))

    # Corner filigree studs
    for px, py in [(bx0 + 28, by0 + 28), (bx1 - 28, by0 + 28), (bx0 + 28, by1 - 28), (bx1 - 28, by1 - 28)]:
        draw.ellipse((px - 10, py - 10, px + 10, py + 10), fill=(255, 225, 120, 255))

    add_glint(draw, 340, 210, 12)
    return img

# ── 3. 修为 (icon_xiuwei): 盛放青金玄莲 ──
def draw_xiuwei():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 300
    add_glow_circle(draw, cx, cy, [(230, 30), (180, 60)])

    # Outer petals (cyan / teal)
    petals = 8
    for i in range(petals):
        angle = i * (2 * math.pi / petals)
        tip_x = cx + math.cos(angle) * 190
        tip_y = cy + math.sin(angle) * 150
        p1 = (cx + math.cos(angle - 0.4) * 90, cy + math.sin(angle - 0.4) * 80)
        p2 = (cx + math.cos(angle + 0.4) * 90, cy + math.sin(angle + 0.4) * 80)
        draw.polygon([(cx, cy), p1, (tip_x, tip_y), p2], fill=(45, 180, 190, 210), outline=(130, 235, 245, 240))

    # Inner petals (gold / purple-pink gradient)
    for i in range(petals):
        angle = (i + 0.5) * (2 * math.pi / petals)
        tip_x = cx + math.cos(angle) * 135
        tip_y = cy + math.sin(angle) * 110
        p1 = (cx + math.cos(angle - 0.35) * 60, cy + math.sin(angle - 0.35) * 50)
        p2 = (cx + math.cos(angle + 0.35) * 60, cy + math.sin(angle + 0.35) * 50)
        draw.polygon([(cx, cy), p1, (tip_x, tip_y), p2], fill=(245, 190, 80, 240), outline=(255, 245, 180, 255))

    # Center golden stamen & core
    draw.ellipse((cx - 48, cy - 48, cx + 48, cy + 48), fill=(255, 235, 120, 255), outline=(220, 160, 40, 255), width=6)
    draw.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=(255, 255, 240, 255))
    add_glint(draw, cx, cy - 20, 14)
    return img

# ── 4. 机缘 (icon_jiyuan): 八角天道玄机星 ──
def draw_jiyuan():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(240, 30), (200, 60)])

    # 8-point outer star
    outer_pts = []
    for i in range(16):
        r = 210 if i % 2 == 0 else 90
        a = i * (math.pi / 8) - math.pi / 2
        outer_pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    draw.polygon(outer_pts, fill=(245, 180, 50, 240), outline=(255, 240, 160, 255))

    # 8-point inner star (rotated)
    inner_pts = []
    for i in range(16):
        r = 130 if i % 2 == 0 else 60
        a = i * (math.pi / 8) - math.pi / 2 + math.pi / 16
        inner_pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    draw.polygon(inner_pts, fill=(255, 225, 100, 255), outline=(255, 255, 220, 255))

    # Center jewel
    draw.ellipse((cx - 40, cy - 40, cx + 40, cy + 40), fill=(255, 80, 90, 240), outline=(255, 230, 130, 255), width=6)
    draw.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), fill=(255, 255, 240, 255))
    add_glint(draw, cx - 10, cy - 10, 16)
    return img

# ── 5. 图鉴 (icon_collection): 灵根玉简秘卷 ──
def draw_collection():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(220, 25), (180, 50)])

    # Bamboo/jade slips
    slips = 6
    w = 46
    start_x = cx - (slips * w) / 2
    for i in range(slips):
        x0 = start_x + i * w + 4
        x1 = x0 + w - 8
        h_off = 16 * math.sin(i * 0.7)
        y0 = 100 + h_off
        y1 = 476 - h_off
        # Jade slip body
        draw.rounded_rectangle((x0, y0, x1, y1), 12, fill=(40, 175, 160, 240), outline=(200, 250, 240, 240), width=4)
        # Golden inscribed characters/strokes
        for y in range(int(y0) + 40, int(y1) - 40, 32):
            draw.line([(x0 + 8, y), (x1 - 8, y)], fill=(255, 225, 110, 220), width=4)

    # Golden binding cords across slips
    for y_cord in (180, 380):
        draw.line([(start_x - 16, y_cord), (start_x + slips * w + 16, y_cord)], fill=(255, 215, 80, 255), width=10)
        draw.line([(start_x - 16, y_cord), (start_x + slips * w + 16, y_cord)], fill=(150, 95, 20, 200), width=2)

    # Tassel hanging down left
    draw.polygon([(start_x - 10, 380), (start_x - 26, 480), (start_x + 6, 480)], fill=(230, 60, 75, 240))
    add_glint(draw, start_x + 60, 180, 12)
    return img

# ── 6. 商店 (icon_shop): 飞檐仙府仙阁 ──
def draw_shop():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 290
    add_glow_circle(draw, cx, cy, [(230, 25), (180, 50)])

    # Foundation platform
    draw.polygon([(110, 480), (466, 480), (436, 430), (140, 430)], fill=(30, 42, 80, 255), outline=(220, 175, 70, 255), width=6)

    # Columns (cinnabar red)
    for x in (165, 240, 336, 411):
        draw.rounded_rectangle((x - 8, 300, x + 8, 432), 4, fill=(195, 55, 65, 255), outline=(255, 215, 90, 255), width=3)

    # Lower roof with upturned eaves
    lower_roof = [(64, 305), (140, 310), (cx, 260), (436, 310), (512, 305), (460, 280), (cx, 240), (116, 280)]
    draw.polygon(lower_roof, fill=(245, 185, 60, 255), outline=(255, 240, 170, 255), width=5)

    # Upper floor pavilion
    draw.rounded_rectangle((190, 175, 386, 245), 6, fill=(35, 25, 65, 255), outline=(225, 175, 65, 255), width=5)
    # Upper plaque (仙)
    draw.rounded_rectangle((246, 185, 330, 235), 4, fill=(195, 50, 60, 255), outline=(255, 220, 110, 255), width=3)
    draw.line([(288, 194), (288, 226)], fill=(255, 255, 240, 240), width=4)

    # Upper roof with soaring eaves
    upper_roof = [(90, 180), (180, 185), (cx, 100), (396, 185), (486, 180), (430, 145), (cx, 85), (146, 145)]
    draw.polygon(upper_roof, fill=(255, 205, 75, 255), outline=(255, 250, 200, 255), width=6)

    # Spire finial
    draw.polygon([(cx - 10, 85), (cx + 10, 85), (cx, 40)], fill=(255, 235, 120, 255))
    draw.ellipse((cx - 16, 32, cx + 16, 64), fill=(255, 240, 150, 255))

    # Hanging wind bells/lanterns
    for lx in (90, 486):
        draw.ellipse((lx - 10, 195, lx + 10, 225), fill=(240, 80, 80, 240), outline=(255, 215, 80, 255), width=3)

    add_glint(draw, cx, 85, 14)
    return img

# ── 7. 设置 (icon_settings): 乾坤太极八卦盘 ──
def draw_settings():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(230, 30), (180, 60)])

    # Outer bronze-gold notched compass rim
    draw.ellipse((cx - 210, cy - 210, cx + 210, cy + 210), fill=(40, 30, 65, 255), outline=(230, 175, 60, 255), width=16)

    # 12 Zodiac / Trigram teeth on rim
    for i in range(12):
        a = i * (2 * math.pi / 12)
        tx = cx + math.cos(a) * 210
        ty = cy + math.sin(a) * 210
        draw.ellipse((tx - 12, ty - 12, tx + 12, ty + 12), fill=(255, 220, 110, 255))

    # Inner gold ring
    draw.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), outline=(255, 235, 140, 255), width=8)

    # Bagua trigram marks in 8 directions
    for i in range(8):
        a = i * (math.pi / 4)
        mx0 = cx + math.cos(a) * 165
        my0 = cy + math.sin(a) * 165
        mx1 = cx + math.cos(a) * 195
        my1 = cy + math.sin(a) * 195
        draw.line([(mx0, my0), (mx1, my1)], fill=(255, 225, 110, 240), width=6)

    # Taiji Yin-Yang core
    tr = 110
    # White half
    draw.pieslice((cx - tr, cy - tr, cx + tr, cy + tr), 270, 90, fill=(245, 245, 255, 255))
    # Black/dark half
    draw.pieslice((cx - tr, cy - tr, cx + tr, cy + tr), 90, 270, fill=(20, 24, 45, 255))
    # Small half circles
    draw.ellipse((cx - tr // 2, cy - tr, cx + tr // 2, cy), fill=(245, 245, 255, 255))
    draw.ellipse((cx - tr // 2, cy, cx + tr // 2, cy + tr), fill=(20, 24, 45, 255))
    # Eyes
    draw.ellipse((cx - 14, cy - tr // 2 - 14, cx + 14, cy - tr // 2 + 14), fill=(20, 24, 45, 255))
    draw.ellipse((cx - 14, cy + tr // 2 - 14, cx + 14, cy + tr // 2 + 14), fill=(255, 220, 110, 255))

    # Outer border of taiji
    draw.ellipse((cx - tr, cy - tr, cx + tr, cy + tr), outline=(255, 215, 90, 255), width=8)
    add_glint(draw, cx - 60, cy - 60, 14)
    return img

# ── 8. 任务 (icon_quest): 仙门法旨卷轴 ──
def draw_quest():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(220, 25), (180, 50)])

    # Scroll body (parchment)
    draw.rounded_rectangle((130, 120, 446, 440), 16, fill=(252, 246, 228, 255), outline=(210, 165, 60, 255), width=8)

    # Top & bottom golden scroll rods
    for ry in (110, 445):
        draw.rounded_rectangle((90, ry - 14, 486, ry + 14), 14, fill=(255, 215, 85, 255), outline=(160, 105, 30, 255), width=4)
        for ex in (90, 486):
            draw.ellipse((ex - 18, ry - 18, ex + 18, ry + 18), fill=(45, 212, 191, 255), outline=(255, 240, 150, 255), width=4)

    # Text lines on scroll
    for y in (170, 215, 260, 305):
        draw.line([(170, y), (406, y)], fill=(180, 150, 95, 200), width=6)

    # Cinnabar imperial seal (red stamp)
    draw.rounded_rectangle((320, 330, 410, 410), 10, fill=(215, 55, 65, 240), outline=(255, 220, 120, 240), width=4)
    draw.line([(345, 350), (385, 390)], fill=(255, 240, 210, 240), width=6)
    draw.line([(385, 350), (345, 390)], fill=(255, 240, 210, 240), width=6)

    # Radiant golden checkmark
    chk = [(160, 360), (220, 410), (310, 290)]
    draw.line(chk, fill=(45, 212, 170, 255), width=16, joint="curve")
    draw.line(chk, fill=(255, 255, 240, 255), width=8, joint="curve")

    add_glint(draw, 310, 290, 14)
    return img

# ── 9. 历练 (icon_expedition): 云游破空御剑 ──
def draw_expedition():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(220, 30), (180, 60)])

    # Swirling azure celestial clouds at bottom
    for arc_x, arc_y, r in [(140, 380, 90), (288, 420, 110), (430, 390, 85)]:
        draw.ellipse((arc_x - r, arc_y - r, arc_x + r, arc_y + r), fill=(30, 75, 120, 220), outline=(100, 200, 255, 240), width=6)

    # Celestial flying sword pointing up-right
    # Blade
    tip = (440, 90)
    base = (140, 390)
    p_l = (120, 370)
    p_r = (160, 410)
    draw.polygon([tip, p_l, base, p_r], fill=(225, 245, 255, 255), outline=(100, 190, 255, 255), width=6)
    # Center ridge
    draw.line([tip, base], fill=(255, 215, 90, 255), width=6)

    # Sword guard (crossguard)
    gx0, gy0 = 100, 370
    gx1, gy1 = 180, 450
    draw.line([(gx0, gy1), (gx1, gy0)], fill=(255, 205, 75, 255), width=18)

    # Sword hilt & pommel
    draw.line([(130, 420), (80, 470)], fill=(160, 40, 50, 255), width=14)
    draw.ellipse((60, 450, 90, 480), fill=(255, 225, 110, 255))

    # Gourd hanging on side
    gx, gy = 360, 340
    draw.ellipse((gx - 28, gy - 20, gx + 28, gy + 32), fill=(225, 165, 55, 255), outline=(255, 235, 140, 255), width=4)
    draw.ellipse((gx - 20, gy - 48, gx + 20, gy - 12), fill=(225, 165, 55, 255), outline=(255, 235, 140, 255), width=4)
    draw.line([(gx - 12, gy - 20), (gx + 12, gy - 20)], fill=(195, 50, 60, 255), width=6)

    add_glint(draw, tip[0], tip[1], 18)
    return img

# ── 10. 幻境 (icon_illusion): 心魔太虚宝镜 ──
def draw_illusion():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(230, 30), (190, 60)], color=(160, 90, 230))

    # Outer ornate bronze dragon/flame mirror frame
    draw.ellipse((cx - 200, cy - 200, cx + 200, cy + 200), fill=(35, 18, 55, 255), outline=(230, 175, 60, 255), width=14)

    # Mirror rim flames / petal points
    for i in range(8):
        a = i * (math.pi / 4)
        px = cx + math.cos(a) * 215
        py = cy + math.sin(a) * 215
        draw.ellipse((px - 14, py - 14, px + 14, py + 14), fill=(200, 120, 255, 240))

    # Purple void nebula mirror surface
    draw.ellipse((cx - 155, cy - 155, cx + 155, cy + 155), fill=(20, 10, 42, 255), outline=(180, 100, 250, 255), width=8)

    # Swirling inner mist
    draw.arc((cx - 130, cy - 130, cx + 130, cy + 130), 30, 210, fill=(150, 70, 230, 220), width=16)
    draw.arc((cx - 100, cy - 100, cx + 100, cy + 100), 180, 360, fill=(190, 90, 255, 200), width=12)

    # All-seeing mystic pupil
    # Eye almond shape
    draw.polygon([(cx - 85, cy), (cx, cy - 48), (cx + 85, cy), (cx, cy + 48)], fill=(45, 15, 65, 255), outline=(255, 215, 90, 255), width=6)
    # Pupil
    draw.ellipse((cx - 28, cy - 28, cx + 28, cy + 28), fill=(240, 70, 90, 255))
    draw.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=(255, 255, 230, 255))

    add_glint(draw, cx + 60, cy - 60, 14)
    return img

# ── 11. 论道 (icon_ludao): 双剑争锋合璧 ──
def draw_ludao():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(220, 30), (180, 60)])

    # Left sword: Yang Gold blade (slanted /)
    tip1 = (430, 110)
    base1 = (130, 450)
    draw.line([base1, tip1], fill=(255, 220, 100, 255), width=18)
    draw.line([base1, tip1], fill=(255, 250, 210, 255), width=6)
    # Hilt 1
    draw.line([(95, 420), (165, 480)], fill=(200, 140, 40, 255), width=16)

    # Right sword: Yin Azure blade (slanted \)
    tip2 = (146, 110)
    base2 = (446, 450)
    draw.line([base2, tip2], fill=(60, 200, 225, 255), width=18)
    draw.line([base2, tip2], fill=(210, 250, 255, 255), width=6)
    # Hilt 2
    draw.line([(481, 420), (411, 480)], fill=(40, 140, 180, 255), width=16)

    # Center clash burst & Yin-yang spark
    draw.ellipse((cx - 50, cy - 50, cx + 50, cy + 50), fill=(255, 255, 255, 240))
    for r in (70, 95):
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 230, 120, 220), width=6)

    add_glint(draw, cx, cy, 22)
    return img

# ── 12. 广告/福袋 (icon_ad): 乾坤祥瑞福袋 ──
def draw_ad():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 296
    add_glow_circle(draw, cx, cy, [(230, 30), (180, 60)])

    # Bag pouch body (rich imperial red)
    bx0, by0, bx1, by1 = 120, 180, 456, 480
    draw.rounded_rectangle((bx0, by0, bx1, by1), 80, fill=(210, 45, 60, 255), outline=(255, 215, 90, 255), width=12)

    # Bag pleated neck/collar
    neck = [(160, 180), (180, 120), (220, 150), (288, 110), (356, 150), (396, 120), (416, 180)]
    draw.polygon(neck, fill=(235, 65, 75, 255), outline=(255, 225, 110, 255), width=8)

    # Golden tied rope and bow
    draw.line([(150, 190), (426, 190)], fill=(255, 215, 80, 255), width=16)
    # Hanging tassel strings & bell
    draw.ellipse((cx - 24, 210, cx + 24, 258), fill=(255, 225, 100, 255), outline=(160, 100, 20, 255), width=4)
    draw.line([(cx - 16, 258), (cx - 32, 330)], fill=(255, 215, 80, 255), width=8)
    draw.line([(cx + 16, 258), (cx + 32, 330)], fill=(255, 215, 80, 255), width=8)

    # Golden auspicious character/motif (福 / 仙)
    draw.ellipse((cx - 70, 300, cx + 70, 440), outline=(255, 230, 120, 240), width=8)
    draw.line([(cx, 325), (cx, 415)], fill=(255, 235, 140, 255), width=8)
    draw.line([(cx - 45, 365), (cx + 45, 365)], fill=(255, 235, 140, 255), width=8)

    add_glint(draw, 170, 180, 14)
    return img

# ── 13. 符文 (icon_rune): 天罡雷光道符 ──
def draw_rune():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(230, 30), (180, 60)])

    # Diamond talisman plaque
    d_pts = [(cx, 40), (510, cy), (cx, 536), (66, cy)]
    draw.polygon(d_pts, fill=(35, 22, 58, 255), outline=(245, 195, 75, 255), width=14)

    # Inner diamond frame
    d_inner = [(cx, 90), (456, cy), (cx, 486), (120, cy)]
    draw.polygon(d_inner, outline=(255, 235, 140, 240), width=6)

    # Corner power dots
    for px, py in [(cx, 65), (480, cy), (cx, 510), (96, cy)]:
        draw.ellipse((px - 10, py - 10, px + 10, py + 10), fill=(255, 225, 110, 255))

    # Lightning / Daoist talisman calligraphy glyph in center
    glyph = [
        (cx, 130), (cx, 210),
        (cx - 65, 250), (cx + 65, 250),
        (cx - 30, 310), (cx + 40, 310),
        (cx - 70, 380), (cx + 60, 360),
        (cx - 20, 440), (cx + 10, 420), (cx, 460)
    ]
    draw.line(glyph, fill=(255, 235, 120, 255), width=14, joint="curve")
    draw.line(glyph, fill=(255, 255, 240, 255), width=6, joint="curve")

    add_glint(draw, cx, 130, 14)
    return img

# ── 14. 聚灵 (icon_juling): 五行聚灵法阵 ──
def draw_juling():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(230, 30), (180, 60)], color=(70, 190, 230))

    # Concentric array rings
    draw.ellipse((cx - 210, cy - 210, cx + 210, cy + 210), outline=(60, 180, 220, 255), width=10)
    draw.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), outline=(255, 215, 90, 240), width=6)
    draw.ellipse((cx - 90, cy - 90, cx + 90, cy + 90), outline=(100, 220, 255, 240), width=6)

    # 4 Swirling vortex arms
    for i in range(4):
        a_start = i * (math.pi / 2)
        draw.arc((cx - 190, cy - 190, cx + 190, cy + 190), int(math.degrees(a_start)), int(math.degrees(a_start) + 80), fill=(100, 220, 255, 240), width=12)

    # 5 Elemental orbs
    orb_colors = [
        (255, 215, 80),  # Gold
        (70, 190, 255),  # Water
        (70, 220, 150),  # Wood
        (255, 90, 90),   # Fire
        (220, 160, 70),  # Earth
    ]
    for i in range(5):
        a = i * (2 * math.pi / 5) - math.pi / 2
        ox = cx + math.cos(a) * 150
        oy = cy + math.sin(a) * 150
        c = orb_colors[i]
        draw.ellipse((ox - 24, oy - 24, ox + 24, oy + 24), fill=(c[0], c[1], c[2], 255), outline=(255, 255, 240, 255), width=4)

    # Radiant center core
    draw.ellipse((cx - 40, cy - 40, cx + 40, cy + 40), fill=(255, 245, 180, 255), outline=(255, 205, 70, 255), width=6)
    add_glint(draw, cx, cy, 18)
    return img

# ── 15. 净化 (icon_purify): 太乙神水甘露 ──
def draw_purify():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 300
    add_glow_circle(draw, cx, cy, [(220, 30), (180, 60)], color=(60, 190, 220))

    # Ripple rings at base
    for rx, ry, w_val in [(180, 48, 6), (120, 32, 6)]:
        draw.ellipse((cx - rx, 430 - ry, cx + rx, 430 + ry), outline=(90, 200, 240, 200), width=w_val)

    # Teardrop dew droplet
    # Top tip (288, 80), bulbous bottom (288, 360)
    drop_pts = [
        (cx, 80),
        (370, 260),
        (370, 360),
        (cx, 430),
        (206, 360),
        (206, 260),
    ]
    draw.polygon(drop_pts, fill=(50, 160, 225, 230), outline=(160, 235, 255, 255), width=10)

    # Willow leaf inside droplet
    leaf_pts = [
        (cx - 30, 380),
        (cx - 10, 300),
        (cx + 40, 220),
        (cx + 20, 290),
    ]
    draw.polygon(leaf_pts, fill=(55, 215, 140, 240), outline=(200, 255, 220, 255), width=4)

    add_glint(draw, cx - 35, 200, 16)
    return img

# ── 16. 锁 (icon_lock): 青铜饕餮金锁 ──
def draw_lock():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 310
    add_glow_circle(draw, cx, cy, [(220, 30), (180, 60)])

    # Shackle (top arch)
    sx0, sy0, sx1, sy1 = 150, 90, 426, 340
    draw.arc((sx0, sy0, sx1, sy1), 180, 360, fill=(245, 195, 75, 255), width=36)
    # Shackle ends entering body
    draw.rounded_rectangle((sx0, 220, sx0 + 36, 270), 6, fill=(245, 195, 75, 255))
    draw.rounded_rectangle((sx1 - 36, 220, sx1, 270), 6, fill=(245, 195, 75, 255))

    # Lock body (trapezoidal / ornate ruyi shape)
    bx0, by0, bx1, by1 = 100, 230, 476, 470
    draw.rounded_rectangle((bx0, by0, bx1, by1), 28, fill=(35, 24, 60, 255), outline=(235, 185, 75, 255), width=14)

    # Cloud filigree on lock body
    draw.arc((bx0 + 30, by0 + 30, bx1 - 30, by1 - 30), 200, 340, fill=(215, 165, 60, 200), width=8)

    # Keyhole
    draw.ellipse((cx - 24, 305, cx + 24, 353), fill=(255, 220, 110, 255))
    draw.polygon([(cx - 16, 335), (cx + 16, 335), (cx + 24, 405), (cx - 24, 405)], fill=(255, 220, 110, 255))
    draw.ellipse((cx - 10, 317, cx + 10, 337), fill=(24, 16, 40, 255))
    draw.polygon([(cx - 6, 332), (cx + 6, 332), (cx + 10, 385), (cx - 10, 385)], fill=(24, 16, 40, 255))

    add_glint(draw, bx1 - 30, by0 + 20, 14)
    return img

# ── 17. 倒计时 (icon_timer): 浑天星宿日晷 ──
def draw_timer():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(220, 30), (180, 60)])

    # Sundial plate
    draw.ellipse((cx - 200, cy - 200, cx + 200, cy + 200), fill=(35, 26, 62, 255), outline=(235, 185, 75, 255), width=16)
    draw.ellipse((cx - 165, cy - 165, cx + 165, cy + 165), outline=(255, 235, 140, 240), width=6)

    # 12 Hour ticks
    for i in range(12):
        a = i * (math.pi / 6)
        r0 = 170 if i % 3 == 0 else 180
        r1 = 195
        x0 = cx + math.cos(a) * r0
        y0 = cy + math.sin(a) * r0
        x1 = cx + math.cos(a) * r1
        y1 = cy + math.sin(a) * r1
        draw.line([(x0, y0), (x1, y1)], fill=(255, 225, 110, 255), width=8 if i % 3 == 0 else 4)

    # Gnomon needle pointer
    needle = [(cx, cy + 18), (cx - 12, cy), (cx, 130), (cx + 12, cy)]
    draw.polygon(needle, fill=(255, 220, 100, 255), outline=(255, 255, 240, 255), width=3)
    # Minute pointer pointing at 2 o'clock
    a2 = math.pi / 6
    draw.line([(cx, cy), (cx + math.cos(a2) * 110, cy + math.sin(a2) * 110)], fill=(255, 225, 110, 255), width=10)

    # Center jewel
    draw.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=(215, 60, 75, 255), outline=(255, 235, 130, 255), width=4)
    add_glint(draw, cx, 130, 12)
    return img

# ── 18. 返回 (icon_back): 如意金翎玉返 ──
def draw_back():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(200, 30), (160, 50)])

    # Elegant curved chevron pointing left
    pts = [
        (380, 100),
        (180, 288),
        (380, 476),
        (330, 476),
        (120, 288),
        (330, 100),
    ]
    draw.polygon(pts, fill=(245, 195, 75, 255), outline=(255, 240, 160, 255), width=6)
    # Inner glow spine
    draw.line([(345, 125), (155, 288), (345, 451)], fill=(255, 255, 240, 240), width=8)

    add_glint(draw, 140, 288, 16)
    return img

# ── 19. 关闭 (icon_close): 交叉金翎仙匕 ──
def draw_close():
    img = create_canvas()
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = 288, 288
    add_glow_circle(draw, cx, cy, [(200, 30), (160, 50)])

    # Cross 1 (\)
    draw.line([(120, 120), (456, 456)], fill=(245, 195, 75, 255), width=36)
    draw.line([(120, 120), (456, 456)], fill=(255, 255, 240, 255), width=12)

    # Cross 2 (/)
    draw.line([(456, 120), (120, 456)], fill=(245, 195, 75, 255), width=36)
    draw.line([(456, 120), (120, 456)], fill=(255, 255, 240, 255), width=12)

    # Center jewel stud
    draw.ellipse((cx - 28, cy - 28, cx + 28, cy + 28), fill=(215, 60, 75, 255), outline=(255, 235, 130, 255), width=6)
    add_glint(draw, cx, cy, 14)
    return img

GENERATORS = {
    "icon_lingshi": draw_lingshi,
    "icon_box": draw_box,
    "icon_xiuwei": draw_xiuwei,
    "icon_jiyuan": draw_jiyuan,
    "icon_collection": draw_collection,
    "icon_shop": draw_shop,
    "icon_settings": draw_settings,
    "icon_quest": draw_quest,
    "icon_expedition": draw_expedition,
    "icon_illusion": draw_illusion,
    "icon_ludao": draw_ludao,
    "icon_ad": draw_ad,
    "icon_rune": draw_rune,
    "icon_juling": draw_juling,
    "icon_purify": draw_purify,
    "icon_lock": draw_lock,
    "icon_timer": draw_timer,
    "icon_back": draw_back,
    "icon_close": draw_close,
}

def update_meta_file(name: str, final_img: Image.Image):
    meta_path = ICONS_DIR / f"{name}.png.meta"
    if not meta_path.exists():
        print(f"Skipping meta for {name}: not found")
        return
    
    meta_json = json.loads(meta_path.read_text(encoding="utf-8"))
    uid = meta_json.get("uuid", "")
    
    raw_w, raw_h = final_img.size
    alpha = final_img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        bbox = (0, 0, raw_w, raw_h)
    left, top, right, bottom = bbox
    trim_x, trim_y = left, top
    trim_w, trim_h = right - left, bottom - top
    off_x = (left + trim_w / 2) - raw_w / 2
    off_y = -((top + trim_h / 2) - raw_h / 2)

    uv = [
        trim_x, raw_h - (trim_y + trim_h),
        trim_x + trim_w, raw_h - (trim_y + trim_h),
        trim_x, raw_h - trim_y,
        trim_x + trim_w, raw_h - trim_y,
    ]
    nuv = [v / raw_w if i % 2 == 0 else v / raw_h for i, v in enumerate(uv)]

    sf_meta = meta_json["subMetas"]["f9941"]["userData"]
    sf_meta["trimX"] = trim_x
    sf_meta["trimY"] = trim_y
    sf_meta["width"] = trim_w
    sf_meta["height"] = trim_h
    sf_meta["rawWidth"] = raw_w
    sf_meta["rawHeight"] = raw_h
    sf_meta["offsetX"] = off_x
    sf_meta["offsetY"] = off_y
    sf_meta["vertices"]["uv"] = uv
    sf_meta["vertices"]["nuv"] = nuv
    sf_meta["vertices"]["rawPosition"] = [
        -trim_w / 2, -trim_h / 2, 0,
        trim_w / 2, -trim_h / 2, 0,
        -trim_w / 2, trim_h / 2, 0,
        trim_w / 2, trim_h / 2, 0,
    ]
    sf_meta["vertices"]["minPos"] = [-trim_w / 2, -trim_h / 2, 0]
    sf_meta["vertices"]["maxPos"] = [trim_w / 2, trim_h / 2, 0]

    meta_path.write_text(json.dumps(meta_json, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  [meta updated] {name}: trim=({trim_x},{trim_y},{trim_w},{trim_h})")

def main():
    print("=== Generating 19 HD Xianxia Icons ===")
    for name, gen_fn in GENERATORS.items():
        print(f"Generating {name}...")
        hd_canvas = gen_fn()
        final_img = hd_canvas.resize((FINAL_SIZE, FINAL_SIZE), Image.LANCZOS)
        out_png = ICONS_DIR / f"{name}.png"
        final_img.save(out_png, "PNG", optimize=True)
        update_meta_file(name, final_img)
    print("=== All 19 icons generated successfully! ===")

if __name__ == "__main__":
    main()
