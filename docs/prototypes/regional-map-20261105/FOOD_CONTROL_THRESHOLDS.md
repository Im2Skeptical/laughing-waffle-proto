# Food coverage and control-threshold shields

Local, unmerged regional-map experiment, requested by Cam on 2026-11-07.

The subsequent [larger-garrison pass](LARGER_GARRISONS_50_YEAR.md) changes the
starting army/allegiance mix, fixes UI size at 70%, and raises floating readouts
above region names. Its current validation supersedes the older numbers below.

## Starting food

The full-map initializer now runs an opening-only food pass. Ordinary seeded
economies mostly have one food-producing Practice, with an 8% chance to retain
or add a second. The Crown capital retains its farming/milling pair. Existing
Forage, Pastoralism and Dry Farming provide biome-weighted variety; large towns
use Pastoralism rather than a Forage host capped below their next meal band.
Food Practices precede other Resource Practices in the starting board so the
existing worker allocator can staff the food economy.

A foodless region may instead use one directly adjacent allied producer.
The pass adds the real economic connection and reserves a finite export budget.
The producer keeps its own projected meals, authored food recipe costs and
harvest-gap storage first; allocations cannot reuse the same export budget.
Seasonal farms are limited by both annual production and the longest harvest
gap. The reservation includes 25% population headroom and the next rounded meal
boundary. This is ordinary hosted Stock supply, not free food or a new transport
rule. Unheld/static towns retain a single-source activation recipe so first
control does not activate a foodless resource board. Their inventories remain
specialised. The Crown capital receives a Granary in its existing support cell.

This guarantees a viable starting food route, not food for unlimited growth or
all future policy expenditure. In 67 default seeded openings every settlement
ate its first meal; all 14 Crown holdings survived two years and no starvation
migration cascade occurred. There were 39 transient severe meal shortfalls
across those simulations, mainly involving the existing military/institutional
food costs. Food pressure remains part of the simulation.

The 1,072 active boards sampled contained 107 import economies, 839 single-source
boards and 126 two-source boards. Exact ratios vary by seed.

## Shield meaning

The floating bar puts the current holder's allegiance at the left. Its shield
marks the minimum resident allegiance needed to retain control at the current
population and Force. More Force moves that marker left. When holder support
falls below it, the existing contested/unrest/loss checks govern the result.

The model query exactly inverts the existing retention-or-occupation rule:

- popular support: at least ceil(total residents x 0.45);
- military support: at least total residents - 5 x floor(Force), bounded at zero;
- take the lower requirement; zero Force uses popular support.

Fractional Force respects the existing rounded-up occupation requirement.
The shield number is still whole Force. The tooltip explains the population
boundary and delayed unrest. Unheld towns show a muted dash rather than claiming
all resident Warriors have disappeared; they have no holding threshold.

The 70% size default, uniform geometry, stable settlement anchors, live region
titles, worker/Prestige motif and inert non-player Prestige are retained.
No simulation rule or loss timing changed for the marker.

## Invariants and verification

Food choices use the existing seeded RNG; new choices are made only at run
initialization. No new persisted fields, schema versions or RNG streams exist.
Stock resolution, live simulation, projection and authoritative replay remain
shared. Use a fresh run.

Checks:
- `node scripts/seeded-food-coverage-test.mjs`: 67 seeds, two years, first meals,
  no starvation cascade, variety/board counts, actual road-disconnection test.
- `npm run test:full-map`: Crown opening determinism/serialization, population
  identity, threshold/control boundary equivalence and full-map contracts.
- `npm run test:detailed-settlements` and `npm run test:detailed-replay`.
- `node scripts/capture-stable-regional-ui-prototype.mjs`: real threshold
  placement and holder-first bars across zoom, phone and desktop.

## Troop movement investigation, not installed AI

A scratch model trial compared no redeployment, direct road-neighbour aid,
adjacent-land aid, and routing aid one region at a time across the friendly
network. Five seeds (123, 42, 424242, 174219, 435546) ran for 50 years.
The small policy sends at most one 1-3-person detachment per Migration phase,
prioritises low occupation margins, aims for 2 Force of recipient headroom, and
leaves each donor its occupation requirement plus a 4-Force buffer and a minimum
home garrison (10 in the capital, 3 elsewhere). Only Crown-loyal adult Warriors
move. Every transfer conserves real population; repeat trials are deterministic.

Mean Crown holdings across those five seeds:

| Years elapsed | No redistribution | Routed friendly-land redistribution |
| --- | ---: | ---: |
| 0 | 14 | 14 |
| 2 | 14 | 14 |
| 10 | 7 | 10.2 |
| 25 | 3.4 | 5.8 |
| 50 | 3.4 | 3.4 |

Road-only movement made no transfers in two of the five seeds. Multi-hop friendly
land routing lets the capital's reserve reach a needy outer garrison through
intermediate regions. Redistribution improves early imperial coverage, but does
not supply indefinite recruitment or recover a region already lost. Some seeds
still hit labour, allegiance and food constraints.

Recommended next playable trial: adjacent friendly-land marching with road
preference, small visible detachments, a safe donor reserve and a target margin.
Make a real population transfer and map packet so source and destination shield
numbers visibly respond. Keep children/Elders out of marching detachments.
Ongoing class-specific recruitment and reconquest need separate tuning.

The scratch transfers happen immediately between phase steps. They omit travel
duration and arrival meals; these are limitations of the research harness, not
accepted production rules. A playable implementation must join the authoritative
phase/replay pipeline, resolve arrival support, and show authentic troop packets.

Evidence: `artifacts/warrior-force-prototype/crown-redeployment-research.mjs`
and `crown-redeployment-research.json`. Automatic redeployment is not included
in the current playable pass.

