# Next bounded implementation: owned-child observer, no target run

Read STATUS.md first. Deadline 2026-11-16T02:40Z; all eight jobs/three suites/
120-launch gates unchanged; Phase A NOT SOUND. Parent owns one runtime/source
slot; independent Auditor gets scoped source/pure review with no competing run.

Prerequisites: NATIVE_CAPTURE_INVENTORY_R1.md,
NATIVE_CAPTURE_FEASIBILITY_R1.md and NATIVE_CAPTURE_FEASIBILITY_REVIEW_R1.md.
Feasibility supports SOURCE/PURE implementation only, not child admission.
Treat the review's obligations as part of the spec, including termination/query
while the owned job handle is valid, followed by close, not query after close.

Frozen ABI/decoder foundation in OLD
artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/:
NativeCaptureAbi.cs and24 builder pure checks. Build manifest
d1aa623eb08f2711802f45563379e77a5fba63075ee1f36fba78801dbb6631f8
pins source/check bytes and confirms683sources/5compiled assets unchanged.
Do not overwrite its receipts or silently describe it as a native OS/capture
proof. Reuse pinned source from a FRESH implementation artifact folder.

Next implement the observer's manifest/ownership guard, x64 Win32 declarations,
suspended owned creation + pre-resume job assignment, explicit inherited-handle
list, bounded separate stdout/stderr reader mechanism and synchronous same-OS-
thread event loop. No preview fixture or target launch in this construction
chunk. Build-only mode must not invoke a native/debug API or source initializer
that launches a process; compilation itself is allowed and recorded.

ABI review obligations: retain UInt64 addresses/handles/exception parameters as
fixed-width hexadecimal strings on any JSON/JavaScript wire; do not silently
round them through JavaScript Number. The current managed decoder conservatively
rejects firstChance values above1; Microsoft documents nonzero as true, so an
unexpected such value must remain INCOMPLETE, never become a non-crash verdict.

Keep initial loader breakpoint distinct from real exception dispatch and retain
the complete bounded exception code/address/parameter/chance/continuation ledger.
Do not modify target memory/context. Use finite waits; continue required debug
events during cleanup so a pending target exit cannot block job closure/query.
Keep API errors/timeout/overflow/missing-exit/unconfirmed cleanup INCOMPLETE.
Do not rely on PID reuse-prone lookups, missing notifications or pipe EOF alone
for lifecycle proof. No existing-process attach or global debugger/registry.

Synthetic target and six fixed controls are in the revised feasibility protocol:
normal, nonzero, supplied-record native, timeout-with-descendant, normal
non-debugged-descendant and observer-failure-with-descendant. Prove descendant
existence BEFORE claiming its cleanup. Bind observer/target sources, compiled
bytes, runtime inputs, exact manifests/IDs/order/caps and fresh output roots
before independent affected SOURCE admission. Only then may parent run those
controls serially, once each. Preserve failed/unexecuted slots; no replacement.

Do not run the original preview prefix yet. Its daemons must survive across
helper invocations, requiring a separate trial-wide containment/lifetime design
and admission. Closing a helper's job would change the original subsequent reuse
and cache assertions. All observer/job/handle changes form a distinct diagnostic
population, not a product timing, neutrality claim or old-signature reproduction.

Keep smallest reviewable source cuts. If this chunk cannot finish the launcher,
persist exact source/build/pins, incomplete pieces and ownership; do not attempt
a partially admitted child run. No optimizing/scoring/merge/Pages.
