# Regional population UX integration

Cam approved merging the regional-readout prototype with current main and
publishing Pages on 8 November 2026. This combines the accepted population work
with the inherited starter economies and map-choice constraints from PR #82.

## Accepted behavior

- Floating worker-circle / Prestige-pill and numbered Force shield are the
  ordinary map default, fixed at 70%. Readouts cover region names; names retain
  their original placement and zoom behavior. Only player Prestige is active.
- Demographics has age composition, housing/meal coverage, allegiance-by-class
  counts, recent events and touch inspection. Static towns are inspectable too.
- Loyal adult/Elder Warriors supply one baseline Force while working. Births
  inherit specialty. Birth allegiance uses saved fractional entitlement per
  residency/specialty, so minority shares do not round away in small batches.
- Holding resistance is one Force per ten unaffiliated residents, one per five
  rival civilians, plus one per rival adult/Elder Warrior. Each person counts
  once. Existing allegiance thresholds, unrest delays and status fields remain.
- Starting Crown armies retain the prototype's 1.75x recruitment targets, using
  existing adults. No additional residents or implicit garrison meals are added.
- The successful floating layout is the default without URL flags. Earlier
  comparison links remain developer references; menu variant selectors are gone.

## Reconciliation with main

Main and the prototype independently used GameState v43 for different changes.
The combined state is **v44**, runner envelope v33, captured config v30. Start a
fresh game. There are no migration shims for either obsolete v43 format.

Main's degraded starter Practices, damaged housing, shop exclusions and
adjacent-only map decisions are retained. Specialist-generating Muster belongs
to the Warrior acquisition pool, following Cam's class-specific generation rule.

The earlier prototype food pass installed ordinary Foraging/Farming/Pastoralism
and a Granary. That would undo main's starter-only direction. The integrated
pass instead keeps authored boards, connects foodless towns to adjacent allied
sources, and uses basic Scrub Foraging only when no such source exists. A full
isolated/dormant board replaces its last secondary institution to stay within
five slots. Grain-processing chains remain intact; they can have two independent
sources plus the processor. Food access is not free supply or guaranteed surplus.

### Known food-balance limitation

The actual combined Bronze opening loses Crown settlements rapidly to food
shortage. Three measured seeds retained only one or two Crown regions by year
50. Higher food quality alone did not restore the earlier longevity result.
This is recorded in `artifacts/main-integration/combined-opening.json` and
`crown-food-quality-trial.json`; it is not concealed as a passing longevity gate.

The 50-year army contract is now explicitly a **supplied reference fixture**,
isolating Warrior inheritance, Force and replay from the newly weakened food
economy. Ordinary opening access/scarcity is recorded separately by
`scripts/seeded-food-coverage-test.mjs`. No claim is made that unattended ordinary
New Game still retains most of the Crown empire for fifty years. Improving that
balance remains follow-up gameplay tuning, not an unreviewed starter-card upgrade.

## Validation and review

The combined local `npm run verify` completed with exit 0. Phone/desktop map
and Demographics probes also passed with zero page errors, including ordinary
default entry, four zoom levels, live model thresholds, graph Hold, pinned touch
inspection and first-moon/unheld states. Logs are under
`artifacts/main-integration/`.

Run `npm run verify`. Full-map coverage includes both sets of tests: population
and weighted Force, starter-only economies, inherited supply, shops/travel,
first control, save/replay and food access. Review a fresh game at year zero,
zoom the map, inspect a shield, then open settlement Demographics and scrub.
For the held opening review link use
`?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&perf=1&art=1&launch=new`.

Earlier experiment decisions and screenshots remain under
`docs/prototypes/regional-map-20261105/`; those are historical local trial records,
not a replacement for current schema numbers or this integration's food balance.
