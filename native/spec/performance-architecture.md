# N03p · Native performance architecture

Proposal for review. Browser baseline `496d9971630e679ce3a35da574b19e19f155b44d`,
GameState 52 and captured config 31. The [N03c pipeline](tick-pipeline.md)
specifies stage order, state access and the profile. On the i9-10900K it
measured 6,720 seconds in 14.62 s (460 sim-s/s), with 27% summaries, 19% Food,
16% anchor JSON and 11% standalone event drains. Food includes its own recipes
and drains. Default lunar boundaries occur every second and the sustained
profile had no active Vassal. Its 20 sites, 72 Practice and 48 Structure
origins, 31–53 joint bins and ~575 people are reference workloads. The other
N03c run reached 181 bins and 972 people.

Native needs one authoritative end-of-second state and summary per second.
Windows and Android must agree. Smooth scrub takes priority over forecast speed
and horizon. The target is 32,000 sim-s in 1 s, or 31.25 µs/sim-s inclusive.
**Assumption:** a Pixel 6 Tensor big core is 2.5–3× slower single-threaded than
the dev desktop. This gives a desktop equivalent of 10.42–12.5 µs/sim-s before
startup or UI contention. The ratio is a planning assumption. Memory
bandwidth, scheduler placement and thermal behavior require device measurements.

## Captured content and runtime state

- At run load, intern regions, sites, factions, Stock Traits, tags, card defs
  and stable identities to typed ordinals. Keep ID dictionaries for import,
  export and presentation. Keep explicit authored region, board slot and
  journal order where rules use it. Keep the JS order/tie keys at the adapter
  wherever an oracle depends on them. Dense IDs make order cheap and explicit.
  For mutable slot/index reuse, keep stable instance IDs and versions so a
  replaced Practice can't inherit pending work. Use 32-bit IDs and offsets
  with checked bounds before narrowing. A dense ID can have a fixed in-memory
  meaning for a run while the browser codec retains its original string.
  N03d-2 must account for all serialized fields at the mirror boundary,
  including absent versus null, authored board holes and data needed solely
  for export. Test mirror I/O and mirror-to-runtime-to-mirror separately.
- Use dense tables for regions and site metadata, with direct region-to-site
  and active-site views. Keep cold labels/geometry separate. Hot columns include
  controller, mode, board spans, Unrest/Force deadlines, and class and allegiance
  totals. Keep current and previous moon-turn data and meal/reservation state
  typed and snapshot-visible. Phase work reads them directly.
- Authoritative population is the joint ledger
  `(residency, allegiance, specialty, life stage, elder age) -> count`.
  Pack per-site ranges of nonzero bins with wide integer counts, separate key
  and count columns where arithmetic streams over counts, explicit order or a
  precomputed compatible tie rank, and reserved room for new elder bins.
  Batch transformations with pre-sized scratch, merge in a stable order and
  update class/faction totals on commit. Preserve per-age distributions and
  birth-allegiance credits. Use checked wide intermediates for proportional
  allocation and prove equivalence around the rounding ties before narrowing.
  Workforce consumes ordered adult/elder `(residency, allegiance)` groups
  with Scholar/ordinary counts. Store compact slot assignments, invalidated
  by population, board, allegiance or applicable settings changes. Rebuild
  on demand before the next consumer, with stable Influence/Resource,
  Scholar/ordinary and slot order. [Ledger](../../src/model/detailed-settlements/population-ledger.js)
  and [workers](../../src/model/detailed-settlements/workers.js).
- Keep hosted Stock amounts per board/provider slot, including separate market
  rows for traits, quantity, capacity, price and replenishment. Keep ordered
  provider spans for local slots and regional neighbors. Load physical adjacency
  in authored region order from the captured world definition and keep
  mutable roads as bits or indexed edges. Precompute eligible provider spans
  by host and beneficiary when topology, ownership, Unrest, market or board
  shape changes. Iterate local, allied, then market rows. Use trait masks
  and a wider mask/spans where a content pack requires them. Group alternative
  Traits without changing provider priority. Scratch debits reserve original
  Stock and local Currency for market purchases. Require reads activation-start
  Stock. Consume and population conversions commit atomically and emit in
  declared order. Complete the local pass before shared retries, including
  Food allocation across all sites. [Stock planner](../../src/model/detailed-settlements/stock.js)
  and [Food routing](../../src/model/detailed-settlements/phases/food.js).
