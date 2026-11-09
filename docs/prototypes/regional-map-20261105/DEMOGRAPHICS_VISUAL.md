# Visual demographics prototype — 2026-11-07

Local experiment only, branch `experiment/regional-readout-20261105`.
No promotion, PR, publication, or change to Force/birth/control rules in this pass.
Subsequent decision (2026-11-08): Cam approved the weights and proportional birth
allocation, while deferring a new support/occupation distinction. The implemented
follow-up is [recorded here](PROPORTIONAL_BIRTHS_WEIGHTED_FORCE.md); the proposal
and questions below describe the earlier design discussion.

## In-game panel

- Population total and age silhouettes/counts; one age-composition strip.
- Housing capacity and last resolved meal supply meters show shortages directly.
- Allegiance rows cross Ordinary / Warrior / Scholar columns. Row totals describe
  all residents, including children. Inspecting a Warrior cell distinguishes
  children from adult/Elder Force contributors and identifies their allegiance.
- Last completed moon: births, maturation, deaths, arrivals and departures.
- Tap/hover inspection retains birth probabilities, faith, happiness, age-band
  mortality and supply detail. Rates are correctly named per phase, not annual.
- Unheld towns can open Demographics too. Their static/no-history state is
  explicit. Legacy cohorts with no allegiance record show Unrecorded, not Neutral.
- Fixed game design coordinates, existing palette, resource icons, retained Pixi
  rendering and existing pinned inspector. Landscape phone and desktop reviewed.
- Settlement tabs move left and Demographics gets more width, clearing the
  preview badge's native touch target on landscape phones.

`demographics.js` is a read-only query over the existing joint population bins;
the settlement view model exposes it. No state, RNG, schema or replay changes.

## Proposed minority occupation trial — not implemented

Current occupation already permits minority control: `ceil(nonloyal / 5)` Force.
One loyal adult/Elder Warrior contributes one baseline Force even while working.
The difficulty is not a requirement for a loyal majority. Unaffiliated residents
currently impose the same resistance as committed rivals; small-batch birth
allocation can also progressively remove the minority's allegiance.

Recommended experimental requirement, evaluated relative to the holder:

```
requiredForce = ceil(unaffiliatedResidents / 10
                   + rivalCivilians / 5
                   + rivalAdultElderWarriors)
```

Count each person once. Rival adult/Elder Warriors use the counter-Force term,
not the civilian term as well. Rival Warrior children remain civilians until
mature. Unaffiliated Warriors count as unaffiliated residents; they do not form
a coherent rival army automatically. Loyal residents add no resistance.
These weights are initial playtest values, not historical claims or final balance.

Examples, each with 100 residents and no Practice bonuses:

| Population | Force available | Required | Proposed readout |
|---|---:|---:|---|
| 10 loyal Warriors, 90 unaffiliated | 10 | 9 | Occupied |
| 10 loyal Warriors, 90 rival civilians | 10 | 18 | Contested |
| 10 loyal Warriors, 80 unaffiliated, 10 rival Warriors | 10 | 18 | Contested |

Keep the current unrest/loss delay for the first trial. A military occupation
should remain distinct from popular support in copy and on the influence bar.
Do not silently translate this weighted requirement into a single population
percentage: equal non-loyal headcounts now have different resistance. A shield
can mark the live required Force, with inspection explaining neutral/civilian/
counter-Force contributions. The bar can continue showing actual allegiance.

The 1.75x starting-army trial also converts ordinary residents to Crown allegiance,
often creating a Crown majority. After agreeing the rule, test a genuinely
minority-garrison opening before drawing a conclusion from larger army counts.

### Replenishment issue to address with the trial

The Birth phase preserves specialty but allocates each batch's allegiance using
largest remainder against pre-birth all-age shares. For a single birth with
35% Crown / 65% unaffiliated, the unaffiliated faction wins every allocation.
Repeated small batches systematically eliminate minority births. This is not
the same as ordinary random demographic decline.

Prefer an allegiance draw using `state.rng` for each birth (same probability for
each child), or a serialized fractional carry. Either requires deterministic
replay tests; do not change the number of births or inherited specialty. A rule
change alone is not evidence that a garrison will persist for 50 years.

## Batched direction questions for Cam

1. Try the weighted occupation rule above, preserving the existing unrest delay?
2. For popular support, should adult/Elder Warriors keep counting as ordinary
   loyal residents, or should civilian allegiance determine whether a town is
   Supported while soldiers determine whether it is Occupied? Recommend the
   civilian distinction if the army should visibly hold an unwilling town.
3. Fix small-batch allegiance births with seeded random draws alongside that
   trial? Recommend yes; then measure genuine minority starts through year 50.

## Verification

- Census fixture: mixed residency × allegiance × class × age, exact row/column
  totals, history, missing-history and legacy states; state and RNG unchanged.
- Browser capture: live year-99 settlement, phone/desktop, touch inspection,
  tab round-trip, first moon and unheld-town states.
- Full-map contracts and deterministic detailed-replay suites.
- Architecture, source reachability, docs and build checks.

Evidence and scoped peer scorecards: [demographics-ux](demographics-ux/PEER_BRIEF.md).
