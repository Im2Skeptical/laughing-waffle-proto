# Agent test links: integrated prototype

Snapshot test-link tooling, developed on `proto/agent-test-links-20261115` following the
[viability investigation](research/agent-test-links-viability.md). All limits and
coverage claims are provisional. Cam's phone successfully opened the original
54,522-character transport link and verified checksum `e693b760`. This version
extends the experiment to the actual game shell. Cam approved integration and
Pages publication in the task thread on 2026-11-16.

## Reporting requirement

For browser-game behavior or UI changes that a captured game situation can
demonstrate, return one or more verified test links that open the relevant state,
view and panels. Examples include a changed decision, a fixed panel interaction
or a gamepiece shown in context. Use the capture-and-report recipe below.

A report is ready when its link has been opened in a fresh tab on the final
build and the reported situation and panels have been checked there. Include
relevant screenshots from that restored situation; visual changes also need a
before image. Report build identity and preview reachability using the recipe.
A link supplements screenshot evidence and test results.

Documentation, workflow or test-only changes need no game-state link unless
they affect observable game or link-entry behavior. If the capture tools are
unavailable in the checkout, or the situation exceeds the capture contract,
state that limitation and give a runnable reproduction with screenshots.
For an oversized URL, share the capture JSON and file-import instructions;
a browser-local `testFile` token is not a portable link. Use the actual changed
situation rather than an unrelated fixture or a generic preview URL.

The standing rule is in root `AGENTS.md`; agents inherit it when their checkout
includes this tooling. Existing worktrees need the integrated changes before
they can generate these links.

## Capture and report a situation

1. Finish code, documentation and version edits before capturing; regenerate
   after any edit changes the build fingerprint. Open this checkout's preview
   and arrange the actual game situation and panels.
   Pause at an integer second. Finish any active drag, loading operation or
   decision transaction first. A staged shop purchase or unconfirmed choice can
   remain staged.
2. In that browser, call `await __AGENT_TEST_LINKS__.download()`. It downloads
   `test-capture.json` and returns URL availability and length. Avoid printing the
   entire returned URL or state to tool output. The capture reads the displayed
   state, including a revealed forecast state when browsing one, rather than
   always substituting the live cursor. It does not promote that preview in the
   source run.
3. Use the downloaded file and the actual recipient-facing preview URL:

   ```sh
   npm run capture:test-link -- <downloaded-test-capture.json> http://192.168.1.103:5197/?dev=1
   ```

   Replace the LAN address/port with this checkout's live preview. The command
   validates the target build and writes `artifacts/agent-test-links/integrated-link.html`,
   `integrated-link.txt` and `integrated-capture.json`. Render the HTML launch card
   in the T3 reply. Its anchor contains the whole compressed snapshot and panel
   envelope, so no hosted fixture or original browser storage is required.
4. Open the returned link in a fresh tab and take the report screenshot there.
   This verifies that the picture actually matches the captured situation.
   Include the app version, fingerprint, isolated branch and live LAN URL. A new
   source fingerprint requires a new capture/link, even for documentation edits.

For programmatic use, `__AGENT_TEST_LINKS__.capture()` returns
`{packet, text, url, needsFile, encodedCharacters, diagnostics}`. The diagnostic
object is captured at the same point as the snapshot and includes the existing
runner export and the separate player-action journal. Use
`__AGENT_TEST_LINKS__.downloadDiagnostics()` to download the current Dev history
without putting it in a link. Large diagnostic data belongs in an artifact file,
not chat, console output or the URL.

## Restoration and safety

The normal game entry decodes `#/dev/play?test=...`, validates the state with the
authoritative deserializer, checks the exact loaded/current build and complete
panel inventory, then initializes a disposable run. Artwork prepares behind an
input-blocking loading surface. The restored view stays paused at the captured
second; forecast preparation does not move its playhead. Existing graph browsing
and replay rules are unchanged. Earlier source history is in the separate Dev
export, while the disposable run starts its own history at the captured second.

On touch devices, links first offer **Performance graphics** (simple map and
icons) or **Full graphics** (illustrations and terrain). Either tap uses the game's
existing display helper to request fullscreen, then landscape lock. The choice
runs before importing game views or preloading illustrated atlases, sets this
page's `dev` query in memory without a reload, then installs the same snapshot
and panels. It never sets `perf`, starts a performance run or writes its slot.
The captured appearance flags still govern individual graphics effects.
A navigation from T3 cannot supply that page's fullscreen activation. Portrait
remains covered until rotation; if the browser declines fullscreen, **Continue
in landscape** becomes available after rotating. Desktop entry remains immediate
using the URL's graphics mode. File handoffs and refresh use the same entry.

