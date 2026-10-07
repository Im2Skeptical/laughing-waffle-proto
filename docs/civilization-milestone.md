# Civilization System + Content milestone

This project remains an in-progress, wide content and systems buildout. The
milestone brief and CivContent 2.5 have a playable first-pass implementation;
mechanical acceptance coverage does not mean the UX, tooling, content pool, or
balance is finished. The brief's hard invariants take precedence over provisional
workbook tuning, with subsequent explicit design decisions recorded below.

## CivContent 2.6 update

The full 109-Practice / 78-Structure pool and 24 Charge engines now supersede
the representative subset. See [the implementation report](civcontent-2.6-implementation.md)
for exact runtime coverage, tests and remaining provisional clauses. The
first-pass system notes below retain their original tuning context.

## Current iteration and handoff

- Practice capacity is fixed at **five** per detailed settlement, including
  neutrals. This intentional readability and composition limit was reaffirmed
  after the content pass; the temporary twelve-slot expansion was reverted.
  Future UX and gamepiece design must work within five slots. The regional,
  overview, and purchase boards show one row; shop inventory may still page.
- Prioritize iterative UX and tooling work against the actual shared mechanics:
  supply/provider legibility, purchase and displacement feedback, class/population
  explanations, automated conflict visibility, and editable content workflows.
  These are follow-up areas, not completed usability claims or a new scope commitment.
- Food and all Practice Stock inputs now use local hosts first, then
  player-controlled settlements that are both polygon-adjacent and directly
  connected. Require retains provider Stock; Consume debits the source host.
  Every settlement consumes its local Food meal before neighbour meal sourcing
  begins; neighbouring settlements can draw only the remaining Stock.
  Scheduled Practices now get an all-settlement local-only pass per trigger/stage,
  followed by local reaction chains, before neighbour sourcing. Pending events
  run FIFO across roots; newly emitted children get local priority before the
  next shared attempt. Incomplete recipes reserve nothing, shared retries use
  fresh inputs/conditions/staffing, and once-per-root Charge limits span both
  passes. Distinct triggers/stages remain separate batches, even in one second.
  The map shows Food and Stock supply packets, including hollow Require markers.
  State/save schemas make a clean cut so old local-only timelines are rejected.
- Use the coverage and deferred lists below when extending content. Provisional
  coefficients remain first-pass choices. Human playtesting still
  needs to establish coherent long-run class and hybrid strategies within five slots.
- Current work deploys from this repository's `main` to laughing-waffle-proto.
  laughing-pancake-proto preserves the pre-content-pass game with isolated storage.
- Restoring five slots is a clean schema cut: start a new game. Twelve-slot saves
  and old Map Lab drafts are unsupported; no installed content is silently truncated
  during save loading. Current schema numbers live in `ai/ai-context.md`.
- The first selected Vassal is a Philosopher or Warlord, initially unclassed.
  A compulsory single-choice founding node precedes their generated Life Map.
  Completing its six phases establishes Scholars or Warriors through adult
  training (and a Lyceum for Scholars where space permits); Warlord founding
  requires no conquest. That life retains its founder identity. Successors are
  unclassed or of the established class, and founders never recur. Introducing
  other classes through another mechanic remains deferred.
- Practice Reform, Public Works, and tagged card shops offer two cards from the
  Vassal's class and one Common (neutral) card when eligible pools permit. Thin
  pools fill remaining slots with eligible cards; unclassed Vassals see Common
  cards. Merchant's Lens adds a class offer where available. Less frequent
  Neutral Market and Class Market nodes mix Practices and Structures exclusively
  from their advertised pool; unclassed Life Maps replace Class Markets with
  Neutral Markets. Rerolls preserve these rules.
- Food Shop and Housing Shop are also ordinary Life Map nodes, with equal
  weights across early, middle, and late life. Authored graphs average roughly
  three of these nodes combined; each offers only cards with its advertised tag
  using the existing class/Common mix. Tagged signature shops remain available.
- Stock Supply nodes focus on one named Stock output. Every offer is a Practice
  producing that output, with normal class and Research eligibility; thin pools
  show fewer cards rather than unrelated filler. Each Life Map randomly inserts
  two distinct outputs and guarantees an unmet output when available (adding a
  third node if the random pair misses all unmet needs). Unmet needs are installed
  Practice Consume/Require inputs with no producing Practice in any surviving
  player settlement, plus Edible for populated settlements with no food producer.
  Input trait alternatives count as one requirement. Neutral settlements do not
  satisfy this generation check. The output is fixed for that graph and rerolls.

## Systems implemented in the first pass

- Universal hosted Stock: five fixed singleton Practice slots; count/capacity and Traits;
  deterministic board-wide, left-to-right atomic Consume/Require; derived Edible
  and Currency totals. Food runs after Practice production, one Stock per 30 people.
  Currency purchases and Crisis procurement debit hosts, including upgraded hosts.
