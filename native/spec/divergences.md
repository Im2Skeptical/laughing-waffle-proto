# Native parity divergences

## Record keys used as identity

The browser compares some data through `JSON.stringify`. In particular, a
Structure modifier with `query.unique` compares its kind and exact serialized
query against earlier active modifiers. Native compares the kind and a
semantic query key. Record field order is irrelevant, and arrays and ordered
registries retain their order. This lets fixed-layout native records use
typed equality without saving JavaScript record insertion metadata.

The content compiler can compare the original JSON query keys with the
semantic keys at admission. The corpus check fails with both content paths if
the equality relations disagree. A deliberately reordered query pair tests
the diagnostic. Other comparisons use the identity rules recorded in the
[simulation content inventory](../src/sim/README.md#execution-identity-inventory).
