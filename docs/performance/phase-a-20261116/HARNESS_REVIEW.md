# HARNESS_REVIEW — HC-20261116-A1

QUESTIONS FOR CAM (from Code Health). These are decisions only. Auditor: do not wait on them or act on them; copy them unchanged to the top of your final report so Cam sees them in his inbox.
1. Can unveil-after-death count as covered by the Node re-projection test (p50 9.3 s), with the browser path recorded as not covered?
2. Is the 4x CPU-throttle phone proxy acceptable for Phase A without a real Pixel 6?
3. OK to log the Windows 0xC0000409 crash in test:build-preview as a separate repo-health issue, outside Phase A?
4. Phone drag resolution: at 4x, drag changes smaller than ~0.4 s (21 drags per arm) or ~0.8 s (9 per arm) can't be told from noise, while desktop resolves ~0.1 s. Accept that limit, or pay ~15 extra minutes per phone suite for 21 drags per arm in Phase C?

**PROOF: NOT SOUND.** Round 1, independent Harness Auditor: Codex (gpt-6.1-sol), separate from the Code Health/Grok Bot Builder. Git author/committer: Im2Skeptical <SOLOcan@gmail.com>. All numbers are provisional; nothing is LOCKED. No scoring, baseline acceptance or product optimization is authorized by this review.

Review target: Builder tip `46d21c0a`; audited checkout `76c5bb37eba90eceb0d0e4580f074e42b1c7c761`, branch `audit/phase-a-20261116-r1`. The diff after the target is only `AUDITOR_PACKET.md`. Session began 2026-11-16 03:14 AEDT (2026-11-15 16:14 UTC); one session, within 90 minutes. This report and new audit JSON are the only tracked changes. No harness/product repairs, version bump, PR, main update, merge, Pages publication, bot callback, automation or scheduled continuation. Repair rounds used: 0 of 2; only the Dispatcher may queue a recheck after Builder repairs.

## Reproduction and statistics acceptance

`npm ci --no-audit --no-fund`, `npm run build`, and `npx playwright install chromium` all exited 0, in that order. The build baker independently printed seed 424242 through 6138 seconds. `statistics-test.mjs` exited 0. Windows `npm run verify` was not run. Linux verify exit 0 on `dcfdb071` is Builder-reported evidence in STATE.md, not independently reproduced here.

**Statistics module re-accepted**, conditional on the caller supplying valid population and independence identities:

- Committed Git-blob SHA-256: `9443d67041037fe97b1f9198067be8cfb2e0a9c065b40ed02f6ef24521bd4153`.
- Executed Windows CRLF file SHA-256: `81f66e9d68dab02aef3868bec500d8daeafe2b866fc8b5acdfa4f3227709d63e`.
- The checkout has `core.autocrlf=true`; the difference is line endings, not a source change. The nearest-rank quantiles, mode-centred binomial order-statistic intervals, unbounded endpoints, censoring and cluster restrictions are sound for their stated assumptions. Acceptance of these algorithms does not validate the runner's independence labels (B05).

Machine: DESKTOP-R0AMF0N, Windows_NT 10.0.26200 x64, Intel i9-10900K (20 logical CPUs), 32 GiB, Node v24.15.0. Browser: installed Google Chrome channel, headless SwiftShader, desktop 1280×800, CPU 1×; `npx playwright install chromium` does not change the harness's explicit `channel: 'chrome'`. Exact browser version is retained in raw rows. The population helper incorrectly labels this machine `box-linux-xeon-8`; use the actual run identities above, not that hardcoded label.

Local build: v1.1.69, Preview (no custom preview label), fingerprint `0bca41f2f586`, revision `76c5bb37eba9`, branch `audit/phase-a-20261116-r1`, unintegrated. Build-asset SHA-256 `c1ebca6a041f890641baefcaf0136896512edda9b0558f7ce3c44eea3f9e91f1`. This Windows build/machine is a separate population; absolute times are not comparisons with the Linux proof.

