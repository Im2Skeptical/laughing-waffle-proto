---
name: illustrate-gamepiece
description: "Generate or replace illustrations for this repository's Practice and Structure cards, including art needed for a new gamepiece. Use for plain requests such as 'please generate a new illustration for the observation practice'; the user does not need to mention the art guidelines. Gameplay tuning and UI layout alone do not use this skill."
---

# Illustrate a gamepiece

Read [the current illustration guidelines](../../../images/dark-fantasy/settlement-pieces-v4/README.md#current-illustration-guidelines)
before choosing references or drafting a prompt. That section is the source of
truth for composition, anonymous figures, palette, and framing. Archived prompts
and individual existing paintings are provenance or references, not replacements
for those rules.

## Subject and references

Resolve the named Practice or Structure in
`src/defs/gamepieces/detailed-settlement-defs.js` with a targeted lookup. Read its
label, effect, pool, and Structure footprint to choose one recognizable action or
building. An art request does not authorize changing its gameplay definition.

Inspect the requested card's existing painting, the guidelines' style references,
and a relevant current painting when using them as inputs. Treat a replacement
request as a fresh composition unless the user asks to preserve the scene.
Separate composition references from pixel-treatment references in the prompt;
an existing image's visible faces must not carry over into the result.

## Prompt and generation

Use the available imagegen skill and built-in image generation tool for the
raster asset. Repository art direction supplements that tool workflow. Before
the tool call, check that the assembled prompt explicitly includes every applicable
rule in **Current illustration guidelines**: Wyeth/Cornwell composition,
indiscernible faces, overlay-safe framing, the pool palette, and pixel treatment.
Use the guide's prompt template with a subject-specific scene; do not depend on
the image tool reading repository files or on the user repeating the rules.

## Review and integration

Inspect the generated image at full size for discernible facial features and at
card size for silhouette, focal action, palette, and room for overlays. A polished
image with a readable face or misplaced focal action needs correction before it
is accepted. Use a targeted retry describing the failed criterion.

For a requested replacement, preserve the old source as an ignored review artifact
until the new image passes. Save accepted artwork under its existing named source
path in `images/dark-fantasy/settlement-pieces-v4/`; add a new named source only for
a new card. Record the exact prompt, references, tool, and output path beside the
source art. Preserve prior prompt records as provenance and identify the current
record so a future request does not reuse a superseded brief.

Register new assets in `images/asset-manifest.json` and repack the affected atlas
group using its settings in `scripts/build-sprite-sheets.mjs`. Verify
`npm run check:docs`, `npm run check:assets`, and `npm run build`; inspect the
actual rendered card using the repository's browser tools. Follow `AGENTS.md`
for task verification and publishing. Simulation state, RNG, schemas, and replay
remain unchanged for illustration-only work.
