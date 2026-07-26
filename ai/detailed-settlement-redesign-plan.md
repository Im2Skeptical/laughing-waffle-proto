# Map-Driven Detailed Settlement Redesign

Status: implemented and verified. This is a clean prototype refactor with no
old-save or Map Lab v1 migration.

## Summary

Replace the legacy regional food, environment-tile, practice, resource, and
structure systems with five map-connected detailed settlements. Food becomes
local, capacity-limited, perishable, and movable only through Administration.
Practices use declarative worker/trigger/effect definitions. Physical building
space uses region-specific Map Lab structure capacity.

The Elder Council becomes an aggregate Elder Order. Elders retain age-based
prestige but have no identities, agendas, portraits, or individual tableaux.
Vassals receive three location-specific interventions and progressively
overcome a snapshot of the target Order's resistance.

## Impact analysis

### Determinism

- Candidate generation, shuffles, demographics, mortality, and probability
  checks consume only `state.rng`.
- Annual RNG order is authored region, population class, then elder age.
- Administration plans from a single activation snapshot, uses authored
  region/neighbour order for ties, and applies moves together.
- Food is normalized to four decimal places after authoritative arithmetic.

### Serialization

- Sites, cohorts, ages, slots, work/charge, interventions, and civilization
  state remain arrays and plain JSON records.
- Derived capacity, score, policy, resistance, and display summaries are
  recomputed and never stored as classes, functions, Maps, or Sets.
- Bump game saves from schema v3 and Map Lab from v1. Reject old data with no
  migration shim.

### Replay and time

- Live ticks and `rebuildStateAtSecond(tSec)` use the same boundary processor.
- `tSec` remains authoritative. Season, moon, annual, intervention, death,
  chaos, and loss changes occur only through simulation ticks.
- Candidate generation and intervention application are authoritative model
  events, so projection and replay consume the same RNG.

### Layering

- Authored regions, capacities, structures, practices, and effect programs live
  in `src/defs`.
- Model modules execute DSL operations, topology, transport, demographics,
  Orders, vassals, chaos, and replay.
- Controllers orchestrate selected sites and Map Lab application. Views render
  model summaries and emit intents; views contain no gameplay rules.

### DSL-first behavior

- Cultivate, Administrate, Preserve, placeholders, and builds are declarative
  definitions with worker capacity, activation, costs, and effects.
- Add generalized map-evaluator, local-food, topology-transfer, decay-modifier,
  work, and structure-creation operations where needed.
- The evaluator dispatches generalized operations rather than practice IDs.

### Verification

- Test DSL validation/execution, worker order/effectiveness, topology purity,
  boundary ordering, N-squared capacities, food decay, Administration snapshot
  routing, demographic RNG/mortality, faith/happiness, and global chaos.
- Test Order resistance, snapshots, candidates, 49/59/69 gates, same-boundary
  death, priority insertion, build completion, and persistence.
- Test JSON round trips and authoritative replay across transfers, annual rolls,
  vassal selection/interventions, and loss.
- Test Map Lab v2 round trips/validation and browser-visible map selection,
  capacity, Overview/Demographics, Elder Order, chooser, and five-site behavior.

## Model and declarative content

- Detailed-settlement APIs are scoped by `regionId`. Only chaos, loss, and the
  single vassal lineage are civilization-global.
- Each site stores per-class `children`, `adults`, and anonymous
  `eldersByAge`; `storedFood` and `looseFood`; five ordered practice slots with
  charge/work state; ordered regional structure slots; Elder Order definition
  and worker policy.
- Replace regional `capacity` with `structureCapacity`. Region01–15 values are
  `3/4/4/3/3/5/3/4/4/4/4/3/4/5/3`. Practice capacity is always five.
- Remove environment boards/tiles/events, regional practice tokens/scoreboard,
  coloured resources, old settlement practices and structures, upgrades, and
  River Temple.
- Retain Granary and Mud Houses. Granary capacity is
  `100 × local granary count²`; housing is `20 × local mud-house count²`.
  Duplicates are allowed; creation uses the first free structure slot.

| Practice | Capacity | Activation | Effect |
| --- | ---: | --- | --- |
| Cultivate | 2 | Every season | `10 food × map score × effective workers` |
| Administrate | 2 | One moon | One packet-edge move per token; packet is `10 × effectiveness` |
| Preserve | 2 | Passive | Reduce stored-food decay two percentage points per effective worker |
| VassalDummyPractice01–03 | 0 | Passive | Inert placeholder |
| Build Granary | 1 | One-moon work | At one work, create a Granary |
| Build Mud Houses | 1 | One-moon work | At one work, create Mud Houses |

Build activations gain 1 work from a Villager or 0.5 from a Stranger. A
completed build waits if structure capacity is full; otherwise it creates the
structure, removes itself, and compacts the tableau. Costs are empty. Effects,
charge, work, and packet strength use effective worker contribution.

## Settlement simulation

