# Tooltip workbench (prototype)

Run `npm run preview:tooltips`, then open
<http://localhost:5181/images/dark-fantasy/tooltip-prototype/>.
The existing `npm run preview:cards` server serves this path too.

Question: can a Bazaar-style name plaque, class emblem and tag pills teach our
pieces at readable sizes, locally and in a focused inspection? The two modes
are switchable with `?variant=local` / `?variant=inspection`; the layout follows
the selected reference rather than exploring unrelated visual directions.

This is a workshop, separate from the game. Do not integrate it until the user
chooses the treatment. All edits live in memory; share URLs preserve the selected
card, mode and viewport preset, not edited copy. Reset restores authored values
and workshop copy. Nothing is written to saves, definitions or localStorage.

Use the controls to select a simple/complex piece, shop/settlement context,
desktop/landscape phone/portrait phone viewport, source position (three offers or
five Practice slots), name and tags, primary and extra
rules, body size, card zoom, tooltip width, dimming and proposed meter terminology.
Progress/Work/Momentum are presentation experiments for the existing Charge
mechanic, not simulation renames. Bracketed words become keyword links in full
inspection. Secondary text is empty unless the example has an additional
requirement/effect. Editable copy is illustrative and can contradict the card.

Local preview enlarges one source card at its location and places the rules on
the available side. Click it or Inspect to enter a screen-wide dimmed inspection.
The top tier dropdown previews the actual tier face; owned Bronze stays unchanged.
Base Stock capacity adds the tier index, matching the current Stock helper;
other face values come from getGamepieceFace. Workers and meter fill are preview
properties only. Full inspection includes reminders for each displayed Stock
trait, trigger, output and worker symbol. Keywords open a pinnable explanation;
nested keywords replace it with Back history. Escape returns from the explanation,
then closes inspection. Preview fullscreen hides workshop controls at actual
browser/device size; Escape exits it.

The reference PNGs are the user's original screenshots, copied without editing.
DOM overlays cover the old tooltip and selected source faces. The board is a fixed
context image, not a running simulation. Source positions follow those screenshots;
phone mode reflows the inspector without scaling down its rules text. Portrait is
an exploratory adaptation; the game itself currently uses landscape on phones.

Card paintings and chrome reuse the adjacent card-chrome-prototype renderer and
resource atlas when **Prototype graphics** is selected. **Source graphics** is
the default and uses the current game's `addSettlementPiece` renderer for the
source, zoom and every inspection tier. The selection survives URL refresh.
The same top-right Fullscreen button enters and exits a device-sized landscape
preview, using the game display request and a landscape fallback if needed.
No new generated raster art. The game does not import this page.
Pages bundles it separately, like the card workbench. Do not modify or revert
concurrent card-frame work while iterating this page.

Review at 1440x900, 844x390, 667x375 and 390x844: source zoom and edge placement,
long Alchemy/War Council rules, at least 18px body text, tier changes preserving
the owned card, matching icon reminders, nested terms/Back/pin, Escape, editable
copy/reset, and zero horizontal document overflow. `npm run verify` covers build
and repository checks. Simulation state, RNG, schemas and replay remain untouched.
