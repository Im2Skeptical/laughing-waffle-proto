# Map generation Pixi workbench (disposable prototype)

Current published revision: **Map v1.0.6** — bony monster-region perimeters,
denser forest coverage and softer floor/canopy contrast. The version appears under the title inside the
canvas (including fullscreen and PNG exports), in the page status and browser
title, and as `mapWorkbench.version`. For each published map pass, increment
`MAP_VERSION` in `study.js`, match the script query in `index.html`, update this
revision note, and report that version to the user.

### Monster territories

The atlas has two dedicated monster regions among its 20 cells. `biome: monster`
is a sixth type; it replaces two non-island assignments while preserving at least
one cell of every landscape type. Quotas, area percentages, selection and the
six-entry legend all use the actual monster type. `terrainBiome` records only
which material variant of the den kit to use; it is not the cell's identity.
Ordinary towns and monster props cannot share these cells. Monster dens never
spawn in the five ordinary biome types.

The whole territory uses 16 seam-matched scorched-ground variants imported from
the live game's monster-ground artwork. Contacts blend into that substrate;
cinder banks describe dry borders, with matching road, river and shore treatment.
Twelve generated hellscape pieces now supply structural charred ridges, bone
spines, burnt thickets, linking embankments and ember scars. They follow curved
interior spines and boundary verges, with smaller ground cover between. Dens and
pits reserve their silhouettes first; later terrain cannot bury them. Existing
den-kit foliage is graded to ash and rust so it belongs to the monster biome.
Each den/pit/accent role gets its own placement attempts; a rejected large pit
cannot prevent subsequent small sinkholes, bones and fissures from spawning.
`monsterVisibility` compares planned and displayed den counts and reports the
displayed hellscape pieces; it exposes failures beyond successful composition.
Bone-spine pieces follow a closed inset path around each monster cell, including
coasts and outer edges, before general landscape placement. Rivers, roads and
dens remain gaps. Full, compact, small and micro variants fit narrower strips;
spikes retain their silhouettes across the illustrated division stencil.
`terrainComposition.monsterBorders` reports attempts and placements per region.
Six generated pieces per material variant supply two low dens, a sunken pit,
paired sinkholes, bone/cloth accents and scarred ground. The live game's bone,
horn, dark stone, rust cloth and restrained ember theme is adapted to local
grass banks, woodland roots, basalt, violet peat and reddish scree.
Pieces are scattered through a region, not attached to a central hub or broad
clearing. They share terrain depth ordering, substrate blending, native pixel
sampling and zoom. Full silhouettes must fit dry land in the correct biome,
avoid roads and town plots, and reserve space against later terrain placement.
Smaller variants handle restricted footprints. Placement is seeded and fixed
across zoom; Sites Off removes dens/pits but preserves the region's biome ground.
Labels controls one caption at each monster region centre.
`terrainComposition.monsterZones` reports biome, region and accepted pieces.
The old fortress remains only in the Old game comparison. No simulation,
schemas, RNG streams or replay behavior change.

Built-in imagegen master: `assets/masters/monster-biomes-v1.png`; exact prompt
and theme references: [monster-biomes-prompts-v1.json](assets/masters/monster-biomes-prompts-v1.json).
Import widths are 36/28px dens, 34/28px pits and 18/24px accents. The runtime
kit now has 196 relief frames and is about 2.29 MiB. Run map-art, composition,
settlement and browser LOD checks; inspect seeds 1867 and 1873 across all biomes.
Hellscape master: `assets/masters/composable-hellscape-v1.png`; built-in imagegen
prompt: [hellscape-prompts-v1.json](assets/masters/hellscape-prompts-v1.json).

### Settlement landscape integration

Settlements now own a shared worked-ground and surroundings plan. Ground follows
building plots, the offset court, local lanes and a short dry entrance apron,
with feathered edges; the previous broad ellipse wash is removed. Building pads
use local soil/stone, and only a little source ground texture is reintroduced.
Plains/forest enclosure marks are broken remnants, not a continuous circular rim.

Before general terrain placement, each town gets up to eight deliberately placed
biome pieces: low stone banks, grass and scrub for plains; woodland backs and
fern/deadwood fringes for forests; volcanic scrub for islands; peat margins for
swamps; low rocky flanks for mountains. Smaller foreground pieces preserve roofs.
The entrance sector stays open. Every accepted piece must fit the dry biome mask
and avoid actual buildings, court, lanes and the apron. Placement can search
outwards or use the existing smaller variants; unsuitable pieces are omitted
whole, never sliced through a town. Existing generated kits supply this pass.

`terrainComposition.settlementEdges` reports accepted edge pieces by region.
Review seeds 1862 and 1873, labels off, close and overview zoom. Run
`node scripts/settlement-sites-test.mjs`, the terrain composition check, and the
browser LOD persistence check. Simulation state, RNG, schemas and replay are
untouched. This is an integration pass for the prototype, not new gameplay.

### Plains and forest terrain pass

