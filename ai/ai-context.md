# Current Project Context

This is the concise, authoritative AI-facing description of the implemented
prototype. Use `ai/repository-map.md` for file and test routing. Exact tunable
defaults live in `src/model/game-config.js` and detailed gamepiece definitions
live in `src/defs/gamepieces/detailed-settlement-defs.js`; do not duplicate
those registries into documentation.

The map-driven settlement redesign and data-driven debug-tool expansion are
implemented. Their plan documents are historical decision records, not pending
task lists.

## Non-negotiable engine rules

- All simulation randomness uses `state.rng`; never use `Math.random()`.
- `GameState` is JSON-only. Runtime RNG helpers are removed for serialization
  and restored on deserialize.
- `rebuildStateAtSecond(tSec)` is the authoritative deterministic replay path.
- `tSec` is authoritative time and advances only through simulation ticks.
- Definitions are data, model modules own rules, controllers orchestrate, and
  views render or emit input.
- Gamepiece behavior is DSL-first. Extend a generalized operation before adding
  bespoke content logic.

`npm run check:architecture` guards the first and layering rules.

## Current state and schemas

- Game state and runner saves use schema v6; older saves are rejected.
- Each run serializes schema-v1 Game Settings and Gamepieces in `gameConfig`.
- Map Lab drafts and scenario libraries use schema v2.
- Debug drafts in browser storage are inert until a fresh test run is started.
- Fresh runs intentionally do not migrate obsolete saves or presets.

The 15-region world has detailed settlements in Regions01, 03, 06, 07, and 11.
All five are player-controlled; Region07 is the capital. Region state owns
colour, controller, connections, `structureCapacity`, and the independent
detailed-settlement toggle.

Each detailed site owns Villager/Stranger cohorts, anonymous elder ages, stored
and loose food, five practice slots, regional structure slots, aggregate Elder
Order state, and local annual/meal summaries. Chaos, monsters, loss, persistent
survival knowledge, and the single vassal lineage are civilization-global.

## Current simulation

- Cultivate produces local food from effective workers and the declarative
  adjacent-player-same-colour map evaluator.
- Administration is the only food transport. Moves use one activation-start
  snapshot, traverse one authored edge per token, and cannot multi-hop within a
  moon.
- Preserve reduces stored-food decay. Build practices create Granaries or Mud
  Houses and wait at full regional structure capacity.
- Granary and Mud House capacities scale with local count squared.
- Food fills stored capacity first, then loose food; meals consume loose first.
- Annual demographics consume RNG in authored region, class, and elder-age
  order using pre-transition snapshots.
- Housing is a soft limit with migration pressure. Annual over-cap sites first
  cap happiness at Neutral (or Negative above the configured ratio), then send
  population above the configured 80% target to connected detailed sites with
  reserved housing headroom.
- Worsening partial meals, starvation, and bronze-faith collapse can also move
  population one edge. Migrants join the destination Stranger cohort and must
  eat on arrival for hunger/collapse movement; unfed arrivals die. Transfer
  allocation is snapshot-based, globally reserved, and deterministic.
- Elder Orders are aggregates. Vassal interventions use resistance snapshots,
  ordered prestige gates, deterministic lifespan boundaries, and replayable
  timeline actions.

Boundary order is seasonal Cultivate; new-moon Administration/build/decay;
full-moon native meals, happiness, migration/arrival meals, and loose decay;
then annual demographics, housing migration, faith/collapse migration, global
chaos, vassal interventions, and vassal death.

## Current UI

- The map shows all-region polygons, player ownership nodes, worker pawns,
  structure-capacity glyphs, food and population transfer packets, a
  civilization summary, and a compact selected-region card.
- Settlement Overview and Demographics are local to the opened detailed site.
- The shared survival strip reports viewed year/season, projected or actual
  civilization loss, and the monotonic best survival year observed.
- The timegraph automatically uses civilization scope on the map and local
  scope in a settlement. Series choices are independent by scope.
- Forecast unveiling drives the read-only viewed state and playhead without
  advancing committed history or consuming RNG.
- Vassal selection focuses its target and preserves the old/new forecast
  comparison, lifespan brackets, and fixed/editable/forecast history zones.
- Fullscreen and Debug share a responsive utility rail that must remain clear
  of settlement navigation on mobile landscape.

The forecast worker is a separately bundled Pages asset recorded in
`dist/build-manifest.json`; production should not silently rely on main-thread
fallback.

## Development Tools

- Map Lab edits world mechanics and detailed site state, supports named
  scenarios plus JSON import/export, validates storage/structure limits, warns
  about over-housing, and starts a fresh deterministic run on apply.
- Game Settings is generated from the active setting registry.
- Gamepieces is generated from detailed structure/practice definitions and
  exposes numeric DSL parameters.
- Vassal Lab records a fully specified deterministic timeline action without
  consuming RNG.

## Verification

- `npm run verify`: architecture, source reachability, Pages build, and model
  tests.
- `npm run probe:settlement`: map, settlement, graph, vassal, survival, and
  responsive interaction probe against the built site.
- `npm run probe:map-lab`: Map Lab and development-tool interaction probe.

Detailed test selection and file routes are in `ai/repository-map.md`.
