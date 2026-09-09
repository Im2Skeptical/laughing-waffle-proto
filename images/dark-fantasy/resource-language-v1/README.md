# Resource language — first design study

This is the first review deliverable of the resource-language redesign. It is a
separate interactive art board, not an integrated gameplay change. Practice
mechanics, simulation state, RNG, saves, replay, production duration formatting,
and the existing game entry point remain unchanged.

## Open

Serve the repository with `npm start`, then open
`/images/dark-fantasy/resource-language-v1/index.html`.
The existing Pages build copies this directory with the other image assets.
The local `serve` development server removes `/index.html` and drops query
parameters during that redirect. For local screen examples, omit `/index.html`
and append the query directly to `/images/dark-fantasy/resource-language-v1`.
The following `index.html` links work on GitHub Pages.

- Full board: `index.html`
- Phone travel example: `index.html?screen=phone&scenario=travel`
- Phone practice shop: `index.html?screen=phone&scenario=practices`
- Phone structure shop: `index.html?screen=phone&scenario=structures`
- Desktop example: `index.html?screen=desktop&scenario=practices`

The full board displays the screen examples at their actual 844×390 or
1280×800 dimensions; narrow browser panels can scroll horizontally.

## What is implemented

- Six resource/time symbols and six gameplay-phase identities. Food uses the
  same grain sprite in both roles, with a lunar bezel identifying its phase role.
- An independently rotating solar ring and moon face. The six phase emblems are
  attached to the moon rotor. The central emblem stays upright and opens a
  six-phase reference. Every displayed wheel samples the same manually viewed
  second; no wall-clock autoplay or simulation runs in the board.
- A reusable raster cost frame with live, accessible amount text. Selection,
  staging, unaffordability, and resource/output specimens show its states.
- Travel selection and shop drafts with separate confirmation, inspection,
  undo, and order controls. These are isolated review fixtures, with base
  practice/structure prices and representative travel durations.
- An exact preview formatter matching the current default calendar: 32 seconds
  per solar year, six one-second phases per moon. Its configurable arithmetic
  falls back to moons/phases when a year is not an integral number of phases.

## Asset provenance

All PNGs in this directory are original images generated with the built-in
`image_gen` tool. Native PNGs and their transparency are preserved. No external
game assets, API/CLI fallback, vector replacements, or programmatic image edits
were used. Exact prompts are recorded in [prompts.json](prompts.json).

The board reuses the project's existing original Chronicle card, civic, gate,
and timegraph artwork for context. Sprite placement, rotation, typed amounts,
and frame sizing are presentation only. The cost frame uses nine-slice scaling.

## Review targets

Judge recognition at 18–24 pixels, the connection between time icons and wheels,
the distinction between the generic phase unit and a named gameplay phase, and
whether the framed costs read as actions. The phone cost footers are 152×58
screen pixels; the moon-centre target is 44×44 screen pixels.

After approval, integrate the selected sprites, cost component, and
calendar-aware formatting into the game. Then review that result before the
shared card pass. Practice types will keep a common portrait outline and use
distinct headers/crests for seasonal, lunar, passive, and charged behavior.
Charge fill remains exclusive to practices that actually accumulate charge.

## Validation

The review formatter is exported from `study.js` for a direct Node check. It
has been checked against zero/boundary/mixed/large costs and 240 combinations
of phase duration, season duration, and phase price, reconstructing the exact
elapsed seconds. Phase selection follows the existing tSec-based boundary order.

Browser review passed at 844×390 and 1280×800 with no broken images or horizontal
page overflow in the standalone examples. Checks covered solar and lunar drag
rates, the complete phase order, identical displayed phase and wheel rotations
after seeking forward and back, centre-tap reference, inspection, selection,
staging, projected Prestige, unaffordability, draft reordering/undo, confirmation,
and the grayscale silhouette toggle. Phone dialogs and controls were inspected
visually. This is presentation QA; no running-game simulation was exercised by
the board.

`npm run verify` passed, including architecture, source reachability, replay,
and presentation checks. Production bundle hashes remained unchanged:
`app-BST7XSC4.js`, `timegraph-forecast-worker-Z3DCAH5J.js`, and
`styles-c8023c9e9200.css`. Original PNGs decoded as RGBA, and all three circular
frame assets retain transparent centres.
