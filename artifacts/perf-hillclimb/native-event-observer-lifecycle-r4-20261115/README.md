# Lifecycle r4 constructor-rollback source, no native admission

Fresh r4 preserves r3/r2/r1. R3's three managed mechanisms were independently
supported (193Builder reproduced,229own managed checks,8source checks); native
controller/cleanup behavior was not proved. R4 addresses its concrete new setup
gate: the ready event is no longer allocated before CreatePipe can fail.

After successful pipe creation, handle adoption, inheritance setup, readiness
event and managed worker allocation are inside a contained setup catch. The
actual SetupRollback method attempts all allocated IDisposable resources in
reverse order, preserving the primary setup error and any thrown disposal errors.
Five additional managed fixture checks give198 total. They do not invoke a
native constructor/failure or prove native close results; SafeHandle return-only
close failures and catastrophic allocation/OS behavior remain native/controller
error-accounting obligations, never accepted cleanup by assumption.

Selected build-pure.ps1 compiles a library and runs managed fixtures only. No
RepairedJob/RepairedPipe/CleanupDebugDrain construction, Native/ExtraNative call,
target/capture/preview. No executable runner or child admission exists.

Full controller still absent: validated immutable creation/identity/FILETIME,
suspended assignment, handle-list setup, normal loader/EXIT handoff, unsafe-drain
outer failsafe, bounded receipt/schema/classifier and source/admission guards.
Six synthetic slots remain unattempted. Their separate staged target source is
uncompiled/unreviewed. Real preview trial-wide daemon lifetime remains unsolved.
No global settings/install, native cause/fix/neutrality/performance/SOUND claim.
