# Settlement paintings, limited-palette pass

## Current illustration guidelines

Apply these rules to every new or replacement Practice and Structure painting.
They combine the established composition direction with this version's pixel
treatment. A request naming only a card inherits these rules. Historical prompts
and existing images do not supersede them.

- **Composition:** use the narrative composition of **N. C. Wyeth and Dean
  Cornwell**: one decisive action, grouped figures, bold silhouettes, strong
  diagonals where the action supports them, environmental or architectural scale,
  broad calm value masses, and one focal area with the strongest light/contrast.
- **Anonymous figures:** all human faces must be completely **indiscernible**,
  including incidental figures and depicted faces on statues. Stage people from
  behind, under concealing hoods or helmets, at a distance, or in deep shadow.
  Neither eyes, noses, mouths nor recognizable facial portraits should resolve
  at full image size. Use posture, hands, tools, and silhouette to tell the story.
- **Practice framing:** opaque full-bleed **5:7 portrait**. Put the principal
  action, figures, and identifying tool/material in the **upper central 45%**.
  Keep the lower half subdued and quiet for card controls. Two or three figures
  usually establish the action; keep their scale subordinate to the environment.
- **Structure framing:** the named building is the dominant subject, with a
  simple silhouette occupying the central **75%** and tiny anonymous figures
  for scale. Use **3:4 portrait** for one cell, **3:2 landscape** for two cells,
  and **9:4 landscape** for three cells.
- **Surface and palette:** retain the current hand-placed pixel clusters, hard
  edges, selective dithering, and restricted palette. Inspect
  [l5.png](../../../ai/References/Card%20Art%20Style/l5.png) and
  [l6.png](../../../ai/References/Card%20Art%20Style/l6.png) as surface-treatment
  references; keep the narrative composition above. Use the pool's palette below.
- **Clarity:** the action or building must read at roughly **70x100 pixels**.
  Produce illustration only, with no text, legible writing, symbols, UI, frames,
  decorative borders, vignettes, or distracting tiny clutter.

### Prompt template

Include these constraints in the prompt sent to the image tool, replacing the
bracketed fields with the card's actual subject, pool palette, and framing:

> One original opaque full-bleed [aspect ratio] illustration for [card name], a
> medieval dark-fantasy [Practice or Structure] card. Narrative composition in
> the spirit of N. C. Wyeth and Dean Cornwell: one decisive [action or building],
> bold silhouettes, grouped figures, environmental scale, broad calm value masses,
> and one focal light/contrast. [Practice: principal action, figures and key object
> in the upper central 45%; lower half subdued for overlays. Structure: building
> dominates the central 75%; tiny figures establish scale.] All human and depicted
> faces are completely indiscernible, staged from behind, distant, concealed, or
> in deep shadow; no readable facial features. Hand-placed pixel clusters, hard
> edges, selective dithering, restricted [pool palette], matching the inspected
> surface references. Clear at 70x100 pixels. Illustration only: no text, writing,
> symbols, interface, frame, border, vignette, or tiny clutter. Subject: [one
> concrete scene expressing the card's behavior].

Review the output against these rules at full size and card size before accepting
it. Facelessness and composition are acceptance criteria, not optional prompt
adjectives. The generation workflow is
[illustrate-gamepiece](../../../.agents/skills/illustrate-gamepiece/SKILL.md).

## Existing production pass

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
