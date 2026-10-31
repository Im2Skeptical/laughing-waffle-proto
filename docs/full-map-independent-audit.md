# Full-map implementation: independent audit

This records the original isolated implementation audit. Cam subsequently
requested first-class main integration; see the
[integration report](full-map-main-integration.md) for current delivery scope,
restored main changes and combined-build verification.

Reviewed against `3bc6dda44e91b0eee460a5b0a5e3de277251e5f3...fdfce55b8f314ef4f477495e5b4db8c6c1dfcd06`,
the [audited contract](full-map-redesign-audit.md), its parent dispositions and
Cam's latest decisions. The parent inspected the implementation and ran fresh
default-game, intervention and joined-journey checks. Two independent review
agents examined Standards and Spec separately; neither changed tracked files.

## Standards

1. **Captured definitions, medium risk.** The Practice draft projector classified
   incoming cards through module-global definitions while execution used the
   run's captured `gameConfig`. A category difference could create a Stock host
   on an Influence Practice, or omit its allegiance. Category editing is not
   exposed by today's reviewer, so this was a captured-reader consistency risk,
   not an ordinary-default failure. **Fixed:** require a definition resolver in
   the pure projector; its shop caller supplies captured definitions. The
   regression deliberately supplies categories differing from current source
   and verifies correct fields without mutating the definitions.
2. **Possible duplicated-code smell, tuning consistency.** Campaign detachment
   and adjacent support repeated occupation coefficients independently of
   `CONTROL_DEFAULTS`. Current values matched, but later tuning could disagree.
   **Fixed:** all three calculations use the shared coefficients. No additional
   substantive determinism, JSON, layering or DSL-first breach was reported in
   the examined changes.

Standards result: one captured-reader issue and one tuning-consistency smell;
both resolved. Existing tooling remains responsible for mechanically enforced
architecture and reachability constraints.

## Spec

1. **Resource defence reactions, definite defect.** Successful-defence events
   were compared with instance allegiance for every Practice. Resource Practices
   have no allegiance, so Border Skirmishing never gained Charge or Loot.
   **Fixed:** Resource reaction ownership follows the regional controller;
   Influence reaction ownership follows the installed allegiance. A regression
   verifies both matching and opposing events before and after capture.
2. **Garrison supply, missing general rule.** Upkeep was local-only, silently
   preventing an allied neighbouring Food producer from supplying a garrison.
   The parent interprets the agreed holder-allied supply rule as applying to
   military upkeep. **Fixed:** every garrison first attempts its complete local
   payment, then failures retry against eligible allied leftovers. Civilian meals
   still resolve earlier. Regressions verify local priority, shared success and
   rejection after the provider changes faction.

Spec result: two discrepancies, both resolved. No restriction on foreign
replacement or manual Practice shutdown was introduced by these corrections.

## Additional parent finding

The old settlement-founding selectors treated an inhabited, unheld region as an
empty frontier destination. The authoritative establishment operation rejected
it, but the UI could offer it as legal and an ordinary founding attempt could
debit Prestige before that rejection. **Fixed:** shared empty-frontier
eligibility is used by ordinary founding requirements, destination offers and
Legacy targets. Inhabited and dormant ruin sites cannot be overwritten through
founding; actual empty destinations in authored legacy fixtures remain legal.
The regression also verifies that eligibility inspection changes no population,
Stock, Prestige or RNG.

## Independent verification

- Final `npm run verify` passed after all code corrections: docs, architecture,
  source reachability, assets, production build/preview, all 31 full-map groups
  and the repository's model, presentation, save and replay suites.
- `npm run test:full-map`: 31 contract groups, including the four added
  regressions, passed.
- A fresh ordinary `npm run probe:full-map` passed New Game, Load, 20 real
  inhabited regions, phone/desktop navigation, graph input, real workers and
  baseline-storage sentinels. It was run before the small audit corrections;
  the subsequent intervention probe exercises the corrected draft path.
- `npm run probe:full-map-draft` passed after the corrections: phone drafting,
  hostile replacement costs, discard/Undo and separate Citadel multiplier
  ledgers.
- The parent drove actual normal candidate selection, generated nodes,
  development choices, commissions, purchases, travel and adoption through
  multiple successive lives in both founder lines. No population, force,
  treasury, offer inventory or graph fixture was injected. Each journey reached
  three controlled regions from two, and produced remote loyal population.
  Each comprised 35 generated node visits across three lives; final raw state
  and RNG matched authoritative action/tick reconstruction exactly.
  These are automated journeys, not claims of a full human balance playtest.

Detailed evidence is ignored under `artifacts/full-map-independent-audit/`:
`journey.mjs`, `journey.json`, `verify-final.log`, `draft-ui.log` and a diagnostic
model CPU profile. The diagnostic profile is not a before/after optimisation
claim. Full-map exact-state replay tests remain the replacement for the obsolete
historical differential harness described in the implementation report.

## Performance and boundaries

The fresh 1x browser opening took about 64 seconds, agreeing with Astra's
measurement. Astra's 4x CPU opening/reload were about 164/134 seconds and used
about 662 MB heap; these are emulated desktop-browser measurements, not physical
phone guarantees. Cold loading remains a material limitation. No opening
forecast, official tick, every-second summary or offscreen region was skipped
to make these measurements look faster.

At this audit's completion, the work remained a local experimental fork. The
baseline was pinned and separately runnable on port 5196 with fingerprint
`6e85c81410fa`; no primary-main change, push, PR, merge or Pages publication was
part of that audit. The later integration request supersedes that delivery scope.
