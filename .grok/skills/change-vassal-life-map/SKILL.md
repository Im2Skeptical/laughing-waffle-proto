---
name: change-vassal-life-map
description: Change Vassal Life Map rules, nodes, shops, lifecycle, generator, or presentation. Use when editing patronage, development, travel, crisis, legacy, prestige, phases, or Life Map topology. Do not extend settlement-vassal-exec.js.
---

# Change Vassal Life Map

Route Life Map rules through `src/model/vassal-life-map.js` (barrel) /
`src/model/vassal-life-map/`. Definitions live in
`src/defs/gamepieces/vassal-life-map-defs.js`. Generated topology lives in
`src/model/vassal-life-map-generator.js`.

## Where rules go

| Concern | File |
|---|---|
| Public API / barrel | `src/model/vassal-life-map.js` |
| Selectors | `src/model/vassal-life-map/selectors.js` |
| Shop | `src/model/vassal-life-map/shop.js` |
| Lifecycle (candidates / confirm / step) | `src/model/vassal-life-map/lifecycle/` |
| Presentation | `src/model/vassal-life-map/presentation.js` |
| Node/room defs | `src/defs/gamepieces/vassal-life-map-defs.js` |
| Generator | `src/model/vassal-life-map-generator.js` |

After the map lands in a split folder, read that folder README before the
orchestrator file. See `src/model/vassal-life-map/README.md` and
`lifecycle/README.md`.

## Do not

- Extend `src/model/settlement-vassal-exec.js` or
  `src/model/settlement-state.js` for new Life Map rules.
- Put Life Map gameplay in `src/model/detailed-settlements.js`.
- Load `ai/history/` unless the task is explicitly about a past design
  decision.

## Test

```
npm run test:vassal-life-map
```

Replay-sensitive schema or tick changes also need
`npm run test:detailed-replay`.
