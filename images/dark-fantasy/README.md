# Dark-fantasy source art

Runtime art is maintained as named source images and packed by TexturePacker.
Versioned source folders are the editable inventory; their generated
atlases live in `../sprite-sheets/` and are registered in
`../asset-manifest.json`.

The currently packed groups are:

- `resource-language-v1` — resource and calendar symbols.
- `heirlooms-v1` — fourteen square item paintings and the Vassal bag; shared by active icons, Relic choices, inventory, loadout and inheritance.
- `settlement-pieces-v4` — limited-palette settlement paintings for every current Practice and Structure, plus earlier cards.
- `piece-frames-v1` — structure, practice, and time frames.
- `region-landmarks-v1` ? generated neutral market village and billboard, monster lair, and scorched ground; [source prompts](region-landmarks-v1/README.md).
- `chronicle-illustrations-v1` — named card art, terrain tiles, and landmark animation frames.
- `vassal-portraits-v1` — the established portrait set, with youth, middle-age, and elder frames for each identity.
- `chronicle-gate-v1` — the shared menu and Life Map backdrop.
- `timegraph-chronicle-v1` — the timegraph assembly.

The old combined art sheets were split into these named sources and removed.
For any new art, add an individual named source image, register it in the manifest,
then run `npm run build:sprites` and `npm run check:assets`. The renderer loads
only TexturePacker frames through `src/views/chronicle-art.js`.

Design references and original generation prompts remain beside their source
folders for art-direction context; they are not runtime assets.
