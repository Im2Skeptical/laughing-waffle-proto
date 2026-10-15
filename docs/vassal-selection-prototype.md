# Protovassal picker and class rules

## Approved implementation pass - October 12

## Class picker polish - October 15

The live Pixi picker (`protovassal-dossier-pixi.js`) is a centred modal that reuses
the node-decision panel footprint between the top bar and the dock, so no HUD or
dock chrome is covered at 844x390 through desktop. Layout: a class banner
(painted frame, crest, name, flavour), an attribute block (four icon + value chips
with the replaced attribute struck through and labelled, the class attribute shown
as a feature), two illustrated ability cards and a class tab strip (emblem tabs, two
locked silhouettes) centred under the right-hand column (the attributes and
abilities, to the right of the banner). There is no Begin button
or hint text: the class on show is always the selected candidate (the picker
previews it on open), so the dock's Confirm button, which the Navigation dock
shows once a candidate is selected, begins the Vassal on touch and mouse, and Enter
does the same from the keyboard. Copy and tooltip text live in
`protovassal-class-data.js` and render through the shared tooltip view: hover on
mouse, tap to pin on touch, tap again or Escape to close. Left/Right (or a swipe)
change class, Enter confirms, Escape closes the detail first and then the picker.
Motion (open, close, page slide) mirrors the node modal and is skipped under
prefers-reduced-motion. Both Philosopher and Warlord are available from the first
run; two future founder slots stay locked and explain themselves on tap. No
workbench controls or copy editor appear in the playable picker. Flavour is a
single muted italic line; unique nodes are explained on encounter. The painted
class frames also surround ordinary Vassals' existing stable portraits.

| Rule | Warrior | Scholar |
| --- | --- | --- |
| Founder | Warlord; trains 10 Warriors | Philosopher; trains 2 Scholars and establishes a Lyceum |
| Replaced stat | Intelligence -> Prowess; loses Prestige-cost discount | Cunning -> Ingenuity; loses extra per-node Prestige income |
| Class stat | +1 global Martial Force per point | +5% offered shop-quality chance per point; prices unchanged |
| Other per-point effect | RISK success * (1 + 0.15 * Prowess), capped at 100% | +1 Research on DISCOVERY |
| Ability 1 | Personal Retinue: floor(current held Prestige / 10) Force, without a population cap | Continuous Commission: choose from 3 after completion |
| Ability 2 | +15 Prestige for each successful RISK, extra to the action reward | Repeatable Delve: 10 base years to refresh shop offers, 0 Prestige |
| Time discount | Effectiveness retained | Effectiveness discounts Delve as well as other time costs |
| Other retained stats | Cunning, Wisdom, Effectiveness | Intelligence, Wisdom, Effectiveness |
| Per-node income | 3 base Prestige + Cunning; 2 base EXP + Wisdom | 3 base Prestige; 2 base EXP + Wisdom |
| Prestige discount | Intelligence discount is lost | 8% per Intelligence, capped at 60%; costs round up |
| Class-only nodes (outside the picker) | Campaign: adjacent target, sufficient global Force and 1 Edible; Challenge: difficulties 3/6/9 | Discovery: 25 or 60 base Research + Ingenuity; forbidden observation also opens one higher shop maturity |
| Recurring training | Train up to 10 eligible adult Warriors | Train up to 2 eligible adult Scholars |
| Civilization contribution | Warrior population supplies base Support at 1 per 5 Warriors, before modifiers | Scholar staffing adds the Knowledge Practice tag and enables Scholar-gated recipes; hosted Stock traits are unchanged |

RISK covers Campaign, Challenge, Crisis, monster hunts and Relic searches. A base
50% success chance becomes 57.5% at 1 Prowess and 65% at 2. The former Challenge-only
time/danger reduction is removed. Natural mortality remains a separate roll.
Mandate protection after a failed RISK does not earn the success reward.

Quality has no chance cap: 125% means one guaranteed tier plus a 25% chance of a
second; 225% means two guaranteed tiers plus a 25% chance of a third. Offered
quality stops at Diamond. Both Practices and Structures retain their base prices.

Delve is available before staged purchases. Its time passes through normal
simulation ticks, aging and natural mortality before refreshed offers appear.
It keeps the same shop open and earns no completed-node income or development.

## Commissions

Only the Vassal's committed node actions count. The initial pool is deliberately
small; future content must also be directly accomplishable through nodes.

| Goal | Prestige | Completion |
| --- | ---: | --- |
| Install a Practice | 20 | Commit a newly learned Practice through a shop node; upgrades do not count |
| Finish a Structure | 40 | Complete construction of a Structure initiated by this Vassal through a shop node after accepting the goal |
| Acquire a Relic | 60 | Find and keep a Relic through a Relic node; inheritance and inventory movements do not count |

There is no Commission node. A Scholar receives the first offer set after class
establishment/selection, immediately receives Prestige on completion, and chooses
the next from three. Offer selection prefers less recently completed goals when
the pool grows; with only three goals all three necessarily remain available.
Autonomous simulation, regional editing, and arbitrary construction cannot earn
Commission credit. Outstanding projects and offer history are serialized.

## Pinned redesign: localized Martial Force

Tracked as [GitHub issue #20](https://github.com/Im2Skeptical/laughing-waffle-proto/issues/20).

Global Martial Force is the accepted provisional rule for this pass. Each owned
settlement contributes base Warrior/support strength once; supplied network
modifiers add their stated bonuses. Add active Warrior Prowess
and Personal Retinue. Campaigns and automatic defense use this same number.
Automatic defense still requires a supplied response and its Edible payment.
Former Retinue-cap improvements add Retinue Force directly.

The user expects a localized calculation may feel more satisfying. Revisit range,
local strength, supporting settlements, and personal/civilization contributions
in a dedicated redesign. Keep the current single Force selector as the seam.

## Workbench and verification

The editable [Pixi workbench](../images/dark-fantasy/vassal-chrome-prototype/README.md)
remains available for copy/layout studies. It is isolated from live simulation.

Run `npm run verify`, `node scripts/vassal-class-rules-test.mjs`, and the existing
civilization/Life Map browser probes. Check both founders, portrait rail navigation,
compact tooltips and dock Confirm on phone landscape. Check Commission selection and
actor attribution, Structure completion, repeated Delve, mortality, reload, worker
preparation and authoritative timeline replay.
