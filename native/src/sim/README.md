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

## World topology admission

`admit_runtime(browserState, &topologyJson, capturedConfig)` admits gameplay
runs. The caller resolves `world.definitionId` in the export manifest and reads
its topology JSON before calling the simulation library. Admission checks the
definition and generator revision, the count, IDs and order of
`world.regions`, symmetric authored adjacency and ordered biome components.
It compiles captured content before interning live IDs and retains it in
`RuntimeState::compiledContent`. Callers with the original `gameConfig` JSON
pass it as `capturedConfig` so admission can reject differences in modifier
query identity caused by record key order. Use the adapter-only
`import_runtime` for round trips and isolated tests.

The [WorldTopology](world/topology.hpp) in `RuntimeState::topology` is immutable
and shared across state copies, alongside compiled content. Region IDs use
the runtime's authored ordinals to index scalar fields and immutable spans
in constant time without allocating.
Live roads continue to use `world.connections` and the runtime road index.
The browser export retains `world.definitionId`; topology is resolved again
when readmitting a saved state.

| Native field or accessor | Browser readers |
| --- | --- |
| `definition_id()`, `generator_revision()` | `world-state.js` resolves the world definition. `regional-map/definition.js` selects the generator and `external-world.js` gates generated settlement names by revision. Authored definitions have a null revision. |
| `region_count()`, `regions()` | `scopes.js` orders region scopes. `external-world.js` enumerates neutral and Monster targets. `world-state.js` canonicalizes live roads by region order. `vassal-life-map/world-choices.js` orders destination IDs, and `regional-practices.js` checks region membership. |
| `neighbors(region)` | `stock.js` orders remote suppliers and markets. `political-recipes.js` selects adjacent conversion targets. `territory.js` queries garrison neighbors and loss pressure. `biome-multipliers.js` traverses shared edges. `external-world.js` uses the same order for distances, Hunt and Monster expansion. `world-state.js`, `vassals.js` and `vassal-life-map/world-choices.js` use candidate road pairs, recovered by walking regions and taking only neighbors with a higher ordinal. |
| `biome(region)`, `biome_component(region)`, `mountain_component(region)` | `practice-multipliers.js` tests terrain affinities and reads the ordered same-biome components from `biome-multipliers.js`. Both Quarrying and Irrigating use component sizes, regardless of ownership or roads. `mountain_component` is empty for other biomes. |
| `region_name(region)` | `world-state.js` supplies names to `external-world.js` for evacuation records and to Vassal interventions, Life Map candidates, class actions, campaigns, commissions and travel choices. |
| `neutral_settlement_name(region)` | `external-world.js` uses the generated name when creating a neutral settlement. An absent name selects the template name. |

Food uses Stock routing. Migration reads live connections directly and can
use Stock through its practices. The phase bodies require no other static
map fields.

For N03f, `regional-v2:<seed>` selects the unsigned 32-bit map seed and
revision 2 from [definition.js](../../../src/model/regional-map/definition.js).
Reproduce the pinned geometry with clustering `0.5`, size variation `0.85`,
roughness `1` and feature set `0`. Preserve generated region order and the
underlying terrain biome of occupied regions. Canonicalize each polygon
vertex with the browser's rounding at `1e9` and pair regions by undirected
shared edges in ascending definition-index pair order. This produces both
neighbor order and candidate road order. Compute same-biome components by
breadth-first traversal from the first unvisited region in that order.
Generate region and neutral settlement names with the revision 2 naming
algorithm over the original map geometry and its generator neighbor lists.
The export fixtures cover these outputs. Initial live roads and markers
belong to New Game setup and are separate L3 checks.

From the repository root, regenerate or verify the fixture manifest and data:

```powershell
node native/reference/export-topology.mjs
node native/reference/export-topology.mjs --check
```

