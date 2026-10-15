# Protovassal opening experiment

Open **Development Lab → Prototypes → Protovassal opening**, or run
`npm run preview:opening` and open
<http://localhost:5185/images/dark-fantasy/life-map-opening-prototype/>.
The Pages build bundles this page separately; player modules never import it.
The **Legacy** button below the canvas opens the three-choice endpoint mockup:
found a settlement, scale a reward by the highest effective stat, or scale a
reward by accumulated Prestige. The default recipe ends at Legacy; saved drafts
are preserved and can add this node through the graph editor.

This is a choice/layout workshop. Settlement uses the existing 40-Prestige and
10-adult-Villager prices provisionally; choosing its location would follow.
The stat choice always uses the highest effective stat: each three points give
future Vassals +1 starting point in that same stat. Each ten remaining Prestige
give future Vassals +1 starting Prestige. Both formulas round down with no cap
and no minimum bonus. Edit the Legacy node's cost and divisors, then Apply and Preview.
The preview uses a Warrior with 60 Prestige and highest stat 6; **0 Prestige ·
Legacy** tests the unavailable settlement, available stat reward and zero Prestige bonus.
Confirm records the chosen option for review, without founding, charging costs,
granting rewards, retiring, advancing time, or consuming RNG. Rewind restores the
choice. Normal player Legacy and settlement generation are unchanged.
Deployed workbench module URLs include their content hash so a reload fetches the
matching code. An already open page still needs reloading after an update; Save
your draft first, then reload and Restart to test its nodes with the current code.

The question is whether a curated Warrior opening teaches Prestige, makes early
military preparation useful and gives every encountered node a benefit or an
avoidable, signalled cost. This is an experimental first draft, not a finalized
opening or a replacement for normal gameplay.

## Modules

- `experiment.js`: editable JSON graph, offers and validation.
- `model.js`: disposable encounters using existing Life Map effects and fresh-game state.
- `shop-experiment.js`: Stock-tag Practice pools, Housing/Stock/Special Structure pools and the prototype's Monster Pressure payment quote.
- `controller.js`: transactions, tick resolution, complete rewind checkpoints and separate draft storage.
- `game-screen.js`: mock game shell reusing the live Pixi graph, world map, settlement, HUD and decision views.
- `graph-edit.js` / `graph-editor.js`: route-changing operations and the visual draft editor.
- `note-screen.js`: enterable Custom Notes, with scrollable intention text and Confirm.
- `world-decision-screen.js`: full-map Move / Build a route / Tour selection.
- `study.js`: graph/node editing, outcomes and guided experiments around the game screen.
- `stat-icons.js`: the game's resource icons as small DOM images for the summary panel.

On phones the game comes first: landscape fits the whole canvas on the first
screen, portrait shows a rotate screen (Fullscreen rotates the game), and the
introduction sits under **About this experiment**. Rewind and Restart are in the
page toolbar and appear on the canvas only in fullscreen; draft file actions
(Save, Load, Export, Restore) are under **Draft…**.

The initial branches are a curated ordinary Relic and a bundled world opportunity.
Both converge on Warrior founding, followed by expenditure, Development, martial
response, Stock Supply and an easy benefit. Node editing changes the draft only;
Restart captures it in a new disposable session. The visual editor supports
adding nodes from populated templates, duplicating/removing nodes, changing entry
points and rewiring the graph. Advanced JSON remains available for offer editing.
Validation requires a
reachable acyclic graph whose every entry path reaches one founding node.
The optional `displayLabel` sets a short map plaque; the title and description
remain available in the entry confirmation and decision screen.

## Editing the route

Drag individual cards to place them in a column and row. In **Select / move**,
drag empty space to box-select several cards, then drag any selected card to move
the group. Shift/Ctrl/Cmd-click adds or removes cards from the selection. Group
spacing is preserved, including at the grid boundary. Occupied cells reject a drop
rather than overlapping cards. **Column**, **Row**, and **Move selection** offer
the same positioning on phones. Arrow keys nudge a selection; **Pan canvas** moves
the viewport. **Auto-arrange** restores a layout based on the connections.

Positions are stored as optional zero-based `editorPosition: {column, row}` data
in each node; UI fields are one-based. They are saved/exported with the draft.
Positions arrange the authoring diagram; connections determine the playable route.
Dragging cards never rewires connections.

