# Independent artwork harness review — round 1

**PROOF: NOT SOUND.** This is a static source/artifact review, not independent browser reproduction or acceptance of the artwork timing population. The completed controls provide useful construction evidence, but the findings below and the wider Phase A coverage/overhead/sample gates remain open.

Auditor: `/root/artwork_auditor_round1`, inherited Codex gpt-6.1-sol / xhigh, separate from root and both Harness Builders. Date: 2026-11-04. Owned edit: this report only. No source, runtime, harness, browser, build or process mutations were performed. The separate passive-observability Implementer owned the CPU/browser slot. Read the performance-loop skill, repository invariants/routing, timegraph guardrails and required current intent/implementation/supply documents before review.

## Exact reviewed identities

| Item | SHA-256 / revision |
| --- | --- |
| Recorded product commit for all five runs | `d05bab34417ff2af4fd280225e03bab316602105` |
| Recorded built-manifest identity, all five runs | `8a107aa47c6e5c68b07b2208ff4a41da6b7402aaa80cca861e6b6691df9a30d5` |
| Recorded contract identity, all five runs | `ae5accb6f8e88ba6f18c40a275734ef9f7e2b6df7c17ca2b7cabf15e980f12f8` |
| Deferred executed artwork source | `f6da358420afedb7f8967ca81075e0e9ca267451af2ee5344edc5f9b128c7597` |
| Retry/exhausted/reference executed artwork source | `9c3254ee7082c4e50700a9d6e6e0f01df8f0d1e45e4795d753abf8ac741f7f28` |
| Current artwork source reviewed | `f67f3439c582d8a8f461809e771f4ac32461f8ee57089a2cfaf47a579be4566d` |
| Executed/current browser runtime source | `daa6fcbde5acb0e43defa792cee5f6d32b612bc0d7e5f1aadc555a08de41dea7` |
| Recorded serialized-runtime identity | `5a8b87740e91e0296f4c5adfdf7c233fa485eddfdb72d04b28629ecc9f4d7a5f` |
| Retry/exhausted/reference harness identity | `dfb3af89b1c38e75cd9ad103e4aa1da3ad6fb500acc75c37938745c745bd7e34` |

I recomputed the artwork/runtime source hashes directly from each retained run snapshot and compared them with its manifest. Current source versus executed `9c3254…` differs only in output-directory creation: recursive parent creation followed by exclusive `mkdir(output)`. No timing/fault/oracle change was hidden in that delta. The retained output-preservation control reports EEXIST and unchanged previous manifest; it was inspected, not re-executed here.

The five raw folders are `artifacts/perf-hillclimb/artwork-deferred-discovery`, `artwork-retry-discovery`, `artwork-exhausted-discovery`, `artwork-sampling-reference`, and `artwork-native-reference`. The pair report is `artifacts/perf-hillclimb/artwork-reference-pair/paired-diagnostic.json`.

## Inspected artifact facts

| Run | Raw observations | Failed observation rows | Page errors | Relevant retained evidence |
| --- | ---: | ---: | ---: | --- |
| Deferred | 9 | 0 | 0 | 362 sampled states, zero reported drops, no sampled terrain publication before input, 16 atlas entries reported valid/uploaded. |
| Required-entry retry | 4 | 0 | 0 | 3 application load calls in one failed invocation, 3 HTTP failures, one successful manual retry attempt, resource upload and navigation. |
| Progressive exhaustion | 3 | 0 | 0 | 3 application calls in one invocation, 3 HTTP failures, one expected progressive warning; unpublished terrain/no ready seal, remaining atlas groups and navigation. Three console errors are retained separately from page errors. |
| Sampling reference | 7 | 0 | 0 | No injected fault; 368 full samples; all 16 atlas entries reported uploaded. |
| Native-reference label | 7 | 0 | 0 | No injected fault; no heavy samples; all 16 atlas entries reported uploaded. Common Assets observer, semantic polling and terminal/frame clock remain. |

All interactive rows in these stored runs have trusted input witnesses. Both reference runs agree on the recorded build, harness, contract, runtime and script identities. These facts agree with the Builder's qualified discovery claims. They do not reproduce execution independently or establish tails, retained-memory growth, observer neutrality or physical-device performance.

## Findings and required dispositions

