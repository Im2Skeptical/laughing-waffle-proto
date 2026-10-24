# Eight new Bronze keyword cards

Throwaway content on `proto/keywords-classes`, using the new shared
[card creation skill](../../../../.agents/skills/add-gamepiece/SKILL.md) and
[design brief](../../../card-design-guide.md). Four new Scholar Practices and
four new Warrior Practices widen the pool rather than rename existing cards.
All are minimum Bronze, cost 10 Prestige / 12 phases, have one worker socket,
and use current recipes, triggers and Stock Traits. Their original artwork is
recorded in [individual prompt provenance](../../../../images/dark-fantasy/settlement-pieces-v4/bronze-keywords-prompts.json).

## Shared passive rules

Each Scholar card has its own untimed **Synthesis contributes to Output Multiplier**
line. It adds +1 per other supplied, Scholar-staffed local Practice, at most +4.
The [Synthesis experiment](../synthesis-a/README.md) defines supply and exclusions.

Each Warrior card has its own untimed **Monster Trophies contributes to Output
Multiplier** line. It adds +1 per monster actually destroyed by this civilisation,
at most +6. The count persists through Vassal death and is never spent. Defending
and clearing a nest without destroying it do not earn a Trophy.

Both bonuses use the existing additive Output pool. Base yields, recipes,
Charge gain and capacity are separate. Class gating follows option A; these
are experimental rules, not approved regular-game progression.

## Scholar designs

- **Flood Almanacs:** Spring; Require 1 Water; generate base 2 Record, capacity 12.
  A seasonal starter for a knowledge engine. Irrigating supplies Water; its Records
  feed Scholarship and Pattern Carving. Water can remain in its provider.
  Weakness: long seasonal gaps and competition for scarce Scholar workers.
  Serves **pillar 3, civilisation interdependence**; strains **pillar 4, legibility**
  through the independent seasonal clock.
- **Marginalia:** when another local Knowledge Practice consumes Record, gain base
  1 Charge; at 2, generate base 2 Record, capacity 12. Reclaims knowledge from use,
  rather than duplicating Copying Texts' production trigger. Pattern Carving and
  Scholarship are two Bronze enablers. Once-per-root Discharge prevents runaway
  feedback. Weakness: no initial Record and no consumer means no start.
  Serves **pillar 1, interacting engines**; strains **pillar 4** through indirect reactions.
- **Measured Rations:** Food before feeding; Consume 1 Grain, Require 1 Record;
  generate base 3 Edible, capacity 18. Dry Farming or Milling supplies Grain;
  Flood Almanacs or Record Keeping supplies Record. A scholarly food converter
  with substantial buffering, rather than another raw food source.
  Weakness: two supply dependencies can interrupt feeding.
  Serves **pillar 3**; strains **pillar 2, constrained builds** through provider slots.
- **Pattern Carving:** Housing; Consume 1 Timber and 1 Record; generate base 1 Tool,
  capacity 10. Logging plus Flood Almanacs starts it; consuming Record charges
  Marginalia. Tools can build additional Bronze Lyceums, and later support Common
  Stone Houses. This deliberately tests
  a new, low-base-yield Bronze Tool pathway; existing Tool producers remain Silver.
  Weakness: it spends records needed elsewhere and can weaken Silver progression's
  value. Serves **pillar 1**; strains **pillar 2** if it becomes mandatory technical access.

A compact Bronze opening is Irrigating, Flood Almanacs, Scholarship, Dry Farming
and Measured Rations. A technical alternative is Foraging, Logging, Record Keeping,
Pattern Carving and Marginalia. Only a few Scholar workers are needed to begin;
four staffed Practices are a developed state, not an opening grant.

## Warrior designs

- **Beast Rendering:** when this civilisation destroys a Monster, gain base 1 Charge;
  at 1, generate base 2 Animal/Bone, capacity 16. It listens to real Campaign or Hunt
  outcomes. The newly earned Trophy already contributes to that Discharge.
  Its Animal supplies Trail Provisioning; its Bone enables Trophy Rubbings.
  Weakness: no victory means no production, so it cannot bootstrap the first expedition.
  Serves **pillar 3**; strains **pillar 2** through feast-or-famine rewards.
