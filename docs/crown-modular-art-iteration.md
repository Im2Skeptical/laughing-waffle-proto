# Crown modular map art — iteration

Question: can a dense, region-spanning city at the established settlement
architectural scale carry the enemy cards' class identity and fit the live terrain?

## Agreed direction

- Use the current enemy illustration brief, including class-specific structural
  patron grammar and inhabited corpse-built architecture. Decay is secondary.
- Capital fabric fills suitable land with no substantial arbitrary gaps and may
  spill slightly over dry regional borders. Follow terrain, channels and existing
  roads; preserve water, geometry, connections, borders, hit areas and readouts.
- Inhabited core, increasingly ruined outskirts.
- Architecture stays fixed on capture. At most small flag, decoration or material
  palette changes; the city is not replaced with a player village.
- Ultimately support Warlord, Merchant, Priest and Philosopher capital/province
  kits. This first local iteration proves Warlord composition before generating
  the other class families. No new class gameplay or population balance.

## References and interpretation

The current source is `images/dark-fantasy/full-map-chaos-prototype/README.md`
and the current illustration guidelines in `settlement-pieces-v4/README.md`.
Earlier palette and patron studies preserve superseded trials.

Warlord: red/teal rigid spear-prongs bound by a band; Merchant: green/copper
hooked grasp and enclosed disc; Priest: warm yellow/pink empty solar ring and
falling rays; Philosopher: blue/gold folded book planes and hooked binding spine.
Patron names remain provisional. Local colour belongs to material, never a
whole-map tint. Map modules use the existing overhead view and building scale;
card aspect ratios, foreground walls and overlay-safe card staging do not apply.

## Iteration boundaries

Built-in imagegen produces isolated pieces, not a region painting. Ground and
paths come from the shared settlement/terrain machinery. Whole-footprint dry
checks and protected road corridors govern placement; pieces are omitted whole
where unsafe, never clipped into place. No simulation state, RNG, schema,
authoritative geometry or replay changes.

Temporary development selection stays outside the evaluated game UI. Before/after
review uses the real game on desktop and phone landscape. All numbers and the
visual candidate remain provisional. No push, PR, merge or settle without Cam.

## First local candidate

The bound branch includes accepted baseline PR86 and main through e67c6240
(v1.1.58). PR84 remains separate; no changes were made to its branch or checkout.
Actual integration touches the shared regional presentation and terrain modules;
the map orchestrator, fixed readout module and world-map README are untouched.

One 20-piece Warlord sheet supplies small houses, civic wings, towers, walls,
gates, arcades and ruin fragments. The reduced atlas is 19KiB. Source/prompt:
`images/dark-fantasy/crown-modular-v1/`. Import uses the existing alpha-gutter
parser and writes into the established runtime atlas directory.

The local URL query `crownArt=baseline` restores the fitted kit for comparison.
The default in this isolated checkout is the modular candidate. No screenshot
or technical pass constitutes Cam's aesthetic approval.

Technical prototype limitation: initial province identity is read from the
seeded, persistent `Remnant Province` site label; capital identity uses the
existing saved remnant capital. This avoids a speculative schema change in an
art experiment. A future general four-class art-origin representation must be
agreed before promotion; it must survive capture independently of current
holder and installed/replaced institutions. Current original province labels
survive capture. No gameplay uses this view-only interpretation.

Focused test: `node scripts/crown-modular-test.mjs`. It checks dense small plots,
complete dry sprite rectangles, dry border spill, preserved road corridors,
unchanged other anchors and water, remote worked-ground painting and fixed
identity across capture for three ordinary starts. Existing settlement-site
tests retain all five biome and narrow-island coverage. Browser capture:
`node scripts/crown-modular-browser-probe.mjs --before` then without `--before`,
using this checkout's `PROBE_URL` when its local preview port differs.

## Second iteration direction — Cam

Combine all three improvements: preserve the building scale, make the city
denser and more continuous, and rework the overall composition around connected
fortress wings and a stronger three-prong capital silhouette. Provinces use a
simpler connected form. Keep the agreed terrain, water, road, readout and
capture constraints. No new gameplay or publishing approval is implied.

First-iteration captures and planner source are retained locally in
`artifacts/crown-modular/iteration-1/` for direct comparison.

The supplementary source `warlord-links-v2.png` contains 16 isolated blades,
gallery sections, junctions, gate/court wings and ruins. Its exact built-in
imagegen prompt is `links-v2-prompts.json`. The original source is unchanged;
the combined runtime atlas has 36 complete frames at approximately 36KiB.

