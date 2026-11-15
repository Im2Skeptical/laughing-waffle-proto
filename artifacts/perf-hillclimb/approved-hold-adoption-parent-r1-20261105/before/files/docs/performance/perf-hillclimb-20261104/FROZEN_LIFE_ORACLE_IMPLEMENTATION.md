# Frozen Life oracle implementation

2026-11-05, expected-data Harness Builder, Codex gpt-6.1-sol / xhigh. **Phase A NOT SOUND. No optimization, score, gameplay rule, self-acceptance or device-latency claim.** Final r7 passed all three seeds and 68 expected-negative controls, exit0. Parent retains actual J6 integration, full macro verification and independent audit.

## Ownership and impact

Added only `scripts/perf-hillclimb/frozen-life-oracle.mjs`, `frozen-life-expectations.mjs`, `frozen-life-oracle-test.mjs`, this note and task-owned artifact directories/logs. App source, original oracle entry/loader/corpus/SDK, root runner/runtime/statistics/J8, package scripts, HARNESS/STATE/COVERAGE/PROOF and other dirty work remain untouched. Branch is `perf/hillclimb-20261104` in the specified worktree. No delegates, browser, server, full npm verify/start, commit, push, PR, deployment, bot or webhook was started.

Impact: expected-data harness only. Simulation state definitions, RNG streams, schemas, authoritative replay, official 60-tick seconds, five slots, model/view layering, UI behavior, reveal and input locks are unchanged. The tests execute existing captured gameplay behavior; they introduce none. UI pause is an explicit expected-only derivation checked to change only `paused`/`phase`, including exact preservation of all RNG and knowledge fields.

## Immutable artifact and pins

Final addendum: `artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json`.

| Identity | SHA256 |
| --- | --- |
| Required addendum content pin | `6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8` |
| Addendum manifest file bytes | `a8c9c3847781628151214bd9505cb4458f73b02671699524d4ad025b798aaad5` |
| Required original base content pin | `406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000` |
| Original manifest file bytes | `9e477109c2c10d6c566bf287c4d896ae6eee9a3b475ec63bc7dd2eb20decc8a1` |
| Original SDK bytes | `8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0` |
| Original captured sourceId | `94afaa581ff65f0fdde91ef35bfea36e40129dc58e0ac39bc73a6d1dc9b87ea7` |
| `life-entry.mjs` | `25844c3c140539f7af606e53b73a3112d296cb96e77c2c835d77a2f5b3f3093b` |
| `build-options.json` | `53c42919b13834843f23fcb42292c9165847962843663f0122333bacb1b3e131` |
| `life-sdk.mjs` | `f2d8da7555a253a14915720924b9bfdeaf0410f114b4b8d687df89d7eba1f540` |
| `metafile.json` | `748ee5995c5c325357f9859708dc710e0faee94ca903c08d72c3ce231e85ba7b` |
| `resolutions.json` | `2703c166b28faee8fdf1dc5c9d24512b9590c7f5236ba66d43515cc28ee4bcf1` |
| Builder/strict loader source | `642492aef553296a5522cffaf3c4868f19b822e6c7c896645bd6b53fe5840e83` |
| Expectation helper source | `fd2303e57d59a4852675bc30c311835f3fe82b7fa2ee6c4d6294197e1418be22` |
| Focused test/control source | `b2880d9bed36f6f89541369d0775970d8aabc6cdec70196afcf42b34e3e2b3fb` |

The manifest records sizes/hashes for all 108 build inputs (one new entry plus 107 original captured files), exact copies under `inputs/`, copied construction sources, build configuration, output, metafile and resolution provenance. The original source inventory contains 141 files. Only captured bytes feed the virtual resolver and virtual loader; neither can fall back to disk/module resolution. Both `decision-preparation.js` and `projection-chunk.js` are absent and are explicitly rejected, even though current files exist. No candidate model export or output provides expected values. No fixture generation/reselection occurs. The original SDK's historical fixture-CLI auto-run filename is also explicitly rejected before evaluation.

Build tool: esbuild 0.25.12; `main.js` SHA `0d1241812c443111d39475dfc66836003e9ef8b87e54d990dd67df29d20010e1`, package metadata `cb7d5b1fe478f8cbaae566a86031b6fdf5f7d444354f35d1cb3cba9adf6d2935`, native win32-x64 binary `cae1bbc86f4df800b01d99e28aea0a154b02243de6797e98f48a9b88a64a7be0`, native package metadata `5b41ac77d55bf2ae0de680d83a9095904e89523c6ef42460cffd0df5ef5a6947`. These are checked before and after construction. The wrapper's workers execute the same pinned `main.js`; no other nonbuiltin build package is used. Node v24.15.0 executable is pinned to `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5` (91,694,408 bytes); runtime versions and invocation flags are recorded.

