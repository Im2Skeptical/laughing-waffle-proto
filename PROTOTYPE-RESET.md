# Prototype Reset Notes

This repo is the active sandbox for the sparse rework.

## Keep
- Deterministic simulation stepping
- JSON-serializable authoritative state
- Replay authority via `rebuildStateAtSecond(tSec)`
- Process handling
- Defs and generalized DSL infrastructure where it still reduces bespoke logic

## Remove or Replace Early
- Pawn-centric interaction flow
- Inventory-centric progression flow
- Old turn/phase assumptions that block the new prototype
- UI that exists only to support the old gameplay loop

## First Vertical Slice
- One minimal world/state shape
- One new turn advancement loop
- One or two player actions
- One compact UI path for desktop and mobile validation

## Hard Gates
- No `Math.random()`; randomness must use `state.rng`
- `GameState` stays JSON-serializable
- Replay and live simulation must stay equivalent at the same `tSec`
- Model code stays free of UI imports

## Test Focus
- Turn advancement determinism
- Action ordering at second boundaries
- Replay equivalence after branch edits
- Save/load stability after removing pawn and inventory structures