| Reproduction run | Result and numbers (ms) |
| --- | --- |
| `audit-r1-controls` | Exit 0. Ordinary New Game completed, seed 424242, loss/coverage 6138, graphics pinned; 81648.8 ms end-to-end, bake 19025.5 ms. Scrub positive 8/8, p50 259.9; wrong expected result rejected 3/3. Delay baseline 233.4 → 428.1, Δ +194.7. Labeled deferred 421.7, Δ +188.3; the label does not establish asynchronous coverage (B02). |
| `audit-r1-a1-01` | Exit 0; 3/3 stalled and 3/3 unstalled pass both clocks. Harness stalled 356.0 / 355.7 / 354.8; Event Timing 356.0 / 355.5 / 354.7. Unstalled harness 6.9 / 0.5 / 0.4; Event Timing 6.8 / 0.4 / 0.3. Every stalled input actually arrived during the stall. |
| `audit-r1-drag` | 20/20 drags pass all required oracles; 337/800 moves delivered, all delivered moves caught up. n=5/arm. A/A Δ +12.7 [−54.4, +64.1]; delay +1118.7 [931.1, 1172.9]; deferred +815.3 [764.6, 1222.8]; carry-over −46.6 [−87.9, +2.0]. Wrong target rejected on all five A1 drags. All six control gates pass. Raw frames re-analyse exactly and `evaluateRepeat` exactly reproduces the saved evaluation. |

Commands were the three requested run commands, using their exact ids/arguments. For controls and drag, `NODE_OPTIONS=--import=./artifacts/phase-a-audit-r1/capture-hook.mjs` adds screenshots and identity reads only after a timed evaluation/recorder has returned. It changes no frozen source and no measured timestamps. Extra screenshots extend off-clock post-release settling; this reproduction is not a certification of a strict 400 ms settle deadline. The hook, analysis scripts and logs are retained locally. The requested drag command defaults to **rotation, zero explicit settle gap**; it reproduces the desktop repeat, not the WP3c/WP4 circuit design. Circuit2/5 s evidence was independently recomputed from committed raw data.

## Committed evidence recomputation

Reviewed all 17 run manifests, 477 entries. All **419 available committed files** match both their Git-blob SHA-256 and byte length; hashing working CRLF files instead would give misleading mismatches. The omitted `wp4-suites/raw-scrub-drag.json` was reconstructed from the 72 committed per-drag files in profile-outer/session order: 816648 bytes, SHA-256 `dbdd1dcdbbe61d069c641c8828c53d8a86eeb6e99be07bc264b1243b7e38450c`, exactly matching its manifest. Thus 420 entries are byte-verified. The remaining 57 entries (53 screenshots, four oversized repeat-summary JSONs) are not available on this machine, so their hashes cannot be verified. Their names and expected sizes are listed in `analysis/recomputed.json`; this is an availability limit, not a hash mismatch.

Using `summarize`, `quantile`, `quantileInterval`, `analyzeDrag`, seeded `bootstrapMedianDelta`, `evaluateRepeat`, and the frozen `evaluateDragSuites` function extracted without modification:

- All **27 summary-table rows** in PROOF_RUN.md match, including sample/pass counts, launches, p50/p95, Node extrema/99% intervals and numerical tail flags. All three drag-evaluation rows match, including every pairwise session interval and envelope. Committed WP4 summary/evaluation JSON matches the recomputation exactly. Numerical flags reproduce the software; B05 qualifies their inferential meaning.
- Node window: 120/120, p50 1188.2, p95 1285.5, range 1065.6–1402.7, 99% interval [1258.3, 1402.7]. Horizon: 6/6, p50 14535.6; re-projection: 6/6, p50 9281.1. Horizon/re-projection tails remain INCONCLUSIVE.
- WP3c attempt 2: all 84 drags and current repeat gates pass. A/A −127.0 [−384.5, +134.9]; delay +925.8 [717.8, 1381.4]; deferred +696.6 [451.1, 1023.6]; carry-over −50.0 [−277.7, +332.3]. PROOF_RUN's integer presentation is approximate (−385 is about −384.5), not a material mismatch. Attempt 1's delay/deferred failures reproduce. Older WP3b raw data lacks `prevArm`, so the newly added carry-over gate cannot retrospectively pass it; its historical A/A/delay/deferred results reproduce.
- Desktop WP4 A/A +33.4 [−45.4, +89.5], delay +1061.3 [992.1, 1145.1], deferred +888.0 [791.2, 1480.0], all pass. Session baseline medians 186.6 / 218.0 / 255.8; empirical envelope 102.9.
- Mobile first run: A/A +153.2 [−740.0, +603.0]; delay lower bound 616.4 and deferred lower bound 306.3 both fail the 740.0 A/A envelope. Rerun: deferred +446.7 [74.8, 1139.5] fails the 774.4 envelope. Cross-session envelopes 909.7 and 871.0 reproduce. These are empirical noise envelopes, not a power-calibrated guarantee of a minimum detectable effect.
- F-W1-3 did not recur: maximum 1402.7 (index 0), 1.1806× median; zero >3× median, no observed GC entries. Window p50 changed +18.0% from WP1. Desktop New Game increased 86139.0 → 100016.3 → 111451.6 (+29.3858%).
- **One factual numeric mismatch:** PROOF_RUN.md:76 says load 0.4–1.8; window raw `diag.loadavg1` is **0.38–2.40**, or 0.4–2.4 at one decimal (e.g. `runs/wp4-node/raw-forecast-window.json:4749`). It remains below the contract's abort threshold of 3.

