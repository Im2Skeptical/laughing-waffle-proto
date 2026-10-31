# Practice keywords

Synthesis and Monster Trophies are ordinary gameplay in the main full-map build.
New Game captures their card attachments without any experiment URL, dev setting
or keyword toggle. Historical comparisons remain available in Prototypes.

## Rules

Keywords add to the existing Output Multiplier. They do not add to base Stock,
change Research, increase incoming Charge or change capacity. Recipes still pay
in full before activation. The passive effect has its own untimed inspection
line; tapping its name explains the score, class access and current contribution.
The existing multiplier fitting opens the contribution ledger. No card-face
trackers are added.

- **Synthesis (Scholar):** count other local Scholar-staffed Practices whose
  Consume/Require recipe can currently be supplied. Check each independently
  through ordinary supply without spending or reserving Stock. Empty recipes
  qualify; trigger timing and Charge readiness are irrelevant. Each adds +1
  Output Multiplier, capped at +4. The ledger names the contributing Practices.
- **Monster Trophies (Warrior):** count monsters destroyed by the civilization
  through real Hunt or Campaign resolutions. Clearing a front without destroying
  its nest, defenses and neutral conquest do not count. Each adds +1 Output
  Multiplier, capped at +6. The count persists across Vassal lives and is never
  spendable Stock. A kill is recorded before its reaction chain, so Beast
  Rendering's Discharge benefits from that kill.
- **Economic Regions (reserved for Merchant):** the shared score query counts
  inhabited regions of the same controlling faction in one road-connected trade
  zone. Unheld, hostile and ruined regions break the zone. Merchant is not yet playable, so ordinary content
  currently has no Economic Regions attachment. Barter retains its ordinary
  recipe and trade conditions. Priest's keyword remains undecided; the earlier
  Priest/Trophies association exists only in the comparison experiment.

Class disciplines are active in player-controlled regions only during the matching living, established
Vassal's life. A Philosopher/Warlord's founder identity does not grant access
before Founding. Unclassed lives and gaps between lives make the contribution
dormant; installed recipes and persistent Trophy history remain. Selecting a
matching successor restores it. This implements the agreed A gating, without
adding a separate tutorial unlock or inheritance mechanic.

## Content and implementation

Scholar: Flood Almanacs, Marginalia, Measured Rations, Pattern Carving, plus
Silver Copying Texts. Warrior: Beast Rendering, Scarred Shields, Trail
Provisioning, Trophy Rubbings, plus Silver Monster Hunting. The eight Bronze
cards use ordinary class shops, Research eligibility and artwork. Their full
design briefs and provisional balance risks remain in the
[card report](prototypes/keywords-classes/bronze-cards/README.md).

`keywordOutputScale: {keyword, per, amount, cap}` is captured DSL data on a
Practice definition. The contribution is `min(cap, floor(score / per)) * amount`.
Validation requires a known keyword, integer `per >= 1`, integer `cap >= 0`,
finite nonnegative `amount` and a Stock-generating effect. Edited coefficients
are respected in play, inspection, saves and authoritative replay.
`src/model/practice-keywords.js` owns ordinary rules;
`src/model/detailed-settlements/synthesis.js` owns the pure supply query.
The prototype adapter handles only explicitly requested historical comparisons.

Game state v41 / runner saves v31 reject older saves. Captured config schema is
v29: keyword coefficients remain part of its captured card data. No RNG
streams, time advancement, layering or forecast-specific rules were introduced.

This serves **pillar 1 (interacting engines)** through supply and kill engines,
and **pillar 4 (inspectable consequences)** through named contributors and replay.
It can strain **pillar 2 (limited build opportunities)** if the common scaling
payoff becomes compulsory, and **pillar 3 (civilization growth)** when Vassal gaps
temporarily suppress otherwise established institutions. Caps and the five-slot
constraint remain; throughput and long-run class identity still need playtesting.

## Test and view

Ordinary New Game needs no setup: establish Scholar or Warrior and buy the cards
through its normal shops. For a quick viewing deck, open developer Prototypes,
choose **Ordinary rules · Bronze viewing deck**, then Scholar/Warrior and **Open
fresh keyword run**. Choose New game and a spare slot. This seeds a real selected
class and legal supplies; it carries no `keywordPrototype` configuration.
The original A/B/C comparisons remain separately selectable.

Direct viewing decks: `?prototype=keywords&variant=regular&class=scholar` or
`?prototype=keywords&variant=regular&class=warrior`. Add `&supply=blocked` for
Scholar's temporary shortage. These URLs select fixtures, not keyword rules.

`npm run test:keywords` covers ordinary founding, class/death boundaries,
captured coefficients, actual Hunt/Campaign, all eight real card activations,
missing supplies, pure inspection, JSON continuation and authoritative replay.
Run `npm run verify` for the full repository checks.
