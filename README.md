# laughing-waffle-proto

Deterministic map-driven settlement strategy prototype.

An in-progress, wide Civilization content and systems buildout. A playable first
pass is available; UX, tooling, content coverage, and balance are being refined
iteratively. The Practice board is intentionally fixed at five slots.

Player New Game starts with two player settlements and four authored neutrals on
Starter_02. Debug fixtures and labs can replace that setup.

- Current coverage, provisional decisions, and follow-up work:
  [Civilization milestone](docs/civilization-milestone.md)

- Engine invariants and schema numbers: [`ai/ai-context.md`](ai/ai-context.md)
- Simulation: [`ai/sim.md`](ai/sim.md)
- UI: [`ai/ui.md`](ai/ui.md)
- File and test routing: [`ai/repository-map.md`](ai/repository-map.md)
- Glossary: [`CONTEXT.md`](CONTEXT.md)

## Run and verify

```text
npm ci
npm start
npm run verify
```

`npm run verify` checks current documentation and architectural constraints, confirms every source module
is routed from the app/worker/tests, builds the Pages artifact, and runs the
model suite.

Browser probes use the built site:

```text
npm run build
npm run probe:civilization
npm run probe:settlement-draft
npm run probe:settlement
npm run probe:map-lab
npm run probe:navigation
npm run probe:game-menu
```

`npm run build` writes generated output to `dist/`.

Documentation ownership, Git cleanup and recovery conventions are in
[repository maintenance](docs/repository-maintenance.md).

## Deployment

The [current development build](https://im2skeptical.github.io/laughing-waffle-proto/)
tracks `main`. The [pre-content-pass archive](https://im2skeptical.github.io/laughing-pancake-proto/)
is a separate repository with isolated saves; iterative work belongs here.

GitHub Pages publishes only `dist/`. Bundled JavaScript and CSS use
content-hashed filenames recorded in `dist/build-manifest.json`. The manifest
also records the separately bundled forecast worker so production forecasting
does not fall back to the main UI thread.
