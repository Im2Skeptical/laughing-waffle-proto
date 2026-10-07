# Current simulation

CivContent 2.6 adds 24 declarative Charge Practices to the full 109-Practice /
78-Structure registry. Charge is Practice-local integer state, separate from
Stock. The authoritative Practice event queue grants Charge and automatically
resolves legal full recipes in deterministic tableau order; blocked meters retain
Charge. Charge Practices neither consume nor require Stock; worker multipliers
apply to incoming Charge (rounded down), never Discharge output. Non-Stock
staffing/population conditions and output capacity still apply. A Practice Discharges at most once per root chain, retaining
any refill for later roots. Scheduled Practices remain on the existing triggers.
The same ticks, event queue and JSON state serve replay and forecast. Exact
content and remaining provisional clauses: `docs/civcontent-2.6-implementation.md`.

Authoritative simulation behavior. Engine invariants and schema numbers:
`ai/ai-context.md`. Tunable defaults live in `src/model/game-config.js` and
detailed gamepiece definitions in
`src/defs/gamepieces/detailed-settlement-defs.js`; do not duplicate those
registries here.

- Food and Currency are hosted Stock, derived by Trait across five fixed Practice slots.
  There are no authoritative stored/loose Food or Currency wallets and no automatic
  Administration food transport. Provider planning checks Require without spending,
  then plans Consume atomically, including the consumer's existing Stock.
  Local hosts are visited left-to-right before eligible player settlements
  sharing both a polygon edge and a direct connection, in authored region order.
  All local Scheduled recipes and their reaction chains run before shared
  retries for that trigger/stage. Each retry rechecks inputs, staffing and
  conditions; incomplete plans reserve nothing. Food resolves all local meals
  before unmet demand draws from neighbour leftovers.
- Faith-phase Chaos income and authored ambitious action costs accumulate permanently.
  At Death, Monster Pressure gains `(1 + ln(1 + Chaos / 100)) / 24` pulses.
  Fractional pressure is saved. Each pulse advances one existing expandable front
  in rotating authored order; three advances expand it and reset its progress.
  Empty frontier is preferred, then other adjacent territory. A new Monster only
  spawns when no existing front can expand. If no frontier remains, a blocked
  Monster strengthens. Supplied defense still tests Support and spends Stock.
- Practices are unique installed engines. Workers are optional; ordinary tokens
  represent population bands, while each Scholar claims one specialist socket.
  Scholar staffing adds the Knowledge Card Tag, never a Stock Trait.
- Structures use 1-3 contiguous cells, stable placement IDs and duplicate instances.
  Shop offers are repeatable plans. Each commission reserves a construction site;
  Housing-phase cycles atomically Consume the authored Stock Traits after Practice
  production, using local hosts before adjacent connected neighbours. Only paid cycles
  advance progress; completion activates the building. Unfinished sites supply no
  Housing, modifiers, tags, institutional bonuses or capabilities.
  Numeric capacities are additive. The Common Housing ladder is 30/60/90/210/360/630.
  Gated query modifiers supply capacity, output, defense and Retinue cap bonuses.
- Scholars and Warriors are mutually exclusive specialties inside Villager/Stranger
  age cohorts. Aging, migration and mortality preserve those identities.
- Four deterministic neutral templates are fixed-demography external actors.
  Their hosted Stock changes through normal production/meals. Connected Trade and
  Raids use their live state. Conquest converts survivors to Strangers and enables
  the full player simulation.
- Monster Pressure advances spatial threats at Death. Deterministic expansion tests supplied
  defense, consumes supply, and can turn a site into ruins. Loss history influences
  later content; losing all player settlements ends the run. Forecast uses these
  same rules, including changing capital/primary-site normalization.
- The moon uses six fixed phases with configurable `phaseDurationSec`: Birth,
  Food, Housing, Faith, Migration, and Death. At the default one second per
  phase, a moon remains six seconds and stays independent of the 32-second year.
  Current activations are those named phases in
  `src/defs/gamesettings/moon-phase-defs.js`, resolved by
  `stepDetailedSettlementsSecond`. Do not treat `newMoon` / `fullMoon` /
  `MOON_CYCLE_SEC` as the current detailed-settlement clock; those are the
  legacy settlement-exec path.
