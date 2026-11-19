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
playable edit is a reorder in a Vassal's Practice shop. The player stages the
move, sees its quoted time cost and confirms. The actual shop actions apply
on a working copy and replay advances to their scheduled resolution. A rejected
batch leaves the live state and journal intact. An accepted change publishes a
new live readout and starts a forecast from the replay base and updated
journal. The application drops old coverage, pending requests and displayed
previews at generation changes.

## Timegraph

The population strip reads every-second summaries in bounded batches and keeps
a screen-sized envelope for drawing. Newly read coverage becomes browseable
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
The importer opens a v52 generated regional state or a v33 runner save with
compatible captured content and a ported journal. It opens the live frontier
and rebuilds its own anchors. Browser presentation preferences, checkpoints and
persistent knowledge overlays are outside this slice.

No simulation rules, RNG draws, wire schema, or replay ordering change. Only
application scheduling and the benchmark use wall time. The headless loop and
the Windows capture share the session path. The test compares the displayed
restore's authoritative digest with `rebuildStateAtSecond` from the same base
and journal. Measure worker reconstruction, summary transfer, render and
input-to-present independently, alongside startup and process memory.

## Run on Windows

From the worktree root after linking the shared toolchain:

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset optimized
cmake --build --preset optimized
ctest --preset optimized --output-on-failure
Pop-Location

$game = 'native/build/optimized/waffle_native_game.exe'
& $game --seed 42
& $game --load native/reference/fixtures/seed-1/state-0.json
& $game --smoke --seed 42
& $game --seed 42 --capture artifacts/n04d
```

With seed 42, select the capital (R12), choose the Philosopher and enter
Practice Reform. Choose a specialty, inspect Fallow Fields and drag it one
slot right or select **Move right**. Confirm the staged board and wait for the new forecast ink. Press or
drag on the population plot to hold a read-only preview. Click **Live** to
return to the committed settlement. Use the **New Game** button to start again
with the command-line seed. Press Escape to close the window.

The [N04d WORKPLAN entry](../WORKPLAN.md#n04d---windows-connected-playable-slice)
records the full parity and benchmark commands, measurements and captures.
