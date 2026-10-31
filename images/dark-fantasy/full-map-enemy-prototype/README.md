# Decaying enemy institutions — content prototype

Question: can four inherited enemy institutions feel like distorted, developed
versions of the player classes, with a recognisable capital and fading presence
toward the frontier?

This is the second content pass on `proto/full-map-bronze-card-review`.
Open `#/dev/prototypes?study=full-map-content`. Add `&pool=dictator`,
`&pool=oligarch`, `&pool=papacy` or `&pool=sect` for a direct class review.
The original 30 neutral cards and 20 player candidates are preserved.

## The four identities

| Enemy class | Institutional distortion | Useful capability to inherit | Cost or political liability |
| --- | --- | --- | --- |
| Warlord: military dictatorship | Provisioning becomes enlistment; protection becomes occupation | Arms, monster defence, housing and logistics | Continuing food demand, loyal garrisons and coercive political infrastructure |
| Merchant: decadent oligarchs | Commerce becomes monopoly, dependency and private luxury | Efficient milling, Currency and storage | Rent, conspicuous consumption and purchased allegiance |
| Priest: corrupt papacy | Care, faith and belonging become conditional on payment | Food, shelter and stores | Tithes, institutional upbringing and an expensive clerical court |
| Philosopher: secluded bureaucracy | Knowledge preserves the administration's categories instead of renewing society | Research, Records, training and storage | Duplicate filing, credential capture and Construction diverted into unbuilt plans |

Each pool has 20 cards: 12 Practices and 8 Structures. Six suggest Frontier,
eight Province and six Capital placement. Their initial Bronze/Silver/Gold
maturity readings are review proposals; capital pieces are intentionally developed.
The decay is often misdirected competence, not universal economic weakness.

## Later map experiments to preserve

These are notes for the later real-game map/board prototype, not a map generator
or simulation implemented in this pass.

- Compare one main class plus a secondary splash with a monoclass enemy.
  The splash shares the same enemy faction allegiance. Class and allegiance
  remain independent. Candidate pairings: dictatorship + bureaucracy, oligarchy
  + papacy, papacy + dictatorship, bureaucracy + oligarchy. Try other pairings
  when the cards suggest a clearer identity; none are fixed canon.
- Suggested five-Practice mixes: capital 4 enemy / 1 neutral; province 3 / 2;
  frontier 1 / 4. A splash might use 3 main / 1 secondary / 1 neutral in the
  capital and 2 main / 1 secondary / 2 neutral in provinces. The frontier keeps
  the main identity. No extra Practice slots; Structure capacity stays separate.
- Use distance along connected regions, with guaranteed local stronghold areas,
  rather than visual screen distance. Band widths and exact weights remain open.
- Guarantee a functional combination at the capital and credible inputs on its
  local board or connected supporting boards. Resource access across factions is
  unresolved, so a later prototype must expose the supply assumptions explicitly.
- Concentrate developed Practices, storage, amplifiers and support Structures
  near the centre. Outlying neutral boards create renewal opportunities and
  economic supply, with occasional valuable exceptions to discover.
- Keep enemy activity chiefly in inherited local institutions and bounded reach.
  These cards do not establish active enemy expansion or military invasions.

Candidate capital combinations to assemble later, within five Practice slots:

- Dictatorship: Arsenal Quotas, Barrack Levy, Capital Dole, Victory Procession,
  Hand Quern. Surrounding supply must make Metal, Fuel, Grain and Loot credible.
- Oligarchy: Monopoly Milling, Luxury Weaving, Gilded Patronage, Municipal Debt,
  Fallow Fields. Cloth/Fuel inputs and housing are visible dependencies.
- Papacy: Consecrated Brew, Purchased Absolution, Grand Jubilee, Novice Vows,
  Fallow Fields. Water, Cloth and Currency need supporting producers.
