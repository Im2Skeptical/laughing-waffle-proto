# Development Lab

Open `#/dev` (defaults to Zoo), `#/dev/zoo`, `#/dev/reviewer`, `#/dev/museum`, `#/dev/gym`, or `#/dev/prototypes`
on the normal app URL. These hash routes survive direct loading and refresh on
GitHub Pages, including the repository path. The live workshop (hold its seal or
Ctrl+Shift+D) also has **New run setup in Gym** and **Open current state in Gym**.
Only live Vassal candidate replacement and save diagnostics remain in that workshop.
Fresh-run editing lives in **Gym ? New run setup**.

## New run setup

Gym opens **New run setup** by default (`#/dev/gym?workspace=setup`). Its
**Regular game** profile is read-only and comes from the same current-build
setup and initialization path as player New Game. It includes two player
settlements on a seeded random road, rolled Structure capacities and four
neutral settlements. **Copy to edit** creates an editable draft of that recipe.
Map Lab, Game Settings and Life Map Lab are its three editor tabs. The single
**Combined profile** toolbar saves and loads every section together, including
launch options and any applied reviewed cards. There are no separate section
profile or preset toolbars. Edit gamepieces in the card reviewer. Profiles save
locally and support JSON export, copy and import. The built-in profile cannot be renamed, saved over or deleted.
Drafts survive refresh. **Default in workshop** chooses the recipe for the next
workshop opening and clears the remembered draft; it never changes player New
Game or a live game.

**Regular game ? random connected pair** uses roads from Map Lab and its first
detailed settlement as the shared starting tableau; per-region placement is
rolled. Choose **Exact Map Lab placement** to use each region's assignment and
tableau. Neutral seeding can be disabled for focused authored scenarios. The
explicit seed makes launches reproducible. A launch fails visibly if the edited
map has no eligible road or insufficient frontier space for four neutrals.
Life Map's preview seed only changes its preview; the launch seed drives the run.
**Apply reviewed cards to draft** captures reviewer proposals in this recipe.
Player New Game retains its separate reviewed-card toggle.

**Start new run** opens normal gameplay in this tab as an unsaved test run.
Use browser Back to return to the remembered workshop draft.
**Open in settlement sandbox** creates a t=0 state in Gym for inspection or
further edits; the imported baseline survives refresh and workspace changes.
From there, **Save to Museum** captures a named state at the
viewed second. Profiles are launch recipes; Museum exhibits are saved states,
including RNG, and use the existing fixture library. These workflows share
normal state validation and handoff; they do not write player save slots.
The profile/export schema is v3; obsolete profiles are unsupported.

## Gym node sandbox

In **Gym · sandbox**, select **Node sandbox** to open a mock node/shop with a
dummy Vassal and settlement. Choose a node family or signature, dummy class,
Research, Prestige, age and stats, then **Refresh contents**. Research uses the
normal civilization unlocks and base quality rolls when generating shop contents;
the setup shows the current quality chances and next milestone. Dummy class
bonuses and installed-card upgrades still apply. The real game modal supports
card quick reads/full inspection, staging, drag placement, undo, shop reroll and
Confirm. **Open node** reopens it after closing or confirming. **Resolve outcome**
advances the dummy through real simulation ticks, including costs and danger.

Refresh resets the complete mock setup and staged changes. Identical settings
and **Refresh seed** reproduce identical contents; **Next seed** increments the
seed and refreshes. The in-game reroll retains its own costs and limits. The
Fullscreen control supports mobile landscape. This workspace exists only in
Gym and does not alter its settlement timeline, Zoo, Museum or player saves.
Verify with `npm run verify` and `npm run probe:development-lab -- --nodes-only`;
the full Development Lab probe includes the same node checks.

## Card reviewer

**Card reviewer** sits alongside Zoo. **Review card** flags any Zoo Practice or
Structure and opens its review. The top-right **Dev** control in the shared card
inspection does the same from the live game, including shop inspections, and
opens a separate reviewer tab. Re-flagging preserves existing edits and notes.

Tap an outlined value area on the actual card face to open simple fields over
its illustration. Valid edits save immediately and redraw the shared live
renderer. The fields below the card also expose costs, worker values, seasonal
production, inputs, bonuses, tags, traits and copy without a JSON editor.
Structural DSL identities and operation names remain fixed. Invalid inputs
report inline errors and leave the last saved value intact.

**Compare with live** uses the current build's definitions at the same preview
quality. Cards appear alongside each other on desktop and stack on phones;
readable rules and a value-change list accompany the faces. Preview quality is
a display control, rather than a definition change. Notes save as you type.
**Export all reviews** downloads one JSON file containing every flagged card,
notes, its original definition, current live definition, modified definition,
and explicit original/live/proposed values at each edited path.

