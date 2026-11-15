# Repaired source, no live target admission

Fresh revision preserves lifecycle-r1. No target or Native/ExtraNative method has
run. Builder compiled and exercised only managed contracts/fake SafeHandles,
fake clocks, reader states and static continuation policy. These do not prove
actual Windows job/cancellation/EOF/debug-event behavior.

Repair boundaries:
- HandleLease pins SafeHandle lifetime with AddRef/Release. Job operations lease
  the job for their full operation, assignment also leases the supplied creation
  handle, writer exposure returns a lease for the whole future creation window,
  and cancellation takes its own retained reader-thread lease under owner lock.
- CleanupBudget is one monotonic object shared across job and both pipe phases;
  no extra500ms extension. A fake-clock budget explicitly cannot authorize native
  methods. CleanupDebugDrain is a concrete same-thread finite25ms event pump with
  bounded event/exception ledger, owned-header checks and NOT_HANDLED exception
  continuation; it is cleanup-only, not a normal loader-breakpoint policy.
- ReaderState separates close request, stopped/joined, finalization claim and
  resource-release confirmation. Active owner operations prevent finalization;
  live-reader disposal can finish on a later owner call. Worker signal/stream
  cleanup failures are retained rather than escaping its finally block.

Still incomplete: creation/controller/rollback, actual creating-thread/PID/image/
FILETIME binding, STARTUPINFOEX attribute allocation, normal capture/loader rule,
whole-session cleanup ordering and bounded schema/classifier. New lifecycle
objects/IntPtr/Int64/raw byte buffers must not be fed into the support's
conditionally accepted ABI-dictionary-only Wire.Lossless method.

The stream/native helper constructors are NOT pure. Build-pure.ps1 invokes only
PureChecks, HandleLease on a FakeResource whose release increments a managed
counter, fake CleanupBudget/ReaderState and static CleanupContinuation. It never
constructs RepairedJob/RepairedPipe/CleanupDebugDrain. Compiler and managed
fixture threads run; zero target processes are dispatched by these fixtures.

Return frozen source/pure results for independent affected review. No source/
child admission follows from128 Builder checks. All six synthetic target slots
remain unattempted and need the complete frozen observer/target manifest and
independent source admission. No real preview capture: trial-wide daemon lifetime
remains a separate gate. No native cause/fix/neutrality/performance/SOUND claim.
