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
- Vassal candidates, node content, Crisis, and mortality use the serialized
  `state.rng.vassalSeed` substream so Elder cohort rolls cannot perturb Vassal
  outcomes.
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

- Game state uses schema v14 and runner saves use schema v8; older saves are rejected.
- Each run serializes schema-v8 Game Settings and Gamepieces in `gameConfig`.
- Map Lab drafts use schema v4; scenario libraries use schema v3.
- Debug drafts in browser storage are inert until a fresh test run is started.
- Fresh runs intentionally do not migrate obsolete saves or presets.

The 15-region world has detailed settlements in Regions01, 03, 06, 07, and 11.
All five are player-controlled; Region07 is the capital. Every other authored
region starts as frontier. Region state owns
colour, controller, connections, `structureCapacity`, and the independent
detailed-settlement toggle.

New runs roll every region's structure capacity from 5–8 in authored order
through `state.rng`; Map Lab regions can instead pin an explicit capacity.

Each detailed site owns Villager/Stranger cohorts, anonymous elder ages, stored
and loose food, five practice slots, regional structure slots, aggregate Elder
Order state, and local moon/meal summaries. Chaos, monsters, loss, persistent
survival knowledge, and the single vassal lineage are civilization-global.

## Current simulation

- Forage produces food at the start of each Food phase, before Administration
  routes food, with a baseline output that scales through its one worker slot.
- Cultivate produces food each Summer from a player same-colour connected-region
  evaluator and a baseline-preserving effective-worker multiplier.
- Administration is the only food transport. Each card has one evaluated shared
  cap, moves meal-safe surplus toward shortages from one activation-start
  snapshot, and cannot relay received food within a moon. Preservation expands
  its endpoints across fully player-controlled paths.
- Preservation relatively reduces stored-food decay and remains effective with
  no workers. Its data-driven `connectedAdministrationReach` flag controls
  whether local Administration expands across player-controlled paths. Build practices create Granaries or Mud
  Houses and wait at full regional structure capacity.
- Granary and Mud House capacities scale with local count squared.
- Food fills stored capacity first, then loose food; meals consume loose first.
- The moon uses six fixed phases with configurable `phaseDurationSec`: Birth,
  Food, Housing, Faith, Migration, and Death. At the default one second per
  phase, a moon remains six seconds and stays independent of the 32-second year.
- Birth resolves building practices, births, child maturation, and adult-to-elder
  transitions. Elder ages advance annually at the first following Birth phase.
- Food runs Administration and feeds Villagers before Strangers. Cohorts fed
  below the configured partial-feed minimum (50% by default) immediately lose
  one happiness step while still advancing their missed-meal starvation streak;
  the unfed share enters the current moon's migrant bucket only when that streak
  triggers starvation.
- Housing assesses the population not already reserved for migration, caps
  happiness at Neutral or Negative when overcrowded, and adds exactly the
  unhoused overflow, displacing Strangers before Villagers.
- Faith applies Food/Housing happiness evidence, advances a three-result faith
  streak, and adds newly Bronze-and-Negative cohorts to the same migrant bucket.
  Each Faith reckoning also adds uncapped civilization-wide Primordial pressure:
  base pressure grows by cadence-based exponentiation independent of settlement
  count, then loss pressure and current population/Faith resistance determine
  incoming Chaos.
- Migration resolves all food, housing, and faith causes identically using
  snapshot-based, globally reserved housing. Death then resolves arrival meals,
  unplaced-migrant hardship, monthly elder mortality, and stored/loose food rot.
  Surviving migrants join the destination Stranger cohort.
- Elder Orders remain aggregate cohort state but do not affect Vassal candidates,
  prices, inventories, or resolutions. The Vassal Life Map is a centralized,
  declarative 44-node DAG with four visible lanes and 11 depths. Entered nodes
  persist their content while choices, purchases, and one shop reroll are staged.
- Explicit node confirmation applies staged effects, advances accumulated years
  through normal ticks, pays recurring Prestige/development once, and makes one
  post-age natural-mortality roll. Only surviving completion exposes outgoing
  nodes; terminal survival retires the Vassal and death or retirement persists
  the completed life before generating the next three candidates.
- Cunning and Wisdom drive recurring income; Effectiveness and Intelligence
  discount year and Prestige costs. Practice/Structure prices live beside their
  gamepiece definitions, while route prices and all other Life Map tuning are in
  `vassal-life-map-defs.js`.

Boundary order is seasonal Cultivate followed by whichever lunar phase is due.
Faith resolves chaos after faith changes. Vassal node time uses the same
authoritative one-second stepping path but resolves independently of lunar phases.
Current and previous moon reports are
bounded JSON state used for replay and phase tooltips.

## Current UI

- The map shows all-region polygons, player ownership nodes, worker pawns,
  structure-capacity glyphs, food and population transfer packets, a
  civilization summary, and a compact selected-region card. Detailed regions
  show red starvation and amber overcrowding glyphs from the currently viewed
  state; hover and the selected-region card expose the underlying counts.
- Settlement Overview and Demographics are local to the opened detailed site.
- The shared survival strip reports viewed year/season, projected or actual
  civilization loss, and the monotonic best survival year observed.
- The timegraph automatically uses civilization scope on the map and local
  scope in a settlement. Series choices are independent by scope.
- Forecast unveiling drives the read-only viewed state and playhead without
  advancing committed history or consuming RNG.
- Long forecasts retain lightweight graph summaries after heavy state snapshots
  are evicted, while active forecast tails remain pinned for worker continuation.
- The season/moon wheel shows fixed icons for all six lunar phases. The active
  icon is highlighted and each tooltip combines the phase rules with live or
  previous-moon totals.
- Candidate cards reveal age, settlement, Prestige, and four stats but keep the
  Life Map hidden. Selection opens a dedicated full-topology Life Map screen.
  Every node can be inspected; its family description is shown in the right
  panel, while only entering an available node reveals its persisted options or
  inventory. Single click inspects, the panel button enters, and double-click
  enters an available node. Family colors distinguish the node types.
  Confirmation locks map input while its accumulated years auto-advance to the
  pending resolution boundary.
- Selecting a Vassal retains the prior timeline as a tinted comparison. Each
  confirmed node unveils only through that node's pending resolution boundary;
  after a Vassal dies or retires, the new timeline can continue unveiling to
  civilization extinction. The candidate drawer remains closed until the player
  explicitly chooses Next Vassal. Timegraph Vassal markers come only from
  persisted life events; no future inventory or mortality result is exposed.
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
- Vassal Lab replaces an unrevealed candidate with explicit age, settlement,
  Prestige, and four stats without consuming RNG. Its draft/preset schema is v4.

## Verification

- `npm run verify`: architecture, source reachability, Pages build, and model
  tests.
- `npm run probe:settlement`: map, settlement, graph, vassal, survival, and
  responsive interaction probe against the built site.
- `npm run probe:map-lab`: Map Lab and development-tool interaction probe.

Detailed test selection and file routes are in `ai/repository-map.md`.