Reviews use the stable `civsurvivor.card-review.v1` browser-storage key, independent
of simulation/save schemas and game resets. They survive sessions and builds on
the same site, browser and device. Clearing browser site data removes them.
New builds supply unedited values; edited values retain their proposals. Changed
field shapes and removed cards remain in storage/export with a visible warning.
**Reset edits** keeps the flag and notes; **Delete review** requires a second tap
and removes the entire review. Drafts never change an existing run.

In Zoo, **Card versions** selects **Live cards**, **Show edited cards** (drafts
where available, live values elsewhere), or **Edited cards only**. Draft faces,
filters and reading panels use the modified definition without changing the
Lab fixture. Cards with edits are marked **edited**; notes-only reviews are not.

The main menu's **Developer tools** includes **Use edited cards in new games**.
Enable it, then start **New game** to play with this device's reviewed definitions;
no rebuild is needed for subsequent card edits. Each new run captures a validated
definition snapshot before initialization. That snapshot travels with its save,
replay and forecasts. **Continue** and **Load game** keep the recorded values,
even after changing the toggle or reviews. The toggle persists separately from
player saves. Conflicting or invalid drafts must be fixed before an edited game
can start; they are not silently skipped.
Verify persistence, export, build drift and failed writes with `npm run test:card-review`.
Verify Zoo/mobile controls with `npm run probe:development-lab -- --reviewer-only`
and new-game/Continue behavior with `npm run probe:game-menu`.

## Prototypes

**Prototypes · design** sits beside Zoo, Museum and Gym. Its four workbenches
cover illustrated Cards, Vassals & Founders, Structures & tooltips, and the Practice
inspector. Each opens
an isolated page with a return link to this section. Direct workbench URLs and
the Prototypes hash route support refresh and GitHub Pages repository paths.
The Pages build bundles each separately. Edits are temporary presentation
examples; these studies do not change the live renderer, simulation or saves.

Cards includes a matched comparison with the current game renderer and five-card
regional settlement / three-offer Practice shop screen references. Its Graphics
control switches the hero, preset cards and contextual previews. Graphics choices
survive workbench URL refresh. The in-game Practice quick read and expanded
inspect view are the current tooltip reference; the old standalone Practice tooltip workbench is retired.

Structures renders three card treatments, quick reads and inspection entirely
inside a Pixi canvas over a static game screenshot. It preserves the map,
settlement, five Practice slots, construction strip, graph and navigation at
game proportions. Hover or tap a Structure for its quick read; select the title
for the Practice-style card/rules/glossary inspection. The same Fullscreen
control as Cards/Vassals provides mobile landscape preview, with in-canvas
variant and reading controls. Save screen PNG exports the current canvas,
including any tooltip or inspection. Quality, Scholar requirements and staging
are temporary preview controls. The URL preserves treatment, card and context.
Run `npm run preview:structures` or open it from Prototypes. No live cards change.

Inspector studies the actual Pixi full inspection renderer, current card faces
and a simple right-hand symbol key. Each row is a symbol and its readable name;
definitions are behind clickable names rather than paragraphs in the key.
Definitions contain further clickable terms; Back retraces the private reading
stack and Close dismisses it. Each layout displays one definition, without Pin
or a visible history list. Compare a nearby
reference (`?variant=A`), fixed rail (`B`) or centered reference (`C`) with the
bottom Pixi switcher. Its Fullscreen button uses the same mobile landscape
flow and rotated fallback as the other workbenches; card, quality and layout
controls remain inside the fullscreen canvas. Run locally with
`npm run preview:keywords`. These interactions
are exploratory and do not change the in-game tooltip.

The card hero, screen references, vassal hero and Museum/Gym Pixi
scene have a top-right Fullscreen button. The same button exits. Touch devices
request the main game's landscape display mode; browsers that reject orientation
locking get a landscape preview fallback. Escape and native fullscreen exit also
restore the normal page. Museum/Gym keep their existing map, graph and wheel input.

## Catalogue

Zoo reads the fixture's serialized runtime Gamepieces registry. It includes every
implemented Practice and Structure, generated candidate specimens, Life Map
families/signatures, the four neutral templates, and the single spatial Monster
type. Search covers IDs, names, rules, and definition data. Filters cover category,
Common/Scholar/Warrior, minimum maturity, Card Tags, Stock Traits, and footprint.
It also filters Scheduled/Charge mode and reports the required CivContent 2.6
pool counts (109 Practices / 78 Structures). Compare exposes Charge grammar,
executable effects and provisional deviations.

