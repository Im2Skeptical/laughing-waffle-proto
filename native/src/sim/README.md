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

## Captured content

[`compile_content`](content/compiled_content.hpp) builds a shared immutable
object from the run's captured configuration. The cache key combines the
schema-order capture hash and native compiler version. Populate the shared
config ID domains before interning live rows, retain the object for the run,
and pass it to future tick and replay consumers. Supply the original
`gameConfig` JSON at admission for identity diagnostics. The compile stage
does no simulation, filesystem work, clock reads, or RNG draws.

The compiler produces dense Practice and Structure rows, typed settings and
Life Map generator rules, ordered arena spans for recipes and modifier
queries, and tagged effect and trigger instructions. Practice rows expose
timing masks and the authored effect indices that commit with the population
recipe. In the browser, recipe preflight evaluates the conversion plan with
the definition's primary activation. At commit, the interpreter evaluates
amounts for the whole effects span in the dispatch context before any input
mutation. It commits Stock inputs, population inputs and grouped conversions,
then dispatches effects in declaration order. Strings used as IDs are
interned and definition ordinals follow captured registry order. Text and
workbook provenance stay in the serialized config.

The browser readers for these groups are `src/model/detailed-settlements/practices.js`
for scheduling, effects, triggers and upkeep, `src/model/detailed-settlements/political-recipes.js`
for population inputs and conversion support, `src/model/detailed-settlements/stock.js`
and `src/model/detailed-settlements/practice-multipliers.js` for Stock and
multiplier queries, and `src/model/detailed-settlements/construction.js` for
building. The active Vassal can change the keyword prototype's Practice
overlay. The tables retain its captured switch, configuration and base
definitions for the interpreter to resolve against live state.

[`field-coverage.txt`](content/field-coverage.txt) classifies every reachable
config field. Compiled fields specify any vocabulary or ID domain. Descriptive
fields are stripped from the tables. A field with an unsupported reason is
rejected if present. CTest checks generated layouts and decompiles typed rows
back to their executable JSON projection. The comparison keeps array and
dictionary order and normalizes record keys. The identity diagnostic receives
the original, unnormalized JSON. See [parity divergences](../../spec/divergences.md).

From the repository root, after building `optimized`:

```powershell
$test = '.\native\build\optimized\src\sim\waffle_content_tests.exe'
& $test timing native/reference/fixtures/seed-1/state-0.json
& $test corpus artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
```

### Execution identity inventory

Paths and lines refer to the browser baseline. These rules define the native
representation when each consumer is ported. The modifier query key is
already available on compiled Structure rows.

