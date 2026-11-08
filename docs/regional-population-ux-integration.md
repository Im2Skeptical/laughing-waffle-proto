# Regional population UX integration

Cam approved merging the regional-readout prototype with current main and
publishing Pages on 8 November 2026. This combines the accepted population work
with the inherited starter economies and map-choice constraints from PR #82.
Cam also replaced the old Dispatcher merge handoff: the task-owning agent gets
a fresh independent review when needed, then squash-merges after checks pass.

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
- Starting Crown cohorts use explicit [minority garrisons](crown-minority-opening.md)
  at the fitted population targets. Thirteen holdings have unaffiliated
  majorities; the capital is the loyal exception. No residents or implicit
  garrison meals are added to compensate for the degraded economy.
- The successful floating layout is the default without URL flags. Earlier
  comparison links remain developer references; menu variant selectors are gone.

## Reconciliation with main

Main and the prototype independently used GameState v43 for different changes.
The combined state is **v44**, runner envelope v33, captured config v30. Start a
fresh game. There are no migration shims for either obsolete v43 format.

Main's degraded starter Practices, shop exclusions and
adjacent-only map decisions are retained. Specialist-generating Muster belongs
to the Warrior acquisition pool, following Cam's class-specific generation rule.

The earlier prototype food pass installed ordinary Foraging/Farming/Pastoralism
and a Granary. That would undo main's starter-only direction. The integrated
pass fits initial populations and housing to the inherited cards, without
upgrading their quality or changing their output, meal or staffing rules.

### Crown opening balance

The initial merge candidate retained only one or two Crown regions at year 50.
Population cuts alone did not fix it: Crowded Tenements consume fixed extra
meals, and a small capital's Dole occupies workers before its food chain.
Following Cam's population-target direction, the opening now uses:

| Crown settlement | Initial people | Loyal adult Warriors |
| --- | ---: | ---: |
| Capital | 30 | 23 |
| Province | 20 | 8 |
| Forager Hamlet | 12 | 5 |
| Timber / Quarry Village | 14 | 6 |
| Grain Village / Market Town | 24 | 10 |

The earlier proportional scaling created loyal majorities. Crown cohorts are
now seeded directly: outer Crown allegiance is its adult garrison, and the
capital retains six loyal children alongside its army. All other residents are
unaffiliated. This makes outer control genuinely depend on its Warriors.
Crown housing uses enough Crumbling Cottages for that target, avoiding the
Tenement's fixed meal overhead. Existing support buildings and any existing
Citadel remain; freed cells do not seed new Citadels. Player and independent
starting populations and boards retain main's defaults.

Foodless timber/quarry towns prefer adjacent, road-connected neutral markets
with affordable replenishing food. The seeder budgets one Stock per importer
after reserving player access; Hearth Barter supplies its local Currency. Without
that access, the last secondary slot becomes Scrub Foraging. Most settlements
have one independent food source; grain chains and the capital can have two.
Downsized Market Towns use Scrub alone, keeping the Grain/Milling chain distinct.
Across 67 seeds, 670 active settlements had one source, 332 had two and 70 relied
on imports. This is initial access, not a guarantee against future growth or conquest.
Dormant towns retain a local food source in their first-control recipe.

The capital replaces Salvage Detail with Scrub Foraging so it has a meal even
without staffed Milling. Displaced distinct active institutions are retained in
empty provincial slots; all boards stay at five slots and starter-only IDs.
Main's seasonal Grain/Milling chain remains intact.

The minority composition's 32-seed sample retains 10.4 of 14 Crown territories
on average at year 50 (8–14), including every capital. The former majority-loyal
opening retained 12–14. The separate first-two-year starvation checks remain.
This does not promise permanent self-sufficiency: population
growth, unrest and old-age mortality still run normally. Detailed trial data is
in `artifacts/population-targets/seeded-report.json`. The committed army test now
uses actual New Game boards and paid trade, with no supplied-food overrides.

## Validation and review

The integration is checked with local `npm run verify` and phone/desktop map
and Demographics probes, including ordinary
default entry, four zoom levels, live model thresholds, graph Hold, pinned touch
inspection and first-moon/unheld states. Logs are under
`artifacts/main-integration/`.

Run `npm run verify`. Full-map coverage includes both sets of tests: population
and weighted Force, starter-only economies, inherited supply, shops/travel,
first control, save/replay, initial starvation and actual 50-year control. Paid
imports are checked against a disconnected quarry to prove food is not free.
Review a fresh game at year zero,
zoom the map, inspect a shield, then open settlement Demographics and scrub.
For the held opening review link use
`?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&perf=1&art=1&launch=new`.

Earlier experiment decisions and screenshots remain under
`docs/prototypes/regional-map-20261105/`; those are historical local trial records,
not a replacement for current schema numbers or this integration's food balance.