## Mechanism inspection and findings

New Game starts at captured input `event.timeStamp` and ends after the observed entry/reveal wait; its 100–200 ms milestones are polling upper bounds. Bake is the product's reported component duration. Scrub-step starts before `browseSecond`, waits for the requested `viewedSec`, then a rAF opportunity; it does not establish compositor presentation or full semantic state correctness. Node uses monotonic `hrtime` around synchronous complete chunks, with warmup outside timings; twin re-projection agrees on terminal second, not a full-state differential.

Drag sends an open-loop 40-move/50 ms CDP stream. Its primary metric is earliest coalesced input arrival → MessageChannel timestamp after a caught-up rAF. Superseded input may complete at a newer pointer target; this measures recovery of the stream, not fidelity to every historical pointer position. Delivered/coalesced counts and own-target censoring are retained; undelivered moves have no separate latency samples. CDP send times/lateness are retained. Post-rAF tasks include deferred rAF work, but do not prove physical pixels were displayed. Required oracle checks cover scrubbing/edge skip mid-drag, meaningful playing→Hold, release clear, pointer mapping, selected-view/packet comparison, and unchanged frontier second/base seed/timeline summary. `isScrubbingAllDuring` is diagnostic, not a required gate.

`CARRYOVER_CIRCUIT_4B` has each of the 12 directed distinct-arm pairs exactly once including wrap; A1/A2 mean position is 5.6667. WP4 uses one cycle/session and 5000 ms extra held-idle gaps, with the wrap pair absent at session boundaries. `settleGap` records the delay but does not fail if the idle precondition times out (B03). The between-session envelope implementation matches its stated max-absolute pairwise-bootstrap-bound rule. A confidence interval containing zero is not proof of equivalence, and this envelope is a comparison guard, not a general false-positive-rate guarantee.

The product measurement probe is correctly gated: `settlement-debug-api.js:273` returns null unless `__PERF_MEASUREMENT_HOOKS__ === true`. The probe reads view/playback/edge state; it does not add state to GameState, advance the simulation, consume RNG, or change schemas/replay.

