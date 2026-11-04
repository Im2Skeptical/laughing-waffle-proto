# Artwork control builder

Builder `/root/artwork_harness_builder`, inherited Codex gpt-6.1-sol / xhigh. Owns only `scripts/perf-hillclimb/artwork-controls.mjs` and this note. No product changes, scoring or self-acceptance. **Deferred/retry/exhausted/reference cases executed as discovery/control evidence only; no independent acceptance.**

The supplement uses the actual regular menu in supported `?dev=1` graphics mode, then the real Performance New Game action and current prepared seed123 fixture. No prototype or obsolete save storage is used. Each fault case launches a fresh Chromium process/context; app/forecast/save worker/CSS bytes and served manifest must match declared local `dist`. Browser/OS/launch flags, exact source snapshots/hashes, actual serialized timing function, contract hash and input identities are retained.

Impact: no simulation state, RNG, schemas, authoritative replay, gameplay, UI layout/copy or product layering changes. Request routing/fault injection and sampled debug state reads are harness-only. The same runtime input timestamp, explicit terminal predicate and double-rAF completion mechanism is reused. Heavy snapshots/atlas correctness checks occur outside timed completion. Timing remains a frame-opportunity proxy, not physical display scanout.

## Cases

- `deferred`: hold the first actual progressive full-map atlas response. Assert stubs/no ready seal and navigate a real settlement while the request is blocked. Release with 200ms extra network delay; readiness cannot pass before that work. Assert both terrain surfaces prepared but unpublished, all registered atlases valid/uploaded, then click the actual seal and require both surfaces published. Deliberately premature copied result fails the same staging oracle.
- `retry`: abort required resource PNG, require visible entry loading error with bounded automatic attempts, restore network, use actual loading Retry, require useful play and valid uploaded resource atlas, then real settlement navigation. This uses existing entry retry, not an invented progressive retry.
- `exhausted`: exhaust progressive full-map atlas retries. Require the actual progressive error warning, reject the successful-preparation oracle, navigate normally, wait for other atlas groups to upload, and require no ready seal or art publication. The current progressive loader has no visible manual retry affordance; this case records that actual behavior.
- `reference`: matching successful progressive workload with no injected fault. Run explicitly with instrumentation off to compare full frame/250ms snapshot sampling against the native Worker/IDB reference. Minimal semantic/error witnesses remain and are disclosed as irreducible harness overhead.

Before/after prepared/revealed/two fixed navigation blocks capture CDP JS heap only, without forced GC. Native process/GPU memory are unavailable. The 250ms state sampler records its CPU cost and dropped observations; no dropped samples are allowed. Sparse sampling cannot rule out a transient unsampled publication, so endpoint checks and inspected product staging semantics must remain part of independent review. Raw frame/long-task observations are retained per timed operation; no single-run P95 or retained-memory claim is made.

## Commands

Run sequentially after root grants the measurement slot and verifies/rebuilds `dist`:

```powershell
node --check scripts/perf-hillclimb/artwork-controls.mjs
node scripts/perf-hillclimb/artwork-controls.mjs --cases=deferred --id=artwork-deferred-discovery
node scripts/perf-hillclimb/artwork-controls.mjs --cases=retry --id=artwork-retry-discovery
node scripts/perf-hillclimb/artwork-controls.mjs --cases=exhausted --id=artwork-exhausted-discovery
node scripts/perf-hillclimb/artwork-controls.mjs --cases=reference --instrumentation=off --id=artwork-native-reference
```

Other arguments: `--population=desktop|mobile|mobile4`, `--cycles=5`, `--timeout=240000`, `--port=18246`, `--dist=dist`, `--output=<path>`. `mobile4` is desktop Chromium with 4x CPU throttle, not a physical Pixel6. Default browser is explicit SwiftShader as in existing probes. Raw results default to `artifacts/perf-hillclimb/<id>/`.

## Deferred discovery evidence

Root executed `--cases=deferred --cycles=1 --timeout=240000 --id=artwork-deferred-discovery`, exit0, one case and nine observations. Raw folder `artifacts/perf-hillclimb/artwork-deferred-discovery`, 2026-11-04T10:46:02.084Z–10:47:57.411Z. Root fetched preview metadata near the beginning, so its frame/timing numbers are **not acceptance samples**.

Exact recorded identities:

