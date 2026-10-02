# Vassal selection design study

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
