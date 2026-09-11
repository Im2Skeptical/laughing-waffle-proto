# Vassal Life Map lifecycle

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public lifecycle API from `../lifecycle.js`.
`getSettlementRequirements` stays on `lifecycle.js` for presentation.js.

This split is mechanical. Mortality/confirm semantics were not rewritten.

## Files

- `candidates.js` — portraits, signatures, pool generation, initialize,
  reroll, and `selectLifeMapVassal`
- `node-confirm.js` — enter, option select, confirm, finish, development
  choices, and `getSettlementRequirements`
- `step.js` — `stepVassalLifeMapSecond`, pending/display reads, validate

Import graph is acyclic: candidates → node-confirm → step. step also
imports candidate validators. shop.js is not touched.
