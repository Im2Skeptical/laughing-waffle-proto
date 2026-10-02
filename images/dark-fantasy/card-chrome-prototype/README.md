# Illustrated card workbench (prototype)

Run `npm run preview:cards` from the repository root, then open
<http://localhost:5181/images/dark-fantasy/card-chrome-prototype/>.
Any existing root development server serves the same path. The Pages build
also includes this page; it bundles the read-only definition imports separately
from the game. The live card renderer does not import this prototype.

**Approval boundary:** keep this treatment inside the prototype until the user
explicitly confirms production integration.

Revision 2 restores the existing solar/lunar wheels, adds clearer separated
seasonal rows, replaces worker portraits with identical anonymous pawns in a
continuous multiplier housing, forges the circular Charge wells into the
reservoir, and gives Stock output plaques the crate's wood-and-brass treatment.

## What to try

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

`components.png` and `components-v2.png` are original 1254×1254 RGBA ImageGen
outputs, copied without raster modification. Their matching JSON manifests
supply named pixel rectangles for 16 original and nine revised components.
`prompts.json` and `prompts-v2.json` record the built-in ImageGen prompts.
Alpha channels, including the frame's transparent aperture, are preserved.
The revised sheet is loaded only by this prototype; no production asset
registry or game renderer was changed for this revision.

`renderer.js` exports `loadCardAssets(ids)` and `assembleCard(face)`. Load first,
then pass the presentation face returned by `getGamepieceFace` or a preview
copy. `assembleCard` returns a Pixi 7 container in 300×420 logical coordinates.
Allow 32px above, 36px below, and 15px on each side for floating ornaments.
Scale the container to the desired card width. Destroy it with
`{ children: true }`; shared atlas and painting textures belong to the loader.

The frame and plates use nine-slice resizing with separately scaled corners.
The worker housing stretches only along its empty shaft, retaining the arch
and sculpted junction into the multiplier base. Identical pawns repeat inside.
Charge housings are single illustrated objects with one, two, or three circular
wells. Live trigger icons and segmented enamel fill occupy their recesses.
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
readability checks. Identical light/dark pawns indicate occupied/empty sockets;
they do not encode identity or specialist class. Detailed trigger event kinds
remain in the adjacent explanation; the
current illustrated symbols alone do not distinguish generation from use.

No simulation state, RNG, save schema, replay behavior, or authored definitions
are changed. Browser checks cover trigger switching, Charge multiplication,
reset, extremes, multiple outputs, and mobile overflow. Run `npm run verify`
for the repository checks and deployment build.
