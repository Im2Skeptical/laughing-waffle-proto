# Agent Instructions

Local instructions for Codex agents working in this repo.

## Project context
- Read `ai/ai-context.md` before making changes.
- Consult only the relevant section of `ai/repository-map.md` to locate the
  narrow implementation and test path. Do not read historical plans unless the
  task touches their design decisions.

## Current goal context
- The map-driven detailed-settlement redesign and data-driven debug tools are
  implemented. Current work is iterative gameplay and UI development.
- `ai/ai-context.md` describes current behavior. The redesign and debug-tool
  plans are historical decision records, not descriptions of unfinished work.

## Core constraints (non-negotiable)
- Determinism: no `Math.random()`; all randomness must go through `state.rng`.
- Serialization: `GameState` must stay JSON-serializable (no classes/functions/Maps/Sets).
- Replay: `rebuildStateAtSecond(tSec)` must be authoritative and deterministic.
- Time: `tSec` is the authoritative axis; time only advances via simulation ticks.
- Layering: Model has no UI imports; Views are render/input only; Controllers orchestrate.
- DSL-first gamepiece behaviors: when creating or updating gamepieces, first express behavior with existing DSL ops; if not possible, add a generalized DSL capability and then implement the behavior as data using that capability (avoid bespoke one-off model logic when a reusable DSL affordance can cover it).

## AI workflow
- Before coding, do an impact analysis (determinism, serialization, replay, layering).
- Mention how to test any behavior you touch.
- Keep the analysis proportional. For a view-only edit, explicitly confirm that
  simulation state, RNG, schemas, and replay are untouched rather than
  re-auditing unrelated model systems.
- Refactors are clean cuts with no migration shims. This prototype does not
  preserve obsolete saves.
- `npm run verify` includes architecture and source-reachability checks. New
  source modules must be imported by the app, forecast worker, or a supported
  test.

## Development deployment
- This prototype uses `main` as its active development branch and GitHub Pages
  mobile-testing deployment. After completing a requested change and the
  relevant verification, commit only the task's changes and push `main` to
  `origin` so the mobile build is current.
- Do not hold changes for a separate release branch or preserve `main` as a
  stable release line; use Git history to revert a bad development change.
- Do not commit or push when the user explicitly asks to keep work local, when
  verification identifies an unresolved failure, or when the working tree also
  contains unrelated user changes.

## Context hygiene
- Use targeted `rg`/file reads first; do not broadly inspect generated or artifact folders unless the task is specifically about them.
- Treat `artifacts/`, `coverage/`, `test-results/`, `playwright-report/`, screenshots/videos/traces/logs, and `*.bak` files as generated output by default.
- Do not assume `exports/` is disposable; `exports/runtime.json` may be used as skill-editor patch input.
- Do not dump full DOM snapshots, full game state, every frame log, every entity, browser traces, or large JSON blobs to chat or stdout.
- For probes/debugging, write detailed output to an artifact file and print only the failed check, expected result, actual result, shortest reproduction command, relevant file/subsystem, and artifact path.
- Preserve runtime/game behavior when changing workflow, scripts, ignores, or test-output formatting.
