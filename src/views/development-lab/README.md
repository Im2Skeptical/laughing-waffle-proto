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

`lifegraph.js` owns the dedicated Lifegraph workspace and node reviewer.
`lifegraph-columns.js` edits single-node milestone columns, their class/content
rules, milestones-only node generation, and Founding/Legacy placement or removal.
`lifegraph-preview.js` reuses game node icons and layout in one Pixi stage.
The Lifegraph header's Fullscreen control shares the phone landscape display
mode across every editing tab. Opening a node exits workshop fullscreen;
the node player has its own Fullscreen control and releases it when hidden.
`node-sandbox.js` supplies its playable decision modal, independently of the Gym
timeline, Museum, Zoo and player saves. Rules, review persistence, preset/export
and seed batches belong to `controllers/lifegraph-controller.js`; pure fixtures,
coverage and inventory diagnostics live in `model/dev-lab/lifegraph.js`.
`model/life-map-design.js` owns pooled generation, class scopes and route guarantees.
`lifegraph-choice-editor.js` lists choice effects, absolute base costs and shared
type/quality shop prices from `model/life-map-balance.js`.
`lifegraph-relic-editor.js` authors ordinary Relic quality weights and the
independent Special Relic item pool, with actual seeded offers and eligibility.
Profiles capture those rules explicitly; `life-map-lab-dom.js`
is now a profile summary and copy action rather than a second graph editor.

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
Zoo Class buttons allow multiple pools at once; All clears that selection and
each pool has its own removable chip. `catalogue-summary.js` renders a Stock
summary from every filtered definition across all pages, through the pure
`model/dev-lab/catalogue-summary.js` adapter. Stock flow compares Produced and
Consumed amounts in one row per trait; Required and Build costs switch the table.
Produced and Consumed also show their distinct card counts beneath the Stock
quantities, following the timing selection and counting each filtered card once.
Consumer counts include both mandatory and either/or inputs without duplication.
When selects a phase, season or Discharge; All timings shows per-card yield ranges
without summing repeated activations. The in-memory Zoo preferences preserve the
view, timing and selected trait through filtering/paging. Controls update only
the summary's table; one card breakdown opens at once. Alternative inputs stay
separate as either/or quantities, variable bonuses use +, and help explains why
multi-trait rows cannot be summed. Construction shows per-cycle/completion costs.
`stock-card-preview.js` owns a non-modal reader inside the expanded breakdown:
sticky beside the desktop source list and fixed at the bottom on phones. Source
buttons, Previous / Next and Close preserve the list and phone scroll position;
the sequence deduplicates cards across the breakdown's sections. `zoo.js` resolves
the selected runtime/draft face and construction side. The reader reuses the
shared image renderer and full inspection, with no fixture or route changes.
Reviewer Lock/Unlock controls save availability proposals alongside value edits.
Clear all reviews removes the entire queue, drafts and notes in one storage
transaction after a two-tap confirmation, and resets selection and bulk undo.
Zoo and Reviewer share Maturity filters for exact tiers and inclusive/exclusive
lower and upper bounds, ordered Bronze, Silver, Gold, Diamond. These filter the
definition's minimum quality (the projected draft in the reviewer), independently
of the rendered preview quality. Select all shown follows the filtered queue.
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
Its Map, Opening and Vassals links open the separately bundled pages under
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

- `quality-filter.js` — maturity filter labels and fields for exact tiers and lower/upper bounds.