Faces use the actual `getGamepieceFace` / `addSettlementPiece` pipeline and art.
Hover, focus or tap any Zoo Practice or Structure for its current in-game quick
read. Select the tooltip title or **Inspect tooltip** for the full rules, symbol
key and recursive keyword definitions. Escape retraces a definition or closes
inspection. All four quality-comparison cards support the same reading surfaces.
Quick reads stay inside the viewport and scroll when needed; full inspection
uses a modal canvas with independent rules and symbol-key scrolling.
Catalogue specimens use equal-size frames, including wide Structures; card art
keeps its original proportions within a fixed image area.
Comparison shows four Practice qualities or four Structure quality uplifts,
capacity, timing, DSL effects, Consume/Require, gates, modifiers, and stacking.
Zoo samples have no workers or institutions; Museum/Gym faces use the complete
`getDetailedSettlementViewModel`, including live evaluation, Stock and providers.
Stock links name source and destination slot numbers. The Lab deliberately uses
a focused DOM workbench around the real Pixi faces rather than the debugger layout.

## Exhibits

- Charge: Logging / Mining / Charcoal / Smelting / Toolmaking fits five slots.
  Step or scrub to t=9s or t=17s to inspect real Metal → Tool cascades. Charge
  meters and full blocked reasons accompany the faces; expand Causal cascade
  sequence for root/parent IDs and Discharge payment/gain records.
- Stock generation and ordered provider consumption.
- Require, missing inputs, and a non-mutating self-funding planner probe.
- Food at 29, 30, and 31 people; separate shortage fixture.
- Currency procurement that spends the Barter host's actual Stock.
- Common Housing ladder, with replacement and live capacity comparison.
- Scholar staffing, Knowledge tags, Foundry feedback, Commission, Discovery,
  seeded shop/quality preview, and identical-RNG candidate institution comparison.
- Warrior population, Support, Prestige, Retinue thresholds/cap and Prowess.
- Connected automatic Raid, legal Campaign/conquest effect, autonomous defense,
  and territorial loss/ruins.
- Full serialized authoritative-tick / forecast-chunk comparison, including RNG.
- Five-slot hybrid production: its missing Edible host is intentional evidence of
  the composition constraint, not a reason to silently expand the tableau.

All settlement fixtures contain exactly five Practice slots. Each loads from an
explicit seed, steps seconds/named phases/moons/years through the real tick path,
and resets from a serialized baseline. The hybrid fixture and slot constructor
are also used by the civilization acceptance tests. This is a representative
selection, not a visual mirror of every automated test.

## Sandbox

Museum and Gym share the real game map, timegraph and sun/moon wheels. Click any
region to inspect it; a settlement selection updates its tableau and local graph.
Toggle terrain, scenery, connections, workers, Structures, actors and alerts
independently. Switch graph scope to the whole civilization, use the graph's
resource/population/Chaos groups, or choose individual series.

Forecast span defaults to 60 seconds and accepts 1–3600 seconds from the current
branch start. It never automatically runs to extinction. Drag the graph or either
wheel, type an exact second, or use the phase/moon/year steps. Explicit step buttons
extend the span when needed. Earlier-than-origin browsing clamps to the branch
start. Edits start a new deterministic branch at the viewed second and regenerate
only the chosen span. Reset still restores the loaded/saved fixture, including RNG.

Practice and Structure selection uses searchable visual pickers with class, tag,
trait and footprint filters. Practice handles support mouse/touch dragging and
Alt+Left/Right keyboard ordering; moving a slot inserts it and shifts intervening
slots, preserving exactly five. Population, specialists, Vassal stats, Chaos,
quality and Stock apply on change/blur. Invalid edits report an error and preserve
the previous state and timeline. Spawn/remove/resolve actions remain explicit.

**Save to Museum** captures the currently viewed Gym state as a named exhibit.
**Save and open in Museum** also switches to it immediately. Saved exhibits appear
in the Museum's fixture selector and survive refresh. Saving an existing name
replaces that exhibit. Storage is local to this browser; JSON export/import is
available for sharing between devices.

Gym?s **Settlement sandbox** (`#/dev/gym?workspace=settlement`) supports settlement/fixture selection; explicit adult-cohort population,
Scholar and Warrior setup; Prestige, Ingenuity, Prowess and Chaos; Practice
install/remove/reorder, quality and hosted Stock; Structure add/remove/quality;
neutral-template spawning, road connection, Monster spawn/remove/age/defense,
and ruins; candidate generation/selection; Crisis inspection and class-effect
experiments; deterministic stepping/reset; named browser fixtures; JSON
import/export/copy; and launch into normal play. Edits clone first and commit
only after the normal state deserializer accepts them. Explicit Stock edits also
check live host capacity, and specialist edits cannot exceed population.

