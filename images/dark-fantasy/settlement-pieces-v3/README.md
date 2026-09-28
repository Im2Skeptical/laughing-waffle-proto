# Settlement paintings, third pass

Archived composition pass. Runtime cards use `../settlement-pieces-v4/`.

This set covers all 94 current Practices, all 34 current Structures, and 27
earlier card subjects: 155 named paintings in total. `index.html` is a local
card-size review gallery; its `catalogue.js` mirrors the content inventory.

The art direction is narrative oil illustration in the spirit of N. C. Wyeth
and Dean Cornwell. Each Practice needs a clear action in the upper part of a
5:7 card, grouped figures with indiscernible faces, environmental scale, and
broad quiet value masses below the action where card controls overlay the
image. Structures should read as buildings at their actual footprint width,
with human figures for scale. The emphasis is on one focal contrast and a
legible silhouette at small size. Foraging is one subject among the set, not
a compositional template.

The built-in ImageGen tool generated the raster originals. The `prompts-*.json`
files record the shared art direction and per-subject briefs for the main
generation batches. `recordKeeping` was regenerated during card-size review
to put the ledger above the overlay and remove a visible statue face. The
production sources are opaque WebP at quality 90, converted from the ImageGen
PNGs without resizing. The generated PNG originals remain in the Codex
generated-images directory; this source folder keeps the compact production
copies. TexturePacker packs these at 30% scale into two atlases.
