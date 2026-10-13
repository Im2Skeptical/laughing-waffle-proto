# Map generation Pixi workbench (disposable prototype)

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

- `?variant=A`: the region partition, references and biome labels.
- `?variant=B`: shared organic borders and the connected geographic skeleton.
- `?variant=C`: terrain markings, subdued same-biome borders and landforms.
- `?variant=D`: pixel **Quiet ground**, broad colour clusters and sparse details.
- `?variant=E`: pixel **Textured ground**, authored grass/stone/pool patterns.
- `?variant=F`: **Dark fantasy atlas**, parchment and slate with engraved relief.

The **Geography / Pixel rendering** tabs switch between the two studies. Bottom
arrows cycle A/B/C within Geography and D/E/F within Pixel rendering. Direct Quiet,
Textured and Atlas buttons compare the treatments on the same graph. Entering
via D/E/F defaults to the seed-1867 reference settings above. Existing C URLs and
the generator's defaults are retained.

### Dark fantasy atlas direction

F responds to the user's illustrated fantasy-atlas and Elden Ring map references:
warm aged ochres, olive woodland, grey peat wetlands, umber mountain relief
and muted slate-green water. The references
guide composition and palette; their artwork is not copied into the renderer.
`atlas-art.js` supplies **38 original pixel engravings**: eighteen asymmetric massifs,
five low hills, eight mixed woodland copses, three bare trees, three ruined sites
and a reed stamp, plus **27 ash-grey variants** for the dead hinterland. Twelve
large 42–51 by 28–32 texel massifs compose three or four overlapping peaks;
six compact 28 by 22 texel groups fit cramped land. Open irregular feet, broken
ridge strokes, warm light faces and umber hatching replace closed triangular
stickers and white caps. Rounded 7–8 texel hills sit on their flanks.
Mountain regions follow winding visual spines along each region's long axis,
joined through shared borders to neighbouring mountain regions. The geographic
range supplies an additional spine. Groups overlap along these paths rather
than scattering independently across a grid. The spines are rendering data;
the generated feature routes, region shapes and gameplay graph are unchanged.
Footpoints and sampled silhouettes respect coast, river and valley exclusions;
opaque pixels must fit dry land. Groups fall back to compact art where needed.
woodlands form irregular patches and clearings rather than repeating one tree.
All art shares one nearest-sampled sprite atlas. Rendered silhouettes vary while
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
shares the clear view. The overlay adds about 1.1 MiB at Fine, 0.5 MiB at Coarse.
It has no wall-clock animation. Later fog motion should sample the same absolute
viewed time as water, outside the ground bake. Opaque glyph pixels
must fit dry ground, and crags respect the existing river/coast exclusion rules.

Pixel rendering is **static**, including water. `pixel-terrain.js` rasterizes the
accepted geography on one world lattice and bakes the ground into a nearest-
sampled, unmipmapped texture. **Fine** uses 4 design units per source texel;
**Coarse** uses 6. Pixel size and sprite scale are fixed across region areas.
Separate original pixel matrices and engravings provide trees, crags, hills,
reeds, stones and placeholder towns/ruins. Three candidate sites and a few road strokes are visual
readability samples, with no gameplay meaning. **Sites + roads** toggles them.
Opaque sprite pixels must fit dry ground; reflections reposition upright props
and omit props whose reflected silhouette would overhang water. Ground patterns
and geographical features mirror together. Ordinary gameplay picking still uses
the unchanged polygons, with a normal-resolution selection highlight.
The drawing buffer follows the displayed physical size to avoid an extra CSS
resampling pass; chrome text retains its own higher-resolution textures. PNG
export still produces the complete 2424 x 1080 design frame.

Two static bakes are cached; style/density/site changes bake as needed, while
selection, camera gestures and reflections reuse the current textures. The state
disclosure reports grid dimensions, source texel size, texture/index-plane memory,
prop counts and desktop bake duration. The static bake retains explicit ocean
indices 1–8, river indices 16–23 and foam indices 32–35 for the subsequent palette
cycling experiment. There is no animation clock or palette shader in this pass.
Deep-water index 9 is stationary in D/E; F uses stationary depth indices 64–95,
so a future cycle need not pulse the ocean's entire background colour.
Do not run the encoded index plane through ordinary atlas colour quantization.

Review at **844 x 390** landscape, fullscreen, Fit and close zoom, using seeds
1867 and 1873 and some variation extremes. Compare D/E with the same pixel size
and site setting; inspect biome distinction, shore steps, narrow rivers, cleared
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
