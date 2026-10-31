# Current simulation

This experimental checkout uses `full-map-redesign-v1` for ordinary New Game.
All 20 regions run the same settlement simulation. Joint population cohorts keep
residency, allegiance, specialty and age independently; holder is territory state.
Shared Prestige, supplied local occupation, unrest, atomic faction-aware recipes,
and physical military transfers replace fixed neutral-market/global-Force behavior.
Zero workers operates at x1; staffing gates are disabled in this ruleset. Scheduled
conversion scales with workers, Charge scales its incoming gain, and Stock output
and capacity use separate pools. Victims, costs, reserves, Research and Force do
not scale. Structures support activating Influence Practices and never convert
independently. See `docs/full-map-redesign-implementation.md` for current defaults.
The older descriptions below still document explicit legacy lab fixtures.

CivContent 2.6 adds 24 declarative Charge Practices to the full 110-Practice /
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
- Faith-phase Chaos income accumulates permanently, independently of Resistance.
  Practice Resistance bonuses last until the next Birth phase.
  Resistance is compared with accumulated Chaos: sufficient Resistance freezes
  passive Monster Pressure without erasing saved progress. At Death,
  passive progress is `0.8 * max(0, Chaos - Resistance) / max(1, Resistance)` per
  moon by default. Relative pressure keeps population useful above containment;
  the one-point denominator floor keeps zero/tiny Resistance finite.
  Chaos uses compact units (one tenth of the former unit). Starter income begins
  at 0.1 per moon and grows 10% every 12 years. Game Settings authored defaults differ from Starter_02: Primordial base 10, growth 1.03 per 12 years, premature-death weight 0.5, external-emigrant weight 0.1 (`src/model/game-config.js`:96-107). Population contributes
  fractional Resistance at Bronze/Silver/Gold/Diamond ratios of 1 per 10/5/2/1
  people, multiplied by the serialized Population Resistance effectiveness setting
  (default 1). Temporary Practice bonuses are added after this multiplier.
  Forecasting grants 0.3 Resistance; fixed Monster Pressure costs stay unchanged.
  Untouched new games target extinction at years 200–300.
  Sustained 3x population effectiveness must add at least 100 years on each of
  the nine paired opening seeds. This isolates Resistance; physical population
  growth must still be supported by Food, Housing and Faith in an actual run.
  One shared tracker fills at 100 progress by default; each full tracker expands
  one existing front in rotating authored order and retains overflow. Dangerous
  actions add fixed progress directly and can trigger expansion immediately even
  under full Resistance. Empty frontier is preferred, then other adjacent territory.
  A new Monster only spawns when no existing front can expand; with no empty frontier,
  a blocked Monster strengthens. Supplied defense tests Support and spends Stock.
- Practices are unique installed engines. Workers are optional; ordinary tokens
  represent population bands, while each Scholar claims one specialist socket.
  Scholar staffing adds the Knowledge Card Tag, never a Stock Trait.
- Structures use 1-3 contiguous cells, stable placement IDs and duplicate instances.
  Shop offers are repeatable plans. Each commission reserves a construction site;
  Housing-phase cycles atomically Consume the authored Stock Traits after Practice
  production, using local hosts before adjacent connected neighbours. Only paid cycles
  advance progress; completion activates the building. Unfinished sites supply no
  Housing, modifiers, tags, institutional bonuses or capabilities.
  Housing capacities are additive. The Common Housing ladder is 30/60/90/210/360/630.
  Gated query modifiers supply Capacity Multiplier, flat output, defense and Retinue Force bonuses.
  Capacity Multiplier starts at 1 per host; Structures add 1/2/3/4 at Bronze/Silver/Gold/Diamond, then
  multiply base capacity including Practice quality and Scholar staffing bonuses.
  Capacity rounds down once after multiplication. Upgrades add one multiplier point per tier,
  capped at Diamond; other numeric Structure bonuses retain percentage quality scaling.
  Output Multiplier is a separate additive pool starting at 1, using the generalized
  `outputMultiplier` modifier kind. It scales generated Stock before retention is
  capped; recipes, cadence and incoming Charge are unchanged. Plains add +1 per
  region to Grain (including Milling), mountains to Stone, forest to Construction.
  Count the containing shared-edge same-biome component, including its own region
  regardless of ownership. Existing flat output modifiers retain their place in
  the base-yield calculation; they are not multiplier contributions. See
  `docs/output-capacity-multipliers.md`.
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
  count, then loss pressure determines incoming Chaos. Current population/Faith
  Resistance contains the resulting accumulated burden.
