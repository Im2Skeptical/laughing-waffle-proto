# J8 fixed-batch admission review

**SCOPED J8 ORCHESTRATION ADMISSION: ACCEPTED BY SOURCE INSPECTION AT THE REVISED IDENTITY BELOW. Whole Phase A remains NOT SOUND.** Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh, independent of the parent Implementer. Parent retains the sole runtime/source slot for the mapped Continue coverage. No test, syntax check, build, browser, process probe or source edit was performed by this Auditor. Only this review was written. The initial findings and their repair/recheck are preserved below; no J8 runtime result is implied.

Inspected staged file in the preserved performance checkout:

`artifacts/perf-hillclimb/j8-optional-abba-r1-20261115/resume.mjs`

Raw SHA-256: `af5fa3de4ade780b89bfb33496f831c4de0223a81874dd3d13fc77e4f2367982`. At inspection there was no J8 plan, result or leaf run.

## Initial findings at snapshot A

**B1 — distinguish ordinary runner failure from infrastructure termination.** The current `identityVerified` path does not check the child's exit/signal or consistency among exit, `manifest.failed` and `summary.ok`. A native termination after files were flushed could leave coherent-looking identity/cleanup records and allow another cell. That must remain an infrastructure finding, not silently become an ordinary readiness failure.

Before marking a cell eligible for continuation, require a normal exit **0 or 1**, no terminating signal, and matching final statuses: exit0 → `manifest.failed:false`, `summary.ok:true`; exit1 → `manifest.failed:true`, `summary.ok:false`. Require one requested reference case. A successful exit additionally needs exactly one completed successful reference case; an ordinary failed exit must retain its original named failed stage/receipt. Keep these checks in a recorded status/identity gate so its failure prevents the next invocation, rather than merely printing a warning. No runner timing/oracle change is required.

**B2 — bind declared/served build identities to the frozen authority.** The current outer gate pins app original/served-variant hashes and prepared gzip identity, but does not compare the leaf's full `build`/`buildId`, contract hash or served worker/save-worker/stylesheet hashes with the fixed plan. The source/asset inventory hashes the five named asset files; it does not itself pin `dist/build-manifest.json`. If that manifest were replaced while old hashed assets remained, relying only on the current outer checks would leave an avoidable identity gap.

Require the leaf build object and build ID to match the pinned authority's build, its measurement-contract hash to match the frozen HARNESS bytes, and all `manifest.servedAssets` entries to match the plan's five assets (`bundle`, `worker`, `saveLoadWorker`, `stylesheet`, prepared gzip). Keep the same app variant verification. The inner artwork runner already records and verifies those served hashes, so this is a small orchestration assertion using existing evidence, not new instrumentation.

**B3 — do not infer drained work solely from closed browser flags.** Current cleanup admission checks context/browser closure and error arrays but ignores the existing `cleanup.lifetime.unconfirmedWork` receipt. Require that explicit array to be present and empty for the next cell; retain cancelled/completed status and original errors separately. Closing a browser is useful resource evidence, but does not independently certify every guarded host task settled. No product or fault-control change is needed.

These findings were sent promptly to the parent. They concern admission bookkeeping for this staged wrapper; no claim is made that an actual J8 run has encountered any of them.

## Correctly preserved assumptions

