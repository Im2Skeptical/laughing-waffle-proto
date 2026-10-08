# Current UI

Charge faces use a segmented teal reservoir along the bottom, workers and their
Charge multiplier on the left, and Activation yields on the right. The icons
directly above the reservoir identify Charge triggers, not Stock costs. Small
arrows distinguish Stock-generation triggers (up) from consumption triggers
(down); event symbols cover death, threat, trade and Martial triggers. Sections
expand upward only as needed. The Stock tray is raised above the top rim.
Faces/evaluations expose mode, current Charge, threshold, trigger, Discharge,
full blocked state and reason. Development Lab Zoo filters mode and reports
complete pool counts; the Charge Museum exhibit uses five real Practices and
normal authoritative stepping. Its causal sequence exposes root/parent event IDs,
gains, blocked retries and Discharges. See `docs/civcontent-2.6-implementation.md`.

Practice faces show hosted Stock count/capacity and Trait glyphs. Hover translates
the recipe into plain English: class/type/tags, separate Activation effects,
Charge triggers or inline Cycle timings, necessary requirements, and short
flavour text. Hover never includes the symbol dictionary or private Charge
threshold instructions. Desktop clicking a Practice opens an enlarged card and
the same rules over a dimmed scene, with a scrollable glossary on the right.
Full inspect and its backdrop cover the vassal HUD and bottom-left navigation;
closing it restores the normal scene order.
On touch, tapping a Practice first retains the quick read; tapping its title
opens the enlarged inspect view, and tapping elsewhere dismisses the quick read.
The glossary covers only symbols on that face, including hosted/trigger/input
Traits, Stock capacity, staffing, Charge or Cycle, and base output numerals.
Food and Currency
summaries are read-only Trait totals. Regional, overview, and purchase boards show
one row of five fixed Practice slots, with no Practice-board paging. Purchase
inventory paging is separate. Population/Housing,
specialist counts and the last defense outcome remain explicit.
Construction sites reuse completed Structure art with timber scaffolding, a
bottom-left recipe and cycle wheel, and a pegged wooden completed/required tally
in the top right. Shops pair a fanned site plan with its completed Structure;
repeat commissions keep the plan available. Cycle readiness uses the existing time rim. Generic art is reused for new
content with distinct names and rules. Structure inspection retains its existing
hover/touch reading panel.
Warrior status displays Retinue, cap and next Prestige threshold. Scholar status
shows the active Commission. Class stat labels are Ingenuity and Prowess.
Structure rows are centered and use the same eight-cell pitch across regions.
Time costs use purpose-drawn sun, crescent, and lunar-phase icons with numbers
fully inside matched blank centers. Small pips separate the denominations;
a smaller hourglass sits on the cost frame's left edge. Time and Prestige rows
are vertically centered together rather than anchored to the top.
Prestige uses icon-then-number order. The outer cost frame preserves its corners
with 14-pixel display-space corners and a stretchable center as the panel
accommodates both time and Prestige rows, independent of atlas resolution.
Three-choice panels with a right-hand context use 338-pixel-wide framed columns,
450-pixel height, and identical 326-pixel cost footers. Shop Practices/Structures
fit uniformly inside those frames. Undo controls sit below the columns, above
the mortality plate. Regional resource segments expose textual labels on hover
or tap; warning glyphs retain their own explanations. Population reads as a
people icon and count, followed by a house icon and Housing capacity.

Authoritative UI behavior. Engine invariants and schema numbers:
`ai/ai-context.md`. Art, asset inventory, and the time-first extension
contract: `ai/visual-overhaul.md`.

- Main screens share a fixed-landscape dark stone/brass frame, pixel-art terrain,
  illustrated gamepiece cards with dedicated packed art for all 188 runtime pieces, and an engraved astrolabe. New presentation
  modules sample viewed timeline time for hamlet/fire sprites, dust, transfer
  packets, and optional reversible ambient audio. Fractional presentation time
  never substitutes for a missing authoritative snapshot.