- Migration resolves all food, housing, and faith causes identically using
  snapshot-based, globally reserved housing. Death then resolves arrival meals,
  unplaced-migrant hardship, monthly elder mortality, and spatial Monster pressure. Hosted Stock does not rot.
  Surviving migrants join the destination Stranger cohort. Green Ascendancy is a visual-only placeholder (tiers at 100/200/300 years); it affects neither migration nor elder mortality and has no decay settings.
- Elder Orders remain aggregate cohort state but do not affect Vassal candidates,
  prices, inventories, or resolutions. Each selected Vassal owns a deterministic,
  serialized Life Map DAG generated from six non-crossing route traces over five
  lanes and thirteen normal depths (4 Early / 5 Middle / 4 Late) by default. The first two traces start separately, room
  families use Early/Mid/Late weights, and every final normal node connects to a
  single terminal Legacy node. There are 22 node families (16 normal, including
  Special Relic). Entered nodes
  persist their content while choices and purchases are staged; only Scholars refresh shops through Delve.
  Each candidate also owns a serialized procedural portrait and one signature
  node descriptor. Three candidates always advertise distinct broad signature
  groups. Generation replaces one mid-band node with that signature after the
  ordinary graph is built; Legacy+ instead upgrades the terminal Legacy node.
  Travel and Routes are removed node families, including from generator settings
  and the Lifegraph workspace picker; the Remove Routes signature is also removed.
  Ordinary graphs no longer roll Settlement nodes. Crossroads
  uses the canonical `crossroads` family and combines movement to connected player settlements (three moons), new incident
  routes (15 Prestige/five years), and a two-year Tour (25% Bronze Relic, otherwise
  +1 permanent random stat). Tour rewards roll only at commitment and use the
  normal Relic acquisition flow. Custom first pathways remain experimental.
  Settlement choices remain
  visible when unavailable and list their live Prestige, adult Villager, route,
  frontier, and structure-capacity requirements.
  Practice Reform guarantees an eligible Food-tag, Construction-Stock, or
  Currency-Stock specialty in its first slot, chosen at random. Its second
  slot is a random eligible Stock output, excluding the first specialty;
  edited content with no eligible basics keeps a disabled Food choice.
  choosing Random grants 10 Prestige once. Public Works offers Housing, Stock
  capacity, and Special categories. Existing class/Common eligibility remains.
  A card purchase that exceeds remaining Prestige instead costs 10 Monster Pressure; staging and undo are inert, and checkout applies the cost.
  Shop purchases are ordered drafts: they reserve offers and project their
  Prestige/Phase costs but do not deduct Prestige or apply interventions until
  confirmation. Practice purchases can be placed throughout the fixed five-slot tableau. New consumers default after installed suppliers; new producers default left. Structure purchases retain explicit
  origins and footprints; automatic placement seeks a free span before staging
  demolition at the leftmost compatible origin. Builds may cover confirmed
  structures, never other staged structures. Undo reprojects from the confirmed settlement and restores
  covered buildings. There is no standalone demolition, refund or salvage.
  Confirmation applies the projected final order and layout atomically;
  Scholar-only Delve refresh is available only while the draft is empty
  (shared base 10 years before discounts). Default New Game shared prices for
  both card types at Bronze–Diamond are 10/20/30/40 Prestige and 2/3/4/5 years.
  With shared pricing disabled, card-definition bases remain 10 Prestige /
  12 phases for Practices and 2–5 Prestige / 1–2 phases for Structures.
