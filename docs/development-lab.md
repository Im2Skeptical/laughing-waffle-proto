# Development Lab

Open `#/dev` (defaults to Zoo), `#/dev/zoo`, `#/dev/reviewer`, `#/dev/museum`, `#/dev/gym`, `#/dev/lifegraph`, or `#/dev/prototypes`
on the normal app URL. These hash routes survive direct loading and refresh on
GitHub Pages, including the repository path. The live workshop (hold its seal or
Ctrl+Shift+D) also has **New run setup in Gym** and **Open current state in Gym**.
Only live Vassal candidate replacement and save diagnostics remain in that workshop.
Fresh-run editing lives in **Gym → New run setup**.

## New run setup

Gym opens its **Settlement** workspace by default; open **New run** setup with
`#/dev/gym?workspace=setup` or its workspace tab. It groups **Profile** (choose,
copy, save, default, import/export) and **Launch** (layout, seed, start). Its
**Regular game** profile is read-only and comes from the same current-build
setup and initialization path as player New Game. It includes two player
settlements on a seeded random road, rolled Structure capacities and four
neutral settlements. **Copy to edit** creates an editable draft of that recipe.
Map Lab, Game Settings and Life Map Lab are its three editor tabs. They use
the Lab's shared styles: fields are grouped into collapsible sections with
counts (Map Lab: Region, Connections, Population, Practices, Structures; Game
Settings: one section per simulation stage, with **Find a setting** and a
“not default” badge plus the default under each changed value). Life Map Lab
summarizes the profile's captured recipe and explicitly copies a draft from
the dedicated Lifegraph workspace with **Use Lifegraph draft**.
Explanations sit behind **How it works**, **What this controls** and field (i)
help, which stay usable on the read-only baseline. The single
**Combined profile** toolbar saves and loads every section together, including
launch options and any applied reviewed cards. There are no separate section
profile or preset toolbars. Edit gamepieces in the card reviewer. Profiles save
locally and support JSON export, copy and import. The built-in profile cannot be renamed, saved over or deleted.
Drafts survive refresh. **Default in workshop** chooses the recipe for the next
workshop opening and clears the remembered draft. The main menu has its own
profile selection; a workshop default does not change it or a live game.

**Regular game → random connected pair** uses roads from Map Lab and its first
detailed settlement as the shared starting tableau; per-region placement is
rolled. Choose **Exact Map Lab placement** to use each region's assignment and
tableau. Neutral seeding can be disabled for focused authored scenarios. The
explicit seed makes launches reproducible. A launch fails visibly if the edited
map has no eligible road or insufficient frontier space for four neutrals.
Life Map's preview seed only changes its preview; the launch seed drives the run.
**Apply reviewed cards to draft** captures reviewer proposals in this recipe.
**Main menu → Developer tools → Use dev settings** makes the normal **New Game**
button use the chosen saved combined profile, with the usual save-slot selection.
Unticking it uses Regular game. The preference and profile selection survive
refresh. **Edit profiles in Gym** opens the editor; save the profile there before
selecting it on the menu. Saved-profile edits refresh the prepared opening. A
missing or invalid selected profile fails visibly instead of silently launching
Regular game. Continue and Load Game retain their saved settings.

The separate **Use edited cards in new games** toggle applies current reviewer
proposals over the chosen new-game setup. Cards already captured in a combined
profile remain part of that profile when this toggle is off.

**Start new run** opens normal gameplay in this tab as an unsaved test run.
Use browser Back to return to the remembered workshop draft.
**Open in settlement sandbox** creates a t=0 state in Gym for inspection or
further edits; the imported baseline survives refresh and workspace changes.
From there, **Save to Museum** captures a named state at the
viewed second. Profiles are launch recipes; Museum exhibits are saved states,
including RNG, and use the existing fixture library. These workflows share
normal state validation and handoff; they do not write player save slots.
The profile/export schema is v3; obsolete profiles are unsupported.

## Lifegraph

Open **Lifegraph** in the Development Lab navigation. Class and seed stay
available across Graph, Milestone columns, Families, Nodes & review, Guarantees, Balance bands,
Diagnostics and Save & share. Preview context sets Research, Prestige, age,
stats and a signature. The fixed disposable settlement makes comparisons repeatable.

