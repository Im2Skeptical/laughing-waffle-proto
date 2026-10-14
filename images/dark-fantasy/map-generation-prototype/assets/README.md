# Generated terrain engraving study

## Composable terrain library

Seven new transparent source sheets provide **110 pieces**: twelve for each of
the five biomes, plus five for each of the ten unordered biome pairings.
The five biome sheets use a 4-by-3 grid; the two contact sheets use a 5-by-5 grid.
Contact columns contain continuing segments, bends, branches, gaps and end caps.
The source paintings are original generated artwork, preserved unchanged.
Exact generation prompts, cell names and grid metadata are recorded in
[composable-terrain-prompts.json](composable-terrain-prompts.json).

`../composable-art.js` crops alpha bounds, reduces them to the canonical pixel
lattice and derives mirrored variants. Those mirrors do not count as additional
source pieces. Five-bit colour channels and retained source alpha preserve the
painting's material variety. Small family-specific channel grades adjust warmth
and foliage; illustrations are never recoloured by the region beneath them.
Painted blue water is removed so the authoritative water mask remains clear.
Generated cells are combinable illustrations, not verified seamless edge tiles.
`../terrain-composition.js` checks actual painted silhouette overlaps, limits
overpainting and rejects repeated neighbouring images when composing them.
`../terrain-frames.js` detects actual alpha gutters rather than assuming equal
crop widths. Eight inseparable source fragments are excluded from placement:
mountains 0, 1, 4, 5, 6, 7 and contact families 7/8 fragment 2. The inspector
reports this explicitly. All swamp fragments now extract without solid cutoffs.

## Landmark zoom atlas

`landmark-lod-v1.png` is a new transparent 1536 × 1024 atlas generated with the
built-in image tool. It contains settlement, market and monster-lair columns,
and detailed, regional and strategic rows. Existing game art is preserved.
`../zoom-art.js` crops the actual alpha bounds in each frame, converts rows to
96 / 48 / 20 pixels wide and quantizes colour clusters. Source alpha is retained.
The detailed and regional versions share a lower-centre ground anchor. Tiny
versions use a minimum screen footprint. Runtime sampling never modifies the
source sheet. This is prototype artwork; it does not replace live game assets.

### Landmark generation prompt

```text
Create ONE production sprite atlas PNG for a dark fantasy illustrated regional map game. Transparent background, landscape canvas, a precise 3 column by 3 row grid of nine isolated sprites with generous equal transparent gutters. No text, no labels, no frame lines, no parchment background, no shadows detached from subjects.

Columns consistently identify: LEFT a player settlement, CENTER a neutral market town, RIGHT a monster lair.
Rows consistently identify: TOP detailed close-view illustration, MIDDLE simplified regional-view illustration of THE SAME subject with the same silhouette and colours, BOTTOM tiny strategic emblem of the same subject.

Art direction: antique hand-engraved Tolkien-like fantasy atlas translated into deliberate pixel clusters, muted Elden-Ring-like parchment ochre, aged ivory, olive grey, reddish umber, charcoal ink; restrained cool teal only for neutral market awnings and pennants. Dark fantasy, weathered and austere, beautifully readable silhouettes. Fine pixel art with clean pixel clusters and selective engraving, not photorealism, not smooth digital painting. Consistent three-quarter overhead view, light from upper left, minimal low earthy ground footprint. Small architectural elements implying a whole settlement rather than one enormous house. Artwork must remain recognisable at 24 screen pixels wide.

LEFT top: compact medieval settlement of 6-9 ochre roof groups around one modest gate tower and courtyard, a gold pennant, low palisade, road entering at lower centre. Weathered stone, deep readable roof shadows, some exquisite close detail. MIDDLE left: same gate tower, same gold pennant and roof silhouette, 3-4 roof masses, no tiny crosshatching. BOTTOM left: simple ochre gate-tower-and-roofs emblem.
CENTER top: equally sized compact market town, clustered grey stone/umber roofs around clearly visible desaturated teal striped awnings, small teal pennants, courtyard and road entering lower centre. MIDDLE center: same roof silhouette and teal canopy, very selective details. BOTTOM center: strong tiny teal canopy and roof emblem.
RIGHT top: ruined dark stone gate and several broken low walls with an unmistakable pale horned beast skull above the entrance, muted rust-red pennant, charcoal scorched ground footprint, no flames. Similar overall height and footprint to towns, not a giant skull floating on a circle. MIDDLE right: same pale horns and broken gate silhouette in ivory, charcoal and rust with simpler broken walls. BOTTOM right: a compact ivory horned-skull-and-gate emblem with a rust accent.

Top row occupies similar visual width in all three cells, around 75% cell width and 70% cell height. Middle row same cell bounds but fewer broader shapes. Bottom row centred, about 35% cell width and height, crisp and simple. Keep each frame fully separated, all cutouts complete. Transparent alpha outside each sprite. This atlas will be sampled into 96px / 48px / 20px versions for smooth zoom LOD.
```

`terrain-engraving-v1.png` is the original transparent sprite sheet generated
with the built-in image-generation tool for this disposable map prototype.
Its alpha channel is preserved. The source sheet is 1536 × 1024.

`../illustrated-art.js` curates twelve nonuniform frames, resamples them into
the map's pixel lattice, and quantizes colours. Mountain, foothill, cliff and
marsh engravings retain their source colours; dead hinterland uses charcoal.
The runtime retains the procedural site icons and reeds alongside the generated
terrain. None of these assets or placement rules are imported by the live game.

## Generation prompt

Use case: stylized-concept. Asset type: ONE production terrain sprite atlas for an illustrated dark fantasy regional map, genuinely transparent background. A precise 4 column by 3 row grid of 12 separate sprites, each wholly confined to its cell with at least 15 percent transparent padding, no visible grid or labels. Landscape sheet. Row 1: large connected jagged reddish-umber mountain massif of five peaks with intricate engraved shadow faces; medium three-peak reddish mountain group; low rocky ochre foothill group; small scattered reddish boulders. Row 2: large irregular olive-green woodland mass with many individually inked oak and pine crowns and natural open gaps; medium olive woodland copse; small group of three trees; single old spreading tree. Row 3: large grey-olive marsh group with dead trees reeds and small muddy pools; medium reeds and deadwood; low grassy ochre hummock with sparse scrub; small rocky coastal cliff ledge with layered exposed stone. View is antique fantasy map pictorial relief, terrain viewed obliquely from south, consistent light from upper left, no isometric diamond bases. Style: exquisite small-scale hand-engraved Tolkien-like fantasy cartography, subdued Elden Ring map colours, sepia ink, fine hatching, crisp deliberate edges, restrained coloured washes, high silhouette variety. Entire sheet coherent and designed to reduce cleanly into pixel artwork; no glossy 3D, no photorealism, no white mountain caps. Ground fades to transparent at the feet with sparse hatching. No surrounding paper, no scenery backdrop, no text, no borders, no cast rectangular shadows. Make each object a useful compositable map illustration, not a miniature scenic painting.
