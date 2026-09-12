> Historical document. Not current routing. Not a task list. Not a source of schema numbers or paths. Current invariants: ai/ai-context.md. Current sim/UI: ai/sim.md, ai/ui.md. Current file routing: ai/repository-map.md.

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