The graph uses the game's node graphics and layout. Select a node and **Play
selected node** to open the real decision screen, including card inspection,
staging, drag placement, undo, reroll and Confirm. **Resolve outcome** advances
only that dummy through authoritative ticks. **Reset this node** restores the
same seeded context. The reviewer can also try a disabled or absent type in
isolation. Such a test substitutes one preview slot; it does not edit the graph.

**Milestone columns** makes all routes meet at one node, then branch again.
Add a named column at an existing depth, choose a node type or family, and set
its class scope. Family columns roll one eligible member for that whole column.
**Milestones only** excludes a node type from random rolls and other reservations;
matching milestones still satisfy guarantees. This supports scheduled Practice
Reform shops without extra copies between them. Conflicting depths and unavailable
class/timing pools report errors instead of silently replacing another reservation.

Founding and Legacy have independent enable and position controls. Founding depth
0 precedes the graph; numbered depths replace a normal column. At a shared depth,
Founding overrides a custom milestone for the first life; successors keep that
milestone. Founding and Legacy cannot share a depth. Founding is first-life
only and still establishes the class when completed. Disabling it leaves that
founder unclassed. Use **Preview life stage** to inspect either founder or a
successor, and **Play Founding** to try the real action. Legacy can stay after the
final depth, replace a numbered column, or be disabled. Interior Legacy grants its
reward and continues. Any terminal node retires the Vassal; without Legacy there
is no Legacy reward. These experiments apply only in Pooled draft mode and retain
the normal bookends by default. New settings require fresh runs/saves.

**Pooled draft** reserves milestone columns, then signature, class and Stock Supply opportunities,
then chooses a family and a node within it. Families and nodes use named
Common/Uncommon/Rare occurrence tiers. Enable switches and class scopes are
separate from those tiers. Family repetition limits are preferred maxima;
guarantees and thin pools can exceed them, which diagnostics report. Guarantees
target a node or family, a depth range, a class, and either the map as a whole or
every complete route. Impossible placement is an explicit generation conflict.
Guarantees reserve nodes independently of rarity: an Every route Discovery
guarantee can force several copies on separate branches even with Rare selected.
Use Whole map for a graph-wide minimum, or remove that guarantee for random
occurrence alone. These are minimums, not caps. Consecutive-repeat prevention only
blocks adjacent copies along a route. Nodes & review shows reserved versus random
placement counts and links to Guarantees.
Supply reservations only select unlocked outputs and prefer separate depths.
The underlying unmet-need analysis still considers producers across all player
settlements; it does not yet prove local supply reach or recipe sustainability.

Nodes & review lists each choice, its seeded effects and its base costs. Each
choice assigns Free/Cheap/Fair/Expensive independently for time, Prestige and risk,
or takes a custom numeric base value. Balance bands author absolute solar years,
Prestige and risk percentages; editing a preset updates all assigned choices.
Ordinary stat and Heirloom discounts apply afterwards. Campaign risk can retain
its Force/Defence calculation. Shop prices use shared Practice/Structure rows for
Bronze/Silver/Gold/Diamond quality, including upgrades and quality bonuses. No
per-card price editing is needed. Scholar Delve and leaving without a purchase
share one base time each across every shop, editable here or from any shop's
choice list. Defaults are 10 and 5 years respectively, before discounts.
Other classes cannot reroll shops. Early/Middle/Late use shared depth boundaries.
Normal New Game uses Cam's approved first-pass pooled tuning, including its
3-lane, 10-depth layout and shop guarantees at depths 1, 4 and 8. Save & share
includes a built-in **Previous defaults** experiment for the preceding tuning.
**Legacy independent generation** remains an explicit comparison mode.

Diagnostics show distinct eligible cards before random offer sampling, including
empty and fewer-than-three-card pools and the contributing card names. **Note this
content gap** adds context to the node review queue. Seed batches report missing
families, route minimum/maximum counts, shop clustering, bypassed Supply and
generation conflicts, with reproducible example seeds. Counts do not assert that
three distinct eligible cards produce three useful or affordable choices.

