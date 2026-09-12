# Agent Instructions

Local instructions for agents working in this repo.

## Project context
- Always read `ai/ai-context.md` (invariants and schema numbers).
- When a routing skill applies, read that skill first and follow it:
  `add-gamepiece`, `change-view`, `change-timegraph`,
  `change-vassal-life-map`, `change-settlement-sim`, `change-debug-tools`
  (under `.grok/skills/`). Do not load the other skills.
- Do not open `CONTEXT.md`, `ai/sim.md`, and `ai/ui.md` on every task.
  Read `ai/sim.md` **or** `ai/ui.md` (not both) only when the matching
  skill is not enough. Read both only when the task crosses model and
  UI/replay.
- Read root `CONTEXT.md` only when domain vocabulary is unclear.
- After a split-folder map lands, read that folder's README before the
  orchestrator file.
- Do not read `ai/history/` unless the task is explicitly about a past
  design decision.

## Current goal context
- The map-driven detailed-settlement redesign and data-driven debug tools are
  implemented. Current work is iterative gameplay and UI development.
- `ai/ai-context.md` is the invariants sheet. Simulation and UI behavior live
  in `ai/sim.md` and `ai/ui.md`. Historical decision records live in
  `ai/history/` and are not descriptions of unfinished work.

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

## Agent skills

Grok auto-loads `<repo>/.grok/skills/*/SKILL.md`. Prefer those routing skills
over loading a whole subsystem.

## Issue tracker

Issues and specs live in GitHub Issues using the `gh` CLI. See
`docs/agents/issue-tracker.md`.
