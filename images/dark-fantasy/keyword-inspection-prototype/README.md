# Keyword inspection prototype

Question: how should a player follow keywords within keywords while studying a
Practice? This isolated Dev Lab workbench keeps the current enlarged symbolic
card, readable Activation rules and right-hand symbol glossary. Real faces and
rules come from the current read-only presentation helpers. DOM rules mirror
the in-game arrangement; only the reference interactions are being explored.

Run `npm run preview:keywords`, or open it through Dev Lab → Prototypes → Keywords.
Switch with the bottom arrows or `?variant=A`, `B`, `C`:

- A — a reference beside the initial word; deeper links replace its contents.
- B — a fixed reference rail, with the same linked history.
- C — a horizontal trail retaining every visited definition as a panel.

Click/tap underlined terms in rules, tags or the right glossary. Terms inside
definitions open further definitions. Back and Escape retrace one step;
breadcrumbs or Return here jump back. Close restores focus to the starting term.
Pin retains the reference on outside taps and Practice/quality changes. Outside
taps dismiss unpinned references. Keyboard users can Tab to every link.

Recovered from the retired tooltip workbench: recursive links, reading history,
Back, Pin and focus return. Old Progress/Discharge copy and the outdated general
tooltip layout were not restored. Reference copy is exploratory and is not an
authoritative rules registry. No winner has been chosen for the future pass.

This prototype is deliberately deployed in the existing Dev Lab convention so
it can be evaluated on phones; its switcher and renderer never enter gameplay.
State stays in memory, except the shareable variant URL. It does not attach a
runner, change saves, or alter simulation, RNG, schemas or replay.

Verify build/routing and actual recursive desktop/touch navigation with
`npm run verify` and `npm run probe:prototypes`.