Forest v5 replaces all twelve pieces using high-altitude canopy references.
Fine interlocking crown grain and short interstitial shadows describe dense
woodland; broad irregular cover and openings carry the geographic forms.
Visible trunks, large scalloped crowns and tall frontal forest walls are removed
because they made the prior pass read as a close-up grove. Density is retained;
height comes from subtle canopy shading and a narrow shaded edge at openings.
Core pieces import at 72px, connectors at 54px and low fringes at 32px.
Forest floor tiles are imported as lighter moss/khaki soil; canopy sprites use
a darker olive value range with softened highlights. These separate material
grades make dense tree cover darker than the openings, instead of light crowns
above a dark floor. Foundations, clearing textures and boundaries share the
corrected floor samples, while every forest sprite uses the canopy grade.
The floor is now slightly darker and canopy slightly lighter to narrow their
contrast. Forest repeat spacing is 18 canonical pixels rather than 32, with all
four core sources, a larger cover budget and more permissive dense-core joins.
The old repetition radius was the main blocker to filling woodland gaps.
`forestPlacement` tracks rejection reasons and `forestCoverage` samples actual
opaque canopy coverage per polygon; these values are independent of camera zoom.
It uses source alpha rather than the legacy cyan key. Dense patches accept more overlapping closed canopy;
clearings retain the lower fringe pieces and protected settlement approaches.
The same kit supplies coasts, boundary verges and settlement surroundings.
Source: `assets/masters/composable-forest-v5.png`; exact built-in imagegen prompt,
reference links and atlas packing notes:
[forest-prompts-v5.json](assets/masters/forest-prompts-v5.json).

Plains sprites receive material-aware warm ochre grading, with olive vegetation
kept distinct from soil and stone; no zone overlay or ground-frequency change.
All seven biome pairings involving plains or forest use current biome-specific
verges on each side, replacing the old mixed contact paintings. Each verge is
restricted to its own biome. Mountain pairs retain the custom ridge divide.
Coasts and settlement surroundings use the same current kits and colour grade.
Forest density fields now reserve closed-canopy pieces for dense cores, with
more placement candidates and deeper silhouette overlap there. Sparse fringe
pieces remain around openings; building, court and approach protection still
applies. `terrainComposition.forestCores` reports dense-core placements.

Twelve replacement pieces per biome now distinguish broad structures from fine
cover. Plains use low rolling ridges and grassy gullies along a curved interior
spine, with sparse heath, gravel and scrub between them. Forest spines use mixed
canopy and wooded slopes; lower-density areas choose feathered edges, young trees,
deadwood and fern clearings. Coasts select low banks and fringes. Neither biome
scatters the entire asset set indiscriminately. The generated source colours get
moderate value compression; plains stone highlights are softened further.

The generated masters depict distant terrain directly: v3 broad shallow plains
folds with fine scrub and drainage, and v5 forests with fine continuous canopy.
Plains widths are 64px (major masses), 48px (banks/edges) and 32px (small cover);
forest widths are 72/54/32px.
The new source detail carries the scale, rather than shrinking close-up paintings.
Ground and clearing/foundation texture sampling is restored to its original
frequency; the doubled texture frequency caused visible repetition. Plains–forest
boundaries use the new woodland fringes. Town edges use the new biome pieces,
sit closer to the plots and use up to eight pieces;
settlement buildings and the shared footprint stay at the approved scale.
Whole-footprint placement can fall back to 72% and 50% sizes around water and
settlements. Actual buildings, court and lanes are protected, with the unused
clearing fringe available for scenery, as in the island treatment. Zoom does not
change placement. Simulation state, RNG, schemas and replay remain untouched.

Built-in imagegen sources: `assets/masters/composable-plains-v3.png` and
`assets/masters/composable-forest-v5.png`. The plains prompt and previous import notes are in
[plains-forest-prompts-v3.json](assets/masters/plains-forest-prompts-v3.json).
The runtime art remains about 2.26 MiB; all replacement source edges pass extraction.
Review seeds 1862 and 1873 at Fit and close zoom, labels off. Run composition,
settlement-site and map-art checks plus browser LOD persistence.

### Volcanic island variations

`Islands: Basalt / Caldera` beneath Save map PNG switches two complete terrain
kits on the same geography and camera. The URL records `islandStyle=basalt`
(default) or `islandStyle=caldera`. Smooth texture filtering still defaults on;
mouse-wheel easing remains enabled with either texture filter.

Basalt uses charcoal extinct craters, broken flanks and sparse olive growth.
Caldera uses older reddish weathered rims with denser tropical canopy. Each has
12 generated pieces: two principal craters, six connected flank sections and four
vegetation/rubble pieces. One principal crater is attempted per connected island
group; if no whole footprint fits dry land outside towns, it is omitted. Craters
never enter the scatter pool. Flanks follow region axes; undergrowth uses the
existing seeded density field. Narrow beaches surround textured volcanic soil.
Basalt uses a selective value compression (lifted shadows, softer highlights),
while retaining leaf/rock hue differences and original alpha. Island pieces try
full size, then uniform 72% and 50% variants when the usable dry footprint rejects
the larger version. Sizes are chosen once at bake time, never from camera zoom.
Island settlement siting favours room for a neighbouring landform; relief respects
actual buildings, court and lanes instead of a full exclusion ellipse. Clearing
soil and building pads use volcanic tones and quieter sandy texture. Other biome
reservations are unchanged. Regression coverage includes compact placement and
protected buildings with an available irregular fringe.

Built-in imagegen masters are `assets/masters/composable-island-basalt-v1.png`
and `composable-island-caldera-v1.png`; exact prompts are in
[island-volcanic-prompts.json](assets/masters/island-volcanic-prompts.json).
Runtime pieces are 88px wide for craters, 64px for flanks and 52px for undergrowth.
The complete imported art is about 2.25 MiB, with 154 relief frames (152 usable).
Simulation state, RNG, schemas and replay remain untouched.

Review seeds 1873 (large cluster) and 1862 (small islands), at Fit and close zoom.
Run `node images/dark-fantasy/map-generation-prototype/terrain-composition-check.mjs`
and `npm run check:map-art` for deterministic placement and complete extraction.

### Label-free composition and wheel zoom