| ID | Priority / status | Actual evidence and repair required |
| --- | --- | --- |
| A8-01 | Blocking liveness / open | `artwork-controls.mjs:236` executes `await gate` after the entry record finishes. The promise resolves only if the routed full-map atlas is requested, and it has no deadline. If progressive loading never requests that asset, the advertised `--timeout` cannot terminate this stage and no failed operation is recorded. Bound the gate and other out-of-record waits with a declared deadline, retain the missing-request failure, and test a real no-request case. Clear deadline timers after success/failure so the repair does not leave a process alive. |
| A8-02 | Blocking shared completion mechanism / open | `browser-runtime.mjs:122–132` preserves an existing terminal completion candidate when the **same-key** predicate later returns false. `finish():95–102` waits for the candidate's double-rAF but never reevaluates the predicate or checks generation/currentness at that frame. Thus a transient ready/stale result can retain an early timestamp even though it is no longer ready at the supposed visible completion. Add invalidation/revalidation across the frame boundary and an actual browser control with transient true → false until a later 200ms terminal result; require the earlier candidate to fail or move later. The existing different-key intermediate-wait control does not exercise this path. |
| A8-03 | High publication coverage / open | `assertUnrevealed():151` and the periodic sampler check only the main-map and decision-map terrain flags. They never assert that the card/portrait/frame/other non-resource atlas groups remain unavailable to actual drawing before the seal. A candidate can publish one such group early while both terrain flags stay false and pass this oracle. Add passive publication or actual rendered-art witnesses for non-resource groups, and an actual-product early-publication fault control that fails even when terrain flags remain false. The copied-object `ready:true` assertion is not that control. |
| A8-04 | Medium navigation identity / open | `navigation():195` requires only settlement mode and no focus animation, then manufactures `{region:id}` from its requested argument. It never checks the actual selected/opened region. A wrong settlement target could therefore pass and change the memory/navigation workload silently. Assert the actual selected/detail region equals the requested fixture region and retain the observed identity, with a wrong-target control. |
| A8-05 | Medium GPU-readiness claim / open | `uploadedAtlases():205` treats any nonempty `baseTexture._glTextures` dictionary as upload proof. That is weaker than the product's own `prepareChronicleArt`, which checks the current renderer's context entry and context-loss status. Old-context entries are not sufficient evidence of a usable current-context texture. Bind the oracle to the actual renderer/context and check it remains usable, with an invalid/current-context control, before describing it as GPU-readiness proof. The present fresh-context runs retain useful upload indicators, but not that stronger oracle. |

Line numbers refer to the current `f67f3439…` artwork script and `daa6fcb…` runtime. This report deliberately does not chase later repairs; a new independent recheck must identify their new hashes and proof runs.

### Shortest stale-terminal counterexample

This is a static counterexample derived from the reviewed runtime, **not a browser execution performed in this round**. After installing the runtime, with the page's real rAF available:

```js
let ready = true;
__HC__.arm({ name: 'transient-ready', startNow: true, timeoutMs: 1000 });
__HC__.probe(() => ready, { key: 'ready', terminal: true });
ready = false;
__HC__.probe(() => ready, { key: 'ready', terminal: true });
await __HC__.finish({ ready });
```

The second probe does not clear `completionCandidate`; `finish` consumes the old candidate without reading `ready`. The required follow-up should exercise a real trusted input and rendered transient state, then hold false through the frame opportunity until a known later completion. It must also assert a fresh source/generation token where relevant. This defect does not claim that the stored artwork run actually flashed ready; it shows the mechanism can accept such a fault.

## Source support for staging and retries

The retained `chronicle-art.js` source supports exactly three `PIXI.Assets.load` attempts per `loadPackedSheet` invocation with failure backoffs of 500ms and 1500ms. Observing the application API is stronger than the removed guessed HTTP-count range. The retained calls/timestamps satisfy that rule; the observed gaps include failed I/O and cannot be interpreted as exact sleep durations.

The current reviewed staging code provides a stronger **static explanation** than the 250ms samples alone: performance entry calls `hideChronicleArtwork`; progressive loading adds each non-resource group to `hiddenGroups` before loading; `loadTexture` withholds hidden/minimal illustrations; the progressive success object deletes those groups only inside its returned `reveal` closure. `progressive-artwork.js` passes that closure through `onReady` only after successful terrain preparation. The root stores it as pending, and the seal's real click invokes it. On a group failure, the result is `artworkFailed`, so no successful onReady publication path is reached.

This supports no early non-resource publication for the inspected implementation. It is not a candidate-sensitive oracle for future changes: A8-03 remains open, and the sampled endpoints cannot exclude every transient publication. Absence of a progressive manual Retry button is correctly recorded behavior, not a new feature requirement. The existing entry Retry is separately and appropriately exercised.

## Timing/resource limits and next audit

The deferred run is explicitly contaminated by the parent's concurrent metadata fetch and is not an acceptance timing sample. The reference pair is correctly labelled INCONCLUSIVE: one fixed-order pair, shared polling/hook cost, no interleaving/repetition and no uncertainty adequate for promotion. Disabling heavy sampling and native Worker/IDB interception does not make that reference uninstrumented. CDP heap points are raw JS-heap observations without forced GC; two short navigation blocks cannot establish retained-memory stability, total process/GPU memory or Pixel6 behavior.

Before acceptance: repair and independently reproduce the findings, integrate a proven passive observer, retain successful and failed/censored work, freeze the actual input/population identities, run the required repeated suites and tail-resolution sample plan, and obtain a fresh independent actual-browser check. Main J8 preparation start/explicit reveal metrics and all other required jobs remain governed by HARNESS.md. **No scoring, product performance gain or full Phase A acceptance is granted by this review.**
