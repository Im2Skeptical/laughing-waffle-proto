# Trial-wide lifetime r1: incomplete synthetic-first source cut

Chosen architecture: one root created with DEBUG_PROCESS in one unnamed,
nonbreakaway kill-on-close job. Created synthetic children share that trial job;
helper exit does not tear it down. One creating OS thread will service the
whole debug tree. This is NEW scope, not r4 admission or a preview mechanism.
Microsoft documents DEBUG_PROCESS child-chain behavior and the precedence of
DEBUG_ONLY_THIS_PROCESS. [Creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

This first cut contains TrialTarget.cs and a bounded managed TrialBook. The
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

INCOMPLETE: no tree event adapter, trial controller, result oracle, full runner/
plan, real control roots, candidate manifest or admission. Copied r4 native
wrappers are UNMODIFIED and still debug-only-this-process and shared-marker
logic; they are not the chosen architecture's executable implementation.
Do not invoke them. No source review of this partial cut is requested.

Exact next source cut is documented in SOURCE_RESUME_R1.md and coordinator
NATIVE_TRIAL_LIFETIME_SOURCE_RESUME_R1.md. Finish the complete connected source/
compile/pure/oracle/config candidate, then ONE independent affected source
review before fresh synthetic native controls. Independent actual two-helper
lifetime/failure acceptance plus a separately frozen real plan must precede
ANY preview. R4's six consumed cells and r3 failures/unused cells stay frozen.
Whole Phase A NOT SOUND; no original native cause/fix, debugger neutrality,
full verifier PASS, performance gain, scoring, merge or Pages.
