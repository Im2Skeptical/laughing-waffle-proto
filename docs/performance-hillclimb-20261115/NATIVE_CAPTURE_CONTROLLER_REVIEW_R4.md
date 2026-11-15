# Complete controller r4 — scoped source admission

Independent gate owner `/root/harness_auditor`,2026-11-15T07:35Z. **ACCEPTED_SYNTHETIC_SOURCE_ONLY for the exact six-slot r4 plan.** No r4 native control has run. This is permission to test the changed diagnostic mechanism, not acceptance of actual Windows behavior, a fix to r3, preview capture or whole Phase A SOUND.

Read current STATUS, ORACLE_R4/PATCH_R4, actual README and full r3 actual-failure review. Reviewed the connected C#/PS/JS sources, new PE/MSF/DBI/public-symbol/decoder data path, loader/startup policy, handle ownership, rollback/error/deadline paths and actual checker. R3's failed normal cell and five unused slots remain immutable and must not run.

## Exact authorities and independent evidence

Actual OLD root `artifacts/perf-hillclimb/native-capture-controller-r4-20261115/`:

| Input | SHA256 |
|---|---|
| candidate-manifest.json | `4d53fe562628598ea6ef15c91040f076f3e7e2362d9144b1ae6693909712bc66` |
| plan.json | `b214566772d421c89df8bd4156cbf2560e843dd30b9359ced70d04c7f49167bb` |
| actual checker | `7f14cb4c05ab6a6b3fdd7d992b3546674705b0e4fbf8f0c76766bc5a78ca1bc1` |
| selected observer DLL | `c365f96227eb4ba5d6f976ff95ed4b54f829fb57d4a596f1fd4e8f4d8153b2ad` |
| selected target EXE | `8b6fe1a102a48a1e081e6ff05eb934b15b2de14292fec38933a81aa50bfa803c` |

Fresh OLD `auditor-native-capture-controller-r4-20261115/` retains:

- `authentication.json` SHA `f8f3698d8af97376a45b83bf7190adb08cf86a44e9c1c715c62690b0e8087cbb`:53 selected/plan inputs checked, including all45 plan pins, Node/host/ntdll/PDB/contract/prior evidence. No actual attempt/result/check/admission existed.
- `provenance.json` SHA `98868fab8e629b2116cb867d73356f604ba7349981f168bfa47435a3f51c8967`: independently cross-checked raw PE section/RSDS/runtime data and MSF directory/info/DBI/public record using a small separate block reader. Reconstructed the actual named role, range and body; exercised modern age and conservative decoder controls. No observed event address was supplied as a derivation input.
- `managed.json` SHA `150e7a128b766722763a7121a4e0f4b9f4fdf9f93db815165e6b9709982e1daf`: independent full observer compile0 at07:31:13Z;81 Builder managed checks reproduced and47 independent actual-policy/wait/ownership/marker controls passed. Independent DLL SHA `d0e26200d26f3a96fb2634cb4821aa50cacfddc9d566abbe1312ca42adadd3fa`. Builder fixture ran only in the fresh auditor root after copying loader-contract bytes there; original candidate fixtures/roots were not touched.
- `checker-controls.json` SHA `3679de7e1912ca760a3d109f1b576862783f2ef09053734502c3ec898e971bbb`: independently replayed the inspected declared67-case corpus against the actual frozen checker in a memory filesystem. All matched:12 accepts/55 rejects, exact30 prior definitions preserved and33 new causal rejection reasons verified. Adapter SHA `7f41b2feb325b4ba8df2866eb58bde285b03dcc0cfc33bf95615937bf3d33460`. These are replayed cases, not67 newly invented independent tests.
- Final `review-receipt.json` SHA `a124a85c0b7068149878b00dc1c145b1165b12e681d0e5a9b4f33e2b1267aaec`: links these proofs, rechecks every plan pin unchanged and all six real roots still unattempted.

## Loader provenance and policy disposition

Raw RSDS and PDB info GUID both read `bd4c2944e85567cdb3d56b689f03152d`; image/info/DBI ages are1/4/1. The independently read S_PUB32 function record has flags2 and named LdrpDoDebuggerBreak entry RVA0x125210. The unique runtime range is[0x125210,0x12524e); the62-byte body SHA is `b0d15223c10f0d345e73b469946eaf4e224ee1ab6cb3a4b1bb31ef0846bd1a32`. The supported instruction/direct-flow analysis gives reachable INT3 at+53 (RVA0x125245), excludes post-return+61, and resolves the one relative call to NtQueryInformationThread RVA0x166870. This is discovered from the named record and frozen image, not by looking up the old observed RVA.