| Input | Identity |
| --- | --- |
| Product commit | `d05bab34417ff2af4fd280225e03bab316602105` |
| Built manifest SHA256 | `8a107aa47c6e5c68b07b2208ff4a41da6b7402aaa80cca861e6b6691df9a30d5` |
| Harness SHA256 | `33fe6d3e432a0c758e94aca76a1104d906ccfb08b5643cb22d74659129b3b74a` |
| Contract SHA256 | `ae5accb6f8e88ba6f18c40a275734ef9f7e2b6df7c17ca2b7cabf15e980f12f8` |
| Artwork script SHA256 | `f6da358420afedb7f8967ca81075e0e9ca267451af2ee5344edc5f9b128c7597` |
| Runtime source SHA256 | `daa6fcbde5acb0e43defa792cee5f6d32b612bc0d7e5f1aadc555a08de41dea7` |
| Serialized runtime SHA256 | `5a8b87740e91e0296f4c5adfdf7c233fa485eddfdb72d04b28629ecc9f4d7a5f` |

Environment: Node24.15.0, Playwright1.59.1, Chromium147.0.7727.15, desktop1280x800, cold browser, instrumentation on, explicit SwiftShader.

Proved for this discovery: navigation remained functional while the full-map atlas response was held; neither terrain surface published before the seal tap; both prepared surfaces were hidden at readiness; all16 registered atlas entries were valid/uploaded; explicit input published both surfaces; two subsequent navigation blocks completed. No page errors, failed requests, warnings or dropped samples. The sampler retained362 observations and consumed approximately4.99s of CPU according to its own counter, which makes the missing matched overhead reference material. Five raw JS-heap snapshots were captured, without forced GC; no memory-growth conclusion follows.

Unproved: repeatability/tails, physical-device behavior, complete transient no-publication coverage, overhead, required-entry failure/retry and progressive exhaustion. A copied premature-ready result failed the same staging oracle, but that does not replace every actual-product fault control. The current script adds a retry-attempt witness after this run, so future case manifests must be kept separate from these exact identities.

## Retry oracle correction

The initial `>=3 && <=7` **network request** assertion was copied from an older probe and has no general bound in the current loader contract. It has been removed rather than represented as an established guarantee. `loadPackedSheet` has exactly three application `PIXI.Assets.load(url)` attempts, separated after failures by500ms and1500ms. Pixi dependency fetching, multipack links and caches can make lower-level HTTP counts differ.

The corrected control installs a harness-only `PIXI.Assets.load` observer before the app bundle is released, returns the original Promise unchanged, and records application calls with browser monotonic timestamps. The app/worker/CSS bytes remain verified and unchanged. The source contract is frozen at three attempts and the two backoffs; changed source policy fails fast pending review. Required resources can have one initial lazy invocation and one explicit-entry invocation before the error, so each exhausted three-call batch is checked (at most two). Progressive full-map loading begins after the performance action in minimal mode and has one exhausted three-call invocation. After manual entry Retry, exactly one new successful application attempt plus actual uploaded textures are required. After progressive exhaustion, navigation and completion of other atlas groups must not restart the failed group.

HTTP failure counts remain recorded diagnostics and must be nonzero so a real network fault is exercised. These calls/backoff assertions were frozen before retry/exhausted execution; their observed results are below. Any contradictory result must be investigated against the actual trace, not repaired by widening a guessed count range. The extra Assets observer/setup gate is explicit control instrumentation, including in the `reference` case. Such a reference measures the incremental heavy sampling cost and is **not** a completely uninstrumented native performance population.

## Retry and exhaustion discovery results

Both source-grounded controls passed sequentially on the same corrected product build, desktop Chromium/SwiftShader, cycles1, timeout240000, instrumentation on. These remain construction/control evidence, not independent acceptance or performance samples.

| Run | UTC interval | Result |
| --- | --- | --- |
| `artwork-retry-discovery` | 2026-11-04T10:55:36.604Z–10:55:59.233Z | Exit0, four observations. Three API attempts/one sheet invocation, three HTTP failures. Observed call gaps2577.2ms and2312.6ms exceed required500/1500ms backoffs (include failed I/O). Visible loading failure followed by one successful manual Retry attempt and52 valid/uploaded resource textures; navigation passed; no page errors. |
| `artwork-exhausted-discovery` | 2026-11-04T10:57:04.483Z–10:57:27.087Z | Exit0, three observations. Three API attempts/one invocation, three HTTP failures; one expected progressive warning. Other atlas groups uploaded, navigation passed, no new attempts after exhaustion, both terrain surfaces unpublished and ready seal false.49 sampled states, zero drops/page errors. |

