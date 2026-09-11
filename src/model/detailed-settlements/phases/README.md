# Detailed-settlement moon phases

Callers keep importing from `src/model/detailed-settlements.js`, which re-exports
`stepDetailedSettlementsSecond`, `initializeDetailedSettlementCivilization`,
`resolveProbability`, `getElderMortalityRate`, and `getPrimordialChaosPressure`
from `../phases.js`.

This split is mechanical. Phase bodies moved as-is; the stepper still lives on
the original `phases.js` path.

## Files

- `shared.js` — `shiftStatus`, `rollCount`, `resolveProbability`,
  `getElderMortalityRate`, `resetEmptyStrangerCohort`, `HAPPINESS_ORDER`
- `moon-turn.js` — `createMoonTurn`, `beginMoonTurn`, `ensureMoonTurn`,
  `setMoonTurnPhase`
- `chaos.js` — `getPrimordialChaosPressure`, `runGlobalChaos`,
  `recordChaosLosses`
- `migration.js` — intent/housing/meal helpers and `runMigrationPhase`
- `food.js` — happiness update and `runFoodPhase`
- `housing.js` — `runHousingPhase`
- `faith.js` — faith streak/collapse and `runFaithPhase`
- `birth.js` — `runBirthPhase`
- `death.js` — `runDeathPhase`

Import graph is acyclic: shared and moon-turn are leaves; chaos does not import
other phase modules; migration imports shared/moon-turn/chaos; each run* phase
imports those helpers. `phases.js` orchestrates init and
`stepDetailedSettlementsSecond`.
