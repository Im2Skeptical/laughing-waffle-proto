# Project Context And Current Settlement Prototype Rules

This document is the current authoritative AI-facing context for the repo.

It has two jobs:

1. Preserve the engine/runtime invariants that must stay true across refactors.
2. Describe the current settlement prototype as it actually exists now, especially the timegraph, projection, and vassal flow.

When older docs, comments, or legacy system affordances disagree with this file, follow this file.

## 1. Project Overview

### Genre
Deterministic, time-driven strategy/city-builder prototype with replay, forecast, and timeline browsing.

### Technology
- JavaScript ES modules
- PixiJS for rendering only
- Pure JavaScript authoritative model

### Current board framing
The codebase still carries generic timegraph and timeline-edit affordances, but the current player-facing prototype is the settlement/vassal flow.

The prototype is intentionally more locked down than the generic engine:
- the player does not freely edit the timeline
- the player does not freely branch around prior vassal choices
- projection is primarily used for browsing and for the settlement timegraph UX

## 2. Non-Negotiable Engine Invariants

### Determinism
- All randomness must flow through `state.rng`.
- `Math.random()` is forbidden.
- Simulation cannot depend on wall-clock time, frame timing, UI state, or platform-specific behavior.

### Time authority
- `tSec` is the universal authoritative timeline axis.
- Time advances only through simulation ticks.
- Replay, forecast, graph sampling, and browsing all resolve against `tSec`.

### Serialization
- `GameState` must remain 100 percent JSON-serializable.
- No classes, functions, closures, Maps, Sets, or circular references in authoritative state.
- Derived/runtime-only data must stay outside serialized state or be rebuilt after deserialize.

### Replay authority
- `rebuildStateAtSecond(tSec)` is authoritative.
- Replay must produce the same state for the same base state, actions, and seed.
- Forecast and graph reads may use caches, but caches are never authority.

### Layering
- `src/defs/*`: immutable data and declarative behavior description only.
- `src/model/*`: authoritative rules, state transitions, replay, effects, simulation.
- `src/controllers/*`: orchestration and runtime-only coordination.
- `src/views/*`: render/input only. No gameplay rules.

### DSL-first behavior authoring
For gamepiece behavior:
1. Use existing DSL affordances first.
2. If needed, add a generalized DSL capability.
3. Express content behavior as data using that capability.

Avoid content-specific one-off imperative gameplay logic when a reusable DSL primitive can cover it.

## 3. Timegraph Terminology

Use these names consistently.

- `historyEndSec`: authoritative committed history frontier on the active branch.
- `computedCoverageEndSec`: farthest future second the projection system has actually computed.
- `revealedCoverageEndSec`: farthest future second the settlement timegraph has visually unveiled.
- `browseCapSec`: strict player browse cap. In the current prototype this is equal to `revealedCoverageEndSec`.
- `displayedLossSec`: dynamic right-edge/header target used while exact civilization loss is unresolved.
- `projectedLossSec`: exact projected civilization loss second, when known.
- `currentVassalDeathSec`: death second of the active vassal.
- `currentVassalDeathResolved`: whether forecast coverage has reached that death second.

These are runtime/controller concepts. They are not authoritative serialized model state.

## 4. Timeline Zones In The Current Prototype

The architecture still supports more generic zone concepts, but the current player-facing prototype uses a simplified interpretation:

- Fixed history:
  - committed prior play
  - not editable in the normal prototype UI
- Active projection:
  - future forecast beyond committed history
  - preview-only
  - browsable only up to the current reveal edge

The generic engine still retains concepts like editable history windows, truncation, and broader timeline operations because later debug tools or future gameplay may need them. Those affordances are not normal player powers in the current prototype.

## 5. Projection, Reveal, And Commit Contract

### Projection
- Projection is pure read-side simulation.
- Projection never mutates authoritative model state.
- Projection starts from timeline truth and may be accelerated by caches or worker-built chunks.

