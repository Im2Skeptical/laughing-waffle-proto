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
    'medallion': piece((36, 636, 332, 944)),
    'pendant': piece((352, 690, 550, 832)),
    'stat-plaque': piece((568, 700, 708, 828)),
    'exp-groove-full': piece((732, 704, 988, 762)),
    'tab': piece((768, 782, 944, 958)),
})
empty = pieces['exp-groove-full'].copy(); px = empty.load()
for y in range(empty.height):
    for x in range(empty.width):
        rr, gg, bb, aa = px[x, y]
        if aa and rr > 85 and rr - bb > 45: px[x, y] = (34, 29, 24, 255)
pieces['exp-groove-empty'] = empty

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