- Declarative production, conditions, specialist training, phase Housing/Food bonuses,
  resistance, and query-based Structure modifiers. Structures remain duplicate 1-3-cell
  placements. Common Housing is 30/60/90/210/360/630. Scholar quality uplift adds 25%
  to numeric Structure bonuses; Practice quality increases capacity.
- Scholar/Warrior subsets inside status and age cohorts, preserved by migration,
  aging and mortality. Scholar sockets take priority over ordinary worker bands and
  add the Knowledge Card Tag without changing Stock Traits.
- Scholar founding, institutional and retirement candidate bonuses, Ingenuity quality
  uplift, Commissions, Discovery, and one free inventory reconsideration per shop.
  Warrior founding, Support, prestige-derived Retinue, Campaign and Challenge.
- Four authored neutral templates with fixed populations, Stock production/consumption,
  connected Trade/Raid targeting and conquest. Spatial Monsters expand deterministically;
  supplied autonomous defense spends Stock, failure creates ruins and loss history.
  A displaced active Vassal evacuates to the first surviving player settlement.
- Shared Crisis incidents for actual Food shortages and adjacent Monsters. Prowess
  affects martial terms only. Death, Chaos, ruins and loss history feed later content.
- Authoritative forecast/replay, JSON saves, schema rejection of obsolete saves,
  revised Map Lab, card inspection, paged purchasing and Retinue status.

## Acceptance evidence

`src/model/tests/civilization-content.js` exercises deterministic claims from A-G:

| Story | Exercised result |
| --- | --- |
| A: Common | Hosted Food feeds the settlement; Barter creates Currency; Timber House adds 60 capacity. |
| B: Scholar | Real founding action establishes two Scholars and a Lyceum; staffing changes tags; Commission pays once; Discovery opens higher maturity; institutions/retirement improve later candidates. |
| C: Warrior | Ten-Warrior founding route, Support and Retinue formulas; spending crosses a Retinue threshold; a legal Campaign conquers its target. |
| D: Neutrals | Four deterministic templates, adjacent small neutral, fixed demographics with evolving Stock; connected Raid depletes a target without an active Vassal; conquest creates Strangers. |
| E: Collapse | Supplied Garrison holds and spends its last Edible; another expansion causes territorial loss; Doomsday Chronicle subsequently benefits from loss history. |
| F: Hybrid | Scholar-staffed Common smelting gains institutional output, then supplies Weaponsmithing and Garrison through shared Stock. |
| G: Determinism | Save/reload at intermediate times and complete spatial-collapse projection match authoritative stepping, including primary-site changes. |

The broader suite covers Food bands and rationing, status priority, specialist aging,
migration/death, exact-once hosted Currency checkout, housing, neutral placement over
multiple seeds, Map Lab/config validation, timeline actions, projection and terminal
boundaries. Desktop and touch draft probes exercise inspection, staging, reorder/move,
undo, quality upgrades, confirmation and replay. The Starter browser probe covers
real New Game, neutral inspection, both candidate classes and founding resolution.

These are mechanical scenarios and interface exercises. They do not establish that a
full Scholar or Warrior campaign is balanced or consistently enjoyable; that remains
human playtest work.

## Provisional choices and deviations

- CivContent 2.6 now offers Common 13/14, Scholar 48/32 and Warrior 48/32
  (Practice/Structure). Every Practice is Scheduled or Charge; full pool and
  per-card deviations are in `docs/civcontent-2.6-implementation.md`.
- Practice purchases use 10 Prestige / 12 phases. Structure plans remain available
  for repeat commissions during the shop visit, cost 2?5 Prestige / 1?2 phases, and
  need 3?7 paid Housing-phase construction cycles with broad Stock Trait recipes.
  Common Housing scales from raw Construction through Tool and Metal chains; higher
  homes give more Housing per footprint cell. Existing
  Research thresholds gate maturity; Discovery grants the next shop one higher maturity.
  Worker bonus is +100% per effective worker (base ×1, one full worker ×2,
  three ×4), rounded down at the integer Stock output boundary. Worker effectiveness
  and existing Stock capacity limits still apply. This supersedes the provisional 25% bonus.
- Scholar founding trains two adult Scholars; Warrior founding trains ten adults, both
  costing six phases. Ingenuity uplift chance is 5% per point, capped at 75%, with no
  price increase. Commission rewards 20 Prestige for one new Practice/Structure.
  Discovery gives 25 or 60 Research plus Ingenuity; risky observation has 10% Danger.
  Scholar ordinary recurring Prestige is fixed at three; institutions supply simple
  class-stat bonuses instead of bespoke Development-choice biases.
