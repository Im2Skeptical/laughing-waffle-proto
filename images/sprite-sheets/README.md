# Runtime sprite sheets

The JSON files in this directory are standard TexturePacker JSON atlases. They
are generated from the active source files under `images/dark-fantasy/` and are
loaded by `src/views/chronicle-art.js`.

Open `resource-language.tps` or `settlement-pieces.tps` in TexturePacker to
inspect and adjust the two runtime groups. Keep the output names and JSON
format unchanged unless the runtime loader is updated too.

Use `npm run build:sprites` after a batch of resource-symbol or settlement-piece
changes. The packer uses a 30% atlas for oversized resource symbols and
full-resolution input for settlement art, keeps the two loading lifecycles
separate, and allows multipack output when a group exceeds one 4096px texture.
Run `npm run check:assets` afterward to catch
missing or stale atlas entries.

Do not add old source copies under `images/GameElements/`. The active inventory
and loading groups are recorded in `images/asset-manifest.json`; large screen
and animation atlases remain standalone because they are loaded by different
screens or sampled with custom rectangles.
