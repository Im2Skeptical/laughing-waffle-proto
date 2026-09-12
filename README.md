# laughing-waffle-proto

Deterministic map-driven settlement strategy prototype.

Player New Game is the Starter_02 two-site setup. Debug fixtures and labs can
replace that setup. This README is not the rules document.

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

`npm run verify` checks architectural constraints, confirms every source module
is routed from the app/worker/tests, builds the Pages artifact, and runs the
model suite.

Browser probes use the built site:

```text
npm run build
npm run probe:settlement
npm run probe:map-lab
npm run probe:navigation
npm run probe:game-menu
```

`npm run build` writes generated output to `dist/`.

## Deployment

GitHub Pages should publish only `dist/`. Bundled JavaScript and CSS use
content-hashed filenames recorded in `dist/build-manifest.json`. The manifest
also records the separately bundled forecast worker so production forecasting
does not fall back to the main UI thread.
