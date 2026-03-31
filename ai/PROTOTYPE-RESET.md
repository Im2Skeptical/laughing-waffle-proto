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