To change the route order, select one node and choose a destination with **Before**
or **After**. Moving Development before Founding redirects all routes into Founding
through Development and joins up Development's old neighbours.
Drag from a node's right-hand dot to another node to draw a connection; clicking
the dot then the destination works too. Select an arrow and use **Remove
connection**. **Connect nodes without dragging** provides the same actions on
phones and with a keyboard.

**Add node** inserts a populated node after the selected node or on the selected
connection. **Remove node & join routes** bridges its predecessors to its successors.
Founding remains unique and can be moved. **Undo edit** and **Redo edit** cover
graph and content edits independently of playthrough rewind.

**Add Custom Note** adds a node with a title and intended player interaction.
Notes can be connected and positioned like other nodes. During a playthrough,
enter the note to read its text, scroll/drag if needed, then **Confirm** to leave.
Reading a note does not advance time, grant routine node income or consume RNG.
The prototype records the visit and offers the connected next nodes.

The Pixi screen attaches immediately, with artwork prepared in the background.
Entry confirmations and choices work during a cold or slow artwork load; an
artwork failure reports a message without detaching the playable screen. Illustrated
World choices redraw as their art and resource atlases become available, without
requiring another selection.

**Preview this node** in the encounter editor opens it directly in a fresh
disposable state, with the current seed and authored content. It does not change
the draft or require playing through the preceding nodes. Rewind returns to that
preview's entry; Restart resumes the complete authored opening.

Crossroads uses the shared node-modal body, title plaque, backdrop and Confirm
dock, leaving the usual surrounding game screen visible. The complete map fits
beside three options; pan, wheel/pinch zoom and Reset remain available. Unavailable
regions, landmarks, labels and roads are greyed and darkened in every mode. The
current region remains bright as the origin; Tour highlights only that region.
Unavailable destinations do not select an action. The three illustrated choices
use the native shop column widths, card height,
cost-footer height, icon sizing and footer baseline. Selecting a destination updates
its exact price and previews its Prestige cost in the shared Vassal HUD.
Varying destination prices show **From** until a destination is selected. Selection
feedback stays inside the modal, leaving the timegraph clear. Current location uses
the native upper-right plaque; the Vassal HUD sits above decision backdrops for every
node, matching the game. Native modal plaques retain their concise in-game copy;
full authored descriptions stay in entry/editor views. The frame and scroll reuse native
chrome for layout review; the scroll is passive and does not invent forecast data.

Dummy base prices are Tour **2 years**, Move **3 moons**, and Build a route
**5 years / 15 Prestige**. Movement grants **+3, +6 or +9 Prestige** according to
its destination, in addition to ordinary node income. The selected destination's
reward appears in the shared price footer and Vassal HUD before confirmation.
These are prototype values, editable under **World prices** and **Prestige reward
by destination**; Tour time remains editable in its option. **Use dummy World
prices** applies the preset to an existing draft without changing its graph or
reward odds. Apply, then Preview or Restart to test. Existing saved drafts retain
their authored prices until edited. Normal ability and relic discounts still apply.

**Travel reward example** beside the guided experiments (or **Preview travel
rewards** in a Crossroads editor) opens a disposable four-settlement world.
From R07, move to **R06 (+3 Prestige)**, **R08 (+6)** or **R11 (+9)**. Each legal
destination has a clickable Prestige badge; selecting it updates the shared Move
footer and Vassal HUD. Before selection, the footer shows the time price and the
card lists the available reward amounts. The example uses real movement and
rewards, supports rewind, and does not edit or save your graph. **Restart** returns
to your draft's normal world.

Move highlights reachable destinations;
Build highlights legal connections and draws the proposed road; Tour keeps the
Vassal in the current region. Confirming Tour rolls a weighted reward: by default
25% an unowned Bronze relic, otherwise +1 to a random ability. The reward has no
direct death roll. A relic is revealed before the ordinary equip/carry/vault
acquisition choice; the tour's time cost is charged by that confirmation. An
exhausted relic pool falls back to an ability gain. Ordinary node income still
follows the game rules. Outcomes record the reward, and complete RNG rewind
repeats it. Hovering, selecting modes, and reading odds do not roll rewards.

The Crossroads editor exposes **Relic chance (%)**. Existing authored local
options remain as authored; **Use Tour as the local activity** replaces them with
the new reward recipe while retaining the node and its connections. The optional
`weightedOutcomes` option data defines weighted pools of existing relic/ability
rewards, resolved through the normal rules; player New Game never reads it.