- The fixed four cells are ON / OFF / OFF / ON with the exact distinct IDs from `J8_ATTRIBUTION_BRIEF.md`; each invocation admits at most one next cell. There is no result-dependent replacement or extra sample.
- First admission requires twelve successful mapped remainder results with config validation and cleanup, and pins those results alongside the original frozen source/asset authority. Parent must actually release that runtime slot first; a completed results file alone cannot prove whole-host absence of other work.
- All cells retain reference case, mobile4, seed123 prepared packet, five cycles in each of two existing navigation blocks, private publication trace, original 240000 ms readiness/gate limits and a 600000 ms enclosing case cap. The optional instrumentation flag is the sole planned factor.
- The generated served variant is precomputed using the actual fixed bundle with private trace enabled and no fault API; per-leaf verification retains original/served hash, trace flag and absent fault API. Gzip bytes remain pinned and the inner runner validates its seed/state/terminal against the frozen authority.
- Source/contract and all named assets are checked before/between/after; driver/authority/remainder hashes are checked on each invocation. Existing leaf IDs and noncontiguous prior results reject, preserving interrupted evidence.
- Ordinary readiness/case failures with verified identity and clean resources should remain in the fixed ledger and permit later predeclared cells. Identity, abnormal process status, missing evidence or incomplete cleanup should stop admission. A whole-case cap is a failed/incomplete case and makes the diagnostic inconclusive; it is not successful shortened work.
- Both optional OFF cells retain HC clocks, feedback, asset-load wrapper, ready-seal/input/console witnesses, private Set/Map publication/drawing checks and all endpoint/state/context oracles. The optional intervals that disappear stay unavailable; the batch cannot establish complete observer/native neutrality.
- Start/stop gates reserve budget before the final confirmation window; they never grant permission to run beyond Cam's five-hour ceiling. The original native crash remains unresolved and separate from these J8 cells.

## Recheck and handoff

After the three wrapper-only repairs, record the new staged-driver hash and recheck source before first admission. Parent may perform its own syntax check, then run the first fixed ON cell after mapped coverage finishes. This review requests no app/harness executable/HARNESS change, no whole-suite repeat, no physical-pixel work and no extra samples.

Any resulting cell outcome must retain the original failure stage, raw nullable `artPrepared` values, actual preparation/feedback bounds, common-hook costs and cleanup. No native-cause, product performance, tail, full-neutrality or full Phase A conclusion follows from this source-only admission review.

## Wrapper repair recheck — snapshot B

Revised driver raw SHA-256: **`062fea08cc12e3093b64b6c02eef201cd91272f6d3e801942fb1ce48db95ac82`**. Read-only recheck found only the staged wrapper file in its directory: no generated plan, results or J8 leaf existed. Parent's mapped Continue coverage still owned runtime; this Auditor performed no execution or syntax check.

**B1 closed by source inspection.** Before `identityVerified` becomes true, the revised code requires exit0/1, a null signal, matching `manifest.failed` and `summary.ok`, one requested case, and on exit0 exactly one completed successful reference result. Abnormal native status or inconsistent final evidence leaves `identityVerified:false`, is retained with the identity error, returns a nonzero wrapper status and blocks admission on the next invocation. A normal runner failure with valid identity and clean resources remains a recorded fixed-batch outcome and does not erase later predeclared cells.

**B2 closed by source inspection.** Plan creation asserts the actual `dist/build-manifest.json` object equals the inherited authority and pins the file's raw bytes; each stable check rechecks those bytes. Leaf admission compares the full build/build ID, measurement-contract hash and recorded source-file subset with the authority. It verifies all five actual served hashes (app, forecast worker, save worker, stylesheet, prepared gzip), as well as the existing original/served private-trace app variant, no-fault API and seed123 prepared-packet identity. I checked the existing artwork manifest source and a retained representative manifest to confirm the actual field shapes/names match these assertions. No alternate loader path, source instrumentation or timing mechanism was introduced.

**B3 closed by source inspection.** Cleanup admission now requires `lifetime.unconfirmedWork` to be an explicit array of length zero, alongside context/browser closure, disconnected browser and zero cleanup errors. The full cleanup receipt remains in the result, preserving lifetime status/reason separately. Missing or nonempty drain evidence blocks a following invocation.

The original ABBA cells, argv, source/asset freeze, singleton-per-invocation behavior, six-hundred-second case cap, budget gates and interpretation are unchanged. No unresolved blocker remains in this narrowly reviewed orchestration wrapper.

**Admission remains conditional on its existing runtime preconditions:** all twelve mapped remainder cells must actually finish with validated config and closure, the parent must release that execution slot, the source/build authority must still match, and the remaining wall-clock budget must satisfy the declared first/next-cell gates. This review grants no concurrent runtime lease and does not resolve the earlier native crash.

After those preconditions, the parent may syntax-check and execute the first fixed ON cell. All four diagnostic outcomes, including failures and unavailable observations, must remain distinct; no additional samples, product win or full-neutrality claim is authorized by this scoped admission. Full Phase A is still **NOT SOUND**.
