# Runtime sprite sheets

The JSON files in this directory are standard TexturePacker JSON atlases. They
are generated from the active source files under `images/dark-fantasy/` and are
loaded by `src/views/chronicle-art.js`.

Open `resource-language.tps`, `settlement-pieces.tps` or `piece-frames.tps` in
TexturePacker to inspect the three runtime groups. Keep the output names and JSON
format unchanged unless the runtime loader is updated too.

Use `npm run build:sprites` after a batch of resource-symbol or settlement-piece
changes. The packer uses a 30% atlas for oversized resource symbols and
80% scale for settlement art and 50% for physical frames. Resource and frame
atlases load eagerly; the settlement atlas warms afterward. Each group uses one
texture (2048 maximum for resources/frames, 4096 for paintings). The CLI build
script is authoritative for these output scales; update runtime mappings before
introducing multipack output.
Run `npm run check:assets` afterward to catch
missing or stale atlas entries.

Do not add old source copies under `images/GameElements/`. The active inventory
and loading groups are recorded in `images/asset-manifest.json`; large screen
and animation atlases remain standalone because they are loaded by different
screens or sampled with custom rectangles.
