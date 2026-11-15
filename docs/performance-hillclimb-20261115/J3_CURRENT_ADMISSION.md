# Current J3 pan admission — 2026-11-15

**NOT ACCEPTED at initial driver pin; admission.json was not written.** Source-only review, no browser/test/build/benchmark. Driver SHA256 `173dff7948fb48304aaca0bc31f84171aa48225ca97560639b607a36aca5f23b`; authority SHA256 `8c45bbf674f60ac7f6dc7214fb1abc76bc9617f02bb943c73bb7e318a2dc172e`, both independently checked.

Minimal findings, requiring wrapper-only repair:

1. The600000ms timer performs a bounded taskkill attempt but never settles the enclosing Promise unless the child emits exit/error. If killing fails or exit is not received, the promised full-leaf host lease is unbounded. After the bounded kill attempt, settle the outer wait and retain an expired/interrupted/unconfirmed-cleanup result; never treat termination as valid cleanup or a positive. Any remaining owned child must stay an explicit unresolved process condition.
2. The driver does not read `summary.json`. Child exit and manifest consistency are checked, but promised summary consistency is absent. `assertDiscoveryCell` checks only manifest configuration and singleton launch; it does not check summary or a successful actual J3 row. Require summary.ok to match exit and the actual main-runner singleton success shape when exit0, without converting a failed/incomplete attempt to success.
3. Build metadata is freshly captured without comparing it with the accepted authority before plan creation. Actual current build-manifest SHA256 equals authority `0955ff002faa221929bc7866c93f32b052c64d6bc5830af2681bccf3f324f950` now. Assert that equality to `previous.buildManifestSha256` before capturing the plan, preserving that source/build admission anchor.

Otherwise the source-only shape is appropriately narrow: one fresh existing-runner desktop/cold/minimal seed123 pan, fixed selected history/state, no worker delay, all current feedback/state/source/generator oracles, original180000ms operation timeout, cutoff before01:45Z, source/H/assets/build stability, product/branch/runtime identity, served/fixture/config checks, canonical singleton launch on success and explicit original context/browser cleanup. No leaf overwrite or retry is permitted. Whole Phase A and current other J3 jobs remain NOT SOUND/unaccepted.

Parent received findings promptly. No actual invocation or new plan was performed by this review. Recheck only these minimal wrapper repairs against a new final driver pin before writing admission.

## Targeted repair recheck

Driver `8e74ec794ebc9ec8d38dc57c352738ee3a3196695dfbdeb7ae60d073ad904449`: host work deadline590000ms plus bounded10000ms termination reserve now settles/unrefs regardless of child exit; expired state cannot pass identity/cleanup. Build metadata now anchors to the sealed authority. Those two findings are resolved for this narrow admission.

Summary repair still blocks: actual main summary is an array of statistics groups whose `key` is itself an array, with job at index4 and step at index5. The new `g.key.job`/`g.key.step` assertions address nonexistent properties and reject valid results. Checked the retained original main summary and current grouping schema. Require the correct key schema while retaining singleton success counters. No admission receipt written at this pin; prior withheld findings remain historical above.

## Final scoped admission

**ACCEPTED** final driver `709ed8d293e483ff7545009383a13481da29eb2dd29cad173c09d45971d7fa21`, authority unchanged `8c45bbf674f60ac7f6dc7214fb1abc76bc9617f02bb943c73bb7e318a2dc172e`. Source-only recheck confirms correct statistics key indices4/5, retained singleton success counters/canonical launch guard, and a second strict cutoff check immediately before log opening/spawn after source/plan checks. Earlier host-limit settlement and sealed build anchor fixes remain. No material targeted admission blocker remains.

Wrote owned OLD `j3-current-pan-r1-20261115/admission.json` before cutoff, only after rehashing both identities and confirming no admission/plan/leaf existed. This admits exactly one unchanged current desktop pan diagnostic with the specified fixture/config/oracles and bounded host lifetime; interrupted/unconfirmed cleanup remains invalid, no retry. Actual closed-row linkage acceptance is separate. Parent owns the invocation/runtime; no actual case, source edit, test or browser was started by this review. Whole Phase A and all other current J3 obligations remain unaccepted.
