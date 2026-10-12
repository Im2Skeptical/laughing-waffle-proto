# Vassal selection design study

## Current workbench revision (October 12)

The user's edited Warlord screenshot establishes the first-pass direction:
Unlocks WARRIOR/SCHOLAR, BASE ATTRIBUTES, CLASS ATTRIBUTES, a crossed-out default
marked REPLACED, per-point class effects, and a short Replaces line. Both dossiers
use this treatment and remain editable for the user's final copy pass.
The user's Scholar screenshot supplies Commissions and Delve as its two abilities.
The picker presents class attributes and abilities; class-specific Life Map nodes
such as Campaign are explained when encountered rather than listed here.

### Proposed mechanics for the implementation pass

The existing vassal rules are experimental first-pass mechanics. When the user
authorizes implementation, update the menu and matching vassal mechanics together
to follow the approved readable design. The prototype is a design proposal and
does not alter the running simulation. Express the resulting behaviors through
the existing DSL, extending generalized capabilities where needed.

| Detail | Warrior: screenshot direction | Scholar: draft for final review |
| --- | --- | --- |
| Unlock | WARRIOR | SCHOLAR |
| Attribute replaced | Intelligence → Prowess | Cunning → Ingenuity |
| Class effect 1 | +1 Martial Force per point | +5% shop-quality chance per point |
| Class effect 2 | 15% increased RISK success chance per point | +1 Research on DISCOVERY per point |
| Ability 1 | Personal Retinue: +1 Martial Force per 10 held Prestige | Commissions: gain Prestige on each completion |
| Ability 2 | Risk reward: +15 Prestige on RISK success | Delve: spend 10 years to reroll shop offers |

Warrior tooltip copy follows the proposal too: it no longer describes the old
Challenge-only phase/danger bonuses, Warrior-population Retinue cap, or
danger-scaled Prestige reward. Scholar's Ingenuity numbers remain the starting
draft; Delve now uses the user's proposed 10-year cost. Resolve the arithmetic of
"15% increased" (relative increase versus percentage points), success-chance
limits, and the scope of Martial Force before implementing the new rules.

Commissions are proposed as an ongoing Scholar objective, independent of a
dedicated Life Map node. Keep one active; completion earns Prestige and prompts
selection of the next Commission. This remains a proposal for the mechanics pass,
and objective/reward selection details need design there. The screen leaves the
Prestige amount unspecified, matching the user's screenshot. Its tooltip follows
the continuous loop and no longer ties selection or reward checks to node completion.
Delve replaces the old free-reroll wording; the draft does not retain the old
once-per-shop restriction or 216-base-phase cost. Settle its repeatability and
cost-modifier interactions in the implementation design. This prototype changes
only presentation fixtures and documentation.

Use the [vassal & founder workbench](../images/dark-fantasy/vassal-chrome-prototype/README.md)
for the current direction. Run `npm run preview:vassals` and open
<http://localhost:5182/images/dark-fantasy/vassal-chrome-prototype/>.
It follows the card workbench with a fixed game-screen preview, live editable
text, layered painted assets, comparison gallery and full-resolution PNG export.

The mechanics-first founder picker compares a focused dossier (A) with a paired
class comparison (B), both rendered in Pixi inside the existing game screen.
Use `?study=founder&phone=true&guided=false&variant=A` for the forced phone-landscape
review. Portrait viewports rotate the whole game canvas. Lost Cunning/Intelligence
effects appear beside Ingenuity/Prowess replacements; class abilities show numeric
rewards and costs. Tap stats and abilities for detailed rules. Flavour is
one muted italic line. This is still an isolated design study.

The focused dossier is now preferred. Its latest pass removes the picker
heading/instruction and the founding-action heading, outcome and cost notes.
Larger portraits, an Unlocks class label and matching mechanical panels present
Philosopher and Warlord in the same phone-landscape format.

The retained-stat button and earlier three stat-box treatments are superseded by
one unified panel. It shows Cunning, Intelligence, Wisdom, Effectiveness and the
class stat: five names, four active stats. The replaced default is grey and crossed
out with a REPLACED label. A highlighted Prowess/Ingenuity subsection explains each
per-point effect and names the replaced default. All five names can be tapped for
their rules. Retained stats stay concise; no founder stat values are invented.

Navigation arrows flank the bottom portrait rail. Stat rules now use compact
anchored Pixi tooltips, without a screen-wide shade or blocking navigation.
Dossier text can be tapped to edit copy; for stat names, open the tooltip and
tap its title, or tap its explanation to edit the rule. Ability chevrons open
rules, while their names/descriptions edit directly. The native input supports
the phone keyboard. Apply/Cancel affect only local preview copy, retained until
Reset or reload. PNG export and the workbench state include the edited text.

The founder rail retains 4, 6 or 8 slots.
Warrior and Scholar can be inspected; extra slots are black question-mark
silhouettes. The Scholar first-run gate is optional and remains a design proposal.
C's regular drawer now has three text hierarchies to compare, plus both custom
class frames. Portrait identity, class clothing and founder crest are independent
presentation choices. No production menu, simulation, save or replay changes
accompany this workbench.

## Static in-game revision (October 2)

