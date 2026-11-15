# Final registered verification failure

**Overall npm run verify: FAILED, not waived.** Source remains frozen. This is
verification/cleanup evidence, not a performance experiment or a product fix.

Old `artifacts/perf-hillclimb/final-proof-20261115/` owns all receipts below.

## Original registered attempt

`verify-final-r1.log`, exit receipt1, launch01:48:59Z, parent tool session50321,
shellPID3552. Docs, architecture, source reachability, assets and build passed.
The registered preview test failed at `scripts/build-preview-test.mjs:87`,
executing `scripts/local-preview.mjs` from a temporary linked worktree. Child
26332 exited3221226505/0xC0000409, null signal, empty stdout/stderr. The chained
badge check and `npm test` were not reached.

The test replaces its COPIED preview script's first port with an ephemeral
candidate; it does not use this checkout's occupied5184–5195 review-preview
pool. No causal attribution to that known default-pool startup failure is made.
The test source itself is unchanged from the original683-file checkpoint.

## One isolated original-test reproduction

Ran unchanged `node scripts/build-preview-test.mjs` once, tool session89878,
rootNode11304/shell10516, started01:54:52Z. Same native child failure reproduced
at line87: helper18652 exited0xC0000409 with empty output. Its detached task-b
preview39864 remained at temporary fixture
`civilization-build-preview-TqnM7H/worktrees/task-b`, port56868. The parent
stayed pending without a child or TCP connection while that server listened.

Preserved bounded temporary logs and exact process/time/command ownership in
`isolated-preview-tree.json`, `isolated-preview-active-inventory.json` and
`isolated-preview-owned-cleanup.json`. Source-log hashing was denied by its open
file handle; the copied log has a separate hash in
`isolated-preview-copied-log-receipt.json`. No source-hash success is fabricated.

The cleanup hypothesis predicted that stopping only the owned detached server
would unblock the parent and reveal its original exception. After matching its
PID, parent, creation time, exact fixture path and port, stopped39864 only at
02:01:51Z. Parent returned the native error within the next0.66s. This supports
the cleanup blockage; it does **not** identify or fix the preceding native crash.
The isolated test is FAILED with an explicit external cleanup intervention,
never an unmodified PASS. No third preview/full-verifier rerun is planned.

Three other temporary preview servers14852/35516/39104 were created on
November13, outside this attempt; all were preserved. The confirmed recovery
inventory distinguishes them. `isolated-preview-released.json` records no
remaining current-attempt candidate after cleanup. The original unknown native
coverage attempt stays separate; shared exit code alone establishes no cause.

## Remaining checks and delivery limit

Run the previously unreached badge check and `npm test` separately, capturing
their own final logs/exits. This completes available check coverage without
silently bypassing the failed preview test. Overall registered verification
remains FAILED regardless of those results. Their final result belongs in
STATUS.md/RUN_PACK.md; no repeat without a new cause.

Repeat source/asset/all1,904 frozen-evidence authentication after the final test
closes. Refresh the actual local preview/badge/LAN receipt. No workflow scanner,
Node version, product source, gameplay/pacing or measurement oracle was changed.
No full harness SOUND, performance score/gain or verified integration follows.
No coherent verified PR is prepared while the registered check and inherited
full-harness gates remain open. No merge or Pages publication.