`Labels: On/Off` hides settlement, market and monster captions in map-art and
old-game-asset views. The choice persists in the URL as `siteLabels=0`.
`wheel-zoom.js` smooths wheel input over rendered frames, anchored to the cursor;
rapid notches accumulate and pointer dragging cancels the transition. This works
with either Nearest or smooth texture sampling. It never advances simulation time.
Check with `node scripts/map-wheel-zoom-test.mjs` and a mouse wheel in the map.

Town footprints remain 75%; the civic roof mass is larger, brighter/darker than
small houses, with a lighter offset court and stronger ground contact shadows.
The immediate clearing has quieter texture contrast. Review seed 1862 at Fit and
close zoom with Nearest and labels off; this is a composition test, not a claim
that the final icon-free overview readability has been settled.

### Integrated settlement sites

`settlement-sites.js` plans dry sites before large scenery placement. Sites reserve
space in their own region; mountain pieces and trees are rejected whole rather
than cut through buildings. The accepted 75% setting remains the default footprint.
Individual houses, halls, workshops and market buildings share terrain depth order.
Local lanes join a single planned entrance; mainland routes target that entrance
and avoid the civic centre. The route search retains terrain constraints but no
longer adds independent sine displacement to its samples. Broad bowed spans
restore winding character; the first/last 16 texels (scaled with map detail) remain
fixed. Whole bows are reduced or rejected if they meet water, town interiors or
impassable ground, rather than accepting scattered displaced pixels. Island villages remain
independent. Compact building groups surround an offset court and crescent lane,
with a larger hall/market, gate and broken biome-material enclosure. Ground-level
contact shadows anchor the buildings. Layouts have 13-19 pieces rather than two
sparse rows connected by a rectangular grid.
Swamps use dry ground between pools and timber paths, mountains use stone pads,
and other biomes use their existing ground materials. No imported town ground plate
or blanket biome tint is used. Layouts are seeded and independent of camera zoom.
Gold/teal overview markers retain identity when buildings become too small to read.

Thirty generated building pieces (six per biome) replace the whole-town/outskirts
runtime atlas. Masters and exact prompts are retained under `assets/masters/`;
`settlement-buildings-v1.webp` imports houses at 12px, paired houses/workshops/gates
at 14px and civic buildings at 34px. These sizes follow their world footprints,
roughly one source pixel per world unit at 75%, instead of giving tiny houses
32 pixels of miniature detail. Import compresses incidental building contrast while civic buildings retain stronger
light/dark separation, and preserves
soft alpha edges; original source masters stay untouched. Buildings now use the
same zoom detail floor as terrain. This is import-time preparation, not a scene
blur or a biome tint; perspective/light-direction changes still require source art.
The prior yellow coastal cliff scatter remains removed. Lairs retain their earlier
art; this pass changes settlements and neutral markets only.

Review seeds 1867 and 1869 at Fit and close zoom, including flips. Diagnostics are
in `mapWorkbench.pixelRendering.settlementArt`. Run `npm run check:map-art`,
`node scripts/settlement-sites-test.mjs`, and the zoom persistence check below.
Simulation state, RNG, schemas, authoritative replay and the live game are untouched.

### Custom ridge boundaries, bridge spans and peat banks

The current pass adds 12 directional ridge-boundary pieces, eight compact bridge
spans and eight plum-grey peat-bank profiles, generated with built-in imagegen.
The exact prompts and source names are in
[custom-boundary-prompts.json](assets/masters/custom-boundary-prompts.json).
Sources are preserved in `assets/masters/`; reduced imports total about 2.08 MiB.
The relief atlas now contains 130 frames, 128 usable, plus 40 bank profiles.

Shared mountain-region edges, including mountain/mountain pairs, use the custom
crests, bends, diagonal sections, saddles and passes. Those paths get placement
priority, use direction-specific candidates and keep their own crest anchor
through vertical reflection. Their crest pixels stay intact rather than being
cut by the generic terrain-division stencil. Rivers and ocean exclusions remain.

Bridges use one compact generated span fitted between actual dry-bank approaches,
replacing bright enlarged procedural piers. Pool banks sample the generated peat,
root, clay and reed profiles on both sides of the actual pool distance field;
they are not rectangular sprites placed beside a guessed shoreline. Quiet pool
depth washes retain the cycle-index planes. Ground peat/clay and neutral relief
are selectively graded toward smoky plum; golden rushes and wood retain colour.
Only actual sample-town approaches shape dry clearings, with a smooth field falloff
rather than mandatory circular holes at every region centre.

Inspect seed 1878 at Fit and close zoom, then 1869 reflected. Run the terrain,
wetland and crossing checks below. This changes disposable illustration only;
simulation state, RNG, schemas, region ownership, connectivity and replay remain
unchanged.

### Connected high ridges and open wetlands

Mountain and swamp relief now use version-2 source sheets in `assets/masters/`.
The 24 replacement pieces were generated with built-in imagegen; exact prompts
are saved in [ridge-wetland-prompts.json](assets/masters/ridge-wetland-prompts.json).
All 24 have complete extractable edges, bringing the relief library to 108 usable
pieces; only the two damaged contact fragments remain excluded. Runtime imports
remain capped at 118px; the packed art library now totals about 1.94 MiB.

Mountain regions receive a connected main-axis spine of serrated summits and
saddles. Geographic range paths use the same crests with a stronger overlap
requirement; low scree, valleys and foothills flank them rather than competing
as randomly scattered full-height peaks. Islands remain excluded from massifs.

