# Current simulation

Authoritative simulation behavior. Engine invariants and schema numbers:
`ai/ai-context.md`. Tunable defaults live in `src/model/game-config.js` and
detailed gamepiece definitions in
`src/defs/gamepieces/detailed-settlement-defs.js`; do not duplicate those
registries here.

- Forage produces food at the start of each Food phase, before Administration
  routes food, with a baseline output that scales through its one worker slot.
- Cultivate produces food each Summer from a player same-colour connected-region
  evaluator and a baseline-preserving effective-worker multiplier.
- Administration is the only food transport. Each card has one evaluated shared
  cap, moves meal-safe surplus toward shortages from one activation-start
  snapshot, and cannot relay received food within a moon. Smokehouse's
  `connectedAdministrationReach` flag can expand its endpoints across fully
  player-controlled paths.
- Every practice belongs to a scheduled or charge lane and works without workers.
  Worker capacity and effective-worker bonus are tuned per definition; undeclared
  defaults are two sockets and +25% per effective worker. Raise Houses accumulates
  work at Birth. Build practices wait when no free contiguous footprint exists.
- Smokehouse reduces stored-food decay; Caravanserai allows commercial relay;
  Counting House permits remote Import funding. These replace the former passive
  practices. Resettlement Hall retains external-emigration pressure reduction as
  explicitly nonfunctional data; Hostel's migrant housing reserve is also
  nonfunctional. Binary capabilities are complete at Bronze, while numeric
  passive values scale with quality.
- Harvest Festival adds a positive-Happiness floor for future Faith resolutions,
  stacking duration to three. Each Faith consumes one unit; Birth does not reset it.
- Construction capacity is 5–8 horizontal cells. Each structure has a stable
  placement ID, origin, width (1–3), definition and quality. `structureSlots` stores
  placements at their origins; covered cells remain null. Occupancy is derived
  through the pure `structure-layout.js` operations shared by gameplay, shop
  projection, Map Lab and debug authoring.
- Granary and Mud House capacities scale with local count squared.
- Food fills stored capacity first, then loose food; meals consume loose first.
- The moon uses six fixed phases with configurable `phaseDurationSec`: Birth,
  Food, Housing, Faith, Migration, and Death. At the default one second per
  phase, a moon remains six seconds and stays independent of the 32-second year.
  Current activations are those named phases in
  `src/defs/gamesettings/moon-phase-defs.js`, resolved by
  `stepDetailedSettlementsSecond`. Do not treat `newMoon` / `fullMoon` /
  `MOON_CYCLE_SEC` as the current detailed-settlement clock; those are the
  legacy settlement-exec path.
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
  prices, inventories, or resolutions. Each selected Vassal owns a deterministic,
  serialized Life Map DAG generated from six non-crossing route traces across six
  lanes and eleven normal depths. The first two traces start separately, room
  families use Early/Mid/Late weights, and every final normal node connects to a
  single twelfth-depth Legacy node. Entered nodes
  persist their content while choices, purchases, and one shop reroll are staged.
  Each candidate also owns a serialized procedural portrait and one signature
  node descriptor. Three candidates always advertise distinct broad signature
  groups. Generation replaces one mid-band node with that signature after the
  ordinary graph is built; Legacy+ instead upgrades the terminal Legacy node.
  Ordinary graphs no longer roll Settlement nodes, and regular Route shops are
  add-only and can connect adjacent frontier regions. Settlement choices remain
  visible when unavailable and list their live Prestige, adult Villager, route,
  frontier, and structure-capacity requirements.
  Shop purchases are ordered drafts: they reserve offers and project their
  Prestige/Phase costs but do not deduct Prestige or apply interventions until
  confirmation. Practice purchases form a reorderable prefix ahead of locked
  confirmed survivors, including upgrades. Structure purchases retain explicit
  origins and footprints; automatic placement seeks a free span before staging
  demolition at the leftmost compatible origin. Builds may cover confirmed
  structures, never other staged structures; upgrades replace compatible confirmed
  structures in place. Undo reprojects from the confirmed settlement and restores
  covered buildings. There is no standalone demolition, refund or salvage.
  Confirmation applies the projected final order and layout atomically;
  rerolling is available only while the draft is empty.
- Explicit node confirmation applies staged effects, advances accumulated Phases
  through normal ticks, pays recurring Prestige/EXP once, and makes one
  post-age natural-mortality roll. Only surviving completion exposes outgoing
  nodes; terminal survival retires the Vassal and death or retirement persists
  the completed life before generating the next three candidates.
- Each EXP threshold earned by a surviving, non-terminal Vassal queues a
  serialized three-of-four stat choice rolled from all four Vassal stats. These
  choices resolve one at a time and block entry into another Lifegraph node.
- Cunning and Wisdom drive recurring Prestige and EXP income; Effectiveness and Intelligence
  discount Phase and Prestige costs. Practice/Structure prices live beside their
  gamepiece definitions, while route prices and all other Life Map tuning are in
  `vassal-life-map-defs.js`.

Boundary order is seasonal Cultivate followed by whichever lunar phase is due.
Faith resolves chaos after faith changes. Vassal node time uses the same
authoritative one-second stepping path but resolves independently of lunar phases.
Current and previous moon reports are
bounded JSON state used for replay and phase tooltips.

## Development tools

- Map Lab edits world mechanics and detailed site state, supports named
  scenarios plus JSON import/export, validates storage/structure limits, warns
  about over-housing, and starts a fresh deterministic run on apply.
- Game Settings is generated from the active setting registry.
- Gamepieces is generated from detailed structure/practice definitions and
  exposes numeric DSL parameters.
- Vassal Lab replaces an unrevealed candidate with explicit age, settlement,
  Prestige, and four stats without consuming RNG. Its draft/preset schema is v5.
- Life Map Lab edits generator dimensions, routes, band weights, repeat rules,
  and layout cleanup, with deterministic seeded previews, browser presets, and
  JSON import/export. Its preview seed is debug-only; fresh runs serialize only
  the generator configuration and generate each Vassal from simulation RNG.
