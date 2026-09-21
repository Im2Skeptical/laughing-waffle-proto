# Vassal Life Map lifecycle

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public lifecycle API from `../lifecycle.js`.
`getSettlementRequirements` stays on `lifecycle.js` for presentation.js.

This split is mechanical. Mortality/confirm semantics were not rewritten.

## Files

- `candidates.js` — portraits, signatures, pool generation, initialize,
  reroll, and `selectLifeMapVassal`
- `node-confirm.js` — enter, option select, confirm, finish, development
  choices, Relic acquisition, Heirloom inheritance, and `getSettlementRequirements`
- `step.js` — `stepVassalLifeMapSecond`, pending/display reads, validate
- `../heirlooms.js` — inventory helpers used by candidates, confirm, and validate

Import graph is acyclic: candidates → node-confirm → step. step also
imports candidate validators. shop.js is not touched.
