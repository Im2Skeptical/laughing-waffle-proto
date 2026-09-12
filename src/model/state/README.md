# GameState legacy split

Public serialize/deserialize/validate API stays on `src/model/state.js`.
Do not add new detailed-settlement gameplay here.

## Files

- `board-legacy.js` — hub/board/env instance constructors, occupancy
  rebuilders, and location/discovery `ensure*` helpers.
- `pawn-legacy.js` — pawn collection, AI, skill, and role field helpers.

Callers import from `src/model/state.js`.
