# UI Root Modules

This folder contains focused helpers used by the active map/detailed-settlement
root in `src/views/ui-root-settlement-pixi.js`.

## Current modules

- `settlement-debug-api.js`
  - Publishes the narrow semantic/debug snapshot used by browser probes.
- `settlement-graph-series-menu.js`
  - Owns the scope-specific timegraph series chooser.
- `settlement-timegraph-window.js`
  - Owns timegraph horizon/window calculations and projection-cache creation.

## Conventions

- Keep modules focused and side-effect free except for explicit runner/view
  callbacks.
- Prefer passing dependencies (runner/controller/view callbacks) over reaching
  global state.
- Keep behavior-preserving refactors separate from logic changes.
- Do not restore modules for the superseded inventory, environment-board,
  individual-council, or scroll-graph UI.
