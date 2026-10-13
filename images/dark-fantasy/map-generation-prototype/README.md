# Map generation Pixi workbench (disposable prototype)

### Connected terrain composition review

The current atlas replaces playable-area stamp scatter with geography-led
chains. A new [110-piece library](assets/README.md) contains twelve pieces per
biome and five per biome pairing. Source forms include woodland walls, ridges,
gullies, reed banks, dunes, broken escarpments, gaps and end caps. Existing
charcoal background engraving and rocky shore accents remain.

`terrain-collapse.js` uses a simple tiled Wave Function Collapse model along
shared borders, long geographic features, inland coastal corridors and each
region's principal axis. Legal domains respect the actual land/water mask and
mountain gorge exclusions. Earlier corridors constrain later domains before
collapse; pieces are never removed afterward to resolve collisions. The solver
propagates matching ports, chooses low-entropy cells using seeded weights and
backtracks when necessary. Diagnostics report placements, gaps and contradictions.
This is a path model, not a full two-dimensional overlapping tile solver;
branch-shaped artwork is decorative rather than an additional solved branch.
Generated art does not guarantee pixel-perfect seams.

Terrain colour samples the owning material per pixel, allowing contact pieces
to span a biome division without carrying an unrelated yellow ground patch.
Road masks cut passes through relief. Existing settlement ground treatments and
vegetation clearances remain. All placements belong to the canonical bake;
zoom changes sampling only. The approved Base structure view is unchanged.
Simulation state, game RNG, schemas, replay and live-game rendering are untouched.
Ocean composition remains static pending the time-keyed palette review.

Validation: `node images/dark-fantasy/map-generation-prototype/terrain-collapse-check.mjs`
checks deterministic connected corridors, masked gaps and contradictions across
80 seeds. Run the browser persistence check below on seeds 1867 and 1873, including
reflections. Inspect Fit and close zoom, coastline clearance, mountain/river gaps,
the readable road network and site surroundings. New source sheets contain
110 nonempty alpha cells; their source PNGs total about 21 MiB, so this is still a
prototype art library rather than a mobile loading/performance sign-off.

Algorithm reference: [WaveFunctionCollapse's simple tiled model](https://github.com/mxgmn/WaveFunctionCollapse).

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
The source PNG is unchanged; cropping, palette reduction and biome shading are
part of the renderer. Mountain, hill, marsh and cliff engravings take the colour
of the ground beneath each pixel, with charcoal treatment in dead hinterland.
Mountain regions follow winding visual spines along each region's long axis,
joined through shared borders to neighbouring mountain regions. The geographic
range supplies an additional spine. Groups overlap along these paths rather
than scattering independently across a grid. The spines are rendering data;
the generated feature routes, region shapes and gameplay graph are unchanged.
Footpoints and sampled silhouettes respect coast, river and valley exclusions;
opaque pixels must fit dry land. Groups fall back to compact art where needed.
Woodlands form irregular patches and clearings rather than repeating one tree.
Trees and sites share one nearest-sampled sprite atlas. Relief uses a cached
per-map atlas: each opaque texel samples its local biome, including across
borders and after reflections. Mountains retain reddish umber on mountain
ground; ranges over woodland, peat and dead hinterland inherit those colours.
Foothills use ground-matched bodies and softened feet. Ordinary plains hills
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

Adjacent materials blend through narrow irregular transition zones. Mountain
relief feet fade into local ground; the original polygon divisions remain visible
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
