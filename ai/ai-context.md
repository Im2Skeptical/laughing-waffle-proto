# Current Project Context

Concise invariants for agents. Read this first, then only the relevant of
`ai/sim.md`, `ai/ui.md`, or a section of `ai/repository-map.md`. Ubiquitous
language is `CONTEXT.md`. Exact tunables live in `src/model/game-config.js`
and detailed gamepiece definitions in
`src/defs/gamepieces/detailed-settlement-defs.js`; do not copy those
registries here.

The map-driven settlement redesign and data-driven debug-tool expansion are
implemented. Their plan documents are historical decision records, not
pending task lists.

## Non-negotiable engine rules

- All simulation randomness uses `state.rng`; never use `Math.random()`.
- Vassal candidates, node content, Crisis, and mortality use the serialized
  `state.rng.vassalSeed` substream so Elder cohort rolls cannot perturb Vassal
  outcomes. Level-up offer pools use the separate serialized
  `state.rng.vassalDevelopmentSeed` substream. Generated Life Map topology and
  room families use `state.rng.vassalLifeMapSeed`. Procedural portrait traits
  use `state.rng.vassalPortraitSeed`. Do not let one stream perturb another.
- `GameState` is JSON-only. Runtime RNG helpers are removed for serialization
  and restored on deserialize.
- `rebuildStateAtSecond(tSec)` is the authoritative deterministic replay path.
- `tSec` is authoritative time and advances only through simulation ticks.
- Definitions are data, model modules own rules, controllers orchestrate, and
  views render or emit input.
- Gamepiece behavior is DSL-first. Extend a generalized operation before adding
  bespoke content logic.

`npm run check:architecture` guards the first and layering rules.

## Current schemas

Authoritative numbers:

- Game state v20; runner saves v12. Older saves are rejected.
- Each run serializes schema-v13 Game Settings, Gamepieces, and Life Map
  generator settings in `gameConfig`.
- Map Lab drafts v5; scenario libraries v4.
- Vassal Lab draft/preset schema v5.
- Debug drafts in browser storage are inert until a fresh test run is started.
- Fresh runs do not migrate obsolete saves or presets.

## Current prototype setup

Player New Game uses the Starter_02 map, nine fixed roads, and tuning. Each
run chooses one existing road through `state.rng`; its two adjacent regions
become the only player-controlled detailed settlements, with the first in
authored region order serving as capital. All other regions are frontier. The
authored debug fixture still has five detailed settlements in Regions01, 03,
06, 07, and 11. Debug profiles and Map Lab can explicitly replace that setup.
Region state owns colour, controller, connections, `structureCapacity`, and
the independent detailed-settlement toggle. New runs roll every region's
structure capacity from 5–8 in authored order through `state.rng`; Map Lab
regions can pin an explicit capacity. Each detailed site owns
Villager/Stranger cohorts, anonymous elder ages, stored and loose food, five
practice slots, a regional construction strip, aggregate Elder Order state,
and local moon/meal summaries. Chaos, monsters, loss, persistent survival
knowledge, and the single vassal lineage are civilization-global.

## Pointers

- Simulation (six named moon phases, food/housing/faith/migration/death,
  practices, construction, Vassal Life Map): [`ai/sim.md`](sim.md)
- UI (screens, map, settlement, timegraph, dock, Life Map chrome, menu/saves):
  [`ai/ui.md`](ui.md)
- File and test routing: [`ai/repository-map.md`](repository-map.md)
- Glossary: [`CONTEXT.md`](../CONTEXT.md)
- Art/presentation contract: [`ai/visual-overhaul.md`](visual-overhaul.md)

Map Lab, Game Settings, Gamepieces, Vassal Lab, and Life Map Lab start a
fresh deterministic run on apply. Verification commands live in
`ai/repository-map.md`.
