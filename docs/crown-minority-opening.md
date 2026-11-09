# Crown garrisons and loyal citizens

Cam requested majority-unallied towns held by minority loyal Warriors, then
asked to reduce the capital/provincial armies and add loyal citizens so the
Force threshold indicator can be evaluated in practice.

## Opening

Ten outer Crown towns begin below the 70% popular retention threshold, with
unaffiliated majorities held by their stationed adult Warrior minority. The
capital and three provinces instead have loyal civilian majorities and small
guards. The developed core has larger, explicitly supplied population targets.

| Settlement | People | Loyal adult Warriors | Other Crown loyal | Unaffiliated |
| --- | ---: | ---: | ---: | ---: |
| Capital | 120 | 16 | 92 | 12 |
| Province | 60 | 8 | 40 | 12 |
| Forager Hamlet | 17 | 8 | 0 | 9 |
| Timber / Quarry Village | 19 | 9 | 0 | 10 |
| Grain Village / Market Town | 29 | 14 | 0 | 15 |

The capital's loyal civilians include 27 children; each province includes 12.
Children give no Force. All outer Crown allegiance remains its adult garrison.
Those outer armies are substantial 47–48% minorities, retaining a reserve for
the roughly 50-year opening. There is no new recruitment or movement system.
Births continue to inherit specialty with proportional allegiance.

Cam's follow-up raises core Warriors from 12/5 to 16/8 by converting
loyal ordinary adults. Total population, allegiance shares, children and initial
food demand stay fixed in the core. Each outer town gains two loyal Warriors
and two unaffiliated residents, keeping an unaffiliated majority. They remain
under 30 people and need one Stock per meal. The existing housing fitter seeds
two Cottages for these populations; no new food source or bonus is added.
Extra Force comes from these actual people; existing Barracks bonuses still need
their authored local Warrior/Arms conditions.

Both player towns start with 18 allied and two unaffiliated residents instead
of 16 and four: 90% allegiance, with the same 20 people, 30 Housing and zero
starting Warriors. This adds a 20-point margin above the 70% zero-Force holding
threshold. Claims, Force weights and all runtime rules remain unchanged.

## Reading the shield

The capital and provinces retain 90% and 80% allegiance respectively. This exposes
both a healthy civilian-backed core and army-backed outer holdings in the same
map. The marker is the minimum allegiance needed to retain control at current
Force, not the onset of unrest. Outer occupations start at positive unrest.

Each loyal adult/Elder Warrior still supplies one Force, including while working.
The former holding cost had a cliff: enough Force removed the allegiance
requirement altogether. Holding now uses diminishing returns:

`Required allegiance = 70% / (1 + Force / population pressure)`

Population pressure is total residents divided by ten, multiplied by the average
resistance of the current non-loyal population. An unaffiliated resident has
weight one, a rival civilian two, and a rival adult/Elder Warrior ten. Each
person counts once. With no non-loyal residents, the counterfactual uses weight
one. Claims need 75% for two checks, staying above the zero-Force retention
threshold. Existing unrest/loss delays remain. The previous trial used 45% to
hold and 60% to claim; only the base values change, not the curve's Force scale.

At 30 residents with unaffiliated opposition, Force 2 needs 42% allegiance and
Force 4 needs 30%; at 120 residents those thresholds are 60% and 52.5%.
Zero Force needs 70% at any population size. The opening capital has 16 baseline
Force plus four conditional Barracks Force, giving a 26.25% threshold. Provinces
start at 30% with eight baseline Force, or 26.25% where Arms activate their two
Barracks Force. These bonuses are existing card behavior, not a startup grant.
More Force always helps, but never substitutes for every local ally. The actual
minimum is rounded up to a person, while the shield uses the continuous share
and exact fractional Force. The inverse Force requirement is fractional, or
absent when there is no local allegiance. Campaign capture resistance retains
its existing weighted headcount rule; this change governs holding territory.

Existing Barrack Levy practices can train and convert new Warriors. Provincial
shields can return left within the first decade as their armies grow; this is
actual gameplay, not decorative animation. Inspect the Warrior population as
well as the shield when assessing the tuning.

`full-map-crown.js` owns the cohorts, seeded once by `full-map-world.js`; the food
pass fits outer housing without rescaling allegiance. Removing the actual outer
Warriors' specialty, retaining every person and allegiance, costs control
through the normal unrest delay. Removing core guards leaves sufficient
civilian allegiance to retain political control, but weakens military Defense.

## Supporting the core population

