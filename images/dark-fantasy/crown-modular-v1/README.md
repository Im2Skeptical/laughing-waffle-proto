# Warlord modular city kit — local iteration

This is the local art/composition iteration for Trello `g1t0yH8o`.
`warlord-parts-v1.png` is an original built-in imagegen sheet with 20 complete
transparent components. `prompts.json` records its exact prompt and source path.
Nothing is a region-sized painting. The earlier fitted Crown kit is preserved
for the baseline comparison and ordinary outer Crown towns.

The second iteration adds `warlord-links-v2.png`: 16 supplementary blade towers,
joinable galleries, ramparts, junctions, court and ruin components. Exact prompt
and inspected reference roles are in `links-v2-prompts.json`. The original
connected wings remain available for provincial courts and capital wards.

The third iteration adds `warlord-citadel-v3.png`: eight joining monumental
sections, with the exact built-in generation prompt in `citadel-v3-prompts.json`.
A gate terrace, rear rampart, middle terrace, palace and three-prong summit form
one capital centre; lateral wings join where dry foundations fit. The planner
tries complete compositions atomically. It never substitutes a cropped fortress.
This source is retained for comparison.

The current fourth iteration uses `warlord-perspective-v4.png` and its exact
built-in prompt record `perspective-v4-prompts.json`. It redraws the eight
capital sections with higher diagonal roofs, side faces and deeper terrace
floors, and adds four provincial sections: governor's hall, gatehouse, gate
court and side gallery. Capital import widths and ordinary house scale are
unchanged. Upper tiers recede diagonally and return walls sit behind the lower
gate terrace. Provinces now receive dense city fabric across suitable land in
their own region; complete provincial sprite bounds stay inside that region.
Their lower governor's court has no capital triple-prong summit.

`python scripts/import-crown-modular.py` uses the established alpha-gutter parser,
rejects cut silhouettes, matches ordinary houses to the existing 12px import,
and writes the reduced atlas/manifest into the shared map runtime directory.
Source art is excluded by the existing Pages build filter; only runtime pieces
ship. The current 63-frame runtime WebP is approximately 152KiB. The manifest also stores
foundation contacts derived from each module's opaque alpha silhouette. These
keep foundations off roads while allowing a tall facade to occlude ground behind
it; elevated palace tiers rest on the lower architecture. Complete projected
sprite bounds must still be dry and reserve space against terrain relief.

The shared settlement planner/terrain pipeline provides worked ground, lanes,
relief reservations and dry footprint constraints. `crown-urban-prototype.js`
creates the dense plots for the original capital and three provinces, with a
limited dry-land capital fringe. The drawing layer preserves the normal
settlement/readout anchor and building scale. Capturing the city retains the
kit, plots and ruins, with only a muted material tint on its central building.

`?crownArt=baseline` uses the original fitted kit and compact town planning.
The default in this isolated branch is the modular candidate. No variant
switcher or extra design labels appear in the actual game UI.

The fifth iteration adds `warlord-biomes-v5.png`, with exact built-in provenance
in `biomes-v5-prompts.json`. Fifteen complete parts adapt the capital's rear
supports and upper palace, and the provincial governor's hall, to plains,
forest, islands, swamp and mountains. Native widths remain fixed. Concrete roots,
salt-worn basalt, raised wetland supports or fitted rock terraces meet the
architecture; this is not a biome tint or a region-sized scenic painting.
The principal palace/hall is anchored at the regional centre. Exposed urban
frontiers retain irregular bands of native terrain, while shared original
urban borders have no additional landscape setback. Architecture and biome
identity still survive capture.

This sheet is a candidate, not Cam's final art acceptance. The other three
enemy-class families are not generated yet. Their current palette and patron
grammar are recorded in `docs/crown-modular-art-iteration.md`.
