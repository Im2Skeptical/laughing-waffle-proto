# Settlement paintings, limited-palette pass

This version restyles the 155 third-pass paintings while preserving their
compositions, subjects, grouped anonymous figures, architectural scale, and
small-card focal points. The production art was edited one scene at a time
with the built-in ImageGen tool. Each edit used its matching `../settlement-pieces-v3/`
painting as the composition target and `ai/References/Card Art Style/l5.png`
and `l6.png` as references for hand-placed pixel clusters, hard edges,
selective dithering, and restricted palettes. The reference subjects were
excluded from the edits.

Palette families:

| Pool | Colors |
| --- | --- |
| Common and earlier cards | Warm stone, charcoal, umber, wheat, muted olive, and small subject accents |
| Scholar | Cobalt and lapis blue, navy, parchment and honey gold |
| Warrior | Vermilion and brick red, oxidized teal, dark iron plum |

The palette is part of the illustration and should still read at the size of
the actual card. Broad quiet areas remain available for stock and timing
overlays. See `prompts.json` for the shared edit brief and palette rules.

## CivContent 2.6 additions

The expanded runtime pool adds 59 original paintings: 15 Practices and 44
Structures. The other 128 runtime paintings and the earlier-card inventory
are preserved byte for byte. Each addition was generated separately with the
built-in ImageGen tool, using the existing paintings and the same two pixel-art
style references. `civcontent-2.6-prompts.json` records every scene, palette,
composition and reference. Source images are opaque lossless WebP; the runtime
uses the existing TexturePacker scale and nearest-neighbor texture treatment.

Practice compositions use 5:7 portraits. One-cell Structures use 3:4 portraits,
two-cell Structures 3:2 landscapes, and three-cell Structures 9:4 landscapes.
The asset check requires a dedicated registered and packed painting for every
runtime Practice and Structure.
