# laughing-waffle-proto

Deterministic map-driven settlement strategy prototype.

## Current prototype

The 15-region map hosts five connected detailed settlements in Regions01, 03,
06, 07, and 11. Each site simulates local cohorts, perishable capacity-limited
food, fixed practice slots, physical structure space, and an aggregate Elder
Order. Administration is the only way to move food between sites. Preservation
extends its reach from adjacent sites to detailed settlements connected by a
fully player-controlled path.

The single civilization-wide Vassal lineage routes through a visible 44-node
Life Map. Nodes provide Patronage, Development, Travel, local intervention
shops, Crisis, and Legacy opportunities. Choices spend Vassal Prestige and
years; each explicitly confirmed node pays recurring income once and then
checks age-based mortality once. Chaos and loss are global; population, food,
practices, buildings, happiness, and faith are site-local.

The shared HUD shows the viewed civilization year, projected survival year,
and the best survival year observed across rewinds and saved sessions. A
completed forecast resolves both values at the civilization-loss boundary. The
map adds a civilization-wide demographic/food/housing/chaos summary above the
selected-region card. Fullscreen and Debug controls remain available.
The local settlement header reserves its right edge for those global controls,
keeping Overview, Demographics, and Map accessible on desktop and
mobile-landscape fullscreen displays. Full/Exit and Debug share one responsive
utility rail so mobile text sizing cannot make them drift into one another.
On-map names are hidden in favor of player flag nodes, assigned-worker pawns,
and filled/open structure-slot glyphs. Non-detailed regions show their authored
capacity as open slots; the selected-region card retains the full regional
identity and details. Administration food packets appear as staggered gold
directional markers travelling between source and destination regions, making supply routes
visible during forecast unveiling and timeline browsing. Their playback follows
the playhead: forward time shows the transfer normally, while rewinding shows
the marker travelling backward toward its source while its triangle remains
oriented toward the historical destination, like film running in reverse.
Changing direction replaces any stale in-flight presentation markers.

The timegraph is civilization-wide on the map and automatically becomes local
when a settlement is opened. Its title always identifies that scope. The
playhead follows an unveiling forecast and drives a read-only viewed preview,
so the calendar, season/moon wheel, map workers, and other stateful HUD details
advance with it while committed history stays unchanged. The preview refresh is
rate-limited for responsive map input. Manual scrubbing takes control
immediately.
Choosing a Vassal reveals the Life Map but not future node inventory. Confirming
a node progressively commits its accumulated years through normal simulation
ticks, then pauses for the mortality result and next decision. The blocking
chooser suspends automatic forecast preview until a candidate is selected.

Game state is schema v14 and runner saves are schema v8. Each run serializes the exact game
settings and detailed gamepiece tuning used by deterministic replay. Old saves are intentionally
unsupported.

Development Tools has separate Map Lab, Game Settings, Gamepieces, and Vassal
Lab sections. Map Lab and the generated configuration editors keep focused
mobile form fields mounted while the game refreshes, so the on-screen keyboard
remains open during an edit. Each configuration editor supports named browser
presets plus JSON import/export. Starting a fresh test run combines the current
map, settings, and gamepiece drafts.

Game Settings covers active map-driven timing, worker policy, food consumption
and decay, demographics, elder mortality, happiness/starvation/housing, and
civilization chaos/loss.
Gamepieces dynamically lists every detailed structure and practice, exposing
numeric structure scaling, worker capacity, charge, and declarative effect
parameters. Vassal Lab records a fully specified settlement, age, Prestige,
and four stats as a deterministic timeline action
without consuming RNG.

## Run and verify

```text
npm ci
npm start
npm run verify
```

`npm run verify` checks architectural constraints, confirms every source module
is routed from the app/worker/tests, builds the Pages artifact, and runs the
model suite.

Browser probes use the built site:

```text
npm run build
npm run probe:settlement
npm run probe:map-lab
```

`npm run build` writes generated output to `dist/`.

## Map Lab v4

Open **Debug -> Map Lab**. The editor works on a separate browser-local draft and
changes the game only when **Start fresh test run** is used.

Map Lab edits:

- region colour, controller, `structureCapacity`, and connections
- an independent detailed-settlement toggle
- Villager/Stranger children, adults, and elder ages
- stored and loose food
- exactly five practice slots
- structure slots up to the regional capacity

It prevents capacity below occupied structure slots, warns about over-housing,
and rejects stored food above the derived Granary capacity. **Copy current
game** is a deep read-only copy of the viewed second.

Drafts use schema v4 and browser key `civsurvivor.mapLabDraft.v4`; named scenario
libraries use schema v3 at `civsurvivor.mapLabScenarios.v3`. Older data is rejected
without migration.

## Data-driven debug configuration

Open **Debug -> Game Settings** or **Debug -> Gamepieces**. Drafts and their
named preset libraries use independent browser keys. They do not
change a running simulation until **Start fresh test run** is pressed.

The resulting `gameConfig` is JSON-only state. Rewinds, branches, projections,
save/load, and `rebuildStateAtSecond(tSec)` therefore use the same values. The
Gamepieces editor tunes the existing generalized DSL effect operations; it
does not introduce view-side or one-off simulation behavior.

Open **Debug -> Vassal Lab** to replace one unrevealed candidate. The complete
normalized starting specification is stored in the selection action, so
injection is replayable and leaves `state.rng` unchanged.

Example region entry:

```json
{
  "id": "cedar-woods",
  "colour": "green",
  "controller": "player",
  "structureCapacity": 3,
  "detailedSettlementEnabled": true,
  "detailedState": {
    "storedFood": 60,
    "looseFood": 0,
    "practiceSlots": [
      { "practiceId": "cultivate", "charge": 0, "work": 0 },
      { "practiceId": "administrate", "charge": 0, "work": 0 },
      { "practiceId": "preserve", "charge": 0, "work": 0 },
      null,
      null
    ]
  }
}
```

See [`ai/ai-context.md`](ai/ai-context.md) for current gameplay and engine
invariants, [`ai/repository-map.md`](ai/repository-map.md) for surgical code and
test routing, and
[`ai/detailed-settlement-redesign-plan.md`](ai/detailed-settlement-redesign-plan.md)
for the approved redesign record.

## Deployment

GitHub Pages should publish only `dist/`. Bundled JavaScript and CSS use
content-hashed filenames recorded in `dist/build-manifest.json`. The manifest
also records the separately bundled forecast worker so production forecasting
does not fall back to the main UI thread.
