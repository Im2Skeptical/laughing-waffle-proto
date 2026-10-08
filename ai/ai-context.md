# Current Project Context

Concise invariants for agents. Always read this file. Which other docs to
open is in root `AGENTS.md` — do not also load `CONTEXT.md`, `ai/sim.md`,
and `ai/ui.md` on every task. Exact tunables live in
`src/model/game-config.js` and detailed gamepiece definitions in
`src/defs/gamepieces/detailed-settlement-defs.js`; do not copy those
registries here.

The project is an in-progress, wide Civilization content and systems buildout.
A playable first pass of hosted Stock, specialist classes, neutral settlements,
and spatial conflict is implemented. UX, tooling, wider content coverage, and
balance are being developed iteratively. For coverage, provisional choices,
deferred mechanics, and playtest questions, see `docs/civilization-milestone.md`.
Earlier redesign plans in `ai/history/` are historical decisions, not pending
work; read them only when investigating a past design decision.

Routing skills live in `.grok/skills/`.

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
- Every player settlement has exactly five Practice slots. Neutral settlements use priced market inventories instead of installed Practices or Structures. This fixed design
  limit preserves readability and composition choices; UX and gamepieces must
  work within it. Structure capacity is separate.
- Gamepiece behavior is DSL-first. Extend a generalized operation before adding
  bespoke content logic.
- Practices explicitly use Scheduled or Charge mode. Private Charge is not Stock;
  full legal recipes Discharge automatically through the authoritative event queue.
  Each Practice can Discharge once per root chain; refilled Charge is retained.
  CivContent 2.6 coverage/deviations: `docs/civcontent-2.6-implementation.md`.

`npm run check:architecture` guards the first and layering rules.

## Current schemas

Authoritative numbers:

- Game state v31; runner saves v22. Older saves are rejected.
- Browser save slots use IndexedDB database v1; the runner-save envelope is unchanged.
- Each run serializes schema-v17 Game Settings, Gamepieces, and Life Map
  generator settings in `gameConfig`.
- Map Lab drafts v8; scenario libraries v4.
- Vassal Lab draft/preset schema v5.
- Life Map Lab drafts v2.
- Card reviewer drafts/export v1; stable browser storage independent of game saves and builds.
- Life Map generator settings v5; serialized Life Map graph v4.
- Debug profile library/export v3 (fresh-run recipes; no live Vassal overrides).
- Named debug draft libraries v1.
- Debug drafts are inert until launched from Gym ? New run setup; saved combined
  profiles can also initialize New Game through the menu's Use dev settings toggle.
  Card-review proposals require the menu's Use edited cards in new games toggle;
  new runs capture them in gameConfig. Existing runs and deterministic replay
  use their own serialized definitions, never browser review storage.
  Optional boolean card-definition `locked` flags default to unlocked and are
  captured through the same review/profile path. They exclude shop offers and
  Stock Supply generation candidates while preserving installed-card behavior.
- Fresh runs do not migrate obsolete saves or presets.

## Current prototype setup

Regular player New Game uses the Starter_02 map, nine fixed roads, and tuning.
The menu's Use dev settings toggle explicitly substitutes a saved combined profile. Each
run chooses one existing road through `state.rng`; its two adjacent regions
become the only player-controlled detailed settlements, with the first in
authored region order serving as capital. Four authored neutral settlements are placed deterministically, including one adjacent and connected to the capital. Each new game seeds one weak frontier Monster. Other regions are frontier. The
authored debug fixture still has five detailed settlements in Regions01, 03,
06, 07, and 11. Debug profiles and Map Lab can explicitly replace that setup.
Region state owns colour, controller, connections, `structureCapacity`, and
the independent detailed-settlement toggle. New runs roll every region's
structure capacity from 5–8 in authored order through `state.rng`; Map Lab
regions can pin an explicit capacity. Each player detailed site owns
Villager/Stranger cohorts with orthogonal Scholar/Warrior subsets, anonymous elder ages, five hosted-Stock practice slots, a regional construction strip, aggregate Elder Order state,
and local moon/meal summaries. Spatial Monsters, settlement loss history, Chaos, persistent survival
knowledge, and the single vassal lineage are civilization-global.

## Pointers

- Simulation (six named moon phases, food/housing/faith/migration/death,
  practices, construction, Vassal Life Map): [`ai/sim.md`](sim.md)
- UI (screens, map, settlement, timegraph, dock, Life Map chrome, menu/saves):
  [`ai/ui.md`](ui.md)
- File and test routing: [`ai/repository-map.md`](repository-map.md)
- Glossary: [`CONTEXT.md`](../CONTEXT.md)
- Art/presentation contract: [`ai/visual-overhaul.md`](visual-overhaul.md)
- Generate or replace card illustrations: read
  [illustrate-gamepiece](../.agents/skills/illustrate-gamepiece/SKILL.md)
  before prompting, including requests that name only a Practice or Structure.
- Routing skills: [`.grok/skills/`](../.grok/skills/)

Gym ? New run setup owns Map Lab, Game Settings and Life Map Lab under one
combined launch profile. Gamepiece editing belongs to the card reviewer; reviewed
cards can be captured in the launch profile. Regular game is a read-only current-build baseline;
copies launch through the same initializer as player New Game, including road
randomization and neutral seeding. Museum owns saved states at specific seconds.
The live hold-button workshop keeps Vassal candidate replacement and save diagnostics. Verification commands live in
`ai/repository-map.md`.