| ID | Classification | Evidence | Required repair / disposition |
| --- | --- | --- | --- |
| B01 | **Blocking** | `wp4-suites` and `wp4-suites-mobile-r2`, recomputed drag evaluations | Required mobile deferred-completion gate failed twice at the actual suite budget. A passing n=21 single-session construction run does not validate n=9/arm suites. Re-prove the declared suite design at adequate resolution, or obtain an explicit smaller scope/changed contract and re-baseline. Merely accepting an observed ~0.8 s envelope does not turn the failed predeclared gate into a pass. |
| B02 | **Blocking** | `browser.mjs:444–449`; `audit-r1-controls` | Scrub-step `deferredMs` busy-waits synchronously **before** `original(sec)`, just like the added-delay mechanism. It never tests early return with unfinished asynchronous work. Add a genuine deferred completion control and prove the completion oracle waits or fails. |
| B03 | **Blocking** | `browser.mjs:293,305,377`; `scrub-drag.mjs:103,293,295,481`; `analysis/reveal-oracle-counterexample.json` | Reveal timeout is swallowed and New Game can pass at `phase='revealing', elapsedSec=0`; the source-level counterexample returns ok=true. Drag reveal-settled, reference-browse and idle-precondition timeouts are also swallowed. Fail closed/retain timeout outcomes whenever required completion/preconditions do not occur; demonstrate negative controls. |
| B04 | **Blocking** | `scrub-drag.mjs:53–68,313`; frozen expected loss imported at line 19 but never checked in this path | Prepared drag start accepts any positive loss; the drag oracle pins seed but not expected loss 6138. Validate exact loss and intended graphics/config/fixture identity before admitting prepared samples; retain pin failures. Matching observed rows do not prove a fail-closed pin. |
| B05 | **Blocking for the Node tail claim** | `run.mjs:47–65`; `statistics.mjs:97,121,148`; `wp4-node` | 120 sequential calls in one Node process get 120 synthetic `launchId`s and are automatically declared independent launches/tail-eligible. The module explicitly requires actual launch/session identities and caller evidence of independence. Preserve real process/session identity and label the tail diagnostic, or supply an appropriate independence/dependence design and re-prove it. Re-accepting the statistics module does not certify these labels. |
| B06 | **Blocking stability gap** | `PROOF_RUN.md:80`; `wp4-suites/raw-new-game.json`; `analysis/recomputed.json` | Desktop New Game drifts +29.4% over three sessions with cause unestablished. The skill requires investigation of this magnitude; labeling it alone is not a stability/resolution proof. Investigate with matched diagnostics and predeclare a valid comparison/reset policy, then recheck affected evidence. |
| N01 | Non-blocking factual mismatch | `PROOF_RUN.md:76`; `wp4-node/raw-forecast-window.json:4749` | Correct stated load maximum from 1.8 to 2.4. No SHA mismatch and no threshold breach. Auditor does not edit the Builder's report. |
| N02 | Non-blocking scope/evidence limits; full acceptance still requires a scope decision | `HARNESS.md` jobs; `analysis/recomputed.json` manifest availability | Browser unveil-after-death is uncovered. Node re-projection is compute-only and cannot establish browser input/reveal/worker/UI coverage. Real Pixel 6, OS/compositor/touchscreen latency, real GPU and thermal behavior are unmeasured. GC attribution unavailable. 53 historical screenshot hashes/four aggregate hashes cannot be checked here. Cam's questions above remain decisions; no decision is inferred. |
| N03 | Non-blocking, identity concern resolved for this reproduction | `analysis/audit-results.json`; `run-complete-pixi.js:130,160`; `consequential-time-pixi.js:6,10,23` | Ordinary and prepared semantic loss are both year 192 / second 6138, with identical config SHA `1b2b3da9f27484624dc345d153e674109cc1f787f4924202888481fb1b89764c`. The 2.2 s animated elapsed-time counter settles at 191 completed years; intermediate 92 does not break the seed/loss pins. The immediate ordinary screenshot here shows 30 while semantic loss is 192. Use authoritative metadata rather than a transient counter as identity evidence. |
| N04 | Non-blocking environment limitation | `artifacts/phase-a-audit-r1/preview{,-retry}.log` | Required `npm start` failed twice: ports 5184–5195 occupied, no preview for this checkout; Node then asserts UV_HANDLE_CLOSING (0xC0000409). Stopped without port debugging. No live mobile URL is available. The browser harness's temporary-port servers served the built assets and all requested reproductions completed. |
| N05 | Non-blocking oracle/portability limits | `scrub-drag.mjs:111–122,290–314`; `input-delay.mjs:109`; `identities.mjs:126` | The 'never-dragged' reference is browse-away/back **in the already dragged session**, comparing selected summaries/packets, not independent full state or all RNG streams. Narrow the claim or strengthen the reference. Include arrivedDuringStall in the A1-01 pass predicate (it was true in every reproduced row). Remove hardcoded Linux machine labeling for portable runs. |

**Judgment on the stated mobile limit:** acceptable as an honest diagnostic limitation, **blocking for technical acceptance of the current full Phase A contract** because the required deferred gate actually fails at its suite design. An operator scope/budget decision cannot by itself prove a broken validity control. New Game n=3 and scrub/drag tails remain INCONCLUSIVE; no P95 win or performance score is accepted.

## Cross-runtime handoff

For native N03/N04, reuse seed 424242, captured configuration, official tick/replay semantics and the separate opening/restore/input-to-visible workloads from HARNESS.md, not these browser timings or synthetic launch labels. Preserve mutable-state isolation and fail-closed completion/identity checks; distinguish a stream catching up from completing every offered position. The next native validation should compare semantic loss state/RNG at common checkpoints and time a real input→presented result while forecasting on the physical Pixel 6. The animated recap counter is presentation, not simulation time. No native executable or native performance evidence was produced.

## Evidence inventory

All audit screenshots/raw JSON are copied under `artifacts/phase-a-audit-r1/`; script-generated originals remain under `artifacts/perf-phase-a-20261116/audit-r1-{controls,a1-01,drag}/`. Small JSON is retained under `runs/audit-r1/{controls,a1-01,drag,analysis}/`. `runs/audit-r1/evidence-index.json` records every local evidence path, byte count and SHA-256. Screenshots stay local, per the requested JSON-only commit scope. The exhaustive local evidence links follow.

