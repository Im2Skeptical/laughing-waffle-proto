# Vassal node-decision modal extract

Helpers for the public module `src/views/vassal-node-decision-modal-pixi.js`,
which remains the orchestrator and still exports
`createVassalNodeDecisionModalView`.

This split is mechanical. Drag, confirm, hover-preview, and inspection
closures stay in the orchestrator.

## Extracted modules

- `constants.js` — `PANEL`, `QUALITY_COLORS`, `COST_FOOTER_HEIGHT`
- `cards.js` — `button`, `optionEffect`, `offerEffect`, `actionCard`,
  `outcomeCard`
- `mortality.js` — `renderMortalityEstimate`
- `regional-map.js` — dashed-line helper and `renderRegionalMap`
- `vassal-projection.js` — `renderVassalProjection`

## Intentionally not extracted

- `createVassalNodeDecisionModalView` drag/confirm/hover/inspection closures
- Shop staging, tableau pointerdown, and pinned-inspection wiring
