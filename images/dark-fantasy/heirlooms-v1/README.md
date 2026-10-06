# Heirloom item art

Fourteen original square heirloom paintings and a leather bag were generated
individually with the built-in ImageGen tool. Large, isolated objects, crisp
pixel clusters, selective dithering, warm brass, umber, charcoal and subdued
olive follow the established Practice, Structure and resource art direction.
No external game artwork is used. Exact prompts are in [prompts.json](prompts.json).

The same painting supplies the compact active icon and the larger square card,
so an item keeps its identity between the Vassal bar, Relic choices, bag,
loadout and inheritance. PNG originals are preserved. TexturePacker packs
them at 0.3 scale with nearest-neighbor runtime sampling into
`images/sprite-sheets/heirlooms.json` and `heirlooms.png`.

`src/views/vassal-heirloom-pixi.js` owns these shared faces. Artwork is view
data; no simulation definitions, save schemas, RNG or replay rules change.
