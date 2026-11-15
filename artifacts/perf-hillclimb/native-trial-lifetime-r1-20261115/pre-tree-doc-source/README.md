# Trial-wide lifetime r1: incomplete synthetic-first source, adapter cut r3

Chosen architecture: one root created with DEBUG_PROCESS in one unnamed,
nonbreakaway kill-on-close job. Created synthetic children share that trial job;
helper exit does not tear it down. One creating OS thread will service the
whole debug tree. This is NEW scope, not r4 admission or a preview mechanism.
Microsoft documents DEBUG_PROCESS child-chain behavior and the precedence of
DEBUG_ONLY_THIS_PROCESS. [Creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

This source family contains TrialTarget.cs and a bounded managed TrialBook. The
target starts a first helper which starts a daemon and returns0. Root observes
that same daemon alive after the helper exit. Reuse mode starts a second helper
which sends a sequence2 request and verifies the same daemon PID/FILETIME/reply,
then returns0. Failure mode returns23 after the first helper. Root leaves the
daemon for final trial-owner cleanup. All synthetic processes require native
debugger presence and write separate identity-PID.json files atomically before
their declared work. No Node/Git/PowerShell or real preview target is allowed.

Synthetic predeclared source limits: root10s, final shared cleanup10s, each
target helper/ready/reply wait3s,100ms between reuse helpers, daemon fallback20s
(exit96 is a failed cell, never cleanup),16processes/4096events, root raw1MiB
per stream. Remaining total receipt/exception/batch/host caps and exact manifests
must be finalized before source admission, without moving them after data.

TrialBook enforces verified PID/generation/image/job registration, bounded
process/events, one exact pending continuation, continued CREATE/EXIT lifetime,
no cleanup on helper exit, root-exit cleanup transition, owned postEXIT waits,
release ordering, monotonic shared-budget observations, native job-zero/close
and raw EOF gates. Native raw evidence must still be retained by the adapter;
the state model is not independent physical proof.

build-policy-r0.ps1 compiled TrialPolicy-r0.dll and TrialTarget-r0.exe with
compiler exit0/0;38 managed state/wait/failure controls passed. Target entry
metadata was inspected; Main NOT invoked. pre-policy-r0-source/ preserves the
exact first sources. No native helper constructor/Native/ExtraNative/Api/Run/
target/stop/browser/benchmark ran. Framework/compiler/file IO is ordinary proof
work, not a debug session. Product/model/RNG/schema/replay unchanged.

Adapter cut r3 changes ONLY the fresh copies: root creation now DEBUG_PROCESS
through IProcessLaunch, per-PID startup marker receipts, raw typed job membership/
query/termination, borrowed CREATE identity/x64/image/job probes and independent
owned wait duplicate/release. TrialProcessBinding uses the SAME call seam for
native implementation and connected managed fake-call controls. Unknown images
are not hashed; selected self image is size-bounded16MiB and read without write
sharing. Selected native adapter must receive frozen path/hash/byte size.
Actual native calls/constructors remain UNINVOKED. Owned resource, root/job/pipe
release evidence now preserves raw close last-error and its validity.

build-adapter-r3.json / TrialAdapter-r3.dll is the current source build: compile0,
38 lifecycle +81 connected binding/job/phase managed controls PASS. R1 had73
binding controls; r2/r3 have81. Each build/snapshot/log is immutable, with new
names for each changed cut; no failed compile/control result was hidden.
These are managed call-seam controls, NOT a complete connected tree event loop.
The pre-adapter-r1-source/ snapshot also preserves eight original working files;
pre-policy-r0-source/ and adapter-r1/r2/r3-source/ preserve their exact builds.

INCOMPLETE: no multi-PID Wait/Continue event loop, concrete typed module/file
adapter or per-process phase dispatch, trial controller/final recovery, result
oracle, full config/runner/plan, control roots, candidate manifest or admission.
Old SINGLE-PID CleanupDebugDrain/TerminateAndConfirm must not be used for the
tree. Do not invoke native wrappers. No source review of this partial cut.

Exact next source cut is documented in SOURCE_RESUME_R1.md and coordinator
NATIVE_TRIAL_LIFETIME_SOURCE_RESUME_R1.md. Finish the complete connected source/
compile/pure/oracle/config candidate, then ONE independent affected source
review before fresh synthetic native controls. Independent actual two-helper
lifetime/failure acceptance plus a separately frozen real plan must precede
ANY preview. R4's six consumed cells and r3 failures/unused cells stay frozen.
Whole Phase A NOT SOUND; no original native cause/fix, debugger neutrality,
full verifier PASS, performance gain, scoring, merge or Pages.
