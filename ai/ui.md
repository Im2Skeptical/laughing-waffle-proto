# Current UI

Scheduled Practice readiness combines a visible spinning sun/moon rim with an
inset circular fill. Charge Practices use only a source icon and teal reservoir.
Output badges glow at the viewed activation boundary, including
charge reactions recorded in the snapshot. Reduced motion suppresses the glow.
Regional resource cells retain a separate Practices heading and highlight housing
overflow, loose Food, shortages, and starvation with hover/tap warning glyphs.
Regional panels sit at the right edge with 168×235 Practice cards. Resource
subheadings and the Open settlement button are omitted; the dock owns entry.
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
  illustrated gamepiece cards with distinct art for all current Practices and
  Structures, and an engraved astrolabe. New presentation
  modules sample viewed timeline time for hamlet/fire sprites, dust, transfer
  packets, and optional reversible ambient audio. Fractional presentation time
  never substitutes for a missing authoritative snapshot.
- Boot opens a responsive landing menu with New game, Continue for the latest
  valid save, and Load game for selecting among three browser-local slots.
  New game asks for a slot and confirms replacement of occupied/unavailable
  saves. The active slot saves every ten seconds during play, on focus loss,
  and through Save & menu. Storage failures remain visible and prevent leaving
  an unsaved game through that control; touch-device focus loss still pauses and
  preserves the live game in memory if saving fails. Desktop focus loss saves
  without opening the menu. Loading validates and rebuilds the
  saved timeline before replacing the active state; incompatible saves cannot
  continue. No save-schema migration is introduced.
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
  Tapping or holding a Practice/Structure pins its details across visual redraws;
  tapping it again or elsewhere dismisses those details.
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
  screen. The Lifegraph keeps a Vassal Chronicle label and a compact centered HUD:
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
  cost footers sit below it. The family title and description sit in their own
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
  overlays the right; tableau inspection overlays the left. The source stays exposed
  and inspection dismisses during dragging. Faces inspect; costs stage; an
  offer-to-tableau drag also stages. Staged practices drag within their prefix;
  staged builds drag to valid origins; dragging back left undoes either. Incoming
  blueprints reveal cracked/faded buildings beneath them, and upgrades crossfade
  from the previous quality. Inspection uses the same reading panel on every gamepiece surface: left on
  the Regional Map, right in detailed settlements, and opposite the source in shops.
  Shared physical faces use 5:7 practices and 3:4 single-cell structures, with
  wider structures spanning contiguous cells. Pieces and slots scale uniformly.
  Illustrated frames distinguish scheduled and charge practices; structures share
  brass/stone framing. Outputs attach centred along the top, workers along the left.
  Solar/lunar discs rotate at the bottom in time with scheduled triggers; charge
  practices retain an inset source and fill. Charge fill has
  no numeric counter. The 30 individual illustrations load on demand from
  `images/dark-fantasy/settlement-pieces-v2/`; opaque full-bleed paintings replace the former vignettes. Illustrated frames
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
  drafts support undo and pointer/touch drag ordering. Dismissing the modal or
  focusing the Vassal's settlement on the World Map preserves the draft, and
  the active node/HUD reopens it. The modal has no duplicate Regional Map
  button; the lower-left dock owns navigation. Double-click still enters an available node.
  Hover/tap details identify each node type. Public Works uses a hammer
  silhouette; Practice Reform uses an open-hand governor mark.
  EXP level-ups use a separate non-dismissible modal while the Lifegraph is
  visible, after the recap is dismissed if a level was earned; a card tap selects a stat
  and Confirm applies it, with a short input lock after the popup appears. The
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
  the resolved span is then re-materialized from authoritative replay so the
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
