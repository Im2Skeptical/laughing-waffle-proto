# Keyword inspection prototype

Question: how should a player follow keywords within keywords while studying a
Practice? This isolated Dev Lab workbench keeps the current enlarged symbolic
card, readable Activation rules and right-hand symbol glossary. Real faces and
rules use the actual `addChronicleInspection` Pixi renderer. Prototype-only
keyword decoration retains its original measured text wrapping. The card,
rules, flavour, right-hand symbol glossary and reference panels all render
inside one Pixi canvas; there is no DOM imitation of the inspector.

Run `npm run preview:keywords`, or open it through Dev Lab → Prototypes → Keywords.
Enter **Fullscreen** for the same mobile landscape flow as the other
workbenches, including the rotated fallback when browser requests are denied.
Card, quality and variant controls remain inside the canvas in fullscreen.
Switch with the bottom Pixi arrows or `?variant=A`, `B`, `C`:

- A — a reference beside the initial word; deeper links replace its contents.
- B — a fixed reference rail, with the same linked history.
- C — a panel trail showing two definitions at a time; Earlier/Later browse
  the complete history without shrinking the copy.

Click/tap underlined terms in rules, tags or the right glossary. Terms inside
definitions open further definitions. Back and Escape retrace one step;
breadcrumbs or Return here jump back. Close restores focus to the starting term.
Pin retains the reference on outside taps and Practice/quality changes. Outside
taps dismiss unpinned references. Pixi accessibility exposes links to keyboard
users. Drag or wheel scroll the rules, right glossary or reference copy.
Dragging across a keyword scrolls rather than opening it. The rotated fallback
maps pointer positions back to the unrotated canvas before hit testing.

Recovered from the retired tooltip workbench: recursive links, reading history,
Back, Pin and focus return. Old Progress/Discharge copy and the outdated general
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
