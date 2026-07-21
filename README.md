# laughing-waffle-proto
Sparse prototype fork for the next core gameplay rework.

## Status
Created from the verified archive tag `pre-prototype-archive` on 2026-03-25.

- Source archive repo: `../laughing-waffle`
- Intended GitHub repo: `https://github.com/Im2Skeptical/laughing-waffle-proto`
- Intended GitHub Pages URL: `https://im2skeptical.github.io/laughing-waffle-proto/`

## Prototype Direction
- Keep deterministic simulation, replay authority, process handling, and defs-driven systems where they still fit.
- Remove or replace pawn, inventory, and old turn-flow assumptions directly instead of preserving compatibility shims.
- Rebuild from a minimal vertical slice: one map/state model, one new turn loop, one or two player interactions, and enough UI for desktop/mobile playtests.

## Local Run
`npm start`

This serves the readable source modules directly for development. To preview the same optimized
artifact used by GitHub Pages:

1. Run `npm run build`.
2. Run `npx serve dist`.

## Install
`npm ci`

## Verify
`npm run verify`

## Strict Env Def Validation
`set STRICT_ENV_DEFS=1 && npm run test`

## Debug Checks
- Determinism: `window.__DBG__.test()`
- Check state: `window.__DBG__.getCursorState()`

## Map Lab

Open **Debug** and choose **Map Lab**. The development tool is also present in GitHub Pages
playtest builds. It edits a separate browser draft and does not change the running game until
**Start fresh test run** is confirmed.

The editor supports region colour, controller, capacity, ordered duplicate practices, undirected
connections, hypothetical scores, and all-practice diagnostics. A valid draft autosaves under
`civsurvivor.mapLabDraft.v1`. Reset restores the authored map; Import / Export works with JSON.

The exported schema is version 1 and contains mechanical data only:

```json
{
  "schemaVersion": 1,
  "worldDefinitionId": "riverBasin01",
  "regions": [
    {
      "id": "cedar-woods",
      "colour": "green",
      "capacity": 2,
      "controller": "frontier",
      "installedPracticeIds": []
    }
  ],
  "connections": [
    { "regionAId": "cedar-woods", "regionBId": "iron-hills" }
  ]
}
```

Region geometry, labels, decorative map context, sites, and the detailed River Crown settlement
are not duplicated. Applying a draft creates a new deterministic scenario at `tSec = 0`, with a
fresh timeline and the normal authored settlement. Active connections are copied into that new
`GameState` for save/replay authority. Save schema version 3 is intentionally incompatible with
older prototype saves.

Run `npm run probe:map-lab` after `npm run build` for the dedicated browser smoke test.

### Milestone 2 authored test scenarios

Map Lab's scenario selector includes:

- **Milestone 2 — Blank Suitability** (`devMilestone2Blank01`)
- **Milestone 2 — Sparse Interactions** (`devMilestone2Sparse01`)

The blank configuration is also the authored default used by `devPlaytesting01`. Mechanical JSON
exports are available at `exports/milestone2-blank-01.json` and
`exports/milestone2-sparse-01.json`. The diagnostic matrices and first-pass revision notes are in
`ai/milestone2-substage3-report.md`.

## Mobile Playtest With GitHub Pages

### One-time setup
1. Open `https://github.com/Im2Skeptical/laughing-waffle-proto`.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Save.
5. Wait for initial deployment.
6. Open: `https://im2skeptical.github.io/laughing-waffle-proto/`

### Per playtest cycle
1. Commit changes on your working branch.
2. Run `npm run verify`.
3. Merge to `main`.
4. Push `main`.
5. Wait for the `Deploy GitHub Pages` workflow to finish (normally about 1-3 minutes).
6. Open the Pages URL on phone and playtest.

### Deployment artifact and cache behavior
- `npm run build` creates `dist/`; it is generated output and is not committed.
- esbuild bundles the browser code into one content-hashed file such as
  `assets/app-ABC123.js`.
- The stylesheet also receives a content-derived filename.
- `dist/build-manifest.json` records the generated browser entry points for inspection.
- A code or stylesheet change therefore produces a new URL, so a phone cannot reuse the prior
  release's cached bundle.
- Images retain stable paths under `images/`; replacing an image may still require the normal
  GitHub Pages cache interval to expire.
- GitHub Actions publishes only `dist/`, not source files, tests, documentation, or repository
  metadata.

### Mobile behavior notes
- The game keeps its existing landscape canvas design.
- There is no portrait warning overlay.
- Portrait still renders, but UI may be small.
- Best playtest mode is physical landscape orientation.

### Quick troubleshooting
- If deployment fails, inspect the `Deploy GitHub Pages` run in the repository's `Actions` tab.
- Blank screen or missing art usually means a bad asset path. Runtime image paths must remain
  relative to the deployed root, for example `images/...`.
- If the bundle name in `build-manifest.json` changed but a phone still looks stale, verify the
  workflow deployed successfully; clearing site data should no longer be required for code or CSS.
- If drag/tap feels wrong, reopen in landscape and ensure browser gesture handling is not interfering.
