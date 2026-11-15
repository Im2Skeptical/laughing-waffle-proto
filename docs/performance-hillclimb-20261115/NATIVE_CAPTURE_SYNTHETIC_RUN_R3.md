# Conditional parent execution: six synthetic cells

Prepared while the r3 independent affected recheck is active; this document is
not source admission. No native cell has run. Follow current STATUS and the
reviewer's exact verdict first. Parent must have the sole runtime slot, all
Auditor compiler/pure work exited, and no existing active/incomplete dispatch.

Frozen r3 plan d9a3d4dff9226d9615bf7f4f23249fbfb8b825e4d2119994dac213531225dcb5,
manifest a2ab60e4f2450330df6120e663ca0646d0ffcd22a32f5764c98ae7b53c5a8410.
Only a reviewer-issued ACCEPTED_SYNTHETIC_SOURCE_ONLY admission bound to this
plan can enable its next.mjs/invoke-control guards. Verify the actual receipt;
do not create or infer one from this document or Builder results.

If admitted, run in the old perf checkout. The sole entry point is:

```powershell
node artifacts/perf-hillclimb/native-capture-controller-r3-20261115/next.mjs
```

Each call reserves exactly the next fixed cell and runs its existing checker.
At most six calls, in order: normal, nonzero23, supplied-record native,
timeout-with-descendant, normal non-debugged descendant, observer-failure after
verified descendant. Never rerun a dispatch. Continue only after its original
control-check.json is PASS and the host/session is closed; stop the batch on
any failed/incomplete control, timeout, source drift or ownership uncertainty.
The shared work allowance is90s across calls, with stop/check clipped to108s
configured terminal deadline. No replacement/retry or broadened timeout.

Preserve host launch/config/actual target identity, original event records,
raw streams, startup/rollback/native-close/cleanup/descendant observations and
each supervisor/check receipt. Native exception, process exit and cleanup are
separate evidence. A killed host never proves descendant/job/EOF closure.
Any unresolved owned runtime must be accounted for before unrelated runtime
work; preserve unrelated preview servers and other worktrees.

After the fixed batch or its first failure, close the parent runtime lease and
return exact original receipts/source pins for independent actual-control
acceptance. Source acceptance is not actual Windows proof. Actual synthetic
controls are a changed diagnostic population, never preview-test PASS, debugger
neutrality, native cause/fix, performance measurements or whole Phase A SOUND.
No real preview capture before its separate trial-wide daemon lifetime plan.
