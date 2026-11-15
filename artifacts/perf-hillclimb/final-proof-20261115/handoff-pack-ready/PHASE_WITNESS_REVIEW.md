# Independent response-phase witness review

**SCOPED RESPONSE-PHASE SOURCE/FOCUSED-CONTROL MECHANISM: ACCEPTED at the final identities below. Actual browser witness and whole Phase A acceptance remain separate; Phase A is NOT SOUND.** Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh, independent of Builder `/root/phase_witness_builder`. Initial inspection was source-only during Builder's lease; parent then granted an exclusive focused-Node lease for the independent recheck below. No browser, application build, benchmark or source/contract/product edit was performed by this Auditor. Only this report and fresh ignored audit evidence were written.

Read the parent's HARNESS addendum, `PHASE_WITNESS_BRIEF.md`, `J8_ABBA_REVIEW.md`, actual three-file implementation, its focused controls and the staged implementation note. These findings concern only the opt-in diagnostic; no whole-harness acceptance or product performance claim is issued.

## Inspected identities

Files are in the preserved performance checkout. These are review snapshots, not final acceptance pins while Builder finishes its handoff:

| File | Raw SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/artwork-bundle-controls.mjs` | `774aa020e4c097f46b6a92abcf5dbef845f63c0f9eea2fd5d08479521138e8da` |
| `scripts/perf-hillclimb/artwork-bundle-controls-test.mjs` | `4fe97f8c3b0a8b936acb949761d61e0570014d3d8731a013aca909b3be4106a3` |
| `scripts/perf-hillclimb/artwork-controls.mjs` | `57aa43e3efff91ef48e3066f7b6d446a3e9e872c27c652530c025a8384ff68b3` |
| `docs/performance/perf-hillclimb-20261104/HARNESS.md` | `ebc9da83422b58a195415dac178bba2fd80453979050219f05daaece66afce7b` |

Before bytes and the five built-asset authorities are retained in `artifacts/perf-hillclimb/phase-witness-build-r1-20261115/before.json` and `before/`. Builder's final source/diff/control/asset receipts must match any eventual accepted snapshot. No actual phase-enabled browser case has been reviewed here.

## Source assessment

- **Exact optional response binding.** `instrumentArtworkBundle` requires an explicit boolean option, rejects an already-colliding witness namespace, and requires the entire inspected loader and root blocks exactly once. Missing, changed or duplicate bindings reject instead of silently omitting a phase. Default phase-off never invokes the replacement or phase prefix; its returned response body remains the prior private-publication response. Added metadata is distinct from response-byte identity.
- **Await and gate semantics.** Markers are synchronous statements adjacent to existing awaits; the original await operands/callee arguments remain. `hillclimbPhaseGate` records the result already evaluated by each original call and returns that exact value. No extra `canLoad`/`isCurrent` call, Promise wrapper/subscription, frame, timer, polling loop, active state getter, forced render or model write is added. Existing original timers/idle callbacks retain their duration/options. Original short-circuit reveal calls remain intact.
- **Errors and returns.** Loader atlas rejection stays outside its existing terrain try/catch and propagates normally. Terrain/onReady errors remain in the original catch/onError path. Root warning callbacks preserve their original return behavior. Phase markers do not manufacture a successful return or turn `artwork.ok:false` into readiness.
- **Bounded state.** Storage has32 event slots,8 retained loader IDs and saturating signed-32-bit counters; fixed literal site/gate names bound the remaining maps. `droppedEvents`/`droppedLoaders` expose overflow. No GameState, RNG, save or timeline reference is stored in the witness. It is ephemeral test-realm data.
- **ID correspondence.** `terrain-enter`/`ready-enter` set the synchronous calling ID immediately before the original callback; root captures it before its first original await. Root preparation therefore keeps its captured ID across interleaved awaits. Ready captures its caller similarly. Root errors/rejections are explicitly unlinked with `id:null` and epoch; they are not incorrectly attributed to the latest global loader. Overflow loaders also stay explicitly unretained/unlinked.
- **Flag and actual presence.** CLI accepts only omitted/0/1, manifests record enabled/version, and actual served variant metadata is checked against the request. Menu setup requires the correct realm witness version when enabled and absence when disabled. This prevents a silent unsupported flag from masquerading as a phase-enabled run.
- **Post-clock collection.** `readPhaseWitness` rejects an active original operation, missing/wrong version or excessive storage, uses a finite5000 ms host read bound, and returns a bounded copied DTO. It is called after HC finish/cancel and feedback collection, on both successful and failed rows; final raw success/failure evidence also retains it. Already-failed collection errors remain explicit errors. No phase field is an input to readiness, feedback, asset/state or context oracles.

No deterministic simulation, serialization/schema, authoritative replay, UI pacing, asset byte or product-source change appears in these scoped edits. The explicit response adds diagnostic work, so its presence is a new mechanism population and is not a neutral observer claim.

## Controls inspected, not independently executed yet

The focused test uses the same exact loader/root blocks for semantic fixtures and also binds the actual frozen app bundle. It compares default phase-off bytes against the preserved pre-change helper and the completed ABBA served hash, tests changed/missing/duplicate/colliding bindings, and parses the actual phase-enabled ESM response. Its initial `vm.Script`/`import.meta` failure is retained as an invalid parse mechanism; changing to module syntax checking does not alter served product bytes.

Inspected semantic assertions cover:

- Original gate order/count, callback identities, return values, one `artwork.ok` getter evaluation, original thenable/native-Promise subscription receiver/count and unchanged error object.
-321 ms held atlas,200 ms denied wait and32 ms idle intervals in the virtual realm; held main/decision awaits and rejection/throw paths without false return markers.
- Stale queue/reveal short-circuiting, immutable simulation/RNG fixture,32-event overflow,8-loader overflow, counter saturation and two interleaved root IDs.
- The actual runner reader's active-clock/missing/version/bounds rejection and invalid CLI values failing before runtime setup.

These are meaningful mechanism controls, but source assertions and the Builder's reported PASS do not replace independent execution at final frozen hashes. Scope acceptance remains pending that recheck. No browser/tail/physical display proof follows from virtual delays or a syntax check.

## Interpretation limits for the two actual diagnostics

1. The32-event list is expected to fill during early atlas waits. **Missing events in that truncated array cannot establish a missing phase.** Per-loader site/gate counters, timestamps and dropped-data fields continue to update; compare entered/returned site pairs. `lastPhase` alone can describe an inner cooperative wait while an enclosing atlas/main await remains pending.
2. Collection intentionally happens after original finish/cancel and feedback; background preparation can advance between the deadline and the exported snapshot. Compare phase timestamps with the original HC end/cancel marker. A return after the240-second boundary is a late completion, not proof it completed inside the gate. If counters/overflow cannot resolve the ordering, retain ambiguity.
3. A zero loader count is evidence that no loader entry was observed in that document, not a missing witness when the correct prefix/version exists. Conversely, an absent/wrong witness or collection error cannot be treated as an empty successful phase history.
4. Unlinked errors and dropped loaders must remain unlinked. Do not borrow another loader's phase/source or epoch to close a gap.
5. Phase observations may localize an unfinished await, denied gate or handoff, but do not by themselves assign product versus common-hook cause. If response markers change the failure outcome, report possible observer perturbation and preserve old ABBA failures.

## Required next handoff

Builder should release the slot with final exact3-script/HARNESS hashes, untouched five-asset proof, preserved failed controls, final focused results and served off/on identities. Parent can then grant independent execution of the focused mechanism controls at those frozen bytes. A full application verification and the new immutable fixed OFF/ON two-cell admission remain parent-owned under the predeclared contract. Preserve240000 ms gates,600000 ms case cap, all13 groups/16 atlases, cycles5 and all existing hooks/oracles; no conditional extra sample or optimization.

No source blocker requires a broad repair or new product hook at this inspection. Final acceptance must name the exact reviewed/control-executed revision rather than inheriting this provisional snapshot automatically.

## Final frozen recheck and scoped acceptance

Builder released its focused runtime/source lease with final `after.json`, source copies/diffs and `focused-r5.log` in `artifacts/perf-hillclimb/phase-witness-build-r1-20261115/`. I read the final note and strengthened controls, checked final pins and independently executed:

```powershell
node scripts/perf-hillclimb/artwork-bundle-controls-test.mjs
```

**Exit 0.** Both existing publication/fault controls and the new exact-bundle/phase controls pass. This includes the actual ESM response syntax control and invalid-CLI controls, which launch only bounded Node checks, not a browser. No application/full verification or phase-enabled browser case was run under this Auditor lease.

Independent receipt/log:

`artifacts/perf-hillclimb/auditor-phase-witness-20261115-r2/{before,result}.json` and `focused.log`

The receipt records execution `00:17:50.899–00:17:52.704 UTC` on15 November2026. All four owned file pins, parent HARNESS and five built assets matched before and after; `changed: []`. Final accepted identities:

| Item | SHA-256 |
| --- | --- |
| `artwork-bundle-controls.mjs` | `409e33c6c9a02bcfa7d1c8bd571739aaaec7b6d58b179baaff6ef9e7debd63a3` |
| `artwork-bundle-controls-test.mjs` | `9ab832985a96738797ff4a220979a739dd8614fb4b1656b4d4fe452324a08315` |
| `artwork-controls.mjs` | `57aa43e3efff91ef48e3066f7b6d446a3e9e872c27c652530c025a8384ff68b3` |
| Parent HARNESS | `ebc9da83422b58a195415dac178bba2fd80453979050219f05daaece66afce7b` |
| Builder implementation note | `6197945919d248b7cf81ee58ecf3c23b3a57370f22ba40ec2143f9372a57aa38` |

I also independently generated and hashed both variants from the real frozen bundle, matching the final receipt exactly:

| Response | SHA-256 |
| --- | --- |
| Original app | `2650f059863769f98da13622798df92cf8a338c082f5fd5a695094aee2a48ea8` |
| Default phase-off/private-trace response | `371417c244819e7497d937a0e8b8d81b9446322aa7fed781fdc33f98693eaa80` |
| Explicit phase-on response, version1 | `17f47be07781132627ffca0cad656800c1f77b9871b58c241492ad16c467ead6` |

The default response remains byte-identical to the completed ABBA authority. The final code adds a retained denied-terrain-reveal marker/control without changing its original short-circuit calls or return. The final tests also strengthen original native-Promise identity/receiver/subscription checks. No blocking finding remained after source/control recheck.

An earlier **Auditor r1 preflight was invalid**, not a product/harness-control failure: my temporary audit wrapper read `assets[*].sha256`, while Builder's receipt stores `expected/actual/unchanged`. Its five undefined expected pins caused preflight rejection **before any test ran**. That invalid preflight remains under its original ID. R2 explicitly validates those fields and pin types, then independently checks bytes and runs the control; no asset drift or failure was waived.

**Disposition:** scoped response binding, bounded phase provenance and focused semantic controls are technically accepted at these exact bytes. Parent's full verification and the new two-cell actual OFF/ON diagnostic still need their separate admission, actual requested/served/observed witness guards and eventual raw evidence. No browser observation or readiness success is inferred from these focused controls. All reporting limits above remain binding, especially32-event overflow versus per-site summaries and phase evolution after the original deadline.

**Focused Node/source slot released to parent.** The synchronous independent command and its child checks exited; no Auditor test/browser process remains active. Whole Phase A is still **NOT SOUND**, with no product fix, performance score or neutrality claim.
