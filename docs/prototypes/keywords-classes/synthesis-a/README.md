# Synthesis — Scholar keyword experiment

Current A direction on the local throwaway branch `proto/keywords-classes`.
Economic Regions belongs to Merchant. Scholar instead uses **Synthesis**.
Warrior's Monster Trophies example remains available. Priest's association is
still provisional. Earlier B/C comparisons retain their historical rules.

## Rule

Copying Texts has a separate passive line: **Synthesis contributes to Output
Multiplier.** Its ordinary Charge trigger and base 3-Stock Discharge are unchanged.

Synthesis adds +1 Output Multiplier per **other Scholar-staffed Practice in this
settlement whose Consume and Require inputs can currently be supplied**. Each
Practice counts once; the host excludes itself. With five slots, at most four
other Practices can contribute. No new counter is drawn on the card.

The normal worker assignment determines Scholar staffing. The normal atomic
Stock planner determines supply, including eligible adjacent connected allies
and affordable neutral Consume purchases. Require still cannot buy neutral Stock.
Each candidate recipe is checked independently: scoring neither spends nor
reserves its inputs, and does not promise all recipes could pay simultaneously.
Empty Stock recipes qualify; activation timing, Charge readiness and non-Stock
conditions are not part of this supply check.

The score is live. Consuming the last needed Stock can reduce it; restoring supply
can increase it. The same derived rule runs for actual activation, forecasts,
replay and inspection. There is no stored Synthesis wallet or extra RNG stream.

## Presentation

Use the existing Output/Capacity fitting. Its Synthesis row groups the individual
contributors; tap it to see their card names and +1 contributions. Card inspection
links Synthesis to its definition and current contributing names. Its passive rule
is an untimed line, without an activation arrow. Capacity, base yields, input costs,
Charge gain and the rest of the existing layout retain their ordinary behavior.

Serves **pillar 1, interacting engines**, and **pillar 2, constrained builds**:
scarce Scholars and five Practice slots turn maintaining several supplied recipes
into a composition choice. Strains **pillar 4, legible consequences**, when supply
changes affect another card's multiplier. Named ledger sources and authoritative
projection expose that dependency. No compulsory development path is introduced.

## Play

Run `npm start`, then open `#/dev/prototypes` or the live workshop. Choose A,
Scholar, and the **Synthesis supply** example, then launch a disposable New game.

- `?prototype=keywords&variant=disciplines&class=scholar&supply=ready`
- `?prototype=keywords&variant=disciplines&class=scholar&supply=blocked`
- `?prototype=keywords&variant=disciplines&class=merchant` for Economic Regions.
- `?prototype=keywords&variant=disciplines&class=warrior` for Monster Trophies.

The Scholar fixture installs Irrigating, Copying Texts, Scholarship, Papermaking
and Logging, with four adults trained as Scholars through the normal model helper.
Logging supplies Timber. Irrigating supplies Edible/Water. Scholarship consumes
Record; Paper production Charges Copying Texts, which produces Record.

With Water supplied, Irrigating, Scholarship and Papermaking contribute +3, giving
Copying Texts Output ×4. Its first real Paper-triggered Discharge reaches its
ordinary Stock capacity. In the blocked example, missing Water excludes
Papermaking: +2 gives ×3. Real seasonal irrigation restores Water and the +3/×4
reading by second 12. The same five slots and normal clocks remain playable.

The fixture's initial supplies and Scholar population are temporary scaffolding,
not free resources or class progression proposed for regular New Game. Normal
launches do not receive this deck, trained population or keyword rules.

## Checks

Verified on 24 October 2026: `npm run verify`, the focused keyword checks, and all
four real-game browser scenarios passed. There were zero page errors. The 25
committed captures are all 844×390.

- [Synthesis passive card reading](disciplines-scholar-synthesis.png)
- [Supplied: ×4 with three named contributors](disciplines-scholar-synthesis-sources.png)
- [Water missing: ×3 with two contributors](disciplines-scholar-blocked-synthesis-sources.png)
- [Water restored through normal simulation: ×4](disciplines-scholar-blocked-synthesis-restored.png)
- [Merchant Economic Regions](disciplines-merchant-economicRegions-multiplier.png)
- [Warrior Monster Trophies](disciplines-warrior-monsterTrophies-multiplier.png)

`npm run test:keywords` covers class associations, self-exclusion, once-per-card
counting, Scholar staffing, missing Consume/Require inputs, allied supply, named
sources, unchanged state/RNG during inspection, actual Charge production, supply
recovery, JSON continuation and exact authoritative replay. The original twelve
mode/class checks still exercise the other comparison options.

`node scripts/keywords-classes-prototype-browser.mjs` checks ready/blocked Scholar
states, recovery, nested contributor sources, passive reading and keyword links,
plus Merchant and Warrior examples at 844×390. Captures are buffered in ignored
artifacts before being copied here. The earlier multiplier-A captures are archived
in the sibling folder; current Scholar captures belong here.

The already reproduced supplemental settlement-probe baseline mismatch is recorded
in the parent report. No graph code, schema number or simulation clock is changed.
