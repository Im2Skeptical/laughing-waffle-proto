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
- `practices.js` — slot evaluation and authoritative declarative activation.
- `practice-events.js` — bounded JSON event journal, root/parent IDs and emission
  context. `practices.js` drains it through the real recipe resolver, including
  automatic Charge Discharges, full blocked retries and root-chain safeguards.
- `stock.js` - Trait queries, atomic provider plans, capacities and specialist training.
  Food and Practice inputs use local Stock first, then player-controlled detailed
  settlements sharing both a polygon edge and a live connection, in authored
  region order. Require preserves the provider's Stock; Consume debits its host.
  The current transfer second is recorded in the JSON Practice event journal for
  deterministic map packet reconstruction.
- `workers.js` - Scholar sockets and ordinary population worker assignment.
- `cohorts.js` - orthogonal specialist age subsets and composition helpers.
- `external-world.js` - neutral templates, Raid/Trade, Support/Retinue, conquest and spatial Monsters.
- `phases.js` — **the stepper**. `initializeDetailedSettlementCivilization`
  and `stepDetailedSettlementsSecond`. Phase bodies live in `phases/`
  (`birth.js`, `food.js`, `housing.js`, `faith.js`, `migration.js`,
  `death.js`, plus `moon-turn.js`, `chaos.js`, `shared.js`). See
  `phases/README.md`.
- `vassals.js` — candidate generation, selection pool, debug inject, prestige,
  and intervention apply/describe.
- `view-model.js` — `getDetailedSettlementViewModel` plus
  `getDetailedCivilizationSummary` (both need queries + workers).

New detailed behavior belongs in the matching file above. Projection runs the
same stepper; never add a separate forecast implementation of Stock or conflict.
