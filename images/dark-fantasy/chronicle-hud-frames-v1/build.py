#!/usr/bin/env python3
"""Key, crop and nearest-reduce the Chronicle crest-bar HUD sheet, then pack the atlas.

    python images/dark-fantasy/chronicle-hud-frames-v1/build.py

The generator returned a flat-black JPG sheet (`generated/hud-source.png`). The
outside black and the medallion hole are flood-filled to transparency; dark
recessed stone inside each piece stays opaque. Pieces are reduced 2:1 with
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
mask = source.point(lambda v: 255 if v >= DARK else 0).convert('L')
# A pixel is material when any channel is bright enough.
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
    """Radially compress the carved band so the ring is visibly thinner.

    Source pixels (2x stored) at radius 76..139 are resampled into 100..139, the
    loops and outer lip beyond 139 are untouched, and the four amber studs are
    pasted back unsquashed at the new band centre. Nearest sampling only.
    """
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


def recolor_studs(image, hue):
    """Re-gem only the four stud discs (warm pixels inside each disc)."""
    import colorsys
    out = image.copy(); px = out.load()
    for ux, uy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
        sx, sy = 70.25 + ux * 60, 70.75 + uy * 60
        for y in range(int(sy - 8), int(sy + 9)):
            for x in range(int(sx - 8), int(sx + 9)):
                if (x - sx) ** 2 + (y - sy) ** 2 > 42: continue
                r, g, b, a = px[x, y]
                if not a or r < b + 25: continue
                h, l, s_ = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                nr, ng, nb = colorsys.hls_to_rgb(hue, l, min(1, s_ * 1.1))
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def jagged_rim(image, teeth=16):
    """Warlord: iron teeth biting into the aperture (drawn crisply at stored size)."""
    import math
    out = image.copy(); d = ImageDraw.Draw(out)
    cx, cy, r = 70.25, 70.75, 50.5
    for i in range(teeth):
        a = i * 2 * math.pi / teeth + math.pi / teeth
        half = math.pi / teeth * .55
        base1 = (cx + math.cos(a - half) * (r + 1), cy + math.sin(a - half) * (r + 1))
        base2 = (cx + math.cos(a + half) * (r + 1), cy + math.sin(a + half) * (r + 1))
        tip = (cx + math.cos(a) * (r - 6), cy + math.sin(a) * (r - 6))
        d.polygon([base1, tip, base2], fill=(58, 44, 30, 255), outline=(150, 118, 76, 255))
    return out


def smooth_rim(image):
    """Philosopher: a fine ivory inner bead line on the smooth bevel."""
    out = image.copy(); d = ImageDraw.Draw(out)
    cx, cy, r = 70.25, 70.75, 50.5
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(214, 198, 160, 255), width=1)
    return out


thin = thin_medallion()
pieces['medallion'] = thin
pieces['medallion-warrior'] = jagged_rim(recolor_studs(thin, 0.995))
pieces['medallion-scholar'] = smooth_rim(recolor_studs(thin, 0.60))

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
