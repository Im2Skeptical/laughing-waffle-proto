# Effect Operation Dictionary

Declarative detailed-settlement effects are defined in
`src/defs/gamepieces/detailed-settlement-defs.js` and interpreted by
`src/model/detailed-settlements.js`.

Scaled effects use a shared `scaledValue` descriptor:

- `baseAmount`
- an evaluator that returns a score, breakdown, and diagnostics
- `workerMultiplier: { base, perEffectiveWorker }`

The result is `baseAmount × evaluator score × (base + effective workers ×
perEffectiveWorker)`. Cultivate, Administration, and Preservation use a base of
1 and contribution of 1, so they remain active without workers. Villagers
contribute 1 effective worker and Strangers contribute 0.5.

Region-count evaluators use JSON-only scopes for adjacent regions, filtered
connected components, practice presence, and a host-practice conditional. The
same scopes can select routing endpoints, keeping displayed diagnostics and
simulation behavior aligned.

## `addLocalFood`

Fields:

- `scaledValue`

Adds the resolved amount to the host. Stored capacity fills first; overflow is
loose. Food is rounded to four decimal places.

## `routeLocalFood`

Fields:

- `scaledValue`
- `targetScope`

The resolved value is one shared movement cap for the card. Planning moves only
meal-safe surplus toward current shortages, may split the cap across endpoints,
and is snapshot-based and applied together.

## `reduceFoodDecay`

Fields:

- `foodKind`: `stored` or `loose`
- `scaledValue`

Relatively reduces the selected food-decay loss by the resolved percentage.
Combined reduction is capped at 100%. Preservation currently targets stored
food only.

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
unknown operations, malformed scaled values/scopes, invalid worker capacities,
and unknown structure IDs.
