# Sim-runner save slots

Public factory stays on `src/controllers/sim-runner.js`. Do not add new
detailed-settlement gameplay here.

## Files

- `save-slots.js` — save meta, timeline payload
  serialize/normalize, export/import validation, and inspect/read/write helpers
  with explicit args. Save/export retain every checkpoint and the existing schema.
  Slot read/write/inspect methods are asynchronous. Slot listings read only metadata.
- `save-storage.js` — native IndexedDB connection, atomic payload/metadata
  transactions and one-time transfer of compatible current-schema localStorage saves.
  Source keys are removed only after the transfer commits; obsolete/damaged saves
  and unrelated keys stay untouched. All subsequent save operations use IndexedDB.
- `save-diagnostics.js` — storage access/error classification and on-demand origin
  usage estimates for IndexedDB, localStorage and the browser's origin quota.
  Runtime diagnostics never enter the serialized game or timeline.
  Save attempts separate synchronous serialization/enqueue time from elapsed
  IndexedDB access/transaction time; the latter includes event-loop delays.

`createSimRunner`, tick, `rebuildStateAtSecond` wiring, playback, and
`loadFromSlot` apply-to-runner stay on the orchestrator. Callers import
`createSimRunner` from `src/controllers/sim-runner.js`.
