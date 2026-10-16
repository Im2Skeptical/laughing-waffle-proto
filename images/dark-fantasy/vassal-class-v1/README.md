# Named Vassal class art

Production sources extracted from the approved original paintings in
`../vassal-chrome-prototype/components.png` and `portraits.png`. The prototype
workbench keeps those originals. No new portraits are generated in this pass.

    python images/dark-fantasy/vassal-class-v1/build.py
    npm run build:sprites -- vassal-class

`build.py` records the original six crop rectangles. TexturePacker packs only
manifest-listed PNGs, retaining their original dimensions and transparent
padding, with disabled rotation/trim and 2px extrusion. Runtime code requests
named frames through `chronicle-art.js`; it never loads the prototype sheets.
The atlas shares nearest filtering, bounded retry and GPU preparation with the
rest of the game art.
