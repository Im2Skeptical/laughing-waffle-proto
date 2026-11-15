# Frozen Life oracle: independent static review, round 1

2026-11-05. Independent Harness Auditor, Codex gpt-6.1-sol / xhigh. Review requested separately from the expected-data Builder.

**STATIC REVIEW ONLY / NOT EXECUTED. Phase A remains NOT SOUND.** No blocking static findings in the narrow pinned r7 expected-data mechanism. This is **not source-only acceptance, runtime acceptance, J6 acceptance, or whole-harness acceptance**. The skill's independent runtime reproduction requirement remains outstanding.

## Scope and restrictions

Read HillclimbPerformanceLoop, AGENTS.md and ai/ai-context.md; read the timegraph guardrails before forecast/replay/preview review and then their three required current documents. Read the timegraph/Life routes, applicable repository map and folder READMEs, game-design and aesthetic/UX guidance. Reviewed the three new executable files in full, the brief/implementation note, the all-eight-job HARNESS, J6_PREVIEW_BINDING_ANALYSIS, original corpus/loader/entry, and targeted captured replay/state/presentation implementation. The original corpus's captured fixture selector was inspected, not called.

Only read-only text, JSON metadata and hash inspection were used. No Node, test, build, simulation, browser, server, profiling, process watcher, delegate, commit, push, PR, deployment or messaging integration was run. The four app inspector files and new life-state diagnostics owned by the concurrent Builder were not inspected or edited. The only written artifact is this report. Earlier failures and all existing artifacts are preserved.

Impact: report only; simulation state, RNG, schemas, authoritative replay, official ticks, layering and app behavior are untouched. Runtime checks listed below are pending, not performed by this Auditor.

## Inspected identities

All values below are SHA256. Base/addendum content identities were also independently recomputed using read-only JSON text compaction (preserving string contents/key order, excluding the final identity member); no JavaScript identity function was executed.

| Item | Inspected identity/hash |
| --- | --- |
| Base content pin | `406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000` |
| Base manifest file | `9e477109c2c10d6c566bf287c4d896ae6eee9a3b475ec63bc7dd2eb20decc8a1` |
| Base SDK | `8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0` |
| Captured source inventory ID | `94afaa581ff65f0fdde91ef35bfea36e40129dc58e0ac39bc73a6d1dc9b87ea7` |
| Addendum content pin | `6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8` |
| Addendum manifest file | `a8c9c3847781628151214bd9505cb4458f73b02671699524d4ad025b798aaad5` |
| Addendum SDK | `f2d8da7555a253a14915720924b9bfdeaf0410f114b4b8d687df89d7eba1f540` |
| frozen-life-oracle.mjs | `642492aef553296a5522cffaf3c4868f19b822e6c7c896645bd6b53fe5840e83` |
| frozen-life-expectations.mjs | `fd2303e57d59a4852675bc30c311835f3fe82b7fa2ee6c4d6294197e1418be22` |
| frozen-life-oracle-test.mjs | `b2880d9bed36f6f89541369d0775970d8aabc6cdec70196afcf42b34e3e2b3fb` |
| r7 results.json | `2095955e717e337bc4235fad4690d55c9801599fc3909c966bc7b66cc3a6b5c2` |
| r7 reproduction.json | `e548be251b0b051384abc922449b4ac9a4138f52b0d0a02bd2190f13b97c73bc` |
| r7 original-integrity-after.json | `c0a339850ed78dd76ca0fdfd4a62af47a1d6f44427610d6550fd400f7682e9db` |

Base directory: `artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/`. r7 directory: `artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/`, with its separate `addendum/` manifest. Static size/hash checks matched **178/178 original manifest-listed files, 116/116 addendum files and 140/140 results-indexed evidence files**, with no mismatches. All 107 captured addendum input records matched the base source inventory; input 108 is the new entry. These are byte/inventory checks, not simulation reproduction. Original integrity evidence names inventory hash `947e14ef19ab330cd1d4b6b2125014662486a04ddf5a4e3bc457df9e0e040f67`.