Drafts and review notes persist on this device independently of game saves.
Named experiments capture rules and preview context; JSON export includes notes,
pool evidence and the latest seed batch for an agent handoff. Import validates
the current schema before replacing anything. In **Gym → New run setup**, copy
an editable profile, choose Life Map Lab, and **Use Lifegraph draft**. Save/launch
captures those rules; later edits cannot affect an existing run or replay.
Verify with `npm run verify`, `npm run probe:lifegraph` after `npm start`, or
`npm run probe:development-lab -- --lifegraph-only` against a built bundle.
Milestone generation, lifecycle and replay checks: `npm run test:lifegraph-columns`.

## Card reviewer

Structures have a **Structure face** selector in Zoo and Reviewer: completed
structures show their bonuses; construction plans show scaffold, consumed Stock
and the cycle tally. Zoo cards and comparisons list per-cycle and total costs.
Reviewer defaults to the plan side for Structures. **Edit construction costs**
opens successful cycle count and Stock cost rows; change amounts, toggle accepted
trait alternatives, or add/remove rows. At least one row and one trait per row
are required, with positive whole amounts and cycles. Construction runs during
Housing, consumes all rows together each successful cycle, and pauses when Stock
is unavailable. Bonuses start on completion. Draft and live comparisons use the
same selected face. Construction proposals persist/export and apply to new runs
through the existing reviewed-card settings.

**Reviewer** sits beside Zoo in the nav, with a badge counting flagged cards.
**Flag for review** flags any Zoo Practice or Structure without leaving the Zoo;
flagged cards then offer **Open review**, and the Zoo's **Review flagged** link
opens the queue. Queue chips show edit-count, Locked and Notes badges; queues of
more than six cards gain a filter field. The top-right **Dev** control in the shared card
inspection does the same from the live game, including shop inspections, and
opens a separate reviewer tab. Re-flagging preserves existing edits and notes.

Tap an outlined value area on the actual card face to open simple fields over
its illustration. Choices save immediately; typed fields save on change or after
a short pause, and partial numbers wait until they are valid. Saved edits redraw the shared live
renderer. **Card values** below the card groups every field (Name & copy, Costs &
requirements, Stock, Workers, Production, Consume & require, Charge, Structure
bonuses, Other) into collapsible sections with counts. Groups with edits open
automatically, wide screens open all, and **Find a value** filters fields by
name. Edited fields show their live value beneath.
Structural DSL identities and operation names remain fixed. Invalid inputs
report inline errors and leave the last saved value intact.

**Compare with live** uses the current build's definitions at the same preview
quality. Cards appear alongside each other on desktop and stack on phones;
readable rules and a value-change list accompany the faces. Preview quality is
a display control, rather than a definition change. Notes save as you type.
**Changes against live (N)** sits directly under the preview: each row shows
live → draft and a **Revert** button that restores that field's live value.
**Export all** downloads one JSON file containing every flagged card,
notes, its original definition, current live definition, modified definition,
and explicit original/live/proposed values at each edited path.

**Import reviews** opens an **Export all** JSON file to continue on another device.
Move `card-reviews.json` from your phone to your PC (or back), then select it here.
The preview counts new and existing reviews. Matching cards default to **Keep this
device’s drafts**; choose **Use imported drafts** to replace their full edits,
notes and original definitions. Reviews outside the file stay untouched. Invalid
files leave all drafts unchanged. Importing does not enable edited cards in new
games or change an existing run.

Reviews use the stable `civsurvivor.card-review.v1` browser-storage key, independent
of simulation/save schemas and game resets. They survive sessions and builds on
the same site, browser and device. Clearing browser site data removes them.
New builds supply unedited values; edited values retain their proposals. Changed
field shapes and removed cards remain in storage/export with a visible warning.
**Reset edits** keeps the flag and notes; **Delete review** removes the entire
review. Both require a second tap and sit below the change list, away from the
Lock/Compare toolbar. Drafts never change an existing run.

In Zoo, **Card versions** selects **Live cards**, **Show edited cards** (drafts
where available, live values elsewhere), or **Edited cards only**. Draft faces,
filters and reading panels use the modified definition without changing the
Lab fixture. Cards with edits are marked **edited**; notes-only reviews are not.

