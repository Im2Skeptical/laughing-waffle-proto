# Native runtime architecture

Design for the C++ successor, set on 18 November 2026. The [README](README.md)
records the accepted stack and success criteria. [WORKPLAN](WORKPLAN.md) records
status. This page records how the port is structured and verified. Change it
deliberately and say why in the session record.

## Problem shape

The browser simulation is about 31k lines in the import closure of
`replay-second-runner.js`, `new-game.js` and `state.js`. About 8.6k of those
lines are gamepiece and settings definitions. Each run already captures its
content as JSON in `gameConfig`, so content is data. The work lies in porting
the rules that interpret it.

The rules rely on implicit JavaScript semantics. These include IEEE doubles,
`Math.imul` and `>>>`, `Math.round`, object key enumeration order, stable
`Array.prototype.sort`, and V8's transcendental functions. A port that compares
only a few hand-picked fields from a new game cannot find where it diverges.
The browser also keeps changing, at roughly 9 model/defs commits in two weeks.

The design therefore has three parts:

1. Port against a **pinned browser baseline**. Catch-up is explicit work.
2. Use the browser's **serialized GameState as the interchange format**.
   Native state is typed C++. A codec reads and writes the browser JSON
   exactly.
3. Verify by **step parity**. From any browser state at second `t`, the native
   build advances `k` seconds. The result must equal the browser's state at
   `t+k` as canonical JSON. A run can start from any state, so tick systems can
   be ported before new-game generation. A failure names the first divergent
   JSON path and second.

## Layers and targets

| Target | Depends on | Owns |
| --- | --- | --- |
| `waffle_core` | C++20 standard library | JS-compatible numerics, RNG streams, ordered JSON value, canonical writer, SHA-256 |
| `waffle_sim` | core | typed GameState, codec, captured content and DSL interpreter, tick systems, actions, replay |
| `waffle_timegraph` | core, sim, `std::thread` | forecast sessions, anchors, restore, summaries, cancellation |
| `waffle_ui` / app | sim and timegraph read APIs, SDL3, RmlUi | presentation, input, lifecycle, saves on disk |
| `waffle_parity`, `waffle_bench` | core, sim, timegraph | CLI tools for parity and measurement |

`core` and `sim` never see SDL or RmlUi include paths, wall clocks or files.
CMake link dependencies enforce this, together with a source include check.
The UI reads immutable snapshots or view models and sends actions. It never
mutates simulation state. Saves are browser-schema JSON written by the app
layer.

## Determinism contract

These rules apply to all ported code, Windows and Android alike.

- **Numbers.** A JS `Number` becomes `double`. Integer bit operations emulate
  ToInt32/ToUint32. `Math.round` follows ECMAScript: halves round toward +∞,
  with correct results near 0.5 and for -0. Floating-point contraction is off:
  MSVC `/fp:precise /fp:contract-` (or the equivalent), clang
  `-ffp-contract=off`. Fast-math is never used.
- **Transcendentals.** `Math.pow/exp/log/sin/cos/atan2/hypot/cbrt` call
  `core` ports of V8's fdlibm-derived `ieee754` routines, never `<cmath>`.
  `sqrt` is exact and may use the standard library. The tick path barely uses
  transcendentals. World generation and Life Map generation do use them.
- **Ordering.** JSON objects in state keep JS property order: integer-like keys
  ascending, then insertion order. Dictionaries keyed by id use a core
  container that keeps this order. Ports of `.sort` use a stable sort with the
  same comparator. A comparator that is not a consistent ordering is recorded
  as a hazard and ported literally.
- **RNG.** The six serialized seed streams use the mulberry32 step from
  `src/model/rng.js` with exact uint32 wraparound.
- **Serialization.** The canonical writer uses ECMAScript `Number::toString`
  formatting and `JSON.stringify` string escaping. Comparison hashes use sorted
  keys to match the corpus. Saved files keep JS order.

## Parity levels

| Level | Claim | Evidence |
| --- | --- | --- |
| L0 | Codec round-trip | Every reference state parses and re-emits as byte-identical canonical JSON |
| L1 | Step parity | Native advance from browser state `t` matches the browser at `t+k`, per covered second |
| L2 | Replay parity | Native replay from an initial state plus an action journal matches at checkpoints, including `rebuildStateAtSecond` |
| L3 | New-game parity | Native initial state from seed and config matches the browser |
| L4 | Cross-platform | Windows and Android native builds produce identical per-second hashes |

Reference traces come from browser tooling in `native/reference/`. A scenario
records the baseline revision, the start (seed, prepared start or saved
state), an action journal and a horizon. The dumper writes per-second hashes
and full canonical states at chosen seconds. Large traces stay in ignored
`artifacts/`. Small fixtures are checked in.

While a subsystem is unported, `native/reference/parity-masks.json` may exclude
named JSON paths. Each mask names the work item that removes it. "Full parity"
means an empty mask list over the stated scenarios. Masks never hide an
unexplained mismatch in a ported subsystem.

## State representation

The codec is generated rather than written by hand. A checked-in schema
description, `native/schema/gamestate.v<N>.json`, records each field's type and
whether it is a record, an id-keyed dictionary, an array, nullable or optional.
A generator emits C++ structs and the JSON codec. A schema bump then becomes a
reviewed schema diff plus regeneration, not a hand edit of thousands of lines.
Fields the browser can omit stay distinguishable from null.

Value semantics give previews independent mutable state. A preview or restore
copies the struct. It does not share pointers with cached state, which keeps
the timegraph guardrail.

## Port order

1. Core foundations, reference trace tooling and the state/tick specification.
   These are independent.
2. Schema and generated codec (L0).
3. Tick systems in pipeline order, each removing its masks (L1).
4. Actions and replay (L2), then new game and world generation (L3).
5. Native forecast and timegraph, then the connected playable slice (N04).

The presentation track (N02) runs in parallel and does not depend on the
simulation. Physical Pixel 6 validation needs Cam and the device. Desktop work
continues without it.

## Baseline and catch-up

`native/reference/BASELINE` records the pinned browser commit and GameState
version. A catch-up item diffs `src/model` and `src/defs` between baselines,
ports the changes, updates the schema and regenerates the traces. Native work
does not change browser rules. If the port finds a browser defect, record it
and route it to a browser issue. The native build does not fix it on its own.

## Performance stance

Correctness comes first. Measurements count only from optimized builds on
stated hardware. Typed state, no per-anchor JSON and threaded forecasting are
the expected large wins. Each is measured against the browser handoff
evidence, not assumed. The timegraph non-negotiables apply unchanged: every
60-tick second, every-second summaries and smooth scrubbing ahead of horizon.