The city plan now starts with joined gallery compounds: three capital arms and
a binding cross-gallery, or a shorter paired provincial court. Separate narrow
blade modules form the prongs. They use the ordinary door/window scale rather
than enlarging a central castle. Multiple attached courtyard wards structure
denser infill. Whole modules terminate where terrain is unsafe; nothing is
stretched or cropped into a gap. Ruin probability increases at the fringe while
inhabited fabric stays dominant. Capture keeps the plan and permits only a
muted tint on the central blade.

The focused test additionally checks all 36 alpha-separated frames, the three
separate capital blades, joined-compound locality without stretched modules,
and multiple connected wards, alongside the first iteration's constraints.
Second-iteration desktop/phone evidence uses
`artifacts/crown-modular/iteration-2/`.

Second-iteration verification passed: full `npm run verify`, final build/preview
checks, the focused planner/atlas test, and the regional presentation probe's
capture, monster, road, camera and exact-restoration cases. Real game captures
at 1440x900 and 844x390 reported zero page errors. The rendered-role check confirms
three capital blades and two provincial blades survive production culling;
readout geometry matches iteration one within 1e-6 and all nine fixture roads
remain. Recheck saved evidence with
`node scripts/crown-modular-render-checks.mjs iteration-2 iteration-1`.
These are technical checks on a local candidate, not Cam's aesthetic approval.

## Third iteration direction — Cam

Continuous urban fabric should be concentrated in the capital region with only
a slight fringe in neighbours. The preceding full-region province fill made
the urban area spread too far. Provinces should remain distinct, smaller focal
settlements in their own landscape.

The capital needs a dominant, monumental central structure. Cam's reference is
the tiered fantasy citadel hierarchy of Minas Tirith (and a similar Game of
Thrones image), rather than the preceding scattered small blade towers. Build
one recognisable terraced fortress from joining sections. Keep surrounding
houses and architectural details at the established scale. The earlier ban on
a region-sized pasted painting still applies; the newly requested central
structure is deliberately monumental through connected walls, courts and height.

Current main through 7c8f084c (v1.1.59) is merged locally for its UI/readability
baseline. Its existing Force, Unrest and population changes are inherited as-is;
this art iteration authors no gameplay rules. The merge was conflict-free after
local checkpoint c6b129eb. No other checkout or branch was changed.

The third sheet adds eight isolated terraced-fortress sections, bringing the
runtime atlas to 44 frames (62KiB). Whole full, tighter and compact assemblies
are tried before ordinary city infill. A wider terrain search lets the tested
live capital use all seven joining sections: rear rampart, both side wings,
gate, middle terrace, palace and three-prong summit. The narrower five-part
candidate was technically complete but too easy to lose in the city fabric.
The house import remains 12px wide. The capital's ground
footprints may extend only four canonical illustration units over a dry border;
provinces use a small court and nearby houses rather than regional city fill.

Projected wall height is not treated as a world-ground road obstruction.
Foundation clearance uses contacts sampled from each imported alpha silhouette;
upper terraces rest on lower sections. Canonical geographical road corridors
make the plan independent of viewed date. Production rendering also checks the
current road mask. Neither road routes nor their anchors change. Complete
projected bounds remain dry and reserve relief space. The actual seed-123
capital regression lives in `scripts/fixtures/`; it catches the placement failure
that a larger synthetic raster missed.

Third-iteration verification passed full `npm run verify`, including the new
atlas/planner and captured-live-capital tests. Matched real-game evidence at
1440x900 and 844x390 is in `artifacts/crown-modular/iteration-3-wide/`; the comparison
`main-ui-before/` uses the same main UI with the previous art. Both have zero
page errors. The renderer checks require every planned monument section
to survive production culling, compact provincial focal pieces to remain, and
roads/readout geometry to match the preceding candidate within 1e-6. Recheck with
`node scripts/crown-modular-render-checks.mjs iteration-3-wide main-ui-before`.

Simulation state, RNG, save schemas and replay are untouched by this art work.
This remains a local Warlord candidate awaiting Cam's visual feedback, with no
push, PR, publication, merge into main or settle authorized.

## Fourth iteration direction — Cam

Keep the capital's overall size. Its near-frontal facade treatment feels flat
and out of scale beside ordinary houses. Revise the architectural sections to
a higher, diagonal three-quarter view with visible roofs, side faces and deeper
terraces; match ordinary doors and windows more closely. Do not scale up the
neighbouring houses or replace the modular city with a whole-region painting.

