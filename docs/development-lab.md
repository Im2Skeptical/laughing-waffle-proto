# Development Lab

Open `#/dev` (defaults to Zoo), `#/dev/zoo`, `#/dev/museum`, `#/dev/gym`, or `#/dev/prototypes`
on the normal app URL. These hash routes survive direct loading and refresh on
GitHub Pages, including the repository path. The live workshop (hold its seal or
Ctrl+Shift+D) also has **Development Lab** and **Open current state in Gym**.
The existing debugger remains available.

## Prototypes

**Prototypes · design** sits beside Zoo, Museum and Gym. Its two workbenches
cover illustrated Cards and Vassals & Founders. Each opens
an isolated page with a return link to this section. Direct workbench URLs and
the Prototypes hash route support refresh and GitHub Pages repository paths.
The Pages build bundles both separately. Edits are temporary presentation
examples; these studies do not change the live renderer, simulation or saves.

Cards includes a matched comparison with the current game renderer and five-card
regional settlement / three-offer Practice shop screen references. Its Graphics
control switches the hero, preset cards and contextual previews. Graphics choices
survive workbench URL refresh. The in-game Practice quick read and expanded
inspect view are the current tooltip reference; the tooltip workbench is retired.

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

Gym supports settlement/fixture selection; explicit adult-cohort population,
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

- `node src/model/tests/development-lab.js`: deterministic fixtures and stepping,
  Food/Stock breakpoints, Currency debit, Retinue threshold, defense/loss,
  atomic invalid-edit rejection, clone isolation, registry coverage, forecast
  equality, snapshot-origin replay/runner sessions, saved-fixture reset/import.
  Included in `npm run test:detailed-replay` and `npm run verify`.
- `node src/model/tests/civilization-content.js`: shared hybrid content scenario.
- `npm run probe:development-lab`: deployed bundle, filters/quality comparison,
  exhibits, edits, reset/storage, forecast, desktop/mobile, both bridges, refresh,
  original save protection. Details/screenshots: `artifacts/development-lab-*`.
- `npm run probe:prototypes`: both standalone workbenches through the
  Prototypes directory, Pages subpath and refresh, desktop/mobile layouts,
  contained card numbers, founder browsing,
  long-name warnings and full-size/transparent exports.
- Existing settlement, workshop, and game-menu probes cover integration surfaces.

Model adapters: `src/model/dev-lab/`. Orchestration:
`src/controllers/development-lab-controller.js` and `development-lab-bridge.js`.
DOM entry: `src/views/development-lab-dom.js`; focused views:
`src/views/development-lab/`. CSS is scoped to `.development-lab`.
