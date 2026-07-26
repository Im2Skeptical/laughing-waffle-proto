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

## Map evaluator

`{ evaluator: "adjacentPlayerSameColour" }`

Returns base score 1 plus directly connected regions whose controller is
`player` and whose colour matches the host. Evaluation is pure and does not
mutate state.

## Topology transfer target

`routeLocalFood` may choose only a directly connected detailed site. The
planner:

- reads one activation-start food/capacity/demand snapshot
- resolves hosts and neighbour ties in authored region order
- tracks planned source availability separately from planned destination fill
- cannot use incoming food as a source in the same moon

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
