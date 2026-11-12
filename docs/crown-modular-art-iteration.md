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
