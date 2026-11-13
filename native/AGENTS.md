# Native runtime agent entry

Root [AGENTS.md](../AGENTS.md) applies. This is an independent successor area,
with the accepted stack and scope in [README.md](README.md).

## Start or resume

1. Read the root invariants sheet, this file, README and [WORKPLAN.md](WORKPLAN.md).
   Check the current branch, working changes and any linked task before editing.
2. Select the next ready work item. Record ownership and the bounded objective
   in WORKPLAN; resolve a stale claim against the owning session before taking it.
   Worktree copies of this file are handoffs, not a distributed locking system.
3. Read only the subsystem references needed for that item. Before simulation
   or timegraph work, follow the root timegraph routing/guardrails. For UI work,
   read the aesthetic/UX guidance and inspect the relevant existing interaction.
4. State the impact on determinism, serialization, replay and layering. Implement
   the item's smallest useful result and verify its stated completion criteria.
5. Update WORKPLAN with what exists, exact reproducible commands/results,
   unresolved failures or blockers and the next ready action. Release ownership
   on handoff. Distinguish desktop/emulator evidence from physical-phone evidence.

Stop at the assigned item or session budget; leave work reviewable. A missing
device can block device validation while independent desktop work proceeds.
Never report an unperformed Android test as passing.

## Implementation scope

- Place native sources, build configuration, tooling and native tests under this
  directory. Create subfolders when their first real files are added.
- Use existing art as shared read-only input. Keep generated native packages,
  compiler output and local native saves ignored and out of browser build output.
- Keep simulation independent of SDL/RmlUi, wall clocks and filesystem access.
  C++ state must have an explicit JSON-compatible serialized representation;
  pointers, GPU objects and UI state are not authoritative game state.
- Preserve root RNG/time/replay contracts, DSL-first content and preview
  isolation. Specify arithmetic and iteration order before porting rules.
  Validate semantic state/actions across languages; raw JS object layout is not
  a native implementation requirement. Unexplained mismatches fail parity.
- Keep compiled gameplay behavior shared across profiles. Capture run content
  and seed in reproducible fixtures. Use release optimization for measurements.
- Keep the live game's entry/build paths independently working. Changes outside
  this area should be limited to an explained integration need, required version
  metadata, or documentation routing. Live artwork caching is a separate task.

## Verification and integration

The root verification map and development workflow still apply. Documentation
setup uses the documented documentation checks; run root verification before
committing as required by the development workflow.

Bootstrap must add runnable native build/test commands and document them here
when they exist. The current npm architecture/reachability checks cover browser
JavaScript; they do not validate C++ layering, compilation or native performance.
Native work needs native checks as soon as executable code is introduced.

Before a PR, review the diff for unrelated edits, verify the task, apply the
required repository version bump and provide a local handoff. This directory
does not grant permission to merge, publish Pages, replace the live game, or
launch unattended agents. The existing user authorization and root workflow
govern those actions.