- Bureaucracy: Duplicate Returns, Redundant Inventories, Credential Examinations,
  Abstract Disputation, Rag Pulping. Cloth, Currency, Instruments and food must
  come from supporting boards. This should feel impressive and materially dependent.

These are test fixtures to author, not guarantees that five listed pieces alone
are self-sufficient or balanced. Placement order and timed upkeep matter.

## Open rules and review assumptions

Worker allegiance and unstaffed activation remain open. No worker rule changed.
Priest population specialty is proposed; these cards do not implement priest
birth influence. Merchant cards need no new Merchant population specialty.
Control thresholds, unrest and military action remain open too.

For this review only, Stock and Research are provisionally regional rewards;
conversion and occupation benefit the installed piece's faction. In particular,
an enemy academy could provide Research while preserving a rival scholarly elite.
This answers a review need, not the unresolved resource-ownership design.

All new political rules, conditional drains and reach are descriptive data.
Existing operations project ordinary Stock, Research, Housing and multiplier
symbols through the real Zoo renderer. A completed Structure's fitting shows its
bonus; its reading states whether that bonus is conditional. No staffing, upkeep,
allegiance, occupation, schemas, RNG, simulation state or replay is implemented.
The production registry stays separate. Source artwork is loaded on demand via
its own atlas. Keep / reconsider tier / cut and notes stay in memory; export first.

## Pillar assessment

- Pillar 1, interacting engines: each capital has supply, amplification and payoff.
  Strong multipliers risk a universal compulsory capital package.
- Pillar 2, scarce opportunities/space/resources/time: five slots and inherited
  tradeoffs make replacement meaningful. Pure drains risk obvious, tedious cleanup.
- Pillar 3, visible civilisation change: repairing an institution changes whom
  it serves and what the kingdom can do. The class identities must remain legible
  when splashed; monoclass is the comparison, not a discarded option.
- Pillar 4, projection: explicit recipes, cadence, targets, upkeep and reach make
  later forecasts possible. Conditional capital engines need a playable supply
  forecast before balance conclusions.
- Pillar 5, legacy: enemy capitals offer institutions worth inheriting, but this
  pass establishes no cross-civilisation persistence or rewards.

The aesthetic/UX guidance is applied through the real compact face, quick read
and full inspection, existing phone styling, anonymous figures and class palettes.
Merchant warm stone/umber/gold/olive and Priest ivory/gold/plum are proposed
extensions of the existing neutral palette; Warlord red and Philosopher blue keep
their established identity. Enemy allegiance symbols and worker rail placement
remain an independent UI question from the preceding discussion.

## Artwork and verification

`prompts.json` records one dedicated built-in image-generation prompt per card,
the composition and inspected surface references, proposed palettes and outputs.
Accepted sources live under `art/`. Each image is checked at full size for faces
and at actual card size for focal action, silhouette and overlays. Corrections
are recorded separately if needed.

Focused atlas command: `node scripts/build-sprite-sheets.mjs full-map-enemy-prototype`.
Check 130 unique candidates, 20 per enemy class, 6/8/6 placement per class,
48 enemy Practices/32 Structures, original neutral equality, disposable projection
purity, actual full inspections, review export and phone overflow. Run docs,
architecture, source, assets and build checks plus the focused browser probe.
No PR, merge, push or publication is authorised.

Verified locally: 130 unique faces; all 80 new illustrations are distinct; all 80
enemy inspections open without browser errors; class and placement totals,
filters, in-memory notes, 130-row export, reload and phone portrait/landscape
checks pass. The original 50 definitions compare equal to commit `00c7a408`;
the input simulation state is byte-identical after projection and its registry
remains 188 pieces. Docs, architecture, source reachability, assets, build and
existing card-review tests pass. Evidence lives in ignored
`artifacts/full-map-enemy/`.

`generation-results.json` records the generated source path, accepted workspace
path and SHA-256 for each illustration. All sources were checked at full size
and through actual renderer faces. Built-in generation was used throughout.