Performance auto-launch parameters are removed before the game menu boots, so
a test link cannot accidentally resume or replace the performance save. The new
session's slot is null. Autosave, menu and refresh must not overwrite slots 1–3
or the performance slot. Invalid or incompatible captures show an entry error;
they do not quietly substitute another scenario.

The transport is gzip/base64url in the fragment. Provisional guards are 512 KiB
encoded and 8 MiB decoded. A capture above the URL guard returns `needsFile` and
keeps its JSON file available. Use **Menu → Developer tools → Open test capture
file**, or `__AGENT_TEST_LINKS__.openFile(text)`. Import opens another disposable
tab and uses a separate `full-map-agent-test-captures` IndexedDB database for
the temporary handoff. It does not import into a player slot. File handoffs
survive refresh in that browser; the JSON file is what transfers between devices.
The separate handoff records remain until browser storage is cleared.

## Panel coverage contract

View envelope v1 records 18 explicit adapters. These are view data, not serialized
DOM nodes, Pixi objects or callbacks. Restored panels use their normal controls.

| Adapter | Captured context |
| --- | --- |
| Navigation | Map, settlement or Life Map; selected region and graph scope |
| Decision draft | Accepted but uncommitted option/purchase/move/undo actions |
| Appearance | Graphics experiment flags, restored in memory without overwriting browser preferences |
| Vassal flow | Candidate drawer, selected candidate and resolution recap data |
| Map | Expanded Chaos panel; selected settlement is in navigation |
| Settlement | Overview or Demographics tab |
| Life Map | Inspected/candidate node, planned pins and entry confirmation |
| Node decision | Open node, offer page, replacement/acquisition picker, world subview, card inspection and reading positions |
| Development | Selected stat and pinned stat reading |
| Heirlooms | Inventory tab/page, loadout/overflow selection and inheritance-summary dismissal |
| Commission | Pending offers from the captured state |
| Recap | Open recap from the captured flow data; its animation restarts |
| Run complete | Open or minimized loss/tenure details |
| Phase reference | Selected moon phase |
| Graph series | Scope, visible series and chooser visibility |
| Research | Filters, scroll and filter dropdown/page |
| Workshop | Tab, scroll and transient Vassal draft, without replacing saved presets |
| Tooltip | Card/ledger inspection, nested keyword path, reading/source scroll and pin state |
| Game menu | Page, expanded Developer tools and overwrite selection |

Navigation is a separate envelope field; the remaining rows are the 18 adapters.
Required data is never silently dropped for an unknown adapter. Browser-local
save listings and preset libraries remain local to the recipient, rather than
being copied over their own data. Busy loading/worker/drag states and an active
save-import workflow explicitly require finishing or cancelling before capture.
OS file pickers and animation frames are not game panels. Camera zoom is deferred
as discussed; it is not a coverage claim in this prototype.

## Dev action tracing

The journal observes accepted runner commands and staged Life Map actions. It
records sequence, run identity, simulation second, arguments and acceptance phase.
Its append-only entries survive undo, replacement and starting another run in the
same tab; each run has its own replay baseline. Failed commands are not recorded
as accepted actions. Worker adoption is a commit entry, separate from earlier
draft interactions.

This first journal lives in the tab and is exported on request. Existing saves
still preserve the active replay history. Previously discarded actions from
before journal activation, or a prior tab that was closed without exporting,
cannot be reconstructed. Durable cross-reload audit storage and a readable Dev
history viewer are additional work, not implied by this local prototype.

## Verification

- `node scripts/agent-test-link-test.mjs`: state/RNG isolation, format/build/bounds,
  trace parity/retention and deterministic staged-choice restoration.
- `npm run probe:test-links -- http://localhost:5197/`: fresh-tab panel round trips,
  world and shop decisions, nested card references, large-file import, refresh,
  rejection and occupied-player-slot preservation. Detailed evidence goes under
  `artifacts/agent-test-links/integrated/`; stdout stays concise.
- `npm run probe:test-links:display -- http://localhost:5197/?dev=1`: portrait
  entry, graphics choices before artwork loads, local fullscreen activation, pending/rejected rotation, native fullscreen,
  manual landscape fallback, refresh, file entry and occupied-slot preservation.
- `npm run probe:test-links:tooltip`: hover, quick/pinned readings, dismissal and
  graph-anchor constraints survive capture/restore without becoming a modal.
- `npm run verify`: repository checks and regression suite.

Phone acceptance still requires opening the integrated game link. The earlier
phone success established transport/readability for that particular sample,
not blanket support for all payload sizes or completed panel coverage on mobile.
