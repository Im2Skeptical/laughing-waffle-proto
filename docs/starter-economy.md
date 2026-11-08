# Inherited economy and ordinary upgrades

Cam requested that every card seeded onto the ordinary map come from the
degraded starter pool. New Game now uses only the shared map-seed ID list for
installed Practices, Structures, dormant towns and first-control recipes.
Ordinary acquisitions retain their original identities and rules. Authored Lab
fixtures and an existing run's captured definitions remain their own scenarios.

## Reused roles and actual reductions

| Ordinary card formerly seeded | Inherited replacement | Mechanical loss at the same quality |
| --- | --- | --- |
| Foraging | Scrub Foraging | Same base before-meals yield, but capacity 1 instead of 2. With one worker at Bronze it retains 1 instead of 2. |
| Dry Farming | Fallow Fields | Autumn only, 2 base Stock; Dry Farming yields 2 in Summer and 6 in Autumn. Capacity 4 instead of 10. |
| Logging | Woodlot Rights | Same Spring/Summer/Autumn cadence, 1 each instead of 2/2/3; capacity 3 instead of 6, one worker socket. |
| Barter | Hearth Barter | Same diversity condition, one worker socket instead of two, capacity 1 instead of 4, no external-contact bonus. Food activation follows ordinary Barter's Birth activation. |
| Mud House | Crumbling Cottages | 15 Housing per cell instead of 30. Two damaged cottages retain the player's initial 30 Housing. |
| Timber House / Longhouse | Crowded Tenement | 60 Housing across two cells, versus 60 in one cell or 210 across two. |
| Granary | Leaking Granary | +0.5 Edible Capacity Multiplier instead of +1. This replaces the old identical bonus and stale upkeep prose. |
| Storehouse | Sagging Storehouse | +0.5 Construction Capacity Multiplier instead of +1. |

Rubble Picking now shares Quarrying's Summer/Autumn opportunities with 1 base
Stock each, capacity 2 and one worker; Quarrying yields 2/3 with capacity 3.
Village Well produces 1 Water in Spring/Summer/Autumn, capacity 2 and one worker;
Irrigating produces more Stock, has Edible as well as Water, and greater storage.
These comparisons include actual capacity clipping, zero/one worker and every
rolled quality; they do not compare just names or headline base yields.

The eight specialised diminished supply Practices remain as described in
[`remnant-supply-cards.md`](remnant-supply-cards.md). Different engines still need
their own inputs and triggers: a new food, military or political recipe must fit
the build. This is role-based progression, rather than a claim that any card can
replace any other card without changing the economy. Advanced counterpart
requirements and class/tier eligibility still apply.

## Two missing basic cards

**Scrub Foraging** (`rm_scrubForaging`) is a Common/Bronze Resource Practice,
map-only. It occupies one Practice slot and one worker socket (+1 ordinary
worker Output Multiplier). Before meals it generates 1 Edible Stock without
Consume/Require, capacity 1. Normal quality and multiplier rules apply, so small
storage clips its worker-assisted output. It supplies a minimal reliable meal
host while the other inherited chains recover. It can feed Neglected Flocks and
bridge seasonal Fallow Fields/Hand Quern gaps. Its weakness is almost no buffer
for population growth or other consumers. It serves the evolving-civilisation
pillar and deliberately strains limited slot/storage space.

**Sagging Storehouse** (`rm_saggingStorehouse`) is a Common/Bronze map-only
Structure, one cell, no Housing or workers. It adds +0.5 Capacity Multiplier to
Construction Stock Practices. Its plan takes four Housing activations, each
consuming 1 Construction; ordinary quality adds to the captured modifier using
the existing rules. Woodlot Rights and Rubble Picking can provide the material
without an advanced unlock. It helps save a little more repair material for
Silted Channels or a construction plan. Compared with Storehouse, its weakness
is the smaller actual retained buffer for the same cell; restoring that cell is
an engine-building improvement rather than a new mechanic.

Both have dedicated opaque paintings made with built-in ImageGen. Exact prompts,
references, sources and output paths are in
[`starter-basic-prompts.json`](../images/dark-fantasy/settlement-pieces-v4/starter-basic-prompts.json).

## Placement and playable openings

The capital starts with Fallow Fields, Hand Quern, Scrub Foraging and Hearth
Barter. The other player region starts with Woodlot Rights or Rubble Picking,
Scrub Foraging and Hearth Barter. Existing populations and seeded RNG draws are
retained. Two Crumbling Cottages supply the same initial player Housing as one
former Mud House; the repair opportunity costs more inherited space.

Town profiles use the same replacements and preserve the specialised chains.
Grain villages include a minimal foraging host; all five profiles stay within
five Practice slots. On first control a dormant town installs its captured
starter recipe and a two-cell Crowded Tenement, never an ordinary Timber House.

The Crown capital now targets 120 people and each of three provinces 60.
Existing Warrior Garrison Barracks house 60 each without the Tenement's meal
overhead. Two Barracks plus an Imperial Waystation occupy six capital cells;
one Barracks, a Waystation and Village Palisade occupy five provincial cells.
The core receives that minimum construction space. No Citadel is seeded in
this package. The Waystations have one quality uplift, adding two Edible/Arms
Capacity Multiplier rather than their base one. Capital Practices start Gold;
provincial Practices start Silver. This raises storage, not base production.

Every core town uses Hand Quern, Scrub Foraging and Fallow Fields in that order,
keeping meals on processed food before spending Grain. The capital retains
Iron Communion and Capital Dole; one province hosts Salvage Detail and the other
two Road Requisition. All three retain Barrack Levy. Real capital/province roads
allow ordinary same-faction supply. No food, worker, upkeep or conversion rule
is bypassed. See [Force and core economy tuning](crown-minority-opening.md)
for budgets, weaknesses and measurement. Outer towns retain fitted Cottages,
their inherited roles and paid neutral imports where available.

`scripts/crown-opening-test.mjs` checks 130 seeded worlds for starter-only cards,
captured recipes, valid placement and initial Housing. `scripts/starter-economy-test.mjs`
checks 128 seasonal comparisons, actual storage/food/Currency upgrades, five
first-control profiles, six two-year intervention windows, JSON continuation and
authoritative replay. It is included in `npm run test:full-map`.

Tuning remains a local first pass for Cam's gameplay review. A new run is needed
to inspect the new opening; existing saves keep their captured boards.