Raw run folders: `artifacts/perf-hillclimb/<run>/`, with actual call timestamps, network failures, screenshots and per-operation terminal/frame witnesses. Shared exact identities for these two runs:

| Input | SHA256 / commit |
| --- | --- |
| Product commit | `d05bab34417ff2af4fd280225e03bab316602105` |
| Built manifest | `8a107aa47c6e5c68b07b2208ff4a41da6b7402aaa80cca861e6b6691df9a30d5` |
| Artwork script | `9c3254ee7082c4e50700a9d6e6e0f01df8f0d1e45e4795d753abf8ac741f7f28` |
| Harness | `dfb3af89b1c38e75cd9ad103e4aa1da3ad6fb500acc75c37938745c745bd7e34` |
| Runtime source | `daa6fcbde5acb0e43defa792cee5f6d32b612bc0d7e5f1aadc555a08de41dea7` |
| Serialized runtime | `5a8b87740e91e0296f4c5adfdf7c233fa485eddfdb72d04b28629ecc9f4d7a5f` |
| Contract | `ae5accb6f8e88ba6f18c40a275734ef9f7e2b6df7c17ca2b7cabf15e980f12f8` |

## Matched reference discovery

`artwork-sampling-reference` (2026-11-04T10:58:48.879Z–11:00:45.931Z) and `artwork-native-reference` (11:01:22.450Z–11:03:09.022Z) both exited0 with seven observations. They used identical no-fault reference work, cycles1, desktop, browser-cold, timeout240000 and the exact same product/build/harness/contract/runtime/script identities listed for retry/exhausted above. Instrumentation was on then off; all registered atlases were valid/uploaded, navigation/reveal passed, and both had zero page errors.

The on sampler captured368 states and reports5059.3ms snapshot CPU; off captured no heavy samples and reports0ms sampler CPU. Raw timings and JS-heap points are in `artifacts/perf-hillclimb/artwork-reference-pair/paired-diagnostic.json`; **INCONCLUSIVE** as an overhead estimate: one pair, fixed on-then-off order, unknown external/thermal drift and unquantified common semantic polling. No product performance improvement, P95 result or retained-memory conclusion follows. The instrumentation-off path preserves native Worker/IDB but still includes the disclosed Assets observer/setup gate, terminal/frame clock and common semantic polling; it is not an uninstrumented performance population.

All four newly executed cases passed. Main gaps remain repeated interleaved overhead pairs, irreducible polling overhead, transient behavior between250ms samples, independent reproduction/audit, representative mobile/4x populations, adequate per-population launch/sample quotas, and whole-suite coverage. Parent owns full Phase A acceptance and the primary J8 happy-path timing contract.

After this batch, an output-preservation-only guard was added: an existing run folder now fails instead of overwriting its manifest/appending duplicate IDs. This source change has not had a fresh browser run; it changes no product/timing/fault behavior. The executed-source snapshot/hash remains `9c3254...` above, not the current file hash. Reproduction commands should omit `--id` for automatic unique run folders:

Current script SHA256: `f67f3439c582d8a8f461809e771f4ac32461f8ee57089a2cfaf47a579be4566d`. A short actual CLI control reused the previous retry ID, received EEXIST before browser startup, and confirmed the previous manifest hash unchanged. Evidence: `artifacts/perf-hillclimb/artwork-reference-pair/output-preservation-control.json`. Syntax check passed.

```powershell
node scripts/perf-hillclimb/artwork-controls.mjs --cases=retry --cycles=1 --timeout=240000
node scripts/perf-hillclimb/artwork-controls.mjs --cases=exhausted --cycles=1 --timeout=240000
node scripts/perf-hillclimb/artwork-controls.mjs --cases=reference --cycles=1 --timeout=240000
node scripts/perf-hillclimb/artwork-controls.mjs --cases=reference --instrumentation=off --cycles=1 --timeout=240000
```

Required next: execute bindings, repair actual failures without weakening oracles, compare instrumentation reference on the same build, and independent audit. Main J8 preparation/happy-path timing remains owned by the primary Harness Builder. This supplement cannot accept whole Phase A or fill unmeasured populations/tail quotas.