- Board rows carry def ID, origin/slot, instance, quality, faction, work,
  Charge, Stock and construction/upkeep state. Keep Structure origins separate
  from footprint-to-origin indices and compiled modifier spans. Start with
  dense rows for board metadata, SoA for Stock/Charge and other streams that
  fill independently. Use all-site ordered scans at phase boundaries and
  per-site dirty recomputes at mutations where these save a demonstrable scan.
  Keep derivable indexes as bounded scratch or cache, outside authoritative
  data. Rebuild them on import/restore or snapshot plain derived columns when
  rebuilding costs more and their consistency is tested.

Compile the captured `gameConfig` into a generation-independent,
immutable run object at admission. Store the original config and content
identity, with a separate native rules/compiler version, so loading or
replaying a run compiles the same inputs even after editor or app updates.
Key any reuse by both identities. Translate scheduled activations, stage,
season/cadence masks, costs, condition predicates, trigger clauses,
modifier queries and ordered effects to indexed tables. Use compact tagged
instructions with typed operands for effect and amount expressions that need
an interpreter, plus direct table paths for simple common recipes. Resolve
IDs, validate operand domains and references, and size dependency/scratch
tables at load. Report unsupported executable ops with their content path.
Keep descriptive fields and unknown passthrough data in the boundary format.
Dynamic reads still occur at activation and commit in the specified order,
including amount evaluation before mutations. A content edit starts a new
captured ruleset where permitted. It never mutates the active compiled config.
[Browser recipe engine](../../src/model/detailed-settlements/practices.js) ·
[Schema inventory](../schema/README.md).

Life Map topology, candidate histories, event and action journals, transfer
receipts and traces use typed cold storage with offsets. They do not sit in
hot per-site rows. Share immutable authored topology/config. Version mutable
cold objects when changed and write append-only value records and bounded
indexes in forecast storage. Anchors store the live record references and
journal end cursors. Restore copies the selected records into a new owned
cold state. Keep continuable state, including pending events, in snapshots
even when execution normally drains it at the boundary. Preserve the browser
trace retention policy in the initial port. Keep diagnostic logs outside
authoritative decisions. Never compress gameplay-visible history by deleting
fields needed for replay or retrospective inspection.

## Stepping and phase budget

