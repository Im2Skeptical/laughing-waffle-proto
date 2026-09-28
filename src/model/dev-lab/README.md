# Development Lab model adapters

`fixtures.js` owns deterministic, five-slot scenarios shared by the Museum and tests.
`sandbox.js` isolates explicit developer edits and resolved-effect experiments. Every
edit is transactional and passes the normal deserialize validation before commit.
`catalogue.js` reads the active run's registries; it owns no content definitions.
No module runs work at import time or adds rules to the simulation.
