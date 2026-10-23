Working guidance for aesthetic and UX decisions, drawn from Cam's project
feedback. Use alongside [game design](game-design.md). Refine these preferences
as further design tasks reveal what works.

1. Make cause and effect visible in the design. Connect workers to their
   multiplier, triggers to progress, costs to choices, and consequences to the
   action that produced them. Composition and motion should help players
   understand the engine they are building. Show unmodified amounts in meaningful
   units before listing modifiers; separate seasonal or conditional yields when
   they differ. Preview a choice's effects where the affected values already live,
   with a clear distinction between active benefits and pending completion.

2. Give each information layer a purpose. Cards provide a compact symbolic
   overview; quick reads explain what a piece does in plain language; inspection
   supports deeper learning and linked definitions. Emphasise mechanical
   differences when comparing choices. Keep flavour brief and distinct from
   rules. Use recognisable symbols for repeated compact readings and explain them
   on inspection. Contribution ledgers should keep source identities legible:
   group for scanning, then expose the named sources and amounts through a deeper
   read. Click/tap pinning and nested inspection can support this without expanding
   every row. Keep long ledgers bounded and scrollable. Add text where it helps
   understanding; remove repeated labels, unnecessary headings and instructional
   clutter.

3. Preserve context while players explore. Keep the relevant card, list, map or
   graph available while comparing and inspecting. Show enough surrounding space
   to understand a choice. Use consistent controls and cost placement across
   related screens, and preserve reading position when details refresh. Anchor
   quick reads close to the hovered choice and proportion them to its slot;
   protect the choice's artwork. If overlap is unavoidable, make the tradeoff
   explicit and keep staged consequences visible after hover ends. Let the whole
   choice, including its price and frame, expose the same reading. Preserve
   unrelated controls and layout while refining a component.

4. Let players compose a decision before committing. Make selection, inspection
   and confirmation distinct. Preview replacements and costs, keep displaced
   cards visible, and allow staged choices to be revised. Preview interactions
   with other choices already staged in the same visit. Make undo consistent with
   direct manipulation: discarding a newly reserved construction cancels its
   purchase and reservation. Consequential commitments should be deliberate
   without making comparison cumbersome.

5. Make interaction responsive on phones. Provide immediate, visible press
   feedback and touch access to information available on hover. Keep browsing
   and staging fluid; show clear processing feedback when committing requires
   work. Make time feel consequential through legible clocks and motion that
   reflects the time spent, while keeping the graph visible and scrubbing smooth.

6. Make illustrated presentation readable at its actual size. Start with the
   tightest real surface, such as the regional settlement panel, and carry that
   treatment into roomier views. Give important numbers, slots and controls enough
   space; compose artwork around clear focal
   action and quiet areas. Carry the established old-school dark fantasy style
   through frames, icons and palettes. For gamepiece art, retain anonymous figures
   and class colour identity. Use the existing
   [presentation contract](../ai/visual-overhaul.md) and
   [card illustration guidelines](../images/dark-fantasy/settlement-pieces-v4/README.md#current-illustration-guidelines)
   for detailed treatment.

Prototype gameplay layouts inside the real game screens, styling and phone
landscape layout. Use representative states and make the interactions under
review playable, with a direct way to reach them. Keep variant switches and other
development scaffolding outside the evaluated game UI. Record agreed behavior,
additional proposals and temporary workarounds separately; implementation follows
the agreement rather than every incidental detail visible in a screenshot.

As Cam gives further feedback, refine the relevant point here when it reveals a
reusable preference. Keep exact mechanics, individual bugs and experiment details
in their task records; the [multiplier implementation notes](output-capacity-multipliers.md)
record this discussion's specific decisions.
