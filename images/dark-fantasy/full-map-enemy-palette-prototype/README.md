# Enemy class palette alternatives

Question: which Merchant and Priest primary/accent pairs hold up beside Warrior
red/teal and Scholar blue/gold while keeping the current composition constraints?

Cam rejected the first green/copper and violet/pink palette pass, liked its
oppressive subject matter, and reiterated that the compositional rules still
apply. The first follow-up supplied twelve paintings for six proposed pairs.
Cam then requested more green Merchant and yellow Priest variations: twelve
additional paintings bring this study to twenty-four paintings for twelve pairs,
all alternatives for the same four cards. No palette is approved.
All original 130 definitions and paintings, plus the first direction pass, remain.

| ID | Class | Primary | Accent |
| --- | --- | --- | --- |
| g1 | Merchant | Deep forest green | Antique gold |
| g2 | Merchant | Emerald green | Wine red |
| g3 | Merchant | Yellow-olive green | Ink blue-black |
| y1 | Priest | Saffron yellow | Charcoal black |
| y2 | Priest | Lemon yellow | Deep plum |
| y3 | Priest | Pale wax yellow | Dark oxblood |
| m1 | Merchant | Emerald | Warm ivory |
| m2 | Merchant | Saffron ochre | Deep aubergine |
| m3 | Merchant | Burnt orange | Indigo |
| p1 | Priest | Imperial violet | Bone white |
| p2 | Priest | Warm ivory | Dark oxblood |
| p3 | Priest | Wine / mulberry | Desaturated mint |

These are local material colours, with robes, cloth, enamel and trim carrying
the identity. Stone, sky and shadows retain broad neutral value masses. The
previous all-scene colour wash is not the template. Shadows and highlights still
need enough separation for the accent to survive thumbnail display.

## Composition and content

Conspicuous Feasts and Grand Jubilee have fresh 5:7 composition masters. Two
small completely anonymous figures, their complete decisive action and key
materials occupy the upper central 45%. Corpse bundles sit beside that action
on the same high ledge, rather than competing from the foreground. The lower
half is subdued architecture: one large recessed shadowed arch and broad piers,
with no secondary action or bright foreground objects. Architecture remains larger than the figures.
Merchant waste and conditional religious dues preserve the improved corrupt
institution content; the card's gameplay rules have not changed.

Private Reservoir remains a 3:2 two-cell Structure and Gilded Basilica a 9:4
three-cell Structure. The building dominates the central 75%, with tiny hooded
figures and fully wrapped adult remains for scale and narrative. They preserve
the private water supply, barred outlet, functioning ritual entrance and
abandoned burial field from the previous direction study.

Each remaining palette is a built-in image edit of its corresponding accepted
master, locking camera, figure scale, action, silhouette, objects and quiet areas.
The Wyeth/Cornwell narrative composition, hard pixel clusters, selective
dithering, anonymous faces and small-card clarity remain acceptance criteria.
All art is opaque and full bleed, without writing, UI or decorative borders.
The existing illustrated enemy rim is held constant for comparison.

## Review

Run `npm start` and open
`#/dev/prototypes?study=full-map-content&look=palettes&samples=1`.
For the green/yellow follow-up, append `&merchant=g1&priest=y1`.
Merchant palette and Priest palette switch independently. Existing Warrior and
Scholar cards are available in the reference disclosure, with full inspection.
All specimens use the real Zoo renderer and fittings. Earlier appearance modes,
normal catalogue filters and session review notes remain available.

The optional URL parameters `merchant=m1` / `m2` / `m3` and `priest=p1` / `p2` /
`p3`, plus the new Merchant `g1` / `g2` / `g3` and Priest `y1` / `y2` / `y3`,
select the opening combination. Selections live in memory; no new browser
storage or save fields are introduced. The only face override is the existing
view-only illustration ID. Enemy rims retain the previous art-study settings.

## Pillar assessment

- Pillar 3: distinct class identity and visible renewal serve civilisational
  transformation. Overly attractive ceremony can still weaken the intended decay.
- Pillar 4: quiet artwork leaves amounts and fittings readable; dramatic
  foreground clutter and monochrome lighting would strain cause/effect clarity.
- Pillars 1 and 2: card rules, space, costs and engine choices are unchanged.
  Art must not imply extra outputs, deaths or locked actions.
- Pillar 5: inherited institutions convey accumulated history visually only;
  no legacy behavior is added.

## Provenance and checks

Built-in `image_gen.imagegen` only, one call per asset. `prompts.json` records the
exact prompts, palette specifications, master references and output paths;
`composition-refinements.json` records the accepted shadowed-arch refinements;
`green-yellow-prompts.json` records the additional twelve colour studies, and
`green-yellow-corrections.json` keeps yellow primary in the pale-yellow Basilica.
`generation-results.json` records generated sources and accepted SHA-256 values.
Sources are `art/palette_<scheme>_<card>.png`; the new on-demand atlas is packed
with `node scripts/build-sprite-sheets.mjs full-map-enemy-palette-prototype`.
No generated reference sheet or alternate simulation registry is used.

Inspect every painting at full size for facial anonymity, palette separation,
upper-45% Practice action, quiet lower halves and Structure dominance. Then inspect
all twelve actual faces, both reference cards, every palette selector and phone
portrait/landscape. Check the 130-card catalogue and byte-identical input state.
Run docs, architecture, source, assets and build checks. Work remains on the
throwaway branch, with no PR, publication or gameplay promotion.

Verified for the first palette pass: twelve distinct real rendered paintings; fourteen full
inspections including both class references; all nine palette combinations
project without mutating the input state or rules. Independent selectors, old
appearance modes, direct study links and the 130-card catalogue pass. Phone
portrait/landscape has no horizontal overflow or browser errors. All accepted
paintings were inspected at full size and on actual card faces. Docs,
architecture, source reachability, assets and build checks pass. Evidence lives
in ignored `artifacts/full-map-enemy-palettes/`.

Green/yellow follow-up verified separately: twelve new distinct real faces,
fourteen full inspections including the two reference cards, all thirty-six
old/new palette combinations projected without changing input state or rules,
independent selectors, direct links, earlier appearance modes and all 130 cards.
Phone portrait/landscape has no horizontal overflow or browser errors. The prior
twelve source paintings retain their recorded hashes. All twelve new sources
were inspected at full size; the pale-yellow Basilica was corrected to keep
yellow primary across its cloth fields. Docs, architecture, source reachability,
assets and build checks pass. Evidence: ignored `artifacts/full-map-green-yellow/`.