Provinces should have dense fabric across much of their own region, with little
or no border spill. The previous compact provincial settlement was too small
for this direction. Use a fortified governor's hall and gate court as a lower,
distinct landmark in the same Warlord architectural family. This is an art and
composition change; the main UI, population, gameplay and capture behavior stay
as agreed. All numbers and aesthetic candidates remain provisional.

The built-in imagegen source `warlord-perspective-v4.png` supplies twelve
complete sections; `perspective-v4-prompts.json` records the exact prompt,
references and source path. Eight replace the frontal capital sections and four
form the provincial governor's court. The runtime atlas has 48 frames (79KiB).
Capital import widths and the 12px ordinary house import stay fixed. Upper
tiers recede diagonally; the wider return walls fit behind the gate terrace.
All landmark sections fit atomically. Ordinary infill leaves a small clear area
around their projected bounds. Placement prefers less summit overlap with the
existing Crown marker, but geography and foundation-road clearance take priority.

Full `npm run verify` passed, followed by the final architecture/source, build
and build-preview checks. The actual-terrain regression substitutes current
atlas geometry rather than retaining obsolete sprite dimensions. Desktop
1440x900 and phone landscape 844x390 captures cover the capital, all three
provinces and the full map, with zero page errors. Every planned landmark
section survives production culling; existing road counts and readout geometry
match the previous candidate within 1e-6. The regional presentation probe also
passes capture, monster/road changes, camera movement and exact restoration.

Before evidence: `artifacts/crown-modular/iteration-4-before/`. Final evidence:
`artifacts/crown-modular/iteration-4-final/`, including `comparison.html`.
Recheck with `node scripts/crown-modular-render-checks.mjs iteration-4-final iteration-4-before`.
Known visual compromise: the fixed Crown marker still overlaps part of the
summit on the seed-123 map. This candidate awaits Cam's aesthetic feedback;
there is no new push, PR, publication, main merge or settle approval.

## Fifth iteration direction — Cam

Fix every town's central element at its regional centre. Decorative swamp water
must not push a settlement to a dry shoulder. Retain native biome character
along provincial edges facing non-urban regions or the exterior; shared urban
edges can keep flowing together. Generate biome-specific versions of the
enemy-class landmark interacting with its surroundings. Cam chose to complete
the Warlord's five biomes before the other enemy classes. Trial regional names
only on selection, and remove the persistent resource words on economic-flow
corridors; the broader economic-flow UX remains deferred.

The live view bake reserves central dry ground before wetland pools and island
water are painted. Ordinary civic buildings, the Crown palace and governor's
hall use the exact regional centre. Landmark sections are fitted there before
roads; visual routes retain the existing gameplay connections and avoid actual
foundation contacts. Former village entrances move outward if they would end
inside a larger landmark. Routing clearance includes road paint and lattice
rounding. No simulation state, RNG, schemas, replay, region polygons or adjacency
changes are authored. The standalone map study retains its existing sample-site
planning and water treatment.

Exposed provincial fringes use a provisional irregular setback. Shared original
urban borders do not receive that setback. The new fifteen-part biome sheet
changes capital supports/palace and provincial halls through concrete terrain
interactions, while retaining their import widths and class identity. It is
recorded with its exact prompt and built-in source in `biomes-v5-prompts.json`.

Focused checks cover centred civic buildings across all five biomes, retained
wetland pools outside the central reservation, native exposed edges versus
contiguous urban edges, all five landmark families, and foundation-safe roads.
The production capture also checks every planned landmark section, exact town
and landmark centres, selection-only names, and unchanged opening readout
values. The full renderer regression exercises capture, road/monster changes,
camera movement and exact restoration. Technical checks do not constitute Cam's
aesthetic acceptance or authorize any push, PR, main merge or settle.

Fifth-iteration verification passed full `npm run verify` on retry. The first
run's Windows preview-isolation subprocess exited before gameplay tests; its
own temporary servers were cleaned up. Focused tests and the live capture pass
with all twenty underlying anchors at exact regional centres, including the
currently occupied region. Both desktop 1440x900 and phone 844x390 show zero
overview names, only the selected name, all planned landmark sections, and
unchanged opening Force/population/Prestige values. All twelve existing
connections render in the live seed-123 capture. The seed-1867 presentation
probe retains twenty sites/fourteen roads and exact camera/replay restoration.

