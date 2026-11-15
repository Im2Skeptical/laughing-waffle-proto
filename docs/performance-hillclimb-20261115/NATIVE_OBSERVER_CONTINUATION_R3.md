# Next source step: residual lifecycle races and rejected-event evidence

Read STATUS.md/clock/ownership first. Deadline2026-11-16T02:40Z, final35minutes
from02:05Z, no new ten-minute leaf after01:45Z. Whole NOT SOUND. Preserve all
eight jobs/three suites/120launches and old evidence; no optimization or scoring.

Actual OLD perf/hillclimb-20261104 only. Fresh lifecycle-r2 source/pure proof is
frozen under artifacts/perf-hillclimb/native-event-observer-lifecycle-r2-20261115/,
manifest1f746c70a5dc78958f2fbe2b247d0750f7afe96d57c36d2fbedf756878fe7da3.
It compiled and passed128 Builder managed checks. Independent reproduction128
plus81 own managed checks passed, yet source findings remain. See independent
NATIVE_CAPTURE_LIFECYCLE_REVIEW_R2.md; these counts are not native lifecycle proof.
No native resource/helper constructor, Native/ExtraNative method or target run.

Use a FRESH r3 artifact revision; do not overwrite r2/r1 source or receipts.
First source fixes, before adding the Run/controller:

1. Serialize reader creation/actual Thread.Start with close under one ownership
   decision. Close winning must forbid later start. !IsAlive includes Unstarted
   and cannot prove a started thread exited or joined. Publish join only from an
   actual successful bounded Join, or an explicit never-started state that is
   permanently barred from starting. Force both start-before-close and
   close-before-start interleavings in managed fixtures.
2. Separate finalization claim from completion and permit retry of pending
   physical SafeHandle-close confirmation after a held writer lease releases.
   Do not permanently suppress finalization when CloseSucceeded is still null.
   Continue using scoped leases, active-operation gates and contained finally
   exceptions. Test a held lease across owner close, delayed lease release and
   repeated owner finalization, with exactly-once fake release.
3. Retain unexpected/rejected event headers and bounded raw record evidence
   before returning, including the currently unretained unexpected-header path.
   An INCOMPLETE verdict is not exit/job-zero proof. Job currently breaks on
   DrainStep.Okfalse; define bounded cleanup behavior for trustworthy owned
   events after rejection, retaining source/event errors without promoting the
   result. Never control an unbound/foreign PID. Unconfirmed cleanup must remain
   explicit; no missing notification/EOF/host exit inference.

Preserve the one shared monotonic budget, finite same-creating-OS-thread drain,
independent raw streams, lossless known ABI event projection and all limits.
Do not pass arbitrary lifecycle objects/IntPtr/Int64 into Wire.Lossless or treat
it as a general bounded receipt serializer. Full creation, identity/suspended
assignment, handle-list setup, normal loader-breakpoint rule and whole-session
receipt/classifier still remain separate source integration obligations.

Builder may compile/pure-test managed fake handles/clocks/state/interleavings;
no native resource/helper constructor or Native call is permitted yet. Parent
owns sole test/compiler/CPU slot; pause own builds while independent Auditor has
the focused managed-control lease. Freeze exact fresh source/binary/configs and
obtain independent affected SOURCE admission before any of six target controls.

Additional staged source: native-capture-target-source-r1-20261115/
SyntheticCaptureTarget.cs SHA8411af8d9fb2c7265d99fe57a849f2df27955bd641b29707d7c2ed386f897280,
READMEcfa9f97de9a3005ae1d0f5550764aa634c863df5daeb054b7f360b6d4c2b6ad0.
It is UNCOMPILED, UNREVIEWED and UNADMITTED; no target run. Six modes/identity
files/supplied-record native/descendant fixture are only draft source. Exact
readiness/timeout start and root/argv/ownership must be frozen with controller
before source admission; staged source does not authorize a child.

All six synthetic slots remain unattempted. No real preview capture yet: a
separate trial-wide daemon lifetime must preserve original helper reuse/cache
steps. New debugger/job/launcher population is diagnostic, not neutral or old
execFileSync proof. No native cause/fix/full verifier PASS/product metric/SOUND.
Persist exact smallest cut/source errors/leases and release at checkpoint.
