# Detailed Settlements

Callers import from `src/model/detailed-settlements.js` (thin barrel). Do not
add new detailed-settlement gameplay to `src/model/settlement-exec.js`; that
file is the legacy tick substrate.

## Files

- `helpers.js` — `clone`, `roundFood`, population composition bins, and the
  tiny moon-result shells used by both practices and phases.
- `queries.js` — site lookup, create state, structure counts, capacities,
  population / pressure / elder / green summaries.
- `scopes.js` — `resolveDetailedRegionScope`, `evaluateDetailedMapScore`, and
  the region-order / filter helpers they share.
- `practices.js` — worker assignment, slot evaluation, practice activation and
  effects, administration routing (`planDetailedAdministrationMoves*`).
- `phases.js` — **the stepper**. Moon-turn bookkeeping, `runBirthPhase` /
  `runFoodPhase` / `runHousingPhase` / `runFaithPhase` / `runMigrationPhase` /
  `runDeathPhase`, chaos, `initializeDetailedSettlementCivilization`, and
  `stepDetailedSettlementsSecond`.
- `vassals.js` — candidate generation, selection pool, debug inject, prestige,
  and intervention apply/describe.
- `view-model.js` — `getDetailedSettlementViewModel` plus
  `getDetailedCivilizationSummary` (both need queries + workers).

Import graph is acyclic: helpers → queries → scopes → practices →
{phases, vassals, view-model}. New detailed behavior belongs in the matching
file above, then re-export from the barrel if callers need it.
