"""Offline prototype art import. Requires Pillow, numpy and Node.js.

Source paintings are preserved. Only reduced, packed runtime assets are shipped.
The 635 cases are composed terrain templates, not 635 independent paintings.
"""
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'images/dark-fantasy/map-generation-prototype/assets'
MASTER = BASE / 'masters'
OUT = BASE / 'runtime'
BIOMES = ['plains', 'forest', 'islands', 'swamp', 'mountains']
PAIRS = [(BIOMES[a], BIOMES[b]) for a in range(5) for b in range(a + 1, 5)]
SIZE = 32


def save(image, name):
    image.save(OUT / name, 'WEBP', lossless=True, method=6)


def swatches(path, columns, rows, size):
    image = Image.open(path).convert('RGBA')
    w, h = image.size
    result = []
    for row in range(rows):
        for col in range(columns):
            # Opaque texture sheets have no sprite gutters. Trim incidental
            # generated divider ink, then import every complete texture cell.
            box = (round((col + .018) * w / columns), round((row + .018) * h / rows),
                   round((col + .982) * w / columns), round((row + .982) * h / rows))
            result.append(np.array(image.crop(box).resize(size, Image.Resampling.LANCZOS)))
    return result


def periodic(tile):
    tile = tile.astype(float).copy()
    for d in range(4):
        v = (tile[:, d] + tile[:, -1 - d]) / 2
        tile[:, d] = v
        tile[:, -1 - d] = v
        v = (tile[d] + tile[-1 - d]) / 2
        tile[d] = v
        tile[-1 - d] = v
    return tile


def conform(tile, common):
    y, x = np.mgrid[:SIZE, :SIZE]
    distance = np.minimum.reduce([x, y, SIZE - 1 - x, SIZE - 1 - y])
    t = np.clip(distance / 6, 0, 1)
    t = t * t * (3 - 2 * t)
    result = np.rint(common * (1 - t[..., None]) + tile * t[..., None]).clip(0, 255).astype('uint8')
    result[..., 3] = 255
    return result


def packed(images, names, filename, columns, cell_size):
    cw, ch = cell_size
    atlas = Image.new('RGBA', (columns * (cw + 2), math.ceil(len(images) / columns) * (ch + 2)))
    records = []
    for n, (array, record) in enumerate(zip(images, names)):
        image = Image.fromarray(array)
        x, y = n % columns * (cw + 2) + 1, n // columns * (ch + 2) + 1
        atlas.paste(image, (x, y))
        # Independent-frame filtering needs an unambiguous transparent gutter.
        records.append({**record, 'rect': [x, y, image.width, image.height]})
    save(atlas, filename)
    return records


