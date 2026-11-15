# Full retained-preview inspection construction

Harness Builder, Codex gpt-6.1-sol / xhigh, 2026-11-05. **Phase A remains NOT SOUND.** This is a scoped implementation/proof handoff, not independent acceptance, a score, an optimization or a performance gain. No delegates, commits, pushes, PRs, deployments, bots or webhooks. Only the authorized shared worktree/branch is used; all pre-existing dirty work is preserved.

## Impact analysis recorded before implementation

The opt-in runner inspector serializes only the already retained private cursor and drag-preview objects. It does not call the knowledge-merging `getState`/`getCursorState`, restore/rebuild, graph/cache getters, worker synchronization, rendering, time advance or invalidation. Simulation rules, every official 60-tick second, RNG helpers/substreams, JSON schemas, replay, five Practice slots, opening readiness, reveal pacing/clamps and existing DTOv2 are unchanged. Views only publish the explicit diagnostic callback; the model has no new view imports. The existing save serializer works on its own JSON copy; a separate `rawJson` string retains runtime-only fields to make that difference reviewable.

`runner.inspectRetainedStates()` / `__SETTLEMENT_DEBUG__.inspectRetainedStates()` returns version1, independent `{rawJson,stateData}` cursor/preview records, raw frontier second, a strict `cursorIsFrontier` flag and a copied retained timeline knowledge object. A missing preview is null. A historical cursor is explicitly not claimed to be the frontier; the inspector does not reconstruct an unavailable frontier. It exports no mutable installed pointer and adds no production mutation API or per-frame work.

Tests: focused frozen-seed16/17 state-restorer/controller/runner mutation and purity controls; actual browser input/reveal/full serialized equality and isolated real-preview mutation/restoration controls; existing passive observability, timegraph invariants and full `npm run verify`. Full-state work is outside all latency/frame/memory observation windows. The standalone browser diagnostic publishes no timing/frame/memory acceptance results.

## Frozen expectations and controls

Manifest pin `406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000`, SDK SHA256 `8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0`, under `artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/`. The loader verifies the complete frozen files/source/SDK. Expected16/17 states come only from its SDK's authoritative rebuild. Expected retained frontier pause uses the independently frozen SDK pause derivation. Terminal survival knowledge comes only from the frozen official-second simulation, applied only after the actual passive current signature/token/frontier and terminal coverage observation. Actual serialized/raw state is never normalized or repaired. Immutable input, expected replay/UI state and raw actual output have separate artifacts.

Focused checks reject wrong known fields, extra fields, RNG and targets; mutate actual installed nested state/RNG through held test pointers; then restore both target and other previews through the real codec/controller. Serialized anchors, raw authoritative cursor/timeline and RNG stay unchanged. A deliberately stale preview knowledge value remains stale under inspection; calling the ordinary getter proves the real pending-merge control. Frozen installed state and unchanged raw bytes/function identities check purity.

Actual product controls rewrite only an isolated app response. The exact original/replacement inspector/restore text, original/mutant hashes, whole mutant bundle, original/mutant raw installed preview and restore-source bytes are retained. The control requires a named token/context and exact installed target, mutates only a nested preview knowledge entry and one preview RNG stream once, then revisits the other target and original target using trusted UI input. No frozen config is mutated. Copied-response isolation is separately labelled and does not substitute for this test. Controlled contexts are comparison-ineligible and close after the test.

## Construction failures retained

- Focused r1: resetToState supplies an unpaused state, but the initial test expected a paused UI frontier. Output was initially too verbose and is documented as a runner-fixture setup error; subsequent versions capture full errors to files and print only a short failure/path. The product seam did not change.
- Focused r2: manually inserted projection anchors did not establish forecast coverage, so controller restoration correctly returned null. Full failure: `artifacts/perf-hillclimb/preview-focused-r2-20261105/failure.json`.
- Focused r3: freezing the timeline across later controller operations prevented the controller's legitimate `_actionSecondsVersion` cache write. Full failure: `artifacts/perf-hillclimb/preview-focused-r3-20261105/failure.json`. The inspector itself did not write it. Restrict frozen-state purity to the inspected preview; retain raw cursor/timeline byte checks around inspection and mutation.
- Focused r4 PASS6 seed/target cells, all3 seeds, actual installed mutations through restorer and graph-controller paths; `artifacts/perf-hillclimb/preview-focused-r4-20261105/results.json`.

Final commands, source/build/fixture identities, costs, macro checks, preview identity, limitations and process cleanup follow below after execution. Earlier parent app identities remain historical and are not relabelled as current proof.

## Reproduction and verified checks

From the authorized checkout, execute sequentially with fresh output IDs:

```powershell
node scripts/preview-state-inspection-test.mjs artifacts/perf-hillclimb/<NEW-focused-id>
npm run verify
npm run build
node scripts/perf-hillclimb/preview-state-browser.mjs --id=<NEW-browser-id>
npm start
```

