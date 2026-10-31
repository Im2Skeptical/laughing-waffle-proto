# Full-map Bronze content review

This records the original 50-card pass. The same review route now also includes
the [80-card enemy pass](../full-map-enemy-prototype/README.md), with proposed
Frontier/Province/Capital placements. The original card definitions are preserved.

Throwaway branch: `proto/full-map-bronze-card-review`.

Question: which of these 10 Warlord, 10 Philosopher and 30 neutral starting-board
pieces are worth keeping at Bronze, moving up a tier or cutting?

Run `npm start`, then open `#/dev/prototypes?study=full-map-content`.
The Prototypes directory also links to the set. It uses the real Zoo card faces,
quick reads and inspection at phone and desktop sizes. Review decisions and notes
live in memory; Export review notes downloads them before a reload or close.

## Agreed scope

- Generate and illustrate 50 candidates. No additions to the live gamepiece registry.
- Warlord and Philosopher name vassals; Warrior and Scholar name population specialties.
- Influence counts people’s discrete faction allegiance. A conversion transfers
  existing people between factions rather than producing abstract influence.
- An installed piece carries allegiance independently of its offer pool.
- Some inherited pieces are useful, some weak, some harmful. Replacements are
  the intended way to remove them in the full-map design.
- Output and Capacity Multiplier remain independent additive pools.

## Proposals, not agreed gameplay

Every card recipe, conversion count, cadence, range, acquisition price and
construction cost in this set is a proposal. Bronze is the starting review tier,
not a balance claim. Neutral cards are a starting-board set, not shop offers.
Weak/Useful/Mixed/Harmful are review annotations rather than gameplay keywords.
The expanded “Rules used by this proposal set” records conversion selection and
recipe assumptions explicitly. Conditional Structure drains and military coverage
remain descriptive proposals as well.

The set focuses on resource sinks, selective population conversion, limited
cross-border reach, military/civic combinations and recognisable inherited
dysfunctions. It primarily exercises design pillars 1–3. Shared readings and
explicit input/target/cadence rules support pillar 4. Veterans’ Hearth probes
retirement consequences but does not establish the cross-civilisation legacy system.

Pillar tradeoffs to review:
- Resource converters, training and conversion amplifiers serve pillar 1 (engines).
  Oath Hall and Open Archive strain Bronze if they make one mandatory engine.
- Neutral compromises and limited cross-border reach serve pillar 2 (scarce space,
  resources and time). Village School risks bypassing the five-Practice-slot budget.
- Mixed allegiance, targeted specialties and renewal serve pillar 3 (visible
  civilisation transformation). Purely harmful cards risk becoming automatic replacements.
- Explicit cadence, recipes and targets support pillar 4 (projection). Eligibility,
  opposing-faction selection and occupation thresholds still need playable forecasts.
- Veterans' Hearth touches pillar 5 (legacy), but this pass does not yet test
  inheritance across civilisations. Avoid treating retirement as that whole pillar.

The real card, quick-read and inspection layers follow the aesthetic/UX guidance:
compact symbols first, explicit causes and costs in the reader, with touch access
and the established anonymous figures and class palettes. The population symbol
is temporarily reused with an explicit Allegiance conversion legend. A dedicated
conversion icon is an open art decision, not a new gameplay keyword.

## Temporary implementation

The view projects disposable definitions through `getGamepieceFace`; it then adds
descriptive political rules to the shared reading. The resulting registry is never
stepped, saved, forecast or handed to the game. Population symbols on candidate
faces describe the conversion count; full rules distinguish conversion from training.
All card bodies retain the real renderer, resource symbols, frames and inspection.

The separate artwork atlas is registered and loaded only when this workbench opens.
Normal runs do not register these IDs or load its atlas. No simulation state, RNG,
schemas, replay rules, production gamepiece definitions or saved player data change.

## Art provenance

`prompts.json` contains the exact per-image prompts, current art constraints,
surface-reference identities, built-in image-generation tool and source filenames.
`generation-results.json` records the actual generated source paths.
`corrections.json` supersedes the initial prompts/results for Scrap Gathering,
Forced Pageantry and Toll Gate: a separate edit removed visible statue faces.
The initial sources remain in ignored review artifacts; all final source paintings
were checked at full size and through their actual card faces.
Each of the 50 candidates has its own separately generated opaque illustration
under `art/`. No source artwork was substituted or overwritten.
The focused TexturePacker job is `node scripts/build-sprite-sheets.mjs full-map-content-prototype`.

## Review and validation

Check the 10/10/30 pool totals, all unique paintings, real card faces, complete
Rules inspection, filters and review-note export. Check 844×390 landscape and
390px portrait for overflow and touch access. Reload to verify the direct route;
check normal Zoo still has only the live 188 cards.

Run `npm run check:docs`, `npm run check:architecture`, `npm run check:source`,
`npm run check:assets` and `npm run build`. Browser-check evidence is recorded
under ignored `artifacts/`. No PR, merge or Pages publication is authorised.

Validation completed: all 50 inspections opened without browser errors; 10/10/30
pool totals, 34 Practices/16 Structures, filters, note export and fresh reload
passed. Phone landscape (844 by 390) and portrait (390 by 844) had no horizontal
overflow. The simulation registry remained 188 cards and the disposable face
projection left its input state byte-identical. `npm run verify` passed, followed
by a fresh build after the final presentation-copy and art corrections.
