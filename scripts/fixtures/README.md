# Focused regression fixtures

`crown-capital-123-layout.json.gz` captures a 129x129 section of the production
seed-123 capital raster at main 7c8f084c plus the local centred-town iteration.
It contains dry/water/region masks, the centred capital anchor, region centres,
border polylines, module dimensions and affine coordinate transforms.
It contains no GameState or save.
The test substitutes the current atlas geometry, so revised art is checked
against the captured real terrain rather than frozen old sprite dimensions.

The original fixture caught a complete fortress being lost to road clearance.
The current capture follows Cam's later requirement that the landmark stay at
the region centre. The plan now precedes road routing: existing connections
avoid foundation contacts, including search-grid/paint rounding clearance;
upper tiers stand on the architecture below. The historical dry-shoulder anchor
is obsolete. Current visual approaches may move, while their gameplay graph
and the authoritative regional centre remain fixed.

Run `node scripts/crown-citadel-fixture-check.mjs` to replay it in milliseconds.
The test requires a complete assembled centre with both joined terrace wings
and exact repeatability. Browser coverage separately requires every planned
section to survive production rendering.
