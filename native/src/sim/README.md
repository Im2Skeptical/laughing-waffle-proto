# Simulation state and browser adapter

`waffle_sim` is a C++20 static library linked only to `waffle_core`.
The boundary API in [game_state.hpp](browser/generated/game_state.hpp) is
`waffle::sim::browser::import_game_state` and `export_game_state`. It exchanges
JSON values with browser fixtures and import tools. [RuntimeState](state/runtime_state.hpp)
owns mutable native simulation state. `import_runtime` and `export_runtime`
convert between these two representations without advancing time or drawing RNG.

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

## Runtime layout

- `hot` holds clocks, AP, binary64 RNG streams, flags, run status and
  civilization ledgers. `tables` holds typed contiguous arenas addressed by
  32-bit row indices and half-open spans. Regions and sites retain their
  authored order. Site rows hold control, Unrest, garrison, Force, phase
  memory, and spans into the board, population and market tables.
- A Practice board has an ordered row span and five derived slot indices
  with holes. Each row's slot identifies its position on export.
  Stock and Charge are separate columns indexed by the Practice row.
  A Structure board has one row per origin and a footprint-to-origin span.
  Export writes the origins and reconstructs the null cells. Board
  identities are interned separately from row indices. Row versions start
  at zero on browser import and are available for native slot reuse.
- The joint population ledger is authoritative for full-map sites. Each site
  has one ledger span per residency. Within it, allegiance, specialty, life stage and age
  are keys in the `JointCohort` table, and counts are a separate 64-bit column.
  Migration compositions share those arenas but use their own spans. The
  serialized child/adult and per-age specialist/total rows are typed caches
  preserved as supplied, including their order. Any future writer of the
  joint ledger must update the serialized caches in the same commit.
  `rebuild_runtime_indexes` recomputes site residency and allegiance totals
  from the joint ledger. An absent joint key and an empty span stay distinct.
  Legacy authored scenarios with absent ledgers use their captured class rows
  for residency totals, without assigning allegiance to those residents.
- Moon turns and their reservations, movements, and meal and phase results
  are typed arenas. Ordered dictionaries are encoded as ordered key/value
  spans. Queued Practice events use FIFO headers and a separate typed payload
  column at the same row index. Current Commission and pending Life Map
  resolution fields are available in typed Vassal rows.
- `cold` holds descriptive strings and exact typed mirror subtrees, including
  Life Map graphs and node histories, candidate offers, journals, traces and
  transfer receipts. A cold field keeps its own key presence at the reference
  to that subtree. The [field map](state/field-coverage.txt) lists these
  boundaries. Copies own all mutable buffers, including cold subtrees and ID
  additions. The immutable captured content is shared.

Each captured content object retains the browser `GameConfig` and a SHA-256
over its schema-ordered JSON with dictionary order preserved. Ordinal
namespaces are typed. Config dictionary order
assigns Practice and Structure definition ordinals first. Captured gamepiece
Traits and tags are interned before live rows, then import interns remaining
IDs in encounter order. The immutable load dictionaries and flat, copy-owned
extensions both support reverse lookup. Row and span order records authored
or JS enumeration order. Rules that compare the spellings of keys must use
the ID dictionaries to resolve their names.

Derived indexes include region-to-site lookup, detailed and active site
lists, road neighbor spans in connection order, site totals and current
Vassal lookup. Their contents are rebuilt after import or a change to their
inputs. Physical map adjacency is reconstructed from `world.definitionId`
by the world-definition port. The mirror contains live roads and the world ID.
Workforce, recipe provider eligibility, compiled content and dispatch
scratch belong to the systems that use them.

## Field coverage and schema changes

The [field map](state/field-coverage.txt) drives row declarations and their
bidirectional mapping. Each section names a mirror record. Each line names
a storage policy followed by the mirror fields it covers.

- `hot` stores a scalar or inline record, or packs an array into a typed
  arena. `indexed` stores a record in its own arena, accessed through an
  index. `u32` and `u64` check integer narrowing. An `Id` type interns a string
  or ordered dictionary key. Slash-separated ID policies handle nested keys.
- `cold` preserves the whole field as its original mirror type, including
  descendants. `config` preserves the entire captured content object.
- `practice_board` and `structure_board` preserve authored strips through
  row indices. `stock`, `charge`, `joint_count` and `payload:…` select a
  row-indexed column. `joint` selects a ledger span. `region_def`,
  `region_ref` and `site_def` select preassigned world row ordinals.
  Indexes and versions are runtime-only derived or native fields.

When changing the schema, classify each added field on a mapped record,
choose the ID domain or column when relevant, and regenerate both adapters.
The coverage CTest rejects missing and stale field entries and stale generated
files. A change inside an explicitly cold subtree uses the refreshed mirror.

```powershell
node native/schema/codegen.mjs
node native/schema/runtime-codegen.mjs
node native/schema/runtime-codegen.mjs --check
```

## Parity commands

After building the `dev` or `optimized` preset, run from the repo root:

```powershell
$parity = ".\native\build\optimized\src\sim\waffle_parity.exe"
& $parity roundtrip native/reference/fixtures/seed-1/state-0.json --out native/build/state-roundtrip.json
& $parity hash native/build/state-roundtrip.json
& $parity diff native/reference/fixtures/seed-1/state-0.json native/build/state-roundtrip.json
& $parity runtime-roundtrip native/reference/fixtures/seed-1/state-0.json --out native/build/runtime-roundtrip.json
& $parity runtime-stats native/reference/fixtures/seed-1/state-0.json
```

`roundtrip` uses stdout when `--out` is absent. `hash` and `diff` accept JSON
directly so they can diagnose states that fail import. `diff` reports the
first path in UTF-16 object-key and array-index traversal order and the total
number of differing leaves, with exit code 1 for a difference and 2 for an
input error. `runtime-roundtrip` uses the same JSON output convention as
`roundtrip`. `runtime-stats` reports the live bytes of the hot scalar block,
table rows, lookup indexes and added IDs. Capacity, container headers,
immutable content and cold data are excluded from that byte count. Copy time
is the median of 101 warmed-up full value copies, including the cold data and
excluding destruction. Use the optimized preset for timings.

## L0 corpus check

CTest verifies the two checked-in openings through both adapters against
the trace hash, strict import controls, dictionary order, copy independence,
and the CLI. To run the larger check from
the repo root after building `optimized`:

```powershell
node native/reference/trace.mjs
node --max-old-space-size=8192 native/schema/capture.mjs
node native/schema/capture.mjs --sustained
node native/schema/capture.mjs --queued
$traceStates = Get-ChildItem artifacts/native-reference/traces -Recurse -Filter 'state-*.json' | ForEach-Object FullName
node native/schema/validate.mjs @traceStates artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
.\native\build\optimized\src\sim\waffle_browser_tests.exe corpus artifacts/native-reference/traces artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
.\native\build\optimized\src\sim\waffle_browser_tests.exe runtime-corpus artifacts/native-reference/traces artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
```

The batch checks every full state in the supplied directories. It compares
input and export canonical hashes and checks retained trace states against
their `hashes.tsv` row. Manifests sit outside the schema snapshot directories
or beside the trace hash files. A failing file is reported by path.

L0 establishes sorted-key canonical equality for the exercised states, with
dictionary enumeration order tested separately. Original record text order,
native stepping, replay, new-game generation, and cross-platform agreement
are outside the L0 claim. The adapter performs no RNG draws or time advances.