| Browser location | Native identity rule |
| --- | --- |
| `src/model/detailed-settlements/stock.js:38` | Dedup `unique` modifiers by kind and interned semantic query key. First eligible source wins. |
| `src/model/state.js:530`, `src/model/timegraph/forecast-wire.js:20`, `src/model/timegraph/forecast-wire.js:91`, `src/model/timegraph/retained-projection.js:20` | Share the immutable per-run content by its versioned capture key. Keep definition and other ordered dictionary traversal in the key. Record field permutations compare equal. |
| `src/model/regional-map/biome-clustering.js:21`, `src/model/regional-map/biome-clustering.js:55` | Use a tuple of available-set and depth for failed placements, and a tuple of seed, adjacency, quota and affinity for generated maps. Compare record members by value and preserve array order. |
| `src/model/detailed-settlements/vassals.js:260`, `src/model/vassal-life-map/selectors.js:484` | Compare ordered candidate rows by their captured fields. Compare signature and portrait records by value. |
| `src/model/detailed-settlements/population-ledger.js:5`, `src/model/detailed-settlements/population-ledger.js:69` | Key cohorts by allegiance, residency, specialty, life stage and optional age. Compare typed summary records and ordered elder cohorts on import. Preserve the browser lexical tie-break when allocating people. |
| `src/model/detailed-settlements/birth-allegiance.js:12` | Compare normalized sets of faction IDs before retaining carry credits. |
| `src/model/detailed-settlements/practices.js:58`, `src/model/detailed-settlements/practices.js:324` | Compare sorted Stock trait sequences for diversity and key root deferral by root plus a tagged instance or site-and-slot identity. |
| `src/model/world-state.js:36`, `src/model/world-state.js:45`, `src/model/regional-map/generator.js:19` | Use unordered endpoint pairs normalized by ID for road and polygon edge equality. |
| `src/model/regional-map/generator.js:18`, `src/model/regional-map/definition.js:34` | Key vertices by the pair of quantized coordinates at the respective precision. |
| `src/model/life-map-design.js:123`, `src/model/vassal-life-map-generator.js:135`, `src/model/vassal-life-map-generator.js:190`, `src/model/vassal-life-map-generator.js:230`, `src/model/vassal-life-map-generator.js:347`, `src/model/vassal-life-map-generator.js:354`, `src/model/vassal-life-map-generator.js:539` | Use tuples for pool runs, edge coordinates and directed node endpoints. Compare path lane sequences in order and compare the topology signature by its node fields and sorted child signatures, retaining the generation-rule node identity. |
| `src/model/life-map-design.js:114`, `src/model/life-map-design.js:145`, `src/model/vassal-life-map/lifecycle/candidates.js:79` | Resolve normal family and signature variant as tagged rule IDs in the captured design. |
| `src/model/vassal-life-map/lifecycle/node-confirm.js:590`, `src/model/vassal-life-map/lifecycle/node-confirm.js:591`, `src/model/vassal-life-map/lifecycle/step.js:194` | Compare ordered board slots and purchase ID sequences directly. Compare records by their fields. |
| `src/model/timeline/index.js:375`, `src/model/timeline/index.js:384`, `src/model/timeline/index.js:937` | Compare persistent knowledge by value and use a pair of range endpoints for the time-range key. Preserve value-array ordering. |
| `src/model/practice-outputs.js:32`, `src/model/dev-lab/card-review.js:8` | The editor compares effect shapes and patch paths structurally. Captured effects keep their declared order. |

Generated identifiers that enter the save or action protocol keep their
spellings. Native uses typed IDs for equality after interning them.

- Place and node IDs come from `src/model/full-map-world.js:45`,
  `src/model/world-state.js:576`, `src/model/detailed-settlements/external-world.js:142`,
  `src/model/vassal-life-map-generator.js:366`, and `src/model/life-map-columns.js:78`.
- Institution, placement, and transfer IDs come from `src/model/detailed-settlements/practices.js:401`,
  `src/model/detailed-settlements/vassals.js:631`, `src/model/detailed-settlements/stock.js:178`,
  `src/model/detailed-settlements/phases/migration.js:447`, `src/model/detailed-settlements/phases/migration.js:450`,
  `src/model/vassal-life-map/lifecycle/node-confirm.js:99`, and `src/model/vassal-life-map/shop.js:351`.
- Materialized choice and offer IDs come from `src/model/vassal-life-map/campaign.js:39`,
  `src/model/vassal-life-map/class-actions.js:24`, `src/model/vassal-life-map/class-actions.js:33`,
  `src/model/vassal-life-map/class-actions.js:44`, `src/model/vassal-life-map/class-actions.js:45`,
  `src/model/vassal-life-map/class-actions.js:49`, `src/model/vassal-life-map/class-actions.js:57`,
  `src/model/vassal-life-map/world-choices.js:35`, `src/model/vassal-life-map/world-choices.js:44`,
  `src/model/vassal-life-map/heirlooms.js:227`, `src/model/vassal-life-map/commissions.js:62`,
  `src/model/vassal-life-map/shop.js:98`, `src/model/vassal-life-map/shop.js:123`,
  `src/model/vassal-life-map/shop.js:209`, `src/model/vassal-life-map/shop.js:233`,
  `src/model/vassal-life-map/shop.js:277`, and `src/model/vassal-life-map/shop.js:355`.
- Lineage event, transaction, and development choice IDs come from
  `src/model/vassal-life-map/commissions.js:101`, `src/model/vassal-life-map/lifecycle/node-confirm.js:214`,
  `src/model/vassal-life-map/lifecycle/node-confirm.js:300`, `src/model/vassal-life-map/lifecycle/node-confirm.js:452`,
  and `src/model/vassal-life-map/lifecycle/node-confirm.js:629`.

JSON copying, diagnostic messages, serialized output, size estimates, and
catalogue and inspection keys have no simulation equality contract.

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