The addendum exports exactly `applyAction`, `ActionKinds`, `getVassalNodeDecisionPresentation`, `canonicalizeSnapshot`. It has zero external imports. The original SDK allows exactly `node:assert/strict` and `node:crypto`. Both SDKs reject dynamic import/require and unmatched/nonallowed imports before execution. Loading uses VM modules over the already validated byte buffers, with no filesystem code reread and no dynamic-import callback. Only the original default assert and named createHash builtin bindings can link. The original SDK creates an inert relative worker URL at module evaluation; VM `import.meta.url` supplies its validated file URL, without creating or importing a worker. This is authenticated trusted-code execution, not a general sandbox for arbitrarily repinned JavaScript.

Construction rejects existing output directories. Loading requires separate explicit addendum and base pins, revalidates every original file and captured-source correspondence, checks all addendum bytes and their source correspondence, and rejects changed executed builder/helper/test bytes or Node executable. Unrelated parent scripts are not hidden dependencies. Changing these owned executable files requires a new artifact/pin and new proof; no earlier failed provenance gate is waived.

## Loader and proposed parent API

Run the importing Node process with `--experimental-vm-modules`. Construction is Windows x64 with the recorded esbuild/native pins; loading needs the recorded Node binary and exact owned sources, but does not load esbuild. Node emits its normal experimental VM warning.

```js
import {loadFrozenLifeOracle} from './scripts/perf-hillclimb/frozen-life-oracle.mjs';
import {createLifeExpectations,assertExactState,assertExact}
  from './scripts/perf-hillclimb/frozen-life-expectations.mjs';

const frozen = await loadFrozenLifeOracle({
  manifest: 'artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json',
  expectedIdentity: '6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8',
  baseManifest: 'artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
  expectedBaseIdentity: '406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
});
const expected = createLifeExpectations(frozen, 424242);
// Later parent binding, AFTER its clocks, on copied passive inspections:
assertExactState(actualDraftStateData, expected.staged);
assertExact(actualRetainedDecisionDto, expected.stagedDecision);
assertExactState(actualAcceptedWorkerBody, expected.accepted);
assertExactState(actualAdoptedRunnerBody, expected.adopted);
assertExactState(actualCommittedCursor, expected.committed);
```

Those `actual*` names are proposed parent inputs, not observations made here. No actual state may be fed into an expectation derivation. `expected.trace`, `nodeId`, `category`, `purchase`, `confirm`, `offerId` and uniquely resolved `offerIndex` bind the unchanged public itinerary. `logical[0..5]` are independent prefix states at zero. `replayPrefix(count, second)` constructs a fresh ordinary timeline every call, with the copied prefix installed before any rebuild. `presentation(expectedState, {nodeId, preview})` requires explicit node/hover/drag arguments, consumes only independently derived expected data, checks input purity and returns a JSON DTO copy. `stagedDecision` uses `{previewOptionId:null, previewOfferId:null}`. `accepted` is the paused preparation body; `adopted` is the explicitly unpaused installation; `history` is the unpaused recorded target; `committed` adds only the independently specified planning pause.

For committed historical cursor targets 16/17, derive `planningPause(frozen.oracle, expected.replayPrefix(5, target))`. Require the actual owner/source/target and public navigation trigger separately. A raw forecast result should be compared against logical replay with its appropriate independently specified controls. Never normalize the actual output to match. `assertExactState` checks exact integer `tSec` and every field, while `assertExact` checks the entire copied DTO, including unexpected fields. Original SDK `createFixtures` is neither called nor exposed by this loader.

Knowledge overlays are deliberately not inferred here. A later parent overlay requires independent frozen facts and a proven observation/clone-time trigger, as described in the governing brief. Do not copy knowledge from the inspected private draft or silently reuse the unmodified expectations if such a trigger has actually occurred.

## Executed proof and raw evidence

Final reproduction command (requires a new output directory):

```powershell
node --experimental-vm-modules scripts/perf-hillclimb/frozen-life-oracle-test.mjs --output=artifacts/perf-hillclimb/frozen-life-oracle-20261105-recheck-NEW
```

