# Trigger Dictionary

Current detailed-settlement practice activation types.

## Second-stage order

When `cmdTickSimulation` advances an integer second, the
`detailedSettlements` stage calls `stepDetailedSettlementsSecond(state, tSec)`.
`state._seasonChanged` is set by the time authority and cleared after all live
second stages.

Within the detailed-settlement stage, boundaries resolve in this order:

1. `season`: every practice whose `activation.type` is `season`
2. `newMoon`: when `tSec > 0 && tSec % MOON_CYCLE_SEC === 0`
3. `fullMoon`: at the midpoint of the moon cycle
4. annual: when a season change enters season index zero

The annual sub-order is demographics/social changes, global chaos, newly passed
vassal interventions, then same-boundary vassal death.

## Practice activation values

### `season`

Currently used by Cultivate. Only player-controlled detailed settlements
activate map production.

### `newMoon`

Currently used by Administrate and build practices. Administration plans from
one activation-start snapshot before moves are applied. Build work uses assigned
worker effectiveness.

After new-moon practices, stored-food decay and loose-food halving resolve.

### `passive`

Currently used by Preserve and inert vassal placeholders. Passive effects are
queried by the boundary that consumes them; they do not create their own time
advance.

## Worker assignment trigger

Assignments are recalculated from current site cohorts for every activation or
passive query. Each class creates
`floor((adults + elders) / 10)` tokens. Villager tokens assign before Stranger
tokens, practices left-to-right.

## Vassal selection

`settlementSelectVassal` is a timeline action. Candidate preview uses a cloned
serialized state; committing selection regenerates through authoritative
`state.rng` and validates the pool hash.