- Boot opens a responsive landing menu with New game, Continue for the latest
  valid save, and Load game for selecting among three browser-local IndexedDB slots.
  Boot transfers compatible current-schema localStorage saves once, without
  changing their envelopes or replacing existing IndexedDB saves. Source keys
  are removed only after commit; unrelated and obsolete stored data is untouched.
  Slot listings read small metadata records, with a loading/retry state for storage
  access. Saving is asynchronous and shows Saved only after the payload and slot
  metadata transaction commits. Concurrent autosaves coalesce; Save & menu pauses
  immediately and captures a fresh save after any earlier write finishes.
  New game asks for a slot and confirms replacement of occupied/unavailable
  saves. The active slot saves every ten seconds during play, on focus loss,
  and through Save & menu. Storage failures remain visible; Save & menu opens
  recovery controls and keeps the live game in memory. Retry and current-game
  JSON export remain available, while replacing the live game is blocked until
  saving succeeds. Load game validates imported files before destination-slot
  selection and confirms replacement of occupied slots. Save status shows the
  last successful save; Developer tools / Save diagnostics provides a report
  of exceptions, save size, storage estimates, timestamps and browser details,
  with the last five save attempts (serialization, enqueue and elapsed storage
  timings) and the first three seconds of frame gaps for the last three
  resolution popups, plus the background forecast worker's status and last
  failure/retry. Pauses/background time are excluded. These are bounded
  runtime diagnostics without game state or stored values. Touch-device focus loss still pauses and
  preserves the live game in memory if saving fails. Desktop focus loss saves
  without opening the menu. Loading validates and rebuilds the
  saved timeline before replacing the active state; incompatible saves cannot
  continue. No save-schema migration is introduced.
  Developer tools also offers Use edited cards in new games, persisted on this
  device. New games capture validated reviewer definitions before initialization;
  Continue/Load retain their saved definition snapshot. Zoo's Card versions
  selector displays live cards, drafts where available, or edited cards only.
- Reaching a loss opens a cause-specific popup. Confirmed losses say Game over;
  viewed forecast losses say Foreseen extinction and explain that choices can
  change the outcome. Minimise / Browse history removes the backdrop. The
  coloured details chip replaces the middle survival-strip column (Foreseen
  survival / Civilization ended) so it can be reopened; Year and Best remembered
  stay. The observed end year stays available while browsing earlier years. A new timeline revision clears
  an obsolete forecast warning; a fresh run clears the prior loss. Confirmed
  losses offer New game, which opens the existing slot chooser and retains its
  overwrite confirmation.
- The menu is also the pause screen. On devices whose primary input has no hover
  and a coarse pointer, focus loss, page hiding, fullscreen exit, or rotating
  into portrait returns to it. Regaining focus does not resume automatically.
  Desktop play stays windowed and does not open the menu on focus loss or
  fullscreen exit. Continue resumes the live playhead, choices, and
  unveil-follow state without reloading. Touch-device entry requests fullscreen
  and landscape from the button gesture. Entry proceeds once the viewport is
  landscape and the page is visible, even if the lock promise never settles or
  fullscreen stole focus. Unsupported portrait devices stay in the
  same menu with a rotate-device hint. There is no separate landscape screen.
  Gameplay, reveal motion, and audio stop while the menu is open.

- The map shows all-region polygons, player ownership nodes, worker pawns,
  structure-capacity glyphs, food and population transfer packets, a
  civilization summary, and a compact selected-region card. Detailed regions
  show red starvation and amber overcrowding glyphs from the currently viewed
  state; hover and the selected-region card expose the underlying counts.
- Settlement Overview and Demographics are local to the opened detailed site.
  Tapping a Practice pins its quick read across visual redraws; its title opens
  inspect. Structures retain their existing pinned details. Tapping the source
  again or elsewhere dismisses compact details.
- The shared survival strip reports viewed year/season, projected or actual
  civilization loss, and the monotonic best survival year observed.
- The timegraph is one illustrated walnut/brass assembly containing a parchment
  scroll with upright left/right rollers, inset controls, a Viewing plaque and
  a fixed eight-socket key cabinet. Its exterior is transparent. The compact
  assembly aligns with the timewheel overhang below the Lifegraph playfield.
  Chaos, Resources, and Population toggles sit beside the individual-series
  picker; Focus is at the right. Overflow key entries use previous/next page
  arrows or the mouse wheel over the cabinet. Changing groups or key pages
  never moves or resizes the plot. Hover or tap shows series details. Numeric y-axis labels
  are hidden because series use different scales. A new run starts with Chaos
  only (Monsters, Chaos Resistance, Chaos Pressure); Monsters always uses a
  fixed 0–100 axis.
  Selecting a detailed region switches to local scope and defaults to Resources
  (Food, Gold, Total Population, local Housing Capacity). Civilization Resources
  omits local housing. Population shows population and Villager/Stranger subgroups
  for the current scope, civilization housing, and local housing when selected.
  Gold reads settlement currency, summed over player settlements in civilization
  scope. Groups can be combined; shared series survive removing another group.
  Civilization series choices are remembered while browsing settlements.
