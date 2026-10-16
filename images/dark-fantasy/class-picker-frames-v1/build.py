#!/usr/bin/env python3
"""Extract named frame sprites; TexturePacker alone builds the runtime atlas.
Run this, then npm run build:sprites -- class-picker-frames. Requires Pillow.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent


def master(name, size):
    image = Image.open(HERE / 'generated' / f'{name}-source.png').convert('RGBA')
    # Ignore barely visible generator specks when finding the material silhouette.
    bounds = image.getchannel('A').point(lambda a: 255 if a >= 64 else 0).getbbox()
    if bounds is None:
        raise ValueError(f'{name} has no visible pixels')
    image = image.crop(bounds)
    if image.getpixel((image.width // 2, image.height // 2))[3] != 0:
        raise ValueError(f'{name} aperture must be genuinely transparent')
    return image.resize((size, size), Image.Resampling.NEAREST)


def repeat_strip(image, vertical=False):
    # A mirrored return makes both ends identical without blur or feathering.
    out = Image.new('RGBA', (image.width if vertical else image.width * 2,
                             image.height * 2 if vertical else image.height))
    out.paste(image, (0, 0))
    out.paste(ImageOps.flip(image) if vertical else ImageOps.mirror(image),
              (0, image.height) if vertical else (image.width, 0))
    return out


frame = master('frame', 256)
pieces = {'socket': master('socket', 128)}
for name, box in {
    'tl': (0, 0, 64, 64), 'tr': (192, 0, 256, 64),
    'bl': (0, 192, 64, 256), 'br': (192, 192, 256, 256),
}.items():
    pieces[f'window-corner-{name}'] = frame.crop(box)
for name, box in {'top': (64, 0, 128, 64), 'bottom': (64, 192, 128, 256),
                  'left': (0, 64, 64, 128), 'right': (192, 64, 256, 128)}.items():
    pieces[f'window-edge-{name}'] = repeat_strip(frame.crop(box), name in ('left', 'right'))
for name, image in pieces.items():
    image.save(HERE / f'{name}.png', optimize=True)
(HERE / 'layout.json').write_text(json.dumps({
    'stored': {name: list(image.size) for name, image in pieces.items()},
    'packing': 'npm run build:sprites -- class-picker-frames',
}, indent=2) + '\n', encoding='utf-8')
print(f'Extracted {len(pieces)} sprites; run npm run build:sprites -- class-picker-frames')