### Reveal
- The settlement prototype uses a strict reveal gate.
- The player may only browse forecast up to `revealedCoverageEndSec`.
- Computed-but-not-yet-revealed forecast remains inaccessible to the player.

### Dynamic right edge
- On boot and after timeline invalidation, the graph must render immediately without waiting for exact civ-loss resolution.
- The header year, right-side graph extent, and reveal target all derive from the same `displayedLossSec`.
- While exact loss is unresolved, `displayedLossSec` advances from revealed/computed progress plus a display buffer.
- Once exact loss resolves, `displayedLossSec` clamps to the resolved loss and the reveal closes the remaining gap.

### Reveal shape
- The current prototype uses a fixed-seconds reveal-gap model.
- Pending-commit reveal may be faster than idle/default reveal.
- The buffer proportion naturally shrinks as the total displayed span grows.

### Commit
- Committed history remains authoritative.
- Projection browsing is preview-only.
- Converting forecast into fixed history still happens through commit/replay truth, not by promoting view state.

## 6. Current Settlement Prototype Rules

### Vassal progression
- Vassal choice is permanent.
- The player works forward through vassals in sequence.
- The player does not freely revisit earlier choices or freely branch around prior selected vassals.

### Unlock rule
- The `Next Vassal` control becomes available once the current vassal's death is resolved in forecast coverage.
- It does not wait for exact civilization-loss resolution.
- It also does not require the reveal edge to reach that death second.

### Selection timing rule
- Even though the button unlocks on forecast readiness, the next selection still needs to be recorded at the authoritative current second.
- In practice, opening the next-vassal selection first commits the timeline to the already-computed death second of the current vassal, then opens the chooser there.
- This preserves the prototype rule that the next vassal is chosen at the prior vassal's death boundary while keeping the UX responsive.

### History vs projection
- Selected vassal history becomes fixed history once committed.
- Future vassal effects remain forecast until committed.
- The normal prototype UI does not expose general-purpose timeline editing.

## 7. Current Non-Goals For Normal Player UX

The following engine affordances may exist in code, but they are not normal player-facing features in the current prototype:

- freeform pawn-move timeline editing
- crop-selection timeline editing
- tag toggle or recipe-order timeline editing
- broad editable-history gameplay
- full-timegraph authoring tools

If work touches those systems, treat them as retained engine/debug affordances unless the task explicitly changes the prototype design.

## 8. Debug And Future Affordances

The system should keep supporting future or debug-only extensions, even though they are locked off in the prototype:

- broader timegraph zone policies
- truncation-based editing
- more editable moments within a vassal life
- future projection caps for gameplay or performance reasons
- a debug menu exposing fuller timeline controls

Preserve these as architectural affordances where practical, but do not let them distort the current prototype contract.

## 9. Testing And Audit Expectations

Before changing timegraph, replay, or projection behavior, perform an impact analysis:

1. Determinism
2. Serialization
3. Replay authority
4. Layering
5. Naming clarity

### Expected verification
- `rebuildStateAtSecond(tSec)` remains authoritative.
- Determinism suite passes.
- Projection parity remains aligned with replay.
- Timeline invalidation clears stale forecast state.
- Settlement debug/probe surfaces expose the current runtime forecast lanes clearly.

### Current profiling focus
When auditing projection performance, pay particular attention to:
- full-state serialize/deserialize churn in projection
- canonicalization cost on projection reads
- worker-built coverage versus main-thread fallback coverage
- exact-loss probing cost from repeated future-state reads
- lag between computed coverage, revealed coverage, and committed history

## 10. Guidance For AI Assistance

- Do not assume older generic timegraph affordances are currently player-facing.
- Use explicit names that match the runtime lanes in this document.
- Keep settlement-specific forecast policy in controllers/runtime modules, not in Pixi views.
- Keep generic timegraph controller logic generic.
- Explain what changed, why it changed, and how to test it.
