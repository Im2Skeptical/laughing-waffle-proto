# Token-navigation refactor (wave 1)

Behavior-preserving cleanup so agents can change one subsystem without
loading 2–3k-line files. No gameplay, schema, RNG, or pixel changes.

## Why this shape

Prior `codex/abandoned-timegraph-refactor-do-not-merge` mixed forecast,
state, worker, `settlement-exec.js`, `timegraphs-pixi.js`, and
`ui-root-settlement-pixi.js` in one branch. Wave 1 forbids that. Each
stream owns a disjoint file set and keeps the original public import path
as a thin barrel.

## Shared rules

- Mechanical extract / docs-only. If a split needs closure rewriting,
  extract less.
- Keep `src/model/detailed-settlements.js`, `src/model/vassal-life-map.js`,
  and `src/views/timegraphs-pixi.js` as re-export barrels so callers do
  not move.
- Do not push `origin/main`. Commit on the worktree branch only.
- Do not edit another stream's files. If you need a map update, put it in
  a folder `README.md`; the orchestrator will patch `ai/repository-map.md`
  after merge.
- `npm run check:architecture` and `npm run check:source` must stay green.
  Run the stream's tests before committing.

## Wave 1 streams (parallel)

| Stream | Owns | Must not touch |
|---|---|---|
| docs | `AGENTS.md`, `README.md`, `CONTEXT.md`, `ai/ai-context.md`, `ai/sim.md`, `ai/ui.md`, `Designer Docs/`, `docs/agents/` | any `src/` |
| detailed-settlements | `src/model/detailed-settlements.js` and new `src/model/detailed-settlements/**` | `vassal-life-map.js`, views, docs listed above |
| vassal-life-map | `src/model/vassal-life-map.js` and new `src/model/vassal-life-map/**` | `detailed-settlements.js`, generator unless required for imports |
| timegraphs | `src/views/timegraphs-pixi.js` and new `src/views/timegraphs/**` | `ui-root-settlement-pixi.js`, forecast worker, `state.js` |
| ui-root | `src/views/ui-root-settlement-pixi.js`, `src/views/ui-root/**` | `timegraphs-pixi.js` |
| fences | header comments on legacy `settlement-exec.js` / `settlement-state.js` / `sim-runner.js` / `state.js`; new skills under `ai/skills/repo/` | `AGENTS.md`, `ai/ai-context.md`, god-file bodies |

## Wave 2 (after merge)

- Split `src/model/tests/detailed-settlements.js` to match folders.
- Patch `ai/repository-map.md` with the new folders.
- Only then consider `timegraph/controller-core.js` and `world-map-pixi.js`.
- Do not reopen the abandoned forecast/state rewrite.
