---
name: change-settlement-sim
description: Change detailed-settlement simulation (queries, practices, phases, food, housing, demographics). Use when editing site ticks, moon phases, workers, or replay of settlement rules. Do not extend settlement-exec.js.
---

# Change settlement simulation

Route queries, practices, phase resolution, workers, food, housing,
demographics, Elder Orders, and view models through
`src/model/detailed-settlements.js` (barrel) /
`src/model/detailed-settlements/`.

Vassal Life Map rules belong in `src/model/vassal-life-map.js`, not here.

## Do not extend these

These files stay on the serialization/replay path and retain pre-redesign
substrate. Reachability is not an invitation to add gameplay:

- `src/model/settlement-exec.js`
- `src/model/settlement-state.js`
- `src/controllers/sim-runner.js`
- `src/model/state.js` (schema/serialize only unless the task is the
  GameState envelope)

## Determinism / JSON / replay checklist

Before coding, confirm the change:

- Uses `state.rng` (never `Math.random()`).
- Keeps `GameState` JSON-serializable (no classes, functions, Maps, Sets).
- Leaves `rebuildStateAtSecond(tSec)` as the authoritative replay path.
- Advances time only via simulation ticks (`tSec`).
- Does not import views or controllers from model code.

`npm run check:architecture` guards RNG and layering.

## Test

```
npm run test:detailed-settlements
npm run test:detailed-replay
```

Schema or serialize/deserialize edits also need a pass through
`src/model/state.js` tests via replay, not new logic in `settlement-exec.js`.
