# Warlord modular city kit — local iteration

This is the local art/composition iteration for Trello `g1t0yH8o`.
`warlord-parts-v1.png` is an original built-in imagegen sheet with 20 complete
transparent components. `prompts.json` records its exact prompt and source path.
Nothing is a region-sized painting. The earlier fitted Crown kit is preserved
for the baseline comparison and ordinary outer Crown towns.

The second iteration adds `warlord-links-v2.png`: 16 supplementary blade towers,
joinable galleries, ramparts, junctions, court and ruin components. Exact prompt
and inspected reference roles are in `links-v2-prompts.json`. All 36 pieces
share one runtime atlas. The planner binds three separate capital arms to a
cross-gallery and uses shorter paired arms for provinces. Attached courtyard
compounds organise denser infill instead of repeated town blocks.

`python scripts/import-crown-modular.py` uses the established alpha-gutter parser,
rejects cut silhouettes, matches ordinary houses to the existing 12px import,
and writes the reduced atlas/manifest into the shared map runtime directory.
Source art is excluded by the existing Pages build filter; only runtime pieces
ship. The 36-frame runtime WebP is approximately 36KiB.

The shared settlement planner/terrain pipeline provides worked ground, lanes,
relief reservations and dry footprint constraints. `crown-urban-prototype.js`
creates the dense plots for the original capital and three provinces, with a
limited dry-land capital fringe. The drawing layer preserves the normal
settlement/readout anchor and building scale. Capturing the city retains the
kit, plots and ruins, with only a muted material tint on its central building.

`?crownArt=baseline` uses the original fitted kit and compact town planning.
The default in this isolated branch is the modular candidate. No variant
switcher or extra design labels appear in the actual game UI.

This sheet is a candidate, not Cam's final art acceptance. The other three
enemy-class families are not generated yet. Their current palette and patron
grammar are recorded in `docs/crown-modular-art-iteration.md`.