The default inventory comes from the checked-in state fixtures, the reference
corpus and the scenarios used for traces and stage probes. The exporter also
accepts definition IDs and raw state or stage boundary JSON files, for example
`node native/reference/export-topology.mjs --out-dir my-topologies regional-v2:123`.
`waffle_parity step` and `stage` use [reference/topology](../../reference/topology)
from the build's checkout by default. Both accept `--topology-dir <directory>`
for an alternate export. CTest checks the exports against live browser queries
and independently loads all manifest entries, including admission rejection controls.

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
- `histories` holds typed cursors into immutable pages of Practice traces,
  transfer receipts, retirement and Vassal events, completed node IDs and the
  legacy feed. `cold` holds immutable versions of descriptive strings and
  infrequently edited mirror values, including Life Map graphs and node states.
  References preserve optional-key presence. The
  [field map](state/field-coverage.txt) lists these boundaries.

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

[Settlement helpers and prelude](settlement/README.md) describe the typed
population APIs, moon buffer lifetime and deferred Unrest expiry transition.

## Cold history and retention

[History](state/history.hpp) stores ordered POD rows in 16-record pages.
Rows reference page-local typed spans for providers, Traits, tags and source
regions. Free-form history strings and generated receipt IDs are interned
within the page, so discarded rings and transfer batches release those
strings along with their records. Identity columns such as Region, Practice
and Vassal use the run dictionaries. A cursor supports constant-time size
and indexing. Export walks each retained page in order and reconstructs the
mirror, including absent, null and empty values.

Copies own their mutable tables, ID additions and cursors. Shared directories,
pages and replacement values are reachable only through const pointers.
Append publishes a fresh tail page and directory. Replacement publishes a
fresh value. A preview or restored anchor can therefore publish its own
version without changing what any other state reads. An expired ring page
is released when the last cursor referencing it goes away. Only a partial
front page can retain entries older than the visible ring. Import preserves
the captured list in full and the first append applies browser retention.
The Stock transfer cursor belongs to the latest second with a remote transfer.
The recipe port can reuse that cursor slot and assign an empty history when
the first transfer at a new second starts a new batch.

The inventory below gives retained live bytes for the optimized build at
`seed-1` second 1600 (year 50) and `seed-2026-late` second 3200 (year 100).
The last size column exercises rare Vassal state at `seed-42-shops` second 132.
Cold table timings in `runtime-stats` were 0–0.3 µs per field in these samples.
Sizes and record counts follow actual presence, including empty retained
versions. Source readers here are browser readers.

