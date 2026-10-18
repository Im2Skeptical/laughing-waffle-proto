# Vassal Life Map lifecycle

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public lifecycle API from `../lifecycle.js`.
`getSettlementRequirements` stays on `lifecycle.js` for presentation.js.

Node confirmation also resolves timed Scholar Delve through the shared mortality
path, without completing the shop, earning node income, or emitting nodeResolved.
Campaign encounters use the same timed path and keep the visit open; only Leave
completes the node. Tour and Quest rewards enter the normal Relic acquisition
step before their time advances.

## Files

- `candidates.js` — portraits, signatures, pool generation, initialize,
  reroll, and `selectLifeMapVassal`
- `node-confirm.js` — enter, option select, confirm, finish, development
  choices, Relic acquisition, Heirloom inheritance, and `getSettlementRequirements`
- `step.js` — `stepVassalLifeMapSecond`, pending/display reads, validate
- `../heirlooms.js` — inventory helpers used by candidates, confirm, and validate

Import graph is acyclic: candidates → node-confirm → step. step also
imports candidate validators and continuous Commission progression. shop.js
creates a timed Delve pending action; offers refresh only after resolution.
