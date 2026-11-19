# N04a headless timegraph

`waffle_timegraph` depends on `waffle_sim`, `waffle_core` and standard
threads. Simulation rules, randomness, saved fields and action ordering stay
in sim. Timegraph adds no save fields. It owns forecast work and summaries;
the future controller owns live actions, committed history and reveal.

## Sessions and generations

A session accepts an admitted second-boundary state, an immutable action
journal, and an inclusive target second. The boundary can precede the actions
at its second (as in native replay) or already include them (as in the browser
worker). Initialize the replay clock and apply each scheduled action in journal
order once. Publish the boundary and every successful subsequent second after
its actions. On Monster Overrun or territorial loss, publish the terminal row
and stop at that second. A rejected action or replay error ends at the last
complete published boundary and reports failure.

The caller gets a generation ID when submitting work. Each edit or committed
action starts a new generation using the relevant authoritative boundary and
journal. Starting or cancelling invalidates work immediately under the same
lock that publishes results. The worker checks for supersession at second
boundaries and before delivering restores. Pending obsolete requests resolve
as such. The controller associates each asynchronous result with its
generation, so it can also reject a result delivered before a later edit.

Starting a generation can retain the outgoing generation through an explicit,
previously revealed second. Its rows and private anchors remain available for
comparison and scrub under the old generation ID and journal. Drop coverage
past that boundary and replace any older generation. The controller can also
release the previous generation when its reveal catches up. On New Game, the
controller waits for completion through the opening horizon (or earlier
terminal/budget boundary) before enabling play. Incremental results support
later reveal and do not determine what the controller makes browseable.

## Worker and read API

One simulation worker owns the mutable forecast state. It also services
asynchronous restore requests submitted from any thread, checking for them
between forecast seconds and prioritizing them over the next forecast step.
At most one pending scrub target is queued; a newer request supersedes it.
Each result identifies its generation and second. Completion of a started
restore requires at most 63 replay steps. Shutdown wakes and joins the worker
and resolves queued requests.

Publication is atomic at second boundaries. Readers can query generation
status and copy up to 64 ready typed rows per call into caller storage. They get no pointers
into the store, so reads cannot retain retired pages or mutate cached anchors.
Restores copy the nearest preceding private anchor into independent mutable
storage, then replay only to the target. The controller can use the reported
coverage to enforce reveal and retry any target requested before publication.
Only scheduling and measurement may depend on elapsed wall time.

## Summary and storage

Use a fixed-layout header and dense per-region records in world order. The
header holds second, year, terminal and Vassal markers, civilization-wide
population, free workers, Food, Currency, Housing, Chaos, raw Chaos income,
resistance, Monster count and Prestige. Civilization population, Stock and
Housing fold player-held detailed regions in authored order. The per-region
record holds population, Food, Currency, Housing, holder support, Unrest,
Holding Force, Required Force, and villager/stranger population, free
workers, Faith and Happiness. Civilization-wide series also serve the local
graph. Rich tooltips and inspection come from restore. At 20 regions the
typed payload is 2,728 B per second on Windows x64.

Anchor the starting second, each 64-second boundary relative to the start,
and the final second if off-stride and storage permits. Hold value snapshots
of the RuntimeState. Store large flat value columns in immutable blocks and
reuse identical blocks from the preceding anchor where rows have a stable
object representation or an explicit field comparison. Materialize fresh vectors
on restore. Captured content and the sim's existing immutable history
records keep their normal sharing rules. This is an in-memory representation;
compare canonical state hashes, never hashes of process pointers or padding.

Budget forecast storage at 256 MiB across the current and one previous
generation. Charge allocated summary pages, journals, indexes and anchor
copies, counting retained shared blocks once. Charge each history arena's
retained slabs once across generations, including live blocks, recycled
blocks, unused capacity and slab headers. Reserve the observed high-water
capacity of runtime tables for the forecast worker and one independent
restore, including the worker's summary scratch row. Admitted immutable
content is shared with the caller. Heap fragmentation and scratch outside
the measured runtime buffers are estimated by comparison with process
private bytes in the N04b benchmarks.

Admit storage at complete boundaries. The worker checks headroom before
each speculative step and can stop a new history slab reservation before
allocating it. Under pressure, finish at the last admitted second and keep
the retained prefix, dense summaries and 64-second restore bound. Restores
can allocate to complete a scrub even when forecast admission has stopped.
The ledger includes any resulting arena growth while the arena stays
attached. The caller owns any independent states returned by restore.

Timegraph allocates a summary page (header and site buffers) every 64
seconds. An anchor adds its independent value buffers, column manifest, and
blocks that changed or require private copies. A restore request allocates
its result channel and an independent runtime copy. Ordinary summary writes
use a fixed per-session scratch row and existing page space.

## Evidence

Check the worker against the single-threaded parity run for every row and
anchor, including action boundaries. Exercise concurrent scrub, replacement,
cancel, retention, terminal reasons and storage exhaustion. Keep the sim
allocation gate unchanged. Benchmark ordinary terminal runs alongside the
labelled N03g longevity fixture on the two optimized Windows compilers.
Record throughput, restore tails and storage separately in N04a. Physical
device and input-to-visible measurements belong to the connected slice.

The browser's scoped summaries, generation invalidation and independent
restore are the behavioral reference. Its opening and retention policy is
described in the [timegraph brief](../../docs/timegraph-ux-and-capacity-brief.md).
The [guardrails](../../docs/timegraph-optimisation-guardrails.md) and
[native performance architecture](../spec/performance-architecture.md)
record the browser evidence and the native stride and latency budgets.
