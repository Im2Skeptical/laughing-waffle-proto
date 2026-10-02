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
  Each scheduled trigger/stage runs every eligible local-only recipe before
  sharing. Queued reactions and their local children drain FIFO across roots
  before shared retries; children of a shared recipe get local priority before
  the next shared recipe. Successful recipes never repeat in the sharing pass.
  Retries re-evaluate Stock, requirements and staffing, without reserving partial
  inputs or repeating Charge gains. Authored site/slot order breaks ties.
- `practice-events.js` — bounded JSON event journal, root/parent IDs and emission
  context. `practices.js` drains it through the real recipe resolver, including
  automatic Charge Discharges, full blocked retries and root-chain safeguards.
- `stock.js` - Trait queries, atomic provider plans, capacities and specialist training.
  Food and Practice inputs use local Stock first, then player-controlled detailed
  settlements sharing both a polygon edge and a live connection, in authored
  region order. Require preserves the provider's Stock; Consume debits its host.
  Food resolves local meals for every settlement before unmet demand draws from
  neighbours, so only the Stock remaining after the owner's meal can be shared.
  The current transfer second is recorded in the JSON Practice event journal for
  deterministic map packet reconstruction. Transfer Traits name the requested
  input only (the matching alternative, or substituted requirement); game events
  still carry the actual source Stock's full Traits for reaction matching.
  Authored polygon adjacency is cached in `world-state.js`; live connections,
  ownership and provider boards are resolved afresh. Empty recipes skip provider
  discovery entirely.
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
