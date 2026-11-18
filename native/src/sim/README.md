# Browser GameState mirror

`waffle_sim` is a C++20 static library linked only to `waffle_core`.
The boundary API in [game_state.hpp](browser/generated/game_state.hpp) is
`waffle::sim::browser::import_game_state` and `export_game_state`. It exchanges
JSON values with browser fixtures and import tools. Native runtime layout and
the mapping to it belong to N03d-2.

The generator writes the types and codec to `browser/generated/` from the
[checked-in schema](../../schema/README.md). Keep the generated files in git.
Each has the version and SHA-256 of the LF-normalized schema. From the repo root:

```powershell
node native/schema/codegen.mjs
node native/schema/codegen.mjs --check
```

Both commands select the highest checked-in schema version by default. Pass
a `gamestate.v<N>.json` path to select another version. The normal CTest suite
checks freshness when Node is available. A C++ build uses the checked-in files.

Import rejects shape errors at their JSON paths. Numbers are binary64,
including integer fields and numeric version tags. A field that is both
optional and nullable has three states. `has_key()` distinguishes an absent
key, and `value()` on a present key returns an optional value. Dictionaries
store ordered key/value pairs. Core JSON provides JS index ordering and
value formatting. Export emits record fields in schema declaration order.

## Parity commands

After building the `dev` or `optimized` preset, run from the repo root:

```powershell
$parity = ".\native\build\optimized\src\sim\waffle_parity.exe"
& $parity roundtrip native/reference/fixtures/seed-1/state-0.json --out native/build/state-roundtrip.json
& $parity hash native/build/state-roundtrip.json
& $parity diff native/reference/fixtures/seed-1/state-0.json native/build/state-roundtrip.json
```

`roundtrip` uses stdout when `--out` is absent. `hash` and `diff` accept JSON
directly so they can diagnose states that fail import. `diff` reports the
first path in UTF-16 object-key and array-index traversal order and the total
number of differing leaves, with exit code 1 for a difference and 2 for an
input error.

## L0 corpus check

CTest verifies the two checked-in openings against the trace hash, strict
import controls, dictionary order, and the CLI. To run the larger check from
the repo root after building `optimized`:

```powershell
node native/reference/trace.mjs
node --max-old-space-size=8192 native/schema/capture.mjs
node native/schema/capture.mjs --sustained
node native/schema/capture.mjs --queued
$traceStates = Get-ChildItem artifacts/native-reference/traces -Recurse -Filter 'state-*.json' | ForEach-Object FullName
node native/schema/validate.mjs @traceStates artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
.\native\build\optimized\src\sim\waffle_browser_tests.exe corpus artifacts/native-reference/traces artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
```

The batch checks every full state in the supplied directories. It compares
input and export canonical hashes and checks retained trace states against
their `hashes.tsv` row. Manifests sit outside the schema snapshot directories
or beside the trace hash files. A failing file is reported by path.

L0 establishes sorted-key canonical equality for the exercised states, with
dictionary enumeration order tested separately. Original record text order,
native stepping, replay, new-game generation, and cross-platform agreement
are outside the L0 claim. The adapter performs no RNG draws or time advances.
