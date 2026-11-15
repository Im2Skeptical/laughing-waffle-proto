# J8 diagnostic-window attribution draft

Root Builder,2026-11-05. **UNEXECUTED DRAFT; NOT ACCEPTED.** Written while the separate preview-state Builder owns the exclusive CPU/build/browser slot. No tests/build/browser runs were started by root during that ownership. Existing successful J8 evidence remains pinned to its old source; it is not relabelled as proof of these changes.

Impact: harness accounting only. Simulation state, RNG, schemas, replay, gameplay, app source/layering and existing input workloads are untouched. Optional diagnostic markers add disclosed outside-clock browser RPCs. Operation latency totals and full artwork preparation spans are never shortened. These markers still need matched overhead proof.

Root-owned changes:

- observation-windows.mjs validates raw availability, clocks, intervals and unique diagnostic IDs. It preserves raw input, returns copied arrays, merges clipped diagnostic windows without double-counting and conservatively removes whole frame/long-task samples with positive overlap. Exact endpoint contact and zero-duration windows do not remove a sample. A diagnostic before the declared observation still excludes a frame crossing it. Unknown completion stays open through the remaining window; availability/censoring/gaps remain explicit. Remaining intervals are named outsideDiagnostic, not certified observer-free product frames.
- observation-windows-test.mjs contains meaningful synthetic controls for those edge cases, nested unions, unknown completion, copied-output isolation, malformed intervals, availability and censoring. **Not run yet.**
- artwork-controls.mjs records bounded start/end/status/identity for manual all-atlas inspections, legacy geometry queries, actual drawing and current-context texture checks, heap reads, screenshots, correctness oracles and the deliberate publication fault. Nested windows merge for attribution. A failed/timed-out diagnostic is retained open because a rejected wait does not establish remote work stopped. Failed operation rows retain their correctness window. Expensive remaining-texture polling after deliberate exhaustion is explicitly a diagnostic gap. Post-observation supported export is also recorded, after raw frame/memory collection. Raw continuous telemetry is retained alongside separate session/post-action attribution and all diagnostic windows. Every construction row now explicitly states comparisonEligible=false and pins frozen fixture/SDK identity.

After the preview-state Builder releases the slot, run focused observation-windows tests, artwork helper tests and script syntax, then refreshed actual reference/deferred/fault/failure controls against exact current build/source. Verify that deliberate diagnostic stalls remain in raw telemetry, crossing samples enter excluded arrays, union accounting is exact, unclosed diagnostics fail closed, and product latency/full preparation totals do not subtract diagnostic work. Independent audit and common observer/driver overhead remain required. Full npm verify is required before task commits; no commit is prepared here.

Suggested next commands use unique new IDs:

```powershell
node scripts/perf-hillclimb/observation-windows-test.mjs
node --check scripts/perf-hillclimb/artwork-controls.mjs
node scripts/perf-hillclimb/artwork-bundle-controls-test.mjs
node scripts/perf-hillclimb/artwork-oracles-test.mjs
node scripts/perf-hillclimb/artwork-controls.mjs --cases=reference,deferred,retry,exhausted --cycles=1 --id=NEW_ACCOUNTING_ID
node scripts/perf-hillclimb/artwork-controls.mjs --cases=early-publication --cycles=1 --id=NEW_ACCOUNTING_FAULT_ID
```

This closes no independent proof gate by itself. Phase A remains NOT SOUND; full-preview proof, direct stale commit, other seeds/cache/art/device-proxy populations, first feedback, matched overhead/native corroboration, complete schedules/smoke suites/tails and whole independent acceptance remain required.
