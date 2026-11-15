# J8 readiness attribution — bounded diagnostic brief

**READ-ONLY PROPOSAL; NOT EXECUTED. Whole Phase A remains NOT SOUND.** Independent Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh. Parent retains the sole CPU/test/browser/source slot for the frozen Continue/J7 coverage schedule. This brief changes no source, contract, build or old evidence and starts no tests, browsers or other workload.

## Existing failure evidence

Preserved performance checkout: `C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104`.

The precise prior failed populations are:

- `artifacts/perf-hillclimb/feedback-final-j8-receipts-r1-20261105-mobile4-reference/`
- `artifacts/perf-hillclimb/feedback-final-j8-receipts-r1-20261105-mobile4-deferred/`

I inspected each manifest, named failure JSON, raw failure-observation witness and the matching source path. Both fail the original **240000 ms** preparation wait: `remaining-background-wait-to-prepared` for reference and `deferred-atlas-to-prepared` for deferred. Whole launches lasted approximately **303.096 s** and **294.928 s**, respectively; those totals include setup and failure collection, not just the timed readiness wait.

At the retained failure read, both have **13/13 required non-resource groups loaded, valid and hidden**, main/decision `artReady: false`, and main/decision `artPrepared: null`. No console/page error or failed resource request was recorded. `null` means preparation is not established; it must not become `true` because atlas loading finished. The reference had completed opening and Present; deferred also retained pre-release navigation. Neither reached its required later positive navigation/reveal cycles.

The nullable value has a direct source explanation. The minimal-graphics wrapper in `src/views/world-map/illustrated-terrain.js` initializes `stats` with `ready`, `bakes` and `frames`, **without a `prepared` property**. Only successful completion/adoption of its awaited progressive terrain preparation sets `prepared: true`. `world-map-pixi.js` exposes `illustrated.stats.prepared ?? null`; the decision world's timing accessor delegates to another instance of that same map seam. Therefore these inspected seams exist, and raw `null` is consistent with no completed/adopted preparation flag yet; it is not an observed boolean `false`, a proof of missing accessor wiring, or evidence that no work has started. The current seam cannot distinguish queued, in-progress, cancelled or otherwise unfinished work. The atlas loader, then main terrain, then decision terrain run sequentially before `onReady`; loaded atlas metadata alone does not locate the stall within that sequence. Preserve `null` verbatim and leave that phase attribution unresolved in all four diagnostic outcomes.

`FEEDBACK_NATIVE_IMPLEMENTATION.md` records six passing and these two failing cases in the eight-case receipt refresh, with unchanged source/assets through that attempt. Those old timings remain possibly contended/ineligible; this brief neither removes those labels nor attributes their failures to product versus harness. The current run must use one current fixed build and current contract, not treat historical results as a matched A/B.

## Recommended first experiment

**Hypothesis:** the optional instrumentation bundle contributes to the mobile4 preparation stall. Removing that bundle while keeping the actual job and common hooks can change whether both terrain surfaces and the real ready seal complete within the existing gate.

Use **four fresh reference/mobile4 cells in the fixed order ON, OFF, OFF, ON**. This creates two opposite-order pairs without a data-dependent repeat-until-pass loop. Use the same seed123 prepared packet, browser-cold new process/context, viewport/4x CPU/SwiftShader settings, source, all required assets and oracles. Keep `--cycles=5`: the actual implementation retains its two blocks of five navigation cycles after explicit reveal. All **13 groups** and **16 atlas entries**, texture validity/current-context checks, real reveal, state/replay export and existing functional predicates remain unchanged.

This is an attribution diagnostic, not a P95 sample or an acceptance timing population. No product or harness change is essential for this first experiment; existing flags suffice.

### What the existing flag changes

`--instrumentation=off` disables this **combined optional bundle**:

- Runtime continuous rAF frame capture and long-task observer.
- Runtime Worker request/response wrapper and IndexedDB save-event wrapper.
- Artwork per-frame terrain-publication probe.
- Artwork 250 ms full-group passive sampler and resource PerformanceObserver.

It **does not remove** the following common work:

- HC input/semantic/frame-opportunity clock, terminal predicates and rAF polling.
- Feedback observer, feedback bindings, per-operation retained-cue reads and collection.
- Ready-seal MutationObserver, trusted input markers and progressive console-warning witness.
- Early `PIXI.Assets.load` wrapper and its attempt log.
- Private `hiddenGroups` Set / `packedTextures` Map instrumentation, bundle-response routing, actual drawing export/parity and all-group endpoint checks.
- Page/error/request listeners, CPU throttle, geometry diagnostics, screenshots, heap/context checks and post-observation state export.

Keep the default private publication trace **on in all four cells**. Do not add `--publication-witness=sampled`: that is a different factor which also changes the served bundle and skips actual drawing parity. Likewise the current J8 driver does not expose a feedback-off mode; `--instrumentation=off` must not be described as feedback-free, native-reference or uninstrumented.

The OFF cells necessarily lack the disabled interval-level frame/terrain/sample evidence; their manifest explicitly marks that unavailability. Retained common private-publication trace and full endpoint oracles still apply. This is a diagnostic change in observer availability, not permission to claim absent transient terrain changes, smoothness, complete negative coverage or candidate acceptance.

### Exact commands

Run only **after** the parent finishes and releases the frozen Continue/J7 schedule. From the preserved performance checkout, sequentially, under a new parent-created source/asset freeze plan:

```powershell
node --experimental-vm-modules scripts/perf-hillclimb/artwork-controls.mjs --id=j8-optional-on-a-20261115-r1 --population=mobile4 --cases=reference --cycles=5 --instrumentation=on --timeout=240000 --gate-timeout=240000 --case-timeout=600000
node --experimental-vm-modules scripts/perf-hillclimb/artwork-controls.mjs --id=j8-optional-off-b-20261115-r1 --population=mobile4 --cases=reference --cycles=5 --instrumentation=off --timeout=240000 --gate-timeout=240000 --case-timeout=600000
node --experimental-vm-modules scripts/perf-hillclimb/artwork-controls.mjs --id=j8-optional-off-a-20261115-r1 --population=mobile4 --cases=reference --cycles=5 --instrumentation=off --timeout=240000 --gate-timeout=240000 --case-timeout=600000
node --experimental-vm-modules scripts/perf-hillclimb/artwork-controls.mjs --id=j8-optional-on-b-20261115-r1 --population=mobile4 --cases=reference --cycles=5 --instrumentation=on --timeout=240000 --gate-timeout=240000 --case-timeout=600000
```

Fresh IDs must not overwrite earlier attempts. Parent should launch each as a separate child process, retain every exit/failure and still schedule the remaining declared cells after a product failure; an infrastructure/identity failure stops comparison eligibility and must be reported distinctly. Keep one owned workload at a time.

The 600000 ms enclosing **case-lifetime** limit bounds the experiment to roughly 40 minutes plus bounded cleanup; it does not replace or relax any 240000 ms readiness gate. A case-lifetime failure is an incomplete/failed case, not a successful shortened workload. Reserve about 45 minutes before starting all four, within the operator's remaining wall-clock budget. If the remaining budget is shorter, declare a two-cell pilot **before execution** and label its attribution inconclusive; do not choose which cells to retain after seeing outcomes.

## Frozen receipts and decision rule

Before the batch, record exact source/package/HARNESS and all built asset/prepared-packet hashes, each cell's argv/order, machine/runtime/throttle/render configuration and known load notes. Verify those bytes before/between/after cells and confirm actual served variants agree in both private-trace modes. The only planned population factor is optional instrumentation. No profiling or simultaneous build/verify is permitted during the batch.

Retain for each cell:

- Full manifest, observations, intended/actual exit and exact failed stage.
- Input-to-ready and first-asset-call-to-ready bounds; timeout/failure remains censored, never zero or dropped.
- Readiness witnesses for **both** terrains and the seal; full groups, uploads and publication state. A failed cell must not be declared prepared from loaded atlas groups alone.
- All common feedback receipts and observer costs, declared diagnostic windows and raw continuous telemetry where available; OFF availability remains explicit.
- App/served-bundle identities, cleanup/lifetime drain and original errors/partial collections.

Predeclared interpretation:

- **Both ON fail while both OFF pass** with correct unchanged oracles: evidence consistent with the optional bundle contributing to this stall. It does not identify which optional mechanism or establish all-observer neutrality. Follow up with one narrower factor before a causal fix or performance claim.
- **All four fail at the same readiness gate:** the optional bundle's removal was insufficient. Product preparation, common hooks and the shared protocol remain candidates; do not label the product solely responsible.
- **All four pass:** the historical failure did not reproduce in this current matched diagnostic. Preserve old failures; no root cause or speedup is established.
- **Mixed results, different failure mechanisms, identity drift or capped cases:** **INCONCLUSIVE**. Retain every row and name the unresolved precondition/variance; do not select only successful cells or automatically add more runs.

A clean reference result does not clear the distinct deferred/fault path. Revisit the existing deferred case separately only after this first fixed decision, with its real held atlas/200 ms release and all original predicates intact.

## Ownership and later seam, if needed

Parent owns admission, immutable batch plan, execution/cleanup and adoption decision. An Implementer would own only a later narrowly approved harness change, with an independent Auditor rechecking it. No executable edits are authorized by this brief.

If the optional bundle comparison implicates instrumentation, the smallest later seam would split **only the existing optional artwork polling** (terrain frame probe + 250 ms inventory/resource sampling) from runtime frame/Worker/IDB capture, leaving HC/feedback/private publication/Assets wrappers and all endpoint oracles fixed. Predeclare exactly which factor is switched, pin served/source bytes, prove identical fixed workload and retain explicit unavailable intervals. Do not add a generic “all observers off” bypass that quietly drops required functional checks. If common feedback or private publication hooks are suspected instead, they need their own separate matched reference mechanism and controls; this experiment cannot certify them.

Source hashes inspected for this proposal:

| File | Raw SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/artwork-controls.mjs` | `f2f2d32ba3ee5d0e22b25a598ee2c6604488da298dd7c20f8065127bd35bcf42` |
| `scripts/perf-hillclimb/artwork-bundle-controls.mjs` | `74da29d61ca2758498170efeca46e38e77148e26f91ff6e72a05c92a463d80ac` |
| `scripts/perf-hillclimb/browser-runtime.mjs` | `f81efb2accba8b8ae3b7c35db109835c8639aa91c87c7e3ec69541fc608714f1` |
| `scripts/perf-hillclimb/feedback-runtime.mjs` | `a4d9859480109058b24261825e24a862c145fb9f462bae2c5e2a96b3bbf06329` |
| `scripts/perf-hillclimb/feedback-bindings.mjs` | `a17bb0c3c003e9eb1efcbdc50ac9fc788bc4b25e98d08984a6f9b835eb726072` |

Simulation state, RNG, schemas, replay, UI pacing and product behavior remain untouched. This brief supplies no physical-pixel, physical-phone, full-overhead, tail, score or product-win claim.
