# Minimal bronze defaults

The 2026-10-08 `card-reviews (1).json` export is now the authored default:
33 cards have proposals, and the other 14 flagged cards have no edits.
New games use these definitions without enabling edited cards. Existing runs
retain their captured gamepieces. The full content registry remains available
for inspection and editing; this is a provisional bronze balance test.

- Locked Practices: Carpentry, Housebuilding, Herbalism, Corpse Garden.
- Moved to Silver: Charcoal Burning, Toolmaking, Pottery, Tax Assessment,
  Copying Texts, Smoking Rations; Technical Workshop, Cistern, Workshop, Kiln.
- Scholarship moves to Bronze.
- Tool Stock Supply visits have no offers at zero Research because every Tool
  producer now starts at Silver; generation and rerolls never add unrelated filler.
- Foraging, Logging, Quarrying, Masonry and Salt Gathering have one worker socket.
- Stock traits: Foraging = Edible; Logging = Timber/Construction; Surface Mining
  = Ore; Salt Gathering = Salt/Currency; Pottery = Storage; Brickmaking =
  Construction; Brewing = Currency/Edible; Salt Curing = Edible; Record Keeping
  and Surveying = Record.
- Stock capacity: Quarrying 3, Brewing 8, Salt Curing 20, Milling 16,
  Record Keeping 8, Raiding Parties 20.
- Masonry and Weaving no longer require Tools. Brickmaking consumes nothing
  and requires one Water and one Ore. Brewing consumes one Edible and one Storage.
- Record Keeping runs every season, retaining population scaling; Surveying runs
  at Migration with one Stock and one Research, without Stock inputs.
- Raiding Parties produces base 10 Stock in Summer and 5 in Autumn, retaining
  its existing target scaling and inputs, and adds one Chaos per successful Raid.
- Granary gives Edible Practices +5 capacity. Timber House takes eight paid
  Housing cycles; Sheepfold and Storehouse take four. Storehouse consumes two
  Construction per cycle.

Removing Mineral and Vessel from their producing cards intentionally leaves
the unchanged later-tier Glassmaking, Distilling and Embalming recipes without
a Common/Scholar Practice provider. Definition diagnostics continue to report
these three gaps; tests permit only these documented gaps. Later-tier chain
balance is outside this bronze test. The editor retains the full Stock trait
vocabulary, including Mineral and Vessel, so saved reviews remain editable.

The workbook remains historical source data; runtime defaults supersede its
affected balance values. Mechanics still use existing DSL operations, five
Practice slots, serialized game configuration and authoritative replay.

Verify with `npm run verify`; focused coverage is in
`npm run test:detailed-settlements`, `npm run test:card-review` and
`npm run test:detailed-replay`.
