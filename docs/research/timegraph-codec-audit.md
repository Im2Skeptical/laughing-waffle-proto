# Projection codec and state ownership audit

> **Historical note.** Written 2026-09-24 against baseline `e30ce3e` / target `6556f38`. Its recommendations were largely implemented in commits `6e60b57`, `979e46e` and `f12196c` (state is now v24 / config v15), so treat the measurements, schema numbers and sequencing below as historical. Current intent: `docs/timegraph-ux-and-capacity-brief.md`; guardrails: `docs/timegraph-optimisation-guardrails.md`. Body below is unedited.


Audit target: current main `6556f38`, 2026-09-24. Investigation only; no production changes. The brief's schema-v20 premise is stale: `ai/ai-context.md:30` and `src/model/state.js:449` specify game-state v22. Preserve the current save contract, not the old number. All proposed work must preserve every official replay tick, RNG streams, serialization, and edit-second branching; the codec belongs behind model APIs without view imports.

## Findings

### Intern config, but establish immutable ownership first

Static search found production replacements at `src/model/init.js:65` and `src/model/state.js:456`, and new-scenario assembly at `src/controllers/debug-configuration-controller.js:281` and `src/controllers/map-lab-controller.js:412`. No simulation tick-path writer to `state.gameConfig` was found. `canonicalizeGameConfig` builds a replacement object (`src/model/game-config.js:413`); gamepiece canonicalization recursively copies editable leaves from authored data (`:242`, `:266`). It does not canonicalize the shared source in place.

However, definition accessors expose nested references (`src/model/game-config.js:449`, `:453`), and the settlement view model exposes definition tag arrays (`src/model/detailed-settlements/view-model.js:183`). Test fixtures explicitly mutate config, e.g. `src/model/tests/detailed-settlements/phases.js:103`. Sharing a *live mutable object* is thus a new ownership contract, not an automatically safe byte optimization.

Independent runtime probe: created `devPlaytesting01`, seed 99117; set both config and civilization monster thresholds to 10,000,000; recursively froze every config object; ran 6,400 official replay seconds with `canonicalizeSnapshot` after each second. Completed at `tSec=6400` without a frozen-object write error. This supports the inspected no-action tick path only; it does not prove every DSL action, future feature, or arbitrary debug scenario is immutable.

Recommended design: canonicalize/validate once into a private run-scoped immutable config; associate each projection generation with that config identity; share only that object. Deep-freeze it in development/tests. A different run/config creates a new generation. Do not key by time alone or reattach whichever live config currently happens to exist.

### Returning a retained live state pointer is unsafe today

`getStateAt` currently returns a fresh deserialized and canonicalized state (`src/model/timegraph/controller-core.js:1607`). Deserialization explicitly clones to avoid snapshot mutation (`src/model/state.js:446`). Changing this to a pointer is an observable ownership change.

There is a concrete caller mutation: `sim-runner.setPreviewState` merges persistent knowledge into the supplied object (`src/controllers/sim-runner.js:1712`); `getState` also merges it (`:1696`). The helper calls `ensurePersistentKnowledgeState` and `mergePersistentKnowledge` (`:225`). Read-only preview means it cannot commit forecast gameplay, not that its JavaScript object is immutable. In addition, canonicalization sorts world arrays and replaces world connections (`src/model/world-state.js:445`). A retained state used for subsequent simulation is also intrinsically mutable.

Keep retained anchors private and immutable. Return an independent mutable body, attach immutable config, attach RNG helpers to that new owner, and perform required derived-state normalization. Do not pass an anchor or worker's evolving state straight to the runner. A zero-cost pointer result is not a shippable claim without changing the ownership model.

### Do not omit moon-turn or meal data

The strongest reason is simulation correctness, before rendering:

- Faith reads the current turn's housing happiness cap and food results (`src/model/detailed-settlements/phases/faith.js:54`, `:61`).
- Migration consumes intents accumulated earlier in the moon (`src/model/detailed-settlements/phases/migration.js:491`).
- Death consumes migration movements and unresolved compositions (`src/model/detailed-settlements/phases/death.js:50`, `:63`).
- `ensureMoonTurn` creates a new empty turn if the current turn is missing (`src/model/detailed-settlements/phases/moon-turn.js:43`), so it cannot reconstruct the lost earlier-phase inputs.

Thus `currentMoonTurn` is continuation state. Arbitrary 16-second anchors can be mid-moon; deletion can change future gameplay. The brief's conditional suggestion to omit it if views tolerate absence is insufficient.

Preview fidelity also explicitly requires these fields. Phase tooltips use both `currentMoonTurn` and `lastMoonTurn` (`src/views/moon-phase-reference-pixi.js:16`). Detailed settlement view models expose current moon results, currency spent this moon, and last meal (`src/model/detailed-settlements/view-model.js:162`, `:187`). Last meal drives starvation and unmet-demand pressure (`src/model/detailed-settlements/queries.js:102`), which is included in the same view model (`view-model.js:166`). The settlement prototype displays last-meal consumption/demand (`src/views/settlement-prototype-view.js:167`, `:226`).

Keep all three. Lossless interned subtrees or reconstruction from an earlier complete anchor could be researched separately, but dropping them is not same-functionality restoration. The brief's ~23KB and ~46MB examples depend on dropping moon fields and therefore are not validated safe-codec memory targets.

### Trusted restore is more than bypassing validators

The save deserializer currently checks schema, validates and canonicalizes config, canonicalizes/validates world, validates Life Map, checks every RNG stream, attaches RNG helpers, resets transient flags, and synchronizes phase (`src/model/state.js:442–476`). A private fast restore must preserve the behavioral steps, even if its provenance lets it skip redundant validation. `canonicalizeSnapshot` additionally rebuilds occupancy and ensures pawn fields (`src/model/canonicalize.js:14`). A starter serialization match alone does not prove that arbitrary authored worlds, worker input, or derived inventory references need none of these operations.

Maintain full validation for saves/timeline input and worker ingress as required by the brief. Validate each incoming mutable payload's shape/invariants, not merely the first chunk of an entire worker session; validating immutable config once is a different question. Only label locally produced or already checked snapshots trusted. Include generation, schema, target time, and config provenance in that internal contract. No save-schema alteration is required.

## Required validation for an implementation

1. Differential full `serializeGameState` equality against official replay at every phase boundary and off-anchor second, including actions at edit boundaries, run completion, custom phase durations, all RNG streams, and non-default authored worlds. Fingerprints that exclude display fields are insufficient.
2. Recursively freeze the interned config while running phases and representative construction/practice/vassal actions. Confirm the original live config, old generation, worker config, and config bytes remain unchanged.
3. Retrieve the same anchor twice, mutate one returned state's nested world/RNG/knowledge, apply runner preview knowledge merging, then restore and simulate again. Other restores and stored anchors must match baseline. This directly catches pointer aliasing.
4. Compare moon-phase tooltip specs, settlement pressure, meals, and current-moon currency at restored seconds; check continuation through faith/migration/death from mid-moon anchors.
5. Send malformed/stale-worker-generation snapshots and config identities to ingress; reject without contaminating cache. Keep current save rejection behavior and schema intact.
6. Measure memory using actual retained mutable bodies plus config once. Do not retain full config during serialization and omit it only afterward if the goal also includes packaging CPU savings; benchmark that separately. Record clone/normalization costs rather than quoting pointer lookup time as end-to-end restoration.

No view, RNG, schema, replay, or production simulation changes were made by this audit. The frozen-config probe ran directly with Node imports from this worktree; it is an investigation result, not a replacement for the implementation tests above.
