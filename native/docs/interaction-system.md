# N04f interaction and presentation

The regional map is an engraved atlas of a fallen empire. The settlement
board uses the existing illustrated Practices as its focal points. The
population strip and settlement values show what a decision does to the run
over time. Keep the map and plot visible while inspecting and staging so the
player can read a change in context. This follows the cause-and-effect,
composition and phone guidance in [Aesthetic and UX design](../../docs/aesthetic-ux-design.md)
and the projection pillar in [Game design](../../docs/game-design.md).
The board keeps the [existing Practice artwork](../../images/dark-fantasy/settlement-pieces-v4/README.md).
Relief, engraved marks and restrained coast colours take their cue from the
[regional map art](../../images/dark-fantasy/map-generation-prototype/README.md).

## Interaction states

| State | Treatment | Touch and keyboard |
| --- | --- | --- |
| Idle | Dark surface, legible ivory label, muted bronze border. Map labels show faction and settlement identity. | The whole labelled surface is actionable. |
| Hover | Warm edge and brighter face. Cards lift two pixels. The hovered region gains a light boundary and the plot offers a readout. | Long-press exposes the same help. Keyboard focus also opens help. |
| Pressed | Stronger fill and edge on pointer down. Cards settle, the plot grip grows, and a pressed region lights up. | Touch shows it on contact. Enter and Space show it until release. |
| Focus | Bright two-tone treatment against the dark surface, independent of selection. | Tab follows document order. Spatial map and plot controls also respond to arrows. |
| Selected | Persistent gold edge and a label, marker or checked state. Staged cards use a separate amber marker. | Tap or activate to select. Focus may move while selection stays put. |
| Disabled | Muted frame and readable text. Show the reason alongside the affected choice or in its help. | A disabled choice cannot dispatch an action. Its adjacent explanation remains available. |
| Busy | Keep the action in place with an in-progress label. Use the available numeric progress, with a fill on the strip. | Duplicate submissions are blocked. Available scrub coverage remains interactive. |

Touch uses the same press and release path as mouse. A hold opens contextual
help after roughly 450 ms and is cancelled by a drag. Releasing a help hold
leaves the action uncommitted. Zoom controls remain available without a wheel.

## Feedback and confirmation

- New Game resets the map camera and shows opening progress. Once the opening
  reaches its boundary, reveal the map and make settlement selection available.
  Loading failures stay visible with their reason and a New Game recovery path.
- Region selection focuses the camera and opens the settlement board. Card
  selection opens inspection while retaining the board and its order. Empty
  and locked slots explain their state.
- Practice Reform displays the proposed order and quoted game time as soon as
  a move is staged. During drag, mark the source and legal drop target.
  Review opens a dialog naming the Practice, the target slot and the cost.
  Back returns to the staged board, Undo discards it, and confirmation submits
  the existing action. Pending work shows `Applying reform`. Success updates
  the board and clock and posts brief feedback. Rejection names the reason
  and preserves a valid stage for revision or retry.
- Choices acknowledge acceptance through the resulting decision and a short
  notice. A synchronous rejection or asynchronous failure displays the reason.
  Errors persist until the next relevant action or dismissal.
- Scrubbing moves the grip at pointer speed, shows the second and population
  when available, and indicates when the exact snapshot is restoring. A gold
  Live marker stays at committed time. A blue Preview marker and explicit
  History or Forecast label distinguish the view. Live returns immediately.
  The graph uses only published coverage for readouts and requests.
- Escape or platform Back closes the dialog, cancels a stage, returns to Live
  or closes inspection and selection in order. With those layers closed,
  Escape can leave the connected window.

## Motion

Use ease-out for entry and emphasis, and ease-in for exit. Immediate presses
use a direct colour change. Card lift takes about 90 ms. Panel and dialog
entries take about 140 ms and exits about 90 ms when retained for animation.
The camera eases towards wheel and focus targets over about 180 ms. Direct
drag tracks the pointer, with no trailing delay. New Game uses a roughly
300 ms map fade from the atlas ground. Use a short highlight on committed
value changes. During scrubs, numbers snap to the displayed second and the
mode changes immediately. A short colour transition can reinforce a Live or
Preview change. Forecast progress follows actual published coverage without
easing ahead. None of these effects hold the input queue or gate an action.
The Motion toggle removes transitions, reveal and animated camera travel.

## Visual language

- Atlas ground is near-black green with charcoal and dark umber panels.
  Borders use bronze and illuminated edges use gold. Warm ivory carries
  primary information and stone carries supporting information.
- Moss green denotes your holdings, ochre the Crown, slate unheld regions
  and brick red Creep. Settlement symbols, borders and labels carry ownership
  and importance alongside colour. Terrain retains its own family of hues.
  Topology sets the region boundaries, roads and positions of settlement
  marks. Biome marks distinguish ridges, trees, fields and water at a glance.
- Gold denotes committed time or the current selection. Cool blue denotes a
  preview, amber a pending choice or progress, red an error and green success.
  Labels distinguish every consequential state.
- Reuse Lato for readable labels and numbers. Set body at roughly 15 dp,
  supporting labels at 13 dp, section headings at 20 dp and the atlas title at
  26 dp. Use existing artwork for card faces and simple silhouettes for
  map marks, with a distinct keep for the capital. Prioritize usable targets
  and unobscured text in small landscape windows.

## Implementation

Shared RCSS provides button, toggle, tab, card, panel, tooltip, toast, dialog
and progress classes. Connected RML supplies layout and component instances.
Use image decorators for existing card art and lightweight gradients where
supported by the SDL bridge. Pseudo-classes and semantic classes cover
focus, press, selection, disabled, busy, staged and preview states. Use
short RCSS transitions and entry animations on surfaces that stay mounted.
Bind text, progress and classes from the read model and local input state.
Preserve focus and panel scroll across data refreshes.

Use a small C++ presentation helper for camera easing and SDL drawing.
Cache terrain geometry and markings by topology, and draw ownership,
selection and roads over it. Keep the playhead and progress independent of
panel animation. Input continues to use the existing session commands.
The UI owns confirmation, camera, motion, scroll, focus and feedback.
These never enter serialized game state or affect RNG, replay, simulation
ticks or worker scheduling. The existing benchmark and parity checks
validate those boundaries. Drive a connected interaction smoke through
cancel, confirm, rejection and return to Live.
