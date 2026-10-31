# Decaying institutions: palette and enemy-rim direction study

Cam rejected the green/copper and violet/pink palettes, liked the more oppressive
subject matter and asked to retain the compositional constraints. This first pass
is preserved for comparison; [six palette alternatives](../full-map-enemy-palette-prototype/README.md)
provide the current follow-up. None of these colours are an approved class spec.

Question: can Merchant and Priest read as distinct classes at card size, while
enemy institutions look oppressive, corrupt and inherited rather than player-built?

This is a four-painting direction study in the existing 130-card review, plus one
shared illustrated enemy rim. The original 130 definitions and paintings remain
unchanged. No simulation, registry, schema, RNG or replay changes are involved.

## Proposed visual language

| Class | Primary | Accent | Institutional harm |
| --- | --- | --- | --- |
| Warlord | Red | Teal | Rationing, coercion and military hierarchy; existing art retained |
| Philosopher | Blue | Gold | Classification and bureaucracy detached from people; existing art retained |
| Merchant | Bottle / malachite green | Copper orange | Intact private abundance above deprivation |
| Priest | Violet / aubergine | Pale rose pink | Immaculate ceremony above abandoned funeral courts |

Merchant green/orange and Priest violet/pink are proposals, not an established
production palette. Their class colours should also work for eventual player
versions; corruption comes from the depicted action and setting. Broad colour
masses must survive small-card display rather than depending on tiny accents.

Conspicuous Feasts and Private Reservoir test the Merchant treatment. Grand
Jubilee and Gilded Basilica test the Priest treatment. Oppression is visible in
the relationship between the institution and people: food discarded behind locked
grilles, water maintained above a thirsty quarter, payments continuing beside
unburied bodies. Mould, rot, wrapped bodies and anonymous ribcages carry despair.
This is a proposal for the remaining enemy paintings, not a completed 80-card
repaint. The original neutral and player content is preserved.

The enemy rim uses black iron, pale bone clasps and rusted chains. Its nine-sliced
corners and plain rail preserve existing card geometry. It identifies a decayed
institution; it does **not** encode the installed instance's current allegiance.
A future allegiance emblem must remain a separate changeable marker. No allegiance
symbol or worker-allegiance rule is settled or implemented in this art pass.

## Review in the real game renderer

Run `npm start`, then open
`#/dev/prototypes?study=full-map-content&look=decay&samples=1`.
Use Enemy appearance to compare four combinations: original, paintings only,
frame only and combined. The four-study checkbox limits the existing catalogue;
pool, type, placement, rules inspection and session notes remain available.
Frame-only or combined applies the enemy rim to all 80 enemy candidates when the
four-study filter is off. Player and neutral faces retain their brass rim.

The shared renderer accepts optional view-only `illustrationId`, `rimTexture`
and `rimCornerSize` (20 in this study versus the default 12)
on disposable faces. These are only supplied by this prototype. Defaults preserve
all existing player rendering; no new fields enter game definitions or saves.

## Pillar assessment

- Pillar 3 (visible civilisational transformation): serves the contrast between
  an inherited oppressive institution and its renewal. Risk: ubiquitous death
  makes every place seem ruined beyond use; keep the apparatus visibly functional.
- Pillar 1 (engines): useful mechanisms remain recognisable beneath corruption;
  illustration must not imply new card effects or hidden death costs.
- Pillar 2 (choices under constraints): a clear inherited visual family helps
  identify replacement opportunities. A decorated rim must not conceal fittings.
- Pillar 4 (projection): symbols, amounts and inspection remain unchanged and
  readable; excessive rot, chains or edge detail would strain this pillar.
- Pillar 5 (legacy): surviving institutions show accumulated history visually;
  this study adds no inheritance system.

## Art and provenance

Built-in `image_gen.imagegen` generated one asset per call. `prompts.json` records
exact first briefs, references and accepted paths; `corrections.json` records
targeted corrections, and `generation-results.json` records generated source paths
and accepted hashes. Rejected source versions are retained in ignored artifacts.
The current art guide and inspected l5/l6 references govern pixel treatment;
the existing structure frame supplies only the rim's structural reference.

Accepted paintings live in `art/direction_fe_*.png`; `art/enemy-rim.png` has genuine
alpha transparency in its aperture and exterior. The separate on-demand atlas is
packed with `node scripts/build-sprite-sheets.mjs full-map-enemy-direction-prototype`.

Check actual faces and full inspection in desktop and phone portrait/landscape;
compare all four appearance modes, verify the input state is unchanged and all
130 candidates still exist. Run docs, architecture, source, assets and build
checks. No PR, merge, publication or promotion to gameplay is authorised.

Verified locally: all four studies differ across the four appearance modes;
all 130 candidates remain available; 80 enemy rims and no neutral/player rim
overrides; the disposable projection leaves state byte-identical and preserves
all rules/face values. All four full inspections, a Warlord frame inspection,
and phone portrait/landscape pass without browser errors or horizontal overflow.
The rim's aperture and exterior have alpha zero. Accepted paintings were checked
at full size and on the actual faces. Evidence: ignored
`artifacts/full-map-enemy-direction/`; check and build commands passed.
