# Stable floating UI sizing and placement

Cam's latest preference: all floating readings keep consistent screen-relative
sizes and consistent proportions. They stay attached around each settlement;
region names retain the original live-game regional-corner positions and may be
covered by the readings. Crowding must not trigger shrinking, label movement,
or label suppression.

## Change

- One inverse-zoom scale for every floating settlement readout (1.08 / map zoom).
- Fixed worker circle radius, Prestige pill dimensions, influence track width,
  icon sizes and font sizes. Counts no longer grow/shrink their containers.
- Removed the neighbouring-readout collision shrinker.
- Removed region-name clearance, relocation and suppression entirely.
- Names use the existing regional-corner calculation and remain visible.
- Readouts use a dedicated layer above names, with the existing Vassal layer
  retained above that. Sprite artwork remains below these view layers.
- Anchors stay at the same sprite-centre and above/below sprite-edge gaps. As the
  map zooms the artwork grows, while the overlay retains its screen size and
  follows those edges. There is no alternative placement search.
- Direct economy inspection, worker/Prestige/Force values, integer formatting,
  political meter semantics and all game rules remain unchanged.

This deliberately allows overlap at wide zoom. Region names are underlays;
readouts do not move or become individually smaller to protect them.

## Scope and validation

View-only: simulation state, RNG, schema versions, saves and authoritative replay
are untouched. Historical variants remain separate prototype routes. This is
still a local unmerged experiment, not a production promotion or publication.

Run: npm run prototype:regional, then append
`?regionalReadout=floating&regionalForce=onbar&perf=1&art=1&launch=new`.
Capture: node scripts/capture-stable-regional-ui-prototype.mjs.
Evidence: artifacts/regional-stable-layout/.

Checks compare actual rendered badge dimensions and meter widths across player
and Crown settlements and across four zoom levels, fixed above/below-sprite gaps,
unchanged name positions, names below the floating layer, reset consistency,
direct economy clicks, and phone/desktop rendering. They no longer treat
name/readout overlap as a defect.


Captured verification (2026-11-06): all geometry and interaction checks passed
at four zoom levels plus desktop, with zero page errors. Measured badge and meter
sizes remain constant; names stay at their original home coordinates beneath
readouts. No overlap-avoidance logic is applied.

The full `npm run verify` suite and final production build passed, including
architecture, source reachability, preview, presentation and replay checks.