| Cold field | Year 50 B | Late B | Shops B | Growth, retention and rule readers |
| --- | ---: | ---: | ---: | --- |
| `DetailedSettlement.practiceActivationTrace` | 882,075 | 888,771 | 883,366 | Append, most recent 100 per site. Settlement and Practice inspection. |
| `PracticeEventJournal.trace` | 45,854 | 46,082 | 45,950 | Append, most recent 100 globally. Diagnostic. Rules drain the separate pending queue. |
| `PracticeEventJournal.stockTransfers` | 968 | 1,450 | 379 | Append within the latest transfer second, replace on the first remote transfer of a new second. Replay edge visualization reads it. The timestamp is hot. |
| `GameState.gameEventFeed` | 16 | 16 | 16 | Legacy feed, initialized empty. No active writer or retention cap in the full-map model. Deserialize scans IDs and navigation reads it. |
| `Civilization.retiredVassals` | 16 | 16 | 16 | Append on retirement, retained for the run, whose normal lineage starts with ten tenures. Candidate and Stock burden rules read typed rows. |
| `Vassal.lifeEvents` | 0 | 0 | 1,536 | Append, retained per Vassal. End-event IDs use the log length. Timeline and dossier readers inspect entries. |
| `LifeMap.completedNodeIds` | 0 | 0 | 244 | Append unique completed nodes, bounded by topology. Commission and node rules read it. |
| `LifeMap.availableNodeIds` | 0 | 0 | 40 | Replace with current entries or outgoing neighbors. Node admission reads it. |
| `LifeMap.nodeStates` | 0 | 0 | 11,125 | Insert on visiting nodes, update on action and resolution. Retained by node for the tenure record. Shop, Campaign and resolution rules read it. |
| `LifeMap.graph` | 0 | 0 | 38,154 | Created for each selected Vassal and retained with that tenure. Reachability, options and Commission rules read it. Its shops cursor copied in 0.1 µs. |
| `Vassal.portrait` | 0 | 0 | 240 | One per tenure. Presentation and lineage validation. |
| `Vassal.signatureNode` | 0 | 0 | 354 | One descriptor per tenure. Life Map generation uses it. |
| `Vassal.developmentChoiceQueue` | 0 | 0 | 40 | Append offers and remove the head when resolved. Reads gate node entry and resolve stat choices. |
| `Vassal.heirlooms` | 0 | 0 | 496 | Replace equipped and carried items in two three-slot arrays. Loadout, effects and inheritance read them. |
| `Civilization.heirloomVault` | 496 | 496 | 496 | Replace contents of six slots. Loadout and inheritance rules read it. |
| `Lineage.pendingCandidates` | 1,633 | 1,674 | 40 | Replace on reroll and clear on selection. Two founder offers or up to three successor offers. Selection reads it. |
| `Lineage.pendingVaultOverflow` | 0 | 0 | 0 | Replace or clear at inheritance and overflow resolution. Blocks subsequent selection until resolved. |
| `Lineage.lastInheritanceReport` | 0 | 0 | 0 | One receipt, replaced per inheritance and updated when overflow is resolved. Presentation reads it. |
| `CommissionOffer` and `ActiveCommission` text fields | 0 each | 0 each | 0 each | `label`, `description`, `statLabel`, `locationLabel` and `nodeLabel` belong to their owner record. Offer validation checks them. Live Commission rules use typed goal fields. |
| `World.definitionId` | 48 | 65 | 48 | One ID per world. Adjacency, scope and terrain rules resolve it. |
| `Region.colour` | 960 | 960 | 960 | One value per region. Scope eligibility reads it. |
| `Site.name` | 1,256 | 1,258 | 1,252 | One name per site, replaced on site transitions. Site selection and presentation labels. |
| `NeutralMarket.template` | 1,152 | 1,056 | 960 | One label per market incarnation. World setup and inspection. |
| `NeutralStock.label` | 2,592 | 2,304 | 2,112 | One label per Stock row. Provider construction carries it for receipt and inspection display. |
| `StockProvider.label` | 0 | 0 | 0 | Optional label per provider. Now an interned ID. The samples have no pending providers, and logged providers are charged to the enclosing trace pages. |
| `GameState.skillProgressionDefs` | 0 | 0 | 0 | Nullable legacy setup data. No live reader in the full-map model. |
| `SkillModifiers.pawnById` | 40 | 40 | 40 | Keyed updates per pawn. Legacy skill queries and runtime normalization read it. |
| `SkillRuntime.unlocks` | 160 | 160 | 160 | Add unique unlocks or remove on revoke. Skill projection reads the modifiable sets. |
| `GameState.persistentKnowledge` | 56 | 56 | 56 | Merge unique dropped kinds per pool and update a survival maximum. Timeline boundaries read and merge it. |

On the i9-10900K and MSVC optimized build, full value copies measured a median
of 101 samples per state. Before is `bb35741b` on the same captures.

| Trace state | Before µs | After µs |
| --- | ---: | ---: |
| `seed-1`, second 0 | 3.8 | 3.6 |
| `seed-1`, second 1600 | 560.3 | 5.6 |
| `seed-2026-late`, second 3200 | 614.2 | 5.4 |
| `seed-2026-late`, second 3332 | 589.4 | 5.4 |
| `seed-42-shops`, second 132 | 594.9 | 8.6 |

The browser's [trace writer](../../../src/model/detailed-settlements/practice-events.js)
is the retention oracle. The CTest fills the global and two site rings
through that writer and compares their native append results by canonical
hash. Anchor copy timings are native-only. When the recipe port writes
traces each second, include page publication and retained forecast bytes
in the per-second and forecast budgets.

## Field coverage and schema changes

The [field map](state/field-coverage.txt) drives row declarations and their
bidirectional mapping. Each section names a mirror record. Each line names
a storage policy followed by the mirror fields it covers.

