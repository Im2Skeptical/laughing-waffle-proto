# Effect Operation Dictionary

Declarative detailed-settlement effects are defined in
`src/defs/gamepieces/detailed-settlement-defs.js` and interpreted by
`src/model/detailed-settlements.js`.

All arithmetic uses effective worker contribution. Villagers contribute 1;
Strangers contribute 0.5.

## `addLocalFood`

Fields:

- `amountPerEffectiveWorker`
- optional `multiplier: { evaluator }`

Adds the resolved amount to the host. Stored capacity fills first; overflow is
loose. Food is rounded to four decimal places.

## `routeLocalFood`

Fields:

- `packetPerEffectiveWorker`

Each assigned token permits one adjacent packet-edge move. Packet strength is
the configured amount times that token's effectiveness. Planning is
snapshot-based and applied together.

## `modifyStoredFoodDecay`

Fields:

- `additivePercentPerEffectiveWorker`

Adds the signed percentage-point modifier for effective workers. Preserve uses
`-2`. The final stored-food decay rate has a 0% floor.

## `advanceWork`

Fields:

- `amountPerEffectiveWorker`

Adds work to the host practice slot at its activation. Work is retained while a
completed build waits for physical structure space.

## `createLocalStructureAtWork`

Fields:

- `structureDefId`
- `requiredWork`

When work meets the requirement, creates the structure in the first free
regional slot. On success the practice removes itself and the five-slot tableau
compacts. When capacity is full, no work is lost and the practice stays.

## Current structure definitions

- Granary: stored capacity `100 × local count²`
- Mud Houses: housing capacity `20 × local count²`

## Validation

`validateDetailedPracticeDefinitions()` rejects unknown activation types,
unknown operations, invalid worker capacities, and unknown structure IDs.
