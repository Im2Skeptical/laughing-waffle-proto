# Data-Driven Debug Tools Expansion

## Summary

Expand Development Tools into four sections:

- Map Lab for geography and starting settlements
- Game Settings for simulation-wide tuning
- Gamepieces for detailed structures and practices
- Vassal Lab for deterministic custom vassal injection

Game Settings and Gamepieces use generated editors, named browser presets, and
JSON import/export. Their drafts are inert until a fresh test run is started.
Starting a test run combines the current Map Lab draft, Game Settings draft,
and Gamepieces draft into one serialized run configuration.

## Impact analysis

### Determinism

- Editable settings and gamepiece values are copied into `GameState` before
  simulation begins. Simulation never reads mutable browser storage.
- Vassal injection is a timeline action containing the complete normalized
  vassal specification. It consumes no RNG.
- Definition lookup is state-scoped and pure. No module-global definition is
  mutated.

### Serialization

- Bump GameState and runner saves from v5 to v6.
- Add a JSON-only `gameConfig` containing schema-v1 settings and detailed
  gamepiece definitions.
- Reject v5 saves without migration.
- Debug draft libraries use independent versioned browser-storage keys and do
  not enter `GameState` until a fresh run is created.

### Replay

- `rebuildStateAtSecond(tSec)` reads all simulation tuning from the serialized
  base state.
- A debug vassal action is replayed using its authored payload and target
  second; no preview-only or controller state affects the result.
- Rewinds and branches retain the run configuration because it belongs to the
  timeline base state.

### Layering

- Definition and draft validation live in model modules.
- Controllers own browser persistence, draft selection, import/export, and
  fresh-run orchestration.
- DOM views generate controls and emit edits only.
- The runner remains the only layer that resets or mutates a live run.

### DSL-first behavior

- Practice behavior remains expressed with the existing generalized effect
  operations.
- The Gamepieces editor changes numeric parameters inside those declarative
  effects; it does not add bespoke execution branches.
- No new DSL operation is required.

## Editable game settings

The initial registry covers the active map-driven simulation:

- season and moon duration
- worker-token population and class effectiveness
- child, adult, and elder meal consumption
- stored and loose food decay
- faith childbirth rates, maturation, elder transition, and elder mortality
- happiness streaks, partial-feed behavior, starvation, housing, and Bronze
  collapse
- chaos income/growth, faith mitigation, monster conversion, and loss threshold
- Elder Order resistance
- generated-vassal ages and intervention requirement offsets

Adding a setting to the registry automatically adds it to the editor.

## Editable gamepieces

The editor traverses every authored detailed structure and practice. It exposes
numeric tuning fields while preserving IDs, operation names, evaluator names,
and references:

- structure capacity scaling
- worker capacities and charge periods
- effect amounts, packet size, preservation strength, work rate, and required
  work

New detailed structures and practices automatically appear when added to the
definition registries.

## Vassal Lab

The lab supports:

- target detailed settlement
- starting and death ages
- trait and its prestige modifier
- profession
- three ordered interventions
- resistance snapshot and the three exact prestige requirements
- optional replacement of the current living vassal

Injection records a deterministic debug action at the viewed second.

## Verification

- Model tests for validation, state-scoped lookup, setting effects, definition
  effects, serialization, v5 rejection, and replay parity
- Tests for deterministic vassal injection and replacement without RNG changes
- Browser probes for generated tabs, mobile input focus, named preset
  save/load/delete/reload, JSON import/export, fresh-run application, and
  vassal injection
- `npm run verify`, Map Lab probe, settlement probe, and a mobile visual probe