- Forecast unveiling drives the read-only viewed state and playhead without
  advancing committed history or consuming RNG. Each new unveil starts with
  the playhead following its speed. Player use of the lever, Present,
  graph scrub, or time discs detaches that follow until the next unveil.
- Long forecasts retain lightweight graph summaries after heavy state snapshots
  are evicted, while active forecast tails remain pinned for worker continuation.
- Timegraph intent and optimisation guardrails: `docs/timegraph-ux-and-capacity-brief.md` (draft, stated
  intent) and `docs/timegraph-optimisation-guardrails.md`.
- The season/moon wheel uses the shared Sun and Moon sprite family. Six phase
  emblems rotate with the moon face, while an upright centre shows the active
  phase. Its phone-sized target opens a six-phase reference containing the rules
  and live or previous-moon civilization totals. Both faces and centre drags
  scrub through the existing viewed-time controller. The compact wheel sits low
  in the bottom-right corner, with its outer right/bottom rim slightly offscreen
  and a compact vertical lever to its left. The lower-left navigation dock always
  carries a small circular clock: gold hands at Present, a warm forward arrow
  for History, and a cool backward arrow for a projected future. Hover explains
  the viewed time state; one click returns to Present from either direction.
  Returning holds the playhead and preserves the current screen. Attempts to
  enter or change a read-only Life Map decision briefly highlight this control
  and explain the time lock; reduced-motion preference keeps the highlight
  static. There is no separate Pause button. The lever locks forward
  above centre, rewind below centre, and holds time at centre, with symmetric
  2x/4x speed notches.