- **Scarred Shields:** Birth; Consume 1 Timber; generate base 1 Arms/Protection,
  capacity 12. Experience with monster attacks informs equipment production.
  Logging starts it; Garrison Duty and Campaigns use the Arms/Protection.
  Weakness: modest yield before victories, while trophy feedback may later crowd
  out other Arms producers. Serves **pillar 1**; strains **pillar 2** through snowballing.
- **Trail Provisioning:** Food before feeding; Consume 1 Animal; generate base
  2 Edible/Mobility, capacity 16. Hunting Parties or Herding Train starts it before
  a kill; Beast Rendering later supplies it. The Mobility also enables logistical
  Practices such as Forced Marches. Weakness: consuming the last remains can switch
  off Trophy Rubbings' Bone requirement.
  Serves **pillars 1 and 3**; strains **pillar 4** through shared host depletion.
- **Trophy Rubbings:** Death; Require 1 Bone; generate base 1 Record/Currency,
  capacity 12. Keeping a trophy pays repeatedly rather than spending the kill count.
  Beast Rendering supplies Bone; Record/Currency can enable Rationing and Recruiting.
  Weakness: it competes with converting the same remains into supplies.
  Serves **pillar 1**; strains **pillar 4** because Stock Bone and the Trophy count
  are distinct linked concepts that inspection must explain.

A five-slot Bronze expedition economy can use Foraging, Logging, Scarred Shields,
Beast Rendering and Trophy Rubbings. Campaign supplies the first kill; Trail
Provisioning can replace Foraging when Animal supply becomes reliable. A connected
allied settlement broadens choices but is not required to earn the first Trophy.

## Play and temporary fixtures

Run `npm start`, open `#/dev/prototypes`, choose **A**, Scholar or Warrior, and
**Keyword cards → Eight new Bronze cards**. Open the experiment, then New game and
a disposable save slot. Direct launch queries:

- `?prototype=keywords&variant=disciplines&class=scholar&cards=bronze`
- `?prototype=keywords&variant=disciplines&class=warrior&cards=bronze`
- Add `&supply=blocked` to the Scholar query for initially missing Water/Grain/Timber.

Each capital has its four new Bronze cards and one provider; the connected allied
site supplies the remaining inputs. Initial Stock and trained specialists are
temporary viewing fixtures. The Warrior ally includes a Silver Monster Hunting
card solely to produce an automatic real kill at second 6. The separate all-Bronze
Campaign test proves that none of the four cards depends on obtaining Silver content.
The campaign test uses a high-Prowess fixture to remove victory uncertainty.

The new definitions enter the local branch's ordinary class shop/catalogue too.
Their base recipes work there, but keyword scaling requires the captured keyword
experiment configuration. No normal launch receives the demonstration decks.

## Evidence and limitations

Verified on 25 October 2026: `npm run verify` passed in full, the shared skill
validator passed, and the final three phone scenarios passed without page errors.

`npm run test:keywords` includes the eight-card checks: zero-Research class offers,
actual Scheduled/Charge activations, atomic failures, separate passive readings,
unchanged capacities/Charge gain, pure inspection, JSON continuation, exact replay
and the actual all-Bronze Campaign kill. Original workbook provenance is unchanged;
catalogue coverage now counts 118 Practices and 78 Structures on this branch.

`node scripts/bronze-keyword-cards-browser.mjs` exercises all eight real cards,
recursive definitions, touch-pinned multiplier ledgers and the developer selector
at 844×390. Captures and browser evidence are saved here after successful checks.
The final three-scenario phone run passed with 23 PNGs and zero page errors.

- [Scholar board](scholar-board.png) and [Warrior board](warrior-board.png).
- [Flood Almanacs](floodAlmanacs.png), [Marginalia](marginalia.png),
  [Measured Rations](measuredRations.png), [Pattern Carving](patternCarving.png).
- [Beast Rendering](beastRendering.png), [Scarred Shields](scarredShields.png),
  [Trail Provisioning](trailProvisioning.png), [Trophy Rubbings](trophyRubbings.png).
- [Missing supply](scholar-blocked.png) and [real Food-phase recovery](scholar-restored.png).
  Supply is restored by second 12; Measured Rations produces on the next Food
  trigger at second 14. Eligibility and activation timing remain separate.

These are initial tuning proposals. Buffers accommodate early scaling, but a
developed score can still clip output. Both opening reliability and long-run
throughput need human playtesting. No schema, clock, RNG stream or core resolver
was added for these cards. Each behavior uses existing DSL operations and the
existing derived keyword score. No main integration, PR or publication is implied.
