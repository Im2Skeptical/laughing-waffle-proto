# Crown map buildings

Three original transparent sprites generated with built-in imagegen on
2026-11-01: capital keep, provincial garrison hall and provincial tenements.
The existing settlement building masters were inspected first. Exact prompts
and generated-file provenance are in [prompts.json](prompts.json).

Ash-grey ossuary masonry, vermilion fabric and oxidized teal roofs distinguish
the decaying Warlord empire. Upper-left lighting and the existing overhead
perspective keep the kit consistent with the biome villages. No card art or
gamepiece definitions are replaced.

The existing offline map importer crops alpha bounds and reduces these sources
to 48, 34 and 18 pixels wide. It preserves source alpha and packs a dedicated
`crown-buildings-v1` WebP/JSON pair alongside the map runtime assets. Rebuild just
this group with `python scripts/import-map-terrain.py --crown-only`; the ordinary
map-art build also includes it. Source masters never ship to Pages.

The real regional renderer chooses these buildings from the viewed holder and
capital identity. Capture and rewind therefore change the presentation without
altering buildings, population, RNG or geography in the simulation.
