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
for how to build graphics on these structures; no pixel renderer is implemented
by that proposal.

The window uses the game's **2424 × 1080 Pixi design space**, scaled as one fixed
landscape scene. Its controls are Pixi, including seed, clustering, size variation,
border variation, feature combinations, reflections, region selection and PNG
export. The shared Fullscreen button requests landscape and supplies the existing
rotated fallback where browser orientation locking is unavailable.

- `?variant=A`: the region partition, references and biome labels.
- `?variant=B`: shared organic borders and the connected geographic skeleton.
- `?variant=C`: terrain markings, subdued same-biome borders and landforms.

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
