# Agent Instructions

Local instructions for Codex agents working in this repo.

## Project context
- Read `ai/ai-context.md` before making changes.

## Current goal context
- We are doing a large refactor. Core assumtions about gameplay may be drastically different to ai-context and other documentation

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
- Refactors are to be clean with no migratory shim style code. We are prototyping and so there is no need to preserve functionality of older saves

## Context hygiene
- Use targeted `rg`/file reads first; do not broadly inspect generated or artifact folders unless the task is specifically about them.
- Treat `artifacts/`, `coverage/`, `test-results/`, `playwright-report/`, screenshots/videos/traces/logs, and `*.bak` files as generated output by default.
- Do not assume `exports/` is disposable; `exports/runtime.json` may be used as skill-editor patch input.
- Do not dump full DOM snapshots, full game state, every frame log, every entity, browser traces, or large JSON blobs to chat or stdout.
- For probes/debugging, write detailed output to an artifact file and print only the failed check, expected result, actual result, shortest reproduction command, relevant file/subsystem, and artifact path.
- Preserve runtime/game behavior when changing workflow, scripts, ignores, or test-output formatting.
