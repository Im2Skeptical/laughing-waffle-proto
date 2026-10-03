# Development Lab views

The hash entry in `ui-root-pixi.js` boots `development-lab-dom.js` without the
live game shell. DOM views emit controller commands. `cards.js` renders the
actual Pixi settlement piece into images through one shared renderer, avoiding
one WebGL context per catalogue specimen. Images have textual state alongside.
The global stylesheet uses `.development-lab` selectors only.

`prototypes.js` renders the design-workbench directory at `#/dev/prototypes`.
Its Cards, Tooltips and Vassals links open the separately bundled pages under
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
