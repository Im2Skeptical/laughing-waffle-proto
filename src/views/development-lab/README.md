# Development Lab views

The hash entry in `ui-root-pixi.js` boots `development-lab-dom.js` without the
live game shell. DOM views emit controller commands. `cards.js` renders the
actual Pixi settlement piece into images through one shared renderer, avoiding
one WebGL context per catalogue specimen. Images have textual state alongside.
The global stylesheet uses `.development-lab` selectors only, driven by the
tokens at the top of that block. `elements.js` holds the shared building blocks:
button tones, `disclosure` (remembered collapsible groups with count badges),
`info` ("How … works" toggles), field-level help, `badge`, `segmented` and
`group`. Remembered open/closed state uses one browser-storage key and is only
written when a person toggles something.

`new-run-setup.js` mounts Map Lab, Game Settings and Life Map Lab under Gym,
with one combined-profile toolbar. Those editors (`../map-lab-dom.js`,
`../debug-configuration-dom.js`, `../life-map-lab-dom.js`) are only mounted
here; they build on `elements.js` and their styles are scoped under
`.development-lab .lab-editor`, with no injected or inline style blocks.
`lockDebugEditor` skips controls marked `data-lab-ui` (help toggles, searches)
so the read-only baseline stays explorable.
`zoo.js` keeps the filter drawer open state and the sliding bar state in its
closure so re-renders after a filter change keep the drawer and focus in place;
`--lab-zoo-bar-h` offsets sticky headers below the bar. The card reviewer owns gamepiece editing;
reviewed cards can be applied to the combined profile. `debug-profile-controller.js` owns read-only Regular game, editable
recipe copies, local drafts/profiles and launch options. Both its launches and
player New Game use `model/new-game.js`. Profiles describe initialization;
Museum fixtures describe a captured state. The hold-button workshop retains
live Vassal tools and save diagnostics only.

`node-sandbox.js` is a Gym-only workspace with one persistent Pixi stage using
the game's node-decision modal. Its dummy controller is independent of the
settlement Gym timeline, Museum, Zoo and player saves. Refresh settings and
status stay in DOM; staging, inspection, drag/undo/reroll and Confirm use the
shared game view and model APIs.

`card-reviewer.js` renders the persistent review queue, face value targets,
inline fields, live comparison and notes. `cards.js` exposes the shared rendered
image, picker icons and face-section bounds. Stock trays toggle a variable number
of traits; schedule trays toggle phases and seasons, keeping seasonal yields in
step in one storage transaction. The editor is a viewport-height modal with narrow
tap-to-close side margins, Escape dismissal and a fixed Done footer. Only its body
scrolls; background page scrolling is locked while it is open.
Persistence/export live in
`src/controllers/card-review-controller.js`; `review-import.js` previews file
imports and chooses how matching drafts are handled before committing.
JSON draft/path operations live in
`src/model/dev-lab/card-review.js`. Reviews never enter the Lab timeline.
`zoo.js` can project edited definitions into its display snapshot, including
filters, shared readings and quality comparisons. Live/edited/edited-only modes
leave the controller fixture unchanged; notes-only reviews remain live cards.
Reviewer Lock/Unlock controls save availability proposals alongside value edits.
`review-bulk-edit.js` adds the reviewer's selection mode (Select, All/Selected
views, Select all shown, a fixed "N selected · Edit together" bar) and a sheet
that sets one top-level number or choice across the selection: bottom sheet on
portrait phones, side drawer in landscape, dialog on desktop. The controller's
`planBulk`/`bulkEdit` share one plan (old → new or a skip reason per card; locked
cards only with Include locked), save in one storage write and return a snapshot
of each changed card's baseline and edits for Undo bulk edit. Positional effect
fields stay per card. Zoo "Add N shown to review" flags the filtered Practices and
Structures with `flagMany` and hands the group to the reviewer's selection.
`review-list-editor.js` is the one editor for a card's lists: Production outputs
(non-Stock outputs from `model/practice-outputs.js`) and scheduled Practices'
Consume and Require. Rows show icons, an amount and Remove; Add uses the Stock-tag
icon tray, an amount and Add. Each save replaces the whole `effects`, `consume`
or `require` list, which shows as one Changes row with Revert. Stock production,
Chaos and other DSL effects keep their authored order and shape; one output per
type, at most three effects and three inputs. Game-config canonicalization keeps
such lists and falls back to the authored list otherwise. Zoo Produces, Consumes
and Requires filters read the same data (Structures produce Housing).
`structure-plan.js` projects disposable plan slots through the shared face renderer
and supplies per-cycle/total cost copy. Zoo and Reviewer switch between plan and
completed faces. Reviewer construction controls edit cycles and whole Stock cost
collections, including trait alternatives, without changing the fixture.
Zoo labels locks and can hide them in every card-version mode, including live
faces, without changing the fixture or deleting definitions.

`card-reading.js` supplies one lazy interactive Pixi canvas for Zoo quick reads
and full inspection. It uses the game's `addPracticeReading` and
`addChronicleInspection`, including the symbol key and recursive keyword links.
Both catalogue and quality-comparison cards opt in; Museum/Gym and pickers keep
their existing input. Closing or re-rendering dismisses the reading surface.

`prototypes.js` renders the design-workbench directory at `#/dev/prototypes`.
Its Cards, Vassals, Structures and Inspector links open the separately bundled pages under
`images/dark-fantasy/`; no prototype renderer is imported into the game shell.

`dev-preview-display.js` provides the shared enter/exit control for the persistent
scene and the isolated workbenches, using `game-display-mode.js` for fullscreen
and mobile landscape. Its stylesheet is `card-chrome-prototype/display.css`.

`scene.js` retains a single Pixi stage around the existing world map, metric graph,
and sun/moon wheel views. It owns only display preferences and sends selection/time
commands to the Lab controller. `picker.js` uses the same catalogue and card faces;
`ordering.js` handles pointer/touch and keyboard insertion gestures. Fields commit
on change, and rejected edits leave the authoritative controller branch untouched.

The controller owns an isolated timeline and projection cache. Scrubbing calls
authoritative replay; editing establishes a new snapshot-origin branch. Forecast
coverage is bounded by the explicit span. No live runner or player save is attached.
