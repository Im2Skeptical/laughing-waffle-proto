# Removed Legacy View Stack

This repo now preserves the settlement prototype as the active runtime. The older board, inventory,
process-widget, debug, log, pawn, and in-repo skill-tree view/editor stack was removed because it was
inactive source code from the previous prototype path.

Git history is the archive for this code. The old source was not moved into a reference folder.

## Evidence

- Runtime entry is `index.html` -> `src/views/ui-root-pixi.js` -> `src/views/ui-root-settlement-pixi.js`.
- Static import reachability from `src/views/ui-root-pixi.js` did not reach the removed files.
- `package.json` scripts do not reference the removed views.
- No dynamic imports, settlement probe references, or active test references were found for the removed views.
- Documentation and tooling references to skill trees point at defs/export flow, not the removed Pixi editor views.
- The removed files were implementation source only; they did not contain canonical design data.

## Removed Files

Board/playfield stack:
- `src/views/board-pixi.js`
- `src/views/board/board-tag-ui.js`
- `src/views/board/board-tile-panels.js`
- `src/views/board/hub-structure-panels.js`
- `src/views/board/hub-tag-ui.js`
- `src/views/board/tag-orders-panel.js`
- `src/views/env-event-deck-pixi.js`
- `src/views/backdrop-pixi.js`
- `src/views/playfield-camera.js`
- `src/views/playfield-mucha-style.js`
- `src/views/filters/mucha-paint-filter.js`
- `src/views/filters/mucha-time-uniforms.js`
- `src/views/pawns-pixi.js`
- `src/views/pawn-tooltip-spec.js`

Inventory/build/process stack:
- `src/views/inventory-pixi.js`
- `src/views/building-manager-pixi.js`
- `src/views/build-menu-pixi.js`
- `src/views/process-widget-pixi.js`
- `src/views/process-widget/card-modules.js`
- `src/views/process-widget/drop-target-registry.js`
- `src/views/process-widget/endpoint-descriptors.js`
- `src/views/process-widget/endpoint-hover-ui.js`
- `src/views/process-widget/process-card-builder.js`
- `src/views/process-widget/recipe-manual-window.js`
- `src/views/process-widget/selection-actions.js`
- `src/views/process-widget/signatures.js`
- `src/views/process-widget/target-resolver.js`
- `src/views/process-widget/window-manager.js`
- `src/views/components/selection-dropdown-pixi.js`

Skill tree view/editor stack:
- `src/views/skill-tree-pixi.js`
- `src/views/skill-tree-editor-pixi.js`
- `src/views/skill-tree/button.js`
- `src/views/skill-tree/constants.js`
- `src/views/skill-tree/edge-routing.js`
- `src/views/skill-tree/formatters.js`

Debug/log/chrome helpers:
- `src/views/action-log-pixi.js`
- `src/views/event-log-pixi.js`
- `src/views/debug-inspector-pixi.js`
- `src/views/debug-overlay-pixi.js`
- `src/views/chrome-pixi.js`
- `src/views/interaction-controler-pixi.js`
- `src/views/year-end-performance-pixi.js`
- `src/views/def-tooltip-spec.js`
- `src/views/ui-helpers/log-panel-theme.js`
- `src/views/ui-helpers/log-row-pixi.js`
- `src/views/ui-helpers/pill-drag-controller.js`
- `src/views/ui-helpers/progress-animation.js`
- `src/views/ui-helpers/touch-long-press.js`

## Design Notes

- Skill tree source of truth remains `src/defs/gamepieces/skill-tree-defs.js`.
- Skill tree export/application workflow remains `npm run skill:apply-export`.
- External or historical editor data should be recovered from its owning source, not from the removed Pixi editor.
- Active settlement view, timegraph, vassal, replay, projection, model, controller, and defs code was intentionally left untouched.

## Recovery

To inspect history for a removed file:

```powershell
git log -- src/views/board-pixi.js
```

To restore a removed file from a commit before this deletion:

```powershell
git restore --source=<commit-before-deletion> -- src/views/board-pixi.js
```

To restore a removed folder:

```powershell
git restore --source=<commit-before-deletion> -- src/views/process-widget
```
