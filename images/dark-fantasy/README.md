# Original visual assets

The current timegraph is one illustrated walnut/brass assembly with inset
controls, a fixed key cabinet, upright scroll rollers and a transparent
exterior. Its PNG, runtime sampling rectangle and exact built-in image
generation prompt are documented in
[timegraph-chronicle-assembly-prompt.md](timegraph-chronicle-assembly-prompt.md).
Earlier scroll variants are documented in [timegraph-scroll-prompt.md](timegraph-scroll-prompt.md)
and [timegraph-scroll-side-rollers-prompt.md](timegraph-scroll-side-rollers-prompt.md).

Generated for this project on 2026-09-07 with the built-in image generation tool, then copied into this directory. No CLI fallback or external game textures were used. Original supplied references remain in `ai/References/` and are not shipped by the build.

The runtime atlas mapping is in `src/views/chronicle-art.js`. Native PNGs are preserved; atlas sampling and aspect-preserving crops happen in Pixi. Full design, time contract, and validation notes: [visual overhaul](../../ai/visual-overhaul.md).

## chronicle-cards.png

Saved path: `images/dark-fantasy/chronicle-cards.png`.

A four-column, three-row atlas; rows: forage/cultivate/preserve/administration, granary/houses/travel/patronage, development/crisis/legacy/settlement. Six paintings cover core gamepieces; the others cover Lifegraph families and scenery. The additional atlases provide unique paintings for the remaining gamepieces: [chronicle-practices.png and chronicle-civic.png prompts](extended-art-prompts.md).

Exact final generation prompt:

> Use case: stylized-concept. Asset type: one production game illustration atlas, exactly 4 columns by 3 rows of equal square full-bleed paintings, all 12 cells edge-to-edge with absolutely no gutters, frames, lettering, UI, numbers or watermarks. Landscape 4:3 image, ideally 2048x1536. Original dark medieval fantasy card illustrations for Civilization Survivor. Authentic late-1990s PC 2D game art: deliberately chunky visible pixel clusters, carefully hand-placed ordered dithering, restricted 24-colour palette of near-black charcoal, slate, aged ochre/brass, bone, deep crimson and desaturated teal. Rich, highly legible silhouettes, detailed strong illustrations, dramatic chiaroscuro, intricate gothic architecture, no photorealism, no smooth 3D rendering, no vector-flat art. Each scene designed as if painted at 128x128 and nearest-neighbour enlarged; pixelated texture remains very evident. Exact cell order left to right then top to bottom: ROW 1: (1) a hooded forager carrying a basket of red berries through gnarled twilight forest, (2) a peasant with curved sickle harvesting golden wheat beneath a black abbey, (3) an ancient underground cellar stacked with clay amphorae and grain sacks lit by one candle, (4) a cloaked medieval steward with parchment ledger, brass scales and a laden merchant wagon behind him. ROW 2: (5) a timber and stone granary with a steep shingle roof and wheat sacks under stormy skies, (6) humble thatched mud-brick cottage with one glowing amber window and a smoking chimney, (7) a torchlit winding mountain road and a lone traveller walking toward a fortress, (8) a solemn noble in crimson cloak presenting a brass coin before a candlelit throne. ROW 3: (9) an elderly scholar reading a luminous manuscript under a vaulted library, (10) a black knight with a chipped sword confronting a vast crimson eclipse in a ruined battlefield, (11) ancient crowned stone skull and a weathered hourglass in an ivy-clad tomb, (12) a walled village nestled in dark pine forest with a small bridge crossing a cold stream. Equal-sized cells, no text anywhere. This is one sprite atlas, not a mockup.

## realm-terrain.png

Saved path: `images/dark-fantasy/realm-terrain.png`.

Two columns and two rows: green woodland, rust moor, teal wetland, and black mountain terrain.

Exact final generation prompt:

> Use case: stylized-concept. Asset type: seamless top-down terrain texture atlas for a late 1990s pixel art medieval strategy map. One square image exactly 2 columns and 2 rows, four equal square tiles with no gutters, no frames or dividing lines, no text, no UI. This must be overhead cartographic land terrain, absolutely no horizon, no sky, no perspective landscape paintings. Each tile must look naturally repeating with the same material density to every edge. Tiny environmental features at map scale as in a hand-painted illustrated medieval strategy map, detailed 2D pixel art, 32 colour restricted palette, deliberate visible chunky pixels and ordered dithering. Image ideally 1024x1024, designed as 512x512 pixel art. Top left tile: mossy muted olive green rolling grassland, dense small dark pine groves, exposed earthen paths, scattered grey crags. Top right tile: dry rust umber moorland, ochre dirt, copper red patches of low scrub, sparse rocky ridges. Bottom left tile: desaturated blue-teal marshland, reed beds, little shallow ponds and narrow braided streams, mossy rocks, dark conifers. Bottom right tile: charcoal grey craggy mountain foothills, dense miniature jagged peaks and scree, pale slate highlights, a little deep green scrub. Moody dark fantasy, weathered and tactile, sufficient midtone contrast to see detail, varied clustered natural features, coherent near-black dark forest shadow and worn warm earth highlights. No houses, settlements, buildings, roads connecting specific points, flags, grid, symbols, text, borders, lights, smooth blur or 3D.

