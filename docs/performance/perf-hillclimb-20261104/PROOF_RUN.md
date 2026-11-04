# Phase A proof evidence

2026-11-04. **PROOF: NOT SOUND** — harness construction, no complete proof suites yet. Independent acceptance pending. Baseline scorecard and candidate iterations not reached.

Original baseline `ec49648ed1ef92d25a0d0a715f128044f907390e`, v1.1.52. Dependencies installed from lockfile. Machine/config contract in HARNESS.md. Raw runs will live in task-specific `artifacts/perf-hillclimb-20261104/`; durable compact summaries and hashes belong here. No timings claimed yet.

## Existing region-map oracle debt

Inspected the actual authored five-Practice fixture, current recipe definitions, `world-map/README.md`, `stock-coverage.js` and `stock-tags.js`. Node diagnostic rebuilt that exact launch profile through `createConfiguredNewGameState(42, profile)` and evaluated real coverage/view-model tags. Raw compact report: `artifacts/perf-hillclimb-20261104/stock-oracle-inspection.json`.

- Logging hosts one Stock unit with traits `[Timber, Construction]`; Housebuilding consumes 2 Construction and requires 1 Tool. Its Construction use marks the entire Logging unit used, including Timber.
- Meals use Foraging's Edible unit. Used sources include cedar-woods slots 0 and 1. The documented current map contract hides ordinary used Stock.
- Currency and Metal have no installed consumer; Tool remains unsourced. Actual expected indicator array: `Currency/green, Metal/green, Tool/red`.
- Existing assertion expected ordinary Construction/Edible tags plus unused Timber, contradicting that recipe oracle. Repaired the assertion and added explicit fixture recipe preconditions, retaining strict equality and unsourced-demand checks. Browser verification pending the single measurement slot.
- This is a test-oracle correction, not a product performance gain. Simulation state, RNG, schemas, authoritative replay and layering are untouched. Test with `node scripts/region-map-browser-probe.mjs` after build, plus `npm run test:region-map-camera` and `npm run verify` before commit.

## Discovery and controls (not acceptance proof)

- Builder discovery `artifacts/perf-hillclimb/builder-discovery-entry` reached semantic full-opening readiness and responsive Present on ordinary New Game. However the operation exceeded its declared 60s deadline (about 65.9s) and the draft art-off population actually loaded illustrated mode. **FAILED discovery / invalid population**, not proof or a product baseline. Builder repairing late-success rejection, artwork selection and warm policies.
- Independent round 1 is **PROOF: NOT SOUND**; exact reviewed file hashes and six findings in HARNESS_REVIEW.md. No complete coverage, scored baseline or product optimization yet.
- Root took exclusive ownership of statistics.mjs/statistics-test.mjs after explicit Builder release. Mode-centred binomial weights now avoid tail-PMF underflow. Independently reproduced expected ranks using Python `decimal` at 60-digit precision with exact `math.comb`, summing `C(n,k) * Decimal('.95')**k * Decimal('.05')**(n-k)` until CDF crosses .025/.975: n60 [53, unbounded], n120 [109,119], n1000 [936,964]. These are now executable fixed oracle controls.
- `node scripts/perf-hillclimb/statistics-test.mjs` passed numeric tests through n100000, clustered reproducibility, launch quotas, invalid-success classification and censoring controls. A 70-attempt control containing ten 180000ms timeouts now reports unconditional P95 unresolved (lower bound 180000ms, upper unbounded), explicitly separates success-only P95 100ms, and fails correctness/tail inference gates.
- Repeated interaction uncertainty resamples whole launch clusters with recorded deterministic analysis seed/replicate count; it never perturbs simulation RNG. It remains approximate and requires session/observation quotas and independently verified launch identities. Independent statistical re-audit still required.

### A2 statistical repairs and validation status

The preceding bootstrap mechanism is now **diagnostic only** following the independent round-2 counterexample (40 perfectly correlated sessions). Hard inference uses the conservative exact minima/maxima envelope, at least 120 independent launches, equal fixed operation counts and 99% per-build/per-look intervals. Exact derivation, repeated-look accounting and assumptions are in HARNESS A2. Missing build/observation identities and duplicate observations now fail; unlike fixture/build identities group separately. Focused controls pass, including n40 unbounded upper, unequal cluster counts rejected, and known exact n120 envelope. Independent round 3 reviewing new content; no self-acceptance.

`npm run verify` completed with exit 0 on 2026-11-04, including architecture/source/docs/build, model/replay, save and content suites. Log: `artifacts/perf-hillclimb-20261104/verify-initial.log`. This is application correctness validation, not full Phase A performance acceptance. Builder continues editing harness-only files; new statistical controls are run separately.

Full `node scripts/region-map-browser-probe.mjs` passed (exit 0), covering disclosure, framing, mouse/touch pan, wheel/pinch zoom, inspection and rail. Log: `artifacts/perf-hillclimb-20261104/region-map-probe.log`. Verified strict oracle repair committed locally as `7f7a1fe0`; no product source changes, PR, push, integration or deployment.

