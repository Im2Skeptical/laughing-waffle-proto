# Development preview and build identity

## Local preview (default)

Run `npm start` before handing back changes. It reuses a running preview for this
checkout or starts a detached Node server listening on `0.0.0.0`. It prints a
desktop URL and mobile URLs for the computer's network interfaces. Use the LAN
address on a phone connected to the same network; `localhost` on the phone
refers to the phone. Keep the computer awake. If the firewall blocks the phone,
allow Node on the private network.

Ports start at 5184; occupied ports and previews belonging to other checkouts
are left alone. The server serves source files without caching, so reload after
edits. It does not automatically reload a running game. The preview identity is
available at `/__preview__/status`; process output goes to
`artifacts/local-preview.log`. Stop that preview's reported PID when no longer
needed. Always return the URL actually printed by the command, not a remembered
address or a link to another checkout.

## Versions

`package.json` owns the integrated game version. Assign versions sequentially on
`main`, once per integrated change or combined batch. A higher integrated version
continues the previous `main` build, including any intentional reverts. Parallel
worktrees inherit their starting version; their numbers do not describe which
other threads' changes they contain. Update affected AI documentation while
working, but leave the version fields unchanged in task branches.

When integrating:

1. Verify the task branch, then integrate it onto the latest `main`. Preserve
   `main`'s current version fields if an older branch carries a version bump from
   the previous workflow. Keep `main` history cumulative rather than resetting it.
2. On `main`, run `npm run version:game -- patch` once (or an explicit higher
   `x.y.z`). The command rejects other branches and non-increasing versions. It
   updates the package lock and the marker in `ai/ai-context.md` together.
3. Run `npm run verify` on the combined result, then commit the integrated change
   and version together. Keep failed verification local until resolved.

`npm run check:docs` rejects version drift. Save schemas and standalone art
prototype versions are separate. Integration stays local unless pushing or
publication is authorized.

The badge remains visible in the menu and game. A clean `main` build shows only
`v1.2.3`; a task branch, detached checkout, or modified `main` shows
`v1.2.3 · Preview 5184` locally. The preview number is the server port: a compact
identifier for that running checkout, not an ordered version. Pages builds of
unintegrated sources show `Preview` without a local port. During play the badge
sits faintly below the top-right save/menu controls, over the game view. Hover or
focus it for the full fingerprint, branch, revision, and Local/Pages channel;
these details are also available in `/build-info.json`. The fingerprint includes
uncommitted source, assets, tooling and documentation, with text line endings normalized. It is
independent of the Git revision; metadata also records that revision for lookup.
Local HTML and Pages artifacts embed their identity at load/build time. Pages
writes the same metadata to `dist/build-info.json` and `dist/build-manifest.json`.
The local badge checks for edits every 30 seconds and when the tab becomes
visible, and prompts the player to save then reload when the loaded build is old.

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
