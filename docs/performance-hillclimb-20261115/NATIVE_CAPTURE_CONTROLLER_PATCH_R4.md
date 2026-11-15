# Next complete source revision after the failed r3 normal cell

Read STATUS, clock and ownership first. Work in the old perf checkout only.
Hard deadline 2026-11-16T02:40Z; final 35 minutes from02:05Z. Whole Phase A
NOT SOUND; eight jobs/three suites/120 launches unchanged. No optimization,
scoring, merge or Pages. Preserve all old sources, binaries, failures and roots.

Read NATIVE_CAPTURE_SYNTHETIC_REVIEW_R3.md in full. R3's first native normal
cell failed and stopped the batch; its five later slots must never run. No
existing slot may be retried/replaced. Current work is a changed source proof,
not a rerun of the unchanged verifier or an original preview crash reproduction.

Two connected changes are required in one fresh complete controller revision:

1. **Loader provenance and strict startup policy.** The assumed DbgBreakPoint
   export is not the observed startup site. Fresh static Builder evidence is in
   OLD native-loader-symbol-provenance-r1-20261115/ (initial age-rule rejection
   and sole PDB download), -r2-20261115/ (offline documented age-rule repair),
   and native-loader-instruction-proof-r1-20261115/. R2 provenance SHA
   1eed7f6d54e7ee6cdaf793f2787c80f6db34bf2256576d81e71b7045911281c3.
   Instruction proof SHA
   4a632f1ab80f309f7a6d0cec9f232b8e2d567783e15bd3736372778799bf7463.
   The matching public symbol is LdrpDoDebuggerBreak, runtime function
   [0x125210,0x12524e), body SHA
   b0d15223c10f0d345e73b469946eaf4e224ee1ab6cb3a4b1bb31ef0846bd1a32.
   The conservative subset reader derives one reachable INT3 at offset53,
   RVA0x125245; offset61 is unreachable post-return padding. Its one call
   matches NtQueryInformationThread export RVA0x166870. All are Builder evidence,
   NOT independently accepted facts or a safe continuation policy. Reconstruct
   the chain from actual pinned PE/PDB/sources; do not merely trust these numbers
   or hardcode the observed RVA. Bind the derived instruction, exact image/body/
   symbol identity, owned initial CREATE/module phase, primary thread, first
   chance, startup stage and once-only state. Every other breakpoint remains
   NOT_HANDLED. Add wrong-address (including padding/operand bytes), stage,
   thread, repeated/arbitrary-break and stale provenance controls. Preserve the
   original checker negatives. Source and oracle must use the same frozen
   declared rule with independently reconstructable original evidence.

2. **Independent post-EXIT wait ownership and typed completion.** Follow the
   documented duplicate of the CREATE debug-event process handle before EXIT
   continuation. Retain handle origin/value, creating PID/FILETIME/image,
   aliases and independent duplicate identity. Distinguish owned creation and
   duplicate handles from system-owned debug-event process/thread handles;
   never manually double-close an auto-closed event handle. Record release
   outcomes without assuming whether old creation/event handles aliased.
   Replace bool-only zero-time probes with typed phase/raw wait status,
   error-validity/value, requested wait and elapsed/shared-budget receipts.
   Give normal shutdown a bounded signal wait within the original shared
   cleanup deadline before escalation. WAIT_FAILED/timeout/missing ownership
   stay incomplete. Preserve raw failsafe outcomes; successful BOOL calls do
   not make stale last-error values failures. Pure controls must cover signaled,
   delayed signal, timeout, WAIT_FAILED, deadline exhaustion, missing/aliased/
   auto-closed handles and successful-call stale errors.

Static identity details: the downloaded PDB is1921024 bytes, SHA
26d65ee88992ad9c3b258142f7dd3aac3b56f9e271587d9043d01dab3552163c.
PE age1, PDB info age4, DBI age1. Microsoft OpenValidate4 documents GUID equality,
infoAge>=imageAge and DBI age equal to image age. The offline r2 reader requires
exact nonzero modern DBI binding; legacy DBI0 stays unavailable. All14 original
fixture names/mutations remain, with the info2/image1/DBI1 expectation openly
corrected from reject to accept; four affected age controls added,18 pass.
Instruction subset14 controls pass. Both parser/decoder and the changed age
predicate need independent scrutiny within the complete affected-source review.
No additional download is needed; use the frozen bytes. No install/settings/API.

Prefer one complete source/compile/pure cut, then ONE affected independent
review rather than isolated helper review series. Parent owns sole CPU/test
slot and stops its own work during Auditor's focused lease. Do not invoke a
native helper constructor/API/Run/Main/target/stop while implementing repairs.
Only a fresh frozen plan/provenance and independent technical source acceptance
can authorize a new fixed native normal diagnostic; failed r3 remains failed.
Any future full six-cell plan preserves all original meanings/order/caps and
outcomes. Real preview still requires separate trial-wide daemon lifetime.

If the complete repair is unfinished at a chunk boundary, persist exact source
paths/build errors/remaining cut/leases. Do not fabricate admission, closure,
cause/fix, neutrality, verifier PASS, product gain or whole SOUND.
