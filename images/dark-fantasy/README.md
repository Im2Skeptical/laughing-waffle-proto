# Dark-fantasy source art

Runtime art is maintained as named source PNGs and packed by TexturePacker.
Source folders ending in `-v1` are the editable inventory; their generated
atlases live in `../sprite-sheets/` and are registered in
`../asset-manifest.json`.

The currently packed groups are:

- `resource-language-v1` — resource and calendar symbols.
- `settlement-pieces-v2` — settlement paintings.
- `piece-frames-v1` — structure, practice, and time frames.
- `chronicle-illustrations-v1` — named card art, terrain tiles, and landmark animation frames.
- `vassal-portraits-v1` — the legacy portrait sources, pending the approved procedural replacement.
- `chronicle-gate-v1` — the shared menu and Life Map backdrop.
- `timegraph-chronicle-v1` — the timegraph assembly.

The old combined art sheets were split into these named sources and removed.
For any new art, add an individual source PNG, register it in the manifest,
then run `npm run build:sprites` and `npm run check:assets`. The renderer loads
only TexturePacker frames through `src/views/chronicle-art.js`.

Design references and original generation prompts remain beside their source
folders for art-direction context; they are not runtime assets.