Population setup intentionally replaces age/status cohorts with adult Villagers.
Removing a Structure can leave previously produced Stock above its new capacity,
as can normal gameplay; subsequent production uses the normal capacity rules.
Gym does not silently discard that Stock. A terminal run must be reset to advance.
Candidate selection needs no currently active Vassal; use a fresh fixture to
construct a different lineage. Named fixtures use a separate browser-storage key.

Class-effect buttons invoke `classActionOptions`, `validateClassAction`, and
`applyClassAction`; Commission checks call `completeCommission`. They explicitly
resolve only the effect: they do not simulate the Life Map's journey, Prestige
reward, or danger roll. **Play from here** uses normal gameplay for that complete
flow. Shop and institutional previews operate on clones and do not consume the
fixture's RNG. Neutral spawning shares `createNeutralSettlement` with New Game.
No debugger mutation helpers or debugger layout are reused: the authoritative
model APIs and normal serialization are the useful lower-level boundary here.

## Live / Gym / play

**Open current state in Gym** clones the runner's authoritative cursor state,
including all RNG streams, into a separate tab. It does not copy a speculative
graph preview, write a player save slot, or change the source run. The source run
may continue according to its existing playback controls.

**Play from here** validates and opens the Gym snapshot through the normal game
session and renderer in a separate, **unsaved** session (`activeSlot = null`).
No existing save slot is overwritten. The original timestamp is preserved; the
timeline begins at the snapshot's `tSec`. `rebuildStateAtSecond` rejects earlier
times instead of pretending the snapshot was a time-zero world. Existing
time-zero runs retain their behavior. Snapshot-origin timelines use existing
state/save fields; schema versions and validation rules are unchanged.

Handoffs use isolated UUID-keyed browser storage and survive refresh. Reopening
the handoff URL starts from its original snapshot, not subsequent unsaved play.
Save the Gym fixture or export its JSON for a durable reproduction; handoffs and
named fixtures remain subject to browser storage availability and clearing.
The ordinary graph can display empty pre-snapshot space; it cannot reconstruct
the source run's prior history because the bridge transfers a state, not a run.

## Observations and limits

- Two neutral templates still author six/seven Practices, but normal runtime
  construction installs only the first five. Zoo shows both installed and omitted
  entries, without changing those gameplay definitions.
- All 187 runtime Practices and Structures have dedicated packed illustrations.
  The CivContent 2.6 art additions preserve the paintings of existing cards.
- Structures, candidates, node families and Monster tuning are runtime data;
  there is no fabricated workbook-only content or alternate simulation.
- Monster/class/world outcomes use compact tables and real model summaries where
  the complete map/Life Map UI would obscure the experiment.
- The defense fixture needs enough Edible to survive Food before Death. The loss
  fixture lacks a response Practice. The distinction is exercised through ticks.
- The existing workshop browser probe still referenced the removed Food wallet,
  Administration fields, and older schemas. Its checks now exercise hosted Stock,
  Granary capacity modifiers, Foraging output/capacity and current schema constants.
  The menu probe now distinguishes the two player settlements from four neutrals.

## Verification

- `npm run probe:map-lab`: Regular game baseline, read-only inspection, editable
  copies, all three editor tabs, reviewed cards, combined-profile persistence, JSON sharing, mobile
  layout, normal-play launch, focused live tools and browser Back.
- `node src/model/tests/development-lab.js`: deterministic fixtures and stepping,
  Food/Stock breakpoints, Currency debit, Retinue threshold, defense/loss,
  atomic invalid-edit rejection, clone isolation, registry coverage, forecast
  equality, snapshot-origin replay/runner sessions, saved-fixture reset/import.
  Included in `npm run test:detailed-replay` and `npm run verify`.
- `node src/model/tests/civilization-content.js`: shared hybrid content scenario.
- `npm run probe:development-lab`: deployed bundle, filters/quality comparison,
  exhibits, edits, reset/storage, forecast, desktop/mobile, both bridges, refresh,
  original save protection. Details/screenshots: `artifacts/development-lab-*`.
- `npm run probe:development-lab -- --zoo-only`: quick reads and full inspection
  for all 187 runtime Practices/Structures, quality comparison, linked definitions,
  desktop/mobile bounds, and unchanged fixture state/RNG.
- `npm run probe:prototypes`: standalone workbenches through the
  Prototypes directory, Pages subpath and refresh, desktop/mobile layouts,
  contained card numbers, founder browsing,
  long-name warnings and full-size/transparent exports.
- Existing settlement, workshop, and game-menu probes cover integration surfaces.

Model adapters: `src/model/dev-lab/`. Orchestration:
`src/controllers/development-lab-controller.js` and `development-lab-bridge.js`.
DOM entry: `src/views/development-lab-dom.js`; focused views:
`src/views/development-lab/`. CSS is scoped to `.development-lab`.
