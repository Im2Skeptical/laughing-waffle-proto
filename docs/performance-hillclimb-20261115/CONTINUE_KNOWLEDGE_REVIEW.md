# Independent Continue/J7 knowledge review

**SCOPED SETTLED-TERMINAL CONTINUE/J7 KNOWLEDGE MECHANISM: ACCEPTED at snapshot B after independent reproduction below. Whole Phase A remains PROOF: NOT SOUND.** Auditor: `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh, independent of the Builder. Target is the preserved v1.1.53 performance checkout. The initial passes were source-only while Builder held the execution slot; the parent subsequently granted the Auditor an exclusive runtime slot for the final affected recheck. No executable, product, package, contract, build or historical evidence was edited. Only this report and fresh ignored Auditor evidence were written.

## Inspected snapshot A

Raw SHA-256, read during the Builder's construction handoff:

| File in the preserved performance checkout | SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/run.mjs` | `336e06e52ee3e3db876870314285afd6b8b5621c0e20690aa6d3a2a4b6608cca` |
| `scripts/perf-hillclimb/save-state-oracle.mjs` | `dbc4f373e5b47c66e889711ad48f012563d63dc71bc4bb8aa5664e94616fdd51` |
| `scripts/perf-hillclimb/save-state-oracle-test.mjs` | `d4948f5ee2179c553c4c5a2f9027ffb575f24167ec28f93d73a5ced79de66517` |
| `docs/performance/perf-hillclimb-20261104/HARNESS.md` | `eca7b0ab570f8ca9259244dcae39f2f77a70bd93a16ee04aa336b9a5815496ac` |

Relevant unchanged causal source was also read: the retained-state inspector in `src/controllers/sim-runner.js`, the normal frame's `syncObservedSurvivalYear` call, `src/controllers/settlement-forecast-controller.js`, `src/controllers/game-session-controller.js`, and `src/controllers/sim-runner/save-slots.js`.

## Finding requiring repair

**K1 — bounded liveness, blocks the new J7 setup mechanism at snapshot A.** `prepareSettledSaveKnowledge` in `run.mjs` awaits a bare asynchronous `page.evaluate` containing two `requestAnimationFrame` waits, and its `finally` awaits another bare evaluation. J7 calls this helper between `record` operations, outside the existing operation/untimed-oracle deadline. A renderer that stops servicing work, or a missing following frame, can therefore hang the job indefinitely without reaching its failure/cleanup path. `page.setDefaultTimeout` does not bound `evaluate` awaiting its own asynchronous result. Continue's enclosing oracle guard does not cover the separate J7 call site.

Minimum repair: apply finite host deadlines to the new helper's potentially blocking browser evaluations and final marker, retain the original timeout/error plus partial/unavailable receipt and open-window status, and exercise a deliberately missing-frame or noncompleting-evaluation control. A host timeout is a failed/unavailable observation, not successful latency or proof that remote work completed. Keep cleanup bounded. No product timing boundary or gameplay change is needed.

This finding was sent promptly to the parent. It is a static deduction; no hang was induced while the Builder owns the execution slot.

## Source assessment within the requested scope

- **Independent expectation:** `expectedOpeningKnowledge` derives terminal second/year through the pinned frozen SDK's official-second simulation over immutable fixture state. `settledSaveKnowledge` compares actual pre-save cursor and timeline knowledge with that derived expected state plus the separately justified planning pause. No candidate knowledge field is copied into expected data. Wrong/missing knowledge or RNG is not normalized away.
- **Causal application:** production `syncObservedSurvivalYear` runs after graph update in the ordinary frame. It accepts independently resolved final loss year even before visual reveal reaches loss, then updates cursor/preview knowledge and absorbs it into the timeline. The new setup waits for matching current-source terminal coverage, samples two following frame opportunities, and then demands the actual retained cursor and timeline both already contain the exact expected knowledge. Two rAF opportunities are not physical pixels; that is consistent with the declared proxy.
- **Source identity:** fixture frontier and action count, a safe source revision, projection signature/token, projection history and computed terminal coverage are required. The resulting source key must remain the same across both frames, before/after the full read, and after persistence. A foreign/stale source, early incomplete coverage or changed revision fails instead of justifying a knowledge value.
- **Read purity and ordering:** the inspected `inspectRetainedStates` reads installed state, serializes copies and returns copied timeline knowledge; it does not rebuild or merge knowledge. The receipt strictly requires frontier cursor, no preview, exact full state/RNG and exact timeline knowledge. The receipt precedes the save action. Production `saveToSlot` calls `writeSaveToSlot`; its `persistSave` invokes `prepare()` synchronously before the first awaited storage access, so a pre-action receipt plus exact persisted output supports the intended pre-clone ordering. No new harness pause or state write is introduced.
- **Strict saved outputs:** `fullSaveOracle` retains and compares raw JSON, decoded state and authoritative reconstructed state against independent expectations, with all-field/RNG comparisons. The existing official-continuation helper advances independent copies through three actual/frozen official seconds and compares both results and full states. Existing wrong-save/deferred-save branches are preserved. No accepted result is inferred from these source statements alone.
- **Workload/accounting:** the new November 15 addendum explicitly changes pre-save setup before acceptance. Continue performs it inside the existing post-clock correctness oracle; J7 records a separate setup window and setup-through-save span. Frozen derivation, waiting and full inspection remain disclosed and raw continuous observations retained. The harness/contract hashes split this revision from old rows; policy tags appear in preparation/span artifacts and returned oracle data. These operations may alter the pre-save workload/cache state, so comparisons must use the same newly accepted setup on both builds. This is a harness correctness change, never a product speedup.
- **Controls staged:** the helper test has three-seed positive receipts and wrong frontier/actions, foreign projection, stale signature/history, insufficient/late coverage, source changes, missing/reordered frame, too-early read, wrong/missing cursor/timeline knowledge, wrong RNG, preview and nonfrontier rejection, plus save-before-read and changed-after-clone controls. The retained original failing 424242 Continue state is compared to the independently derived full expectation. These are inspected assertions, **not executed or accepted evidence in this review**. Actual path and liveness controls remain distinct.