Use one public advance per second. Dispatch using fixed deadline slots for
lunar, season, actions and Vassal work, with ordered buckets for mutable
deadlines such as expiry. No global priority queue is needed for four
schedules. Periodic lunar timing uses the N03c formula and a cached next
boundary. Season work is inserted before due lunar work. Retain the 60
binary64 additions to `seasonClockSec` and `simTime` inside one tight numeric
kernel. Carry the resulting season latch through this second's local dispatch.
This preserves the browser's shifted default season boundary and fractional
duration behavior at end-of-second checkpoints. Apply AP on the new second
using the pre-clock inputs where the browser does. N03c's proposed
integer-season timing would move the first seasonal activation from second 9
to 8. The clock measurement below does not justify that divergence.
[Clock order](../../src/model/commands/simulation-commands.js) ·
[Boundary defect](determinism-hazards.md#confirmed-and-suspected-browser-defects).

Run Unrest and Green prelude before seasonal Practices and their Spring
baseline, then the due lunar phase and its epilogue. Execute the intervening
drains at the calls that made their effects observable. Resolve Commission
and timed Vassal work unless terminal, then unconditionally flush at the
given epilogue. Apply journal actions in supplied order after the step at
their second, including synchronous zero-time resolution. Publish summary,
terminal status and optional anchor after those actions. Preserve terminal
early returns and phase epilogue exceptions from N03c. Take the initial row
and final terminal row. Start restore from the journal cursor belonging to
the anchor. No skip across quiet spans is needed initially. Deadline
dispatch avoids inactive work while still emitting the intermediate summary
and evaluating loss each second.
[Stage order and terminals](tick-pipeline.md#detailed-settlement-step) ·
[Action order](../../src/model/replay-second-runner.js).

These are **desktop budget allocations**, averaged over a reference horizon
per simulated second. Due phases can cost several times their weighted budget.
Scheduled recipe cost is included in the owning row, and event drains are
all charged to Events, regardless of call site. The Vassal/action allocation
assumes occasional due work. Active Vassal/action workloads still need
measurement. Averages are throughput budgets, and restore also needs
measurements across expensive adjacent seconds.

| Step | Desktop µs/sim-s |
| --- | ---: |
| Advance clocks/AP and deadline dispatch | 0.25 |
| Unrest/Green and other prelude | 0.45 |
| Workforce and population/provider view maintenance | 0.80 |
| Seasonal recipes and Spring baseline | 0.45 |
| Birth, aging and moon rollover | 2.60 |
| Food, afterMeals and garrison | 1.00 |
| Housing and construction | 0.55 |
| Faith/Chaos | 0.55 |
| Migration | 0.60 |
| Death, control and spatial pressure | 0.90 |
| Events, incl. synchronous cascades | 1.10 |
| Vassal, Commission and journal actions | 0.55 |
| Summary and terminal output | 0.80 |
| Anchors and publication, amortized | 0.25 |
| **Total** | **10.85** |

## Practice events

Store small event headers and tagged payloads in pre-sized value queues.
Keep `id`, `rootId`, `parentId` and exact second. Dispatch with FIFO head/tail
indices. Index candidates by event kind and scope. For local routes index
by source site; use authored reverse adjacency and live road eligibility for
neighbor/connected routes, and an ordered list for worldwide routes. Match
Traits/tags/faction, source count, action kind and staffing at dispatch.
Merge/deduplicate the candidate streams in authored site/slot order. Maintain
receiver lists and versions on board/controller changes. Bound exceptional
worldwide work by the actual listener set. A full global matching subscription
can still touch every listener.

First clamp dirty thresholds at their event-time read point and apply all
ordered Charge gains. In the second pass take the union of ready local
Practices (even without a matching gain trigger) and eligible remote trigger
matches. Re-read mutable eligibility at the correct pass/cursor so earlier
commits can affect later candidates. Preserve the eligible-site view for the
event and its per-pass assignment read points. Invalidate ready sets when
staffing or multipliers change and apply threshold changes at the same point
as the reference. Use indexed root scratch for resolved instance identities,
and an ordered deferred queue keeping the first eligible parent. A stopped
root can mark its entries dead and let queue cursors skip them. Check both the
event and resolution caps, keep pending children ahead of the next shared
retry, and preserve the distinction between shared scheduled retries and
deferred Discharges. Compare event IDs/order, Charge, Stock and cap records
against the browser. Exercise threshold changes unrelated to the current
event, local full-Charge retries, new board identities, ties and nested
shared attempts. [Drain and trigger predicates](../../src/model/detailed-settlements/practices.js) ·
[Event and trace appenders](../../src/model/detailed-settlements/practice-events.js).

## Summary and snapshot budgets

Maintain per-site integer aggregates on commit where cheap, such as people
by class/allegiance and Edible/Currency Stock. Rebuild nonadditive derived
values on dirty sites, e.g. workforce, effective housing and political support.
Invalidate reverse dependents on roads, controller, modifiers, Stock and
garrison targets. Treat time-dependent values such as remaining Unrest as
deadline-derived per emitted row. Fold civilization values in authored order
over the typed site results where scope or floating-point order matters.
Start with an independent full recompute oracle. Use a full typed scan in
production for any aggregate whose dirtiness is hard to prove or whose rebuild
cost is comparable. The benchmark measures a full summary scan.
[Summary entry](../../src/model/projection-summary.js) ·
[Graph series/scopes](../../src/model/graph-metrics.js) ·
[Political read dependencies](../../src/model/detailed-settlements/territory.js).

Use a time-major, fixed-layout row within append-only pages. Provision **144 B
per civilization/header row** for time, terminal/Vassal metadata, the eight
civilization series, four class population/free-worker series and Prestige.
Provision **128 B per site** for four local resource/capacity values, four
territory series and four metrics for each of two residencies. Global values
shown on local graphs are read from the header. Preserve binary64 for values
with fractional domains. Use an explicit presence encoding for optional
values. This budget is for the timegraph series. Rich territory/inspection
details come from the independent preview, with per-second marker rows sized
before adopting the layout. Adding classes or graph columns changes the
budget. At 20 sites this is **2,704 B/s**, or **82.52 MiB for 32,001 rows**.
Use the simulation thread to emit each row before the next state mutation.
No data shipping or second core is needed for these writes initially. Graph
readers take immutable page views with O(1) by-second lookup. Measure contiguous
series traversal and frame times during drag before committing to graph
decimation or transposed columns.

Take typed checkpoints at second 0, every **64 seconds**, and the final
second if off-stride. Use flat POD vectors or a contiguous aligned arena of
plain indexed state with lengths and cold-store offsets. Store clocks, RNG,
entity identity/version counters, pending work, run flags, and authoritative
phase memory. Copy only live spans. No strings, process pointers or platform
padding in persistence or cross-platform hashes. Use an explicit field codec
for portable save/hash and use native copies in memory. Immutable config is
shared per run. Compare direct advance, restore+replay and live+action state
hashes at every sampled second.

Restore the nearest preceding anchor into an independent buffer, replay at most
63 seconds and materialize the target. Skip intermediate summary and anchor
emission during reconstruction. Cache reusable allocation *capacity* and
optionally a private preview value for forward-adjacent targets, with generation
and cursor checks. At 31.25 µs/sim-s the 63-second advance is ~1.97 ms, before
copy, cold materialization and view work. **Targets** on Pixel 6 are ≤4 ms
p95 and ≤8 ms p99 for random restore/materialization under forecast load,
and ≤2 frames input-to-visible at 60 Hz. Verify warm, cold, reverse and
random drags with active Vassal and a previous generation. Use measured
windows of expensive seconds to size stride. As an illustrative assumption,
copying 64 KiB at an effective 10 GB/s would cost ~6.6 µs or ~0.10 µs/sim-s
at stride 64, before cold restore. This is a sizing example, not phone
bandwidth evidence.

Set a **256 MiB forecast-store cap** across the current and one retained
previous generation, including their active scratch. Allocate up to 168 MiB
to summary pages, 64 MiB to anchor blocks/indexes and 24 MiB to cold forecast
data, indexes/config, active restore and working buffers. At 20 sites and
the assumed row layout, two full horizons consume ~165.04 MiB. 501 anchors
per horizon at an assumed mean of 64 KiB of copied body each give 62.63 MiB
across two horizons before indexes. Measure these assumptions on real state.
Account for live readers/leases and retired work awaiting reclamation.
Artwork and the rest of the app are outside this cap and need a separate
device budget. Release superseded or unexposed coverage according to the
timegraph contract. If pressured, free optional caches first, then shorten
new horizon admission within the agreed capacity policy. Preserve retained
revealed coverage. Increase the stride only if measured scrub latency allows
it. Each admitted second keeps its own row and remains restorable.
[Timegraph contracts](../../docs/timegraph-optimisation-guardrails.md) ·
[Retained projection](../../docs/timegraph-ux-and-capacity-brief.md#6-where-the-current-build-differs).

## Ownership and allocation

Forecast worker owns a private mutable run copied at the authoritative
checkpoint plus captured action range. A generation ID and run/rules identity
tag every immutable published page. Publish only complete row ranges via an
acquire/release handoff. Keep input, graph display and reveal cap on the UI
thread. The UI submits a target and reads ready summaries immediately.
A restore job owns its own staging buffers, coalesces pending drag targets and
publishes only matching generation and request IDs. Give restores priority
over forecast; start with one simulation worker servicing restores between
bounded forecast batches, preempting obsolete requests between seconds.
Start with a priority check after at most 32 forecast seconds (~1 ms at
the phone target); measure the time bound on bursty states.
Use a dedicated restore lane only if measured scheduling tails justify its
memory and core costs. Retain the previous generation independently for the
revealed prefix the UI may still browse. Cancellation, pausing and app
suspension stop work at an atomic second and leave already published pages
valid. New Game waits for its full opening forecast.

No intra-second parallelism in the initial design. Shared Stock, migration
reservations, event order and a common RNG stream imply deterministic commit
and draw ordering at this scale. Splitting those phases adds coordination
that the skeleton does not need. Re-evaluate only if optimized profiles
show a costly independent kernel with stable reductions and the device
still meets frame budgets.

Target **zero heap allocations per steady-state simulated second**, including
anchors and summary rows within the admitted horizon. Pre-size queues, plans,
dirty bits, bin packing space, snapshot slabs, cold bytes and summary pages
at admission. Reuse workspaces with length/cursor reset. Size headroom from
loaded content and stress traces, and count high-water marks separately from
capacity. If an action or exceptional content exceeds admission, use a
deterministic capacity result and grow between atomic steps outside the hot
loop, or end the forecast at its last complete boundary and re-admit. Never
silently discard authoritative work or publish a partial step, and do not
tie outcomes to allocator timing. Test buffer exhaustion and worker
cancellation around publication boundaries.

## Access-pattern benchmark

From the repository root with [native tools](../README.md#windows-build) set up:

```powershell
. native/tools/env.ps1
Set-Location native
cmake --preset optimized
cmake --build --preset optimized
.\build\optimized\src\bench\waffle_bench.exe src/tests/vectors/seed-1-initial.json
ctest --preset optimized --output-on-failure
.\build\optimized\waffle_native_demo.exe --smoke
```

[Fixture](../src/tests/vectors/seed-1-initial.json) is the pinned seed-1
New Game, SHA-256 `fc0187689668a789d5c12e017ff79f7050741d0c7036e766bfc66abbbb0eb08e`.
[Loader/workload](../src/bench/workload.cpp) uses `waffle_core` JSON, resolves
ordered IDs, compiles the fixture's recipe inputs and basic Stock outputs,
and copies its census, board origins, market Stock and road edges. The
1× case has 20 sites, 19 active including three markets, 71 Practices,
48 Structure origins, 64 bins, 694 people, 79 slot/market Stock rows and 34
interned Traits across the captured tables. The browser's adjacency helper
reports 39 physical edges, and all 11 roads in the fixture are in that set.
The skeleton traverses the road subset. 2× and 4× are disconnected copies of
the same board with identical degree, occupancy and per-site counts. They
probe working-set/linear scaling with site count and population together.

The workloads are **skeletons**. Synthetic Stock refresh sustains a mixed
success/failure workload. Food debits local providers before shared scans.
Birth reads the real bins and makes per-person core RNG draws, retaining the
captured census. There are no elders at this opening, so Death measures
dispatch and bin work with no elder RNG load. Housing reads the structure
origins; Migration reads destination capacity; neither resolves their gameplay
transactions. The event harness exercises two synthetic local cascades per
map alongside the three captured defense listeners. It measures an indexed
queue and local callbacks, without the full production retry/deferred or
worldwide trigger paths. Summaries recompute a typed subset of metrics and
write the modeled full row width. The bench allocates its buffers up front,
checks that scratch capacity stays fixed, and compares independent restores
against rows from uninterrupted advance. The smoke checks all 81 row targets
including an off-stride final anchor and imposes no timing requirement.
[Harness](../src/bench/main.cpp) · [CTest](../src/bench/CMakeLists.txt).

Each scale runs seven complete 32,000-second samples with an additional
instrumented sample per repeat for phase costs. Per-phase time is divided
by all seconds, including non-firings. Sub-microsecond buckets include
timer overhead. Total uses a separate timed outer loop, with no phase
timers, excluding admission, initial storage allocation and restore queries.
Each restore sample reads a checkpoint and steps to its target, skips
intermediate rows and writes one preview row. The 128 queries cover every
stride offset twice across the horizon. Snapshot read/write time is measured
at that cadence and size. The exact peak owned-buffer capacity counts compiled
tables, three state copies, summary/anchor slabs and both workspaces, excluding
the destroyed loader DOM, object headers/allocator overhead, UI and production
cold state. It is a capacity measurement of one forecast and one preview.

### Measured on Windows

Intel Core i9-10900K (3.70 GHz nominal), x64 MSVC 19.50.35730.0, Release
`optimized` preset. Median [min, max] over seven runs per scale.
Timings in µs per simulated second unless the row says otherwise.

| Opening workload | 1× (20 sites, 694 people) | 2× (40 sites, 1,388 people) | 4× (80 sites, 2,776 people) |
| --- | ---: | ---: | ---: |
| Clock, 60 arithmetic iterations | 0.123 [0.121, 0.124] | 0.122 [0.121, 0.127] | 0.126 [0.125, 0.128] |
| Workforce | 0.651 [0.647, 0.653] | 1.278 [1.274, 1.415] | 2.539 [2.515, 2.766] |
| Season | 0.032 [0.031, 0.033] | 0.063 [0.062, 0.071] | 0.123 [0.120, 0.131] |
| Birth | 2.336 [2.321, 2.345] | 4.654 [4.648, 4.974] | 9.321 [9.293, 9.810] |
| Food | 0.073 [0.072, 0.076] | 0.142 [0.140, 0.163] | 0.281 [0.278, 0.300] |
| Housing | 0.014 [0.014, 0.014] | 0.022 [0.022, 0.025] | 0.039 [0.039, 0.042] |
| Faith | 0.006 [0.006, 0.006] | 0.009 [0.009, 0.010] | 0.013 [0.012, 0.014] |
| Migration | 0.015 [0.014, 0.016] | 0.024 [0.023, 0.027] | 0.043 [0.041, 0.045] |
| Death | 0.041 [0.041, 0.042] | 0.081 [0.079, 0.090] | 0.160 [0.157, 0.175] |
| Events | 0.294 [0.291, 0.297] | 0.577 [0.572, 0.615] | 1.151 [1.146, 1.178] |
| Summary, full typed scan | 0.373 [0.351, 0.467] | 0.732 [0.700, 0.884] | 1.463 [1.431, 1.666] |
| Anchor writes, amortized | 0.003 [0.002, 0.003] | 0.005 [0.004, 0.009] | 0.010 [0.009, 0.011] |
| **Total, independently timed** | **3.902 [3.857, 4.100]** | **7.856 [7.552, 8.336]** | **15.043 [14.979, 15.164]** |
| Checkpoint payload, B | 2,084 | 4,088 | 8,096 |
| Checkpoint write, µs/copy | 0.161 [0.138, 0.205] | 0.313 [0.272, 0.573] | 0.615 [0.581, 0.696] |
| Checkpoint read, µs/copy | 0.402 [0.318, 0.643] | 0.568 [0.450, 0.670] | 0.838 [0.725, 0.957] |
| Restore p95, µs/request | 210.6 [209.6, 213.8] | 414.2 [407.6, 597.9] | 819.2 [802.1, 834.9] |
| Summary B/sim-s | 2,704 | 5,264 | 10,384 |
| Peak owned-buffer capacity, B | 87,605,720 | 170,549,572 | 336,437,656 |
| Peak owned-buffer capacity, MiB | 83.55 | 162.65 | 320.85 |

The 1× run made 5.38M RNG draws, resolved ~91.6K Discharges and visited
~35.1K shared-neighbor candidates across Food and recipes. Total grows 2.01×
and 3.86× over 1× at constant node degree. Most memory is summary rows.
At 4×, one full horizon alone exceeds the proposed cap. At 2×, two full
horizons exceed it. These cases need shorter admission or a separately
validated more compact row representation.

The supplemental load is the year-100 `seed-2026-late` reference state.
Generate it from the repository root with
`node native/reference/trace.mjs seed-2026-late`, then pass
`artifacts/native-reference/traces/seed-2026-late/state-3200.json`
to the executable. The capture's JSON continuation and replay matched.
The fixture has 20 sites, 14 roads, 208 bins and 1,315 people, including
elders. Its 1× median was **5.642 µs/sim-s** [5.486, 6.176]. Birth contributed
3.450 [3.377, 4.038], Death 0.338 [0.329, 0.408], and summary 0.528
[0.501, 0.692]. A checkpoint was 2,720 B and p95 restore was 303.5 µs
[298.4, 394.3]. This adds a real density and mortality profile. Timed Vassal
rules and cold store costs remain outside the harness.
[Late reference scenario](../reference/README.md#scenarios-and-capture-size).

**Pixel 6 assessment.** For 20 sites the target is plausible and unproven.
Using the assumed 2.5–3× ratio, the 10.85 µs desktop allocation corresponds
to ~0.87–1.04 s for the horizon, before application overhead. At 3× the
32,000 sim-s/s target requires ≤10.42 µs/sim-s desktop. The opening
skeleton leaves ~6.5 µs/sim-s under that ceiling and the late skeleton
leaves ~4.8. Real Food/market contention, cohort mutations, production
drains, spatial control, timed Vassal work and cold archives must fit in that
headroom. The late Birth bucket already exceeds the nominal allocation.
Profile those stages before committing to sampler or arithmetic changes.
There is no basis here to claim one-second throughput at 4× or on a
thermally constrained phone. Preserve scrub targets when tuning horizon.

**Cross-runtime handoff.** Preserve the browser's isolated restore and
ordered Supply contract. Native captures the browser's existing immutable
config reuse and makes typed copies cheap enough to try wider anchor
spacing, subject to restore tails. The clock evidence favors retaining
season arithmetic. The typed indexed Stock, worker and trigger work is
native evidence for a design, while analogous browser indexes need their
own correctness/timing comparison against the existing supply/cache work.
Use the opening and late fixtures for N03d-2 adapter coverage and repeat
the phase timings as N03e replaces synthetic kernels.
[Browser cache measurements](../../docs/research/settlement-supply-performance.md).

## JS divergence proposals

| Proposal or decision | Reason and expected gain | Verification |
| --- | --- | --- |
| **Adopt whole-second entry points.** Internal clock accumulation remains binary64 and keeps its 60 additions. Native exposes second-boundary checkpoints only. | Removes 59 top-level stage/gate dispatches per second and the unserialized mid-second latch hazard. N03c sampled clock/AP at about 0.2% of JS CPU time. A small direct speed gain is expected, without an isolated native comparison. The main gain is fewer observable state boundaries. | End-of-second clock and state comparisons around seconds 8–9, season/year wrap, fractional durations, pause and terminal. Native cannot resume a partially elapsed JS second. L0 still retains its serialized fields. |
| **Adopt typed anchors and compact graph rows.** Rich inspections use authoritative preview restore. | Representation changes at the native timegraph boundary. Removes the per-anchor JSON work, which accounted for 16% of sustained JS CPU, and the per-summary object construction and duplicate reads. The skeleton quantifies native copy/row costs below. The measurements do not isolate a ported A/B speedup. | Equal graph values and marker attribution each second. Full state and details match an independent restore/replay oracle. |
| **Defer modular RNG semantics.** Keep the current binary64 seed contract and per-person draw order first. | N03c found loss of low-bit precision at second 25,729 in its sustained run. A versioned modular stream would avoid this and remove the core's per-draw `fmod`, but would change continuation after precision loss. First measure an exact fast path for finite nonnegative seeds below 2^64, taking the low word of the rounded integer seed without general modulus. Measure either change in isolation. The ceiling on the aggregate gain from the main stream here is the measured Birth plus Death budget used by the skeleton. | Exact fast path against core vectors plus boundary vectors around 2^32, 2^53 and 2^64. If adopting modular semantics, use new native goldens and define import after precision loss explicitly. |
| **Defer overflow and collation changes pending approval.** | Valid browser tunables can overflow Primordial pressure. A finite native policy needs a specified domain and threshold behavior. New Life Map generation must define stable collation if the JS locale comparator cannot be reproduced portably. Neither is expected to materially reduce the measured per-second work. | Stress configured pressure and edge thresholds, and use graph topology goldens on both platforms. |

Keep browser-compatible provider/trigger/tie order, grouped-effect ordering,
numeric thresholds, terminal detection and row availability where the
implementation can do so cheaply. Deterministic dense IDs do not entail
changing any such order. No cohort-sampling substitution, fractional-clock
quantization, pooled Stock or skipped lunar work is proposed. New gameplay
divergences require a record in the architecture's divergence ledger before
updating parity expectations.
[Determinism hazards](determinism-hazards.md#highest-impact-porting-rules) ·
[Core number conversion](../src/core/js_number.cpp).

## What would invalidate this design

- **Real workload exceeds the budget.** Measure after each N03e cut with its
  reference traces. Measure Birth/Death at the 972-person/181-bin checkpoint,
  Food with price/beneficiary/substitution contention, cascades near their
  configured caps, and action/Vassal runs with large cold histories. The
  skeleton has fixed cohorts, sparse authored listeners and no production
  market payments, modifier system, control, terminal, journal or timed
  Life Map execution. Upper tails from those paths drive stride and frame
  pacing. Add a physical Pixel 6 end-to-end run with UI, sustained warm runs
  and an active previous-generation reader before making a throughput claim.
- **Indexes change a result.** Compare mutation-by-mutation worker, Supply,
  Charge and summary views with ordered recomputes and use browser L1
  traces to find the first unexpected mismatch. Test dirty dependencies
  from the same slot mutation, controller/road changes and time thresholds.
  Fall back to scanning a small site or an ordered listener set when an
  invalidation is uncertain. Require L4 per-second canonical hashes on
  Windows/Android and independent native replay/restore equivalence.
- **Buffers outgrow capacity or copies take too long.** Log peak counts and
  authenticated snapshot bytes from real typed states, including sidecar
  history versions and two retained horizons. If whole-copy anchors or cold
  restore miss the budgets, measure segment restore and bounded replay.
  Choose interval using tail latency alongside memory. If an admissible
  horizon cannot keep both, reduce new coverage instead of degrading scrub.
- **Summary layout stalls scans or requires more history.** Inventory every
  marker and retained graph consumer. Compare an emitted row with a full
  authoritative summary at every second in fixtures. Measure release/acquire
  handoff, frame p95/p99, random restores and input-to-visible on the phone.
  Tune storage and wakeup policy from those results.

## Proposed updates to ARCHITECTURE

- Under **State representation**, adopt the typed runtime, compiled captured
  config and cold version storage. Specify the browser mirror and preservation
  of key order as L0 boundary responsibilities. Keep native saves field-coded.
- Under **Performance stance**, document second dispatch with the exact
  numeric clock, site/trigger indexes, inline summaries, 64-second anchors
  and two-generation budget. Replace the illustrative 16-second restore with
  the 63-second worst-case replay bound and latency targets above.
- Under **Layers and targets**, distinguish today's core-only
  `waffle_bench` from the later ported-kernel benchmark that can also link sim
  and timegraph. Keep timing and IO out of core and sim. Add timegraph worker
  ownership and publication rules.
- Under **Determinism contract**, mark seasonal accumulation, per-person
  rolls and binary64 RNG seeds as retained for the initial native port.
  Approve any later divergences individually and document the exact trace
  coverage to replace.

Questions for the design owner include what graph and marker consumers need
direct per-second fields, what maximum captured content/world sizes to admit,
and how to handle imported preexisting precision loss or finite overflow limits
if native numerical behavior diverges. N03d-2 needs these distinctions between
runtime state and exact interchange. N03e needs the order, the versioned
clock/RNG rules and the measurement checkpoints.
