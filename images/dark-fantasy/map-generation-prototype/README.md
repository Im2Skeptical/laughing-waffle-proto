# Map generation Pixi workbench (disposable prototype)

Run `npm run preview:map`, then open
<http://localhost:5184/images/dark-fantasy/map-generation-prototype/>.
Also linked from **Development Lab → Prototypes → Regional map generation**.
Pages bundles this workbench separately. The live game never imports its generator
or renderer. Keep the study here until game integration is explicitly requested.

Question: do exact biome quotas, mild clustering, unequal areas and continuous
geographic border features make a readable, believable regional map?

The window uses the game's **2424 × 1080 Pixi design space**, scaled as one fixed
landscape scene. Its controls are Pixi, including seed, clustering, size variation,
border variation, feature combinations, reflections, region selection and PNG
export. The shared Fullscreen button requests landscape and supplies the existing
rotated fallback where browser orientation locking is unavailable.

- `?variant=A`: straight polygons, region references and biome labels.
- `?variant=B`: shared organic borders and the connected geographic skeleton.
- `?variant=C`: terrain markings, subdued same-biome borders and landforms.

The bottom arrows or keyboard Left/Right switch views without regenerating.
Settings are shareable URL parameters; no browser storage or player save is used.
Twenty weighted Voronoi regions receive the five biomes, randomly assigned the
exact counts **6, 5, 4, 3, 2**. Count and land area are separately reported.
Clustering favours equal-biome neighbours, with weak coastal/wet/ridge preferences.
Shared borders are generated once and reused for terrain masks and selection.
Landform routes traverse several shared edges; river, mountain range, chasm and
valley treatments are decorative. This is not elevation, hydrology or climate
simulation. Islands are water-rich graph regions containing decorative islets;
separated land masses and water-crossing rules remain an open design question.

Reflections affect only the displayed map; identities, adjacency, biome counts,
areas and features remain identical. Labels and symbols stay upright. The isolated
generator uses a local seeded `state.rng` via the existing RNG helper. Live
simulation state, RNG streams, schemas, replay, definitions and saves are untouched.

`window.mapWorkbench` exposes the current map, controls, screen-space Pixi targets
and PNG export for inspection. Validate quota counts, seed reproducibility,
symmetric connected adjacency, area coverage and continuous feature routes;
review generation controls, tap selection, views, URL refresh, reflections, PNG,
fullscreen and fixed aspect ratio at desktop and 844 × 390 phone landscape.
`npm run verify` covers packaging and the unchanged game invariants.
