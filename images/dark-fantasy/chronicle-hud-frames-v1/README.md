# Chronicle crest-bar HUD frames

Original hand-illustrated limestone, acanthus relief, worn bronze and amber studs,
matching `class-picker-frames-v1` (Diablo II / Baldur's Gate II style references
in `ai/References/`). One generated sheet, `generated/hud-source.png` (1024², flat
black), holds every piece; exact prompts are in `prompts.json`.

    python images/dark-fantasy/chronicle-hud-frames-v1/build.py

keys the outside black (and the medallion aperture) to transparency by flood fill,
crops each piece, reduces 2:1 with nearest sampling, derives `exp-groove-empty`
by replacing the amber fill with dark track, and packs
`images/sprite-sheets/chronicle-hud-frames.png` and `images/sprite-sheets/chronicle-hud-frames.json` (no trim/rotation, 2px
extrusion). Sizes are recorded in `layout.json`.

Pieces: `lintel-cap-left/right` (fixed), `lintel-mid` (mirrored, tiles
horizontally), `medallion` (portrait ring with hanging loops), `pendant`
(Prestige plaque on two rings), `stat-plaque` (stud on top; lit for pinned or
level-up selection), `exp-groove-empty/full` (full is masked to progress), `tab`
(oxblood hanging tab with bracket). `vassal-life-hud-pixi.js` tints by class and
keeps the vector HUD while the atlas loads; textures use nearest filtering.

Multiplier twin-socket bar and emblem seals (`generated/multiplier-source.png`):
`mult-twin-left-{active,dormant}`, `mult-twin-right-{active,dormant}`,
`mult-seal-output-{active,dormant}`, and `mult-seal-capacity-{active,dormant}`
for `src/views/multiplier-fitting.js`.

Custom class HUD portrait medallions (`generated/class-medallions-source.png`):
`medallion-warrior` (hammered iron ring with crossed broadswords and ruby settings)
and `medallion-scholar` (engraved bronze scrollwork ring with open codex and sapphire settings).
