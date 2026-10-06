# Timegraph: UX and capacity requirements brief

**Status:** Draft. This records Cam's stated intent (from an interview), not behaviour verified in the repo. Items marked "Current build" come from reading the repo docs and code. Related engineering constraints live in `docs/research/timegraph-performance-implementation.md`, `timegraph-performance-audit.md` and `timegraph-codec-audit.md`.

## 1. Purpose
The timegraph is the main feedback and gameplay loop. The player sees when their civilization is projected to end, makes changes through vassals, and each change updates the graph. The graph shows data as graph lines and is also interactive.

## 2. Core loop
1. The graph shows a projection of the civilization up to its loss point.
2. The player chooses one vassal and acts on that vassal's life graph.
3. Each action costs time. Before confirming, the player is told the time cost and the other effects of the choice.
4. After the player confirms, the viewed time moves forward automatically and the world simulates that time.
5. The graph unveils the new projection on top of the old one. Only the most recent previous projection is shown.
6. The player keeps deciding on the current vassal in sequence until that vassal dies. There is no queueing ahead and no choosing the next vassal early.
7. When the vassal dies, the next vassal is picked, and a full projection runs to the new loss point. The full projection runs only at that moment.

## 3. Vassal and action rules
- One vassal is active at a time.
- Every action on a vassal's life graph is irreversible.
- Every node on the life graph has a time cost.
- During an active vassal, the unveil extends only as far as the time that has been spent.
- Changes happen only through selecting successive vassals, never by editing the past or acting in a preview.

## 4. Interaction with the graph
- Clicking and dragging on the graph moves the player into a read-only preview of that time. The player can examine anything they could in the normal game, but cannot change anything.
- The player can scrub into the past to review earlier decisions. Past moments are review-only.
- A shortcut button in the lower-left returns the player from a preview to the current moment.
- The graph carries many indicators, including vassal death points.
- Projection beyond the current time is labelled as a forecast, with FX showing that it will be overwritten.
- While the simulation and unveil run, the player can still interact, examine and move their viewed time anywhere except the part not yet unveiled.

## 5. Unveil and capacity
- Ideal: the simulation is instant, and as soon as a vassal dies the player can travel as far into the future as they want.
- An aesthetic unveil animation stays. The target is about 1000 years unveiled in a second or less. It must not lock out interaction (see section 4).
- The unveil animation has no skip control (decided by Cam).
- The horizon should be as long as possible. The year counts in the code (40-year graph window, 200-year forecast cache, 600-year loss search) are tuning values, not fixed requirements. Gameplay will be tuned to whatever speed and performance tradeoff is achievable.
- Device floor: a Pixel 3 phone (public specs: 4 GB RAM, Snapdragon 845). The usable memory budget for the page is not published and is to be measured on a real device: play first and note any stutter, then use Chrome DevTools over USB via `chrome://inspect` if needed. The target is no tab crashes and smooth scrubbing.
- Priority if goals conflict: smooth scrubbing and examination while the unveil runs comes before unveil speed or horizon length.

## 6. Where the current build differs
- Once a new vassal is created and in progress, the older projection cannot be browsed. It survives as a dimmed view-only overlay (`projection-replacement-state.js`, staged in `settlement-vassal-flow.js`). Navigation and graph close/open retain it, showing it only for its original subject. A new projection replaces it; explicit overrides, game reset, or reveal past its old loss or coverage second clear it. Ideally it stays browsable with clear "soon to be overwritten" FX, as long as the memory and performance cost is acceptable.
- The September 25 implementation measurement (commit `f12196c`) unveiled 200 years in about 18.4 seconds on the test fixture, against a target of about 1000 years in a second or less. The old 112 sim-seconds-per-second ceiling no longer exists. Live reveal tuning is in `src/views/ui-root/settlement-graph-session.js`; it has separate default and pending-commit configurations. These are tuning values, not requirements. Later supply/cache measurements are in `docs/research/settlement-supply-performance.md`.
- Browsing is limited to revealed coverage (`clampScrubSecToRevealCap`). This matches the intent.
- Phone and very large world performance is unmeasured. Mobile layout at normal CPU measured a 27.8 ms worst frame, and mobile at 4x CPU fails the smooth gate (284.7 ms). The audit estimates roughly 80MB of retained state at 1000 years, before overhead, which would be tight on a Pixel 3.

## 6b. What has already been implemented (git history)
Commits `6e60b57` (24 Sep: worker keeps a projection session, scoped summary aggregates), `979e46e` (24 Sep: target-only restore from isolated anchors, frozen interned config, 64-entry restore cache) and `f12196c` (25 Sep: reveal retune, implementation doc, probes) implement the audit's main recommendations, in a different order from the audit. Sparse summaries were deliberately not done. Packed or WASM rewrites and thousand-year or large-world measurements have not been attempted. Current schema numbers live in `ai/ai-context.md`.

## 7. Constraints carried over from the engineering docs
- Keep every official 60-tick second, the RNG streams, the save contract and edit-second branching.
- The model stays free of view imports. Previews are read-only, and retained anchors stay private and immutable.
- Keep moon-turn and meal data. Detect loss every simulated second.
- Full detail and test gates are in the research docs listed at the top.

## 8. Open questions
- How should the "will be overwritten" FX look, and for how long is the old projection kept?
- Is "whole-run" browsing beyond the unveiled area ever allowed, or always limited to what has been revealed?
