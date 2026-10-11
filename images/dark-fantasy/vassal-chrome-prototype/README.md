# Vassal & founder workbench

Run `npm run preview:vassals`, then open
<http://localhost:5182/images/dark-fantasy/vassal-chrome-prototype/>.
An existing root development server can serve the same path. The Pages build
copies the assets and bundles this study separately from the game.

This follows the illustrated card workbench: editable presentation fixtures,
layered painted assets, comparisons at game size, transparency and PNG export.
Keep it inside this workbench until the user approves production integration.

## Mechanics-first picker pass (October 11)

Open [the forced phone-landscape picker](index.html?study=founder&phone=true&guided=false&variant=A).
The picker, its layout switcher and rule popups are rendered in Pixi on the
existing game-screen reference. Portrait browser viewports rotate the whole
game canvas into landscape; no responsive web-card layout substitutes for it.

**A: focused dossier** puts the class portrait beside its stat exchange and
concrete abilities. **B: class comparison** shows both founders and exchanges
together. Tap the A/B control inside the canvas to switch. Arrow keys browse
founders; Alt + arrows switch layouts. Workbench exits the phone review mode.

The focused dossier is the chosen direction. Its latest pass removes the
Choose your founder heading/instruction and the entire founding-action block,
including its outcome and costs. A larger class-framed portrait balances the
stat exchange and abilities. Class identity is a short Scholar/Warrior label.
Review [Philosopher](index.html?study=founder&phone=true&guided=false&variant=A&founder=1)
and [Warlord](index.html?study=founder&phone=true&guided=false&variant=A&founder=0)
in the same forced landscape format.

Scholar exchanges Cunning for Ingenuity; Warrior exchanges Intelligence for
Prowess. Lost effects are visible alongside the replacement. Commission rewards,
Prestige-free but time-consuming rerolls, Prestige-held Retinue and a numeric
risk-reward example are explicit. Tap stats and abilities for their detailed
rules. A unified stat panel now shows all four default names plus the class stat:
five visible names, four active stats. The replaced default is grey and crossed out,
with a REMOVED label. Retained defaults stay concise and can be tapped for rules.
The highlighted class-stat subsection describes both effects per point and the
effect lost with the replaced default. Scholar loses Cunning's extra node Prestige;
Warrior loses Intelligence's Prestige-cost discount. The earlier three stat-box
treatments and their workshop controls are superseded. No founder stat values are
invented, and there is no retained-stat button.
Flavour is one muted italic line. The earlier successor-drawer and frame
assemblies remain available in the workbench.

## Studies

- **Founder menu:** a focused dossier or paired comparison, arrows,
  swipe, horizontal/Shift-scroll, keyboard arrows and a thumbnail rail. Compare
  4, 6 or 8 slots. Warlord and Philosopher explain their stat exchanges and class
  abilities. Extra slots are black silhouettes with question marks.
  The optional first-run Scholar lock is a proposal; its explanation remains
  inspectable. No unlock rule is invented for unknown founders.
- **Regular vassal:** compare identity first, signature first and full stat
  comparison. Edit the name, starting region, Age, Prestige, class stats,
  signature title/explanation and body size. Examples come from the existing
  signature definitions. Long copy raises a fit warning rather than reducing
  the font. The three-candidate drawer shows an example established tradition.
- **Class frames:** compare the Warrior's sword ring and the Scholar's book
  and scroll arch, with an optional separate founder crest. Swap the same two
  identities between class clothing. Export the empty hollow frame or its
  assembly with a portrait.

The default surface places founder/regular studies on the supplied game screen,
in the fixed 2424×1080 coordinate system. It retains the existing HUD, map,
navigation and time-control arrangement. Enlarged assembly mode is for editing
details. The screenshot is a fixed reference, not live civilization state.
Class portraits demonstrate independent identity and clothing; they are not a
procedural portrait generator.

Save PNG exports the full 2424×1080 game composition regardless of the browser
size. Candidate and frame assemblies export at twice their logical resolution.
Empty frames retain their transparent apertures.

URLs preserve `study`, `class`, `layout`, `founder`, `slots`, `guided`, `variant`
and `phone`.
Other property edits are ephemeral; Reset restores that study's fixture.
Confirmation only records a local preview message. It never enters a real node.

## Layers and boundaries

`components.png` and `portraits.png` are original 1254×1254 ImageGen outputs,
copied without raster modification. `components.json` supplies rectangles for
the hollow Warrior/Scholar frames, detachable founder crest and dark silhouette.
`prompts.json` records generation prompts. `game-screen.png` is the supplied
in-game reference screenshot.

Read this file before `study.js`, which owns only local form state and Pixi
applications. `renderer.js` owns preview assemblies; it reuses the native relic
panel painter. It exports `loadVassalAssets`, `assemblePortrait`,
`assembleRegular`, `assembleFounder` and `assembleGame`. Shared textures belong
to the loader; destroy containers with `{ children: true }`.

Founding and signature definitions are read; class-rule copy is an isolated
presentation fixture. Simulation state, RNG,
serialization schemas, time and replay are untouched. The production renderer
does not import this workbench. Its source imports are bundled independently for
Pages; the asset manifest registers only the standalone preview images.

## Verification

Run `npm run check:architecture`, `npm run check:assets`, `npm run build` and
`npm run verify`. In the browser, check all six class/layout combinations;
both founder layouts at 844×390; portrait rotation at 390×844; Pixi taps on stat
all five stat names, Retinue, risk rewards, Commissions and rerolls;
overflow warnings and reset; locked/open Scholar and unavailable silhouettes;
4/6/8-slot wrapping; keyboard arrows outside fields; arrows/thumbnails/swipe;
PNG dimensions and transparent apertures; repeated tab changes without growing
canvas counts; and page overflow at 1280×800, 844×390 and 390×844.
