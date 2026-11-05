# Regional readout prototype — 2026-11-05

Question: can the regional map communicate workers, population allegiance,
military holding and territorial Prestige while moving economic diagnosis to
region selection, at phone-landscape size?

Throwaway experiment on `experiment/regional-readout-20261105`. Not production
implementation and not permission to merge or publish.

## Run

`npm run prototype:regional` starts/reuses this checkout's preview. Append
`?regionalReadout=shield&perf=1&art=1&launch=new` to its printed URL for a
prepared representative run in the separate Dev save. Tap the ticked Dev seal
when illustrations are ready. Select the map navigation if needed.

Choose A/B/C in Menu > Developer tools > Regional readout prototype. The URL
parameter accepts `shield`, `tracks`, `bracket`. Switching reloads the page;
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
