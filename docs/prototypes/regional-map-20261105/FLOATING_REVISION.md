# Floating settlement overlay — Cam's clarified direction

Latest launch: `?regionalReadout=floating&perf=1&art=1&launch=new`.
Branch: experiment/regional-readout-20261105. This remains a local throwaway
prototype; no merge or publication is requested.

Cam rejected the intermediate regional menu and text across the influence bar.
The original brief remains the scope: workers, influence/Force, and Prestige as
one light graphical cluster around each settlement's sprite artwork.

## Proposed arrangement

- Worker icon and count beside the settlement's buildings.
- Prestige emblem/amount on the opposite shoulder, current for player regions,
  conditional potential at zero unrest for Crown holdings.
- A thin framed allegiance bar below the buildings. Military occupation or
  contention uses a shield end-cap; Force never fills allegiance segments.
- Existing region labels retained, nudged locally only where a reading would
  cover them. Region text stays clear of bars and the floating numbers. If no
  nearby clear position exists at overview zoom, the label is temporarily hidden
  rather than painted over a reading; inspection still names the region.
- Worker and Prestige badges form a paired shoulder row just above the roofline,
  with the allegiance bar underneath the buildings. Crowded towns reduce the
  overlay scale slightly; their readings remain together around the sprite.
- No new regional menu. A region click opens the existing economic board directly.
- Existing Chaos drawer, camera framing, economic cards and navigation preserved.
  Ordinary economic diagnostics stay behind region selection.

## Impact

Presentation only. A read-only sprite envelope is measured from the actual
rendered building textures and exposed in terrain presentation stats. It does
not change artwork, geography, RNG, simulation state, save schema or replay.
No new raster artwork, cards, roads/borders, timegraph or gameplay tuning.

## Review and limitations

Actual phone 844×390 and desktop 1440×900 captures are under
`artifacts/regional-readout-floating/`. The capture checks names vs bars, readings
vs sprite envelopes, worker touch inspection, and direct player/Crown economic
selection. Detailed geometry is saved to artifact JSON rather than printed.

The authored population divisor remains 20 in this checkout. Crown potential is
an inspection-explained estimate, not a simulated Crown income or capture quote.
The representative opening state is population-supported; Force exception states
remain a separate visual review. The bounded overlay scaling and name clearance are prototype
scaffolding and needs broader map/zoom review before production implementation.

The earlier atlas/summary direction is rejected. It remains available only as a
historical developer variant; it is not the recommended interaction model.


## Verified captures

Final screenshots: artifacts/regional-readout-floating/review/.
- Phone overview, a closer map view, desktop overview, player and Crown economies.
- Zero reading/name/bar overlaps in the overview fixture (including cross-region
  pairs); readings leave the measured building envelopes clear.
- One crowded region label is hidden at the overview fixture. This is explicitly
  prototype decluttering, not an agreed production label policy.
- Worker touch inspection and one-click region-to-economy disclosure passed.
- No page errors. Full npm run verify passed during this pass; final architecture,
  source reachability and build checks passed after the visual changes.

The representative fixture is seed 123. Broader seeds/occupation states are not
claimed verified. Earlier attempts remain in ignored artifact folders; review/
is the final captured proposal.