def import_surfaces():
    ground = {}
    banks = {}
    for biome in BIOMES:
        raw = swatches(MASTER / f'ground-{biome}-v1.png', 4, 4, (SIZE, SIZE))
        common = periodic(raw[0])
        ground[biome] = [conform(tile, common) for tile in raw]
        raw_banks = swatches(MASTER / f'bank-{biome}-v1.png', 2, 4, (64, 32))
        # Along-bank strips share left/right colour samples; depth is preserved.
        common_bank = raw_banks[0].astype(float).copy()
        for d in range(4):
            edge = (common_bank[:, d] + common_bank[:, -1 - d]) / 2
            common_bank[:, d] = edge
            common_bank[:, -1 - d] = edge
        for bank in raw_banks:
            for d in range(6):
                amount = min(1, d / 5)
                for column in [d, bank.shape[1] - 1 - d]:
                    bank[:, column] = np.rint(common_bank[:, column] * (1 - amount) + bank[:, column] * amount).astype('uint8')
        banks[biome] = raw_banks

    images, records = [], []
    def add(array, kind, **fields):
        images.append(array)
        records.append({'kind': kind, **fields})

    for biome in BIOMES:
        for n, tile in enumerate(ground[biome]):
            add(tile, f'ground-{biome}-{n}', role='ground', biome=biome, variant=n)
    y, x = np.mgrid[:SIZE, :SIZE]
    fx, fy = x / (SIZE - 1), y / (SIZE - 1)
    for a, b in PAIRS:
        for mask in range(16):
            tl, tr, br, bl = [(mask >> n) & 1 for n in range(4)]
            weight = (tl * (1 - fx) + tr * fx) * (1 - fy) + (bl * (1 - fx) + br * fx) * fy
            t = np.clip((weight - .32) / .36, 0, 1)
            t = t * t * (3 - 2 * t)
            tile = np.rint(ground[a][mask] * (1 - t[..., None]) + ground[b][mask] * t[..., None]).astype('uint8')
            add(tile, f'contact-{a}-{b}-{mask}', role='contact', biomes=[a, b], mask=mask)

    def blob(mask):
        for diagonal, a, b in [(4, 0, 1), (5, 1, 2), (6, 2, 3), (7, 3, 0)]:
            if not (mask & (1 << a) and mask & (1 << b)):
                mask &= ~(1 << diagonal)
        return mask
    blobs = sorted({blob(n) for n in range(256)})
    assert len(blobs) == 47
    for biome in BIOMES:
        for mask in blobs:
            grid = np.array([[bool(mask & 128), bool(mask & 1), bool(mask & 16)],
                             [bool(mask & 8), True, bool(mask & 2)],
                             [bool(mask & 64), bool(mask & 4), bool(mask & 32)]], dtype=float)
            gx, gy = fx * 2, fy * 2
            ix, iy = np.minimum(gx.astype(int), 1), np.minimum(gy.astype(int), 1)
            ux, uy = gx - ix, gy - iy
            occupancy = (grid[iy, ix] * (1 - ux) + grid[iy, ix + 1] * ux) * (1 - uy) + (grid[iy + 1, ix] * (1 - ux) + grid[iy + 1, ix + 1] * ux) * uy
            depth = np.clip(.5 - (occupancy - .5) * 1.4, 0, 1)
            profile = (mask * 13) % 8
            tile = banks[biome][profile][np.rint(depth * 31).astype(int), x * 2]
            add(tile, f'shore-{biome}-{mask}', role='shore', biome=biome, mask=mask, profile=profile)

    for role in ['river', 'road']:
        for biome in BIOMES:
            for mask in range(16):
                distance = np.full((SIZE, SIZE), 100., dtype=float)
                for n, end in enumerate([(15.5, 0), (31, 15.5), (15.5, 31), (0, 15.5)]):
                    if not mask & (1 << n):
                        continue
                    dx, dy = end[0] - 15.5, end[1] - 15.5
                    t = np.clip(((x - 15.5) * dx + (y - 15.5) * dy) / (dx * dx + dy * dy), 0, 1)
                    distance = np.minimum(distance, np.hypot(x - (15.5 + dx * t), y - (15.5 + dy * t)))
                tile = ground[biome][mask].copy()
                profile = mask % 8
                if role == 'river':
                    depth = np.clip(.5 - (distance - 2.2) / 11, 0, 1)
                    bank = banks[biome][profile][np.rint(depth * 31).astype(int), x * 2]
                    use = distance < 7
                    tile[use] = bank[use]
                else:
                    track = ground[biome][(mask + 5) % 16].copy()
                    # Worn tracks use ground materials, with a subtle dark verge.
                    track[..., :3] = np.rint(track[..., :3] * .88 + 18).clip(0, 255).astype('uint8')
                    use = distance < 3
                    tile[use] = track[use]
                add(tile, f'{role}-{biome}-{mask}', role=role, biome=biome, mask=mask, profile=profile)

    assert len(images) == 635
    tiles = packed(images, records, 'terrain-kit-v1.webp', 32, (SIZE, SIZE))
    profiles = packed([bank for biome in BIOMES for bank in banks[biome]],
                      [{'kind': f'bank-{biome}-{n}', 'biome': biome, 'profile': n} for biome in BIOMES for n in range(8)],
                      'bank-profiles-v1.webp', 8, (64, 32))
    manifest = {'version': 1, 'tilePixels': SIZE, 'designTexel': 2, 'sourceGroundPieces': 80,
                'sourceBankProfiles': 40, 'counts': {'ground': 80, 'contact': 160, 'shore': 235, 'river': 80, 'road': 80},
                'tiles': tiles, 'profiles': profiles,
                'reference': {'source': 'https://github.com/OpenRA/ra2/blob/master/mods/ra2/tilesets/snow.yaml',
                              'templates': 475, 'imageVariants': 678, 'definedSubtiles': 2519}}
    (OUT / 'terrain-kit-v1.json').write_text(json.dumps(manifest, separators=(',', ':')))


