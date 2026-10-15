# class-picker-frames-v1

Painted dark-fantasy frames for the protovassal class picker
(`src/views/protovassal-dossier-pixi.js`). Style: weathered dark stone, aged brass
trim, neutral and high-luminance so each class can tint them (Warlord crimson,
Philosopher blue; see `frameTint` in `protovassal-class-data.js`).

| Source (`generated/`) | Pieces here | Used for |
| --- | --- | --- |
| `window-source.jpg` | `window-corner-{tl,tr,bl,br}`, `window-edge-{top,bottom,left,right}`, `window-gem-{top,bottom}` | The 2336x708 window. Corners are fixed, the carved edges tile, gems sit on the centres (a plain nine-slice would stretch the 16:9 art ~5x). |
| `panel-source.jpg` | `panel` | Attribute chips, class attribute feature, ability cards (nine-slice). |
| `banner-source.jpg` | `banner` | The class banner (nine-slice, swallow-tail drawn by the bottom slice). |
| `tabs-source.jpg` | `tab`, `tab-selected`, `tab-locked`, `socket` | Class slots (normal, selected with amber glow, locked) and round icon sockets. |

The JPG sources have flat black backgrounds. `build.py` keys them into real alpha
(`key_lib.py`), crops, writes the piece PNGs in this folder (the registered sources),
downsizes them and packs `images/sprite-sheets/class-picker-frames.webp` + `.json`
(about 120 KB, 1024x894). TexturePacker is not needed:

    python3 images/dark-fantasy/class-picker-frames-v1/build.py   # needs numpy, scipy, Pillow

`layout.json` records each stored piece size; `src/views/painted-frame-spec.js` holds the
slice insets and draw scale, and `scripts/class-picker-frames-test.mjs` checks both
against the atlas. The atlas is loaded smoothly (not nearest-neighbour) because it is
downscaled painting. Vector `paintRelicPanel` frames remain the fallback while textures
load or if one is missing. Prompts: see `prompts.json`.
