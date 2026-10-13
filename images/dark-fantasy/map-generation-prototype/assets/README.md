# Generated terrain engraving study

`terrain-engraving-v1.png` is the original transparent sprite sheet generated
with the built-in image-generation tool for this disposable map prototype.
Its alpha channel is preserved. The source sheet is 1536 × 1024.

`../illustrated-art.js` curates twelve nonuniform frames, resamples them into
the map's pixel lattice, and quantizes colours. Mountain, foothill, cliff and
marsh engravings use per-pixel local-biome shading; dead hinterland uses charcoal.
The runtime retains the procedural site icons and reeds alongside the generated
terrain. None of these assets or placement rules are imported by the live game.

## Generation prompt

Use case: stylized-concept. Asset type: ONE production terrain sprite atlas for an illustrated dark fantasy regional map, genuinely transparent background. A precise 4 column by 3 row grid of 12 separate sprites, each wholly confined to its cell with at least 15 percent transparent padding, no visible grid or labels. Landscape sheet. Row 1: large connected jagged reddish-umber mountain massif of five peaks with intricate engraved shadow faces; medium three-peak reddish mountain group; low rocky ochre foothill group; small scattered reddish boulders. Row 2: large irregular olive-green woodland mass with many individually inked oak and pine crowns and natural open gaps; medium olive woodland copse; small group of three trees; single old spreading tree. Row 3: large grey-olive marsh group with dead trees reeds and small muddy pools; medium reeds and deadwood; low grassy ochre hummock with sparse scrub; small rocky coastal cliff ledge with layered exposed stone. View is antique fantasy map pictorial relief, terrain viewed obliquely from south, consistent light from upper left, no isometric diamond bases. Style: exquisite small-scale hand-engraved Tolkien-like fantasy cartography, subdued Elden Ring map colours, sepia ink, fine hatching, crisp deliberate edges, restrained coloured washes, high silhouette variety. Entire sheet coherent and designed to reduce cleanly into pixel artwork; no glossy 3D, no photorealism, no white mountain caps. Ground fades to transparent at the feet with sparse hatching. No surrounding paper, no scenery backdrop, no text, no borders, no cast rectangular shadows. Make each object a useful compositable map illustration, not a miniature scenic painting.
