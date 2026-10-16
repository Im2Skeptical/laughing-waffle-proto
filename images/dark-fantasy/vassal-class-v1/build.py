#!/usr/bin/env python3
"""Extract the approved prototype art into named production sources. Requires Pillow.
Then run npm run build:sprites -- vassal-class.
"""
from pathlib import Path
from PIL import Image
HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'vassal-chrome-prototype'
components = Image.open(SOURCE / 'components.png')
for name, (x, y, w, h) in {
    'warrior': (16, 24, 595, 600), 'scholar': (646, 22, 585, 607),
    'crest': (72, 651, 501, 521), 'mystery': (649, 678, 551, 567),
}.items():
    components.crop((x, y, x + w, y + h)).save(HERE / f'{name}.png', optimize=True)
portraits = Image.open(SOURCE / 'portraits.png')
size = portraits.width // 2
for index, name in enumerate(('warrior', 'scholar')):
    portraits.crop((index * size, 0, (index + 1) * size, size)).save(HERE / f'{name}-founder.png', optimize=True)
print('Extracted six named class-art sources without changing the approved crops')
