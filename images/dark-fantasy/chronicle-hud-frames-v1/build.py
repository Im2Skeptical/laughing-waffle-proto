#!/usr/bin/env python3
"""Key, crop and nearest-reduce the Chronicle crest-bar HUD, class medallions and multiplier sheets, then pack the atlas.

    python images/dark-fantasy/chronicle-hud-frames-v1/build.py

The generator returned flat-black sheets (`generated/hud-source.png`,
`generated/class-medallions-source.png` and `generated/multiplier-source.png`).
The outside black and the medallion apertures are keyed to transparency; dark
recessed stone/metal inside each piece stays opaque. Pieces are reduced with
nearest sampling and packed (2px extrusion, no trim/rotation) into
images/sprite-sheets/chronicle-hud-frames.{png,json}. Requires Pillow.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SHEETS = ROOT / 'images' / 'sprite-sheets'
DARK = 30          # max channel below this counts as background black
REDUCE = 2

source = Image.open(HERE / 'generated' / 'hud-source.png').convert('RGB')
r, g, b = [band.point(lambda v: 255 if v >= DARK else 0) for band in source.split()]
mask = Image.merge('RGB', (r, g, b)).convert('L').point(lambda v: 255 if v > 0 else 0)
ImageDraw.floodfill(mask, (0, 0), 128)
ImageDraw.floodfill(mask, (183, 783), 128)   # medallion aperture
alpha = mask.point(lambda v: 0 if v == 128 else 255)
sheet = source.convert('RGBA'); sheet.putalpha(alpha)

def piece(box):
    region = sheet.crop(box)
    bounds = region.getchannel('A').getbbox()
    region = region.crop(bounds)
    return region.resize((max(1, region.width // REDUCE), max(1, region.height // REDUCE)), Image.Resampling.NEAREST)

def lintel():
    whole = sheet.crop((36, 30, 988, 275)); bounds = whole.getchannel('A').getbbox()
    top = 30 + bounds[1]
    mid_bounds = sheet.crop((300, top, 556, 200)).getchannel('A').getbbox()
    mid = sheet.crop((300, top, 556, top + mid_bounds[3]))
    tile = Image.new('RGBA', (mid.width * 2, mid.height)); tile.paste(mid, (0, 0)); tile.paste(ImageOps.mirror(mid), (mid.width, 0))
    reduce = lambda im: im.resize((im.width // REDUCE, im.height // REDUCE), Image.Resampling.NEAREST)
    left = sheet.crop((36, top, 222, 275)); left = left.crop((left.getchannel('A').getbbox()[0], 0, left.width, left.getchannel('A').getbbox()[3]))
    right = sheet.crop((818, top, 988, 275)); rb = right.getchannel('A').getbbox(); right = right.crop((0, 0, rb[2], rb[3]))
    return {'lintel-cap-left': reduce(left), 'lintel-cap-right': reduce(right), 'lintel-mid': reduce(tile)}

pieces = lintel()
pieces.update({
    'pendant': piece((352, 690, 550, 832)),
    'stat-plaque': piece((568, 700, 708, 828)),
    'exp-groove-full': piece((732, 704, 988, 762)),
    'tab': piece((768, 782, 944, 958)),
})
# Empty groove: repaint the whole inner track (not just amber-looking pixels) so
# no ember residue survives; a two-tone recess with a darker upper lip.
empty = pieces['exp-groove-full'].copy(); px = empty.load()
for y in range(7, 16):
    for x in range(7, 116):
        if px[x, y][3]: px[x, y] = (16, 12, 9, 255) if y < 9 else (30, 24, 19, 255) if (x + y) % 7 else (36, 29, 23, 255)
pieces['exp-groove-empty'] = empty


def thin_medallion():
    """Radially compress the carved band so the neutral fallback ring is visibly thinner."""
    region = sheet.crop((36, 636, 332, 944)); bounds = region.getchannel('A').getbbox()
    region = region.crop(bounds)
    cx, cy = 140.5, 141.5          # ring centre in the cropped source
    R_IN, R_OUT, NEW_IN = 76.0, 139.0, 100.0
    src = region.load(); out = Image.new('RGBA', region.size); dst = out.load()
    for y in range(region.height):
        for x in range(region.width):
            dx, dy = x - cx, y - cy; r = (dx * dx + dy * dy) ** .5
            if r >= R_OUT: dst[x, y] = src[x, y]; continue
            if r < NEW_IN or r == 0: continue
            sr = R_IN + (r - NEW_IN) * (R_OUT - R_IN) / (R_OUT - NEW_IN)
            sx, sy = round(cx + dx / r * sr), round(cy + dy / r * sr)
            if 0 <= sx < region.width and 0 <= sy < region.height: dst[x, y] = src[sx, sy]
    for ux, uy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
        stud = region.crop((round(cx + ux * 112 - 14), round(cy + uy * 112 - 14), round(cx + ux * 112 + 14), round(cy + uy * 112 + 14)))
        disc = Image.new('L', stud.size, 0); ImageDraw.Draw(disc).ellipse((1, 1, 26, 26), fill=255)
        out.paste(stud, (round(cx + ux * 120 - 14), round(cy + uy * 120 - 14)), disc)
    return out.resize((out.width // REDUCE, out.height // REDUCE), Image.Resampling.NEAREST)


# Custom-illustrated class portrait medallions (`generated/class-medallions-source.png`).
class_med_source = Image.open(HERE / 'generated' / 'class-medallions-source.png').convert('RGB')

def extract_class_medallion(box, hole_cx, hole_cy, r_in, r_out, extra_seeds=()):
    crop = class_med_source.crop(box)
    w, h = crop.size
    cr, cg, cb = [band.point(lambda v: 255 if v >= 20 else 0) for band in crop.split()]
    fg = Image.merge('RGB', (cr, cg, cb)).convert('L').point(lambda v: 255 if v > 0 else 0)
    m = fg.copy()
    # Solidify the main ring core (r_in..r_out) so dark pits inside the metal stay opaque
    # and the inner/outer floodfills cannot leak across the ring.
    ImageDraw.Draw(m).ellipse((hole_cx - r_out, hole_cy - r_out, hole_cx + r_out, hole_cy + r_out), fill=255)
    inner_restore = Image.new('L', (w, h), 0)
    ImageDraw.Draw(inner_restore).ellipse((hole_cx - r_in, hole_cy - r_in, hole_cx + r_in, hole_cy + r_in), fill=255)
    m.paste(fg, mask=inner_restore)
    for sx, sy in ((0, 0), (int(hole_cx), int(hole_cy)), *extra_seeds):
        ImageDraw.floodfill(m, (sx, sy), 128)
    rgba = crop.convert('RGBA')
    rgba.putalpha(m.point(lambda v: 0 if v == 128 else 255))
    # Center on the circular aperture so anchor (0.5, 0.5) aligns with (m.cx, m.cy).
    R_CANVAS = 316
    centered = Image.new('RGBA', (R_CANVAS * 2, R_CANVAS * 2), (0, 0, 0, 0))
    centered.paste(rgba, (round(R_CANVAS - hole_cx), round(R_CANVAS - hole_cy)))
    return centered.resize((154, 154), Image.Resampling.NEAREST)

pieces['medallion'] = thin_medallion()
pieces['medallion-warrior'] = extract_class_medallion(
    (20, 20, 618, 645), 299.1, 313.3, 202, 255, extra_seeds=((87, 87), (524, 86))
)
pieces['medallion-scholar'] = extract_class_medallion(
    (653, 32, 1257, 668), 302.0, 306.1, 202, 262
)


# Multiplier twin-socket bar and emblem seals (`generated/multiplier-source.png`).
mult_source = Image.open(HERE / 'generated' / 'multiplier-source.png').convert('RGB')
MULT_DARK = 26

def extract_solid_piece(src_img, box):
    crop = src_img.crop(box)
    w, h = crop.size
    px_in = crop.load()
    fg = [[max(px_in[x, y]) >= MULT_DARK for x in range(w)] for y in range(h)]
    row_span = [[False] * w for _ in range(h)]
    for y in range(h):
        xs = [x for x in range(w) if fg[y][x]]
        if len(xs) >= 2:
            for x in range(xs[0], xs[-1] + 1): row_span[y][x] = True
    col_span = [[False] * w for _ in range(h)]
    for x in range(w):
        ys = [y for y in range(h) if fg[y][x]]
        if len(ys) >= 2:
            for y in range(ys[0], ys[-1] + 1): col_span[y][x] = True
    rgba = crop.convert('RGBA')
    alpha_im = Image.new('L', (w, h), 0)
    apx = alpha_im.load()
    for y in range(h):
        for x in range(w):
            if row_span[y][x] and col_span[y][x]: apx[x, y] = 255
    rgba.putalpha(alpha_im)
    rgba = rgba.crop(alpha_im.getbbox())
    return rgba.resize((max(1, rgba.width // REDUCE), max(1, rgba.height // REDUCE)), Image.Resampling.NEAREST)

def compact_vertical(img, top_keep=26, mid_keep=12, bot_keep=26):
    w, h = img.size
    out = Image.new('RGBA', (w, top_keep + mid_keep + bot_keep))
    out.paste(img.crop((0, 0, w, top_keep)), (0, 0))
    mid_y = (h - mid_keep) // 2
    out.paste(img.crop((0, mid_y, w, mid_y + mid_keep)), (0, top_keep))
    out.paste(img.crop((0, h - bot_keep, w, h)), (0, top_keep + mid_keep))
    return out

def warm_socket(img, is_output=True):
    out = img.copy(); px_io = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r0, g0, b0, a0 = px_io[x, y]
            if a0 > 0 and (r0 + g0 + b0) / 3.0 > 28:
                if is_output:
                    nr = min(255, max(0, round(r0 * 1.32 + 16)))
                    ng = min(255, max(0, round(g0 * 1.14 + 6)))
                    nb = min(255, max(0, round(b0 * 0.85)))
                else:
                    nr = min(255, max(0, round(r0 * 1.24 + 12)))
                    ng = min(255, max(0, round(g0 * 1.12 + 8)))
                    nb = min(255, max(0, round(b0 * 0.92 + 2)))
                px_io[x, y] = (nr, ng, nb, a0)
    return out

twin_raw = extract_solid_piece(mult_source, (110, 50, 692, 298))
twin_compact = compact_vertical(twin_raw, 26, 12, 26)
mid_x = twin_compact.width // 2
twin_left_dormant = twin_compact.crop((0, 0, mid_x, twin_compact.height))
twin_right_dormant = twin_compact.crop((mid_x, 0, twin_compact.width, twin_compact.height))

pieces.update({
    'mult-seal-output-active': extract_solid_piece(mult_source, (38, 330, 340, 640)),
    'mult-seal-output-dormant': extract_solid_piece(mult_source, (346, 330, 644, 640)),
    'mult-seal-capacity-active': extract_solid_piece(mult_source, (670, 330, 926, 656)),
    'mult-seal-capacity-dormant': extract_solid_piece(mult_source, (964, 330, 1220, 656)),
    'mult-twin-left-dormant': twin_left_dormant,
    'mult-twin-left-active': warm_socket(twin_left_dormant, True),
    'mult-twin-right-dormant': twin_right_dormant,
    'mult-twin-right-active': warm_socket(twin_right_dormant, False),
})

for name, image in pieces.items(): image.save(HERE / f'{name}.png', optimize=True)

# Shelf pack, tallest first, with 2px edge extrusion so nearest sampling never bleeds.
PAD = 2; WIDTH = 512
order = sorted(pieces, key=lambda n: -pieces[n].height)
x = y = shelf = 0; places = {}
for name in order:
    im = pieces[name]
    w, h = im.width + PAD * 2, im.height + PAD * 2
    if x + w > WIDTH: x = 0; y += shelf; shelf = 0
    places[name] = (x + PAD, y + PAD); x += w; shelf = max(shelf, h)
height = y + shelf
height = 1 << (height - 1).bit_length()
atlas = Image.new('RGBA', (WIDTH, height))
for name, (px0, py0) in places.items():
    im = pieces[name]
    atlas.paste(im, (px0, py0))
    w, h = im.size
    for d in range(1, PAD + 1):  # replicate edge pixels outward
        atlas.paste(im.crop((0, 0, w, 1)), (px0, py0 - d)); atlas.paste(im.crop((0, h - 1, w, h)), (px0, py0 + h - 1 + d))
    for d in range(1, PAD + 1):
        atlas.paste(atlas.crop((px0, py0 - PAD, px0 + 1, py0 + h + PAD)), (px0 - d, py0 - PAD))
        atlas.paste(atlas.crop((px0 + w - 1, py0 - PAD, px0 + w, py0 + h + PAD)), (px0 + w - 1 + d, py0 - PAD))
atlas.save(SHEETS / 'chronicle-hud-frames.png', optimize=True)
frames = {f'{n}.png': {'frame': {'x': places[n][0], 'y': places[n][1], 'w': pieces[n].width, 'h': pieces[n].height},
          'rotated': False, 'trimmed': False,
          'spriteSourceSize': {'x': 0, 'y': 0, 'w': pieces[n].width, 'h': pieces[n].height},
          'sourceSize': {'w': pieces[n].width, 'h': pieces[n].height}} for n in sorted(pieces)}
(SHEETS / 'chronicle-hud-frames.json').write_text(json.dumps({'frames': frames, 'meta': {
    'app': 'images/dark-fantasy/chronicle-hud-frames-v1/build.py', 'version': '1.0',
    'image': 'chronicle-hud-frames.png', 'format': 'RGBA8888', 'size': {'w': WIDTH, 'h': height}, 'scale': '1'}}, indent=1) + '\n')
(HERE / 'layout.json').write_text(json.dumps({'stored': {n: list(pieces[n].size) for n in sorted(pieces)},
    'packing': 'python images/dark-fantasy/chronicle-hud-frames-v1/build.py'}, indent=2) + '\n')
print('packed', {n: pieces[n].size for n in sorted(pieces)}, 'atlas', (WIDTH, height))
