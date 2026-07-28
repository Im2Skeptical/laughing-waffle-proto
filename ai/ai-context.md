# Project Context: Map-Driven Detailed Settlements

This is the authoritative AI-facing description of the current implementation.
The approved design and impact analysis are in
[`ai/detailed-settlement-redesign-plan.md`](./detailed-settlement-redesign-plan.md).
The old Milestone 2 report is superseded historical context.

## Engine invariants

- Determinism: all randomness uses `state.rng`; `Math.random()` is forbidden.
- Time: `tSec` advances only through simulation ticks.
- Replay: `rebuildStateAtSecond(tSec)` is authoritative.
- Serialization: `GameState` is JSON-only. Runtime RNG helpers are stripped
  during serialization and restored on deserialize.
- Layering: definitions are data, model modules own rules, controllers
  orchestrate, and views render/emit input.
- Gamepiece behavior is DSL-first. New content should use existing settlement
  operations or add a generalized operation before authoring data.

## Current schemas

- Game state is schema v5 (`gameStateSchemaVersion: 5`).
- Runner saves use schema v5.
- Map Lab drafts and scenario libraries use schema v2 and new `.v2` browser
  storage keys.
- Older saves and Map Lab data are rejected. There is no migration path.

## World and detailed sites

The immutable map contains 15 authored polygon regions with undirected,
shared-edge connections. Mutable region mechanics are:

- `colour`
- `controller`
- `structureCapacity`
- `detailedSettlementEnabled`

Region01–15 structure capacities are
`3/4/4/3/3/5/3/4/4/4/4/3/4/5/3`.

Detailed settlements exist in Regions01, 03, 06, 07, and 11. All are
player-controlled. Region01 is green, Regions03/06/07 are red, and Region11 is
blue. Their path is Region01–03–06–07–11; Region07 is the capital.

Each site owns:

- Villager and Stranger children, adults, and anonymous elder age cohorts
- stored and loose food
- exactly five shared practice slots
- regional structure slots
- an aggregate Elder Order policy
- last meal and last annual result summaries

Every authored site starts with 30 Villager adults, three Villager elders aged
50/53/56, Gold faith, Neutral happiness, 60 stored food, Cultivate,
Administrate, Preserve, one Granary, and two Mud Houses.

## Practices and worker policy

Current definitions live in
`src/defs/gamepieces/detailed-settlement-defs.js`.

- Cultivate: capacity 2, seasonal, produces
  `10 × map score × effective workers` food.
- Administrate: capacity 2, new moon, one food packet-edge move per token.
- Preserve: capacity 2, passive, subtracts two percentage points of stored-food
  decay per effective worker.
- Build Granary and Build Mud Houses: capacity 1, new-moon work. Completed work
  waits when physical structure capacity is full.
- VassalDummyPractice01–03: capacity zero, inert.

The Elder Order creates `floor((adults + elders) / 10)` tokens independently
for each class. Villagers assign before Strangers, practices left-to-right.
Villagers contribute 1 and Strangers 0.5.

The generalized detailed-settlement operations are:

- `addLocalFood`
- `routeLocalFood`
- `modifyStoredFoodDecay`
- `advanceWork`
- `createLocalStructureAtWork`

## Food, structures, and boundaries

- Granary storage is `100 × local granary count²`.
- Housing is `20 × local mud-house count²`.
- Food fills stored capacity first, then loose food.
- Meals consume loose food first.
- Food arithmetic is rounded to four decimal places.
- Administration plans from one activation-start snapshot, applies moves
  together, resolves authored order ties, and cannot multi-hop in one moon.

Boundary order:

1. Seasonal Cultivate.
2. New-moon Administration and build work, stored decay, loose-food halving.
3. Full-moon meal, then loose-food halving.
4. At the annual rollover: demographics/social state, global chaos, vassal
   interventions, then vassal death.

## Demographics and social state

Annual rolls use the pre-transition snapshot and consume RNG in authored region,
class, then elder-age order.

- Faith childbirth: Bronze 0%, Silver 10%, Gold 20%, Diamond 50%.
- Child-to-adult: 10%.
- Adult-to-elder: 2%, entering age 45.
- Mortality after aging: 1% through 49; 3% at 50–54; 8% at 55–59; 18% at
  60–64; 35% at 65–69; 60% at 70–74; 85% at 75+.
- New elders do not face mortality in their transition year.
- Probability modifiers resolve base plus additions, then multipliers, clamped
  to `[0,1]`.

Meal demand is adults plus elders plus half the children rounded up. Full/missed
feed streaks, partial-feed memory, starvation, faith movement, and housing loss
operate per class.

## Elder Orders and vassals

Elders are anonymous aggregate cohorts. There is no recruitment, named council
member, portrait, modifier, agenda, vote, or class tableau state.

Elder prestige is `age − 44`. For `N > 0`, resistance is
`floor(total prestige / N) + 10 × (N − 1)`; otherwise zero. The authored
50/53/56 cohort has resistance 29.