**Lock card** temporarily excludes a Practice or Structure from new shop offers,
including upgrades, tagged shops, markets and rerolls. **Unlock card** restores
its eligibility. Locks save and export with other reviewed values; **Reset edits**
and **Delete review** also remove the lock proposal. Apply them with **Use edited
cards in new games** or **Apply reviewed cards to draft** in Gym. Existing runs
retain their recorded pool. Fixed starting and neutral placements keep their
authored cards; locking changes the offer pool, not installed-card behavior.
The run's optional boolean `locked` definition field defaults to unlocked when
absent and can support future progression-driven availability.

Zoo marks locked cards in every **Card versions** mode. **Hide locked cards**
filters them out without deleting definitions or altering the fixture. The
Research library shows only the run's available pool, and Life Map generation
considers only unlocked suppliers when choosing Stock Supply outputs.

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

## Layout and phone use

The nav groups tools as Content (Zoo, Reviewer), Simulation (Museum, Gym) and
Design (Prototypes). Each tool opens with a title and one-line summary;
explanations sit behind **How … works** (i) toggles, field-level (i) help and
collapsible sections, so default-visible text stays short. Open/closed choices
are remembered in this browser (`civsurvivor.development-lab.ui.v1`); defaults
never write to storage. Buttons follow one hierarchy: primary (the main action),
secondary, quiet and danger; badges mark counts and states. Shared tokens live
at the top of the `.development-lab` block in `styles.css`.

Zoo, Reviewer, Museum and Gym (including the New run editors) fit 390px portrait and 844×390 landscape
without horizontal scrolling. The header and section nav stay compact and
sticky; landscape-short screens keep only the nav. Controls are at least 44px
on narrow or touch screens, number fields use the numeric keyboard, and Zoo
quick reads have **Full rules** / **Close quick read** buttons (a bottom sheet in
narrow portrait), so nothing depends on hover. The reviewer's Lock/Compare/quality
toolbar stays reachable in portrait; landscape puts the card beside its fields.
`npm run probe:development-lab` checks these phone layouts.

## Prototypes

**Prototypes** sits beside Zoo, Museum and Gym. It contains three isolated
workbenches: **Regional map generation**, **Protovassal opening** and
**Vassals & Founders**. Direct URLs and
the Prototypes hash route support refresh and GitHub Pages repository paths.
The Pages build bundles these entries separately from the game.

The [map-generation workbench](../images/dark-fantasy/map-generation-prototype/README.md)
explores twenty seeded regions with exact 6/5/4/3/2 biome counts, clustering,
unequal areas and connected river, mountain-range, chasm and valley borders.
Connected Islands regions form larger shared land masses. The non-playable
surroundings put ocean on one world side or two sides sharing a corner, with
continuously blended badlands, scrub, marsh and highlands elsewhere. Twenty connected cells from
a larger tessellation form region-scale bays and headlands, retaining broad
region shapes without a global warp or enclosed gaps. Mountain and river
artwork stays on land; rivers end at the chosen ocean's shoreline. Inland creeks
taper into wetland fringes, while other landforms influence the surrounding
terrain without projecting lines or wedges outward.
The geography pass opens water gaps where rivers cross ranges, puts peaks on
valley flanks along parallel stretches, and keeps ordinary mountain symbols out
of river corridors. Coastal rivers sit inland; narrow headwaters widen toward
estuaries or rocky mouths. Coastal ranges and cliffs respect actual land,
including generated islands. Interaction counts are exposed in the state panel.
Drag, scroll, pinch, zoom buttons and Fit explore the irregular footprint
through the game's camera.
Its Regions, Geography and Terrain views share one generated graph. Generation
controls, selection, reflections and PNG export live in a fixed 2424 × 1080
Pixi landscape window with the shared Fullscreen control. Settings live in memory
and shareable URL parameters; no live game, draft or player save is attached.

