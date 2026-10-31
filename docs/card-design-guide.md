# Card design guide

Use this brief for new Practices and Structures. The [creation skill](../.agents/skills/add-gamepiece/SKILL.md)
routes proposals, implementation and artwork. [Game design](game-design.md)
governs direction; [aesthetic/UX guidance](aesthetic-ux-design.md) governs presentation.

## Design brief

Record these decisions beside the content or in its experiment report:

- **Identity:** name, class/Common pool, Practice/Structure, minimum unlock tier,
  and the concrete activity or institution represented. Quality and unlock tier
  are independent decisions.
- **Role:** the new engine, decision or alternative the card enables. Compare
  its behavior with existing cards; a new label alone does not widen the pool.
- **Rules:** trigger and scope; Scheduled/Charge mode; full Consume/Require recipe;
  base yields and Stock Traits; Charge gain/threshold where relevant; capacities;
  passive conditions, keyword coefficient and cap. State which quantities scale.
- **Composition:** one attainable opening, at least two useful relationships,
  and the displaced Practice or construction footprint. Work within five
  Practice slots, including food and all local providers. Identify any adjacent
  allied or neutral supply assumption and its cost.
- **Weakness:** what can interrupt or limit the engine, and what a different
  build does better. Evaluate feedback loops, crowding out alternatives and
  dependence on random offers. A Bronze engine should start with Bronze content;
  later-tier cards may improve it.
- **Pillars:** name the pillar served and any strained, with a concrete reason.
  Preserve meaningful choices rather than introducing upkeep with no decision.
- **Evidence:** a working state, a failure/blocking state, expected actual yields
  and the inspection reading explaining them. Separate proposed rules, temporary
  fixture resources and accepted design decisions.

## Tuning and readability

Follow [multiplier semantics](output-capacity-multipliers.md): output and capacity
are independent additive pools. Compare actual retained/consumed throughput at
zero, early and developed keyword scores; inspect how quickly the card caps out.
Scheduled workers affect Stock and conversion output; Charge workers affect
incoming Charge. Zero workers retains the base effect; staffing never gates
activation. Actual ingredients, population victims/reserves and eligible
conversion targets remain explicit requirements. Influence Practices carry
allegiance and conversion fittings; Resource Practices carry no allegiance and
their hosted Stock belongs to the regional controller. Structures have no
allegiance and may support an Influence Practice, rather than convert independently.
Record input costs, cadence and scarcity alongside headline yields.
Confirm that a trigger has a real emitter in the current simulation; a valid
activation name or inspection label alone does not demonstrate that it fires.

Keep the trigger, payment and outcome readable together. Put passive effects on
separate untimed lines. Use existing multiplier fittings and linked inspection
for named scaling mechanics; a new keyword does not require another card tracker.
Make dependency failures and contributor identities available through inspection.

Class identity should emerge from the decisions and dependencies. A keyword can
support food, equipment, construction or trade when the activity explains that
relationship. Avoid giving every card the same mandatory keyword payoff.
Use [Practice keywords](practice-keywords.md) for the integrated Synthesis and
Monster Trophies rules and captured coefficients. Unselected keyword alternatives
remain in their experiment reports; they do not define ordinary-game behavior.

## Artwork and integration

Use [illustrate-gamepiece](../.agents/skills/illustrate-gamepiece/SKILL.md) for
references, the current art brief, generation, acceptance and asset integration.
Choose one recognizable activity that expresses the card's role. Judge its
silhouette and identifying material at actual card size as well as full size.

Use current runtime definitions and [the milestone](civilization-milestone.md)
to establish available enablers. The workbook and content report describe
provenance and implementation coverage; they are not a requirement to preserve
the present pool or invent provenance for new designs.
