# A revision — keywords contribute to Practice multipliers

Archived stage. The current Scholar association is
[Synthesis](../synthesis-a/README.md); Economic Regions now belongs to Merchant.

Cam's feedback: A is the closest useful direction. Apply the mechanic to each
Practice's multiplier, rather than adding to its base Stock output and introducing
another tracker on its face. B/C's presentation is harder to keep clean; retain
them as earlier comparison options, not the current direction.

This remains a throwaway prototype on `proto/keywords-classes`. It does not
authorize production integration, a PR, publication, or a complete class kit.

## Current behavior

- A is the default in the development selector and in `?prototype=keywords`.
- Economic Regions contributes to **Barter's Output Multiplier**. Scholar/Merchant
  activate it; Warrior/Priest leave it dormant.
- Monster Trophies contributes to **Monster Hunting's Output Multiplier**.
  Warrior/Priest activate it; Scholar/Merchant leave it dormant. The example moves
  from Observation because Research is not Stock and must not acquire Stock
  multiplier semantics. Observation retains its ordinary Research effect.
- Each eligible count contributes +1, capped at +6 for this experiment. The
  contribution adds to the existing pool: base 1 + keyword + other sources. It
  does not multiply the other contributions or change authored yields.
- Three settlements in a trade zone therefore give Barter Output ×4 with no other
  sources. Two previous kills give Monster Hunting Output ×3: its original 3 Stock
  becomes 9 before workers and capacity. Its separate 6 Research remains 6.
- Capacity, input recipes, activation timing, Charge gain and workers retain their
  existing rules. A full host can still cap retained Stock.
- The existing Output/Capacity fitting is the only compact multiplier display.
  Its normal ledger identifies Economic Regions or Monster Trophies as a source.
  Card inspection links the named keyword to its definition and current count.
  The ER/MT tracker strips have been removed from card art across all options.
- The passive multiplier rule has its own untimed line in the card reading,
  without a phase label or activation arrow. Timed yields remain separate.

The class associations and +1 coefficient remain proposals. This revision serves
**pillar 1, powerful interacting engines**, by composing with an established pool,
and **pillar 4, inspectable consequences**, through the existing source ledger.
Class gating continues to serve **pillar 2, distinct constrained builds**, while
straining cross-class combinations. No universal route or extra administrative
resource is introduced.

## Try it

Run `npm start`, open `#/dev/prototypes`, select A and a class, then open a fresh
experiment and choose a disposable New game slot. The live workshop has the same
selector. Direct queries:

- `?prototype=keywords&variant=disciplines&class=scholar`
- `?prototype=keywords&variant=disciplines&class=warrior`

Select a player settlement. Tap the existing Output fitting below Barter or
Monster Hunting to inspect the named contribution. Tap the card and its keyword
to inspect the definition. Let the first Death phase resolve the seeded Hunt;
the following output reading includes the new trophy. No per-card counter strip
is added.

The original seed, supply fixture and planned-class lens limitations remain as
described in the parent report. Old captures in the parent folder preserve the
initial flat-output experiment; this folder holds the revised A captures.

## Validation

`npm run verify` passed for this revision on 24 October 2026.

`npm run test:keywords` retains the twelve mode/class and replay/JSON checks and
adds non-unit base yields, additive composition, unchanged capacity, unchanged
Research, actual production, and actual selected-class/between-life behavior.

`node scripts/keywords-classes-prototype-browser.mjs` now defaults to A's Scholar
and Warrior states. It checks both named definitions and the real existing
multiplier fittings, including unchanged base yields and active source rows.
Captures are buffered under ignored artifacts and copied here after the run, so
writing them does not change the served build identity during inspection.

The revised browser run passed both class states, four keyword-definition taps
and all four existing multiplier fittings, with zero page errors. All 14 PNGs
are 844×390:

- Scholar: [clean board](disciplines-scholar-board.png),
  [Economic Regions in the Output ledger](disciplines-scholar-economicRegions-multiplier.png),
  [linked definition](disciplines-scholar-economicRegions-definition.png).
- Warrior: [clean board](disciplines-warrior-board.png),
  [Monster Trophies in the Output ledger](disciplines-warrior-monsterTrophies-multiplier.png),
  [linked definition](disciplines-warrior-monsterTrophies-definition.png).

Reciprocal dormant keyword readings and both full card inspections are also saved
in this folder. The original comparison captures remain in its parent folder.

The previously reproduced baseline failure in the supplemental settlement probe
is recorded in the parent report; no graph behavior is changed by this revision.
