# Trial-wide lifetime r1: incomplete synthetic-first source, raw-checker cut r3

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

build-adapter-r3.json / TrialAdapter-r3.dll is the preserved adapter-only build: compile0,
38 lifecycle +81 connected binding/job/phase managed controls PASS. R1 had73
binding controls; r2/r3 have81. Each build/snapshot/log is immutable, with new
names for each changed cut; no failed compile/control result was hidden.
These are managed call-seam controls, NOT a complete connected tree event loop.
The pre-adapter-r1-source/ snapshot also preserves eight original working files;
pre-policy-r0-source/ and adapter-r1/r2/r3-source/ preserve their exact builds.

Tree cut r2 adds TrialTreeEvents.cs: connected exact raw-byte multi-PID dispatch
and same-thread per-poll Wait/Continue seam, root plus child binding table,
separate loader startup/once/first/primary/per-PID-marker phase, typed module/
file close receipts, system thread/process handle lifetime, exact failed pending
event retention, bounded raw ledger and wait/process/thread/exception/event caps.
TrialNativeEvents.cs provides the REAL event-call implementation in source;
its constructor/APIs remain UNINVOKED. PureTreeChecks exercises SAME dispatcher
and process bindings with native-sized raw bytes and fake calls. It proves
managed sequencing, not actual child debugging or kernel/daemon lifetime.
build-tree-r2.json/TrialTree-r2.dll preserves the tree-only cut:compile0,38 lifecycle +81
binding/job/phase +63tree controls PASS. Tree-r1 compiled0/43tree controls; its
exact source/snapshot/recipe/log/binary/receipt is immutable. No failed compile/
control hidden. Old adapter-r3 remains preserved, not current.

Tree limits declared before native:4096events plus at most one retained rejected
raw header,16processes,256created threads,total256/per-process128exceptions,
8192polls,8MiB event ledger plus terminal failure record,25ms max poll. Freeze
all these and remaining report/host/batch caps in final config/manifest before
source admission; no data-dependent changes. No native control was consumed.

Controller cut r2 adds TrialController.cs +TrialNativeOwner.cs. SAME controller
executes fake/native owner seams: suspended job assignment/readers-before-resume,
root10s work, ONE final10s cleanup, termination/tree EXIT drain, all retained
process waits plus distinct EXTRA root wait, EOF only after EXIT continuations,
all handle releases/final owner-held job query before job close. Raw typed
failures/deadlines sticky; unsafe/unbound paths use non-blocking stream abort and
explicit HostExitRequired/incomplete. No arbitrary PID kill/detach/recovery here.
SUPERVISED HOST EXIT IS STILL UNIMPLEMENTED in the future runner; do not invoke.
The concrete native owner constructors/APIs remain UNINVOKED. Managed owner
controls reuse SAME dispatcher/bindings with native-sized fake event bytes.
build-controller-r2.json/TrialController-r2.dll preserves the controller cut:compile0,38lifecycle+
81binding/job/phase+63tree+76controller controls PASS. Controller-r1compile0/65
controls retained, exact snapshots/recipes/logs/binaries/receipts immutable.
ContainmentComplete is a source state result, NOT physical native proof or
functional target-file acceptance. No native or target attempt consumed.

Report cut r4 adds bounded flat original target-file reader/parser, exact schema/
PID/FILETIME/image/role/debugger/parent/start/return/reuse/exit linkage classifier,
and explicit registered-record lossless projection/report writer. UInt64 becomes
hex, Int64 decimal string, raw bytes separate files, no arbitrary POCO or cycle.
File8KiB/64target files/128directory entries, report16MiB/raw1MiB-stream/error8KiB
caps declared before native. Virtual originals and ordinary managed IO fixtures
only, no target/API. Actual result checker/technical acceptance still MISSING.
build-report-r4.json/TrialReport-r4.dll selected:compile0,38+81+63+76previous+
59report/parser/linkage/projection/IO controls PASS. Report-r1compile0/49PASS.
R2compile0/report checks NOT RUN due cloned IO identity collision; r3compile0/
report controls FAILED on unpaired surrogate normalization to U+FFFD. Both exact
failed receipts/snapshots retained. Narrow managed reproduction retained in
parser-failure-r3-diagnosis.json. R4 validates raw escaped surrogate pairing
before decode, accepts valid pair, rejects lone surrogates. This is parser
repair, NOT original native crash cause/fix. All evidence immutable/new IDs.

Checker source cut adds check-raw-tree.mjs: separate original176-byte decoding,
raw/decoded/wait one-to-one consistency, per-process identity/x64/job/duplicate,
system handle lifetime/alias/image closes, NTDLL/RVA/first/primary/once/marker
and continuation reconstruction. RAW_TREE_ONLY; returned completeCellAcceptance
is ALWAYS false. Caller-supplied root creation/event-wait/job/runtime/file inputs
are EXPLICIT UNVERIFIED BOUNDARIES, not evidence accepted by this component.
R1raw controls46(6accept40reject), R2/R3raw52(7accept45reject) PASS. R3uses new
strict-evidence-json inlet: duplicate keys/unsafe integers/invalid Unicode/
structure/byte caps rejected,28controls(5accept23reject) PASS. Raw/C#sources
and original fake report remain immutable; proof source snapshots preserved.
No native/target run, no audit/source/whole-cell acceptance or scoring.

INCOMPLETE: composed actual result oracle with owner/wait/budget/EOF/raw/host/
runtime/source/target-file validation and causal fixtures,
FrozenTrial config/runner/plan/supervisor/manifest/source
admission/control roots. Partial initialization/unsafe pending requires the
new bounded host-supervisor contract, not false zero/EOF or source self-admission.
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