The opening workbench edits an authored Warrior graph and plays sequential
encounters from the real fresh-game economy. Edit nodes, connections, curated
shop/relic offers, costs and rewards; Restart captures the draft in a disposable
run. Its mock game screen reuses the live Pixi Life Map, node modal, shop cards,
inspection, staging/drag/undo, level-ups, HUD, world map and settlement. Play on
the canvas; the shared navigation and Fullscreen keep normal game proportions.
Resolve choices through real simulation ticks, inspect before/after results,
and Rewind a decision including the complete RNG state. Guided experiments compare
Relic & invest, Explore & save and Accept Chaos; their Next guided choice button
uses the same operations as free play. Earned level-up choices remain playable.

**Preview this node** opens an authored encounter directly in a fresh disposable
opening. World Decision uses the full map with **Move**, **Build a route**, and
**Tour this region**. Tour stays local and offers, by default, a 25% chance of an
unowned ordinary Bronze relic, otherwise +1 to a random ability. Relic acquisition
uses the normal equip/carry/vault choices; exhausted relic pools fall back to an
ability. Odds are editable, and rewind restores the same seeded result. Existing
local-option recipes can be replaced with **Use Tour as the local activity**.

The visual graph editor moves nodes before/after a destination and joins up their
old routes, inserts new nodes from populated templates, duplicates/removes nodes,
and draws or deletes connections. Drag cards into grid columns/rows, box-select
groups, and drag any selected card to move the group. Positioning preserves route
connections; Before/After changes the route. Column/Row fields and Pan mode support
phone authoring. Draft Undo/Redo is
separate from playthrough Rewind. Disconnected or cyclic edits remain visible
with an explanation; playing and saving require a valid graph. **Play edited
opening** captures the draft in a fresh Pixi playthrough. **Custom Note** nodes
hold a title and intended interaction; enter them to read the text and Confirm to
leave, without changing simulation time, income or RNG.

Save/Load uses separate browser storage; JSON export/import transfers recipes
between devices. Graph edits remain in the draft until Restart. See the
[opening workbench guide](../images/dark-fantasy/life-map-opening-prototype/README.md)
for the experimental differences and run command. Normal gameplay, saves, card
reviews, generation rules and Scholar unlocks are unchanged.

The former Illustrated Cards, Structures & tooltips and Practice inspector
sections are retired from the directory and Pages deployment. Their source
studies remain available locally for reference. Shared card-workbench styles
remain published because the game and Vassal workbench still use them.

Vassals & Founders retains its founder carousel, editable dossiers, class
comparison and frame studies. Its Fullscreen button and the Museum/Gym scene
use the game's landscape display mode, including the rotated fallback on touch
browsers that reject orientation locking. Escape restores the normal page.

## Catalogue

Zoo reads the fixture's serialized runtime Gamepieces registry. It includes every
implemented Practice and Structure, generated candidate specimens, Life Map
families/signatures, the four neutral templates, and the single spatial Monster
type. Search covers IDs, names, rules, and definition data. Filters cover category,
Common/Scholar/Warrior, minimum maturity, Card Tags, Stock Traits, and footprint.
It also filters Scheduled/Charge mode and reports the required CivContent 2.6
pool counts (110 Practices / 78 Structures). Compare exposes Charge grammar,
executable effects and provisional deviations.

Faces use the actual `getGamepieceFace` / `addSettlementPiece` pipeline and art.
Hover, focus or tap any Zoo Practice or Structure for its current in-game quick
read. Select the tooltip title, **Rules** or the quick read's **Full rules** for
the full rules, symbol key and recursive keyword definitions. **Compare** opens
the quality comparison and scrolls it into view. Escape retraces a definition or closes
inspection. All four quality-comparison cards support the same reading surfaces.
Quick reads stay inside the viewport and scroll when needed; full inspection
uses a modal canvas with independent rules and symbol-key scrolling.
Catalogue specimens use equal-size frames, including wide Structures; card art
keeps its original proportions within a fixed image area.
One compact sticky bar holds the category tabs (with counts), Search and a
**Filters (N)** button. The bar slides away while scrolling down and returns on
the way up (instantly with reduced motion; never while typing a search).
Full filters are a sticky sidebar on wide screens, a side drawer in landscape
and a bottom sheet in portrait (**Done**, the scrim or Escape closes it). They
hold Show (Card versions: Live / With edits / Edited only, Hide locked) and Card
details (Class buttons plus maturity, mode, tag, trait and slot size), offering
only values that apply to the current category. Active filters and the search
appear as removable chips beside the result count, with **Clear all** once
there are two or more. Practices and Structures are grouped by class under
sticky headers with counts. Coverage is a collapsed table unless runtime
content is missing.
Class buttons support any combination, including **Common + Warrior**. Tap a
selected class to remove it; **All** clears the class selection. Selected classes
are combined as alternatives, while the other filters still apply together.