def import_relief():
    images, records = [], []
    sheets = [(b, 4, 3) for b in BIOMES] + [('contacts-1', 5, 5), ('contacts-2', 5, 5)]
    for name, columns, rows in sheets:
        source = Image.open(BASE / f'composable-{name}-v1.png').convert('RGBA')
        payload = json.dumps([source.width, source.height, columns, rows]).encode() + b'\n' + source.tobytes()
        probe = subprocess.run(['node', str(ROOT / 'scripts/map-terrain-frame-probe.mjs')], input=payload, capture_output=True, check=True)
        cells = json.loads(probe.stdout)
        array = np.array(source)
        for n, cell in enumerate(cells):
            area = array[cell['top']:cell['bottom'], cell['left']:cell['right']]
            ys, xs = np.nonzero(area[..., 3] >= 65)
            if not len(xs):
                raise ValueError(f'Empty terrain fragment {name}/{n}')
            l, t = max(0, int(xs.min()) - 2), max(0, int(ys.min()) - 2)
            r, b = min(area.shape[1], int(xs.max()) + 3), min(area.shape[0], int(ys.max()) + 3)
            cropped = Image.fromarray(area[t:b, l:r])
            contact = name.startswith('contacts')
            pair = (0 if name == 'contacts-1' else 5) + n // columns if contact else None
            kind = f'contact-{pair}-{n % columns}' if contact else f'terrain-{name}-{n}'
            scale = [1.2, 1, .85, 1.1, 1.05, .8, .75, 1.15, .9, 1, .8, .85][n] if not contact else 1
            width = 50 if contact else round((36 if name == 'mountains' else 26 if name == 'forest' else 25) * scale) * 2
            height = min(118, max(1, round(width * cropped.height / cropped.width)))
            image = np.array(cropped.resize((width, height), Image.Resampling.LANCZOS))
            images.append(image)
            records.append({'kind': kind, 'family': name, 'cutRuns': cell['cutRuns'], 'pair': list(PAIRS[pair]) if contact else None})
    frames = packed(images, records, 'relief-v1.webp', 16, (124, 124))
    (OUT / 'relief-v1.json').write_text(json.dumps({'version': 1, 'designTexel': 2, 'frames': frames}, separators=(',', ':')))
    legacy = Image.open(BASE / 'terrain-engraving-v1.png').convert('RGBA')
    save(legacy.resize((768, 512), Image.Resampling.LANCZOS), 'engraving-v1.webp')
    source = Image.open(BASE / 'landmark-lod-v1.png').convert('RGBA')
    images, records = [], []
    for col, kind in enumerate(['player', 'neutral', 'monster']):
        for lod, (top, bottom, width) in enumerate([(0, 447, 96), (0, 447, 48), (810, 1024, 20)]):
            cell = source.crop((col * 512, top, (col + 1) * 512, bottom))
            alpha = np.array(cell)[..., 3]
            ys, xs = np.nonzero(alpha >= 100)
            cropped = cell.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
            height = max(1, round(width * cropped.height / cropped.width))
            array = np.array(cropped.resize((width, height), Image.Resampling.LANCZOS))
            array[..., 3] = np.where(array[..., 3] < 95, 0, 255)
            array[..., :3] = (np.rint(array[..., :3].astype(float) / 12) * 12).clip(0, 255).astype('uint8')
            images.append(array)
            records.append({'kind': kind, 'lod': lod})
    frames = packed(images, records, 'landmarks-v1.webp', 3, (124, 156))
    (OUT / 'landmarks-v1.json').write_text(json.dumps({'version': 1, 'frames': frames}, separators=(',', ':')))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    import_surfaces()
    import_relief()
    total = sum(p.stat().st_size for p in OUT.iterdir() if p.suffix in ['.webp', '.json'])
    print(f'Map art import: 635 terrain cases, 40 bank profiles, 110 relief frames; runtime files {total / 1048576:.2f} MiB')
