# Connected count/Prestige badge and Force options

Latest local prototype: `regionalReadout=floating`. The two values now share one
bevelled frame and a divider, with separate inspection targets for each section.
Prestige is rounded to an integer for display. Exact contributions and the
aggregate payout calculation remain unchanged.

## Count meaning

Cam called the left value population in this request; the original brief said
workers. An optional question is pending. Current provisional default is **total
residents**, following the latest wording. `regionalCount=workers` switches to
total workers. Both options live in Developer tools > Left number, outside the
evaluated game UI. This is a presentation choice, not a population-model change.

## Force alternatives

The same allegiance split is shown in all three options. Steel blue always means
supplied holding Force; gold/copper/grey always remain population allegiance.

- `regionalForce=shield`: vertically filled shield end-cap attached to the bar.
- `regionalForce=surround`: a steel perimeter meter wrapping around allegiance.
- `regionalForce=rail`: a narrow Force rail attached under the allegiance bar.

The normal URL shows the actual viewed state. For comparison only,
`regionalForceSample=both` replaces the display inputs on the two player markers
with political examples. The GameState, RNG, simulation, saves and replay are
never mutated. Other settlements continue to display their actual values.

Display examples: 200 residents, allegiance Free 70 / Crown 90 / unaffiliated 40.
Both require 6 occupation Force under the existing default. One has 4 Force
(insufficient, 75% unrest, raw Prestige 2.5 shown as 3); the other has 8 Force
(sufficient, 50% unrest, Prestige 5). These are visual examples, not a campaign
quote or a simulated future. Their economic boards still show the real state.
Capture/inspection labels identify this limitation; prototype UI scaffolding
stays out of the map itself.

Direct region-to-economy selection, terrain, existing art, navigation and the
surrounding timegraph are preserved. Region labels retain the current clearance
behavior, including suppression when no nearby clear position exists.

## Capture / review

`node scripts/capture-connected-force-prototype.mjs` captures the actual map and
three Force options in one Chromium session, then restores actual display data.
Artifacts: `artifacts/regional-connected-force/`. Force detail PNGs are native
browser crops of the map, not repainted diagrams. All samples use identical
inputs and camera framing across variants.

Checks cover one shared badge leaving buildings clear; integer display matching
Math.round(exact contribution); three treatments with both insufficient and
sufficient Force; full Force frames inside the map viewport; direct economy;
phone/desktop layout; and browser page errors. Wider seeds and dynamic occupation
playthroughs remain outside this visual pass. No production merge/publication.


Validation: real phone/desktop captures passed with zero page errors; each Force
example is wholly inside the map viewport. Integer display and unchanged exact
values were checked. Full npm run verify passed on retry after the known Windows
Node preview-process fail-fast crash (3221226505); final build, architecture,
source reachability and documentation checks passed. The first framing attempt
is not the final comparison; final crops show both Force examples unobstructed.