No other concrete source blocker was found in this bounded pass. Builder's implementation note/raw proof and independent representative execution remain pending. Do not generalize this assessment to all jobs, populations, statistics integration or full Phase A acceptance.

## Required affected recheck

After K1 is repaired and the Builder releases the execution slot, inspect exact revised source hashes and its implementation note/raw receipts. Independently reproduce a representative actual Continue/J7 case with full saved-state/continuation checks, the new liveness failure, and representative wrong/late/stale knowledge rejection. Check that setup windows and costs survive failures and that source/build identities stay frozen. Keep old failed samples unchanged and comparison-ineligible; preserve the eight-job contract and original tail requirements.

## K1 affected recheck — snapshot B

**K1 implementation finding: repaired in the inspected source and supported by the two Builder runtime controls. Independent representative execution and scoped acceptance remain pending.** This is a read-only recheck under the same narrow repair round; Builder still owns all runtime work. No Auditor test/browser/build was started.

Snapshot-B `scripts/perf-hillclimb/run.mjs` SHA-256 is `d1a81bf6d99be2e35ddc167e8688b11ae2907c0f35acb0526e8d0f3e53b6a714`. The other three hashes in snapshot A are unchanged. All four match the exact pinned entries in `artifacts/perf-hillclimb/continue-knowledge-resume-r2-20261115/actual-plan.json`.

The revised helper bounds its start marker, terminal-coverage wait, async two-frame/full read, end marker, failure partial read and final marker with finite host deadlines. Failed setup writes its original error and a copied partial/unavailable receipt; the failure artifact keeps its window open at capture rather than inventing completion. A final-marker failure leaves the source window explicitly open. No timeout value becomes a successful product latency. New context/page/browser cleanup receipts expose owned closure outcomes.

I inspected the actual r2 driver, frozen plan and first three completed results. Its cells explicitly enumerate six intended cases; the plan's prose scope says “four” and is a nonblocking stale description, not evidence of four executed cases. Preserve the immutable plan and clarify that discrepancy in the handoff instead of editing historical evidence.

Both new liveness controls have the intended specific outcome:

| Builder control ID | Inspected outcome |
| --- | --- |
| `continue-knowledge-missing-frame-r2-20261115` | Exit 1, original `settled pre-save full read timeout after 1500ms`; ready source retained, **zero** following frames, partial phase `frames`; context and page closed, browser closed, zero cleanup errors. |
| `continue-knowledge-never-evaluation-r2-20261115` | Exit 1, same original 1500 ms read deadline; ready source retained, **zero** frames, partial phase `deliberate-never-evaluation`; context and page closed, browser closed, zero cleanup errors. |

The injected callback/Promise is globally rooted in r2. That prevents the earlier r1 fixture's context-destroyed failure from masquerading as the intended missing-frame/never-evaluation control. R1 remains invalid control evidence under its own identity; r2 does not relabel it. A declared 1500 ms host deadline and matching timeout are liveness evidence, not a claim that the entire launch took 1500 ms or that Promise racing cancelled remote work; closure receipts provide the separate cleanup evidence.

The first positive r2 desktop seed123 Continue also completed with exit 0 and clean closure at this inspection. The 424242 mobile4 and J7 wrong-save/deferred cases were still under Builder execution; no result is inferred for them. No whole-plan final provenance result is claimed while the plan is active. The remaining independent recheck and final exact-revision proof are unchanged.

## Final affected runtime recheck and acceptance

