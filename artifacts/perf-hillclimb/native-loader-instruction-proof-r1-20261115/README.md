# Frozen loader instruction boundaries: Builder static evidence only

Fresh pure data proof; no downloads/native API/DLL load/target/compiler/browser/
benchmark. Inputs are the r2 static provenance and its authenticated image/PDB
chain. Original r1 age rejection and actual r3 normal-cell failure remain frozen.

decode.mjs supports only the x64 encoding subset needed by this routine: one
optional REX prefix, specified ModR/M/SIB/displacement forms, group-immediate
MOV/arithmetic, register-immediate MOV, LEA/TEST, rel32 CALL, rel8 branches,
INT3 and near RET. Unsupported prefixes/opcodes, invalid supported groups,
truncation, non-boundary targets and local cycles reject. It decodes the entire
bounded body, then follows direct local control flow from entry. CALL nodes
have local fallthrough; this graph assumes calls return and does not execute
or prove their OS timing/side effects. The proof separately binds its only
call target to the NtQueryInformationThread export in the same frozen PE.

Intel documents the x64 instruction fields, REX, ModR/M/SIB, displacements,
immediates and instruction opcodes. [Instruction reference volume2](https://cdrdv2-public.intel.com/825760/325383-sdm-vol-2abcd.pdf).
This is a conservative subset reader requiring independent verification, not
a general disassembler. Fourteen Builder controls cover legitimate flow,
immediate CC bytes, unreachable post-return trap padding and malformed inputs.

prove.mjs authenticates source/controls, the prior complete static provenance,
image body and reviewed PE export parser. It derives the single reachable INT3
from the decoded function before comparing the original exception address.
It preserves every instruction and reachable/unreachable trap offset; no
observed address constant is used as the predicate. A matching symbol/body/CFG
still does not establish the startup continuation contract or debugger neutrality.

Future controller work must bind the frozen symbol/image/derived instruction
provenance with strict initial CREATE/module/startup phase, owner/primary thread,
first-chance/once rules and arbitrary-break negative controls. The separately
required owned wait duplicate/typed bounded postEXIT receipts are unfinished.
Return the complete affected controller/provenance candidate for independent
source acceptance before any new native case. No r3 retry/continuation/replacement.
Whole Phase A NOT SOUND; no performance gain, scoring, preview, merge or Pages.
