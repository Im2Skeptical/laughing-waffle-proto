# Crown garrisons and loyal citizens

Cam requested majority-unallied towns held by minority loyal Warriors, then
asked to reduce the capital/provincial armies and add loyal citizens so the
Force threshold indicator can be evaluated in practice.

## Opening

Ten outer Crown towns begin below the 45% popular retention threshold, with
unaffiliated majorities held by their stationed adult Warrior minority. The
capital and three provinces instead have loyal civilian majorities and small
guards. Existing population and economic budgets are unchanged.

| Settlement | People | Loyal adult Warriors | Other Crown loyal | Unaffiliated |
| --- | ---: | ---: | ---: | ---: |
| Capital | 30 | 2 | 25 | 3 |
| Province | 20 | 1 | 15 | 4 |
| Forager Hamlet | 12 | 5 | 0 | 7 |
| Timber / Quarry Village | 14 | 6 | 0 | 8 |
| Grain Village / Market Town | 24 | 10 | 0 | 14 |

The capital's loyal civilians include six children; each province includes four.
Children give no Force. All outer Crown allegiance remains its adult garrison.
Those outer armies are substantial 40–43% minorities, retaining a reserve for
the roughly 50-year opening. There is no new recruitment or movement system.
Births continue to inherit specialty with proportional allegiance.

## Reading the shield

The capital starts with a one-third holding threshold; provinces start at 45%.
Their current allegiance fills 90% and 80% of their respective bars. This exposes
both a healthy civilian-backed core and army-backed outer holdings in the same
map. The marker is the minimum allegiance needed to retain control at current
Force, not the onset of unrest. Outer occupations start at positive unrest.

Force weights stay one per adult/Elder loyal Warrior, with holding costs of one
per ten unaffiliated residents, one per five rival civilians and one per rival
adult/Elder Warrior. These small populations produce discrete marker steps;
one additional Warrior can move a provincial shield from 45% to zero.

Existing Barrack Levy practices can train and convert new Warriors. Provincial
shields can return left within the first decade as their armies grow; this is
actual gameplay, not decorative animation. Inspect the Warrior population as
well as the shield when assessing the tuning.

`full-map-crown.js` owns the cohorts, seeded once by `full-map-world.js`; the food
pass fits housing without rescaling allegiance. Removing the actual outer
Warriors' specialty, retaining every person and allegiance, costs control
through the normal unrest delay. Removing core guards leaves sufficient
civilian allegiance to retain political control, but weakens military Defense.

## Measurement and limits

The civilian-core trial deliberately accepts more outer attrition for the UX
experiment. Its opening check requires the three fixed seeds to retain a
majority of the fourteen holdings at year 50, and at least nine held on average
across the broader sample. The previous all-garrison variant required ten.
All capitals must still survive; unattended extinction must average below 200.

The selected 32-seed sample retains **9.6875 of 14 holdings on average at year
50**, range **7–13**, with every capital surviving. The fixed seeds 123, 42 and
424242 retain **8, 8 and 10**. Mean extinction is **168.762 years**, range
**122.25–212.0625**, with no censored runs at the 400-year cap.

Run `npm run probe:monster-extinction -- 32` for the recorded retention and
extinction sample under `artifacts/monster-escalation/`. It uses the ordinary
60-tick simulation without skipped phases. Actively played runs can differ.

`npm run verify` checks real occupation, civilian support, visible core thresholds,
army-removal control loss, food, 50-year starts, JSON continuation and replay.
`npm run probe:monsters` checks the actual map at opening and year 50, including
desktop/phone touch inspection and rewind.

GameState v45, runner envelope v33 and captured config v30 are unchanged. The
opening is captured in the timeline's initial JSON snapshot. Existing runs
retain their old cohorts; start a fresh game for this composition.
