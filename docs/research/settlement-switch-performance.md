# Regional settlement switching investigation

Investigated 2026-10-05 against `f5b6a3b`, using the user's second-4845 save
and reported Pixel 6 / R11-specific slowdown.

## Cause

R11 is `lake-country`. It is absent from the save's initial settlements. A
`small-settlement:lake-country` Life Map choice was selected at second 3683;
the settlement is present in the later saved checkpoints.

Historical graph summaries contain a complete map of settlements that exist
at each second. Before R11 was founded, that map correctly has no R11 entry.
`getSettlementGraphValueFromSummary` returned `null` for this known absence,
which made `getSeriesValuesForSeconds` fall back to restoring authoritative
state. Switching subjects invalidates calculated series values, so selecting
R11 repeated these restores even when the historical summaries were retained.
Starting settlements could read their existing entries immediately.

This is distinct from the expected initial cost of reconstructing uncached
history after loading a save. The defect repeated work on already-cached
history specifically for a settlement that did not yet exist.

## Fix and correctness

The settlement summary reader now returns the authoritative empty-settlement
defaults when a valid settlement map has no entry for the selected region.
Most local values are zero; class Happiness retains its existing neutral
value of 50. Civilization-wide series continue reading their global values.

An unavailable summary, an invalid entry, or a missing series on an existing
settlement still uses the authoritative fallback. The regression switches
between an existing settlement and one present in the current state but absent
from the historical state. It compares every series with the snapshot reader,
rejects any replay of retained pre-founding summaries, and verifies fallback
for unavailable/incomplete summaries.

The change is limited to `src/model/graph-metrics.js` and its supported graph
test. Simulation rules, every-second summaries, RNG streams, save schemas,
independent mutable previews, and authoritative replay remain unchanged.

## Measurements

A minimal reproduction uses the actual save, the graph controller, and a
retained summary of second zero. Detailed output stays in
`artifacts/settlement-switch/save-sampling.json`.

| Subject | Before: sample time / replay calls | After: sample time / replay calls |
| --- | --- | --- |
| R10 (`east-steppe`) | 0.76 ms / 0 | 0.88 ms / 0 |
| R11 (`lake-country`) | 94.92 ms / 1 | 0.07 ms / 0 |
| R14 (`obsidian-ridge`) | 0.07 ms / 0 | 0.05 ms / 0 |
| R11 again | 54.54 ms / 1 | 0.05 ms / 0 |

These are desktop timings for one graph point, not physical Pixel 6 latency.
They demonstrate the repeated work; a plotted history contains many points.
In the loaded save at the user's 891 x 411 layout, patched browser selection
callbacks for R11 measured about 22–25 ms, comparable to the other settlements.
Committed timeline state was unchanged by the switches.

## Verification

- `npm run verify` passed.
- `npm run probe:navigation` passed, including mobile portrait double-taps.
- `npm run probe:settlement` passed.
- The supplied-save reproduction passes with no historical replay calls.
- The focused graph regression passes and compares all series with replay
  snapshot values, including missing-summary fallback.

Settlement, navigation, and verification logs are recorded under
`artifacts/settlement-switch/`.
