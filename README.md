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
