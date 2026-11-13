# Development preview and build identity

## Local preview (default)

Run `npm start` before handing back changes. It reuses a running preview for this
checkout or starts a detached Node server listening on `0.0.0.0`. It prints a
desktop URL and mobile URLs for the computer's network interfaces. Use the LAN
address on a phone connected to the same network; `localhost` on the phone
refers to the phone. Keep the computer awake. If the firewall blocks the phone,
allow Node on the private network.

Ports start at 5184; occupied ports and previews belonging to other checkouts
are left alone. The server serves code and HTML without caching, so reload after
edits. Runtime artwork uses immutable content URLs; unchanged images are reused
from this origin's browser cache. It does not automatically reload a running game. The preview identity is
available at `/__preview__/status`; process output goes to
`artifacts/local-preview.log`. Stop that preview's reported PID when no longer
needed. Always return the URL actually printed by the command, not a remembered
address or a link to another checkout.

Minimal graphics: append `?dev=1` to the preview URL (before any `#` route).
This loads shared resource/Stock/clock icons but skips illustration atlases and
terrain baking, retaining the full New Game,
map, Practices, saves and simulation with polygon terrain and fallback symbols.
Omit the query for the illustrated game. Developer tools > New game in performance
mode starts directly in the separate `performance-dev` save (replaced by each
new performance start). Continue performance game resumes it; slots 1-3 stay
separate. The adjacent Random seed checkbox defaults off. When checked, every
new performance game uses fresh entropy and computes its opening forecast on the
device before entry. It retains the regular-game setup, ignoring custom profiles,
edited cards and the ordinary New game seed override. The choice is remembered;
`&seed=random` selects it in a direct performance URL. Unticked (or
`&seed=prepared`), each new start chooses uniformly among five prepared seeds:
123, 1867, 99117, 424242 and 2026. A numeric `&seed=123` (or another seed from
that pool) pins a direct launch for repeatable debugging. Continue always keeps
the saved world's seed. The adjacent
Load artwork progressively checkbox defaults on: card
art and other atlases upload in batches after entry, then terrain prepares
cooperatively. Stubs stay visible until everything is ready: the top-right Dev
seal shows a tick. Tap it to reveal the prepared graphics together; holding still
opens the workshop. Turn it off to retain
stubs (`?dev=1&perf=1&art=0`). A direct performance URL resumes its Dev save
when available; add `&launch=new` for a fresh start. Each prepared regular-game
seed loads its own forecast, summaries and scrub anchors; entry downloads only
the chosen seed's file. `npm start` and `npm run build` regenerate the five files
when simulation sources, the seed pool or its recipe change; UI-only edits reuse
them. Custom profiles and edited cards use ordinary New
Game outside performance-start mode. The bake uses every official simulation tick;
saves, later actions and replay use the normal engine.

## Interrupted New Game loading

Switching apps, locking the phone, or browser freeze suspends opening simulation
without cancelling entry. Returning resumes from accepted forecast coverage;
foreground-only deadlines still detect a genuinely stalled worker. Continue's
save-replay deadline also excludes background suspension. No wake lock is used.

New Game stores one replaceable opening checkpoint in IndexedDB's `settings`
store, outside save slots. It captures the initial world, every computed summary,
retained anchors and the continuation tail, at most every five foreground
seconds while progressing, plus initialization, suspension and completion.
Writes are atomic and periodic writes do not overlap. A reload reuses compatible
work when preparing New Game; choose the destination slot again. Graphics may
need rebuilding. Compatibility requires the exact embedded build fingerprint and
launch settings. Back/settings changes discard preparation; Retry retains it.
The checkpoint remains through scene installation and first-save failures, then
clears after a successful initial save (including a save retry). Denied storage,
quota errors or damaged checkpoints fall back to ordinary loading. Browser
storage eviction can still remove checkpoints.

Run `npm run test:loading-recovery` for the deterministic/IndexedDB checks and
the real-menu phone visibility and browser-reload regression probes. On a phone,
start New Game, switch apps/lock for a minute, return and check entry completes
without Retry. For process-loss recovery, reload during forecast preparation,
then choose New Game and a slot: forecast preparation resumes from the last
committed checkpoint with the same world. Artwork preparation may run again.

## Versions

1. Every PR includes the next version bump in `package.json`, both package-lock
   version fields, and `ai/ai-context.md`, following the version rule below.
2. Apply the verified changes to the local build first; report to Cam what changed
   and how to test.
3. Push the branch and open a PR to `main` (draft if untested).
4. Once Cam authorizes a merge and required checks pass, the task-owning agent
   squash-merges the PR. If the substantive changes have not had a fresh,
   independent review, obtain one and resolve blocking findings first. Match the
   merge to the checked head commit; preserve branches/worktrees unless Cam
   asks to remove them. Complete this in the current task rather than handing
   the merge to an external Dispatcher.
5. After a PR opens or merges, return the primary checkout to up-to-date `main`
   with no uncommitted work; never leave it on a feature branch.
6. Tell Notes & PM when a PR merges so Trello stays accurate.

