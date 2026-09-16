# Runtime sprite sheets

Every runtime image is a TexturePacker JSON atlas in this folder. The named
source PNGs live beneath `images/dark-fantasy/*-v1/`; runtime code must load a
frame from an atlas, never a source PNG directly.

`npm run build:sprites` is the authoritative rebuild. It packs resource
symbols, settlement pieces, frames, chronicle illustrations, legacy vassal
portraits, the menu gate, and the timegraph assembly. The two one-frame sheets
exist so the DOM menu backdrop and Pixi consume the same packed gate source.

Run `npm run check:assets` after asset work. It verifies both source inventory
and every packed frame recorded in `images/asset-manifest.json`.

Do not add combined hand-authored runtime sheets. Add a named source image to
the relevant `*-v1` folder, register it in the manifest, and update the packer
job and runtime mapping together.
