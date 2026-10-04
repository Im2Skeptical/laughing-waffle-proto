# Practice inspector prototype

Question: how should a player read a simple symbol key and follow keywords within
keywords while studying a Practice? This isolated Dev Lab workbench keeps the
current enlarged symbolic card and readable Activation rules. The right-hand panel uses only symbol — name
rows (for example, box — Stock and book — Record), with full explanations behind
clickable names instead of paragraphs in the key. It shows only symbols on the
selected card. Stock tag symbols come first, in card order, followed by the
other symbols. Real faces and rules use the actual `addChronicleInspection`
Pixi renderer. Prototype-only
keyword decoration retains its original measured text wrapping. The card,
rules, flavour, right-hand symbol glossary and reference panels all render
inside one Pixi canvas; there is no DOM imitation of the inspector.

Run `npm run preview:keywords`, or open it through Dev Lab → Prototypes → Inspector.
The existing `keyword-inspection-prototype/` URL stays the same for shared links.
Enter **Fullscreen** for the same mobile landscape flow as the other
workbenches, including the rotated fallback when browser requests are denied.
Card, quality and variant controls remain inside the canvas in fullscreen.
Switch with the bottom Pixi arrows or `?variant=A`, `B`, `C`:

- A — a reference beside the initial word; deeper links replace its contents.
- B — a fixed reference rail.
- C — a centered reference panel.

Flavour text stays plain italic prose, without keyword styling or links.
Click/tap underlined terms in rules, tags or the right symbol key. Terms inside
definitions replace the current definition. Back and Escape retrace one step;
Back from the first definition dismisses it. Close dismisses the whole reading
stack and restores focus to the starting term. Each layout shows one definition
with only Back and Close controls: no Pin, breadcrumbs, history list or panel
trail. Outside taps and Practice/quality changes dismiss the reference.
Pixi accessibility exposes links to keyboard
users. Drag or wheel scroll the rules, right glossary or reference copy.
Dragging across a keyword scrolls rather than opening it. The rotated fallback
maps pointer positions back to the unrotated canvas before hit testing.

Recovered from the retired tooltip workbench: recursive links, Back and focus
return. Old Progress/Discharge copy and the outdated general
tooltip layout were not restored. Reference copy is exploratory and is not an
authoritative rules registry. No winner has been chosen for the future pass.

This prototype is deliberately deployed in the existing Dev Lab convention so
it can be evaluated on phones; its switcher and renderer never enter gameplay.
State stays in memory, except the shareable variant URL. It does not attach a
runner, change saves, or alter simulation, RNG, schemas or replay.

Verify build/routing and actual recursive desktop/touch navigation with
`npm run verify` and `npm run probe:prototypes`. The browser probe taps actual
Pixi hit areas, checks nested links and history, drags the right glossary,
and exercises native fullscreen plus denied-request portrait fallback.