The final executed command used `--output=artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7`, with stdout/stderr retained in the adjacent `frozen-life-oracle-20261105-r7.log` and explicit `exit $LASTEXITCODE` in PowerShell. A recheck against the existing addendum can instead add `--manifest=artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json --pin=6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8`; this creates only a fresh evidence directory and owned negative-control copies. Standalone construction is `node --experimental-vm-modules scripts/perf-hillclimb/frozen-life-oracle.mjs --base-pin=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000 --output=<new-task-owned-directory>`.

Raw evidence is under `artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/`: `results.json` indexes every result and retained file hash; `conformance/{123,424242,99117}/` contains states, exact itinerary, all decision DTOs/arguments and checks; `controls/` contains individual expected rejections/stacks; `copies/` retains all corrupted artifacts and source copies; `reproduction.json` proves exact SDK and metafile rebuild equality; `original-integrity-before.json` and `original-integrity-after.json` hold the original integrity checks.

The executed assertions cover fresh prefixes0..5, prefix1 exact selected/prefix3 exact shop/prefix5 exact recorded history at54/54/64, all direct action prefixes versus independent authoritative replay, direct staged category+purchase and accepted category+purchase+confirm from a paused entered state, full unpaused adoption, full staged/hover/drag DTOs from independent data, input purity/output isolation and all five slots. The direct accepted body advances every official second to its recorded target and three subsequent seconds, matching fresh full-history replay. Staged physical slots retain the original board, while the full displayed reservation tableau includes the recorded purchase. All fields/RNG participate in equality; no candidate data or current canStage is used to select the workload.

Controls exercise wrong target, RNG, known field, extra field, purchase, physical slot, full tableau and DTO field; fractional targets/missing presentation arguments; wrong/missing pins and reused output; entry/SDK/manifest/options/captured input/build-tool/Node metadata corruption; path escape, absolute/UNC/backslash/ADS paths; uncaptured and current absolute/package resolution; prohibited imports/require; changed executed sources on copies; and the original fixture CLI auto-run guard. Repinned mutants exercise deeper gates past outer content identity; original-base mutants retain the fixed original pin. They never alter the originals. These are Node helper/builder/loader controls, not real stale-Life acceptance controls.

Final r7 outcome: **PASS, exit0, all3 seeds and all68 expected-negative controls**. Retained evidence includes54 complete state snapshots and9 complete staged/hover/drag DTOs. Captured-only reconstruction reproduces the exact SDK and metafile. Before/after integrity checks rehash all178 original manifest-listed files plus the manifest; all match their original pins. Inventory SHA is `947e14ef19ab330cd1d4b6b2125014662486a04ddf5a4e3bc457df9e0e040f67`.

| Final evidence | SHA256 |
| --- | --- |
| `results.json` | `2095955e717e337bc4235fad4690d55c9801599fc3909c966bc7b66cc3a6b5c2` |
| `reproduction.json` | `e548be251b0b051384abc922449b4ac9a4138f52b0d0a02bd2190f13b97c73bc` |
| `original-integrity-after.json` | `c0a339850ed78dd76ca0fdfd4a62af47a1d6f44427610d6550fd400f7682e9db` |

## Retained construction history and remaining work

All earlier directories remain: `frozen-life-oracle-20261105-r1` failed a string-sensitive import scanner; r2 failed because a data URL cannot resolve the SDK's inert relative worker URL (its original long error is retained); r3 used the incorrect DTO key `practiceSlots` instead of `practices`; r4 rejected the intended fractional target but the control expected an overly broad error-message pattern. Negative controls now always retain the actual rejection before judging its message. r5 reports all3 seeds/58 controls PASS but the PowerShell wrapper reported exit1 after NativeCommandError formatting of Node's VM warning; it is superseded. r6 passed all3 seeds/67 controls with explicit exit0, including exact reproduction and executed-source/Node provenance. r7 adds rejection of the original SDK's fixture-CLI filename auto-run before evaluation. The initial exploratory `node -e` metadata read also failed due to PowerShell native quote removal, before any model execution; it was corrected to stdin. No failed run is erased, relabelled as accepted or used to waive parent provenance failures.

Parent must still bind actual private draft/job/node payloads and the retained rendered decision, validate applicable knowledge timing, prove actual input/inspection purity and mutation isolation, and execute real direct stale-commit/message controls and their sensitivity twins. Full current macro checks remain parent-owned before any task commit. This delivery does not cover browser/device latency, feedback/observer overhead, complete populations/tails, or independent Phase A acceptance. No product gain is claimed. The owned Node command completed exit0 and its esbuild service was explicitly stopped; no owned browser/server was started. The exclusive CPU/Node slot is released.