- Retinue keeps the specified floor(Prestige/10), capped by ceil(Warriors/10) plus
  bonuses, and is zero with no Warrior population. Base Support is floor(Warriors/5)
  before configured modifiers. No army wallet or units exist.
- Campaign requires enough Prowess + Retinue + local Support and one hosted Edible.
  Advantage reduces time/danger/collateral. At advantage three all neutral population
  survives; below that, 80% population and Stock survive. Survivors become adult
  Strangers. Ruins retain dormant population/Stock for reconquest; no siege attrition
  or specialty-preserving ruin recovery has been added.
- Each fresh launch seeds one Defense-2 frontier Monster, preferably one frontier
  step away from player settlements, and connects the adjacent small neutral.
  At Death, saved Monster Pressure gains `(1 + ln(1 + Chaos / 100)) / 24` pulses;
  Chaos remains accumulated. A pulse rotates among expandable existing fronts,
  advancing one toward expansion after three pulses. Empty frontier has priority.
  Only blocked/absent fronts allow another spawn; a fully occupied map instead
  strengthens a blocked Monster. Supplied interception retains Support and Edible
  requirements; settlement loss remains the run-ending condition.
- Authored Raid, conquest, forbidden Discovery, selected advanced/esoteric
  Practices, deep knowledge study and higher-quality Relic searches generate fixed
  Chaos costs, shown with the Chaos symbol and amount before commitment.
  Campaign Monster victories award 12 + 4×Defense Prestige and 3×Defense Research;
  automatic hunts award stronger capacity-limited Loot/Record/Currency trophies and 6 Research.
  Successful defense and diversion grant Defense Research, and diversion also
  grants 6 Prestige. Monster-facing Research and candidate engines are strengthened.
- Trade is a connected-stocked-neutral bonus to Barter, not a rival buying strategy.
  Raid transfers up to two target Stock units into authored Loot output. Target and
  provider ties use existing connection/tableau order. Neutrals never grow classes or
  build/research autonomously.
- Shortage relief grants up to three Edible within host capacity, costing 15% Danger
  or one Currency. Threat diversion resets expansion age at 20% Danger. Prowess does
  not discount these risks.
- Storehouse targets Construction rather than asking the player to choose a Trait;
  Cistern and Millhouse use simple capacity rules. Most selected institutions use
  gated capacity/candidate bonuses; Foundry proves shared Knowledge/Consume output
  queries. Full per-institution Study/retirement hooks remain deferred.
- Scholar Brickmaking's apparent Record-trait typo is treated as Construction.
  The old internal stat keys `cunning` and `intelligence` remain serialization keys;
  class meanings and visible labels are Ingenuity/Prowess. Equipped stat bonuses apply.
- Each runtime Practice and Structure has a dedicated illustration; the expanded
  pool adds 59 paintings while preserving existing card art. Stock glyphs and
  provider text are present; provider-to-card animated highlighting is deferred.

## Content coverage and remaining clauses

All Common/Scholar/Warrior rows are now offered. Secondary institutional,
Development, Legacy and action-range clauses use provisional generalized
implementations where their full interfaces do not exist. The complete
card-by-card accounting is in [the CivContent 2.6 report](civcontent-2.6-implementation.md).
Priest, Merchant, expanded Elder Order mechanics, rival AI, tactical combat and
equipment crafting remain outside this pass. Aggregate Elder Order state already
exists; it does not govern Vassal candidates or purchases.

## Questions for play

- Does two-Scholar founding produce useful scarcity while ten-Warrior founding gives
  enough Support without making recruitment trivial?
- Do Commissions provide sufficient purchasing income alongside the cost of holding
  Prestige for Retinue? Does the free reconsideration make early supply chains reliable?
- Is automatic defense's Edible consumption legible before collapse, and is the
  100-moon expansion interval the right response window? Should players explicitly prioritize threats?
- Does adjacent conquest need a stronger supply or travel constraint? Should reconquest
  preserve the age and specialist identities of survivors rather than resetting them?
- Which deferred institutions and terminal engines improve decisions enough to justify
  expanding the shared grammar? Are random broad pools too diffuse for early synergies?

## Reproduce

- `npm run verify`
- `node src/model/tests/civilization-content.js`
- `npm run probe:settlement-draft`
- `npm run probe:settlement`
- `npm run probe:civilization`

The software-GL browser recap check retains timing samples and uses a 750 ms
upper bound (the expanded snapshot measured 375 ms against the old 300 ms bound).
Further snapshot/render optimization is a follow-up, not a balance dependency.

Probe artifacts are generated under `artifacts/` and are not committed. Current
schemas live in [the invariants sheet](../ai/ai-context.md). Older saves are
intentionally rejected.