This section supersedes the pending-runtime status above. Builder released all execution after its fixed-source r2 plan completed **6/6 intended outcomes**, exit 0, with `actual-provenance-after.json` reporting `changed: []`. Its implementation note is `docs/performance/perf-hillclimb-20261104/CONTINUE_KNOWLEDGE_RESUME_20261115.md`; exact six-case evidence and derived spans are in `artifacts/perf-hillclimb/continue-knowledge-resume-r2-20261115/` in the preserved performance checkout.

I inspected the six final outcomes and their material witnesses. Both Continue positives preserve strict full-state equality. The original 424242 mobile4 failure now has independent expected year **138**, actual cursor and timeline year **138**, two prior frame samples and equal raw/decoded/rebuilt expected hashes. Wrong-save still fails the original all-field comparison, retaining 64 capped differing paths in each raw/decoded/rebuilt comparison. Deferred-save's actual native acknowledgement arrived **215 ms** after native commit, before the original semantic completion; the unchanged delay/ordering and full-state continuation oracles pass. All six contexts/pages/browsers report closed, no cleanup errors. The plan's stale four-case prose is explicitly clarified as six in the final handoff; immutable evidence is unchanged.

Fresh independent evidence folder:

`artifacts/perf-hillclimb/auditor-continue-knowledge-20261115-r1/`

The parent and Builder were source-frozen and metadata-only during this Auditor's exclusive CPU/browser lease. `before.json`, `results.json` and `after.json` preserve the complete source/asset inventory and comparisons before, between and after checks. **All source/asset deltas are empty.** The three script pins and contract hash are exactly snapshot B; app/worker/style/prepared-fixture assets remain the same five pinned assets. No performance baseline/candidate comparison was attempted.

| Independent check | Observed result |
| --- | --- |
| `auditor-continue-mobile424242-20261115-r1`, actual `performance-continue`, cold/minimal/mobile4 | Exit 0, two real measured operations. Expected/actual survival year 138, two preceding frames, exact raw/decoded/rebuilt state hashes, zero delta paths, three official continuation seconds with full-field/RNG equality. Its full setup-through-persisted span is retained (**26,670.5 ms** in this diagnostic run); this is neither free setup nor a claimed speedup. |
| `auditor-continue-missing-frame-20261115-r1`, actual settled-helper fault on desktop123 | Expected exit 1 with the original **`settled pre-save full read timeout after 1500ms`**. Ready source retained, zero frames, phase `frames`; failed setup window retained. Context/page/browser closed, zero cleanup errors. |
| Focused independent receipt controls | Loaded the pinned frozen corpus for seed424242 and independently derived terminal **4410 / year138**. The actual positive receipt passes. Copied actual receipts with wrong cursor knowledge, stale projection source or late terminal coverage each reject; save-before-knowledge-receipt rejects. These four helper rejection checks are separate from actual browser observations. |

Exact browser argv is retained in `results.json`. Representative reproduction, with a fresh run ID required:

```powershell
node --experimental-vm-modules scripts/perf-hillclimb/run.mjs --jobs=performance-continue --population=mobile4 --seed=424242 --cache=cold --artwork=off --samples=1 --id=NEW_AUDITOR_CONTINUE_ID --fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json --fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000
```

The independent negative uses desktop/seed123 and `--control=settled-missing-frame`, under its own fresh ID. The targeted controls and derived expected terminal are recorded in `focused-controls.json`; I did not repeat the Builder's entire 67-control suite merely to add counts.

Both independent driver processes exited, their leaf cleanup receipts confirm owned page/context/browser closure without errors, and static port **18244 had no listener** afterward. No pre-existing preview was stopped. This establishes scoped owned cleanup, not whole-host invisibility.

**Disposition:** K1 is closed at snapshot B. The frozen derivation, before-clone application gate, strict state/knowledge/source checks and bounded liveness mechanism have sufficient source, Builder and independent affected-path evidence for this scoped acceptance. Old racing failures and invalid r1 liveness evidence remain unchanged. No unresolved finding remains within this narrowly reviewed mechanism.

**Limits and next command:** the full 36-cell cold/warm × desktop/mobile4 × three-seed × Continue/history-save/opening-save schedule, progressive sentinel, broader eight-job proof, instrumentation overhead and tail populations remain unexecuted/unaccepted by this review. Desktop/mobile4 is a desktop proxy, not a physical Pixel 6 result. After the parent freezes source/assets for the entire schedule, the next declared coverage command is:

```powershell
node scripts/perf-hillclimb/main-discovery.mjs --id=continue-knowledge-coverage-r1-20261115 --jobs=performance-continue,save-history,save-opening --seeds=123,424242,99117 --populations=desktop,mobile4 --caches=cold,warm --artwork=off
```

Keep per-cell provenance checks and all failures; this construction driver alone does not certify one unchanged source across a long schedule. The separate progressive Continue sentinel remains additional coverage. Scoring and product optimization still require full independent Phase A acceptance.

**CPU/test/browser slot released to parent at completion of this review.** No Auditor task runtime remains active.