Before evidence is `artifacts/crown-modular/iteration-5-before/`; final evidence
is `artifacts/crown-modular/iteration-5-final/`, including the interactive
`comparison.html`, closer phone swamp views and a later trade overview without
resource words. Recheck with
`node scripts/crown-modular-render-checks.mjs iteration-5-final iteration-5-before`.
The current production composition exercises mountain and swamp Crown regions;
all five biome kits also pass complete-atlas and fixed-centre placement tests.
The other enemy-class families remain outside this agreed pass.

## Combined map-readout study - Cam

Agreed change: attach the small Crown to the top of the moving Force shield,
replacing the separate marker over the capital artwork in the default floating
view. Its existing capital inspection remains available. Simulation state, RNG,
schemas, replay and control calculations are unchanged.

Three additional layouts are proposals, available only through
`settlementReadout=plate`, `medallion` or `crest`. The plate puts influence above
workers and Prestige on a single shared panel; the clipped medallion puts workers
at the left with influence and Prestige at the right; the hanging crest stacks
the three readings vertically. Each sits below the actual central landmark,
retains the fixed screen scale, faction colours, active/inactive Prestige and
separate inspections. The default remains split until Cam chooses a layout.
The variant selector is a URL parameter outside the evaluated game UI.

Run `node scripts/combined-settlement-readout-test.mjs` for geometry and tap-target
separation, and `node scripts/combined-settlement-readout-browser-probe.mjs` for
real desktop/phone captures, unchanged values and artwork/Crown clearance.
`node scripts/combined-settlement-readout-input-probe.mjs` exercises real Pixi
touch targets for capital, player, unheld and Unrest fixtures at two zoom levels,
including three-digit readings and Crown movement near either end of the bar.
Evidence is in `artifacts/combined-settlement-readouts/`; the comparison uses
the fifth-iteration final captures as its before state. These prototypes do not
authorize a push, PR, merge or settle.

## Progressive crest iteration - Cam

Cam's later feedback supersedes the medallion selection: the crest is closest,
but the zoomed-out map needs more empty space. Agreed overview content is worker
count and ownership; influence and Prestige disclose on zoom. Unselected
settlements switch together, rather than individually as they happen to fit.

The `settlementReadout=progressive` proposal uses a small worker shield with the
existing faction fill/rim and a capital Crown finial. Full crests retain their
values, inactive/active Prestige treatment and separate touch inspections. The
default and earlier comparison URLs remain available for review.

The shared threshold is the maximum safe fit over current unselected settlement regions,
including those offscreen. Padded painted footprints include the Crown, sword
and frame strokes; checks reject concave boundaries cutting through a footprint,
not just corners outside a polygon. A small expansion/collapse gap avoids pinch
flicker while always collapsing before the safe-fit limit. Cam's follow-up makes
selection an explicit exception: the selected region always shows its full
crest, even when zooming out with selection retained. Only that region is exempt
from the common fit check; the others continue using shared progressive logic.
Changing selection or deselecting restores the former region to the common mode.
The selected readout draws above other settlements. No model, RNG, schema, replay,
terrain, road or camera-limit changes.

The first pass used a large bounding rectangle and expanded near the 2.5x
maximum; Cam rejected that delay at an already-close map view. The follow-up
packs the full crest into two rows, with workers and Prestige side by side below
influence, and checks its painted taper instead of treating its empty lower
corners as occupied. Crests now expand earlier, verified at 1.9x on seed 123.
The selection override remains in place. Thresholds are provisional and derive
from current artwork and polygons. If any region
cannot contain a full crest at that zoom limit, the unselected group stays compact;
it never silently lets an unselected settlement leak or expand alone. Such a map would require a
further layout/placement decision before accepting this approach generally.

Run `node scripts/progressive-settlement-readout-test.mjs` and
`node scripts/progressive-settlement-readout-browser-probe.mjs`. The latter
checks desktop/phone views, identical readings, unselected expanded crests inside
their regions, synchronized wheel transitions and touch inspection. Selection,
zooming out while selected, switching selection and deselecting are covered.
The original no-exception evidence is in `artifacts/progressive-settlement-readouts/`;
the revised behavior is in `artifacts/selected-progressive-settlement-readouts/`.

Cam also requested always-visible Prestige income on minimized player holdings.
Their compact marker keeps the existing ownership medallion and gold income
tab, with the same rounded per-node amount and touch inspection. Inactive
potential Prestige on other towns stays hidden until expansion. The current
two-row/earlier-expansion and compact-income evidence is in
`artifacts/earlier-prestige-settlement-readouts/`; the browser probe now verifies
all 19 crests at 1.9x, including with no selection, and active income at overview.
