# N04d Windows connected slice

The session owns a base state, its action journal and a live second-boundary
state. The application thread owns SDL, RmlUi, selection and the displayed
view model. Loading, New Game, replay to a saved frontier, and action execution
run off that thread. The existing `waffle_timegraph` worker independently owns
the forecast cursor, summary storage, anchors and priority restore queue. The
application polls for ready work and keeps drawing while workers run.

## Live play

New Game builds from the chosen seed and the captured ordinary browser config.
Browser state JSON enters through the sim adapter. A runner save can also
supply a base, a journal and a committed frontier. The opening remains gated
until the forecast reaches its requested horizon or an earlier terminal or
budget boundary. Gameplay uses the browser's held decision boundaries.

The presentation receives value readouts of region locations, roads, holders,
settlements, Practice slots, card details and available decisions. It sends
selections and commands by ID. The Practice overview is read-only. The first
playable edit is a reorder in a Vassal's Practice shop, staged before a separate
confirmation. The sim supplies candidate, shop and eligibility data and applies
the existing journal action kinds. A rejected batch leaves the live state and
journal intact. An accepted change publishes a new live readout and starts a
new forecast from the replay base and updated journal. The application drops
old coverage, pending requests and displayed previews at generation changes.

## Timegraph

The strip reads every-second summaries in bounded batches and keeps a
screen-sized envelope for drawing. Newly read coverage becomes browseable
after the opening. Pointer press and drag move the playhead on that coverage.
The session submits a priority restore and accepts a result only for the
current generation and latest requested second. A ready restore replaces map
and board readouts together. Releasing the pointer holds the read-only view.
Live returns to the held frontier immediately and invalidates the preview.

## Scope and checks

The Windows slice covers a single Practice shop board edit. Full Life Map,
general shop merchandising, native save slots, full regional illustrations,
historical editing, old forecast overlays, animated reveal and Pixel validation
are later work. Browser files and art are read-only inputs.

No simulation rules, RNG draws, wire schema, or replay ordering change. Only
application scheduling and the benchmark use wall time. The headless loop and
the Windows capture share the session path. The test compares the displayed
restore's authoritative digest with `rebuildStateAtSecond` from the same base
and journal. Measure worker reconstruction, summary transfer, render and
input-to-present independently, alongside startup and process memory.
