# Crown minority garrisons

Cam requested this first pass on 8 November 2026: most Crown settlements should
have a majority unallied population held by a minority of loyal Warriors.

## Opening

Thirteen of fourteen Crown holdings now start below the 45% popular retention
threshold, with a majority of unaffiliated ordinary residents. All their Crown
loyalty is the stationed adult Warrior garrison. The capital remains the loyal
stronghold. Existing population and economic budgets are unchanged.

| Settlement | People | Loyal adult Warriors | Other Crown loyal | Unaffiliated |
| --- | ---: | ---: | ---: | ---: |
| Capital | 30 | 23 | 6 children | 1 |
| Province | 20 | 8 | 0 | 12 |
| Forager Hamlet | 12 | 5 | 0 | 7 |
| Timber / Quarry Village | 14 | 6 | 0 | 8 |
| Grain Village / Market Town | 24 | 10 | 0 | 14 |

Outer garrisons are a substantial 40–43% minority, rather than a handful of
soldiers. Smaller armies were tested but lost most of the outer empire as the
unaffiliated population grew. This first pass retains a reserve for the desired
roughly 50-year opening. It does not add automatic recruitment or troop movement.
Births continue to inherit specialty with proportional allegiance.

The Force weights remain one per adult/Elder loyal Warrior, with holding costs
of one per ten unaffiliated residents, one per five rival civilians and one per
rival adult/Elder Warrior. Most shields still start at the left because the
army initially has reserve capacity. As population grows or soldiers are lost,
the holding threshold can move right. A shield is a control threshold, not the
onset of unrest: occupations begin at their ordinary positive unrest target.

`full-map-crown.js` owns the explicit cohorts. `full-map-world.js` seeds them
once; the food pass fits housing to those people without rescaling allegiance
or recruiting civilians. Removing the actual starting Warriors' specialty,
while retaining every resident and allegiance, causes unsupported holdings to
be lost through the ordinary unrest delay.

## Measurement and limits

The normal 60-tick stepper across 32 ordinary unattended seeds retains **10.375
of 14 Crown holdings on average at year 50**, range **8–14**, with all capitals
held. The fixed starter seeds 123, 42 and 424242 retain **10, 12 and 11**. This is
more territorial attrition than the earlier majority-loyal opening's 12–14;
the retained opening contract is now at least ten holdings for those three
fixed seeds, and a mean of at least ten across the broader sample.

Mean extinction is **176.748 years**, range **121.5–205.3125**, with every run
finishing before the 400-year cap. This retains the under-200 average goal;
actively played runs can differ. Reproduce both measurements with
`npm run probe:monster-extinction -- 32`.

`npm run verify` covers actual seeded occupation, army-removal control loss,
initial cohorts, food access, ordinary 50-year starts, JSON continuation and
authoritative replay. `npm run probe:monsters` checks the actual map's minority
readouts, year-50 Force thresholds, phone/desktop inspection and rewind.

GameState v45, runner envelope v33 and captured config v30 are unchanged. The
new opening is captured in the timeline's initial JSON snapshot. Existing runs
retain their old cohorts; start a fresh game to play this composition.
