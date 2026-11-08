# Playable Warrior Force / Crown occupation pass

Cam requested implementation in the local prototype on 2026-11-06 so that the
shield numbers express a Warlord Crown holding most of the kingdom by soldiers.
This is an unmerged experiment on `experiment/regional-readout-20261105`.

Latest: [larger garrisons and fixed 70% UI](LARGER_GARRISONS_50_YEAR.md).
That pass supersedes the opening army counts and minority-Crown setup below.

The subsequent [food and control-threshold pass](FOOD_CONTROL_THRESHOLDS.md)
supersedes the earlier starting boards and shield-midpoint presentation below.

## Implemented rules

- Each loyal adult or Elder Warrior provides **1 baseline Force**, including
  while assigned as a worker. Children and opposing Warriors do not contribute
  to the holder. Baseline Force requires no Arms and no extra garrison meals.
- Existing explicit card/building bonuses keep their resource requirements.
  Their supply conditions affect the conditional bonus, not Warrior baseline.
  Only explicit card upkeep is charged by garrison upkeep resolution.
- Holding Force is local baseline plus active bonuses, minus assigned outgoing
  strength, plus explicit adjacent garrison support. Assigned Warriors/Force
  remain unavailable at their source. Direct card Force can support occupation
  without an additional hidden requirement for a local armed Warrior.
- The provisional occupation requirement is `ceil(non-loyal residents / 5)`.
  Retention remains 45% allegiance; claiming remains 60% on two Death checks.
  Force coverage sustains an occupation; losing coverage produces unrest and
  eventually loss through the existing control resolver.
- Campaign attacks count available adult Warrior detachments at the same
  1:1 Force rate without an Arms cap. Holding reserves and outgoing assignments
  are excluded. Successful conquest moves actual people, without fabricating
  or transferring equipment. Elders provide local baseline but are not moved
  as adult expedition detachments. Personal Prowess/Retinue rules are retained.
- Normal full-map newborns inherit their source cohort's specialty; birth totals,
  residency and the current pre-birth allegiance distribution are preserved.
  Cam restored class births on 2026-11-06 to trial specialist replenishment after
  observing rapid attrition under ordinary-only births. Children contribute no
  Force until mature. Common Seigneurial Muster remains in the Warlord pool:
  active specialist training still belongs to class-specific Practices.

## Actual opening, not display samples

The map remains two player regions, fourteen Crown holdings, three neutral
towns and one Monster region. The Crown capital retains 80% loyalty and 60
Warriors; its three provinces retain 60% loyalty and 20 Warriors each.

The ten outer Crown towns now have **35% Crown allegiance**, with their existing
quarter-population loyal adult Warrior cohorts (capped by eligible adults).
These are genuine military occupations: below the 45% support threshold but
with sufficient Force to hold. Initial unrest uses the existing occupation
target. No residents are added. The fixed seed 123 has 214 Crown Warriors.

The floating shields show real model Force. Crown shields have a copper rim and
dark red metal, with a bright lower crest for occupation coverage. Touch/hover
inspection explains local Warrior baseline, card/support contributions, required
Force and why the minority Crown holder keeps control. Player active income,
muted non-player potential Prestige, the worker circle/pill motif, the 70% size
default/slider and restored live-game region titles are retained.

Force numerals now match the worker/Prestige numeral size, with one uniformly
larger shield silhouette for readability at the 70% default. Inspection uses the
larger existing tooltip scale. No per-settlement resizing or label dodging returns.

## Opening forecast compatibility

The stronger armies can prevent the fixed opening's former extinction. New Game
preparation now accepts a fully prepared bounded forecast when no loss is found;
it does not fabricate a terminal state or label a coverage bound as a loss.
The Dev fixture prepares the existing forecast-cache capacity (200 years),
retaining every-second summaries, normal anchors and all simulation ticks.
This bounds the JSON payload rather than serializing a 600-year nonterminal
opening past the runtime string-size limit. Opening still waits for its complete
prepared forecast; reveal/scrub rules and forecast simulation are unchanged.

## Scope and validation

Priest birth intervention, baseline Scholar Research, Merchant money and
classed-worker bonus UX remain unimplemented design work. Numeric resistance,
starting armies and existing card bonus strengths remain provisional.

No new GameState fields, schema versions or RNG draws are introduced. New rules
run through the authoritative model/phase pipeline used by live play, projection,
save continuation and replay. Use a fresh prototype run for this experiment.

Core checks cover all 130 seeded Crown openings, real minority occupation,
counterfactual loss after removing an army, intrinsic unarmed/unsupplied Force,
adult/Elder/child/allegiance boundaries, assignment conservation, inherited births,
smallest real campaign detachments, serialization/replay and nonterminal opening
preparation. Actual map captures use
`node scripts/capture-stable-regional-ui-prototype.mjs`.

Launch `npm run prototype:regional`, then
`?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&perf=1&art=1&launch=new`.
The optional `regionalStart=opening` review flag holds the viewed opening at
second zero after the normal introduction, so the Crown start can be inspected.
Ordinary playback controls still explore the real forecast.

## Captured results

- 130 deterministic opening seeds passed, including serialization/replay and
  counterfactual loss of a minority Crown holding after its army is removed.
- All 44 full-map contract groups passed, including intrinsic Force, assignments,
  inherited births, class-only Muster, and exact live/projection/replay parity.
- Repository verification stages passed: docs, architecture, source, assets,
  build/preview, gameplay, presentation, card review and replay stress. The
  catalogue assertion now accounts for Muster joining the Warlord pool.
- Actual captures passed at four zoom levels, phone and desktop, with zero page
  errors. They confirm 14 Crown armies, 10 occupations and real Force values
  ranging from 5 to 60 (214 total in seed 123), plus readable touch inspection,
  unchanged title behavior, stable geometry and direct economy clicks.
- The review link is verified held at frontier/viewed second zero. The fixed
  opening survives the prepared 200-year window; survival and strong Crown
  coverage are prototype balance results, not a final balance claim.

Screenshots and geometry: `artifacts/regional-stable-layout/`. Rule/verification
logs: `artifacts/warrior-force-prototype/`. No source was merged or published.

## Class-birth replenishment trial

Cam requested restoring class births after the ordinary-only experiment lost
specialists too quickly. The same seed 123 was run for 200 years before and after
restoring specialty inheritance, without changing starting armies, Food, Housing,
allegiance allocation, mortality or Force rules. These are live model simulations,
not displayed sample values.

| Elapsed years | Holding Force, ordinary births | Holding Force, inherited specialty |
| --- | ---: | ---: |
| 0 | 214 | 214 |
| 10 | 228 | 242 |
| 25 | 88 | 252 |
| 50 | 11 | 146 |
| 100 | 3 | 163 |
| 200 | 0 | 242 |

Holding Force is summed only over regions currently controlled by the Crown.
Specialty inheritance replenishes the Warrior population, but does not by itself
preserve the outer occupations: both trials have four Crown holdings by year 25.
This is a single-seed balance observation, not a guarantee for every opening.
Newborn allegiance still follows all-age local shares; specialty inheritance does
not mean that newborn Warriors automatically inherit Crown allegiance.

Probe source and results: `artifacts/warrior-force-prototype/inherited-births-probe.mjs`,
`ordinary-births.json` and `inherited-births.json`.