- [artifacts/phase-a-audit-r1/a1-01/a1-01-stalled-0.png](../../../artifacts/phase-a-audit-r1/a1-01/a1-01-stalled-0.png)
- [artifacts/phase-a-audit-r1/a1-01/a1-01-summary.json](../../../artifacts/phase-a-audit-r1/a1-01/a1-01-summary.json)
- [artifacts/phase-a-audit-r1/a1-01/a1-01-unstalled-0.png](../../../artifacts/phase-a-audit-r1/a1-01/a1-01-unstalled-0.png)
- [artifacts/phase-a-audit-r1/a1-01/raw-a1-01.json](../../../artifacts/phase-a-audit-r1/a1-01/raw-a1-01.json)
- [artifacts/phase-a-audit-r1/audit-results.json](../../../artifacts/phase-a-audit-r1/audit-results.json)
- [artifacts/phase-a-audit-r1/capture-hook.mjs](../../../artifacts/phase-a-audit-r1/capture-hook.mjs)
- [artifacts/phase-a-audit-r1/check-fixture.mjs](../../../artifacts/phase-a-audit-r1/check-fixture.mjs)
- [artifacts/phase-a-audit-r1/check-proof-text.mjs](../../../artifacts/phase-a-audit-r1/check-proof-text.mjs)
- [artifacts/phase-a-audit-r1/construction-recomputed.json](../../../artifacts/phase-a-audit-r1/construction-recomputed.json)
- [artifacts/phase-a-audit-r1/controls/controls/controls.json](../../../artifacts/phase-a-audit-r1/controls/controls/controls.json)
- [artifacts/phase-a-audit-r1/controls/controls/ctrl-ng-positive-new-game-finished.png](../../../artifacts/phase-a-audit-r1/controls/controls/ctrl-ng-positive-new-game-finished.png)
- [artifacts/phase-a-audit-r1/controls/controls/raw-ctrl-ng-positive.json](../../../artifacts/phase-a-audit-r1/controls/controls/raw-ctrl-ng-positive.json)
- [artifacts/phase-a-audit-r1/controls/controls/raw-ctrl-scrub.json](../../../artifacts/phase-a-audit-r1/controls/controls/raw-ctrl-scrub.json)
- [artifacts/phase-a-audit-r1/controls/controls/raw-forecast-controls.json](../../../artifacts/phase-a-audit-r1/controls/controls/raw-forecast-controls.json)
- [artifacts/phase-a-audit-r1/controls/controls-summary.json](../../../artifacts/phase-a-audit-r1/controls/controls-summary.json)
- [artifacts/phase-a-audit-r1/controls/identities.json](../../../artifacts/phase-a-audit-r1/controls/identities.json)
- [artifacts/phase-a-audit-r1/controls/PROOF_SUMMARY.json](../../../artifacts/phase-a-audit-r1/controls/PROOF_SUMMARY.json)
- [artifacts/phase-a-audit-r1/controls.log](../../../artifacts/phase-a-audit-r1/controls.log)
- [artifacts/phase-a-audit-r1/drag/prepared-desktop-after-settle.png](../../../artifacts/phase-a-audit-r1/drag/prepared-desktop-after-settle.png)
- [artifacts/phase-a-audit-r1/drag/prepared-desktop-mid-drag.png](../../../artifacts/phase-a-audit-r1/drag/prepared-desktop-mid-drag.png)
- [artifacts/phase-a-audit-r1/drag/prepared-desktop-playing-before-drag.png](../../../artifacts/phase-a-audit-r1/drag/prepared-desktop-playing-before-drag.png)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r0.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r0.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r1.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r1.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r2.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r2.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r3.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r3.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r4.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A1-r4.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r0.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r0.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r1.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r1.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r2.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r2.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r3.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r3.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r4.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-A2-r4.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r0.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r0.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r1.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r1.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r2.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r2.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r3.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r3.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r4.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-deferred-r4.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r0.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r0.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r1.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r1.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r2.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r2.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r3.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r3.json)
- [artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r4.json](../../../artifacts/phase-a-audit-r1/drag/raw-drag-prepared-desktop-delay-r4.json)
- [artifacts/phase-a-audit-r1/drag/scrub-drag-repeat-summary.json](../../../artifacts/phase-a-audit-r1/drag/scrub-drag-repeat-summary.json)
- [artifacts/phase-a-audit-r1/drag-00-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-00-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-00-baseline.png](../../../artifacts/phase-a-audit-r1/drag-00-baseline.png)
- [artifacts/phase-a-audit-r1/drag-01-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-01-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-01-baseline.png](../../../artifacts/phase-a-audit-r1/drag-01-baseline.png)
- [artifacts/phase-a-audit-r1/drag-02-delay-identity.json](../../../artifacts/phase-a-audit-r1/drag-02-delay-identity.json)
- [artifacts/phase-a-audit-r1/drag-02-delay.png](../../../artifacts/phase-a-audit-r1/drag-02-delay.png)
- [artifacts/phase-a-audit-r1/drag-03-deferred-identity.json](../../../artifacts/phase-a-audit-r1/drag-03-deferred-identity.json)
- [artifacts/phase-a-audit-r1/drag-03-deferred.png](../../../artifacts/phase-a-audit-r1/drag-03-deferred.png)
- [artifacts/phase-a-audit-r1/drag-04-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-04-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-04-baseline.png](../../../artifacts/phase-a-audit-r1/drag-04-baseline.png)
- [artifacts/phase-a-audit-r1/drag-05-delay-identity.json](../../../artifacts/phase-a-audit-r1/drag-05-delay-identity.json)
- [artifacts/phase-a-audit-r1/drag-05-delay.png](../../../artifacts/phase-a-audit-r1/drag-05-delay.png)
- [artifacts/phase-a-audit-r1/drag-06-deferred-identity.json](../../../artifacts/phase-a-audit-r1/drag-06-deferred-identity.json)
- [artifacts/phase-a-audit-r1/drag-06-deferred.png](../../../artifacts/phase-a-audit-r1/drag-06-deferred.png)
- [artifacts/phase-a-audit-r1/drag-07-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-07-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-07-baseline.png](../../../artifacts/phase-a-audit-r1/drag-07-baseline.png)
- [artifacts/phase-a-audit-r1/drag-08-delay-identity.json](../../../artifacts/phase-a-audit-r1/drag-08-delay-identity.json)
- [artifacts/phase-a-audit-r1/drag-08-delay.png](../../../artifacts/phase-a-audit-r1/drag-08-delay.png)
- [artifacts/phase-a-audit-r1/drag-09-deferred-identity.json](../../../artifacts/phase-a-audit-r1/drag-09-deferred-identity.json)
- [artifacts/phase-a-audit-r1/drag-09-deferred.png](../../../artifacts/phase-a-audit-r1/drag-09-deferred.png)
- [artifacts/phase-a-audit-r1/drag-10-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-10-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-10-baseline.png](../../../artifacts/phase-a-audit-r1/drag-10-baseline.png)
- [artifacts/phase-a-audit-r1/drag-11-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-11-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-11-baseline.png](../../../artifacts/phase-a-audit-r1/drag-11-baseline.png)
- [artifacts/phase-a-audit-r1/drag-12-deferred-identity.json](../../../artifacts/phase-a-audit-r1/drag-12-deferred-identity.json)
- [artifacts/phase-a-audit-r1/drag-12-deferred.png](../../../artifacts/phase-a-audit-r1/drag-12-deferred.png)
- [artifacts/phase-a-audit-r1/drag-13-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-13-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-13-baseline.png](../../../artifacts/phase-a-audit-r1/drag-13-baseline.png)
- [artifacts/phase-a-audit-r1/drag-14-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-14-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-14-baseline.png](../../../artifacts/phase-a-audit-r1/drag-14-baseline.png)
- [artifacts/phase-a-audit-r1/drag-15-delay-identity.json](../../../artifacts/phase-a-audit-r1/drag-15-delay-identity.json)
- [artifacts/phase-a-audit-r1/drag-15-delay.png](../../../artifacts/phase-a-audit-r1/drag-15-delay.png)
- [artifacts/phase-a-audit-r1/drag-16-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-16-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-16-baseline.png](../../../artifacts/phase-a-audit-r1/drag-16-baseline.png)
- [artifacts/phase-a-audit-r1/drag-17-baseline-identity.json](../../../artifacts/phase-a-audit-r1/drag-17-baseline-identity.json)
- [artifacts/phase-a-audit-r1/drag-17-baseline.png](../../../artifacts/phase-a-audit-r1/drag-17-baseline.png)
- [artifacts/phase-a-audit-r1/drag-18-delay-identity.json](../../../artifacts/phase-a-audit-r1/drag-18-delay-identity.json)
- [artifacts/phase-a-audit-r1/drag-18-delay.png](../../../artifacts/phase-a-audit-r1/drag-18-delay.png)
- [artifacts/phase-a-audit-r1/drag-19-deferred-identity.json](../../../artifacts/phase-a-audit-r1/drag-19-deferred-identity.json)
- [artifacts/phase-a-audit-r1/drag-19-deferred.png](../../../artifacts/phase-a-audit-r1/drag-19-deferred.png)
- [artifacts/phase-a-audit-r1/finalize-evidence.mjs](../../../artifacts/phase-a-audit-r1/finalize-evidence.mjs)
- [artifacts/phase-a-audit-r1/input-delay.log](../../../artifacts/phase-a-audit-r1/input-delay.log)
- [artifacts/phase-a-audit-r1/oracle-counterexample.mjs](../../../artifacts/phase-a-audit-r1/oracle-counterexample.mjs)
- [artifacts/phase-a-audit-r1/package-evidence.mjs](../../../artifacts/phase-a-audit-r1/package-evidence.mjs)
- [artifacts/phase-a-audit-r1/prepared-baked-identity.json](../../../artifacts/phase-a-audit-r1/prepared-baked-identity.json)
- [artifacts/phase-a-audit-r1/preview-retry.log](../../../artifacts/phase-a-audit-r1/preview-retry.log)
- [artifacts/phase-a-audit-r1/preview.log](../../../artifacts/phase-a-audit-r1/preview.log)
- [artifacts/phase-a-audit-r1/proof-text-checks.json](../../../artifacts/phase-a-audit-r1/proof-text-checks.json)
- [artifacts/phase-a-audit-r1/recompute-construction.mjs](../../../artifacts/phase-a-audit-r1/recompute-construction.mjs)
- [artifacts/phase-a-audit-r1/recompute.mjs](../../../artifacts/phase-a-audit-r1/recompute.mjs)
- [artifacts/phase-a-audit-r1/recomputed.json](../../../artifacts/phase-a-audit-r1/recomputed.json)
- [artifacts/phase-a-audit-r1/record-mismatch.mjs](../../../artifacts/phase-a-audit-r1/record-mismatch.mjs)
- [artifacts/phase-a-audit-r1/reveal-oracle-counterexample.json](../../../artifacts/phase-a-audit-r1/reveal-oracle-counterexample.json)
- [artifacts/phase-a-audit-r1/scrub-deferred-identity.json](../../../artifacts/phase-a-audit-r1/scrub-deferred-identity.json)
- [artifacts/phase-a-audit-r1/scrub-deferred.png](../../../artifacts/phase-a-audit-r1/scrub-deferred.png)
- [artifacts/phase-a-audit-r1/scrub-delay-identity.json](../../../artifacts/phase-a-audit-r1/scrub-delay-identity.json)
- [artifacts/phase-a-audit-r1/scrub-delay.png](../../../artifacts/phase-a-audit-r1/scrub-delay.png)
- [artifacts/phase-a-audit-r1/scrub-drag.log](../../../artifacts/phase-a-audit-r1/scrub-drag.log)
- [artifacts/phase-a-audit-r1/scrub-positive-6-identity.json](../../../artifacts/phase-a-audit-r1/scrub-positive-6-identity.json)
- [artifacts/phase-a-audit-r1/scrub-positive-6.png](../../../artifacts/phase-a-audit-r1/scrub-positive-6.png)
- [artifacts/phase-a-audit-r1/scrub-positive-8-identity.json](../../../artifacts/phase-a-audit-r1/scrub-positive-8-identity.json)
- [artifacts/phase-a-audit-r1/scrub-positive-8.png](../../../artifacts/phase-a-audit-r1/scrub-positive-8.png)
- [artifacts/phase-a-audit-r1/scrub-wrong-identity.json](../../../artifacts/phase-a-audit-r1/scrub-wrong-identity.json)
- [artifacts/phase-a-audit-r1/scrub-wrong.png](../../../artifacts/phase-a-audit-r1/scrub-wrong.png)

