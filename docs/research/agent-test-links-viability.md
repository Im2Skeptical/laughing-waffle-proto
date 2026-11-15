# Agent test links: portable-state viability

Research for discussion, 2026-11-15. **All measurements are provisional.** Initial measurements: Windows/PowerShell, Node v24.15.0, app 1.1.67, GameState v51 / runner-save v33; branch `proto/agent-test-links-20261115`, initially clean HEAD `f0b1b1f720c19a1cbeda558da430a1ff636e6507`. The later transport prototype below is a separate local experiment, not deployment or gameplay approval.

## Recommendation

The existing model supports a portable **snapshot that starts disposable history at its captured second**. A small local feasibility prototype is reasonable. The current Lab token link is not portable, and a complete runner save is a poor inline-URL candidate at the measured sizes. Prefer a snapshot-only experiment with a separate, versioned transport envelope, build identity, bounded decoding and a file fallback. Treat an inline fragment as an experiment until actual browser/clipboard/chat/mobile transfer succeeds. For reliably short links, discuss checked-in/static fixture files; ad hoc uploaded fixtures would need storage infrastructure beyond the current preview server.

This transports a state to the installed engine, not the engine/artwork itself. A seed recipe recreates an opening under particular settings/code; it does not capture arbitrary later edits or actions. Do not remove captured `gameConfig` merely to shorten a link: the normal initializer captures settings, gamepieces and Life Map rules into the run ([new-game.js:8–43][new-game]); the deserializer validates those captured definitions ([state.js:549–562][deserialize]).

## Measured payloads

Seed **735**, normal `createNewGameState`, installed in the real runner. Opening: second 0, year 1, 20 regions/sites, zero actions, one checkpoint. Later sample: select Vassal candidate 0 at second 0, run 10,800 ordinary 1/60-second updates, then pause at a boundary: **second 180, year 6, still live**, one action, 29 retained checkpoints (seconds 124–180, stride 2). No node choices or sandbox edits. This is a reproducible passive later-state sample, **not Cam's exact changed state or a typical actively played save**.

| Sample / payload | JSON characters | UTF-8 bytes | gzip bytes | gzip → base64url characters |
| --- | ---: | ---: | ---: | ---: |
| Opening snapshot | 366,479 | 366,600 | 40,725 | 54,300 |
| Opening runner save | 1,099,902 | 1,100,265 | 121,600 | 162,134 |
| Second-180 snapshot | 867,146 | 867,265 | 76,921 | 102,562 |
| Second-180 runner save | 26,335,777 | 26,339,470 | 2,343,082 | 3,124,110 |

Compact JSON, Node `gzipSync` defaults, unpadded `base64url`; lengths exclude URL, envelope and build metadata. Runner metadata includes a wall-clock `savedAt`, so compressed byte counts can vary slightly on rerun. Opening `gameConfig` alone: **308,206 UTF-8 bytes**, 36,111 gzip bytes (~84% of snapshot JSON). No universal URL-size limit is asserted here.

The runner save contains current state **and** timeline base, actions, checkpoints and persistent knowledge; initialization seeds a full checkpoint, so even the opening repeats the snapshot three times. Export retains the checkpoints rather than reducing the save to an action recipe ([save-slots.js:44–60,124–129][save-envelope], [sim-runner.js:401–425][runner-init]). Thus the measured 26 MB is an actual runner export with retained history, not a manually padded payload or forecast cache.

Reproduce from this checkout with the following module on stdin (`@' … '@ | node --input-type=module` in PowerShell); it prints counts only:

```js
import assert from 'node:assert/strict';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createNewGameState} from './src/model/new-game.js';
import {serializeGameState, deserializeGameState} from './src/model/state.js';
import {createSimRunner} from './src/controllers/sim-runner.js';
import {ActionKinds} from './src/model/actions.js';
import {getVassalCandidatePool} from './src/model/vassal-life-map.js';
import {inspectSaveText} from './src/controllers/sim-runner/save-slots.js';
const runner = createSimRunner({});
assert.equal(runner.resetToState(createNewGameState(735), 'twoRegionStarter01').ok, true);
function size(text) {
  const gz = gzipSync(Buffer.from(text)), b64 = gz.toString('base64url');
  assert.equal(gunzipSync(Buffer.from(b64, 'base64url')).toString(), text);
  return [text.length, Buffer.byteLength(text), gz.length, b64.length];
}
function measure() {
  const data = serializeGameState(runner.getCursorState()), save = runner.exportCurrentSave();
  assert.deepEqual(serializeGameState(deserializeGameState(data)), data);
  assert.equal(save.ok, true); assert.equal(inspectSaveText(save.text).ok, true);
  console.log({tSec:data.tSec, year:data.year, complete:data.runStatus?.complete,
    actions:runner.getTimeline().actions.length, checkpoints:runner.getTimeline().checkpoints.length,
    snapshot:size(JSON.stringify(data)), runnerSave:size(save.text)});
}
measure();
const pool = getVassalCandidatePool(runner.getState());
assert.equal(runner.dispatchActionAtCurrentSecond(ActionKinds.SETTLEMENT_SELECT_VASSAL,
  {candidateIndex:0, expectedPoolHash:pool.expectedPoolHash}).ok, true);
runner.setTimeScaleTarget(1, {immediate:true, unpause:true});
for (let frame=0; frame<180*60; frame++) runner.update(1/60);
runner.setPaused(true); for (let frame=0; frame<60; frame++) runner.update(1/60);
measure();
```

## Museum, Lab and disposable-session contracts

- **Current handoff:** serialize/validate, write JSON to `localStorage` under a UUID, then navigate to `#/dev/gym?state=<token>` or `#/dev/play?state=<token>`. Reader accepts only a token and looks up that browser's stored JSON; a missing record fails. Records are retained for refresh/Back, with no expiry in this bridge ([development-lab-bridge.js:3–36][bridge]). Copying that URL to another browser/device does not copy the record. Storage is origin-scoped ([HTML Web Storage §12.2.3](https://html.spec.whatwg.org/dev/webstorage.html#dom-localstorage)); localhost, LAN host/port and Pages must not be assumed to share it.
- **Museum:** named exhibits are serialized states in a browser-local library. Export/import already transfers validated GameState JSON, and import/reset/edit create a new timeline branch. They do not transfer earlier action history, undo stack or a saved run ([development-lab-controller.js:9–27,74–85][lab-controller]). Importing a handoff initializes **Gym only**; Museum gets a separate default controller, so changing the URL to `/dev/museum?state=…` does not install that state as a Museum exhibit ([development-lab-dom.js:34–36][lab-mount]).
- **History and exactness:** snapshots retain serialized RNG and config; runtime RNG helpers/derived occupancy are stripped and reconstructed ([state.js:408–449][serialize], [state.js:476–495][state-body]). A new timeline begins at snapshot `tSec` with empty actions/checkpoints; earlier replay explicitly returns `beforeInitialState` ([timeline/index.js:71–101][timeline-base], [timeline/index.js:659–667][timeline-boundary]). Full runner-save inspection instead validates and rebuilds its saved timeline cursor ([save-slots.js:216–228][save-inspect]). These are distinct import contracts.
- **Capture boundary:** use an authoritative integer-second state. Runner pause commits at a 60-tick boundary ([sim-runner.js:1394–1404][pause]); replay resets its clock to the starting second ([timeline/index.js:711–714][replay-clock], [replay-second-runner.js:12–18][clock-reset]). The measurements and parity check cover boundary snapshots; arbitrary captures between ticks/seconds remain unverified.
- **Save safety:** `/dev/play` uses `enterDisposableState`, resets the runner and calls `enter(null)`. `save()` returns before any slot write when `activeSlot === null`; the ordinary ten-second autosave therefore has no destination ([game-session-controller.js:85–107,207–214][session], [ui-root-settlement-pixi.js:1835,1850–1862][play-entry]). The existing badge explicitly says unsaved/history begins here. Refresh restores the original handoff snapshot, not subsequent progress. Manual current-game export remains possible ([game-session-controller.js:164–168][manual-export]). A new importer should preserve this entry path rather than importing into a player slot; same-page replacement of a live unsaved game needs separate handling.

Additional checks **passed in Node**: serialization → deserialize → serialization equality; gzip/base64url byte round trips; runner-save inspection. A fresh timeline from the second-180 snapshot matched the original timeline's entire serialized state, including RNG, at seconds **180, 181 and 190**; second 179 was rejected. A disposable-session probe with an instrumented runner made **zero `saveToSlot` calls** after `session.save()`. These are model/controller checks, not browser autosave-race or storage-quota tests.

