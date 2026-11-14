# Browser reference corpus

Preparatory capture for pending native milestone N03
([issue 96](https://github.com/Im2Skeptical/laughing-waffle-proto/issues/96)).
This directory freezes a small browser behavioral reference. It does not
implement C++, finish N03, or establish cross-language parity.

The bootstrap worker owns `native/WORKPLAN.md`, `native/AGENTS.md`, and the
native build files. This packet owns only `native/reference/`.

## What a passing check means

`verify.mjs` checks the current browser engine against the frozen reference:
official replay, JSON continuation, and the semantic projection. A pass is a
browser regression result. It is not native parity. Native parity does not
exist yet.

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