- Explicit node confirmation applies staged effects, advances accumulated Phases
  through normal ticks (year-based prices use four seasons times `seasonDurationSec`,
  32 seconds by default). Default pooled generation uses absolute Balance bands
  (3/5/10 years) and shared shop services (Delve 10 years, empty exit 5 years),
  before discounts. Legacy independent generation uses `VASSAL_TIME_COST_MULTIPLIER`
  to scale authored Patronage, Development, Crisis, Legacy, fallback-route and
  removal year costs by 3.6 before rounding to phases and applying discounts
  (empty-shop confirmation is unscaled). Confirmation pays recurring Prestige/EXP once, and makes one
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
  Diamond have no direct death roll at ordinary sites. A quarter of generated
  Relic sites are explicitly Special searches, whose finds have at least
  35% immediate danger; a newly found Mandate cannot protect its own acquisition.
  All surviving choices still
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
  unclassed. Founding is a single-choice milestone at depth 5 by default, after Practice
  Reform at 1; successors get Crossroads there. Its six-phase completion establishes
  Scholars (two adults plus a Lyceum where space permits) or Warriors (ten adults
  through training, without conquest). The founder keeps their Philosopher/Warlord
  identity throughout the life. Later pools contain unclassed Vassals and the
  established class only, independent of surviving local specialist populations.
  Founders never recur; an unfinished founding leaves later pools unclassed.
- Scholar Ingenuity replaces Cunning income: +5% price-neutral shop-quality
  chance per point with surplus rolls above 100% (Diamond ceiling), and +1
  Discovery Research per point. Delve spends 10 base years, discounted by
  Effectiveness, before refreshing offers; it is repeatable and costs no Prestige.
  Continuous Commissions are selected from three and credit only committed Vassal
  node actions. Easy (20 Prestige): install any Practice, start any Structure,
  increase a randomly named permanent stat, acquire any Relic, or visit a named
  node type. Medium (40): build any route, move to a named connected player
  settlement, or earn 30 Prestige after acceptance (spending retains progress).
  Hard (60): install a tagged Practice, start a tagged Structure, or acquire a
  Gold-or-better Relic. Structure setup pays on committed checkout, never on
  staging or autonomous completion. Targets, stat baselines, income progress and
  history are serialized; existing possessions and inherited Relics do not count.
- Warrior Prowess replaces the Intelligence price discount: +1 global Martial
  Force per point and RISK success multiplied by (1 + 0.15 * Prowess), capped at
  100%. Every successful RISK grants +15 extra Prestige; prevented failed rolls
  do not. Retinue is floor(held Prestige/10), with direct institutional Force
  bonuses and no population cap. Warrior-only Campaign is a continuous visit:
  Honour duel uses Prowess; Quest adds Retinue; Attack also adds the smaller of
  civilization-wide adult Warriors and hosted Arms. Defeat risk is Defence /
  (Force + Defence); each attempt takes two phases. Attack costs 5 Prestige and
  1 + map-distance Food; Quest costs the same Food, Duel none. Defeat ends the
  visit without immediate death, while timed natural mortality still applies.
  Clearing monsters resets Monster Pressure and exposes a stronger nest;
  destroying it removes the Monster. Neutral targets use real conquest. Duels
  award +1 permanent Prowess and 10 Prestige, quests a Relic and 10 Prestige,
  plus the usual +15 Warrior reward for successful risk. Leave advances the
  graph. Supplied automatic defense keeps its existing global Force formula.
  Challenge has no separate Prowess time/danger reduction. Natural aging remains
  separate. These rules also apply to class successors.
- Crisis options inspect live Food shortages and adjacent Monsters. Mortality
  remains on the existing Vassal RNG substream. See
  `docs/civilization-milestone.md` for the implemented pool and tuning decisions.
- Ordinary Legacy offers three free retirement choices: found a connected,
  unoccupied frontier settlement with ten new Villagers; add floor(highest
  effective stat / 3) to future Vassals' matching starting stat; or add floor(held
  Prestige / 10) to future starting Prestige. Both lineage bonuses accumulate
  without a cap. Legacy+ retains its separate signature choices.

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
