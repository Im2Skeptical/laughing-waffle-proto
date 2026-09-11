# Trigger Dictionary

> **Current model:** detailed-settlement activations are the six named moon
> phases in `src/defs/gamesettings/moon-phase-defs.js` (Birth, Food, Housing,
> Faith, Migration, Death), resolved by `stepDetailedSettlementsSecond`.
> Do not implement `newMoon` / `fullMoon` / `MOON_CYCLE_SEC` as the current
> detailed-settlement clock. Those belong to the legacy settlement-exec path
> in the section below. Behavior: `ai/sim.md`.

## Current detailed-settlement stepping

When `cmdTickSimulation` advances an integer second, the
`detailedSettlements` stage calls `stepDetailedSettlementsSecond(state, tSec)`.
`state._seasonChanged` is set by the time authority and cleared after all live
second stages.

Within the detailed-settlement stage, boundaries resolve in this order:

1. `season`: matching practices whose activation either has no season filter or
   includes the entered season in `activation.seasonKeys`
2. Named moon-phase boundary from `getMoonPhaseAtSecond`: Birth, Food, Housing,
   Faith, Migration, then Death, each lasting configurable `phaseDurationSec`
3. Vassal Life Map then steps on the same one-second path, independently of
   lunar phases

## Practice activation values

### `season`

Currently used by Cultivate, which activates only when entering Summer. Only
player-controlled detailed settlements activate map production.

Phase-scheduled practices (Forage, Administration, Raise Houses, and other
named-phase work) fire from those moon-phase handlers, not from `newMoon` or
`fullMoon` triggers.

### `passive`

Passive effects are queried by the boundary that consumes them; they do not
create their own time advance. Smokehouse, Caravanserai, and Counting House
replaced the former Preservation passives.

## Worker assignment trigger

Assignments are recalculated from current site cohorts for every activation or
passive query. Each class creates
`floor((adults + elders) / 10)` tokens. Villager tokens assign before Stranger
tokens, practices left-to-right.

Scaled-value practices use `1 + effective workers` and therefore retain their
base effect with no assigned token. Build practices keep their worker-required,
effective-worker-only behavior.

## Vassal selection

`settlementSelectVassal` is a timeline action. Candidate preview uses a cloned
serialized state; committing selection regenerates through authoritative
`state.rng` and validates the pool hash.

## Legacy settlement-exec triggers

The following `newMoon` / `fullMoon` / `MOON_CYCLE_SEC` schedule is the
legacy `settlement-exec` path. It is not current detailed-settlement six-phase
stepping. Do not mix these triggers with Birth/Food/Housing/Faith/Migration/Death.

### Second-stage order (legacy)

When `cmdTickSimulation` advances an integer second, the legacy settlement-exec
path used this moon-cycle schedule:

1. `season`: matching practices whose activation either has no season filter or
   includes the entered season in `activation.seasonKeys`
2. `newMoon`: when `tSec > 0 && tSec % MOON_CYCLE_SEC === 0`
3. `fullMoon`: at the midpoint of the moon cycle
4. annual: when a season change enters season index zero

The annual sub-order is demographics/social changes, global chaos, newly passed
vassal interventions, then same-boundary vassal death.

### `newMoon` (legacy)

Used by Administration and build practices on the settlement-exec path.
Administration plans from one activation-start snapshot before moves are
applied. Build work uses assigned worker effectiveness.

After new-moon practices, stored-food decay and loose-food halving resolve.

### `fullMoon` (legacy)

Midpoint of `MOON_CYCLE_SEC`. Not a named detailed-settlement phase.

### `passive` (legacy)

Used by Preservation and inert vassal placeholders on the settlement-exec path.
Passive effects are queried by the boundary that consumes them; they do not
create their own time advance.
