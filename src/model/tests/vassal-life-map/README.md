# Vassal Life Map tests

`src/model/tests/vassal-life-map.js` remains the npm runner
(`npm run test:vassal-life-map`). It imports these files and prints
`[vassal-life-map] OK`.

## Files

- `helpers.js` — shared fixtures: `dispatch`, `selectedState`, signature
  lookup, `forceEnter`, `resolvePending`, and `findSeed`.
- `selectors.js` — lineage/playhead getters, income/cost/duration formulas,
  candidate-pool and portrait isolation, and generated-graph family checks.
- `shop.js` — inventory, purchase/undo/reorder/reroll, practice/structure
  shops, tagged shops, and route offers.
- `lifecycle.js` — initialize/select RNG, generator topology, enter/confirm,
  mortality, development choices, signatures, and validate. Mixed-area
  cases live here.
- `presentation.js` — `getVassalNodeDecisionPresentation` projections.
