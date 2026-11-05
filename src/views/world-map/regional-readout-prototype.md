# Regional readout prototype — 2026-11-05

Question: can the regional map communicate workers, population allegiance,
military holding and territorial Prestige while moving economic diagnosis to
region selection, at phone-landscape size?

Throwaway experiment on `experiment/regional-readout-20261105`. Not production
implementation and not permission to merge or publish.

## Latest: connected count / Prestige and three Force treatments

The upper readings now share one frame with two sections. Prestige display uses
whole numbers, while exact model contributions stay unchanged. Left-number
meaning is provisionally total residents per the latest wording; workers remain
available via `regionalCount=workers`. Force alternatives use `regionalForce=`
`shield`, `surround`, or `rail`, switched through Developer tools. See
`docs/prototypes/regional-map-20261105/CONNECTED_FORCE_OPTIONS.md` for the explicit
display-only political samples used to compare filled/insufficient meters.

## Current direction ? floating graphics around settlement sprites

Cam rejected the intermediate menu and region names covering the influence bar.
Use `?regionalReadout=floating&perf=1&art=1&launch=new`. Worker count, framed
allegiance/Force bar and Prestige reading surround the actual building sprites;
existing region names are kept clear of the bar and counters. Clicking a region opens its existing
economy directly. See `docs/prototypes/regional-map-20261105/FLOATING_REVISION.md`.
The historical variants below are retained as experiment records, not agreement.

## Rejected revision ? world first

Cam rejected the repeated statistical panels as overwhelming and asked for a
Civilization-level game presentation with the fantasy map as the main visual.
Use `?regionalReadout=atlas&perf=1&art=1&launch=new` for the revised proposal.
The earlier shield/tracks/bracket treatments below remain as historical variants.

- Small heraldic seals replace opaque repeated cards. Own worker counts and
  income have priority; foreign population is suggested by seal size.
- Region names sit with their settlement. The overview fits a little closer.
- Normal political information is a fine seam; occupation/contention alone get
  an exception shield. Sources and exact amounts remain inspectable.
- Selecting a settlement opens one compact regional summary, retaining the map.
  Workers, residents, allegiance, holding status and Prestige are explicit there.
- Economy opens the existing board. Map summary returns to the small disclosure.
  This two-step disclosure is a new proposal, not already approved behavior.
- The Chaos drawer starts collapsed to its existing compact warning control.
- Existing map art, roads/borders, timegraph and simulation are preserved.

Peer research, rubric, baseline and scored iterations live in
`docs/prototypes/regional-map-20261105/`. Captures live in
`artifacts/regional-readout-v2/`. The research is a qualitative design audit,
not proof of equal usability or aesthetic quality to Civilization.

## Run

`npm run prototype:regional` starts/reuses this checkout's preview. Append
`?regionalReadout=shield&perf=1&art=1&launch=new` to its printed URL for a
prepared representative run in the separate Dev save. Tap the ticked Dev seal
when illustrations are ready. Select the map navigation if needed.

Choose World first or the historical A/B/C treatments in Menu > Developer tools > Regional readout prototype. The URL
parameter accepts `floating`, `atlas`, `shield`, `tracks`, `bracket`. Switching reloads the page;
Continue performance game resumes the separate Dev save. No experiment controls
are placed on the evaluated map. Omitting the parameter retains the shipped UI.

## Proposed

- Total workers as a number; residents separately. Tap readout for assigned/unused.
- Gold/copper/grey allegiance shares, retaining the existing faction palette.
- A: attached holding shield; B: occupation-coverage track; C: bracket indicating
  normalized coverage of the disloyal population. Force never fills allegiance.
- Player holdings show current regional Prestige contribution per completed node.
- Crown holdings show conditional potential at zero unrest, using the captured
  build's population divisor (currently 20). This is not a capture quote.
- Stock exception markers are disclosed for the selected region; supply motion
  is hidden in overview. Urgent starvation remains visible.
- Existing regional panel, economic cards, navigation, terrain and Crown identity
  stay intact. Tap artwork/territory to select; tap readout to inspect.

## Temporary choices and limitations

- Default prototype recipe uses real fixed-seed performance-start state. No
  simulation fixtures or cohort sizes are modified to manufacture cases.
- Crown potential is a read-only display estimate. No Crown income simulation
  or player income before capture is introduced.
- Regional income displays one decimal; total payout still uses the model's
  aggregate rounding. No global treasury or node-payout changes.
- Retention, all game rules, RNG, schema and replay remain unchanged. Variant is
  chosen on page load and switching requires reload.
- Readouts retain a constant screen size as the map zooms.
- Tiny maps and crowded settlements remain part of the design evaluation;
  this does not add label collision management or new zoom behavior.
- Force bracket is a normalized presentation of existing Force/requirement,
  not a claim threshold or guarantee of capture. Supported regions show no
  coverage track because the current marker reports required=0.

## Review

Compare overview density and selected-region context on 844×390 and desktop.
Confirm that total workers cannot be mistaken for residents; current income
cannot be mistaken for Crown potential; occupation cannot be mistaken for
allegiance. Select a region to inspect the real economic board. Existing source
checks and full `npm run verify` cover integration; capture script records the
real landscape and desktop canvas under ignored artifacts/regional-readout/.

Cam approved exploring the recommendation, not a final visual treatment.
Still open: preferred Force treatment; resident-count prominence; Crown potential
at zero unrest; which urgent economic warnings remain global.

## Capture findings

- Actual illustrated game captured at 844×390 and 1440×900 with zero page errors.
- Initial terrain-scaled text was too small. The prototype now counter-scales
  readouts against camera zoom, retaining a consistent screen footprint.
- Selecting a player settlement opens the existing economic board alongside
  the map; no replacement panel or invented economic information is used.
- The real opening fixture is population-supported. A/B/C are available, but
  an occupied/contested example is still needed before approving Force semantics.
- The denser readouts trade terrain visibility for numeric comparison. Cam
  should judge whether all Crown potential amounts belong on the overview.
- Captures and interactive review sheet: artifacts/regional-readout/mockup.html.

Validation: full npm run verify passed; architecture/source-reachability checks passed after the final scale and tooltip changes. Both capture runs reported zero page errors. Primary checkout remains clean main.