`package.json` owns the game version. Bump it once per PR to the next patch
(or an explicit higher `x.y.z`) beyond current `origin/main`, and update both
`package-lock.json` version fields and the marker in `ai/ai-context.md` together.
The existing `npm run version:game -- patch` helper only runs on `main`; on PR
branches, update those same fields directly. Run `npm run verify` before committing;
`npm run check:docs` rejects version drift. Keep failed verification local until
resolved. Save schemas and standalone art prototype versions are separate.

The badge remains visible in the menu and game. A clean `main` build shows only
`v1.2.3`; a task branch, detached checkout, or modified `main` shows
`v1.2.3 · Preview 5184` locally. The preview number is the server port: a compact
identifier for that running checkout, not an ordered version. Pages builds of
unintegrated sources show `Preview` without a local port. During play the badge
sits faintly beside the top-right save/menu controls, within their row. Hover or
focus it for the full fingerprint, branch, revision, and Local/Pages channel;
these details are also available in `/build-info.json`. The fingerprint includes
uncommitted source, assets, tooling and documentation, with text line endings normalized. It is
independent of the Git revision; metadata also records that revision for lookup.
Local preview caches build identity for five seconds and hides child-process windows on Windows.
Local HTML and Pages artifacts embed their identity at load/build time. Pages
writes the same metadata to `dist/build-info.json` and `dist/build-manifest.json`.
The local badge checks for edits every 30 seconds and when the tab becomes
visible, and prompts the player to save then reload when the loaded build is old.

### Selective artwork caching

Both previews and Pages embed a pinned artwork manifest in HTML and expose
`artwork-manifest.json` for fresh polling every 30 seconds and on tab visibility.
Cards, Regions, and Frames/icons/shared chrome have separate notice revisions.
These revisions never enter resource URLs: each runtime image has its own SHA-256
path under `artwork/`. Changing code, docs, or an unpacked source painting cannot
invalidate unchanged runtime art. Repack source paintings before expecting a card
art update. Atlas JSON paths include their dependency closure, with rewritten
image and linked multipack paths; changing one packed image reuses the other
images while refreshing the affected JSON references. Runtime regional JSON and
images are individually addressed too. Keep new runtime atlas groups registered
in `scripts/artwork-manifest.mjs`, with their appropriate category.

The existing build badge shows `Artwork updated: Cards` (or the affected
categories). `Save & reload` pauses through the game menu, waits for the session
save, and only reloads on success. Continue or another game entry cancels a
pending reload, even if the player returns to the menu before saving finishes.
Failed saves and unfinished entry keep the page open. A normal browser reload applies the embedded new manifest. Neither action
clears IndexedDB, preferences, browser caches, or unrelated origin data. Minimal
graphics still requests only shared icons; progressive art keeps the page's
original URLs until reload and retains its explicit reveal step.

The LAN server gives content URLs `max-age=31536000, immutable` and supports ETag
revalidation; code, workers, HTML and polling metadata stay `no-store`. Its
`artifacts/artwork-cache` retains old snapshots so already open pages can finish
deferred loads. Pages publishes the current snapshot as ordinary static files;
its hosting cache policy applies (observed `max-age=600` with ETag/Last-Modified),
so expired resources can revalidate instead of transferring image payloads.
Pages app/CSS/worker filenames remain hashed by the existing build. Pixi remains
on its version-pinned CDN URL. No service worker, offline shell, or engine change
is introduced. Caches are per origin: changing preview hostname or port is cold.
Network reuse does not eliminate image decoding, GPU upload, or terrain baking.
Browser eviction still applies: incognito memory caches may refuse the existing
card atlas pages larger than 10 MB; a normal persistent Chromium profile retained
all runtime images in the cache probe.

Run `npm run test:artwork-cache` for changed-file, category, multipack, pinned-load
and reload-gating contracts. `node scripts/artwork-cache-browser-probe.mjs <URL>`
checks real cold/warm transfers and graphics modes; results go to
`artifacts/artwork-cache/`. Add `--pages` to exercise `dist/` under a nested
Pages-style base URL. Use `npm run verify` for the required full checks.

Verify `npm run verify` and check the loaded page's badge against
`/build-info.json`. In the completion report include the inherited or integrated
version, preview label when present, full fingerprint, branch, live mobile URL,
and whether the task is still isolated or integrated into `main`. Read these from
the actual preview rather than reconstructing them from memory. A preview label
can be reused after a server stops; the fingerprint identifies the exact source.

## GitHub Pages (confirmed publication only)

Prepare and verify the change locally first. Obtain explicit user confirmation
to publish that version. After confirmation, commit only the task's verified
changes, bring `main` up to date and push it. Dispatch **Deploy GitHub Pages**
on `main` with the approved `version` and `confirm_publish=true`. Verify the
deployment succeeds and the published badge matches that version/fingerprint.

Pushes run verification only. The deployment workflow is manual, requires the
confirmation input and checks the approved version against the checkout. A push
or a general request to implement a feature does not authorize publication.
Workflow configuration changes take effect on GitHub only after they are pushed;
until then the agent confirmation rule still applies. The existing Pages build
remains the last approved publication, not necessarily the latest local version.
