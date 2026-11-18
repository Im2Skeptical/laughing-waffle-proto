# Browser reference corpus

This directory contains the N03b step-reference traces and the older opening
regression corpus. The traces freeze observed browser behavior for the native
port. [Native parity levels](../ARCHITECTURE.md#parity-levels)

## Step-reference traces

Use the browser model pinned in [BASELINE](BASELINE). From the repository root:

```text
node native/reference/trace.mjs
node native/reference/trace.mjs --check
node native/reference/trace.mjs seed-42-shops
node native/reference/diff.mjs --self-test
node native/reference/diff.mjs <expected-state.json> <actual-state.json>
node native/reference/diff.mjs <reference-trace-dir> <native-trace-dir-or-hashes.tsv>
```

`trace.mjs` defaults to all scenarios and accepts one or more scenario IDs.
A capture writes `artifacts/native-reference/traces/<id>/`. `--check`
regenerates in memory and compares the artifact files and any checked-in
fixtures byte for byte. `fixtures/` carries all five hash lists, the seed 1
opening state for codec tests, and its first advancing state for step parity.
The other full states are generated on demand.

A scenario gives the start seed, optional prepared forecast anchor, duration
(`horizonSec`), absolute `keepSeconds`, and chronological `actions`. Each
action is a stored `{tSec, kind, payload}` entry. The official runner advances
all 60 ticks to a second, applies that second's journal entries in their
listed order, then captures the state. The start has no advance. A full state
already includes the journal entries for its second.

### Files

- `hashes.tsv` is UTF-8 without a BOM. Its header is exactly `tSec<TAB>sha256<LF>`.
  Each row is `<second><TAB><digest><LF>` with no padding or extra columns.
  Seconds are nonnegative decimal integers without leading zeros, ascending
  consecutively from start through end inclusive. Digests are 64 lowercase
  hexadecimal characters. The final row ends in LF.
- Each digest covers UTF-8 JSON from the corpus's `canonicalJson` applied to
  `serializeGameState(state)`, with no BOM or trailing newline. Object keys
  are sorted by UTF-16 code units before `JSON.stringify` (ECMAScript emits
  integer-index properties first, in numeric order). Array order and values
  are preserved. Use `JSON.stringify` number and string formatting.
- `state-<second>.json` is the exact UTF-8 output of
  `JSON.stringify(serializeGameState(state))`. It retains JS property order and
  has no BOM or final newline. Use it for ordered codec round-trips.
- `manifest.json` records the baseline and schema versions, gameConfig hash,
  scenario, simulated timing and validation intervals. Capture prints measured
  elapsed time separately so the generated files stay byte-identical.

A passing capture means every kept state reproduces the uninterrupted hashes
from its JSON round-trip through the next kept second, or for 60 seconds after
the last kept state. That last interval can extend past the exported horizon.
`rebuildStateAtSecond` also matches every kept hash. A mismatch stops capture
and prints the first paths, with full conflicting states under
`artifacts/native-reference/diagnostics/<id>/` when both states are available.
`diff.mjs` exits `0` on a match, `1` on divergence and `2` for invalid input.
State comparisons visit object keys lexically and array elements by index.
The first eight paths include values and their parent paths. The leaf count
includes all differences. A missing subtree counts its leaves, a type
replacement counts the larger subtree, and an empty container counts as one
value. Trace comparisons find the first divergent or missing second and use
`state-<second>.json` from both directories when available.

### Step windows

A scenario can request additional consecutive full states using
`"windows": [{ "startSec": 0, "count": 40 }]`. The count includes the
initial state, so this example tests 39 advances. Captures are written to
`artifacts/native-reference/windows/<scenario>/<startSec>/`, and `--check`
also checks these files byte for byte. The checked-in window in
`fixtures/windows/seed-1/0/` reuses the existing seed-1 opening as its anchor.
A window may begin at a second with journal actions already applied. Later
seconds in the window must be action-free because `step` only runs simulation.

A paused probe sets `"paused": true` on a window. Its directory gets a
`-paused` suffix. The capture forks the anchor through the browser pause
command and calls the official runner for each requested attempt. Filenames
count attempted seconds while the serialized `tSec` and all other fields stay
at the paused anchor. The catalogue covers default season and year wraps,
moon rollover, late anchors, timed Vassal state, and a paused attempt.

```powershell
node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe
```

For single-window commands and timings, see [step parity](../src/sim/README.md#step-parity).
The [mask file](parity-masks.json) uses format version 1. Patterns are rooted
at `$` and use dot-separated property names or array indices. `*` matches one
segment and `**` matches zero or more. A match removes an object property or
replaces an array element with null, preserving array length and other
indices. Masks identify the narrowest path covering the write, including
the parent when a stage can create or replace the record. Each mask names a
responsible cut. Shared paths may need to stay masked until all of their
writers are ported. The native CLI
validates format and owner IDs, and CTest checks the owners against the
[cut table](../spec/tick-pipeline.md#proposed-n03e-cuts).

### Scenarios and capture size

Base trace sizes and capture times below were measured serially on an Intel
Core i9-10900K with Node 24.15.0. The nine additional windows currently write
116 full states, about 80 MiB. The captured settings use 32 seconds per in-game year.

| Scenario | Inclusive trace seconds | Coverage | Output bytes | Wall time |
| --- | ---: | --- | ---: | ---: |
| `seed-1` | 0–1600 | 50 years from New Game | 2,984,742 | 75.17 s |
| `seed-42` | 0–160 | 5 years from New Game | 2,461,262 | 6.58 s |
| `seed-1867` | 0–192 | 6 years from New Game | 2,842,497 | 7.86 s |
| `seed-42-shops` | 0–192 | 6 years with vassal selection, a Practice Reform purchase, and a Public Works visit | 4,931,836 | 8.76 s |
| `seed-2026-late` | 3200–3392 | 6 years from a year-100 forecast anchor | 2,608,753 | 18.87 s |

The late scenario reconstructs the prepared performance-start anchor through
the model's forecast path, so the development gzip is optional. The anchor is
865,644 bytes, up from 373,393 at opening. Its timing includes the preparation.

## Opening regression corpus

The opening corpus predates the step-reference traces.

## What a passing check means

`verify.mjs` checks official browser replay, JSON continuation, and the
semantic projection against the frozen reference. Native `step` results cover
the compared seconds and unmasked fields for the current port cut.

Golden numbers are observed baseline-engine output. They are not a claim that
every serialized field is the intended design. A future rule fix must
regenerate this corpus explicitly. Do not treat a golden mismatch as a native
implementation requirement until someone separates an intended change from a
defect.

## Impact

- Determinism: captures use `createNewGameState` and `state.rng` through the
  official replay runner. The tools do not call `Math.random`.
- Serialization: comparisons use complete `serializeGameState` values. No save
  schema changes.
- Replay: each second is sixty official ticks via `advanceReplayStateOneSecond`.
  `rebuildStateAtSecond` is compared with no masked fields. Two restores are
  separate objects; editing one must not change the other.
- Layering: these tools import model modules only. Gameplay, controllers, views,
  and package scripts are unchanged.

## Slice

Seeds `1`, `42`, and `1867`, ordinary New Game.

| Checkpoint | tSec | History |
| --- | ---: | --- |
| `initial` | 0 | Opening state. No phase boundary has run. |
| `phases` | 6 | Official advance through seconds 1–6. With the captured one-second phases this is the Death boundary of moon 0, after Birth, Food, Housing, Faith, Migration, and Death. |
| `action` | 7 | One more official second, which reaches the next Birth boundary, then `settlementSelectVassal` for opening candidate 0. |

The selection is normal play. The live call pauses only to satisfy
`applyAction`, then unpauses before the snapshot. Replay applies the stored
action with the timeline's replay flag. No reachability hack is used. Garrison
support has no legal target on these openings, so it is not the action.

## Semantic projection

Checked-in files store a compact projection plus the SHA-256 of the complete
serialized state. Raw snapshots stay in gitignored
`artifacts/grok-nov14-spend/reference-fixtures/full/`.

The projection includes time and the six RNG stream seeds, civilization
Prestige and treasury, a short Chaos observation, vassal candidate identity and
the selected vassal's Prestige, joint cohorts, birth-credit ledgers, practice
instance id, slot order, Stock, Charge, and work, and controller / Unrest /
claim fields.

Numbers are JSON numbers from `serializeGameState`. This corpus does not round
them. Prestige is the integer the engine stored. It is not recomputed with the
old November 7 node-income rounding. `seasonClockSec` is the engine's sum of
sixty `1/60` steps, not a hand-rounded decimal.

Regions follow `world.regions`. Joint cohorts keep stored order inside each
class, and class ids are sorted. Practice slots keep index, including empty
slots. Candidate order is pool order. Birth-credit keys are sorted only in the
semantic file. The full-state hash sorts object keys and drops no fields, so
key order alone does not change it. Array order remains significant.

## Covered and excluded

Covered as observed behavior: opening seeds, the initial state, the official
advance above, the vassal selection, and the semantic fields in that slice.

Not covered, and not claimed: Unrest entry, accrual, or expiry (the field is
present and null here); node Prestige rounding; shops; life-node confirmation;
practice install or removal; season rollover; Life Map graphs and portraits in
the semantic file; map polygons and roads in the semantic file; the gameConfig
body except its canonical hash; save slots; forecast workers. The full-state
hash still changes if those excluded serialized fields drift.

## Card content refresh

The v1.1.74 card pass intentionally refreshes the browser reference to GameState
52: terrain bonuses are printed card data, starter cards have no implicit biome
bonus, and keyword scaling can target Output or Capacity. The original baseline
commit below records the corpus's origin; current config and full-state hashes
are regenerated explicitly for this intentional rules change. These goldens
establish the browser-side baseline. See [content rules and coverage](../../docs/card-content-pass.md).

## Provenance

Pinned to baseline `f0b1b1f720c19a1cbeda558da430a1ff636e6507` and the canonical
gameConfig hash in `corpus/manifest.json`. Package version and current git HEAD
are not pass/fail gates. Ordinary version bumps do not invalidate the fixtures.
A config or rules change does, until someone regenerates on purpose.

The runner-save schema constant is recorded from source and is not an equality
gate. This corpus does not round-trip IndexedDB.

## Commands

From the repository root:

```
node native/reference/generate.mjs
node native/reference/generate.mjs --write
node native/reference/verify.mjs
```

`generate.mjs` without `--write` evaluates the slice and exits 2 without
touching goldens. `--write` replaces `native/reference/corpus/` and prints
which full-state hashes changed. It refuses to write if live play, JSON
continuation, or `rebuildStateAtSecond` disagree.

`verify.mjs` never writes corpus files. Passing `--write` to it exits 2.
It also runs three in-memory comparator controls: a changed RNG seed, cohort
count, and Stock value must each be reported. Those controls do not edit
production files and are not production mutants.

Registered npm hook (also included in the normal test suite):

```
"test:native-reference": "node native/reference/verify.mjs"
```

Focused check only. Do not treat it as `npm run verify`.