- Birth resolves scheduled practices, births, child maturation, and adult-to-elder
  transitions. Elder ages advance annually at the first following Birth phase.
- Food runs Practice activations, then spends ceil(total population / 30) Edible Stock, feeding Villagers before Strangers. Cohorts fed
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
  unplaced-migrant hardship, monthly elder mortality, and spatial Monster pressure. Hosted Stock does not rot.
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
  confirmation. Practice purchases can be placed throughout the fixed five-slot tableau. New consumers default after installed suppliers; new producers default left. Structure purchases retain explicit
  origins and footprints; automatic placement seeks a free span before staging
  demolition at the leftmost compatible origin. Builds may cover confirmed
  structures, never other staged structures. Undo reprojects from the confirmed settlement and restores
  covered buildings. There is no standalone demolition, refund or salvage.
  Confirmation applies the projected final order and layout atomically;
  rerolling is available only while the draft is empty.
- Explicit node confirmation applies staged effects, advances accumulated Phases
  through normal ticks, pays recurring Prestige/EXP once, and makes one
  post-age natural-mortality roll. Only surviving completion exposes outgoing
  nodes; terminal survival retires the Vassal and death or retirement persists
  the completed life before generating the next three candidates.
  Equipped and Carried Heirlooms resolve inheritance at that moment: Sanctified
  relics return to the Vault unchanged, Unmarked relics become Fragile, and
  Fragile relics make a 50/50 survive-or-break roll. Overflow past six Vault
  slots is a player choice. The next Vassal then equips 0–3 Vault relics;
  selected Sanctified relics become Unmarked and Carry starts empty.
- Relic nodes roll three eligible Heirlooms with no Prestige price. Each offer
  persists a random phase cost from the shared `VASSAL_TIME_COST_RANGES`:
  Common (bronze) uses low, Silver medium, and Gold/Diamond high. The default
  ranges span 4-6, 7-9, and 7-10 years before existing time discounts. Gold and
  Diamond also roll 35% immediate death risk before awarding the find; a newly
  found Mandate cannot protect its own acquisition. All surviving choices still
  face post-time natural mortality. An empty site uses the low range without
  immediate danger. Costs are measured before equipping the new Heirloom.
  Newly found relics are Sanctified and may be Equipped or Carried. Only one
  owned copy of each definition exists at a time. Equipped Heirlooms can grant
  large temporary Vassal-life bonuses, including a once-per-life Mandate that
  prevents a fatal natural-mortality or immediate-danger outcome.
- Each EXP threshold earned by a surviving, non-terminal Vassal queues a
  serialized three-of-four stat choice rolled from all four Vassal stats. These
  choices resolve one at a time and block entry into another Lifegraph node.
- The first candidate pool contains only Philosophers and Warlords, initially
  unclassed. The selected founder's sole Life Map entry is a single-choice
  founding node before the generated routes. Its six-phase completion establishes
  Scholars (two adults plus a Lyceum where space permits) or Warriors (ten adults
  through training, without conquest). The founder keeps their Philosopher/Warlord
  identity throughout the life. Later pools contain unclassed Vassals and the
  established class only, independent of surviving local specialist populations.
  Founders never recur; an unfinished founding leaves later pools unclassed.
- Scholar Ingenuity replaces Cunning income with price-neutral quality uplift,
  Discovery access and Research, one free shop reconsideration, and Commissions.
  Local institutions and retired class stats improve later candidates.
- Warrior Prowess replaces the Intelligence price discount. Campaign combines
  Prowess, derived Retinue and local Martial Support; Challenge is personal.
  Prowess never reduces general Crisis danger. Retinue is computed from unspent
  Prestige, Warrior population and institutional caps; it is not inventory.
- Crisis options inspect live Food shortages and adjacent Monsters. Mortality
  remains on the existing Vassal RNG substream. See
  `docs/civilization-milestone.md` for the implemented pool and tuning decisions.

Boundary order is seasonal Practice activation followed by whichever lunar phase is due.
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