The native-image age predicate is supported by [Microsoft's OpenValidate4 implementation](https://github.com/microsoft/microsoft-pdb/blob/master/PDB/dbi/pdb.cpp): signature/GUID match, info age at least image age, and nonzero DBI age matching image age. R4 conservatively rejects legacy DBI0 rather than claiming all old PDBs invalid. Independent cases accept info2/image1/DBI1 and reject older info, mismatched DBI and unsupported zero DBI. Earlier rejected-age evidence remains historical. The parser is accepted for these pinned bounded bytes/formats, not as a general PDB implementation.

The static reader's supported opcode lengths and direct branches agree with this actual small routine; unknown/truncated/cyclic encodings reject, and an INT3-valued immediate is not an instruction. Calls are assumed to return for this graph. This establishes static instruction provenance, not general x64 execution or the OS startup contract by itself.

Actual continuation additionally requires owned CREATE, matching module/base, exact derived trap, primary thread, first owned exception, first chance, startup marker absence and once-only state. The marker probe records an actual FileNotFoundException/code2 at the exact target identity path; directory-not-found, present marker or uncertain/error results cannot count as absence. The target source writes this marker before its declared work. Independent managed probe/policy controls and actual-checker wrong-address/padding/operand/stage/thread/repeat/stale-provenance cases support this narrow rule. Whether Windows reaches it in a fresh synthetic run is still falsifiable and unproved.

## Lifetime, oracle and bounds disposition

Creation-returned process/thread handles are duplicated under ownership before originals close. The system-owned CREATE process handle is independently duplicated and PID/FILETIME/image verified before continuation. The source distinguishes simultaneously live aliases from legitimate later reuse of a closed original's numeric value; ambiguous live aliases remain incomplete and avoid a second native close. System-owned event handles are not manually disposed. Raw origins, three duplication receipts and five owned release outcomes survive into the report and are reconstructed by the checker.

The post-continued-EXIT path now waits on that independent CREATE-event duplicate for up to1000ms within the original shared cleanup budget. Typed status/error-validity/requested/remaining/elapsed/source receipts replace the old bool-only zero-time probe. Independent delegated-wait controls cover signal, delayed signal, deadline exhaustion, timeout, WAIT_FAILED/unknown status, invalid ownership and successful-call stale error; only a timely owned signal completes. Failsafe calls preserve raw BOOL outcomes and valid errors. Declared six-cell successful paths require no recovery calls. Actual Windows duplication, signal latency, close, job and reader behavior remain pending native evidence.

Retained startup ResumeGate, original raw/EOF/classifier/terminal EXIT/fatal/rollback/descendant checks remain connected. Explicit failed/pending/missing close/identity/wait/recovery evidence dominates success flags. The checker independently derives loader data from frozen PE/PDB and cross-links exact phase/handle/wait receipts. Stale successful errors and post-close handle-number reuse are valid positives, not blanket error suppression. No material source blocker was identified in this bounded complete affected review; this is not proof of every possible OS/exception path.

Plan/next/invoke bind pinned Node/host/source/config/binary/provenance and consume one exclusive attempt per fixed slot. The original mode order,0 retries,35s per host,90s batch work plus8s stop/10s checker clipped108s configured terminal waiting allowance remain. These timer/source limits do not establish physical OS closure. Any failure/uncertainty stops later slots and requires owned recovery evidence before other runtime work.

## Admission scope and release

Admission permits the parent, after lease release, to execute **at most six fresh fixed r4 synthetic controls**, in order: normal, nonzero23, supplied-record native, timeout with descendant, normal non-debugged descendant, observer failure after verified descendant. Preserve exact plan/caps/roots/expected outcomes and every failure; no retry, replacement or r3 continuation. Changes invalidate this admission. Actual outcomes still need independent assessment.

Only compiler processes, managed fake-policy/clock/handle plus auditor-owned marker IO, and pure Node/raw-byte/VM checks ran. No native helper constructor, Native/ExtraNative/Api method, Run/Main, target, StopExactHost, browser or capture was invoked by this review. No download/install/global setting was performed. Product/model/RNG/schema/replay untouched. Real preview trial-wide daemon lifetime remains separately unadmitted; no native cause/fix, neutrality, performance, verifier PASS, scoring or whole SOUND claim.

Review complete and focused CPU lease released. Whole Phase A remains **NOT SOUND**; eight jobs/three suites/120 independent launches and deadline2026-11-16T02:40Z remain unchanged.