## chronicle-gate.png

Saved path: `images/dark-fantasy/chronicle-gate.png`.

Menu panorama; also used at low opacity behind the Lifegraph.

Exact final generation prompt:

> Use case: stylized-concept. Asset type: production main menu background for an original dark fantasy time-travel strategy game, very wide landscape 3:2. Full-bleed illustrated panorama, no text, no logo, no interface. Weathered gothic arch framing a distant medieval civilization: clustered thatched villages and black cathedral towers on a cliff above a cold winding river, mountains fading into desaturated blue fog; on the RIGHT a monumental ancient brass astronomical clock or time astrolabe set into cracked stone, skull carving and faint crimson light in its centre; small lone cloaked figure at its foot. The LEFT third is deep shadow and empty dark stone suitable for legible title overlay. Late 1990s PC RPG limited palette pixel art, strong 2D illustration with detailed carved stone and tarnished metal, unmistakably visible pixel clusters and ordered dithering, as if drawn at 640x426 then nearest-neighbour enlarged. Rich midtones, charcoal shadows, bone and old gold, moss and muted teal, accents of oxblood red, candlelit windows, foreboding melancholic atmosphere. Crisp pixel detail, no blur, no photorealism, no modern smooth 3D, no UI, lettering or watermark. Original design.

## vassal-portraits.png

Saved path: `images/dark-fantasy/vassal-portraits.png`.

Four columns and two rows of portrait archetypes.

Exact final generation prompt:

> Use case: stylized-concept. Asset type: ONE production RPG character portrait atlas, exactly 4 columns by 2 rows, 8 equal square cells, no gutters or frames, all full-bleed, no lettering. Portraits of eight distinct human medieval dark-fantasy vassals, from shoulders upward, extremely readable faces, front three-quarter view. Late 1990s PC RPG pixel art with highly deliberate large pixel clusters and visible dithering. NOT smooth digital painting, NOT photorealistic. Limited 24 colour palette: charcoal blue-black shadows, ochre, warm bone, muted ivory, grey, olive green, desaturated teal, crimson red. Expressive eyes, strong faces, weathered skin and intricate wool cloaks and tarnished brooches. Lighting from upper left, clear brighter face silhouettes on very dark textured backgrounds. Row1 left to right: a stern middle-aged pale clean-shaven dark-haired noble in an oxblood cloak; a weathered older copper-skinned ranger with black beard in forest-green cloak; a bald pale elderly scholar with short white beard and bronze collar; an elderly dark-brown-skinned sage with grey beard and a teal mantle. Row2 left to right: a fair middle-aged noblewoman with stern eyes, dark braided hair and muted gold cloak; an olive-skinned older woman with grey braided hair, burgundy hood and a silver clasp; a young black-haired dark-brown-skinned clean-shaven steward in a crimson tunic; a pale middle-aged ginger-bearded traveller with a green hood. Original characters, no celebrities, no logos, no text, no UI, equal square cells, each face centred and cropped identically. As if each cell drawn at 96x96 and enlarged with nearest-neighbour. Landscape 2:1.

## realm-landmarks.png

Saved path: `images/dark-fantasy/realm-landmarks.png`.

Four hamlet frames across the top and four brazier frames below. Delivered size is 1774 × 887; runtime atlas rectangles account for unequal row heights. The PNG has true transparent pixels.

Exact final generation prompt:

> Create an ORIGINAL production pixel-art animation atlas for a dark medieval fantasy strategy game. Transparent background (true RGBA), exact regular grid of 4 columns by 2 rows, no gutters, each cell the same dimensions. The whole image should be 1536x768, with 384x384 cells. No text, no labels, no gridlines. Top row: FOUR successive frames of the SAME isometric small medieval hamlet landmark: cluster of 3 timber and rough stone cottages, slate roofs, one tiny amber window, low palisade, smoking chimney. Building position, scale, perspective and silhouette identical in all four frames. Only a thin curl of grey chimney smoke and the little window/firelight change across a smooth 4-frame repeating animation. Bottom row: FOUR successive frames of the SAME isolated wrought-iron brazier on three feet, burning a bright amber/rust-red fire, with a few small embers. Brazier remains absolutely fixed; flames change shape in a 4-frame repeating animation. Each subject entirely within its cell and surrounded by transparent space; no visible ground tile, landscape or opaque rectangle. The hamlet fills the middle 80 percent of its cells, brazier fills middle 50 percent. Consistent sprite alignment centered bottom around 85 percent of cell height. Style: exceptional detailed but visibly pixelated late-1990s hand-painted 2D RTS sprites, Diablo II / Age of Empires II atmosphere, heavily restricted 24-color palette of soot-black, iron-grey, desaturated moss, old ochre and ember amber. Crisp native pixel clusters and ordered dithering, no smooth vector edges, no 3D render look, no blur, no bloom. Strong readable silhouette at small on-screen size. This is a reusable ORIGINAL asset sheet, no borrowed game assets or logos.
