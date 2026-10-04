# Structure card and tooltip workbench (prototype)

Run `npm run preview:structures`, then open
<http://localhost:5183/images/dark-fantasy/structure-chrome-prototype/>.
Also linked from **Development Lab → Prototypes → Structures & tooltips**.
The Pages build bundles this isolated entry separately; the live game never
imports its renderer. Keep the treatment here until production integration
is explicitly requested.

Question: which face communicates ongoing capacity best at construction-strip
size, and does the Practice reading flow work for Structures?

- `?variant=A`: illustrated plaque, closest to the Practice visual language.
- `?variant=B`: capacity ledger, with large values and the matching Stock scope.
- `?variant=C`: inset seal, preserving more uninterrupted painting.

The bottom switcher and Left/Right keys cycle treatments. Selects keep their
native keyboard input. `card` and `context` URL parameters preserve the selected
definition and settlement/offer screen on refresh, including a Pages subpath.

Hover or focus a construction card for the quick read. Tap to pin it, then select
its title to open inspection: card, shared rules, and a separate symbol glossary.
Escape closes the tooltip or inspection. The persistent quick-read study beneath
the mockup also opens inspection. Mobile wraps the strip into three/four-cell rows and
stacks inspection; these are design mockups, not a proposed live responsive layout.

Try Mud House and Longhouse for Housing, Granary and Storehouse for Stock scope,
Archive for two-cell footprint and Scholar requirements, and Barracks for a
non-capacity effect. Quality uplift previews 25% increments; Reset clears uplift,
requirements and staged offers. Stage build is an in-memory example decision.

Paintings reuse the original v4 assets. The Housing roof/person and Stock crate
symbols are code-drawn SVGs with a small plus marker; values stay live text.
No new raster assets are required. Tooltip hierarchy follows Practices: class /
type / tags, inspectable title, ongoing rules, requirements, flavour. Capacity
glossary explanations stay out of the quick read.

Values read the runtime definitions. Housing rounds down per Structure; Stock
modifiers show their contributions (the runtime rounds the final host capacity
down after summing bonuses). Candidate base bonuses and history caps do not gain
quality uplift. Storehouse uses the current runtime Construction scope; its
authored trait-choice hook is deferred. Secondary gameplay hooks are not invented.
All scene populations, arrangements and shop offers are example data.

Simulation state, RNG, schemas, replay and live Views are untouched. Controls
and staging have no persistence or model mutations. `window.structureWorkbench`
exposes the small presentation state for probes. Check mobile/desktop overflow,
all three treatments, refresh, quick read / inspection / Escape, Scholar gating,
quality/reset and offer staging. `npm run verify` checks packaging and invariants;
`npm run probe:prototypes` covers the deployed workbench directory and entry.
