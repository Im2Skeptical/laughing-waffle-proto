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

The dispatcher names the prelude, seasonal Practices and Spring baseline,
Birth, Food and after-meal work, Housing, Faith, Migration, Death and control,
the phase event drain, the Vassal check, and the final flush. These stage
bodies are currently empty. The [pipeline write table](../../spec/tick-pipeline.md#detailed-settlement-step)
and [parity masks](../../reference/parity-masks.json) record their deferred
writes. The ported kernel uses no heap allocation per advance and draws no
RNG. It leaves the browser save schema and browser replay path intact, and the
native sim takes no wall clock, file, or UI dependencies.

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
state copying, import, export, masking and hash comparison. Optimized
timings at this cut cover the clock and dispatch with empty gameplay stage
bodies. CTest uses the existing seed-1 anchor and one additional full state,
with separate controls for the lunar schedule, clocks, gates, wildcard
matching, cut owners and unmasked diagnostics.

The seed-1 opening window measured 0.159 µs per sim-second on the
Intel Core i9-10900K with MSVC 19.50, using the median of three optimized
runs of 9,984 timed advances each. The 0.25 µs clock and dispatch budget
is recorded in the [performance architecture](../../spec/performance-architecture.md#stepping-and-phase-budget).

## Stage parity

The [browser stage probes](../../reference/README.md#stage-probes) provide
complete GameState and a versioned sidecar at each named seam. The checked-in
seed 1 clock pair runs through the native clock and AP kernel in CTest.

```powershell
$parity = ".\native\build\optimized\src\sim\waffle_parity.exe"
$fixture = "native/reference/fixtures/stages/seed-1/1"
& $parity stage --stage advance_clock --before "$fixture/before-advance_clock.json" --after "$fixture/after-advance_clock.json"
```

For a gameplay pair, resolve the named stage's `before` and `after` indices
through the capture manifest. `stage --stage <name> --before <file> --after
<file> [--masks <file>]` imports the before state's browser mirror into
`RuntimeState`, restores `seasonChanged`, and executes the selected seam in
isolation. When wiring a lunar stage, derive its schedule from the imported
`tSec` and captured `phaseDurationSec`. Pass the sidecar's pre-phase Chaos
value to the phase event drain. Legacy `_boardDirty` stays as boundary
metadata. False and absent are supported. The clock span uses
`advance_one_second` with the settlement dispatcher disabled and ends with
the dispatch-entry latch.

At this cut the gameplay functions are private stubs. The CLI identifies
their comparisons as `unported identity`. A mismatch is expected whenever
the browser stage wrote a compared field. As each gameplay seam becomes
callable, wire the production stage body into the tool's stage dispatcher.

The CLI exports the result and compares canonical GameState hashes and the
sidecar against the after file. It exits 0 on a match, 1 on a difference
with the first path, and 2 on invalid input. Comparisons are unmasked by
default. Optional format-version-1 masks apply to GameState only. Use
stage-specific masks so the comparison covers the fields the stage is
supposed to write. CTest also verifies that an altered expected latch
fails and that a true input latch is restored.
