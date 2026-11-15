# Lifecycle r3 affected review — independent Harness Auditor

Reviewed 2026-11-15T05:07Z by `/root/harness_auditor`. **Scoped managed repairs PASS; native helper/child admission remains WITHHELD. Whole Phase A: NOT SOUND.** No Builder or frozen evidence file was changed.

## Frozen identity and independent reproduction

OLD checkout `artifacts/perf-hillclimb/native-event-observer-lifecycle-r3-20261115/`:

| Input | SHA256 |
|---|---|
| build-manifest.json | `6f18c91fbfe9ad0dbb7abb639ff45aa4509ebb323939439c78653da515226adb` |
| RepairContracts.cs | `ef240eab6df7d8ed4da5cb65670289ae2daaa0d47023e09de10ff2bf302d9bc5` |
| RepairedResources.cs | `aad6b34b8f53e70f712d978951b3269b6134f0d48d6905219253e6f772c1420f` |
| selected Builder DLL | `638870f6472ca4cfeea00538a7b310b1c6939fb12ff72f1b09d01e826200dd02` |
| selected Builder pure proof | `3d734ec5d43676310b2410c0dd69e976170d3bf329cdc580be201ff3b86d8913` |

All manifest-pinned files, including the preserved first187-check source/proof, matched before compilation. The final source-review receipt re-pins Contracts/Resources/Fixtures/manifest after the independent checks. The Builder's683-source/five-asset authentication at05:01:46 reports no changes; this review did not repeat that large corpus hash.

Fresh independent root: OLD `artifacts/perf-hillclimb/auditor-native-capture-lifecycle-r3-20261115/`. Command from OLD: `& ./artifacts/perf-hillclimb/auditor-native-capture-lifecycle-r3-20261115/check.ps1` (fresh output only; do not overwrite).

At05:04:57.798Z, independent x64 compilation exited0;193 Builder checks reproduced,229 independent managed checks and eight source-binding checks passed. Independent DLL SHA `045bbb5a6fff609bd4eef268ba5fd80805d9e84876aa60b88c391c545521ed7e`; original independent receipt SHA `3384fd856e1e37b0a384527834760a1096073229ae36a1bb8e6f83359ec5fcd8`. The receipt pins the compiler, actual input sources, independent fixtures/adapter and DLL. `source-review.json` SHA `61183d3ceeb67498c47c7261c43d5ca7795292ee2b8225c5902aa115e66d1a58` separately retains the remaining creation-path finding without replacing the passing managed receipt.

Only the compiler OS process and joined managed fixture threads ran. Fake SafeHandles release by incrementing a managed counter. No `RepairedJob`, `RepairedPipe` or `CleanupDebugDrain` constructor, `Native`/`ExtraNative` method, target, debug API, preview or capture was invoked.

## Disposition of the three r2 findings

1. **Start/close race: repaired at this scope.** Actual `RepairedPipe.StartReader` starts `OwnedWorker` while holding its owner gate. `OwnedWorker.Start` serializes Thread.Start against RequestClose; a close-first worker permanently forbids future start. TerminalProved requires an actual Join unless it can never start. Independent close-first/start-first fixtures and16 competing Start/close interleavings joined all created managed threads and checked consistent winner/body execution. `ThreadState.Unstarted`/IsAlive is no longer substituted for Join.
2. **Pending physical-close confirmation: repaired at this scope.** ReaderState allows ClaimFinalization to retry until ResourcesReleased is explicitly confirmed. Actual TryFinalize treats `CloseSucceeded == null` as pending rather than a fabricated failure; actual read/write/thread handles use OwnedResource, and synchronous ReadFile holds a read lease. Independent two-lease cases showed deferred release, repeated pending claims and exactly-once fake release followed by confirmation. Real CloseHandle/cancellation outcomes remain unexecuted.
3. **Drain failure/retention: repaired as source policy, not demonstrated cleanup.** ContinuedOwned errors remain latched while Job continues bounded draining; unsafe identity/native failure/exhaustion stops with an explicit recovery obligation. Physical EmptyConfirmed remains separate from EvidenceComplete. Unexpected headers retain176 bounded raw bytes as hex plus tag/PID/TID and continued:false, under the2048-event cap. The finite same-thread drain and shared budget remain explicit. Independent typed-policy/error-classifier checks passed; source checks bound the actual Job/ledger sites. No native event was supplied or continued, so this is not OS drain proof.

The selected ReadFile policy correctly separates successful zero-byte reads from closure, uses ERROR_BROKEN_PIPE109 as anonymous-pipe EOF, and treats995 cancellation/38 file EOF as failures. This matches the distinctions in [Microsoft ReadFile documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile) and [anonymous pipe operations](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipe-operations). Policy fixtures do not prove actual EOF/cancel latency. The pre-correction zero-read-as-EOF187-check build remains preserved and unaccepted.

## Remaining source gate and next step

**Creation rollback still needs a concrete repair before native helper construction.** `RepairedResources.cs:83` allocates `ready` in an instance field initializer. CreatePipe false at87–88 throws before disposing that event; the caller cannot dispose an object whose constructor never returned. The controller alone cannot repair that inaccessible resource. Place allocation/ownership within a constructor rollback scope (also containing native/managed exceptions), preserve the frozen r3 evidence, and add a managed injectable failure-path ownership test. No native constructor was used to demonstrate this source finding.

Then return the complete creation/Run/controller, startup handle-list allocation, loader policy, normal EXIT-continuation-state handoff, outer failsafe and bounded whole-session wire/classifier for source admission. A fresh cleanup drain cannot invent an EXIT event already consumed by a normal loop. Unsafe/pending events, API exceptions, job-zero failure or a reader that misses cancellation must produce retained INCOMPLETE evidence and a bounded owned outer recovery path. The shared managed budget does not by itself bound every synchronous OS API or prove physical cleanup. Normal-return-only exception/handle paths need the same rollback discipline.

The six fixed synthetic controls remain unattempted and require separate frozen source/binary/config admission. Actual preview capture additionally needs trial-wide job lifetime preserving the daemon through the original reuse sequence. No native ABI, complete lifecycle, source-child, native cause/fix, neutrality, performance or SOUND acceptance follows from these managed checks.

Review complete; compiler/managed fixture threads exited and the focused CPU lease is released. All eight jobs, three complete smoke suites,120 independent launches per scored job/population and deadline2026-11-16T02:40Z remain unchanged.
