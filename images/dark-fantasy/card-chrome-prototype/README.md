# Illustrated card workbench (prototype)

Run `npm run preview:cards` from the repository root, then open
<http://localhost:5181/images/dark-fantasy/card-chrome-prototype/>.
Any existing root development server serves the same path. The Pages build
also includes this page; it bundles the read-only definition imports separately
from the game. The live card renderer does not import this prototype.

**Approval boundary:** keep this treatment inside the prototype until the user
explicitly confirms production integration.

Revision 4 adds square Stock count/output faces for larger numbers. The count
and capacity use separate lines on the crate. Numeric text fits both the width
and height of its dark recess, including stroke/shadow bounds. The multiplier
recess expands with fixed frame corners so its large text stays contained.
Compact left-offset Charge circles, segmented anonymous worker arches, plain
yield-row icons, and the original solar/lunar wheels are retained.

## What to try

- Compare **Current game & prototype**: both render the same edited face at
  the same picture width; the source uses the live `addSettlementPiece` renderer.
- Switch **Graphics** to choose the current game or prototype treatment for
  the hero, presets and screen previews. The matched comparison stays side by side.
- Preview five cards on the regional settlement screen and three Practice shop
  offers. These are existing screen references with rendered preview cards,
  not running game sessions; the first card follows the properties above.
- The top-right **Fullscreen** button on the hero and screen preview also exits.
  It requests the game's landscape display mode on touch devices, with a rotated
  landscape fallback when browser orientation locking is unavailable.
- Select the four comparison cards: Scheduled simple/complex and Charge
  simple/complex. These are deliberate layout fixtures, not balance changes.
- Select Foraging, Logging, Smelting, Alchemy, Anatomical Study or War Council
  to start from the real definition. Reset restores that definition.
- Change Stock tags/count/capacity, trigger count, worker capacity/occupancy,
  base output, and Charge threshold/fill. Charge cards never show Stock costs.
- Advance Scheduled triggers to swap the medallion's symbol. Trigger Charge
  to demonstrate the worker multiplier on incoming Charge and fixed base output.
  This button is a local meter demonstration, not the game's event resolver.
- Inspect the 170px comparisons, adjust the main card size, enable the
  transparency checker, or export the assembled main card as a transparent PNG.
- Anatomical Study exercises multiple outputs; War Council exercises no Stock.

`?variant=scheduled-simple`, `scheduled-complex`, `charge-simple`, or
`charge-complex` selects the initial comparison preset. Edits are ephemeral.

## Asset contract

`components.png`, `components-v2.png`, `workers-v3.png`, and `stock-v4.png` are original RGBA
ImageGen outputs, copied without raster modification. Their matching JSON
manifests supply named pixel rectangles and sheet dimensions. The third sheet
contains occupied/empty anonymous bust arches and a broad multiplier housing.
The fourth contains a square-front crate and matching square output plaque.
`prompts.json`, `prompts-v2.json`, `prompts-v3.json`, and `prompts-v4.json` record the built-in
ImageGen prompts.
Alpha channels, including the frame's transparent aperture, are preserved.
The revised sheet is loaded only by this prototype; no production asset
registry or game renderer was changed for this revision.

`renderer.js` exports `loadCardAssets(ids)` and `assembleCard(face)`. Load first,
then pass the presentation face returned by `getGamepieceFace` or a preview
copy. `assembleCard` returns a Pixi 7 container in 300×420 logical coordinates.
Allow 104px above, 36px below, and 24px on each side for floating ornaments.
Scale the container to the desired card width. Destroy it with
`{ children: true }`; shared atlas and painting textures belong to the loader.

The frame and plates use nine-slice resizing with separately scaled corners.
Separate worker arches repeat at a 48px pitch, retaining their individual rim
and sill. The lowest arch joins the flared neck of a 78×88px multiplier housing.
Its number recess expands through nine-slice resizing, preserving the corner
art. All numeric recesses fit text in two dimensions with a rounding margin.
The Charge artwork is split into an upper circle group
and its matching rail/reservoir using texture regions. The illustrated necks
remain attached to the small, left-offset circles; the reservoir extends right
without enlarging the circles. Live icons and segmented enamel fill occupy
their recesses. Yield-row icons share one aligned column without icon sockets.
The 148×156px crate has a square front; count and capacity stack inside it.
Single Charge output plaques are 78×78px, with larger live numerals. Scheduled
and multiple-output panels expand by row count and retain separate numeric
recesses. `inspectNumberBounds(card)` reports actual bounds for preview checks;
the workbench exposes these as `window.cardWorkbench.numberBounds`.
Numbers are live Pixi text; no values are baked into the art. The unchanged
solar-wheel and moon-wheel textures and resource symbols use the existing
TexturePacker resource atlas. Card paintings reuse the named WebP sources.

This isolated study registers the component image as a standalone asset.
If the treatment is adopted, move the loader into the shared packed-art path
and integrate the component assembly with the existing face geometry/hit areas.
The prototype is intentionally not a second production renderer.

## Review boundaries

The demonstrated layout supports up to three Stock traits, three trigger/output
rows, four worker sockets, and twelve Charge segments. Extreme values are for
readability checks. Identical light/dark busts indicate occupied/empty sockets;
they do not encode identity or specialist class. Detailed trigger event kinds
remain in the adjacent explanation; the
current illustrated symbols alone do not distinguish generation from use.

No simulation state, RNG, save schema, replay behavior, or authored definitions
are changed. Browser checks cover trigger switching, Charge multiplication,
reset, extremes, multiple outputs, and mobile overflow. Run `npm run verify`
for the repository checks and deployment build.