**Stock summary** below the result count analyses every matching Practice and
Structure across all pages, using the selected Live / With edits / Edited only
definitions and respecting Hide locked. **Stock flow** compares Produced and
Consumed quantities side by side in one row per Stock trait. Each column also
lists how many distinct filtered cards can produce or consume that trait,
regardless of their individual quantities; repeated effects and activations do
not add extra cards. This count follows **When**, with **All timings** including
every matching card in the filtered set. Consumer counts include either/or inputs
and deduplicate cards with several matching costs. **When** focuses the
table on a phase, season or Discharge; **All timings** counts each card once and
shows a range for differing yields. A **+** marks variable bonuses. Alternative
inputs appear separately as **either/or**, rather than mandatory costs for every
accepted trait. Tap a trait to see its contributing cards, quantities and timings;
only one breakdown opens at once. Card names open a preview beside the list on
desktop or in a bottom pane on phones, preserving the list, filters and phone
scroll position. Previous / Next steps through the distinct cards in the open
breakdown; clicking another name switches directly. Close returns focus to that
name. Full rules opens the shared inspection and returns to the preview. Faces
use the selected card version and quality, including construction plans for
Build costs. Missing producers are labelled within the
selected timing or filter. **Required** shows Stock checked but kept; **Build
costs** lists completion totals and per-cycle details. Stock carrying several
traits appears in each trait row, so different trait rows must not be summed.
**How to read these quantities** explains the notation. These are base recipes
before workers,
institutions, capacity limits and additional action costs, rather than a forecast
of a playable board or an income balance.
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
**Undo** reverses the last fixture load, edit, reset, imported state or reset
point (up to 20 steps). Museum exhibits are grouped by system (Production &
Stock, Food & housing, Classes & economy, Conflict, Engine checks, Saved).
Selecting one loads it immediately and shows a one-line summary; **What to look
for** holds the walkthrough and any Gym step. **Reload with seed** reloads it
with an edited seed. Transport controls are
grouped as Step, Jump, Check and Restore. **Use current as reset** asks for a
second tap. Provider rows on a selected card scroll to and highlight their source slot.
Map layers, graph series, Structures, Population, Vassal, Candidates, External
actors and World & traces are collapsible panels; secondary ones start closed
on phones, and trace logs show their entry counts.

Practice and Structure selection uses searchable visual pickers with class, tag,
trait and footprint filters. Practice handles support mouse/touch dragging and
Alt+Left/Right keyboard ordering; moving a slot inserts it and shifts intervening
slots, preserving exactly five. Population, specialists, Vassal stats, Chaos,
quality and Stock apply on change/blur. Invalid edits report an error and preserve
the previous state and timeline. Spawn/remove/resolve actions remain explicit.

**Save to Museum** captures the currently viewed Gym state as a named exhibit.
**Save and open in Museum** also switches to it immediately. Saved exhibits appear
in the Museum's fixture selector and survive refresh. Saving an existing name
asks for confirmation before replacing that exhibit. Storage is local to this browser; JSON export/import is
available for sharing between devices.

Gym’s **Settlement sandbox** (`#/dev/gym?workspace=settlement`) supports settlement/fixture selection; explicit adult-cohort population,
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
`applyClassAction`; Commission checks call `stepVassalCommission`. They explicitly
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
- All 188 runtime Practices and Structures have dedicated packed illustrations.
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

- `npm run probe:game-menu -- --dev-settings-only`: menu profile selection,
  persisted preferences, phone layout, custom New Game saves and Continue isolation.

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
  for all 188 runtime Practices/Structures, quality comparison, linked definitions,
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
