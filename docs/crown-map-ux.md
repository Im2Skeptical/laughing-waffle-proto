# Crown map and regional readability pass

Cam's initial full-map playtest requested joined Crown borders, a capital icon,
dedicated Crown map art, two or three neutral starts, allegiance in the header,
and fewer resource icons. He confirmed: show supply problems only.

## Behavior

- Crown regions share an exposed copper border. Internal Crown edges disappear;
  player, monster, unheld and selected-region treatment stays distinct. Cache
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
- Map Stock icons show missing supply sources in red and outputs without a
  local holder in amber. Ordinary hosted/supplied production and exports are
  hidden. Sources follow the real adjacent-road/faction provider network;
  Influence Practices use their installed allegiance. Empty holders still count
  as structural sources rather than making the map an inventory ticker. Actual
  allocated substitutions also count. Finished Structures' past construction
  bills are excluded; unfinished construction and authored upkeep still count.

Pillars 3 and 4 benefit from visible territorial identity and clearer causes of
control and supply. Pillar 2 keeps five-slot and space constraints intact. The
pillar 1 tradeoff is a quieter map with less routine production information;
full cards, multiplier inspection and supply details remain available.

## Impact and checks

Presentation changes do not advance time or mutate simulation state, RNG,
schemas or replay. The only new gameplay setup is deterministic neutral
initialization; serialized state shape and captured definitions do not change.

Focused checks cover neutral starts across nine seeds and JSON round-trips,
stock problem filtering, Crown boundary cancellation/cache changes, art alpha
and native widths, real phone header inspection, capital identification and
rendered capture/rewind restoration. `npm run verify` passed, including 39
full-map contract groups. `check:map-art`, the regional rendering probe and
`probe:crown-map` passed. The latter uses ordinary New Game at 844×390 and
1440×900 and checks actual touch inspection; its responsive harness suppresses
fullscreen changes while switching emulated viewport sizes. Pixel restoration
passed after Crown capture, monster occupation, road changes and cache eviction,
without another terrain bake. Final packaging and build-identity checks passed
after the last view refinement. Evidence is under ignored `artifacts/crown-map/`
and `artifacts/regional-presentation/1867/`.

The Gym handoff path does not currently prepare illustrated terrain; this pass
uses ordinary New Game for real-map review. Fixing that independent entry path
is outside this change. No Pages publication is included.