The target is 120 capital residents and 60 per province, rather than increasing
people on 30 Housing. Existing Warrior Garrison Barracks provide 60 Housing in
two cells, without Crowded Tenement's extra meal overhead. The capital gets two;
each province gets one. An Imperial Waystation with one ordinary quality uplift
adds two Edible/Arms Capacity Multiplier. Capital construction space is at least
six cells; provinces need five including a Village Palisade. No Citadel is added.

Core boards reserve three of five slots for the neutral/Common food engine:
Hand Quern, Scrub Foraging, Fallow Fields, in that order. Capital instances are
Gold and provincial ones Silver. Quality increases hosted capacity, not output.
With full ordinary staffing, Scrub makes two Stock per Food opportunity and
Quern consumes one Grain to make six. Fallow Fields yields six Grain in Autumn
before biome effects. Storage bridges its seasonal cadence; meal routing spends
processed food before edible Grain. The capital's opening capacities are
18/9/18 for Quern/Scrub/Fields, provinces 15/6/15. Stock starts within these real
capacities; Iron Communion retains its authored two-Arms prime.

The Warrior capital's other slots remain Gold Iron Communion and Capital Dole.
Dole consumes four Edible, in addition to the capital's four-Stock baseline
meal. One province retains Salvage Detail, the other two Road Requisition; all
retain Barrack Levy. Road Requisition consumes two Edible for Arms and Levy
needs retained Arms to create loyal Warriors. Barracks' conditional extra Force
still needs local Warriors and Arms. Capital/province roads enable ordinary
same-faction supply. No recipe, staffing requirement or upkeep is bypassed.

This uses existing map-only neutral and Warrior cards, without new definitions
or general buffs. Its weaknesses are three food slots, seasonal Grain exposure,
political/Arms food costs, limited construction space and population growth
outstripping its opening budget. Outer towns keep their distinct food/trade
roles; the core deliberately has a developed food chain in every town.

## Measurement and limits

The civilian-core trial deliberately accepts more outer attrition for the UX
experiment. Its opening check requires the three fixed seeds to retain a
majority of the fourteen holdings at year 50, and at least nine held on average
across the broader sample. The previous all-garrison variant required ten.
All capitals must still survive; unattended extinction must average below 200.

The 70%-base, 90%-allied player sample with increased core and outer Warriors
retains **10.875 of the original 14 Crown holdings** on average at year 50
(range **8–13**),
with every capital held. Total holdings, including later acquisitions, average
10.96875. Mean unattended extinction is **171.012 years**, range
**109.6875–219.1875**, with no censored run at the 400-year cap. The previous
80%-allied opening averaged 115.090 years, with its earliest loss at 55.5 years.
This is a seeded
baseline, not a claim that each run ends before 200 or plays identically.
The same 32 seeds use the ordinary simulation and remain below the 200-year
average target. Political loss remains possible under the unchanged 70% holding
rule; higher initial allegiance provides more room before it becomes a threat.
All 32 current sample runs end in Monster Overrun, compared with twelve
Territorial Losses in the previous opening.

The core economy check observes every meal through year 50 for seeds 123, 42
and 424242, recording opening/later shortages and population snapshots. All 132
core meals in the opening two years were fully fed. Later population growth
does cause food shortages and migration; this package supports the starting
targets, not unlimited passive growth. Detailed rows are written to
`artifacts/crown-economy/core-economy.json` by
`node scripts/crown-core-economy-test.mjs`.

The same test separately pauses natural births and aging for 20 years, leaving
ordinary recipes, staffing, conversions, costs and trade active. Across the
three seeds, 1,278 of 1,284 core meals are fully fed (99.5%), with no starvation
migration. Each town must feed at least 95% of meals. This controlled check
distinguishes a working target-sized food chain from a temporary opening buffer;
it is not the ordinary population-growth or extinction benchmark.

Run `npm run probe:monster-extinction -- 32` for the recorded retention and
extinction sample under `artifacts/monster-escalation/`. It uses the ordinary
60-tick simulation without skipped phases. Actively played runs can differ.

`npm run verify` checks real occupation, civilian support, visible core thresholds,
army-removal control loss, food, 50-year starts, JSON continuation and replay.
`npm run probe:monsters` checks the actual map at opening and year 50, including
desktop/phone touch inspection and rewind.

GameState v47 invalidates the former Force trajectory. Runner envelope v33 and
captured config v30 are unchanged. This follow-up changes initial cohorts only;
existing runs retain their captured opening and continue under the same rules.
Start a fresh game for the new composition.