- `hot` stores a scalar or inline record, or packs an array into a typed
  arena. `indexed` stores a record in its own arena, accessed through an
  index. `u32` and `u64` check integer narrowing. An `Id` type interns a string
  or ordered dictionary key. Slash-separated ID policies handle nested keys.
- `cold` preserves the whole field as an immutable version of its original
  mirror type. `history` selects an ordered typed log, `history:100` limits
  appends to the last 100 records, and `history:NodeId` stores node ordinals.
  `history_range` selects a page-local arena for variable-length payloads.
  `HistoryTextId` interns text inside that page. `config` preserves the entire
  captured content object.
- `practice_board` and `structure_board` preserve authored strips through
  row indices. `stock`, `charge`, `joint_count` and `payload:…` select a
  row-indexed column. `joint` selects a ledger span. `region_def`,
  `region_ref` and `site_def` select preassigned world row ordinals.
  Indexes and versions are runtime-only derived or native fields.

When changing the schema, classify each added field on a mapped record,
choose the ID domain or column when relevant, and regenerate both adapters.
The coverage CTest rejects missing and stale field entries and stale generated
files. A change inside an explicitly cold subtree uses the refreshed mirror
and updates the generated size walker.

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
immutable content and cold data are excluded from that byte count.
`coldSubtrees` reports cursor and record counts, live bytes, and the cost of
copying each field's cursor column. Its bytes include the immutable payload
reachable from the state and exclude spare capacity, allocator overhead,
shared ownership control blocks and IDs already held in run dictionaries.
Shared pages across different states are counted once per reported state.
Full and per-field copy times are the medians of 101 warmed-up copies,
excluding destruction. Use the optimized preset for timings.

## L0 corpus check

CTest verifies the two checked-in openings through both adapters against
the trace hash, strict import controls, dictionary order, copy independence,
browser ring retention and the CLI. To run the larger check from
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

N03d-3 passed 22/22 trace states and 2,949/2,949 capture snapshots through
each adapter. The captures include 2,942 standard, five sustained and two
queued-event snapshots.

L0 establishes sorted-key canonical equality for the exercised states, with
dictionary enumeration order tested separately. Original record text order,
native stepping, replay, new-game generation, and cross-platform agreement
are outside the L0 claim. The adapter performs no RNG draws or time advances.

## Second advance

[`advance_one_second`](step/advance_second.hpp) in `waffle_sim` gates on pause
and terminal state, advances the clock, and dispatches gameplay at most once.
AP cap and income use the new second, before the clock addition on the
dispatch tick. The typed import establishes numeric AP fields. The separate
AP cycle and named settlement lunar phases follow their respective browser
schedules. A derived lunar deadline skips phase selection between boundaries.

The gameplay dispatch sees the season latch after the same ordered binary64
additions as the browser. The default first season change dispatches at second
9, and the first year wraps at second 33. The latch survives native value
copies if a step ends between boundaries. Browser export omits it and browser
import begins with a cleared latch, matching the browser's serialization
behavior. The lunar deadline is derived again on import.

