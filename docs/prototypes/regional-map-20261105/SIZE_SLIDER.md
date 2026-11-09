# Temporary floating UI size slider

Removed at Cam's request on 2026-11-07. Floating UI is fixed at 70%; both the
live/menu controls and the URL override are removed. Region titles retain their
positions and zoom behavior, with floating readouts above them where they overlap.
See [the current iteration](LARGER_GARRISONS_50_YEAR.md). The record below describes
the earlier temporary control.

Cam requested a temporary slider (2026-11-06) to tune the floating readout size
in the live game. This is experiment scaffolding, not a proposed player setting.

- Default is now **70%**, per Cam's follow-up. Open **Map UI 70%** in the top utility row while playing. The same control is
  available under **Save & menu > Developer tools** before entering a run.
- Drag from 50% to 200% in 5% steps; **Reset 70%** restores the agreed default.
- Every worker circle, Prestige pill, icon, numeral, influence meter and Force
  shield uses one common multiplier. Sprite-edge anchors and fixed proportions
  are preserved. Names retain their existing map positions and zoom behavior.
- Updates are immediate, without restarting or replacing the game. A
  `regionalUiSize=150` URL parameter shares a 150% setting; resetting clears the
  override. No local-storage or save-state preference is introduced.
- Titles use the live game's corner placement, 21px source font, existing
  compass abbreviation/wrap/fit, owner colours and normal map-zoom scaling.
  The live reference-layer priority above settlement chrome is restored too;
  this supersedes the earlier prototype's title-underlay treatment. The size
  slider affects only floating readouts.
- The slider exists only on the `regionalReadout=floating` prototype route.
  It can be collapsed for judging the map without development scaffolding.

View-only: this addition changes no simulation state, RNG, schemas, replay,
economic values, starting cohorts or Force/control rules. The earlier Crown
opening and inactive Prestige changes remain as recorded in
[the preceding iteration](INACTIVE_PRESTIGE_CROWN_START.md).

Architecture, source reachability and the production build passed. Live
interaction evidence is captured under `artifacts/regional-size-slider/`.

Live checks passed on phone and desktop with zero page errors: native touch
updates, 50/150/200% uniform scaling, keyboard isolation from map controls,
unchanged name geometry and sprite centring, reset/URL cleanup, and moving the
same control between the menu and live game. Existing uncommitted prototype
changes were preserved.

Follow-up verification: the 70% default passed the existing actual-render
capture checks through four zoom levels on phone and desktop, including the
restored live title-layer order, original title positions and map-zoom sizing.
No page errors; docs, architecture, source reachability and build checks passed.
