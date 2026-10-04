# Sim-runner save slots

Public factory stays on `src/controllers/sim-runner.js`. Do not add new
detailed-settlement gameplay here.

## Files

- `save-slots.js` — localStorage slot keys, save meta, timeline payload
  serialize/normalize, export/import validation, and inspect/read/write helpers
  with explicit args. Save/export retain every checkpoint and the existing schema.
- `save-diagnostics.js` — storage access/error classification and on-demand origin
  usage estimates. Runtime diagnostics never enter the serialized game or timeline.

`createSimRunner`, tick, `rebuildStateAtSecond` wiring, playback, and
`loadFromSlot` apply-to-runner stay on the orchestrator. Callers import
`createSimRunner` from `src/controllers/sim-runner.js`.
