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

Continue reads the saved text on the main thread, then parses, validates and
replays it in `../save-load-worker.js` through `../save-load-worker-service.js`.
The worker also prepares every historical summary with the official tick and
action order, in an isolated replay timeline. Game entry installs those runtime
summaries before the first graph draw, so loaded history and settlement scopes
can use the existing summary cache immediately. Save schemas and forecast
anchors remain unchanged.
The worker uses the same authoritative inspector. The runner installs the full
result only while entry remains current. Unsupported workers use the ordinary
inspector; cancellation terminates pending worker replay.

`createSimRunner`, tick, `rebuildStateAtSecond` wiring, playback, and
`loadFromSlot` apply-to-runner stay on the orchestrator. Callers import
`createSimRunner` from `src/controllers/sim-runner.js`.