The civilization has one global vassal lineage. Candidate preview and selection
use deterministic RNG/replay. Three candidates target distinct eligible sites
where possible and each draws three unique ordered interventions. Requirements
are the target resistance snapshot plus 20/30/40 (initially 49/59/69).

Vassal prestige is current age plus trait modifier. Profession has no prestige
effect. Newly passed interventions apply in order before same-boundary death.
Applied practices become a priority prefix without duplicates and retain
existing progress.

## Global chaos and loss

Chaos, monsters, loss, and vassal lineage are civilization-global. At annual
boundaries each detailed site contributes local base chaos minus faith
mitigation with a zero floor. Gold mitigates one per five population and
Diamond one per two. The existing global monster threshold ends the run.

## UI and Map Lab

The map shows site structure usage and a civilization summary derived from all
player-controlled detailed sites. It totals cohorts/classes, food, meal demand,
housing, chaos, and monster loss progress. A smaller selected-region card opens
the local Overview and Demographics tabs. The Elder Order panel is aggregate
and shows resistance plus target intervention status.

The map polygons intentionally omit region-name text. Names remain in the
selected-region card. Player-owned regions have gold flag nodes where graph
connections meet. Detailed sites render assigned worker tokens as pawn glyphs
(up to five, then a numeric badge) and physical structure capacity as filled
building glyphs plus outlined open slots. Non-detailed regions render all
authored structure capacity as quieter outlined open slots.

Administration transfers are exposed through the pure
`buildEdgeTransferBatchAtBoundary` selector. It reconstructs normalized
`systemId`, `resourceId`, source, destination, and amount records from the
cached pre-boundary replay state, including seasonal production that precedes
Administration on shared boundaries. The map renders each food packet as a
staggered gold directional marker along its authored connection. Animation
timing and playback direction are view-only: increasing viewed `tSec` animates
source-to-destination, while a backward timeline scrub swaps the visual
endpoints and animates destination-to-source. Triangle facing remains anchored
to the historical source-to-destination direction in both cases, so rewind
playback moves the original glyph backward rather than turning it around. A
direction change discards in-flight presentation packets and reopens the current
visual batch. Transfer metadata, ordering, simulation state, RNG, saves, and
replay are unchanged. The normalized batch format is intended for later
edge-transfer systems.

A shared map/settlement survival strip shows the viewed civilization
season/year, a resolved projected loss year (or `Forecastingâ€¦` while the
forecast is unresolved), and the best resolved projected or actual loss year
observed. Expanding graph coverage is not a loss prediction and never changes
the record. Forecast projection stops cleanly at civilization loss and retains
that terminal snapshot, so the projected and best years resolve when the
unveil reaches the actual loss boundary. The best is monotonic
`persistentKnowledge.maxObservedCivilizationSurvivalYear`; it survives rewinds,
branches, and save/load, resets on a fresh run, and never affects simulation.
Fullscreen and Debug controls remain independent.

The timegraph has two explicit automatic scopes:

- Map: `Civilization • All player settlements`, aggregating population/food and
  showing global chaos/monsters.
- Settlement: `Local • <region>`, showing only that site's population, food,
  faith, happiness, and worker availability.

Map browsing does not silently retarget the civilization graph. Opening a site
switches to local scope; returning to the map restores civilization scope.
Series choices are retained independently per scope. During forecast unveiling,
the graph playhead follows the visible reveal edge and rate-limits that edge
through the existing read-only forecast-preview path. The viewed state therefore
updates the survival strip, season/moon wheel, map workers, structures, and
settlement details without advancing the committed timeline or consuming RNG.
Manual scrubbing takes ownership and is not overridden until a new
reveal/context reset. The blocking vassal chooser suspends automatic viewed
forecast refresh and handles candidate selection on press, preventing an
unveil redraw from swallowing the choice. Choosing a vassal focuses
its target site before snapshotting the prior local forecast, shows that
forecast being replaced, and progressively commits history through the
vassal's deterministic death boundary. Selected-vassal lifespan segments are
fixed history; unreached graph time remains forecast. Lifecycle boundaries are
plain serialized state derived from the candidate's selected year and
already-drawn initial/death ages, so replay consumes no extra randomness.

Map Lab v2 edits region mechanics, the independent detailed toggle, cohorts,
elder ages, local food, five practice slots, structures, and connections. It:

- prevents capacity below occupied structures
- warns but permits over-housing
- rejects stored food above Granary capacity
- deep-copies the viewed game without mutating it
- starts an explicit fresh deterministic `tSec = 0` run on apply

## Verification

- `npm run verify`
- `npm run probe:settlement` after a build
- `npm run probe:map-lab` after a build

Tests cover definitions, worker assignment, map scores, boundary food behavior,
N² capacity, decay, snapshot transport, build waiting/completion, demographics,
mortality, probability composition, Order resistance, candidate gates,
same-boundary intervention/death order, civilization aggregation, explicit
graph scopes, persistent survival records, lifespan boundaries, fixed-history
segments, forecast replacement, JSON/save round trips, Map Lab validation, and
authoritative replay parity.
