# Development Lab model adapters

`fixtures.js` owns deterministic, five-slot scenarios shared by the Museum and tests.
`sandbox.js` isolates explicit developer edits and resolved-effect experiments. Every
edit is transactional and passes the normal deserialize validation before commit.
`catalogue.js` reads the active run's registries; it owns no content definitions.
No module runs work at import time or adds rules to the simulation.
`catalogue-summary.js` inventories base Stock recipes from filtered catalogue
entries without evaluating or changing a settlement. It groups exact produced
trait sets and accepted input alternatives by activation timing, preserves
seasonal/activation-specific amounts, marks variable additions, and reports
construction totals separately. `compareLabStock` projects that inventory to one
row per trait, with independent produced/consumed/required/construction sources.
Each source total includes a distinct-card count by card key, independent of
quantities, multiple effects or repeated activations.
All timings collapses each card's differing activations to a min/max yield range;
a selected timing uses only its own amounts. Alternative input amounts remain
separate from mandatory trait costs. Multi-trait output contributes to each trait
row, never an economy-wide grand total. It consumes the projected entries supplied by
Zoo, so Live and edited modes use the same calculation.

`node-sandbox.js` authors a disposable dummy/settlement fixture for the Gym's
real node modal. Refresh reseeds content streams while keeping the authored
world, portrait and topology fixed. Node entry and all interactions use normal
Life Map rules; the independent controller validates cloned transactions.

`lifegraph.js` prepares isolated class/Research contexts, opens generated nodes or
single-type experiments and diagnoses complete-route coverage and actual shop
eligibility. It calls the shared shop candidate selector without RNG or writes.
Workbench review/export v1 is independent of GameState. Runs capture the pooled
design in generator config v10; baseline and pooled rules both use the topology
substream. Review storage is never consulted by a running simulation or replay.
Choice review uses real isolated node entry to show seeded effects and costs;
absolute per-choice presets and shared type/quality shop prices live in
`model/life-map-balance.js` and are captured before a run starts.

`card-review.js` defines the independent review schema, editable definition
values, non-mutating draft projection and export/import data. Imports validate
persisted drafts against their original baselines and discard derived export
fields, keeping removed cards and build conflicts reviewable. Storage belongs to the
controller. Its schema is deliberately independent of GameState so reviews
survive app builds, including changes to game-save schemas.
`applyCardReviews` clones a supplied registry, projects edited cards onto its
current definitions and reports missing cards or conflicting field shapes.
The controller uses this for Zoo display and validated new-game snapshots;
simulation and replay never read review storage.
Construction cycles and Stock cost collections use that same review document.
Positive whole amounts/cycles and nonempty recognized trait alternatives are
validated before storage. Game config captures variable recipe row counts so
added/removed costs survive new-game initialization and save/replay.
Stock trait collections and schedule/seasonal-yield edits use the same v1 review
document as primitive edits. Collection edits replace overlapping leaf edits;
subsequent leaf edits update their saved collection. Schedule source icons derive
from the edited activation without replacing unrelated definition fields.
Card locks use boolean `locked` edits in the same stable review document. Runs
capture that optional definition field; absent flags mean unlocked. Shop pools
and Stock Supply generation read only the run snapshot, never review storage.

- `quality-filter.js` — bounds use the shared Bronze < Silver < Gold < Diamond order; a missing quality matches only when no quality filter is active.
