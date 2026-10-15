"""Check the imported pixels, not just the generator's declared tile counts."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / 'images/dark-fantasy/map-generation-prototype/assets/runtime'
manifest = json.loads((folder / 'terrain-kit-v1.json').read_text())
atlas = Image.open(folder / 'terrain-kit-v1.webp').convert('RGBA')
tiles = {record['kind']: np.array(atlas.crop((record['rect'][0], record['rect'][1],
         record['rect'][0] + record['rect'][2], record['rect'][1] + record['rect'][3]))) for record in manifest['tiles']}
assert len(tiles) == 635 and all(tile.shape == (32, 32, 4) for tile in tiles.values())
assert all(np.all(tile[..., 3] == 255) for tile in tiles.values()), 'Material templates must fill their ground'
biomes = ['plains', 'forest', 'islands', 'swamp', 'mountains']
for biome in biomes:
    ground = [tiles[f'ground-{biome}-{n}'] for n in range(16)]
    assert len({tile.tobytes() for tile in ground}) == 16, f'{biome} variants collapsed to duplicates'
    for tile in ground:
        assert np.array_equal(tile[:, 0], tile[:, -1]) and np.array_equal(tile[0], tile[-1]), f'{biome} ground is not periodic'
        assert np.array_equal(tile[:, 0], ground[0][:, 0]) and np.array_equal(tile[0], ground[0][0]), f'{biome} variants do not share edges'
    for role, count in [('shore', 47), ('river', 16), ('road', 16)]:
        assert len([r for r in manifest['tiles'] if r['role'] == role and r['biome'] == biome]) == count

for i, a in enumerate(biomes):
    for b in biomes[i + 1:]:
        for m in range(16):
            image = tiles[f'contact-{a}-{b}-{m}']
            for n in range(16):
                other = tiles[f'contact-{a}-{b}-{n}']
                if ((m >> 1) & 1, (m >> 2) & 1) == (n & 1, (n >> 3) & 1):
                    assert np.array_equal(image[:, -1], other[:, 0]), f'{a}/{b} contact edges disagree'
                if (m & 1, (m >> 1) & 1) == ((n >> 3) & 1, (n >> 2) & 1):
                    assert np.array_equal(image[0], other[-1]), f'{a}/{b} contact corners disagree'

bank_atlas = Image.open(folder / 'bank-profiles-v1.webp').convert('RGBA')
for biome in biomes:
    records = [r for r in manifest['profiles'] if r['biome'] == biome]
    assert len(records) == 8
    common = None
    for record in records:
        x, y, w, h = record['rect']
        bank = np.array(bank_atlas.crop((x, y, x + w, y + h)))
        assert np.array_equal(bank[:, 0], bank[:, -1]), f'{biome} bank ends disagree'
        if common is None:
            common = bank[:, 0]
        assert np.array_equal(common, bank[:, 0]), f'{biome} bank variations cannot join'

relief = json.loads((folder / 'relief-v1.json').read_text())
assert len(relief['frames']) == 130
assert {r['kind'] for r in relief['frames'] if r['cutRuns']} == {'contact-7-2', 'contact-8-2'}, 'Replacement biome art must have complete extractable edges'
assert all(r['rect'][2] <= 118 and r['rect'][3] <= 118 for r in relief['frames'])
settlements = json.loads((folder / 'settlement-buildings-v1.json').read_text())['frames']
assert len(settlements) == 30 and all(not f['cutRuns'] for f in settlements)
for biome in biomes:
    assert {f['role'] for f in settlements if f['biome'] == biome} == {'house', 'pair', 'hall', 'market', 'workshop', 'gate'}
assert all(f['rect'][2] <= 128 and f['rect'][3] <= 128 for f in settlements)

total = sum(p.stat().st_size for p in folder.iterdir() if p.suffix in ['.webp', '.json'])
assert total < 3 * 1048576, 'Imported art exceeded the prototype runtime budget'
print(f'Map terrain: 635 cases across five biomes, exact ground/contact/bank pixel joins, 130 relief frames; {total / 1048576:.2f} MiB.')
