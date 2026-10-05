# Development Lab views

The hash entry in `ui-root-pixi.js` boots `development-lab-dom.js` without the
live game shell. DOM views emit controller commands. `cards.js` renders the
actual Pixi settlement piece into images through one shared renderer, avoiding
one WebGL context per catalogue specimen. Images have textual state alongside.
The global stylesheet uses `.development-lab` selectors only.

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
`src/controllers/card-review-controller.js`; JSON draft/path operations live in
`src/model/dev-lab/card-review.js`. Reviews never enter the Lab timeline.

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
