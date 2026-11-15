# Owned-child native exception capture: feasibility and next protocol

Planning evidence revised 2026-11-15 04:04Z, not implemented or accepted capture.
Initial draft retained as NATIVE_CAPTURE_FEASIBILITY_R0.md. Independent critique
requires concrete descendant containment and nonblocking output collection.
Parent owns the single runtime slot. Existing actual sources/assets/Node version
and all eight jobs/three suites/120-launch requirements remain frozen. Phase A
NOT SOUND; no product optimization, score, automatic retry, merge or Pages.
Deadline 2026-11-16T02:40Z, final35 minutes from02:05Z.

## Observations and decision

Independent NATIVE_CAPTURE_INVENTORY_R1.md accepts only query-limited no-tool-found:
seven PATH names and30 explicit SDK/Sysinternals locations. No executable was
invoked. One additional prerequisite receipt under OLD
artifacts/perf-hillclimb/native-capture-feasibility-r1-20261115/ records six
explicit host/Node/compiler/native-DLL files as present, host64bit true,
PowerShell5.1.26100.9818. Files were only read/hashed; compiler/API availability
and capture capability are not proved by metadata.

Prefer a small artifacts-only C#/PowerShell observer using Windows debug APIs,
first proving its event/ownership mechanism with synthetic children. This is an
engineering choice, not evidence that it already works here. It avoids an
external tool prerequisite. ProcDump offers per-launch capture via -x and
unhandled-exception capture via -e; it also has distinct installation/EULA modes.
No download, installation or EULA action is selected. [ProcDump documentation](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump).

