# Lifecycle r3 source/pure proof, no target admission

Preserves all r2/r1 evidence. Selected current proof is build-pure-pipe-r2.ps1,
NativeCaptureRepair-pipe-r2.dll and pure-result-pipe-r2.json:193 Builder managed
checks passed. No RepairedJob/RepairedPipe/CleanupDebugDrain construction,
Native/ExtraNative call, target/preview or actual capture occurred.

OwnedWorker is the actual pipe's managed start/close component. It serializes
Thread.Start with close and permanently forbids start if close wins; actual
terminal proof requires Join, except an explicitly never-to-start worker. Pure
fixtures force close-first and start-first/blocked-worker interleavings.

ReaderState finalization is retryable until resources are confirmed released.
Native read handles are now explicitly leased/owned and closed via OwnedResource,
rather than silently equating FileStream disposal with a witnessed native close.
Pending close under a lease remains pending without a fabricated failure or
permanent one-shot latch. Actual close/cancel/EOF behavior remains unproved.

DrainStep distinguishes safely continued owned events from unsafe identity,
native continuation/API failure and exhausted budget. Rejected headers retain
bounded raw hex/tag/PID/TID before return, without controlling a foreign PID.
Job continues draining safe owned events with errors latched; physical exit/job
zero is distinct from EvidenceComplete. UnsafeRecoveryRequired stops claiming
cleanup and still requires an explicit bounded outer/controller failsafe before
source/child admission; that controller is absent, not implied by this helper.

First187-check build retained under withheld-first-build/ before a source review
caught an EOF mistake, without any native read execution. Selected source uses
ReadFile on a dedicated thread: ERROR_BROKEN_PIPE is EOF for the owned anonymous
pipe; successful zero-byte read is NOT closure, cancellation/other errors are
not EOF. Six added pure policy checks produce193. These are policy fixtures,
not actual pipe/API proof. [ReadFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile),
[anonymous pipe operations](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipe-operations).

Still absent: Run/creation identity/suspended assignment controller, startup
attribute allocation, normal loader-breakpoint rule, outer recovery and bounded
whole-session schema/classifier. Wire.Lossless remains known-ABI-graph only.
All six synthetic targets remain unattempted; staged target source uncompiled/
unreviewed. Freeze complete source/runtime/binary/config inputs and obtain
independent affected source admission before any constructor/API/child. No real
preview capture, trial-wide daemon lifetime, cause/fix/neutrality/performance/SOUND.