### Independently accepted statistics submechanism

Independent `/root/statistics_auditor_round3` accepted the repaired **statistics submechanism only** at the exact hashes in STATISTICS_REVIEW_ROUND3.md. It independently checked 80 high-precision Decimal/binomial cases, conservative cluster bounds, censoring and repaired identity validation/grouping. Acceptance assumes actual independent launches, fixed equal offered operations, explicit plain-JSON provenance and frozen population semantics; the runner/auditor must establish those assumptions. Full Phase A remains NOT SOUND.

### Browser mechanism controls

`artifacts/perf-hillclimb/mechanism-controls/controls.json` reports four passing mechanism groups on Chromium 147.0.7727.15 with explicit SwiftShader. Input baseline 63.3ms, deferred 200ms path 248.6ms; preceding capture-handler delay counted as 200.2ms queued time. Wrong result and late success rejected; delayed real Worker delivery, committed IndexedDB slot/payload replacement and native unwrapped Worker reference passed. This is construction evidence, not an end-to-end proof suite; freeze exact source identities and repeat controls before final acceptance.

### Corpus failure under diagnosis

Expanded ordinary histories reach seed123 t439 (21 actions, 28 checkpoints) and seed424242 t574 (21 actions, 29 checkpoints) through six real nodes. Seed99117 remains required and fails with `site R01-settlement neutral market cannot install gamepieces` during the ordinary itinerary/clone path. Harness Builder is constructing a deterministic minimal reproduction before classification. No seed exclusion or product behavior change is authorized by this finding; no product performance gain claimed.

### Correctness prerequisite resolved separately

Independent read-only diagnosis reproduced the same t740 failure with normal paused dispatch (no isReplay), actual enabled decision presentation, and normal SimRunner updates. Optional Lyceum creation bypassed storefront installation eligibility; the validator was correct. A separate corrective Implementer added the general storefront boundary guard without changing founding, training, costs, time, RNG, ownership, schemas or the validator. It also covers reopened frozen storefronts and preserves ordinary/foreign held-town installation.

The self-contained `scripts/neutral-market-structure-boundary-test.mjs` first went red, then passed after the guard; the original durable18-action repro now reports symptom absent/exit0. Full raw state/RNG JSON/replay continuation, economy/class and focused replay tests pass. Root reviewed the diff and full `npm run verify` passed again (exit0), log `artifacts/perf-hillclimb-20261104/verify-storefront-fix.log`. Updated local build/fixture served via `npm start`. Verified corrective commit: `d05bab34417ff2af4fd280225e03bab316602105`.

Original main `ec49648e` remains recorded as failing this required corpus path; corrected baseline is separately identified, and this repair is **not a performance improvement**. No scorecard exists yet. Three-seed corpus and new terminal-timing controls are next; original failure evidence remains on disk.

### Corrected-build construction checks

Primary Builder reports all3 seeds /15 generated fixtures pass on corrected d05bab34, raw `artifacts/perf-hillclimb/fixture-corpus-d05bab3/manifest.json`. Updated five-group browser controls pass at `artifacts/perf-hillclimb/mechanism-controls-d05bab3-terminal-queue/controls.json`, including exact code/contract/build identities. They now include true trusted precomputed-coordinate CDP input delivered while a renderer300ms loop runs, plus a separate terminal200ms completion after an immediately successful intermediate wait. Independent reproduction of these updated mechanisms remains pending.

Root artwork deferred-case discovery started as `artwork-deferred-discovery`, single case/cycle with240s timeout. It is construction-only; a concurrent root preview metadata HTTP/HTML identity fetch occurred near its beginning, so its frame/timing observations must never be promoted to acceptance samples. Dedicated uncontended proof runs are still required.

Deferred artwork discovery completed exit0 (1case,9observations), proving its staged-asset/no-premature-publication/explicit-reveal/upload/navigation control oracles only. Retry/exhausted/reference batch now runs under exclusive Artwork Builder ownership. Its failed network-request-count bound was replaced before these runs by an observation of the actual Assets.load retry boundary (3calls per invocation;500/1500ms backoffs), with control-only instrumentation disclosed.

## Material instrumentation finding — timing baseline blocked

Full debug snapshot polling is both expensive and potentially causally intrusive. Primary Builder's old Life Map rows show 195.7ms probe CPU /1156.9ms elapsed on11probes; a failed90s entry had17,570.1ms probe CPU across1564probes. Artwork's250ms sampler retained362snapshots and about4.99s snapshot CPU over115s. These are harness-overhead diagnostics, **not product performance**; all such discovery timings remain ineligible for baseline/score claims.

Read-only Explorer `/root/timing_observability_seam` found existing named timing APIs also unsafe as passive substitutes: Life decision status can sync/reset worker/draft state; runner state accessors merge persistent knowledge; frontier access can restore; graph getData updates cache/version and graph debug state samples/synchronizes plots. A separate additive passive-observability implementation is needed, using raw primitive closure reads only and independently checked for no state/RNG/cache/worker effects. No product optimization or scoring permitted before new observer controls/overhead proof and independent audit.