Disconnected or cyclic drafts remain visible while you work. The editor names
the issue; playing and saving require a valid graph. **Play edited opening** or
**Restart** launches the current draft in the Pixi screen. The running world and
its RNG stay unchanged while editing.

Save/Load uses `civsurvivor.prototype.warriorOpening.v1`, independently of player
saves, reviewed cards, launch profiles and the Museum. Export/import transfers
experiment recipes, not game saves. Rewind restores the whole prior state, RNG
and encounter history. Guided tabs restart the built-in experiment and provide a
Next guided choice button; all ordinary free-play controls remain available.

## Real rules and experimental differences

Fresh-game initialization, hosted Stock, five-slot Practices, construction,
Retinue, Campaigns, crisis responses, heirloom effects, ability gains, mortality
and elapsed simulation time use the existing engine. Time advances through real
ticks, with short yields so the interface remains responsive.

The outer authored graph is independent of the generated runtime graph. Its
encounters borrow ordinary runtime slots; founding uses the existing founding
slot at the authored convergence point. Normal GameState and graph schemas are
unchanged. Play uses the game's Pixi Life Map, node modal, cards, inspection,
staging/drag/undo, level-up cards, HUD, world map and settlement. The shared
navigation opens these views; Fullscreen uses the existing landscape control.
The editor and saved-draft controls remain beside/below the mock screen.

Practice shops first show two eligible Stock tags and **Random** in the native
modal. Clicking a choice inspects its explanation without drawing offers or
changing Prestige. Each choice has its own **Confirm** button below it, which
can also be clicked directly. Random opens a generic Practice shop using the
normal full catalog, class mix and quality rolls, and immediately grants **+10
Prestige**, once per visit, to spend in that shop. Structure choices remain
Housing, Stock and Special. Housing contains
housing structures, Stock contains Stock-capacity structures, and Special contains
the remaining structures. Picking a tag deals up to three matching offers. Optional
authored cards restrict the named tag pools; Random uses the regular catalog.
Tag and offer draws use the saved Vassal RNG;
reading the picker or previewing prices does not consume RNG.

An offer that exceeds remaining unstaged Prestige instead costs a flat **+10
Monster Pressure**. It does not spend the insufficient Prestige balance. The normal
time, placement and hosted-Currency requirements remain. The existing price box
shows the Monster icon and amount before staging, including in inspection. Staging
and undo do not apply pressure; Confirm executes one existing `addMonsterPressure`
effect per such purchase. Ordinary wave thresholds still apply. This payment does
not add Chaos. Paid purchases retain their ordinary Prestige prices.

The **Practice shop** and **Structure shop** preview buttons initialize an actual
Warrior founding, then open the picker. **0 Prestige** tests the fallback payment;
uncheck it to compare ordinary payment. The examples leave the authored draft
unchanged. The graph editor also supports Structure shop nodes. The flat amount
is editable per node as `monsterPressurePerPurchase`. Normal player New Game
does not read any of these shop recipes.

Curated shop offers use existing card definitions and eligibility. Ordinary
relics have zero direct death risk and explicit authored Chaos costs. The separate
`specialRelic` kind permits signalled direct death risk after founding. World
encounters combine real travel/route options and, for Warriors, legal Campaigns.
Martial encounters combine legal Campaigns/crisis responses with authored useful
alternatives. Stock Supply retains the current global unmet-input check.

Current routine node Prestige/Development gains and earned level-ups still apply.
Pre-founding actions reaching age 40 or containing direct death risk are blocked;
the real civilization can still collapse. No new Scholar unlock rule is applied.

Validate deployment with `npm run verify`. The updated
`npm run probe:prototypes` checks the directory, retirement, opening playthrough,
rewind, edited costs, draft persistence/import, real Pixi selection/confirmation,
shop inspection/drag/undo, earned level-up choices, map navigation, portrait
fullscreen touch input and mobile containment.
`scripts/opening-graph-editor-test.mjs` also covers graph operations, invalid-draft
isolation, group positioning, and real Development/Practice purchases before
founding. Browser checks cover box/group/single dragging, panning, saved positions,
phone position controls and reading/confirming Custom Notes. First-load regression
checks hold artwork requests while entering both initial nodes and verify their
choice modals open before those requests finish.
`scripts/opening-tour-test.mjs` covers both reward branches, cost/location,
serialization, deterministic rewind, exhausted pools and direct preview. Browser
checks exercise full-map target selection, editable odds, discovery acquisition
and the portrait fullscreen touch flow.