## Hosting and compatibility limits

The app already chooses Lab/game from the hash; crossing that boundary reloads the entry module ([ui-root-pixi.js:18–31][routing]). A fragment payload can therefore fit the existing static-entry arrangement in principle. URI fragments are separated before dereferencing, so they are interpreted client-side rather than serving as a server lookup payload ([RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.5)). The current `state=` parameter still requires a UUID: a new format needs explicit decoding/routing.

Local preview accepts **GET/HEAD only**, serves root and an allowlist (`src`, `images`, stylesheet), and binds `0.0.0.0` with same-network URLs ([local-preview.mjs:21–25,57–86,99][preview]). It offers no upload/share-record API and will not serve an arbitrary file in `docs/research`. LAN reachability still depends on the running host/network. Pages builds browser bundles/workers and relative asset URLs ([build-pages.mjs:18–24,46–94][build]); [GitHub documents Pages as static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Short curated fixture URLs are feasible through explicitly shipped static assets, but files must reach that build. An existing gzip fixture loader demonstrates the repo's static-file/decompression path ([performance-start.js:11–21][fixture-loader]); Node gzip sizes do not prove browser codec support or latency on LAN HTTP/mobile.

Schema checks reject older GameStates/saves ([state.js:554–562][deserialize], [save-slots.js:218][save-inspect]). Matching schemas alone does not pin engine behavior. Carry source build identity with the payload; choose whether an exact fingerprint is required or a compatible build is allowed. Build metadata fingerprints source **including docs**, and branch/dirty state determines preview status ([build-info.mjs:14–21,45–51][build-info]); a docs-only change can therefore change the fingerprint. No preview/build was launched by this research child: `npm start` can bake files, spawn a server and poll, outside this task's single-file/no-polling constraints ([local-preview.mjs:118–135][preview-start]). Parent owns preview verification.

## Browser evidence from the parent investigation

The existing handoff was exercised in a fresh, temporary Playwright Chromium context
on this checkout's local preview. A seed-735 opening snapshot (366,600 UTF-8 bytes)
was stored under a probe token, then loaded through the existing Gym route after
a full reload. Re-serializing the installed Gym state matched the original JSON
exactly. Opening the same token on `127.0.0.1` instead of `localhost` showed
`Lab handoff not found. Open a new copy from the source tab.` and installed the
default `stock` fixture. This demonstrates an actual origin boundary, not a real
phone transfer or successful portable URL. A future importer should not present
that fallback as the requested test situation.

Changing only the hash token while already in Gym did not re-import the state;
a full reload did. This follows the mount-time `readLabHandoff` call and the
section-only hash handler ([development-lab-dom.js:34–36,228–237][lab-mount]).

Generated local evidence lives in `artifacts/agent-test-links/`:
`browser-probe.mjs`, `browser-evidence.json`, `same-origin-handoff.png` and
`other-origin-handoff-missing.png`. Run `node artifacts/agent-test-links/browser-probe.mjs`
while this checkout's port-5197 preview is running. The probe uses isolated browser
storage; it does not install a test-link feature or write player save slots.
Screenshots show the import/error controls while map artwork is still preparing;
they are evidence of the existing handoff, not completed-artwork or phone tests.

`npm ci` installed the pinned local dependencies. `npm run check:docs` passed.
`npm start` baked all five prepared performance fixtures, then could not start
a preview because its entire 5184–5195 port range was occupied. No existing
preview was stopped. The unchanged server was started explicitly on free port
5197 using `node scripts/local-preview.mjs --serve 5197`. Local status and the
embedded HTML identity were checked against `build-info.json` for this branch.
The inherited app version is 1.1.67; pair it with the source fingerprint to identify
this research preview. No product-code/version/schema change, push, PR, publication,
merge or callback has occurred. The feature prototype awaits Cam's batched design
answers in the owning thread.

## Phone readability and transport prototype

Cam authorized the real-link readability test in this thread. The subsequent
scope clarification makes all open panels a coverage requirement, deprioritizes
camera zoom, and prioritizes recording player-accessible gameplay actions for
Dev tracing. This transport slice does not implement those broader requirements.

Prototype build: `1.1.68-proto.agent-test-links.1`. The standalone
[`agent-test-link-prototype.html`](../../src/views/agent-test-link-prototype.html)
reads a gzip/base64url snapshot directly from the URL fragment and displays a
receipt. It validates the format, bounded encoded/decoded sizes, byte count,
FNV-1a transport checksum, authoritative state deserialization/re-serialization,
and exact preview source fingerprint. The checksum detects accidental transport
changes; it is not an authentication mechanism. Limits of 512 KiB encoded and
4 MiB decoded are provisional test guards, not product limits.

Successful reading changes no browser save or handoff storage. The optional
**Inspect snapshot in Gym** button stages one UUID-keyed handoff using the existing
Gym contract, then fully navigates to Gym. Refreshing the long test link reads the
original snapshot again. This temporary adapter does not add a production route,
panel-restoration system, action audit log, hosted upload service or prior history.
The page is local-preview-only: the current Pages builder does not ship `src/`
HTML pages. There is no change to normal boot, simulation, RNG, schemas or replay.

With this checkout's preview running, generate the opening-seed-735 phone test:

```sh
npm run prototype:agent-test-links -- http://192.168.1.103:5197/
```

Use the actual LAN origin printed by this checkout's preview if it changes.
The generator checks the preview workspace before writing only generated files
under `artifacts/agent-test-links/`: `phone-link.html` (a compact launch card with
the full URL in its anchor), `phone-link.txt` and `phone-link.json`. The snapshot
and build identity are in the long URL itself, not fetched from those files.
Render the launch card in T3 to exercise the actual T3-to-phone click path. Its
separate short connection-check link intentionally has no snapshot, allowing a
network failure to be distinguished from a long-link transfer/decoding failure.

The desktop/fresh-browser check can verify receipt, URL survival, refresh, Gym
handoff and rejection cases. Only Cam's phone test can establish whether the
real T3/mobile opening path works and the receipt is readable. Do not call the
phone gate passed until Cam reports the outcome. All source stays on the isolated
branch; pushing, publication, PR, merging and settle remain unauthorized.

## Batched decisions and feasibility gates

1. Is a test link a disposable snapshot starting here, or must it preserve earlier actions/rewind history? If history is required, prefer a runner-save file/reference at these measured sizes.
2. Are long self-contained experimental links acceptable, or must links remain short? For short links, are curated build-shipped snapshots sufficient, or is ad hoc shared storage needed?
3. Should imports open Gym for inspection or disposable play? Should Museum persistence require an explicit named save? Should refresh restart the fixture or preserve test progress?
4. What build-compatibility policy and target recipient/browser matter first? Is the owner supplying a real changed-state export for a more representative size/continuation check?

Before treating a prototype as viable: transfer to an empty browser profile on another origin/device; exercise actual copy/paste and navigation at measured lengths; compare full state/RNG and a short authoritative continuation; reject wrong schemas/build policy, malformed/truncated/oversized compressed data before installing state; verify existing occupied slot payloads are unchanged across import, autosave, menu and refresh. Keep runtime caches/forecast out of the transport and bound encoded **and decoded** sizes. No simulation, RNG, schema or replay implementation changes are needed for this research recommendation; any prototype still needs its own verification and gameplay/UX decisions.

[new-game]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/new-game.js:8
[deserialize]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/state.js:549
[save-envelope]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/sim-runner/save-slots.js:44
[runner-init]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/sim-runner.js:401
[bridge]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/development-lab-bridge.js:3
[lab-controller]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/development-lab-controller.js:9
[lab-mount]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/views/development-lab-dom.js:34
[serialize]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/state.js:408
[state-body]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/state.js:476
[timeline-base]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/timeline/index.js:71
[timeline-boundary]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/timeline/index.js:659
[save-inspect]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/sim-runner/save-slots.js:216
[pause]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/sim-runner.js:1394
[replay-clock]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/timeline/index.js:711
[clock-reset]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/model/replay-second-runner.js:12
[session]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/game-session-controller.js:85
[play-entry]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/views/ui-root-settlement-pixi.js:1835
[manual-export]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/game-session-controller.js:164
[routing]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/views/ui-root-pixi.js:18
[preview]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/scripts/local-preview.mjs:21
[build]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/scripts/build-pages.mjs:18
[fixture-loader]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/src/controllers/performance-start.js:11
[build-info]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/scripts/build-info.mjs:14
[preview-start]: C:/Users/User/.t3/worktrees/laughing-waffle-proto/proto-agent-test-links--1b667ed492c1d03a/scripts/local-preview.mjs:118
