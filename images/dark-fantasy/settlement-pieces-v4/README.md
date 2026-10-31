# Settlement paintings, limited-palette pass

## Current illustration guidelines

Apply these rules to every new or replacement Practice and Structure painting.
They combine the established composition direction with this version's pixel
treatment. A request naming only a card inherits these rules. Historical prompts
and existing images do not supersede them.

- **Composition:** use the narrative composition of **N. C. Wyeth, Dean
  Cornwell and Howard Pyle**: one decisive action, grouped figures, bold silhouettes, strong
  diagonals where the action supports them, environmental or architectural scale,
  broad calm value masses, and one focal area with the strongest light/contrast.
  These illustrators set the composition quality bar; dark fantasy is the subject
  matter, not a requirement to underexpose the painting. Vary viewpoint, gesture,
  grouping, setting and value arrangement across a set instead of repeating one
  architectural stage.
- **Anonymous figures:** all human faces must be completely **indiscernible**,
  including incidental figures and depicted faces on statues. Stage people from
  behind, under concealing hoods or helmets, at a distance, or in deep shadow.
  Neither eyes, noses, mouths nor recognizable facial portraits should resolve
  at full image size. Use posture, hands, tools, and silhouette to tell the story.
- **Practice framing:** opaque full-bleed **5:7 portrait**. Put the principal
  action, figures, and identifying tool/material in the **upper central 45%**.
  Keep the lower half subdued and quiet for card controls. Quiet means visible,
  coherent areas of rest: broad floor, terrain, water, fabric or architectural
  forms with restrained contrast and edges. It does not mean a blank black field,
  an artificial fade, or hiding the environment in darkness. Light and middle-value
  resting areas are valid when the focal action retains priority. Two or three figures
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

### Current class palettes

| Pool | Colors |
| --- | --- |
| Common and earlier cards | Warm stone, charcoal, umber, wheat, muted olive, and small subject accents |
| Scholar | Cobalt and lapis blue, navy, parchment and honey gold |
| Warrior | Vermilion and brick red, oxidized teal, dark iron plum |
| Merchant | Olive/forest green primary, copper-orange accent; subdued stone and ink shadows |
| Priest | Warm straw/butter yellow primary, rose pink accent; subdued stone and plum shadows |

Merchant green/copper-orange and Priest yellow/pink are Cam's accepted new class
directions. Priest yellow means the warm yellow fabric in the supplied chapel
reference, not cool pale lemon, ivory or the superseded ochre/aubergine scheme.
Keep primary and accent distinguishable as actual cloth, paint and material
surfaces, not just coloured lighting. Scholar/Warrior colours stay as above.
Warlord and Philosopher name vassals; Warrior and Scholar name population
specialties. Offer pool and population requirement do not change the palette
or imply current faction allegiance.

The palette is part of the illustration and should still read at the size of
the actual card. Broad quiet areas remain available for stock and timing
overlays. Historical shared edit briefs remain in `prompts.json`; the current rules above take precedence.

### Remnant and chaos subject direction

These themes supplement the composition, anonymity and pixel-treatment rules
above. Dark fantasy comes through what the institution does and how people live
around it. Do not use crushed blacks, blank foregrounds or a uniform brown/grey
tint as a substitute for narrative. Retain the class palette and visible areas
of rest throughout the image.

**Neutral remnant cards:** inherited, diminished civilisation rather than a clean
new settlement. Show repaired tools, exhausted resources, patched fabric,
overgrown or repurposed architecture, obsolete apparatus and neglected civic
spaces. Convey accumulated history, hardship and opportunities for renewal.
Keep the useful function legible; some inherited pieces are worth retaining.
Neutral does not automatically mean a chaos cult, a population sacrifice, or an
active enemy. Worn human-scale practices can be modest and functional beside
the more oppressive enemy institutions. Where appropriate, buried ribs, bone
foundations or old anonymous remains can reveal the same world's corrupted
history beneath a repaired or repurposed neutral institution, without assigning
it a specific patron. This direction guides future work; it
does not itself request replacement of the existing neutral review paintings.