The hash-checked addendum manifest binds entry `25844c3c140539f7af606e53b73a3112d296cb96e77c2c835d77a2f5b3f3093b`, options `53c42919b13834843f23fcb42292c9165847962843663f0122333bacb1b3e131`, metafile `748ee5995c5c325357f9859708dc710e0faee94ca903c08d72c3ce231e85ba7b` and resolutions `2703c166b28faee8fdf1dc5c9d24512b9590c7f5236ba66d43515cc28ee4bcf1`.

Actual local build-tool/Node bytes were hashed without executing them and matched recorded provenance:

| Tool | SHA256 |
| --- | --- |
| Node executable, 91,694,408 bytes; recorded v24.15.0 | `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5` |
| esbuild 0.25.12 lib/main.js | `0d1241812c443111d39475dfc66836003e9ef8b87e54d990dd67df29d20010e1` |
| esbuild/package.json | `cb7d5b1fe478f8cbaae566a86031b6fdf5f7d444354f35d1cb3cba9adf6d2935` |
| @esbuild/win32-x64/esbuild.exe | `cae1bbc86f4df800b01d99e28aea0a154b02243de6797e98f48a9b88a64a7be0` |
| @esbuild/win32-x64/package.json | `5b41ac77d55bf2ae0de680d83a9095904e89523c6ef42460cffd0df5ef5a6947` |

Supporting reviewed source identities (model paths refer to **captured** copies, not concurrent app edits):

| Source | SHA256 |
| --- | --- |
| scripts/perf-hillclimb/freeze-corpus.mjs | `183d90188538396078becfc9a87bab1675115de7bebcc13463f6d30448271f79` |
| scripts/perf-hillclimb/corpus.mjs | `6eaa347af6fee33bf96e8a2173418ccdc69dee1b804f4f208b0cad136139c3d4` |
| Captured oracle-entry.mjs | `2cbbc2b760238567cc2b7600dc0608470bf0c03820fcbeecb8bac8399bd2f97f` |
| Captured src/model/actions.js | `6405851c73197009500fb2988b7d13e7059293398bbb630c84e0e4e352c47c37` |
| Captured src/model/state.js | `e549208034c613872497f8fe05b7251cbba81689451d23637ecce4bcf99969af` |
| Captured src/model/canonicalize.js | `e187ac6488f4542d48f6b1fd13d56763d2ee5fb0c8fadfeb8d417719892ec0aa` |
| Captured src/model/timeline/index.js | `38a4037e9a1ffe3d6a04040b391099cca8f3fe726914a7046cc6441ec2b68fc6` |
| Captured src/model/timeline/action-index.js | `fe3e5ae1f3e3044379ed606a37211a19c3f41be5a62534908f5a914d0c73a19c` |
| Captured src/model/replay-second-runner.js | `c47b7a757e45a6c7c3b48d2460c4f9ef8491e08123764a7ef93d9d7cb7c0ad19` |
| Captured src/model/vassal-life-map/presentation.js | `0353e89aa4ab39f6967d6bcd249020dd6f5aea14e8189637db1f3b1684fa37d7` |

Governing document hashes in `docs/performance/perf-hillclimb-20261104/`: BRIEF `6eae41f3dddc0659e080fef2e0aaeac4b16172fe0b541c2d2d3cf2ce46cb37ed`; IMPLEMENTATION `2637101f96e335dabb554a67b4dc79669bff061f7f4f4187d49103bb5531dc71`; HARNESS `a98cd87e6f8a56d518475272261c9cdd8c384fec35d81c34a4e427ac9241ba96`; J6_PREVIEW_BINDING_ANALYSIS `a52b2dae3a13b9ba61f83e8ed45f13d999fbaf0d0d1526afc6047a4f6d8face8`.

## Static findings and coverage assessment

**No blocking static findings.** No source repair is requested for the pinned workload. The following conclusions are limited to inspected code and retained evidence, not independent execution:

1. **Independent expected inputs and closed resolution.** `frozen-life-oracle.mjs:78-103` validates the fixed base pin, SDK, files and captured correspondence. `:108-128` has both virtual resolve and load hooks; relative imports must resolve to captured bytes, with no filesystem fallback. Entry `:16` exports only the required baseline action/presentation/canonicalization operations. Loader `:179-197` revalidates inputs and executed owned-source identities, then evaluates the validated byte buffers through `SourceTextModule` (`:65-75`), with no SDK filesystem reread or dynamic-import callback. Only the base's two minimal builtin bindings link. The legacy original loader's current-model construction import is not imported by this new path. The new API withholds createFixtures; `:174` rejects the original SDK's fixture-CLI auto-run filename before evaluation. This is authenticated trusted-code execution, not a general sandbox or protection against an operator deliberately approving arbitrary new code/pins.

2. **Fresh replay and unchanged itinerary.** `frozen-life-expectations.mjs:31-58` reads immutable history metadata, validates five recorded action kinds/node agreement and unique purchase membership, and creates a fresh ordinary timeline for every prefix/target before its first rebuild. No checkpoints, memo or later-history knowledge are copied. Exact prefix1/selected, prefix3/shop and prefix5/history conformance is asserted at `:49-53`; direct action equivalence at `:59-69`. The action payload is copied intact; current canStage is not consulted. Recorded purchases are fieldStudy/R18 (123), pastoralism/R17 (424242), fm_woodlotRights/R04 (99117), each recorded offer index0, with targets54/54/64.

3. **Explicit expected control states, no actual normalization.** `:18-24` derives planning pause through the frozen round-trip and compares every other serialized field, including RNG/knowledge. `:66-71,90` distinguishes entered/staged/accepted planning bodies, unpaused adoption/logical history, and planning committed history. `assertExactState` at `:9-12` compares the supplied actual body directly, checks exact integer time, and never deserializes, canonicalizes or repairs actual flags. The direct accepted body is advanced through original official 60-tick seconds by test `:48-55`; captured replay-second-runner.js:21-39 contains that tick loop. No tick-skipping path was found.

4. **Full state and presentation checks.** Helper `:6-12` uses full strict equality, including unexpected fields, rather than a whitelist/hash-only success test. `:72-88` obtains the entire DTO from captured presentation on independently derived state, checks input purity, copies output and distinguishes the physical staged board from the displayed reservation. Captured presentation.js:266-274 isolates drag projection; :310-322 and :438-456 construct the reservation tableau. Test `:35-44,74-79` covers explicit hover/drag arguments and returned-copy isolation. These do not prove actual private product pointer isolation or inspection purity.

5. **Recorded coverage matches the narrow count claim.** r7 results contain three PASS conformance entries, 18 recorded state checks each (54 states), nine staged/hover/drag DTOs, 68 expected rejections and no reported failures. Test `:61-70` generates ten rejections per seed; `:83-159` generates the remaining38. The source asserts prefix/direct/full-state/DTO/purity checks and target plus three subsequent official seconds. `reproduction.json` records the exact SDK and metafile equality asserted at test `:135-139`; its 108 input records agree with the addendum inventory. Reading these records does not reproduce their computations.

Representative control evidence was inspected beyond its PASS label:

| r7 controls/*.json | Actual recorded gate and scope | SHA256 |
| --- | --- | --- |
| 123-wrong-RNG | Full-state comparator rejects changed vassalSeed; helper:7 | `65b90c4e94dd5dbcf72b80b6835a1a7d55c99377132399f085232d7fd2546f66` |
| 123-wrong-tableau | Full DTO comparator rejects changed tableau practice ID | `074a6b1d0acb4fc26f7dec0f6eff1bb22caeefc914e1247cf48a818f2d0369dc` |
| repinned-corrupt-captured-source | Passes outer repin and file metadata; fails baseline correspondence at loader:192 | `1b87a3d59be5e3dfa1bb5c5e42d5910b7065e831012b78a948274e3bc9be85b2` |
| resolver-decision-preparation | Actual captured-only esbuild plugin rejects uncaptured module; oracle:117 | `45a16ce8a6d04d2fcdc620b37090b1b7702cc9c4237e7bb8394a01dedd9615b7` |
| executed-source-frozen-life-expectations-mjs | Copied loader rejects changed owned helper bytes; oracle:184 | `e2a8cdca84fa264f8507d20cc60f7591f3e09516e6afac911af7994a9f98b22e` |
| base-path-escape | Rejects at fixed base manifest pin, **before** path resolution | `291ae48bad7dc2efcd47555b43bef7008f58b2640c414a3d880343bae9bc5091` |

Also inspected recorded Node/tool metadata rejections, dynamic-import rejection, current-absolute resolver rejection, CLI auto-run rejection and unlisted static-import rejection. The repinned addendum path controls and resolver escape control reach path checks; the base-path case alone must not be advertised as deep base path-gate penetration. Corrupt entry/SDK/source controls often stop at size mismatch, so they are not separate demonstrations of the same-size hash-mismatch branch. These coverage distinctions do not invalidate their claimed rejection or expose a blocking defect.

## Boundaries and required independent runtime reproduction

- The helper deliberately supports the frozen initial five-action itinerary only. All `second` values are asserted zero at helper:33. At :44 it copies these records without translating `second` to `tSec`; captured action-index.js:9 defaults missing tSec to zero. This yields the correct pinned workload, despite the more general conversion instruction in J6 analysis:107. It supplies **no nonzero-action-time coverage**. Any later extension must explicitly map recorded seconds before rebuilding and include an actual delayed-action control; it must not silently reuse this zero-time assumption for later-history traces.
- The log retains Node's VM warning formatted as PowerShell NativeCommandError and then the three seed PASS lines plus `PASS seeds=3 controls=68`. The Builder reports host exit0. A standalone host exit-status witness is not established by this static read; results PASS is not independent process-exit or liveness proof. Do not erase that warning or earlier r1-r6 failures to tidy the evidence.
- No actual private draft, accepted/preparing/ready packet, adopted cursor, retained rendered decision, committed/history preview, knowledge clone/observation trigger, stale message/direct commit gate, or positive timing path was exercised here. Knowledge overlays are explicitly deferred by the helper contract, not inferred from actual state. Those remain separate J6 work and cannot be accepted by this stage.

After the exclusive execution slot releases, an independent runner must reproduce the pinned addendum proof in a **new** evidence directory, retain stdout/stderr **and host exit status**, and verify the base/addendum/source identities before and after. Shortest existing reproduction (not run here):

```powershell
node --experimental-vm-modules scripts/perf-hillclimb/frozen-life-oracle-test.mjs --output=artifacts/perf-hillclimb/frozen-life-oracle-independent-recheck-NEW --manifest=artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json --pin=6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8
```

Require all three seeds, exact captured-only SDK/metafile rebuild, all recorded negative gates and original178-file integrity. Independently inspect representative new raw rejections at the full-state/RNG/tableau, captured-source, resolver and executed-source gates; preserve any new failure. A focused actual helper check should also show wrong paused/phase and unexpected knowledge fail direct equality without actual normalization. If executable helper/test bytes change to add controls, refresh their provenance/addendum pin and proof; do not waive the current exact-source gate.

The later product J6 review must separately establish actual draft/tableau/accepted/adopted/committed/history equality on the unchanged recorded purchases, justified knowledge timing, real retained-pointer mutation/isolation and stale-message/direct-commit controls with sensitivity twins, then source/built-response correspondence and observer/timing costs. No app-source or new Life diagnostic acceptance is implied here. All eight required jobs, populations, consecutive suites and tail/device limitations in the governing HARNESS remain in force.

**Phase A remains NOT SOUND. Independent runtime reproduction and actual J6/state/knowledge timing proof remain outstanding.**
