# Crown map and regional readability pass

Cam's initial full-map playtest requested joined Crown borders, a capital icon,
dedicated Crown map art, two or three neutral starts, allegiance in the header,
and fewer resource icons. His later clarification includes unused production:
count installed consumers even when they cannot currently operate.

## Behavior

- Crown regions share an exposed copper border. Internal Crown edges disappear;
  player, monster, unheld and selected-region treatment stays distinct. Shared
  frontiers clip each owner's strokes to its own polygon, so neither draw order
  nor selection erases the neighbour's colour. Coastal strokes stay full width. Cache
  identity includes Crown ownership, so capture and rewind cannot reuse stale
  edge cancellation. Legacy neutral markets do not acquire Crown borders.
- The Crown capital has an inspectable crown badge and its own keep sprite.
  Provincial halls and houses use the same decayed imperial kit. Current holder
  and the saved capital identity select art; monsters take precedence. These
  are view-only changes and reuse the existing terrain variants and road cache.
- Fresh ordinary starts have three independent settlements near the player,
  outside the Crown capital and adjacent provinces. Their population is wholly
  unaffiliated and their five Practices are Resource Practices. They are not
  immune to later conversion or conquest. Other unheld outskirts retain their
  inherited mixed allegiance and Crown institutions. No extra RNG is consumed;
  geography and existing saves are unchanged.
- The regional header shows an allegiance distribution and Free/Crown/
  Unaffiliated headcounts, alongside control status, Force and unrest. Housing
  and Food remain visible at the right. Touch inspection retains specialist,
  defense, garrison, control-threshold and construction details. The long line
  between Practices and Structures is removed.
- Compact map bars show Free, Crown and unaffiliated population proportions,
  using the header's same gold/copper/grey palette. Touch inspection gives counts
  and holding details. A red diamond and frame mark contested held regions;
  unsupported occupation and unheld land remain distinct. The marker reflects
  the existing control query rather than introducing a new simulation state.
  Player flags, pawn trays, overcrowding icons and NEUTRAL/Defense map labels
  are removed. Starvation alerts and the Crown capital badge remain.
- Map Stock icons show missing input sources in red, outputs without a local
  holder in amber, and production without an installed consumer in reach in
  green. Otherwise ordinary hosted/supplied/used production is hidden. This is
  structural recipe coverage, not a surplus, throughput or current readiness
  indicator. Empty holders count as sources; recipes waiting on timing, Charge
  or another input still count as consumers. Any matching trait makes a
  multi-trait Stock unit used. Consume, Require, meals, construction in progress
  and authored upkeep count; finished construction costs and Charge events do
  not. Potential substitutions and wildcards count where their actual rules
  allow them. Sources follow the real adjacent-road/faction provider query;
  foreign Influence Practices use their installed allegiance for remote supply.

Pillars 3 and 4 benefit from visible territorial identity and clearer causes of
control and supply. Pillar 2 keeps five-slot and space constraints intact. The
pillar 1 tradeoff is a quieter map with less routine production information;
full cards, multiplier inspection and supply details remain available.

## Impact and checks

Presentation changes do not advance time or mutate simulation state, RNG,
schemas or replay. The only new gameplay setup is deterministic neutral
initialization; serialized state shape and captured definitions do not change.

Focused checks cover neutral starts across nine seeds and JSON round-trips,
installed-consumer coverage and faction reach, Crown boundary cancellation/cache
changes, art alpha/native widths, and 41 full-map contract groups.
`probe:control-frontiers` checks actual PIXI pixels for owner pairs, selection,
reversed winding and every draw order at a three-way junction.
`probe:map-retention` checks rendered contention, row alignment, exact rewind
restoration, unchanged state and paused scene reuse. Static region references
retain their text textures when changing overlays refresh.
`probe:crown-map` uses ordinary New Game at 844×390 and 1440×900 and checks actual
touch inspection of the map bar, capital badge and regional header; its
responsive harness suppresses fullscreen changes while switching emulated
viewport sizes. Evidence is under ignored `artifacts/crown-map/`,
`artifacts/control-frontiers/` and `artifacts/map-retention/`. The initial pass
also verified Crown capture, monster occupation, road changes and cache eviction
without another terrain bake in `artifacts/regional-presentation/1867/`.

The Gym handoff path does not currently prepare illustrated terrain; this pass
uses ordinary New Game for real-map review. Fixing that independent entry path
is outside this change. No Pages publication is included.