The earlier free-layout DOM studies below were rejected: they did not respect the
game's fixed screen or its art direction. Start with the static screenshot-based
revision instead: [A: founder ceremony](mockups/vassal-selection-v2/A-founder-ceremony.png),
[B: founder council beside the map](mockups/vassal-selection-v2/B-founder-map-council.png),
and [C: successor drawer](mockups/vassal-selection-v2/C-successor-drawer.png).
These use the supplied game screen, painted portraits, aged brass, dark stone,
class-specific frame motifs and the existing HUD/navigation/time-control layout.
B assumes a map-camera pan left to make space for the council; A and C stay closer
to the original map composition. These generated studies are visual concepts, not
pixel-exact runtime screenshots. A side-panel implementation must reserve the
actual lever bounds. The proposed later-run Scholar gate remains undecided.
No new interactive prototype or runtime changes accompany this revision.
Exact built-in ImageGen prompts are preserved in [prompts.json](mockups/vassal-selection-v2/prompts.json).

## Earlier prototype (superseded)

Question: how much of the screen should the first founder own, and how can later
vassal selection remain grounded in civilization state?

Run `npm ci` once, then `npm run prototype:vassal`. Open
`http://localhost:4173/?prototype=vassal-selection&variant=A`.
The same query works on the deployed GitHub Pages game. Normal game entry is
unchanged. The switcher only exists on this explicitly requested prototype route.

## Three approaches

| Variant | First founder | Regular successor | Question to playtest |
| --- | --- | --- | --- |
| A · Ceremonial stage | Near-fullscreen class portraits, crown frames, plain-language founding consequences. Civilization summary remains visible; inspect the world in a dialog. | Smaller cards prioritise people, location, Prestige and signature opportunities. | Does the moment feel significant without removing too much context? |
| B · Council & civilization | A world/settlement panel beside one large class dossier. Candidate rows select the dossier. | The same split keeps settlement needs next to each person's details. | Is this the best balance between understanding a person and understanding the world? |
| C · Expanding map drawer | An expanded drawer gives the founder a larger portrait and explicit consequences. Collapse to inspect the map. | Start collapsed with compact candidates; choosing one reveals details and confirmation. | Can progressive disclosure preserve map access without burying the decision? |

Use the Founder/Successor controls to compare both moments. Switch the successor
lineage between Warrior and Scholar. Threat and food scenarios change the context
that the decision must be made against. Hearth and Riverwatch show distinct local
needs. Arrows in the floating bar or keyboard left/right change layouts; variant,
moment, lineage, scenario and onboarding mode are shareable URL parameters.

## Guided founder proposal

The default study starts with Warlord → Warriors: training adults and local Support
are relatively concrete concepts. Philosopher → Scholars remains visible and can
be inspected, including founding costs and the Lyceum space condition. Its confirm
button is locked. Toggle **Guided first run** to **Open choice** to compare freely
selectable founders.

The suggested gate is *later runs*, not an implied cross-class unlock in the current
run. This is a design proposal, not existing progression. The current game allows
either founder and later only Unclassed or established-class successors. No other
class-introduction mechanic is implemented. This study does not suggest an unlock
condition has been decided.

Founder selection previews the compulsory founding node. It does not imply that
training or a Lyceum is rewarded immediately upon selecting a portrait. Continue
from the preview to see successors of that tradition. Founder identity never recurs.

## Character and frame direction

**Art & frames** opens a combinatorial vector art study. The same identity can wear
Warrior armour, Scholar robes or an Unclassed tunic. Identity, age, clothing set and
fabric palette vary independently: 108 combinations per class. There are no random
rolls. Toggle founder/regular frames, hide class labels, or remove frames to compare
clothing alone.

- Warrior: angular shield frame, metal shoulders, sword, and optional cape.
- Scholar: arched frame, book, quill, layered robes and optional hood.
- Unclassed: a plain rectangular frame and practical clothing.
- Founder: a crown and stronger gold ornament on the underlying class silhouette.

These are bespoke SVG direction studies, not final painted portraits. A production
art system could replace the body, face, hair, age and accessory layers with painted
assets. An explicit serialized portrait descriptor should own any future generated
assignment through the existing portrait RNG stream. Class recognition should come
from clothing, tools and frame shapes rather than demographic appearance or colour
alone.

## Boundaries and handoff

Everything is throwaway and opt-in. Counts, names, candidate stats and map geography
are labelled example data. UI choices live only in memory; nothing reads or writes a
save, advances time, changes simulation rules, consumes RNG, or changes a schema.
Class explanations and founding/signature definitions follow the current mechanics.
There is no recommended winner yet: these variants are material for user playtesting.

The repository's deployment instructions require publishing requested work on main,
so this isolated preview ships behind `?prototype=vassal-selection`. It does not
replace the real drawer. Once a direction is chosen, implement it against actual
candidate/state selectors and remove the opt-in study after preserving its source
in Git history. Do not promote the example fixture or proposed onboarding gate into
gameplay as-is.

Check `npm run verify` and the existing settlement browser probe. In the preview,
check all three layouts at 1280×800, 844×390 and 390×844; inspect the locked class,
toggle the gate, confirm both founders, follow through to successors, collapse and
reopen the drawer, compare local context, and operate the art controls. Keyboard
checks include variant arrows, input arrow handling, dialog Tab containment, Escape
and return focus. The civilization summary stays pinned when the prototype scrolls.
