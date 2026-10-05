# Development Lab model adapters

`fixtures.js` owns deterministic, five-slot scenarios shared by the Museum and tests.
`sandbox.js` isolates explicit developer edits and resolved-effect experiments. Every
edit is transactional and passes the normal deserialize validation before commit.
`catalogue.js` reads the active run's registries; it owns no content definitions.
No module runs work at import time or adds rules to the simulation.

`node-sandbox.js` authors a disposable dummy/settlement fixture for the Gym's
real node modal. Refresh reseeds content streams while keeping the authored
world, portrait and topology fixed. Node entry and all interactions use normal
Life Map rules; the independent controller validates cloned transactions.

`card-review.js` defines the independent review schema, editable definition
values, non-mutating draft projection and export data. Storage belongs to the
controller. Its schema is deliberately independent of GameState so reviews
survive app builds, including changes to game-save schemas.
Stock trait collections and schedule/seasonal-yield edits use the same v1 review
document as primitive edits. Collection edits replace overlapping leaf edits;
subsequent leaf edits update their saved collection. Schedule source icons derive
from the edited activation without replacing unrelated definition fields.