- The Elder Order creates `floor((adults + elders) / 10)` worker tokens per
  population class. Assign Villagers first and Strangers second, practices
  left-to-right. Capacity counts tokens; contributions are 1 and 0.5.
- Cultivate score is `1 + adjacent player-controlled same-colour regions`. Only
  player-controlled detailed sites activate Cultivate and Administration.
- Food fills stored capacity before loose overflow. Meals consume loose first.
- Boundary order: seasonal Cultivate; new-moon Administration, stored decay,
  then 50% loose decay; full-moon meal then 50% loose decay; annual
  demographics, social changes, chaos, and vassal intervention checks.
- Stored food decays 10% at new moon, reduced by Preserve to a 0% floor.
- Administration grants no saved credits. Each token permits one packet-edge
  move. Plan from an activation-start snapshot and apply together, preventing
  multi-hop. Prefer the host's projected meal shortage, then loose overflow
  toward adjacent shortages/capacity, then stored surplus. Destinations fill
  stored capacity first. Resolve sites, neighbours, and ties in authored order.
  Meals never teleport remote food.
- Annual rolls use pre-transition snapshots in region/class/elder-age order.
  Childbirth is Bronze 0%, Silver 10%, Gold 20%, Diamond 50%;
  child-to-adult 10%; adult-to-elder 2%, entering age 45. Existing elders age
  then face mortality: 1% through 49, 3% at 50–54, 8% at 55–59, 18% at 60–64,
  35% at 65–69, 60% at 70–74, and 85% at 75+. Apply transitions together; new
  elders first face mortality next year. Modifiers resolve base plus additions,
  then multipliers, clamped to `[0,1]`.
- Adults and elders consume one food; two children consume one, rounded up.
  Preserve current feed streaks, partial trend, starvation, housing, faith
  movement, and collapse, with proportional cohort losses.
- Chaos is civilization-global. Sum
  `max(0, local base chaos − local faith mitigation)` before global loss.
  Gold mitigates one per five population; Diamond one per two.

## Elder Order and vassals

- Remove council recruitment, identities, modifiers, agendas, voting, and
  class-specific tableaux. All local elders count; the vassal does not.
- Each elder's prestige is `age − 44`. For `N > 0`, resistance is
  `floor(total prestige / N) + 10 × (N − 1)`; otherwise zero.
- Each starting site has Villager elders aged 50, 53, and 56: resistance 29.
- Generate three candidates with `state.rng`. Use distinct player-controlled
  detailed sites where possible; if fewer than three, exhaust a shuffled unique
  set and cycle it. Disable selection when there are none. Draw three ordered
  interventions without replacement from Dummy01–03, Build Granary, and Build
  Mud Houses. Snapshot target resistance. Requirements add 20/30/40, initially
  49/59/69.
- Vassal prestige is current age plus the existing random trait modifier.
  Profession contributes none and no elder-age gate applies.
- At annual boundaries apply every newly passed intervention before a
  same-boundary death. Unpassed interventions expire; applied changes persist.
- Applied interventions form an original-order priority prefix, followed by
  existing unique practices, trimmed to five. Matching practices move without
  duplication and keep progress. Completed builds remain resolved.

## Scenario and UI

- Replace Elder Council UI with an Elder Order summary: worker policy, elder
  ages/count, resistance, vassal prestige, target, and intervention status.
- Settlement tabs are Overview and Demographics. Demographics shows cohorts,
  housing, meals, probability breakdowns, mortality, happiness thresholds,
  faith effects, expected outcomes, and the previous annual result.
- Map summaries show used/available structure capacity. Selecting a region opens
  its detailed site. Timegraph site metrics are scoped; chaos/loss/lineage stay
  global.
- Detailed sites are Regions01, 03, 06, 07, and 11. Region01 is green,
  Regions03/06/07 red, Region11 blue; all are player-controlled and Region07 is
  capital. Player path: `01–03–06–07–11`. Capacities: `3/4/5/3/4`.
- Every site starts with 30 Villager adults, no children or Strangers, elders
  50/53/56, Gold faith, Neutral happiness, 60 stored food, no loose food,
  Cultivate/Administrate/Preserve, one Granary, and two Mud Houses.
- Initial Cultivate scores are `1/2/3/2/1`, producing `20/40/60/40/20` food.

## Map Lab v2

- Replace `capacity` with `structureCapacity`; remove
  `installedPracticeIds`; retain colour, controller, and connections.
- Add an independent detailed-settlement toggle and editing for capacity,
  cohorts/elder ages, stored/loose food, five practice slots, and structures.
- Prevent lowering capacity below occupied slots. Warn for over-housing. Reject
  stored food above derived Granary capacity.
- Use schema v2 and new storage/export keys with no v1 migration.

## Documentation completion

After implementation and verification, update `ai/ai-context.md`, README, and
the Designer Docs trigger/targeting/effect-operation dictionaries to describe
implemented behavior. Keep the M2 report marked superseded.
