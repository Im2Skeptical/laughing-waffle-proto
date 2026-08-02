# Targeting Dictionary

Current detailed-settlement DSL targeting and evaluator scopes.

## Local site target

Practice effects target the detailed settlement hosting the practice. The
authoritative identifier is `regionId`; sites are resolved from the ordered
`state.world.sites` list.

Local fields used by operations:

- `storedFood`
- `looseFood`
- `practiceSlots[slotIndex]`
- `structureSlots`
- `populationByClass`

## Region scopes and map evaluators

Region scopes are JSON-only descriptors interpreted by the model:

- `adjacent` selects authored neighbours, with optional endpoint filters.
- `connectedComponent` traverses only regions matching its traversal filters,
  then applies endpoint filters.
- `conditionalHostPractice` selects one of two scopes based on local practice
  presence.

Filters can constrain controller, host-relative colour, detailed-settlement
presence, and practice presence. `countRegions` evaluators return a score,
readable breakdown, and matching-region diagnostics. Cultivate counts its
player-controlled same-colour component; Administration counts regions with
Administration in its current routing scope. Evaluation is pure.

## Topology transfer target

`routeLocalFood` uses its declarative `targetScope`. Administration normally
selects adjacent player detailed settlements; local Preservation changes that
scope to the player-controlled connected component. The planner:

- reads one activation-start food/capacity/demand snapshot
- prioritizes greatest shortages/surpluses and resolves ties in authored region order
- tracks planned source availability separately from planned destination fill
- cannot use incoming food as a source in the same moon
- spends one shared evaluated cap per Administration card

Destinations fill local stored capacity before creating loose food.

## Local structure target

`createLocalStructureAtWork` targets the first free slot within the host
region's `structureCapacity`. If no slot is free, completed work remains waiting.

## Vassal intervention target

Every candidate stores one `targetRegionId` and a resistance snapshot from that
site's Elder Order. Applied intervention practices are inserted only into that
site's five practice slots.

## Global targets

The following live under `state.civilization` and are never site-local:

- `chaos`
- run loss status
- `vassalLineage`