The dispatcher invokes [registered stages](step/stages.hpp) in browser probe
order. Clock, prelude, Spring death baseline, and lunar report headers run
in the current port. The [pipeline write table](../../spec/tick-pipeline.md#detailed-settlement-step)
and [parity masks](../../reference/parity-masks.json) record the deferred
writes. The ported kernel uses no heap allocation per advance and draws no
RNG. The native sim depends only on the core and preserves the browser's
save schema and replay path.

## Step parity

After generating the [step windows](../../reference/README.md#step-windows),
run one window from the repository root:

```powershell
$parity = ".\native\build\optimized\src\sim\waffle_parity.exe"
$window = "artifacts/native-reference/windows/seed-1/0"
& $parity step --from "$window/state-0.json" --seconds 39 --expect-dir $window --masks native/reference/parity-masks.json --time
node native/reference/step-windows.mjs $parity
```

`step` compares canonical hashes after each advance, applying the same masks
to the browser and native state. A gated attempt is compared with the full
reference state. A mismatch exits 1 and reports the second and first path
using the same traversal as `diff`. Invalid input exits 2. Optional
`--report <path>` writes comparison counts and hashes on divergence, or
comparison counts and timing when requested on success.

`--time` repeats the verified advancing portion of the window in batches.
It reports microseconds per sim-second and the timed advance count. It excludes
state copying, import, export, masking and hash comparison. A second pass times
each Stage and reports its calls and total time divided by all simulated seconds
in the window, including seconds where the stage did not run. This pass includes
clock-read overhead per invocation, so use the first pass for pipeline throughput.
The optional JSON report includes the breakdown in `stages`, keyed by stage name.
Step parity in CTest uses the existing seed-1 anchor and one additional full state,
with separate controls for the lunar schedule, clocks, gates, wildcard
matching, cut owners and unmasked diagnostics.

The `pipeline_steady_state_allocations` CTest measures global `operator new`
calls over 3,200 unbroken advances after 512 warmup advances from each of
`seed-1/0` and `seed-2026-late/3200`. It reuses the generated late anchor
when its canonical hash matches the reference, or generates it on first use.
Failed counts are attributed to their pipeline stage.

The N03e-1 seed-1 opening window measured 0.159 µs per sim-second on the
Intel Core i9-10900K with MSVC 19.50, using the median of three optimized
runs of 9,984 timed advances each. The 0.25 µs clock and dispatch budget
is recorded in the [performance architecture](../../spec/performance-architecture.md#stepping-and-phase-budget).

## Stage parity

The [browser stage probes](../../reference/README.md#stage-probes) provide
complete GameState and a versioned sidecar at each named seam. CTest uses the
checked-in seed 1 clock pair and the shared `after-advance_clock.json`
boundary for both ends of the idempotent opening prelude.

```powershell
$parity = ".\native\build\optimized\src\sim\waffle_parity.exe"
$fixture = "native/reference/fixtures/stages/seed-1/1"
& $parity stage --stage advance_clock --before "$fixture/before-advance_clock.json" --after "$fixture/after-advance_clock.json"
```

For a gameplay pair, resolve the named stage's `before` and `after` indices
through the capture manifest. The CLI imports the state and fills
`StageContext` with the season latch, legacy board flag (false or absent),
and pre-phase Chaos when present. Lunar stages use the schedule derived
from `tSec` and captured settings. The CLI and the second dispatcher share
`run_stage`. The clock stage ends at dispatch entry with the season latch
still set when due. The second driver clears it after dispatch and then
completes any clock ticks left over from a mid-second anchor.

The CLI compares canonical GameState hashes and sidecars. It exits 0 when a
ported stage matches, 1 on a difference with the first path, and 2 on
invalid input. A stage with deferred work reports `not ported` and exits 3
when the compared fields match, or 1 when they differ.

## Porting a stage

Edit the matching file under [`stages/`](stages), such as
[`birth.cpp`](stages/birth.cpp). Each entry returns true when the stage is
ported. The second dispatcher owns gates and order. Birth owns moon
rollover. Food, Housing, Faith, Migration and Death each set the moon phase
at the start of their entry. Full-map Migration Practices run before the
Migration entry and see the previous phase header. Capture Chaos before
any lunar work and pass it to the phase event drain after the phase.

After changing a Practice or Structure board or site membership, update
the site indexes as needed and call `practice::rebuild_listeners`.
It refreshes the scheduled timings, upkeep and listener indexes. Stock,
staffing and upkeep status are read live.

From the repo root, capture inputs and check a single stage across the
generated manifests.

```powershell
node native/reference/stage-probe.mjs --all
node native/reference/stage-pairs.mjs $parity prelude
```

Start with an unmasked comparison. If there are deferred writes in that
stage, copy only the relevant paths and their owner/reason entries from
[`parity-masks.json`](../../reference/parity-masks.json) into a temporary
format-version-1 mask file. Pass it as the third argument to
`stage-pairs.mjs` or via `--masks` on the single-pair CLI. Keep the fields
the stage now owns visible, and narrow the shared step masks as their
remaining owners land. Masks apply only to GameState.
