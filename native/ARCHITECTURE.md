# Native runtime architecture

Design for the C++ successor, set on 18 November 2026. The [README](README.md)
records the accepted stack and success criteria. [WORKPLAN](WORKPLAN.md) records
status. This page records how the port is structured and verified. Change it
deliberately and say why in the session record.

## Priorities

Cam set this order on 18 November 2026:

1. **Determinism and authoritative replay inside the native runtime.**
   Projection, restore and scrubbing depend on them. Windows and Android must
   produce identical results.
2. **Simulation and scrubbing performance.** The dream target is about 1000
   in-game years forecast in roughly one second, then scrubbed smoothly. A year
   is 4 seasons of 8 s, so the target is 32,000 sim-seconds, or 1.92M ticks at
   60 ticks per second. That allows about 31 µs per sim-second, including its
   summary. The browser measured about 1,080 sim-s/s on desktop in October. The
   [guardrails](../docs/timegraph-optimisation-guardrails.md) treat this as a
   goal, not a gate. Smooth scrubbing still outranks forecast speed.
3. **Fidelity to the JavaScript game, as a porting aid.** Matching the browser
   exactly is the cheapest way to show a rule was ported correctly. It never
   outranks performance. Where exact matching costs speed, performance wins.
   The deviation is recorded, and native traces become their own reference
   from then on.

The game rules still come from the browser design and Cam's decisions. The
negotiable part is exact numerical agreement with JavaScript: float
accumulation order, iteration order and formatting.

## Problem shape

The browser simulation is about 31k lines in the import closure of
`replay-second-runner.js`, `new-game.js` and `state.js`. About 8.6k of those
lines are gamepiece and settings definitions. Each run already captures its
content as JSON in `gameConfig`, so content is data. The work lies in porting
the rules that interpret it.

The rules rely on implicit JavaScript semantics such as IEEE doubles, key
enumeration order and stable sorts. Without an oracle, a large port drifts in
ways no one can see. The browser also keeps changing, at roughly 9 model/defs
commits in two weeks. The approach:

1. Port against a **pinned browser baseline**. Catch-up is explicit work.
2. Use the browser's **serialized GameState as a boundary format** for
   fixtures, tests and import. It is not the runtime layout. Native state is
   designed for the hot path.
3. Verify by **step parity** while porting. From a browser state at second
   `t`, the native build advances `k` seconds and exports. The result must
   equal the browser's state at `t+k`. A failure names the first divergent
   path and second. With correctness pinned this way, data layout can then be
   rewritten aggressively for speed.

## Layers and targets

| Target | Depends on | Owns |
| --- | --- | --- |
| `waffle_core` | C++20 standard library | numerics, RNG streams, deterministic maths, ordered JSON value, canonical writer, SHA-256 |
| `waffle_sim` | core | runtime state, captured content and DSL interpreter, tick systems, actions, replay, browser-schema import/export adapter |
| `waffle_timegraph` | core, sim, `std::thread` | forecast sessions, anchors, restore, summaries, cancellation |
| `waffle_ui` / app | sim and timegraph read APIs, SDL3, RmlUi | presentation, input, lifecycle, saves on disk |
| `waffle_parity`, `waffle_bench` | core, sim, timegraph | CLI tools for parity and measurement |

`core` and `sim` never see SDL or RmlUi include paths, wall clocks or files.
CMake link dependencies enforce this, together with a source include check.
The UI reads immutable snapshots or view models and sends actions. It never
mutates simulation state.

## Determinism contract

**Always required.** These rules give native replay and Windows/Android
agreement:

- Floating-point contraction is off: no FMA contraction (clang
  `-ffp-contract=off`, MSVC without `/fp:fast` or `/fp:contract`). Fast-math is
  never used.
- Transcendental functions come from one implementation in `core`, never
  platform `<cmath>`. Porting V8's fdlibm-derived routines also gives
  JS-equal results. `sqrt` is exact and may use the standard library.
- Every iteration and sort order is explicit and platform-independent. Unordered
  containers are never iterated for results.
- RNG streams are serialized and advanced exactly. Each stream's draw order is
  part of the rules.
- Runtime state can be saved and restored losslessly.

