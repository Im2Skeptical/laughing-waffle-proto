# Vassal node-decision modal extract

Helpers for the public module `src/views/vassal-node-decision-modal-pixi.js`,
which remains the orchestrator and still exports
`createVassalNodeDecisionModalView`.

This split is mechanical. Drag, confirm, hover-preview, and inspection
closures stay in the orchestrator.

## Extracted modules

- `constants.js` — `PANEL`, `TITLE_PLAQUE`, `CONFIRM_DOCK`, `MORTALITY_PLATE`,
  `CONTENT`, `QUALITY_COLORS`, `COST_FOOTER_HEIGHT`, `OPTION_COLUMN`
- `chrome.js` — overlapping title plaque and dock-style Confirm
- `cards.js` — `button`, `optionEffect`, `offerEffect`, `actionCard`,
  `outcomeCard`
- `mortality.js` — `renderMortalityEstimate`
- `regional-map.js` — dashed-line helper and `renderRegionalMap`
- `vassal-projection.js` — `renderVassalProjection`

## Intentionally not extracted

- `createVassalNodeDecisionModalView` drag/confirm/hover/inspection closures
- Shop staging, tableau pointerdown, and pinned-inspection wiring

Decision card faces, buttons, and cost footers use `../interaction-feedback.js`
for hover, visible touch presses, and cancellation. Sliding a held touch onto a
control highlights it; activation requires a press that began on that control.
The modal preserves its controls while a pointer is held. Draft selections are
local; transaction progress belongs to the screen-level processing indicator.
The Life Map browser probe checks both card faces and footers with held touches.
Quick taps leave a short stage-level fade that survives immediate control
rebuilds and modal closing without delaying activation. Confirm draws this
feedback using its pill contour; it has no rectangular feedback overlay.

The modal prepares entry, choice, and legal reroll layouts for all legal next
nodes while the Life decision controller is processing. Preparation yields
between nodes and queues GPU uploads before the graph reveal is released.
Layouts match the full presentation, preview state, art revision, and viewport;
entry consumes the matching layout instead of building new text and graphics.
Unchanged refreshes reuse the current layout. The Life Map browser probe checks
that prepared entry causes no additional layout builds.
