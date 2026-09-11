# Detailed Settlements tests

`npm run test:detailed-settlements` still runs `tests/detailed-settlements.js`.
That runner imports this folder so each slice can be read or executed alone.

- `helpers.js` — `fresh`, `putStructure`, `clearDetailedPopulationAndFood`,
  `disableMonthlyDemographics`, and shared fixtures.
- `queries.js` — defs validation, Green, chaos pressure, workers, capacities, view-model.
- `practices.js` — cultivate, forage, decay, build, admin, import, commerce.
- `phases.js` — happiness, meals, migration, faith, death, rootedness, mid-moon.
- `vassals.js` — life-map block plus candidate pool, interventions, and expansion.

Keep runner import order matching the original suite.
Life-map assertions stay here; `tests/vassal-life-map.js` is a separate stream.