**Chaos enemy cards:** decayed versions of the player institutions, with coercion,
corruption, spiritual surrender, predatory wealth or knowledge divorced from
life made concrete in the scene. Frontier remnants hint at a patron; provincial
institutions distort a useful practice; high-rank capitals can take on the form
of an inhabited, inhuman god-body. Avoid pasting a huge crest onto an otherwise
ordinary building. A small diegetic cult mark is allowed for these requested
subjects, as an exception to the ordinary no-symbol illustration rule. Cult
identity is distinct from per-instance faction allegiance.

| Enemy class | Proposed patron | Distinct silhouette and narrative |
| --- | --- | --- |
| Warlord | Unbending Crown | Three rigid upright spear-prongs joined by one closed band; armoured symmetry and enforced obedience |
| Merchant | Last Creditor | Asymmetric hooked grasp enclosing one solid coin/disc; enclosing mechanisms, possession and appetite |
| Priest | Hollow Sun | Empty ring with three falling rays, never a pupil or eye; parasitic sanctity and surrender |
| Philosopher | Unfinished Index | Broad open book with one hooked binding spine; folded architecture, classification and erasure |

These patron names remain prototype proposals. Develop their distinct physical
grammar instead of giving every class generic tentacles, eyes or skull piles.
Cam's stronger reference is otherworldly corpse architecture, evoking the
foundational corruption he described from Berserk: bodies are part of the
institution's very construction, not merely scattered decoration. Ossified
spines can bind walls, ribs become vaults or grasping mechanisms, and recognisable
anonymous corpses can be fused into foundations, presses or ceremonial apparatus.
Make that structural relationship visible in the staging. Retain each class's
own patron shape and useful function; avoid making all four classes the same
bone cathedral. Remains can be mummified, skeletal, wrapped or partially buried,
with faces concealed or turned away. Rot and material failure should be concrete,
not replaced with a general gloomy tint. Especially at higher ranks, the built
environment can feel assembled from generations of the dead. This inherited
construction does not itself add an ongoing population-consumption mechanic.
For population-consuming cards, ritual processing, covered remains and the
contrast between a victim and the useful output can communicate the cost.
Coercion, rot, neglected graves and anonymous shrouded bodies may support an
appropriate subject without resolving faces or relying on graphic injury.
Do not invent population costs through imagery on cards that lack them. Keep
the actual conversion, production or other function recognisable. The stronger
capital imagery should still read at card size, with one decisive action and
coherent lower-contrast surroundings.

### Prompt template

Include these constraints in the prompt sent to the image tool, replacing the
bracketed fields with the card's actual subject, pool palette, and framing:

> One original opaque full-bleed [aspect ratio] illustration for [card name], a
> medieval dark-fantasy [Practice or Structure] card. Narrative composition in
> the spirit of N. C. Wyeth, Dean Cornwell and Howard Pyle: one decisive [action or building],
> bold silhouettes, grouped figures, environmental scale, broad calm value masses,
> and one focal light/contrast. [Practice: principal action, figures and key object
> in the upper central 45%; lower half contains visible, coherent environmental
> forms at lower contrast for overlays, never blank or faded to black. Structure: building
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

The local keywords prototype adds eight original Bronze Practice paintings.
[Their provenance](bronze-keywords-prompts.json) records each generation and
overlay-framing correction; [the card briefs](../../../docs/prototypes/keywords-classes/bronze-cards/README.md)
explain the scenes' gameplay roles. Accepted sources use the same registered
WebP/settlement-pieces atlas path as the existing pool.

The current Observation painting is a fresh composition recorded in
[`observation-prompts.json`](observation-prompts.json). That record supersedes
the earlier Observation brief; shared historical prompt records remain below
as provenance.

This version restyles the 155 third-pass paintings while preserving their
compositions, subjects, grouped anonymous figures, architectural scale, and
small-card focal points. The production art was edited one scene at a time
with the built-in ImageGen tool. Each edit used its matching `../settlement-pieces-v3/`
painting as the composition target and `ai/References/Card Art Style/l5.png`
and `l6.png` as references for hand-placed pixel clusters, hard edges,
selective dithering, and restricted palettes. The reference subjects were
excluded from the edits.

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