**JS-exactness, a porting aid that may be dropped for performance.** Each drop
is recorded as an intentional divergence:

- JS property enumeration order for id-keyed collections. Native may use dense
  arrays in a fixed order instead.
- Replicating JS float accumulation order. An example is `seasonClockSec`,
  which sums sixty 1/60 steps.
- Doubles everywhere JS uses `Number`. Native may use integers or fixed point
  where the rule allows.
- `Math.round`, `|0` and `>>>` emulation where the native representation makes
  them unnecessary.
- ECMAScript number formatting. This is only needed by the export adapter.

## Parity levels

| Level | Claim | Evidence |
| --- | --- | --- |
| L0 | Adapter round-trip | Every reference state imports and exports as byte-identical canonical JSON |
| L1 | Step parity | Native advance from browser state `t` matches the browser at `t+k`, per covered second |
| L2 | Replay parity | Native replay from an initial state plus an action journal matches at checkpoints, including `rebuildStateAtSecond` |
| L3 | New-game parity | Native initial state from seed and config matches the browser |
| L4 | Cross-platform | Windows and Android native builds produce identical per-second hashes. Always required |

L0–L3 are porting tools. L4 and native self-consistency (live play, restore and
replay agree) are permanent requirements.

Reference traces come from browser tooling in `native/reference/`. A scenario
records the baseline revision, the start (seed, prepared start or saved
state), an action journal and a horizon. The dumper writes per-second hashes
and full states at chosen seconds. Large traces stay in ignored `artifacts/`.

While a subsystem is unported, `native/reference/parity-masks.json` may exclude
named paths. Each mask names the work item that removes it. Intentional
divergences go in `native/spec/divergences.md`, with the rule affected, the
reason, the measured speed gain and how fidelity is now checked. That check
might be a looser comparison or a semantic invariant. Masks and divergences
never hide an unexplained mismatch.

## State representation

Runtime state is designed around the measured hot path. Candidates include
dense arrays indexed by small integer ids, structure-of-arrays for cohorts and
practices, and precompiled content (DSL to bytecode or tables) captured per
run. Copying state is cheap, and anchors are compact binary rather than JSON.

The browser-schema adapter sits at the boundary. A checked-in schema,
`native/schema/gamestate.v<N>.json`, describes the browser's serialized
GameState. A generator emits mirror types and JSON I/O for it. Hand-written
mappings convert between the mirror and runtime state. The adapter is used for
fixtures, parity tests and importing browser states. Its speed does not matter.

Value semantics give previews independent mutable state. A preview or restore
copies runtime state. It does not share pointers with cached state, which keeps
the timegraph guardrail.

## Port order

1. Core foundations, reference trace tooling and the state/tick specification.
   These are independent.
2. Performance architecture. Using the pipeline profile, design runtime layout,
   per-tick work elimination, summaries and the anchor/restore scheme against
   the 31 µs-per-sim-second budget.
3. Schema, generated mirror, adapter, then L0.
4. Tick systems in pipeline order, each removing its masks (L1). Each item
   also reports sim-s/s on the trace set.
5. Actions and replay (L2), then new game and world generation (L3).
6. Native forecast and timegraph, then the connected playable slice (N04).

The presentation track (N02) runs in parallel and does not depend on the
simulation. Physical Pixel 6 validation needs Cam and the device.

## Baseline and catch-up

`native/reference/BASELINE` records the pinned browser commit and GameState
version. A catch-up item diffs `src/model` and `src/defs` between baselines,
ports the changes, updates the schema and regenerates the traces. A browser
defect found by the port goes to a browser issue. The native build does not
fix it on its own.

## Performance stance

Measurements count only from optimized builds on stated hardware, with the
Pixel 6 as the floor. Fast simulation also makes scrubbing cheap. At the target
rate, re-simulating 16 s from an anchor costs about half a millisecond, so
anchors can be sparse and memory stays low on the phone. Expected large wins
are typed state, no per-anchor JSON, collapsed per-tick work and compiled
content. Deterministic parallelism within a second, such as independent
regions in a phase, is a later option and must be measured. The timegraph
non-negotiables (every 60-tick second, every-second summaries) carry over as
*observable* contracts. Whether native may collapse no-op ticks while keeping
observable results is a decision for Cam.
