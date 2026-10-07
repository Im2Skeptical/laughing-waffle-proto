# Effect Operation Dictionary

Current Practice effects are JSON data in
`src/defs/gamepieces/detailed-settlement-defs.js`. The operation whitelist is
`detailedSettlementEffectOps`; `src/model/detailed-settlements/practices.js`
evaluates and resolves those effects through the authoritative recipe path.
Stock planning and Structure modifiers live in
`src/model/detailed-settlements/stock.js`. Callers use the
`src/model/detailed-settlements.js` barrel.

## Operations

| Operation | Result |
| --- | --- |
| `generateStock` | Adds integer Stock to the source Practice, clipped to its current capacity; positive actual yields emit Stock-generation events. |
| `addChaos` | Adds a fixed civilization Chaos cost on successful activation and emits chaosIncreased; workers and output bonuses do not scale it. |
| `research` | Adds civilization Research. |
| `train` | Trains available unclassed adults into the specified Scholar or Warrior specialty. |
| `addHousingForPhase` | Adds a temporary regional Housing bonus to the current phase modifiers. |
| `reduceLocalFoodRequirement` | Reduces the regional Food requirement through the current phase modifiers. |
| `addFaithChaosResistance` | Adds current-phase Faith resistance. |
| `bankCandidateDevelopment` | Banks class-specific Development for later candidate generation. |
| `bankShopQuality` | Banks a capped bonus for the next eligible Scholar shop. |
| `bankSupport` | Banks a capped amount in the named settlement Support channel. |
| `bankPreview` | Banks capped Crisis preview detail. |
| `boostSeasonalFood` | Records a same-year bonus for the first eligible local seasonal Edible producer. |

Non-Stock effects are suppressed for neutral sites. Exact amounts, caps, gates,
seasonal overrides, population/history scaling and remaining content deviations
belong to the runtime definitions and
[CivContent report](../docs/civcontent-2.6-implementation.md).

## Recipes and workers

Scheduled Practices plan their complete Consume/Require recipe before applying
any payment or effect. Require checks provider Stock; Consume debits its host.
Incomplete recipes reserve nothing. Provider scope and ordering are described
in [Targeting](Targeting-Dictionary.md).

Workers multiply Scheduled Stock output by
`1 + effectiveWorkers * workerBonus`, rounded down. For Charge Practices, that
multiplier applies to incoming Charge, including eligible passive gain bonuses;
Discharge output is not worker-multiplied. Charge meters are private integers,
and Discharges never Consume or Require Stock. Non-Stock gates and output
capacity can retain a full blocked meter.

Structure effects are passive definition fields and query modifiers, not
Practice activations. Housing is additive; Granary modifies the capacity of
Edible Stock hosts. Construction uses contiguous regional cells and confirmed
Life Map shop transactions, rather than worker progress on a build Practice.

## Validation

`validateDetailedPracticeDefinitions()` checks five-slot capacity, mode/lane
consistency, worker capacity, Charge grammar and known effect operations.
Run `npm run check:docs` for dictionary coverage,
`npm run test:detailed-settlements` for recipes and `npm run verify` for replay,
serialization and content coverage. The removed wallet operations and
`scaledValue` recipes are historical design, not supported runtime operations.
