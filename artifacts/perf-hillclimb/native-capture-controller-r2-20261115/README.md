# Connected native capture controller r2: source candidate only

Fresh repair of the independently withheld r1 candidate. No native helper
constructor, native API, controller Run, target Main, debug session, control or
capture has been executed. All six real control roots are UNATTEMPTED;
admission.json is absent. Compiling and inspecting managed target metadata does
not establish actual Windows ABI, reader EOF, cancellation, job or close behavior.

Selected build: build-final-only.ps1, CaptureController-final.dll,
SyntheticCaptureTarget-final.exe and build-pure-final.json. Both compiler exits
are zero; 47 managed policy/sequencing/rollback checks passed. The synthetic
exception record is 152 bytes by managed metadata inspection only.

pure-checker.mjs runs the actual r2 checker body with a memory-only filesystem.
It preserves all 20 named r1 independent virtual cases and their mutations:
six coherent mode receipts accepted; fourteen invalid variants rejected,
including the eight previous false acceptances. The r2 coherent fixtures add
the original evidence newly required by the oracle. These results and fixture
adaptations are Builder evidence, pending independent review.

Connected repairs:
- Reader startup returns typed snapshots. The actual controller resnapshots both
  streams and uses ResumeGate to require ready/live/owned/error-free startup
  before one resume. Failed, absent or late startup prevents resume.
- Failed constructors throw retained rollback receipts, including returned-only
  native close failure/pending states and partial handle adoption. Unconfirmed
  release remains incomplete; primary failure identity is retained.
- Observer-failure injection occurs immediately after verified descendant Poll,
  before another debug wait, and retains a phase witness.
- The checker reconstructs CREATE/loader/EXIT order, continuation, fatal counts,
  mode-bound host code and descendant evidence. It derives DbgBreakPoint RVA
  independently from pinned ntdll bytes using the bounded read-only PE parser.

Witness files have an 8192-byte cap and at most 32 transient read retries. Poll
uses one background managed read task and does not block the debug loop awaiting
that task. The work deadline is checked on both sides of Poll; an outstanding
task/error is retained as incomplete rather than successful descendant proof.
Actual OS scheduling/filesystem completion is not proven by this source design.

The fixed six controls retain their original meanings and order: normal,
nonzero23, supplied-record native exception, timeout with descendant, normal
non-debugged descendant, observer failure after verified descendant. No retry or
replacement. next.mjs requires independent plan-bound admission. The batch has
a 90-second work allowance plus up to 8 seconds exact-owned-host stop and
10 seconds checker, clipped to a configured 108-second terminal deadline.
An outer host stop is not proof of descendant, raw EOF or ownership closure.

plan-before-source-controls.json preserves the first prepared r2 plan; plan.json
adds the checker/PE/pure sources and explicit work/terminal bounds before any
admission or attempt. candidate-manifest.json freezes the selected complete
revision. Preserve r1 source, binaries, roots and negative evidence unchanged.

This is a diagnostic population only. No product gain, performance score,
native cause/fix, debugger neutrality, real preview capture or whole Phase A
SOUND claim is made. Real preview work still needs its separate trial-wide
daemon lifetime design preserving the original startup/reuse/cache actions.
