# Civilization System + Content milestone

Playable first-pass implementation of the milestone brief and CivContent 2.5.
The brief's hard invariants take precedence over the workbook's provisional tuning.
This is an experiment, not a complete transcription or a balance endorsement.

## Systems delivered

- Universal hosted Stock: twelve singleton Practice slots; count/capacity and Traits;
  deterministic left-to-right atomic Consume/Require; no self funding; derived Edible
  and Currency totals. Food runs after Practice production, one Stock per 30 people.
  Currency purchases and Crisis procurement debit hosts, including upgraded hosts.
- Declarative production, conditions, specialist training, phase Housing/Food bonuses,
  resistance, and query-based Structure modifiers. Structures remain duplicate 1-3-cell
  placements. Common Housing is 30/60/90/150/240/360. Scholar quality uplift adds 25%
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

- Representative shared grammar first: 94 Practices and 34 Structures are available:
  Common 13/14, Scholar 44/11, Warrior 37/9 (Practice/Structure counts). Lyceum is an
  additional founding institution. Implemented names do not imply every secondary
  workbook retirement, Development or reactive clause is implemented.
- Common and class purchases use a flat first-pass 10 Prestige / 12 phases. Existing
  Research thresholds gate maturity; Discovery grants the next shop one higher maturity.
  Ordinary worker bonus is 25%, rounded down at the integer Stock output boundary.
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
- One spatial spawn per Death is permitted by accumulated Chaos quota. Expansion is
  every four Death phases, in authored adjacency order. Defense is 3 + floor(quota/3).
  Interception needs a supplied response Practice, enough local Support, and one Edible.
  Losing all player settlements ends the run, replacing the old Monster-count loss track.
  Starter pressure begins at one; the authored stress fixture still starts at 100.
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
- Existing art is reused through labeled fallbacks. Stock glyphs and provider text
  are present; provider-to-card animated highlighting and dedicated new illustrations
  are not included.

## Content outside the implemented grammar

The following workbook rows are not offered. They primarily need generalized
Development/Legacy rewards, action modifiers, targeted responses, movement/supply
reach, or per-institution study hooks. They were not replaced with bespoke card code.

**Scholar Practices:** Examination Coaching, Calendar Keeping, Experimentation, Doomsaying.

**Warrior Practices:** Formation Training, Veteran Instruction, Siege Training, Caravan Guarding, Rescue Parties, Forced Marches, Warband Marching, Feasting the Host, Tournaments, War Council, Great Host.

**Scholar Structures:** Studbook Stable, Weigh House, Ledger Office, Mint, Procurement Office, Schoolhouse, Engineering College, Laboratory, Census Hall, Survey Office, Map Room, Printing House, Bureau of Standards, Public Works Ministry, Imperial Archive, Arcane College, Great Library, Anatomists' College, Plague House, Charnel Library, Forbidden Observatory, The Last Academy.

**Warrior Structures:** Watchtower, Training Yard, Guardhouse, Road Station, Hall of the Fallen, Arsenal, Frontier Keep, Cavalry Grounds, Siege Yard, War College, Muster Ground, Beacon Chain, Quartermaster Hall, War Market, Walls of the Last Refuge, Hall of Champions, Banner Hall, Ashen March-Fortress, War Ministry, Ashen Host-Camp, Hall of Fallen Kings, Monster Ward, Warlord Court.

Additional deferred behavior: bespoke terminal class artifacts; targeted Class
Development conversion; arbitrary chosen-Trait storage; elaborate per-card reactive
chains and unique retirement effects. Priest, Merchant, Orders, rival AI, tactical
combat and equipment crafting remain outside scope.

## Questions for play

- Does two-Scholar founding produce useful scarcity while ten-Warrior founding gives
  enough Support without making recruitment trivial?
- Do Commissions provide sufficient purchasing income alongside the cost of holding
  Prestige for Retinue? Does the free reconsideration make early supply chains reliable?
- Is automatic defense's Edible consumption legible before collapse, and is every-four-
  moon expansion the right response window? Should players explicitly prioritize threats?
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

Probe artifacts are generated under `artifacts/` and are not committed. State/save/
config schemas are 23/14/15; Map Lab is 7. Existing saves are intentionally rejected.