Focused final run `preview-focused-r6-20261105` PASS6 all-seed/target cells, including simultaneous already-returned sibling previews, no-Map-access inspection guard, null-preview, historical-cursor and stale-knowledge controls. Its `source-hashes.json` and exact source copies identify the final focused mechanism. r5 also PASS6 before the additional sibling/immutable-output-directory tests; do not substitute it for r6's exact source.

Full `npm run verify` exited0: `artifacts/perf-hillclimb/preview-verify-r1-20261105.log`. This includes architecture/reachability/assets/build, timegraph invariants, passive DTOv2/projection tests, saves, full-map/gameplay, JSON continuation and authoritative replay suites. The custom focused test is run explicitly, not added to root-owned package scripts. A subsequent build refresh is in `preview-build-r2-20261105.log`; the only post-verify edit at that point strengthened the standalone focused test, not app source. No other source/API/harness edit was reverted.

Retained separate discovery populations:

- `preview-browser-r1-20261105`: PASS4, seed123 ordinary opening fixture, cold regular Continue, desktop/mobile4,16/17, original served app. Built fingerprint `c17c103f4e7b`; initial helper revision. Copy-mutation reads were outside all observation windows but their individual costs were not recorded in this initial revision. This cost omission is repaired in r2, not retrospectively relabelled.
- `preview-control-r1-20261105`: PASS2, seed123 selected-vassal fixture, desktop16/17. Real response-only installed-preview fault rejected; both real-input restores passed, exact cached source and authoritative state unchanged. Distinct comparison-ineligible population.
- `preview-browser-r2-20261105`: planned20-cell matrix. All12 selected-vassal regular Continue checks PASS (all3 seeds × desktop/mobile4 ×16/17). Performance New16 then FAILS after180000ms because the script sent the first drag during the five-second opening **input lock**. Raw failure shows viewed/latched3918, completed opening and no app error; it does not show slow valid target input. The following desktop16 actual mutation control PASS. The run was deliberately interrupted during Performance New17 to avoid repeating the known-invalid binding. `INTERRUPTED.json` records exact cancellation/process scope;14 completed rows remain13PASS/1FAIL, with6 scheduled cells unfinished/unexecuted. Those cells are not passes. No failed bytes or earlier identities were overwritten.
- `preview-browser-r3-20261105`: separate repaired8-cell Performance New/control schedule. **All8 functional cells PASS, but the process exits1 at its final provenance gate.** Root-owned, non-executed `run.mjs` changed during the schedule. The app and diagnostic executable sources stayed byte-identical; the standalone diagnostic does not import/execute `run.mjs`. The gate failure is retained, not waived or relabelled as a clean fixed-source suite. Performance New waits for natural full opening completion, then sends real input; it is a completed-opening browse, explicitly distinct from active-reveal J5. Regular Continue/controls retain the active natural-reveal requirement. No product input lock, opening policy, reveal pacing, target, timeout or expected state was changed.

Each cell has a fresh Chromium process/context, explicit SwiftShader, cold entry, and no competing owned build/test/browser workload. Mobile4 uses844×390 and4× CPU throttle on desktop hardware; desktop uses1280×800. No physical Pixel6 proof. The completed selected-vassal cases and repaired Performance/control cases retain their **different harness revisions**, not one complete consecutive suite.

The diagnostic scrubs use a fixed six-move trusted mouse/touch drag and passive retained geometry. Target membership is observed without restoring/warming that actual target. Current signature/token/history correspondence, unchanged authoritative frontier/revision/action count and reveal-cap compliance are checked. Regular Continue and controls additionally require active natural reveal at trusted pointerdown and advancing reveal. Repaired Performance New instead requires normal completed opening before input, as the product forbids interaction during that opening. Controls alone then re-browse both targets after the initial input is complete. Those post-input revisits are explicitly distinct from the initial unprimed browse and never latency samples.

Every r2 expensive read has browser `startMs/endMs`, reader CPU duration and host RPC duration in `results.json`; the pair of copy-isolation reads additionally has its grouped CPU/host duration. Host duration excludes the subsequent artifact file write. All standalone sessions are correctness diagnostics with no latency/frame/memory acceptance arrays. Initial r1 single-read costs (about16–17ms browser CPU /573–636ms host on desktop) do not quantify all observer overhead. Controlled response serialization/capture overhead remains a separate population. Accepted instrumentation/reference timings still require parent-owned matched A/A and native corroboration.

## Exact source and built identity

The r2/r3 `manifest.json` files record exact source SHA256, byte snapshots, fixture pins, generated packet digest, runtime, schedules, build metadata and HTTP-verified asset digests. R2 was interrupted and did not reach its final source recheck. R3's final all-source gate fails on root-owned `run.mjs`; the final handoff separately rechecks every tracked file and confirms that this is the only mismatch, preserving that failed gate. R3's browser helper is a new revision; the product source remains identical. The three product files are:

| File | SHA256 |
| --- | --- |
| `src/controllers/sim-runner.js` | `a15dc72c7697406b1edb7ecc8b6e3c6ac0e87325cade0dcd3fbe65798b4be8db` |
| `src/views/ui-root/settlement-debug-api.js` | `4c948784ab3998b2a77853f707b22726a9f621972db02030b99772b364cb1ddd` |
| `src/views/ui-root-settlement-pixi.js` | `19ed00c3ce1a74015776af7caec1287c4f6a031172733550f6362c8ab63326d4` |

