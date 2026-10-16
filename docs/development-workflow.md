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

`package.json` owns the game version. Before verifying a completed change, run
`npm run version:game -- patch` once (or supply an explicit `x.y.z`). This updates
the package lock and the build-version marker in `ai/ai-context.md` together.
Update affected AI documentation in the same change. `npm run check:docs` rejects
version drift. Save schemas and standalone art prototype versions are separate.

The badge remains visible in the menu and game: Local/Pages, game version and a
12-character source fingerprint. During play it sits faintly below the top-right
save/menu controls, over the game view. The fingerprint includes uncommitted source,
assets, tooling and documentation, with text line endings normalized. It is
independent of the Git revision; metadata also records that revision for lookup.
Local HTML and Pages artifacts embed their identity at load/build time. Pages
writes the same metadata to `dist/build-info.json` and `dist/build-manifest.json`.
The local badge checks for edits every 30 seconds and when the tab becomes
visible, and prompts the player to save then reload when the loaded build is old.

Verify `npm run verify`, check the local page's badge against `/build-info.json`,
and include its version and live mobile URL with the completed change.

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