Swamp interiors use sparse low reed banks, pools and deadwood rather than the
forest's dense canopy placement. A world-seeded ground field creates open peat
pools, textured margins and quiet water-ramp modulation. The pool's static depth
wash is respected even though its gameplay land mask remains unchanged. Site
approaches and border margins stay dry. This is presentation only; region shapes,
connectivity, simulation RNG, schemas and replay are unchanged.

Run `node images/dark-fantasy/map-generation-prototype/wetland-ground-check.mjs`
and `npm run check:map-art`. Review seeds 1869 and 1875 at Fit and close zoom,
then run the persistence check below.

### Illustrated divisions and complete crossings

Every shared region border, including same-biome borders, now receives a
continuous geographic treatment baked into the ground: woodland embankments,
peat drainage cuts, grassy gullies, rocky escarpments or coastal shelves.
An asymmetric lit lip, shaded core and variable textured slopes establish relief;
large terrain paintings feather away from the division instead of covering it.
Existing river pixels are preserved. Shared dry border outlines are removed;
selection highlighting remains an interaction aid. Underwater island divisions
use submerged shelves and broken reef crests, retaining the cycle-index planes.

Island relief uses half-size low coastal forms at a sparser density. Beaches and
cliffs follow the real shore-distance profile; raised sprite chains no longer
wrap every island into a ring of terraces. Full-height mountain-range paintings cannot occupy island terrain, and legacy
cliff footprints must stay in their owning biome. Source paintings remain unchanged.
Road crossings detect a complete river run and create a continuous timber deck,
cross-grain, rails, posts, shadow and stone abutments on both dry-bank approaches.

Run `node images/dark-fantasy/map-generation-prototype/terrain-divisions-check.mjs`
for continuous same-biome division coverage, protected rivers/ownership and full
bridge spans. Inspect seed 1875 at Fit and close zoom, then run the zoom persistence
check below. This changes disposable presentation only, not simulation or graph
connectivity. Ground-based divisions still need visual review across more seeds.

### Continuous terrain kit across all five biomes

The current pass uses imported ground materials under relief, not flat biome
colours carrying isolated terrain vignettes. `terrain-surfaces.js` samples a
world-anchored material grid and transition cases; `terrain-foundations.js`
extends textured substrate beneath relief. Foliage, stone and bark keep their
own asset colours. Dry and submerged banks use a shared profile, with the actual
land/water mask and distance fields determining the coastline rather than a
tile silhouette changing the approved geography. Bank styles follow local
ground material. Island contours without graph-edge IDs now receive coastal
composition; their inset direction is checked against actual land.