- The World Map candidate chooser overlays the lower map and graph
  region. Its three expanded cards show original pixel-art portraits assigned
  deterministically from serialized portrait traits, plus age, settlement,
  Prestige, four stats, and the advertised signature node. Hover temporarily
  previews a starting region; click/tap locks a preview, and the lower-left
  control or a double-tap on the selected candidate confirms it. Clicking
  outside dismisses the chooser without changing
  its authoritative pool. Selection opens a dedicated full-topology Life Map
  screen with a Philosopher or Warlord Chronicle for the first Vassal. The compulsory
  opening node and its sole choice name that founder; completing it establishes
  the chosen class. Later candidate cards show Unclassed or the established class,
  with no recurring founder identities. Later Lifegraphs use a Vassal Chronicle
  label. The compact centered HUD shows:
  circular portrait, Age over Prestige, EXP `n/10`, four stat chips, and Location
  on the right, aligned under the year strip. The HUD stays
  fully lit above recap and decision modals and shows signed Prestige and stat deltas
  for the hovered or selected choice; recap counts those values up from before to after. Stat hover/tap
  details show the current
  calculated income or discount power. Clicking an available, current, or
  already-committed node opens a large shared decision modal; other nodes show
  a tooltip with a non-interactive pin mark. Pinning is a second click on the
  node. Hover tooltips dismiss when the pointer leaves; touch keeps the selected
  node's tooltip until another tap. Pinning highlights one forward route through
  every pinned node and survives screen changes until the Vassal changes.
  Progression clears pins that are no longer reachable. An incompatible reachable
  pin replaces the previous set; unreachable nodes cannot be pinned. Nodes unreachable from the
  current position are greyed. While a node is unveiling, the Lifegraph uses
  an hourglass cursor and does not open the modal. Only entering an available node
  reveals its persisted options or inventory. Card art opens a readable,
  scrollable inspection of complete effects and quality/tags; option rectangles
  keep a consistent three-column size, titles stay inside the rectangle, and
  cost footers sit below it. Relic columns use taller text cards to keep their
  full effects readable; each cost box names immediate death risk and the
  age-based roll after spending time. Their displayed prices include equipped
  Heirloom discounts and match confirmation. The family title and description sit in their own
  plaque overlapping the modal's top-left, left of the HUD, so shop titles no
  longer collide with that chrome. The modal still leaves a bay for the
  centered HUD so the divider does not run through the portrait. Confirm is a
  carved-stone green dock pill at the bottom-right, with a checkmark above its
  label and the same hover/press feedback as the lower-left Settlement/Map controls;
  the mortality estimate sits to its left. The modal has no Close button;
  taps on the open dimmer dismiss the decision, while misses near the dock controls
  leave it open and the dimmed time controls cannot be used.
  Opening a node expands a brief panel outline from that node before its contents
  appear; dismissing it retracts the outline to the same node. Reduced-motion
  settings skip the transition, and navigation to another screen closes it at once.
  The lower-left dock can still navigate away. Time costs
  group Sun/year, Moon, and Phase sprites with live amounts into an hourglass-prefaced
  illustrated inset, followed by
  Prestige when needed. The displayed units follow the run's calendar: at the
  defaults, 80 phases is 2 years, 2 moons, and 4 phases. Non-integral solar/lunar
  ratios use moons and phases to stay exact. Authored prices are unchanged.
  Selected, staged, and unaffordable costs remain visible. Prestige, Food, and
  Money use the same resource symbols in their existing HUDs. The modal shows
  current-to-projected Prestige. Practice/Public Works show
  the final settlement preview on the right. Offers, detached cost tags and source undo occupy the left. Offer inspection
  uses a quick hover panel opposite its source. Touch first retains that quick
  read, whose title opens inspect; an outside tap dismisses it without activating
  underlying shop controls. Desktop clicking a Practice opens the
  enlarged, dimmed inspection with its glossary on the right; Structure inspection
  retains its opposite-side panel. Inspection dismisses during dragging. Faces inspect; costs stage; an
  offer-to-tableau drag also stages. Staged practices drag within their prefix;
  staged builds drag to valid origins; dragging back left undoes either. Incoming
  blueprints reveal cracked/faded buildings beneath them, and upgrades crossfade
  from the previous quality. Practice hover and expanded inspect share the same
  Activation renderer on every gamepiece surface. Structure reading panels stay
  left on the Regional Map, right in detailed settlements, and opposite the source in shops.
  Shared physical faces use 5:7 practices and 3:4 single-cell structures, with
  wider structures spanning contiguous cells. Pieces and slots scale uniformly.
  Illustrated frames distinguish scheduled and charge practices; structures share
  brass/stone framing. Stock and Traits sit above the top edge. Outputs sit at the
  bottom, with workers on the right for Scheduled cards and the left for Charge cards.
  Solar/lunar discs rotate at the bottom in time with scheduled triggers; charge
  practices show a segmented reservoir and trigger tray. Normal thresholds use one
  chamber per point; large custom thresholds group points and show a numeric count. The 188 runtime illustrations and retained earlier-card paintings load as v4 frame names from the settlement-pieces atlases; opaque full-bleed paintings replace the former vignettes. Illustrated frames
  load from the shared `piece-frames` atlas; Trade/Knowledge symbols remain code. Reduced motion keeps static fill/upgrade states.
  Routes/Travel show a cropped polygon regional preview;
  Patronage/Development show every option's gains, losses, and time cost on
  text-first cards without inspection overlays; tapping anywhere on a card
  selects it, while immediate and surviving-completion Vassal impact stays visible;
  Crisis/Legacy and non-shop signature nodes center their choices without an
  irrelevant side panel. Lifegraph nodes use freestanding silhouettes with secondary color accents;
  signature nodes add a small four-point sparkle. Generated lane positions are
  preserved with collision spacing and a slight stable depth stagger, with no
  age-band headings or bottom legend. Shop
  drafts support multiple affordable purchases, undo and pointer/touch drag ordering.
  Offers and board Practices share full-size faces; extra offers page without
  shrinking. A full board asks for any replacement card when a cost is tapped.
  Dragging previews the final shift/placement and discarded cards through the
  model without mutating the draft. The in-frame discard pile supports inspection
  and dragging Practices or Structures back onto the board. Empty slots have
  visible frames, and the HUD emphasizes remaining Prestige in a brass plaque. Dismissing the modal or
  focusing the Vassal's settlement on the World Map preserves the draft, and
  the active node/HUD reopens it. The modal has no duplicate Regional Map
  button; the lower-left dock owns navigation. Double-click still enters an available node.
  Hover/tap details identify each node type. Public Works uses a hammer
  silhouette; Practice Reform uses an open-hand governor mark.
  Node option selection and shop staging use a controller-owned draft. They do
  not mutate the timeline or rebuild forecasts. Drafts survive closing a modal,
  screen navigation, and read-only browsing; a changed authoritative frontier
  invalidates them. Confirm validates the batch in the Life decision worker and
  appends it once. Entering a node and paid rerolls remain real transactions.
  Tapping a dimmed offer, option, reroll, relic or Confirm shows a short dock
  notice with the reason (Prestige, requirement, replacement target or missing
  choice) instead of silently ignoring the tap.
  Reachable node content and legal rerolls are prepared from isolated snapshots;
  preparation never spends Prestige or advances authoritative RNG.
  A screen-level animated processing indicator covers commit, resolution, and
  preparation. Navigation/inspection remains available; conflicting decisions
  and time edits are locked. Recap, level-up, and every legal next node's entry,
  choice, and legal reroll layouts are prepared before the final graph reveal
  is released. Matching node layouts are reused on entry, and repeated refresh
  callbacks do not rebuild unchanged controls. GPU preparation uses a small
  time budget per frame. Failed preparation can retry without charging
  an accepted transaction twice. Option, recap, and level-up buttons use immediate
  hover/pressed/selected feedback instead of per-selection loading labels.
  EXP level-ups use a separate non-dismissible modal while the Lifegraph is
  visible, after the recap is dismissed if a level was earned; a card tap selects a stat
  and Confirm applies it. Press feedback guards against click-through. The
  HUD previews the selected stat. The player may inspect the Regional Map or a settlement, but returning to the Lifegraph
  restores the unresolved choice before further node entry.
  Confirmation locks map input while its accumulated Phases auto-advance to the
  pending resolution boundary. When that boundary settles, a recap window
  reports time passed and from→to Age, Prestige, and EXP, and dismisses any
  open node tooltip. Death or retirement replaces
  that recap; dismissing it returns to the Regional Map and resumes the
  civilization unveil after the navigation pause. Fresh runs clear old recaps.
