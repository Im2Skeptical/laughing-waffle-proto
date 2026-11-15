# Native preview-startup feedback loop - extension chunk 1

Cam explicitly extended the deadline24 hours to2026-11-16T02:40Z. Previous
five-hour evidence remains frozen; no old plan or failed receipt is overwritten.
Parent owns the sole runtime/CPU/test slot. Independent Auditor may review
source/controls only while parent builds; no competing tests or benchmarks.

## Exact unresolved symptom

Registered preview test and one isolated unchanged reproduction both failed in
the linked-worktree start() at build-preview-test.mjs:87: helper Node exited
3221226505/0xC0000409, null signal, empty stdout/stderr. In the reproduction its
detached task-b server remained alive; stopping only that owned server unblocked
cleanup and surfaced the original error. Native cause remains unknown. Three
unrelated November13 fixture previews and real preview5202 must be preserved.

## Ranked falsifiable candidates, not findings

1. Concurrent status probes/abort lifecycle: if this path drives the native
   failure, a later matched diagnostic copy using serial rather than concurrent
   probes should change reproduction while preserving probe count/subject inputs.
2. Detached child/unref/log-descriptor shutdown: if this boundary drives failure,
   a later single-boundary diagnostic ablation should change it while status
   probes and metadata remain the same. No production workaround yet.
3. Linked-worktree metadata handling: if this is required, same-source independent
   fixture repos at matched paths should differ from real linked worktrees.

FIRST establish a bounded red-capable original-prefix loop; do not run these
ablations or choose a fix before that. Small-sample non-reproduction is not a fix.

## One original-prefix run

Fresh old artifact root native-preview-prefix-r1-20261115. Preserve the original
build-preview-test prefix through its linked-worktree loop, including initial
startup/reuse, identity/cache edits and waits, both task worktrees and version
rejection checks. Omit only later checks after the already-observed failure site.
Use unchanged copied preview/build-info/version/fixture helpers and the original
isolated ephemeral12-port replacement. Pin all original sources and copied
subject bytes. Node staysv24.15.0; no runtime upgrade or app/source edit.

Wrap original synchronous start() call only to retain each raw exit/stdout/stderr
and caller cwd before propagating its original error. Preserve the original
40-second helper limit and stop prefix at first failure, as original test does.
Native exit outside linked startup or with different output remains distinct.
Host wall times are liveness diagnostics, not product latency or comparison.

Exact prior signature requires linked-worktree cwd, unsigned native0xC0000409,
null signal and empty stdout/stderr. Native elsewhere, timeout, assertion/setup
failure, host termination or missing evidence is NOT that successful reproduction.
All-normal completion means NO REPRODUCTION, not fixed/accepted/fast.

## Ownership and bounded cleanup

Register the fresh mkdtemp fixture root before starting children. Do not recursively
delete it during the loop; preserve it as debug evidence, avoiding the known
cleanup blockage. Stop only Node --serve processes whose exact command contains
that registered absolute fixture root and whose creation is after this attempt.
Validate the resolved fixture root is an immediate child of OS temp with the
expected civilization-build-preview- prefix. Never stop other preview servers.
Capture bounded owned logs, cleanup errors and remaining owned process IDs.

Outer work cap300seconds plus bounded cleanup reserve. On expiry kill only the
spawned probe tree, settle the wrapper and independently clean its registered
fixture servers. Missing/unconfirmed cleanup blocks another runtime. Retain all
interrupted outcomes. No unbounded Windows recursive delete or other-worktree
operation. Preserve app/dist, all683 frozen sources and original1,904 artifacts.

Parent builds this diagnostic only under artifacts; an independent affected
source/guard review precedes the run. No self-acceptance, scoring, neutrality,
product optimization, full verification pass or native root-cause claim follows.
Next chunk depends on the actual bounded result, not rerun-until-green.