The minimum first prototype captures exception records, process exit and raw
streams, not a dump or symbolic stack. A later dump extension would be separate:
MiniDumpWriteDump is intended to run externally, has specific access/context
requirements and serial DbgHelp calls; passing no exception information does not
provide an exception stream. Do not silently claim a valid crash stack from an
unvalidated dump. [MiniDumpWriteDump](https://learn.microsoft.com/en-us/windows/win32/api/minidumpapiset/nf-minidumpapiset-minidumpwritedump),
[exception information](https://learn.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_exception_information).

## Documented mechanism and its limits

CreateProcessW supports an explicit executable, mutable quoted command line,
cwd, inherited environment and handle policy. DEBUG_ONLY_THIS_PROCESS scopes
debugging to the new process, rather than all descendants; using it at creation
avoids a later attach race. The observer must not accept an existing PID or use
image-name-wide debugger settings. [CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw),
[creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

The same creating OS thread must drive the bounded debug-event loop and continue
events. Exception events provide PID/TID, exception code/address/parameters and
first-chance state. The initial loader breakpoint must be distinguished from
actual failures; all other exceptions are passed unhandled, preserving normal
exception dispatch/termination. Explicitly record continuation decisions rather
than swallowing failures. [WaitForDebugEventEx](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugeventex),
[exception structure](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-exception_debug_info),
[ContinueDebugEvent](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-continuedebugevent).

Microsoft describes user-mode __fastfail as a second-chance noncontinuable
0xC0000409 exception with a reason parameter. The retained child EXIT STATUS
alone does not prove that exception mechanism or disclose the parameter. A real
captured exception would supply new evidence; it must not be inferred from the
old status. [__fastfail](https://learn.microsoft.com/en-us/cpp/intrinsics/fastfail).

Keep the default debugger-exit termination policy for its owned target; no
detach-on-failure that leaves a suspended child. Debugger API failure, timeout,
overflow, missing exit or unconfirmed cleanup is INCOMPLETE, never a non-crash
result. Creation handles and debug-event handles have distinct documented
lifecycles; image/DLL handles must be closed, and automatic event-handle closure
on continuation must not be double-closed. [Kill-on-exit](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-debugsetprocesskillonexit),
[debug-event handles](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent).

## Next implementation and admission boundary

Implement only a reusable owned-child event observer and synthetic control
target in a fresh OLD artifact folder. No actual preview startup yet. Use one
synchronous x64 C# method for create/wait/continue, with checked native struct
sizes/offsets and bounded decoding. Do not change process memory or exception
context. An absolute allowlisted executable/argv/cwd manifest must be validated
before creation, pin source/build/runtime inputs, create outputs exclusively,
and record actual target PID/creation time/image plus observer PID/thread.
Use retained process handles for termination/wait, not a later PID lookup.

For synthetic controls, create an unnamed, non-inheritable kill-on-close Job
Object with neither breakaway option. Create the owned target suspended and
debug-only-this-process; assign it to that job and persist identity before
resuming its primary thread. Assignment/nested-job failure stops before target
execution, terminates only the retained owned process handle and proves exit.
Job termination must occur on timeout, observer/API failure and normal closure;
query active-process accounting until zero within the cleanup cap. Do not infer
empty from a missing notification. Retain descendant PID/creation evidence in
controls and prove its exit. Default debugger kill-on-exit alone is insufficient
for non-debugged descendants. [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Use STARTUPINFOEX with PROC_THREAD_ATTRIBUTE_HANDLE_LIST containing only NUL
stdin and the two distinct pipe write handles; no inheritable job/read handles.
Close observer copies of write handles immediately after successful creation.
Each pipe has a dedicated bounded reader outside the creating/debug-loop thread,
continuously draining while events are serviced. Retain at most1MiB per stream,
count total bytes and flag any excess; overflow makes the outcome INCOMPLETE
and triggers owned-job closure, never a native/success result. Readers may drain
and discard excess while closure proceeds, avoiding a writer stall. After job
closure require EOF/reader termination within the cleanup cap, otherwise retain
an explicit unavailable/incomplete stream. Never block the debug loop on Read
or EOF. [Handle allowlist](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute),
[redirected-pipe lifecycle](https://learn.microsoft.com/en-us/windows/win32/procthread/creating-a-child-process-with-redirected-input-and-output).

Raw stdout/stderr must be distinct from observer JSON, with explicit availability.
Keep raw files and failures. Bound each control
to10seconds, event count2048, exception count128, raw output1MiB per stream and
receipt4MiB; timeout control cap1second. Outer control work cap90seconds, bounded
10second owned cleanup. Reject event/source/owner mismatches and overflow. Do not
take samples from the product during control development.

Before any control child launches: freeze implementation/compiled-target and
observer hashes, exact six control slots and expected outcomes; obtain
independent affected source/guard admission. Builder may compile and run pure
ABI/decoder/guard checks first, without invoking any debug API or child target.

Fixed six synthetic controls, once each, in this order (none attempted yet):
1. normal: exact known stdout/stderr, exit0, no qualifying fatal event;
2. nonzero: exit23, distinguished from a native exception;
3. synthetic-native: test-only RaiseFailFastException with explicit record and
   distinctive parameter; verify actual second-chance code/parameter and exit,
   not just a prefilled JSON field;
4. timeout: sleeping owned target and its synthetic descendant,1second cap,
   explicit timeout and proven exit of both via the already assigned job;
5. descendant: owned target confirms IsDebuggerPresent true while its one
   awaited synthetic descendant confirms false; no descendant debug events;
6. observer-failure: after a synthetic descendant is registered, a control-only
   deterministic observer error must close the job, prove both exits and mark
   INCOMPLETE, without disguising that cleanup as a captured target exception.

RaiseFailFastException accepts a supplied exception record, requires its code
and address and raises a second-chance exception. Its control is a synthetic
mechanism check, never reproduction of the preview bug. All child/descendant
identities and termination must be retained. [RaiseFailFastException](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-raisefailfastexception).

Pure negatives must reject wrong owner/image/cwd/source, malformed/raw missing
receipts, unexpected event PID, unhandled/hidden native outcome, missing exit,
timeout/overflow masquerading as success and repeated slot dispatch. Preserve
any failed control and stop; no replacement under the same ID.

After controls, independent actual-control acceptance is required. Only then
design/admit ONE fresh captured original-prefix diagnostic, preserving child
bytes/port-only replacement/fixture construction,40second child and300second
outer caps, existing exact owned fixture cleanup and all non-crash outcomes.
Actual-prefix containment needs a separately admitted TRIAL-wide job/lifetime,
preserving preview daemons across all original startup/reuse/cache assertions.
Do not close a helper-scoped kill-on-close job after each successful helper: it
would destroy its daemon and change the next original prefix action. This is
not solved by the synthetic-control-only job design. A later controller must
retain ownership across the whole prefix and prove bounded terminal closure;
no actual prefix launch until that separate lifecycle is implemented/admitted.
That launch wrapper, job/handle setup and debugger are a new diagnostic population;
they do not preserve the old execFileSync observation mechanism or establish
neutrality. No product timings, full-test PASS or faithful old-signature claim.
Broader main intended-reuse native events remain distinct from old linked cwd.

If compile/API/control prerequisites fail, retain the failure and select a
separately reviewed alternative. Do not install tools, enable global WER/IFEO,
attach to unrelated processes, or begin repeated preview trials as a fallback.
