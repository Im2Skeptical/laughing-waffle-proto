---
name: add-gamepiece
description: Design, add or tune this repository's Practice and Structure cards. Use for new card proposals, playable gamepieces and card behavior changes; route new artwork to illustrate-gamepiece.
---

# Create a gamepiece

Read `ai/ai-context.md`, [game design](../../../docs/game-design.md) and
[aesthetic/UX guidance](../../../docs/aesthetic-ux-design.md). For new cards or
substantial redesigns, use [the card design guide](../../../docs/card-design-guide.md).
For a number-only adjustment, inspect the affected definition and relevant tests.

## Match the requested outcome

- **Proposals:** resolve the design brief below and present the rules, combinations,
  weaknesses and open choices. Code and image generation follow only when requested.
- **Playable cards:** implement the brief through runtime definitions, verify
  real acquisition and activation, integrate suitable artwork and inspect the game.
- **Artwork only:** follow [illustrate-gamepiece](../illustrate-gamepiece/SKILL.md).
  Keep gameplay definitions unchanged.

For each new card, record its class, minimum tier, engine role, exact rules,
supporting cards, slot cost, weakness and pillar served/strained. Distinguish
minimum unlock tier from rolled quality. Check that its inputs and enablers can
actually be obtained at that tier, and show an opening that starts the engine.
The brief is complete when another agent can implement the card without inventing
its trigger, recipe, scope, scaling or payoff. Mark unresolved tuning explicitly.

## Implement the rules

Definitions live in `src/defs/gamepieces/detailed-settlement-defs.js`:
`detailedSettlementPracticeDefs`, `settlementStructureDefs` and
`detailedSettlementEffectOps`. Inspect a mechanically comparable live definition.
Read the relevant split-folder README before editing its resolver.

Use existing DSL operations first. When they cannot express the agreed behavior,
add a generalized capability and express the card through data. Consult
[effects](../../../Designer%20Docs/Effect-Op-Dictionary.md),
[triggers](../../../Designer%20Docs/Trigger-Dictionary.md) and
[targeting](../../../Designer%20Docs/Targeting-Dictionary.md); resolve conflicts
against the live resolver and current design decisions. Read `ai/sim.md` only
when the routing material is insufficient for a model change.

Use the live six moon phases, seasonal filters or event-driven Charge grammar.
Keep passive rules on their own untimed reading lines. Verify base yield,
Output Multiplier, Capacity Multiplier, worker behavior and retained Stock
separately; a capacity-clipped bonus may have no practical payoff.

For new illustrations, follow [illustrate-gamepiece](../illustrate-gamepiece/SKILL.md)
before choosing references or drafting prompts. Keep composition and rendering
rules in that workflow's existing sources rather than copying them here.

## Demonstrate completion

Test actual activation and payment, missing inputs, relevant class/scope boundaries,
and keyword contributions. Cover JSON continuation and authoritative replay for
new mechanics. Check pool eligibility and zero-Research availability for Bronze.
Exercise catalogue faces without a simulation state as well as installed cards.
For viewing fixtures, seed Stock within ordinary capacities and demonstrate
keyword progress through real events rather than rewriting a history counter.
Review catalogue-count assertions when adding entries; preserve original workbook
provenance rather than inventing workbook rows for new designs.

Run `npm run test:detailed-settlements` and `npm run verify` for playable content.
Art integration also follows the illustration skill's asset checks. Inspect the
actual card, linked keyword reading and multiplier ledger at phone landscape size;
capture a real working state and a meaningful blocked case. Follow `AGENTS.md`
and the user's branch/publication scope for local preview, commits and handoff.