- Selecting a Vassal retains the prior timeline as a tinted comparison. Each
  confirmed node unveils only through that node's pending resolution boundary;
  the resolved span uses the worker's authoritative tick summaries so the
  committed graph lines include that node's interventions immediately;
  after a Vassal dies or retires, the new timeline can continue unveiling to
  civilization extinction. The candidate drawer remains closed until the player
  explicitly chooses Next Vassal. Timegraph Vassal markers come only from
  persisted life events; no future inventory or mortality result is exposed.
- The lower-left dock offers single-click Regional Map, Life Map, and detailed
  Settlement navigation, omitting the current screen and unavailable destinations.
  The main destinations share a large split capsule under the landscape thumb.
  Life Map and Settlement have equal halves on the Regional Map; on either
  destination screen, the other gets the larger half with Map as a smaller
  companion. Short titles and engraved icons replace button subtitles; hover
  help supplies context. Painted contours also define touch targets, leaving
  the curved corners and central gap inert. A sole action uses the full capsule.
  Life Map opens its viewed Vassal's settlement; the Regional Map prefers an
  explicitly selected detailed region, then the Vassal's location. The circular
  Vassal portrait sits above the pad opposite the auxiliary clock, except on
  the Life Map, which already has its portrait HUD. One portrait click focuses
  their region; double-click or
  double-tap opens its detailed settlement. Portraits and their location shortcuts
  follow the active Vassal in the viewed snapshot, including live scrub previews;
  they disappear before selection and between lives. The Life Map can still
  retain an ended life for inspection. Candidate selection uses the same dock for confirmation.
  Navigation remains reachable below Life Map decision and level-up panels and
  preserves staged choices. Detailed settlement has no separate header Map button.
  The Regional Map shows an active-Vassal location marker. Save & menu,
  timeline sound, and a small workshop seal share the utility rail, clear of
  settlement navigation on mobile landscape. Hold the seal for 850 ms or use
  Ctrl+Shift+D for development tools; Escape closes them. Sound is opt-in.

The forecast worker is a separately bundled Pages asset recorded in
`dist/build-manifest.json`; production should not silently rely on main-thread
fallback.

Probes and test routes: `ai/repository-map.md`.
