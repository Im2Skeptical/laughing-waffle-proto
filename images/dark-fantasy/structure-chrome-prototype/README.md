# Structure Pixi screen workbench (prototype)

Run `npm run preview:structures`, then open
<http://localhost:5183/images/dark-fantasy/structure-chrome-prototype/>.
Also linked from **Development Lab → Prototypes → Structures & tooltips**.
Pages bundles this isolated entry separately; the live game never imports it.
Keep this treatment here until production integration is explicitly requested.

Question: which face communicates capacity at actual construction-strip size,
and does the Practice quick-read/inspection flow work for Structures?

All proposed graphics render in one **2048 × 903 Pixi canvas**. The user's
unaltered `settlement-reference.png` supplies the static map, settlement,
Practice tableau, graph, wheels and navigation. Pixi draws the new construction
specimens and counter, the build offers, quick reads, inspection and controls.
The screenshot's other statistics remain reference pixels, not recalculated
game values. No whole-game renderer or simulation session is needed.

- `?variant=A`: content-sized capacity tray tucked against the lower right rim.
- `?variant=B`: hanging capacity medallion.
- `?variant=C`: the same content-sized tray in the upper right corner.

The tray measures its icon and numeral before drawing the outer box, following
the Practice Stock tray's inset stone/brass treatment. Longer values and extra
effects expand the box only as needed; wide Structure art keeps its open lower
edge. This applies in the construction strip, offers and enlarged inspection.

Cards use the real `addSettlementPiece` painting/frame and the shared resource
symbols: roof for Housing capacity; the matching Stock tag beside a capacity
numeral backed by the Stock crate. Granary shows Edible, Storehouse Construction,
and Archive Record, directly from their read-only modifier scopes. Values are live
Pixi text. Rules and glossary panels use the game's `paintRelicPanel`, text
styles and resource icons; none of these surfaces are HTML mockup graphics.
The HTML outside the canvas is only workbench controls and documentation.

Hover for the quick read, tap to pin it, then select its title for full inspection.
Inspection preserves the game's three columns: card, shared rules, separate
symbol glossary. Rules/glossary support wheel and pointer/touch dragging.
Escape closes a reading panel first; another Escape exits fullscreen. Pixi
accessibility labels describe the interactive pieces. External Quick read /
Inspect controls also open the same canvas surfaces for keyboard users.

**Fullscreen** uses `attachDevPreviewDisplay`, exactly as the other workbenches.
It requests mobile landscape and uses the shared rotated landscape fallback
when locking is unavailable. The entire game reference keeps its aspect ratio;
the layout never wraps into website cards or stacked tooltip columns. The
in-canvas variant arrows, Quick read and Inspect controls remain available in
fullscreen. The same Fullscreen button exits and restores normal page scrolling.

Try Mud House/Longhouse for Housing, Granary/Storehouse for Stock scope, Archive
for Scholar requirements and a two-cell footprint, and Barracks for Support.
Quality, requirements and staged offers are temporary in-memory examples.
`variant`, `card` and `context` survive URL refresh, including Pages subpaths.
**Save screen PNG** exports the complete canvas, including the current tooltip
or inspection, for mockup review.

Definitions are read-only. Housing rounds down per Structure. Stock contributions
are shown before the runtime's final rounding of each host's summed capacity.
Candidate base bonuses and history caps do not gain quality uplift. Storehouse
uses the runtime Construction scope; its authored trait-choice hook is deferred.
Simulation state, RNG, schemas, replay, live renderers and saves are untouched.

`window.structureWorkbench` exposes presentation state, scene geometry, reading
scroll positions and PNG export for probes. Verify real canvas card/title input,
quick/inspection/Escape, glossary wheel/drag, gating, reset, offer staging,
all treatments, URL refresh, PNG dimensions, desktop/mobile overflow and
fullscreen entry/exit. `npm run verify` checks packaging/invariants;
`npm run probe:prototypes` covers the separately bundled workbench and fullscreen.