Built artifact fingerprint `985e049cc6ae`, v1.1.52, branch `perf/hillclimb-20261104`, revision `a9df52cbd625`, dirty/unintegrated, preview true/label null, artifact channel `pages` but **unpublished**. App `app-XYOFGS5O.js` SHA256 `b99357d9bd33c41a43ebabe54109687f394450163e060479321681ea4c0f752f`; forecast worker `timegraph-forecast-worker-YOB3XRD7.js` SHA256 `32ad63db17606f16d17583fb299764adc5e7fa51d59be8369ba2b808c171c58a`; save/load worker SHA256 `15567845726ea874758859dc9d826f752a477a6e7208a36614e225ebbea13fb5`. The app changed from the parent's earlier `app-CLB6GCI6.js`; previous observations retain their original identities.

Root-owned `run.mjs` was SHA256 `92092d0c2c353658c9f7af9a2ae739f19187aa64e475927a11e8b05991c46733` in r2, `61c7e2edcb2517b33efcc3f3bcf926c0e5af16eab301718fa88c5481fc6f3013` at r3 start, and `0b124b6156c5c0853bc112e0fe17955a220a0e02de751e25a92228b54a9667b2` at handoff. Its observed last write was03:56:14 Sydney time. **This Builder never edited or reverted it.** All versions already captured remain separate; the current bytes are copied to the final handoff. Browser-runtime/main-job/save-state-oracle hashes remain unchanged in the tracked source checks. Existing DTOv2 behavior/source is not changed.

## Explicit integration handoff and limitations

Parent owns the integration: add the new expensive inspection to J5/J6's post-clock correctness windows in `run.mjs`, retaining original raw actual bytes separately and reporting read/transfer/window costs. `preview-state-oracle.mjs` provides frozen expected derivation and strict field/RNG assertions. The parent must retain the proven current-source terminal-knowledge trigger and distinguish historical cursors from retained frontiers. The standalone selected fixture corresponds to existing J5's selected-vassal fixture; the ordinary Performance New path uses frozen seed123 opening data. No root-owned binding/runtime/statistics/J8/HARNESS/PROOF_RUN/STATE/COVERAGE/ATTEMPTS file was edited.

Still open: independent review of this seam/controls and the full frozen loader/harness, direct committed-history J6 preview equality/isolation and stale-commit fault, wider histories, illustrated/progressive/warm populations, observer on/off/private-hook A/A, first-feedback/native corroboration, physical device work, three complete consecutive eight-job suites and adequate independent tail populations. This matrix cannot close those gaps. No app policy/gameplay/cache/reveal optimization or performance gain is claimed. **Whole Phase A remains NOT SOUND.**

## Final results and cost limits

`artifacts/perf-hillclimb/preview-final-handoff-20261105/summary.json` is the concrete machine-readable handoff. It retains20 required functional coverage cells across r2/r3 (12 all-seed regular Continue,4 completed-opening Performance New,4 actual installed-preview controls), plus the earlier distinct r1/control discovery runs. This is not one clean complete fixed-source or eight-job suite. R2's binding failure/interruption and r3's provenance failure both remain blockers to that description. No root-owned state/proof file is updated here.

The final4 actual controls each reject the real installed nested/RNG mutation, preserve original/mutant raw bytes, preserve exact real cached source bytes, preserve authoritative raw cursor/timeline knowledge and restore both the other target and original target through trusted input. The positive actual full serialized preview/frontier comparisons include every field and RNG; immutable inputs are kept separate and unchanged.

Observed opt-in cost ranges are diagnostic only: original single-reader CPU11.8–96.2ms, host RPC586.6–1339.5ms; controlled single-reader CPU28.8–166.4ms before faults, with separately retained mutation/revisit costs. Exact browser windows and host durations stay in each row, grouped two-read copy-isolation costs stay separate, and controlled responses are never mixed into reference populations. The final control-evidence export and artifact file-write costs are not individually quantified; the entire standalone session is outside all acceptance latency/frame/memory observations. These data establish no neutral asynchronous overhead or product performance improvement.

Retention limit: focused r1's uncaught assertion output was truncated and its full raw failure/source hash was not captured. `preview-focused-r1-20261105/failure-note.json` states the exact observed pause/phase difference and this missing evidence; no reconstructed bytes are presented as original proof. Later focused failures retain full diagnostic files and final r6 retains exact source snapshots/hashes.

Local preview identity and final process/check evidence are recorded in `preview-final-handoff-20261105/preview.json`, `npm-start.log`, `final-checks.log` and `processes.json`. These are created after this document is finalized so the preview fingerprint includes the final handoff text. Only the inherited idle source preview5184 is retained; all owned browser/static-server/test processes are closed and the exclusive slot is released. No commit/push/PR/deploy/contact occurred. Parent retains integration and independent acceptance.
