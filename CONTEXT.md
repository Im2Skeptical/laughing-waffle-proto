# Civilization Survivor

Ubiquitous language for this prototype. Engine invariants and schema numbers:
`ai/ai-context.md`. Simulation: `ai/sim.md`. UI: `ai/ui.md`.

## Language

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **tSec** | Authoritative integer simulation second; time advances only through ticks. | wall-clock time, frame time, presentation time |
| **GameState** | JSON-only serialized simulation state for a run. | live objects, class instances, Maps/Sets as state |
| **rebuildStateAtSecond** | Authoritative deterministic replay to a given `tSec`. | scrubbing as simulation, mutating history in place |
| **gameConfig** | Per-run JSON Game Settings, Gamepieces, and Life Map generator settings. | live editor drafts, unsaved debug presets |
| **RNG stream** | `state.rng` plus named substreams (`vassalSeed`, `vassalDevelopmentSeed`, `vassalLifeMapSeed`, `vassalPortraitSeed`). | `Math.random()`, one shared seed for all rolls |
| **detailed settlement** | A region that simulates local cohorts, food, five practice slots, and a construction strip. | hub, generic settlement, village-as-token |
| **region** | Map polygon with colour, controller, connections, `structureCapacity`, and a detailed-settlement toggle. | tile, hex, zone |
| **New Game** | Player start: Starter_02, one rolled road, two adjacent player settlements plus four authored neutrals, first player region in authored order as capital. | five-site debug fixture as the player start |
| **debug fixture** | Authored five-site test setup in Regions01, 03, 06, 07, and 11. | New Game, default campaign map |
| **frontier** | A region with frontier control; authored neutral settlements have a separate external controller. | any non-player region, fog of war, unexplored |
| **structure capacity** | Horizontal construction cells (rolled 5–8, or Map Lab pinned). | building slots, five practice slots |
| **practice slot** | One of five local tableau slots holding a Practice. | structure slot, worker slot |
| **Practice** | Scheduled or Charge gamepiece that occupies a practice slot. | building, upgrade, order |
| **Structure** | Placed construction with origin, width, definition, and quality. | practice, tile improvement |
| **Stock** | Integer material hosted by an installed Practice, with capacity and Stock Traits. | settlement wallet, loose food, private Charge |
| **Stock Trait** | Material property used to match providers; Edible and Currency derive Food and purchasing totals. | Card Tag, class, worker specialty |
| **Card Tag** | Piece classification used by definition queries; Scholar staffing can add Knowledge. | Stock Trait, resource type |
| **Charge / Discharge** | Private Practice meter and its automatic cost-free effect at a legal full threshold, once per root chain. | Stock, Currency, worker-multiplied Discharge output |
| **provider** | Practice Stock host supplying a complete recipe: local first, then adjacent-and-connected player settlements. | Administration transport, global wallet |
| **Villager / Stranger** | Local cohorts. Villagers feed and assign before Strangers. | citizen, peasant, population (when a cohort is meant) |
| **moon phase** | One of six named phases: Birth, Food, Housing, Faith, Migration, Death. | newMoon, fullMoon, moon-cycle midpoint, `MOON_CYCLE_SEC` clock |
| **year / season** | Solar calendar independent of the moon, 32 seconds per year by default; seasonal Practices follow authored season filters. | moon as year, season as moon phase |
| **Happiness** | Cohort mood from food and housing, consumed as Faith evidence. | morale, loyalty, approval |
| **Faith** | Moon phase that applies happiness evidence, faith streak, social displacement, and Primordial pressure. | religion meter, piety resource |
| **Chaos** | Civilization-global Primordial pressure, monsters, and loss. | local unrest, site-only threat |
| **Elder Order** | Aggregate local elder cohort state; it does not affect Vassal candidates or prices. | Vassal council, candidate resistance |
| **Vassal** | The single civilization-wide lineage character with Prestige, four stats, and a Life Map. | hero, champion, leader, Elder |
| **Life Map** | Deterministic serialized DAG of Vassal nodes (Patronage, Development, Travel, shops, Crisis, Relic, Legacy). | skill tree, tech tree, random event deck |
| **Heirloom** | Temporary inheritable relic with Equipped, Carry, and Vault slots. Sanctified, then Unmarked, then Fragile. | inventory item, crafted gear, permanent relic |
| **Lifegraph** | Full-topology Life Map screen and playfield. | Regional Map, timegraph |
| **Prestige** | Vassal currency for Life Map purchases and recurring income. | gold, money, fame |
| **Phase cost** | Vassal node time paid as accumulated moon phases through normal ticks. | skipping time, free years, newMoon waits |
| **confirmation** | Atomic apply of a staged Life Map node or shop draft. | hover-preview as commit, auto-buy |
| **forecast unveil** | Read-only viewed-time advance that does not commit history or consume RNG. | simulating the future, spending RNG on preview |
| **viewed time** | Read-only playhead preview of an existing snapshot. | committed `tSec`, presentation-only time as authority |
| **committed time** | Authoritative history already simulated at `tSec`. | viewed preview, forecast tail |
| **Present** | Control that returns the playhead to the live committed second. | Pause, resume, play |
| **timegraph** | Illustrated forecast/history graph with Chaos/Resources/Population groups. | minimap, resource bar, calendar |
| **dock** | Lower-left Regional Map / Life Map / Settlement navigation pad. | header Map button, pause menu as travel |
| **Map Lab** | Debug editor for world and detailed-site drafts; apply starts a fresh run. | in-run world mutation, save-file map editor |
| **Vassal Lab** | Debug replacement of an unrevealed candidate without consuming RNG. | rerolling candidates, editing a living Vassal |
| **Life Map Lab** | Debug Life Map generator editor; preview seed is debug-only. | rewriting a living Vassal's serialized graph |
