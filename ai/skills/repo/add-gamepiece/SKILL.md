---
name: add-gamepiece
description: Add or tune a detailed-settlement practice or structure. Use when creating a gamepiece, editing practice/structure defs, extending DSL effect ops, or mentioning forage, cultivate, granary, or Gamepieces.
---

# Add a practice or structure

Content lives in `src/defs/gamepieces/detailed-settlement-defs.js`
(`detailedSettlementPracticeDefs`, `settlementStructureDefs`,
`detailedSettlementEffectOps`). Do not add pieces to
`settlement-practice-defs.js` or `hub-structure-defs.js`.

## DSL-first

1. Express the behavior with an existing op from
   `detailedSettlementEffectOps`.
2. If that is not enough, add a **generalized** op and executor, then wire
   the piece as data. Prefer a reusable op over one-off model logic.
3. Ops and evaluators are interpreted by `src/model/detailed-settlements.js`
   (barrel) / `src/model/detailed-settlements/`. Designer Docs
   (`Designer Docs/Effect-Op-Dictionary.md`, `Targeting-Dictionary.md`,
   `Trigger-Dictionary.md`) describe the intended DSL; they can lag live
   activations.

## Activations vs Designer Docs

Live moon order is the six phases in
`src/defs/gamesettings/moon-phase-defs.js`: birth, food, housing, faith,
migration, death. Current `activation.type` values include `season`,
`food` (`preRouting` / `postRouting`), `birth`, `housing`, `faith`, and
`trigger`. Do not invent `newMoon` / `passive` activations from older
Designer Docs unless they exist in defs and the barrel.

## Do not

- Put new gameplay in `src/model/settlement-exec.js` or
  `src/model/settlement-state.js`.
- Add bespoke per-id branches when a generalized op can cover it.

## Test

```
npm run test:detailed-settlements
```

Replay-sensitive schema or tick changes also need
`npm run test:detailed-replay`.