Asset budget: the public [OpenRA RA2 snow definition](https://github.com/OpenRA/ra2/blob/master/mods/ra2/tilesets/snow.yaml)
contains 475 template definitions, 678 listed image entries and 2,519 defined
subtiles in the examined file. Examples include 42 shore templates and 16-case
ground transition sets. These are counts of definitions/entries, not a claim
that each is a separately painted image. Our first full-biome target is:

| Imported terrain cases | Count | Source construction |
|---|---:|---|
| Ground variation | 80 | 16 painted swatches per biome |
| Biome contacts | 160 | 16 matching corner cases for each of 10 pairs |
| Shores | 235 | 47 valid neighbour patterns per biome |
| Rivers | 80 | 16 connection patterns per biome |
| Roads | 80 | 16 connection patterns per biome |
| **Total** | **635** | **Compiled cases, not 635 independent paintings** |

Five new ground sheets and five bank sheets provide 80 ground swatches and 40
bank profiles. Together with the 102 usable existing relief pieces this gives
222 painted material/relief fragments before recipe combinations. Road and river
connection masks are derived from the actual paths; material transitions preserve
the actual region ownership. The source kit stays in the same top-down/pictorial
map presentation rather than changing the game to an isometric RTS projection.

`npm run build:map-art` imports the paintings using Python, Pillow, numpy and
Node.js. Ground/case tiles are **32px**, bank profiles **64x32px**, and relief is
capped at **118px** on the canonical 2-design-unit pixel lattice. It explicitly
conforms opposite and shared ground/bank edges, packs WebP atlases, and preserves
the high-resolution source PNGs. `assets/runtime/` totals about **1.98 MiB** for
the terrain kit, banks, relief, legacy engraving, landmarks and manifests.
The browser downloads these reduced assets. Source masters and the superseded
large PNGs are excluded from Pages by `scripts/build-pages.mjs`. Existing live-game
comparison atlases are separate shared game assets and are not included in this
art-library size. This import format is ready for later game integration; the
live regional renderer remains unchanged.
Original-game comparison atlases load only when Old game is selected; the
default atlas view does not download them.

Generated source artwork and exact prompts are in
[assets/masters/surface-prompts.json](assets/masters/surface-prompts.json).
All ten new paintings used the built-in image-generation tool; source images
are original and RTS artwork was not copied.

`npm run check:map-art` checks the actual imported pixels: all 635 case records,
all five biome libraries, distinct ground variants, exact periodic/shared ground
edges, matching contact edges/corners, matching bank profiles, relief exclusion
metadata and runtime size. The state inspector reports selected cases by role,
ground-biome coverage and foundation coverage. Run the persistence check below
on seeds 1872, 1869 and 1873 with reflections. Inspect Fit and close zoom, island
coasts, rocky/peat/root banks, road/river junctions and settlement surroundings.
Water ramps remain static for this terrain review; categorical cycle indices
and depth/effect planes are preserved for the later animation pass.

### Connected terrain composition review

The current atlas uses geography-led compositions from a
[110-piece library](assets/README.md), with twelve pieces per
biome and five per biome pairing. Source forms include woodland walls, ridges,
gullies, reed banks, dunes, broken escarpments, gaps and end caps. Existing
charcoal background engraving and rocky shore accents remain.

`terrain-composition.js` follows shared borders, geographic ranges and coastal
corridors with variable spacing based on the actual painting dimensions. It
measures painted alpha overlap to connect adjacent pieces, searches around
difficult joins, limits overpainting and rejects nearby repetition of a source
image (including its mirror). Correlated two-dimensional density fields form
interior masses and clearings; there are no parallel interior rows or equal slots.
Footprints respect land, water, biome compatibility and mountain gorge exclusions.
Diagnostics report placements, verified joins, breaks and interior pieces.
This replaces the former semantic-port WFC experiment, whose labels did not
guarantee that painted shapes met. Source illustrations remain compositable
fragments, not seamless square tiles; a physically impossible join leaves a gap.

`terrain-frames.js` finds transparent row gutters and independent column gutters
per row instead of cropping a fixed grid with inset margins. Generated swamp
and river-bank pieces overrun nominal cells; fixed crops previously sliced
through solid artwork. Alpha bounds include translucent fringe and a small
transparent guard. A source-side edge audit excludes fragments with long solid
cutoffs that cannot be extracted whole. Currently eight source pieces are
excluded (six mountain fragments and two contact forks), leaving 102 usable
pieces. Their identities are shown in the renderer inspector; source PNGs are
preserved for replacement rather than painted over or globally blurred.

`composable-art.js` preserves separate foliage, bark, earth and rock colours.
It reads the pre-imported relief atlas; source cropping now runs offline.
Small asset-family channel grades adjust warmth and vegetation without mapping
the whole painting onto a biome ramp. Five-bit colour channels retain more
subtle variation than the previous four-bit reduction. Source alpha and softly
faded ground feet blend overlaps. Region membership never recolours illustrated
pixels; quieter earth palettes sit underneath the artwork. Dead hinterland
retains its separately authored charcoal variants.
Road masks cut passes through relief. Settlement ground treatments and
vegetation clearances remain. All placements belong to the canonical bake;
zoom changes sampling only. The approved Base structure view is unchanged.
Composed terrain reflects around its geographic centre, preserving its ground
footprint while the painted relief stays upright.
Simulation state, game RNG, schemas, replay and live-game rendering are untouched.
Ocean composition remains static pending the time-keyed palette review.

Validation: `node images/dark-fantasy/map-generation-prototype/terrain-composition-check.mjs`
checks painted overlap rather than bounding boxes, legal footprints, repetition
spacing, deterministic placement, exclusion of damaged fragments and preservation
of material hues. `node images/dark-fantasy/map-generation-prototype/terrain-frame-check.mjs`
reproduces oversized source pieces crossing nominal cells and checks intact
extraction. Review seeds 1869 and 1870 at close zoom for swamp/bank crop edges. Run the
browser persistence check below on seeds 1867, 1869 and 1873, including
reflections. Inspect Fit and close zoom, coastline clearance, mountain/river gaps,
the readable road network and site surroundings. New source sheets contain
110 nonempty alpha cells; their source PNGs total about 21 MiB, so this is still a
prototype art library rather than a mobile loading/performance sign-off.

Run `npm run preview:map`, then open
<http://localhost:5184/images/dark-fantasy/map-generation-prototype/>.
Also linked from **Development Lab → Prototypes → Regional map generation**.
Pages bundles this workbench separately. The live game never imports its generator
or renderer. Keep the study here until game integration is explicitly requested.

Question: do exact biome quotas, mild clustering, unequal areas and continuous
geographic border features make a readable, believable regional map?

The accepted structural reference is **seed 1867**, **Clustering 15%**, **Size
variation 85%**, **River + Range**, with ocean south + west. Border variation
appears to be **100%** in the supplied screenshot (full slider, obscured numeric
label). These are review settings, not new defaults. See the proposed
[pixel rendering and palette-cycling plan](../../../docs/regional-map-rendering-plan.md)
for how to build graphics on these structures. The static pixel study below is
the first implementation of that plan, isolated from gameplay.

The window uses the game's **2424 × 1080 Pixi design space**, scaled as one fixed
landscape scene. Its controls are Pixi, including seed, clustering, size variation,
border variation, feature combinations, reflections, region selection and PNG
export. The shared Fullscreen button requests landscape and supplies the existing
rotated fallback where browser orientation locking is unavailable.

- `?variant=C`: **Approved base structure**, with the original terrain markings,
  shared borders, islands, landforms and blended surroundings.
- `?variant=F`: **Dark fantasy atlas**, parchment and slate with engraved relief.

The **Base structure / Atlas rendering** buttons and bottom arrows switch between
these two views without regenerating the graph. The earlier region/skeleton,
Quiet and Textured comparisons are removed. Atlas is the default view; both
entries now default to seed 1867 with **Clustering 5%**, Size variation 85% and
Border variation 100%. Clustering moves in **2.5 percentage-point steps**,
allowing a choice between the earlier 0% and 15% settings. On seed 1867 these
produce 15, 18 and 21 shared-biome borders at 0%, 5% and 15%, respectively;
clustering is a bias, not a guaranteed percentage of shared borders. Explicit URL generation
settings still override them. The isolated generator's own defaults are unchanged.

### Dark fantasy atlas direction

F responds to the user's illustrated fantasy-atlas and Elden Ring map references:
warm aged ochres, olive woodland, grey peat wetlands, subtly reddish umber mountain relief
and muted slate-green water. The references
guide composition and palette; their artwork is not copied into the renderer.
The current hybrid pass uses a generated transparent engraving sheet, curated
into twelve source frames by `illustrated-art.js`. Large massifs and woodland
masses, medium copses and foothills, and small trees/outcrops provide a hierarchy
of forms. Runtime resampling places them on the same world pixel lattice; a
compact colour palette retains the illustrated hatching. `atlas-art.js` still
supplies procedural site icons and reed accents. Generated source art and the
exact built-in generation prompt are recorded in [assets/README.md](assets/README.md).
Source PNGs are unchanged; cropping, palette reduction and selective material
grading happen during asset preparation. Illustrated pixels retain their own
colours across region boundaries. Geographic ranges and shared borders guide
overlapping groups; irregular density fields compose region interiors. These
placements are rendering data; feature routes, region shapes and gameplay graph
are unchanged.
Footpoints and sampled silhouettes respect coast, river and valley exclusions;
opaque pixels must fit dry land. Groups fall back to compact art where needed.
Woodlands form irregular patches and clearings rather than repeating one tree.
Trees and sites share one nearest-sampled sprite atlas. Relief uses a cached
per-map atlas: each texel retains its asset colour, while ground masks clip
roads and water. Rock stays rock-coloured across woodland and peat; dead
hinterland uses separate charcoal art. Foothills have softened feet. Ordinary plains hills
must fit entirely within plains; range foothills may follow other terrain. Rendered silhouettes vary while
the accepted footprint, biome quotas and graph remain unchanged.

The atlas sea uses a depth wash with 32 stationary shades and sparse broken
surface highlights instead of cartographic contour rings. The original separate
ocean/river/foam index ranges remain available. Water remains still in this
review. The broad bright coastal rim is reduced to a narrow umber bank, sparse
shore foam and short coast-normal hachures: longer cliff marks on rocky shores,
shorter sand marks elsewhere. These follow the actual land mask, including
island land, independently of game-zone edges. Region divisions use sepia ink
above terrain stamps, including equal-biome neighbours; water-rich Island
regions use lighter broken lines so their zone extent does not read as a coast.
Unplayable land uses black/grey badlands, dead scrub, peat marsh and ash highlands;
these are visual treatments of the existing background field. A separate,
smoothly sampled static cloud texture sits above those stamps, clearing a margin
around playable regions. **Hinterland fog** toggles it without rebaking; `fog=0`
shares the clear view. The overlay adds about 0.8 MiB at Detail, 1.1 MiB at Fine, 0.5 MiB at Coarse.
It has no wall-clock animation. Later fog motion should sample the same absolute
viewed time as water, outside the ground bake. Opaque glyph pixels
must fit dry ground, and crags respect the existing river/coast exclusion rules.

Pixel rendering is **static**, including water. `pixel-terrain.js` rasterizes the
accepted geography on one world lattice and bakes the ground into a nearest-
sampled, unmipmapped texture. **Fine** is the default. **Detail** uses 2 design units per source texel, twice the
linear resolution of **Fine** (4); **Coarse** uses 6. Detail samples the
generated engravings at double resolution while preserving their world sizes. Coastlines receive
broken cliff strata, beach stipple and lit shore stones along the land mask.
The detailed ground covers the playable map plus a generous hinterland
(normalized -1.5 to 2.5), backed by a distant 8-unit bake for unrestricted pan.
Its main texture is 3152 by 1032, below a 4096-pixel texture limit; the main
RGBA texture uses about 12.4 MiB plus 4.4 MiB for the distant backdrop.
Choose Detail/Fine/Coarse with **Pixels**, or share `texel=2`, `4` or `6`. Pixel size and sprite scale are fixed across region areas.
Generated terrain engravings and remaining procedural glyphs provide trees, crags, hills,
reeds, stones and placeholder towns/ruins. Three candidate sites and connecting roads are visual readability samples,
with no gameplay meaning. `roads.js` routes over the baked playable land lattice,
preferring easier terrain and short river crossings. Ocean-separated sites stay
disconnected. Routes relax grid corners and gain bounded gentle bends, checking each
replacement segment against dry land. Warm pale road centres, softened dark
verges and broken wheel marks render above terrain and region divisions but
below sites; vegetation clears their corridor and relief
opens into passes. River crossings receive bridge planks and keep their crossing anchors.
Riverbanks use local terrain shades and riparian marks. Rocky shore sections
receive stratified strokes and illustrated outcrops; soft shores retain beach
stipple. Woodland transitions gain a broken fringe beneath tree groups.
Rendering diagnostics expose bridge, mountain-pass, gorge, estuary, rocky/soft
shore and woodland-fringe classifications. These are shared treatments, not an
exhaustive asset for every possible terrain combination. Routing and
road textures rebuild only with the terrain bake, never during camera movement. **Sites + roads** toggles them.
Opaque sprite pixels must fit dry ground; reflections reposition upright props
and omit props whose reflected silhouette would overhang water. Ground patterns
and geographical features mirror together. Ordinary gameplay picking still uses
the unchanged polygons, with a normal-resolution selection highlight.
The drawing buffer follows the displayed physical size to avoid an extra CSS
resampling pass; chrome text retains its own higher-resolution textures. PNG
export still produces the complete 2424 x 1080 design frame.

Canonical static bakes are cached; site changes bake as needed, while density,
selection, camera gestures and reflections reuse the current textures. The state
disclosure reports grid dimensions, source texel size, texture/index-plane memory,
prop counts and desktop bake duration. The static bake retains explicit ocean
indices 1–8, river indices 16–23 and foam indices 32–35 for the subsequent palette
cycling experiment. There is no animation clock or palette shader in this pass.
The Atlas uses stationary depth indices 64–95,
so a future cycle need not pulse the ocean's entire background colour.
Do not run the encoded index plane through ordinary atlas colour quantization.

Review at **844 x 390** landscape, fullscreen, Fit and close zoom, using seeds
1867 and 1873 and some variation extremes. Compare the Atlas with the approved
base structure; inspect biome distinction, shore steps, narrow rivers, cleared
mountain water gaps and visual room for gameplay overlays. Phone-shaped browser
review is not a physical-device performance measurement.

The bottom arrows or keyboard Left/Right switch views without regenerating.
Settings are shareable URL parameters; no browser storage or player save is used.
Twenty weighted Voronoi regions receive the five biomes, randomly assigned the
exact counts **6, 5, 4, 3, 2**. Count and playable area are separately reported.
Clustering favours equal-biome neighbours, with weak coastal/wet/ridge preferences.
The footprint grows twenty connected cells from a larger weighted Voronoi
tessellation. A seeded angular preference produces bays and headlands at whole
region scale, with no enclosed gaps. Regions retain their broad, convex base
shapes; there is no global warp or stretching. Site jitter gives organic variety
even at zero Size variation; the size control varies cell weights independently.
Border variation adds bounded fine detail to shared edges.
Shared borders are generated once and reused for terrain masks and selection.
Landform routes traverse several shared edges; river, mountain range, chasm and
valley treatments are decorative. This is not elevation, hydrology or climate
simulation. Connected Islands regions share a cluster-wide land field: region
centres have organic land cores joined across shared edges, with a continuous
coastline and occasional lagoons. Region divisions and graph neighbours remain
intact. Each seed chooses **one ocean world side or two adjacent sides sharing a
corner**. Only those sides host surrounding ocean, regardless of the boundary
biomes. The four sides are continuous arcs of the actual outer boundary, divided
at supporting diagonal corners. Long headlands can therefore have ocean on one
face and hinterland on the other, instead of their position assigning ocean to
every edge of the projection. The coastal arcs feed river routing, coastal
landforms and background blending together. Islands meeting a land side remain
water-rich regions beside hinterland.
Other sides blend four uninhabitable terrain types: **badlands, scrub, marsh and
highlands**. A continuous seeded terrain field uses nearby boundary biomes and
landform endpoints as influences; it has no radial wedges or hard type borders.
Rivers are directed toward the chosen ocean and stop at the shoreline. Both
river and mountain artwork are clipped to land, including island shorelines
and lagoons. On inland sides, short curved creeks taper into wetland fringes;
other landforms influence surrounding terrain instead of extending as lines
to nowhere. The field is baked into cached Pixi textures once per generated map;
selection, reflections and camera gestures reuse it. Water crossings and
impassability remain visual suggestions, with no simulation rules attached.

A geographic interaction pass gives rivers and ranges a shared interpretation.
Rivers route through a connected inland edge network, with coastal stretches
pulled inward to leave land between the channel and shore. A continuous dry
course is retained; it terminates at water instead of reappearing beyond an
inlet. Headwaters start narrow and widen downstream. Flat mouths widen into
small estuaries; rocky shores use narrower mouths. Mountains crossing rivers
leave water gaps with rocky banks; parallel stretches form valleys with peaks
on their flanks. Both range symbols and ordinary mountain-biome symbols respect
the river corridors. Coastal ranges sit inland, and rocky shorelines receive
cliff hachures. All landform artwork is clipped to actual land, so offshore peaks
require generated island land. Region polygons, graph adjacency and biome quotas
remain independent of these decorative paths. The state disclosure reports
interaction counts for comparing seeds and views.

Drag to pan, scroll or pinch to zoom, or use the in-canvas − / + controls. **Fit**
returns to the overview of the irregular playable footprint. Map artwork,
markers, selection and geographic features share the existing game camera's
transform; the generator controls and other chrome stay fixed. Camera gestures
never regenerate or mutate the graph.

Reflections affect only the displayed map; identities, adjacency, biome counts,
areas and features remain identical. Labels and symbols stay upright. The isolated
generator uses a local seeded `state.rng` via the existing RNG helper. Live
simulation state, RNG streams, schemas, replay, definitions and saves are untouched.

`window.mapWorkbench` exposes the current map, controls, screen-space Pixi targets
and PNG export for inspection. Validate quota counts, seed reproducibility,
symmetric connected adjacency, area coverage, continuous feature routes, island
cores belonging to their shared landmass, the one/two-adjacent-side ocean rule,
continuous coastline arcs and hinterland beneath seed 1873's western projection,
finite normalized terrain blends, bounded inland creeks, rivers stopping at
ocean/island shores, continuous inland courses, cleared peak corridors, valley
flanks, estuaries and rocky coasts, and finite noncrossing region-scale shapes;
review generation controls, tap
selection before/after pan and zoom, drag-versus-tap, pinch, Fit, views, URL refresh, reflections, PNG,
fullscreen and fixed aspect ratio at desktop and 844 × 390 phone landscape.
`npm run verify` covers packaging and the unchanged game invariants.

### Coastal and woodland refinement

Fine is the default review density. Woodland stamps compress many crowns into
canopy masses, with smaller groups around their edges; islands use low scrub
and small rocks. Roads use thinner verges and broader, land-checked bends;
rivers have narrower banks and channels. The static water bake separates foam
(32–35), broken surf (40–47), shallow ripples (48–55) and stationary shoals
(96–111). These are source structures for the later time-keyed palette pass,
not animated effects yet. Review seeds 1867 and 1873 at Fine and phone landscape.

### Live game landmark review

Sites cycles between **Map art**, **Old game**, **Sketch**, and **Off**. Old game
preserves the original comparison: two player hamlets, one teal neutral market (where the sample towns fit),
and up to two monster lairs with local scorched ground. Assets come directly
from the game's existing packed chronicle and region-landmark atlases. The hamlet
is frozen at frame zero for this static review. Existing game art is preserved.
**Landmarks** cycles 75%, 100%, and 125% scale. Review pan,
zoom, reflections, biome contrast and marker/road clearance on seeds 1867 and
1873. Monster candidates must fit their region and avoid roads; missing viable
sites are omitted. Fixtures illustrate placement, not a generated game state.
Share `siteArt=live&actorScale=1` or `siteArt=sketch` in the URL.

### Smooth zoom and adaptive illustration

Map art is now the default. The new [generated landmark atlas](assets/README.md)
provides close illustrations and overview emblems for settlements, markets and lairs.
Regional versions now reduce the close composition, preserving individual buildings.
They share a lower-centre ground anchor and a comparable 116-unit footprint.
Regional art has 48 source pixels across; close art has 96; strategic emblems
have 20 and retain an 18–24 CSS-pixel footprint. Gold roofs, teal awnings and
ivory horns/rust flags distinguish gameplay kinds. Vegetation clears around sites.

**Detail** cycles Auto, Close, Regional and Overview. Auto uses projected CSS
size: strategic/regional fade at 14–22px, regional/close at 54–68px. Terrain uses one canonical 2-unit bake. Fine/Coarse select reductions of
that artwork, relaxing to full detail at 0.40?0.68 CSS pixels per design unit.
Forests, relief, roads and coastal features therefore retain their world positions;
camera movement never bakes terrain, regenerates geography or consumes RNG.
LOD is sampled directly from camera/display scale; returning to a zoom restores
the same representation. Reflections preserve fixture identities.

**Pixels: Smooth zoom / Nearest** compares sampling. `zoom-art.js` builds
independent colour-frame reduction levels, blends adjacent reductions on shrink,
and uses sharp texel-edge filtering on enlargement. Separate frame textures avoid
atlas bleed and power-of-two restrictions. Offscreen meshes are skipped. This is a prototype mesh renderer, not a mobile GPU
performance sign-off. The state inspector reports prefilter memory and mesh counts.

Overview roads, rivers and internal borders get restrained screen-width ink.
Labels fade before tiny versions become cluttered. Source water indices remain
untouched: only resolved RGBA colours enter this filtering path. Future cycling
must resolve palette colours before filtering, or use authored categorical LODs.
Water/fog and landmarks remain static in this review; no simulation ticks are added.

Share `siteArt=atlas&smoothZoom=1&detailMode=auto`. Inspect seeds 1867/1873,
0.35–2.5 camera zoom, phone fullscreen, both reflections, forced detail, nearest
comparison, sites off/on, Base/Atlas and repeat PNG exports. `mapWorkbench.setCamera`
is a review hook. All changes remain in the disposable prototype.

Regression: in the workbench browser console, run
`await (await import(new URL("./lod-persistence-check.js", location.href))).verifyTerrainPersistence()`.
It compares a fixed landscape crop across forced regional/close detail, then
checks a round trip through automatic zoom. The original bug changed 318,512
of 450,000 pixels on seed 1867; the corrected forced-mode comparison changes zero.


### Terrain contact and water composition study

The current atlas adds biome-specific contact treatments, retaining one canonical
landscape across all zoom levels. `terrain-interactions.js` owns the material
profiles and static ocean composition; `settlement-ground.js` draws clipped site
outskirts. These are provisional illustrated treatments, not hydrology or gameplay.

| Material | Coast and river | Roads and settlement surroundings |
|---|---|---|
| Plains | Sandy banks, wider broken beaches | Ochre tracks, tilled plots and approach paths |
| Forest | Dark organic banks, narrow shores | Muted tracks, clearing edges and cut timber |
| Islands | Pale beaches and shallow shoals | Sandy paths and small cultivated plots |
| Swamp | Sheltered ripples, fading sediment and peat margins | Narrow timber walkways, drainage pools |
| Mountains | Stony banks and scree transitions | Rock-coloured tracks, retaining walls and terraces |

Adjacent ground materials blend through narrow irregular transition zones.
Illustrated feet fade into the ground without zone tinting; polygon divisions remain visible
above the composition. Lairs use rubble and worn approaches. Site ground marks
respect the owning polygon and canonical water mask. The close/regional landmark
illustrations still share one composition; overview emblems intentionally abstract it.

The sea now combines directional warped swells, smaller oblique ripple packets,
localized breaking surf, quiet depth washes and sheltered coastal water. Dedicated
phase indices use 128-159 for swell, 160-191 for foam, and 208-239 for small ripples.
Static RGB `waterBase` and byte `waterStrength` retain depth/sediment and effect
amplitude separately from phase. These additional CPU planes total five bytes per
pixel beyond the index plane; the inspector reports all six as `waterFieldMiB`.
Only resolved colour is filtered for zoom. Water is still static: the proposed
ramps need an actual forward/backward animation review before acceptance.

Reference: [Ferrari's explanation](https://www.effectgames.com/effect/article-Q_A_with_Mark_J_Ferrari.html)
of arranging and masking moving colour bands, and the
[Canvas Cycle demo](https://www.effectgames.com/demos/canvascycle/).
The reference art is not used as a texture. Review at Fit and close zoom on seeds
1867 and 1873, inspecting forest/plains and swamp/mountain contacts, swamp coast,
beaches, boardwalks, retaining walls and the unchanged zoom-persistence check.