JSON committed for review:

- [docs/performance/phase-a-20261116/runs/audit-r1/a1-01/a1-01-summary.json](runs/audit-r1/a1-01/a1-01-summary.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/a1-01/MANIFEST.json](runs/audit-r1/a1-01/MANIFEST.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/a1-01/raw-a1-01.json](runs/audit-r1/a1-01/raw-a1-01.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/audit-results.json](runs/audit-r1/analysis/audit-results.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/construction-recomputed.json](runs/audit-r1/analysis/construction-recomputed.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-00-baseline-identity.json](runs/audit-r1/analysis/drag-00-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-01-baseline-identity.json](runs/audit-r1/analysis/drag-01-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-02-delay-identity.json](runs/audit-r1/analysis/drag-02-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-03-deferred-identity.json](runs/audit-r1/analysis/drag-03-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-04-baseline-identity.json](runs/audit-r1/analysis/drag-04-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-05-delay-identity.json](runs/audit-r1/analysis/drag-05-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-06-deferred-identity.json](runs/audit-r1/analysis/drag-06-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-07-baseline-identity.json](runs/audit-r1/analysis/drag-07-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-08-delay-identity.json](runs/audit-r1/analysis/drag-08-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-09-deferred-identity.json](runs/audit-r1/analysis/drag-09-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-10-baseline-identity.json](runs/audit-r1/analysis/drag-10-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-11-baseline-identity.json](runs/audit-r1/analysis/drag-11-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-12-deferred-identity.json](runs/audit-r1/analysis/drag-12-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-13-baseline-identity.json](runs/audit-r1/analysis/drag-13-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-14-baseline-identity.json](runs/audit-r1/analysis/drag-14-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-15-delay-identity.json](runs/audit-r1/analysis/drag-15-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-16-baseline-identity.json](runs/audit-r1/analysis/drag-16-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-17-baseline-identity.json](runs/audit-r1/analysis/drag-17-baseline-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-18-delay-identity.json](runs/audit-r1/analysis/drag-18-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/drag-19-deferred-identity.json](runs/audit-r1/analysis/drag-19-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/prepared-baked-identity.json](runs/audit-r1/analysis/prepared-baked-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/proof-text-checks.json](runs/audit-r1/analysis/proof-text-checks.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/recomputed.json](runs/audit-r1/analysis/recomputed.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/reveal-oracle-counterexample.json](runs/audit-r1/analysis/reveal-oracle-counterexample.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/scrub-deferred-identity.json](runs/audit-r1/analysis/scrub-deferred-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/scrub-delay-identity.json](runs/audit-r1/analysis/scrub-delay-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/scrub-positive-6-identity.json](runs/audit-r1/analysis/scrub-positive-6-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/scrub-positive-8-identity.json](runs/audit-r1/analysis/scrub-positive-8-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/analysis/scrub-wrong-identity.json](runs/audit-r1/analysis/scrub-wrong-identity.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/controls/controls.json](runs/audit-r1/controls/controls/controls.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/controls/raw-ctrl-ng-positive.json](runs/audit-r1/controls/controls/raw-ctrl-ng-positive.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/controls/raw-ctrl-scrub.json](runs/audit-r1/controls/controls/raw-ctrl-scrub.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/controls/raw-forecast-controls.json](runs/audit-r1/controls/controls/raw-forecast-controls.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/controls-summary.json](runs/audit-r1/controls/controls-summary.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/identities.json](runs/audit-r1/controls/identities.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/MANIFEST.json](runs/audit-r1/controls/MANIFEST.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/controls/PROOF_SUMMARY.json](runs/audit-r1/controls/PROOF_SUMMARY.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/MANIFEST.json](runs/audit-r1/drag/MANIFEST.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r0.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r0.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r1.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r1.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r2.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r2.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r3.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r3.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r4.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A1-r4.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r0.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r0.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r1.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r1.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r2.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r2.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r3.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r3.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r4.json](runs/audit-r1/drag/raw-drag-prepared-desktop-A2-r4.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r0.json](runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r0.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r1.json](runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r1.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r2.json](runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r2.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r3.json](runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r3.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r4.json](runs/audit-r1/drag/raw-drag-prepared-desktop-deferred-r4.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r0.json](runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r0.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r1.json](runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r1.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r2.json](runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r2.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r3.json](runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r3.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r4.json](runs/audit-r1/drag/raw-drag-prepared-desktop-delay-r4.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/drag/scrub-drag-repeat-summary.json](runs/audit-r1/drag/scrub-drag-repeat-summary.json)
- [docs/performance/phase-a-20261116/runs/audit-r1/evidence-index.json](runs/audit-r1/evidence-index.json)

Audit work stopped after writing and pushing this review; no recheck or continuation is queued.
