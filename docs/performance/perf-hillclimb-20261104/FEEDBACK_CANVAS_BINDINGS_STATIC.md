# Applied canvas feedback bindings

Root Builder static analysis,2026-11-05. **STATIC ONLY / NOT EXECUTED. Phase A NOT SOUND.** The Life Builder retains its exclusive execution slot. Root changed only this note and related root-owned metadata; no executable source/HARNESS, tests, build, browser, server or simulation. No task polling. Read guardrails/current timegraph documents and relevant routing/folder maps before source review. This is not independent acceptance or performance evidence.

## Inspected identities

| File | SHA256 |
| --- | --- |
| src/views/world-map-pixi.js |dab0eb94d73c4d8091cf196228a0d5a615b6f611b104078c6ae77388129ce3c5|
| src/views/world-map/camera.js |dc99613c14bd039aa9217a74a1edc43ea895ddb0804c3a8a78caa348e505940c|
| src/views/world-map/transitions.js |418818aaa7c8abd60525effd0a81c9c6ea847b86e63c20f47dd03148ce1cc40e|
| src/views/timegraphs-pixi.js |515acd487d4b42d53cd06ec09b78558a0b543488f5eee2e0184c6fababf124c5|
| scripts/perf-hillclimb/offered-input.mjs |dd92f961f1a0ce3efc0aa2f64a5ea789f7aa69403fb5a9e7734d89ec7843dfc0|
| scripts/perf-hillclimb/browser-runtime.mjs |f81efb2accba8b8ae3b7c35db109835c8639aa91c87c7e3ec69541fc608714f1|

These are source hashes, not served-build identity or executed proof. Recheck after the Life handoff.

## J3 pan and pinch

`camera.js:12-24` clamps x/y/zoom, then writes the PIXI world's actual position and scale. `camera.snapshot` at133 copies those applied values; it does not return the future focus target. Focus update writes through that same apply function at26-28. Thus the existing passive raw map camera DTO has a source-supported applied-transform meaning, although it still does not prove a submitted/presented GPU frame.

Pointerdown at44-52 registers contacts and changes the cursor. Single-pointer world movement at58-73 begins only after distance from its start exceeds8px. Do not eliminate this intentional threshold or start the clock at the first move as a performance shortcut. Preserve the first trusted input timestamp, record the event at which a pose first differs from baseline, and include the offered interval/threshold delay. Two-contact pinch sets moved=true when the second pointer arrives, but actual zoom/position changes occur on subsequent motion through zoomAt/apply. A pointer receipt alone is not visible map movement. Bounds may prevent some individual events from moving the map; keep those events and final workload correctness, not an invented one-event/one-frame rule.

`offered-input.mjs:24-30` currently attaches a passive camera sample after double-rAF to received contacts; its summary at92-104 explicitly calls this a frame opportunity, not scanout. This is useful offered-load/queue evidence, not first visible movement or proof that each contact caused a distinct rendered frame. Preserve that scope. A new first-feedback observer should require actual camera difference from the pre-input baseline on the correct visible source, then a validated rendering opportunity plus representative native render corroboration. Keep drops/coalescing/contact identities and final gesture outcome separate.

## J3 Settlement opening and closing

`transitions.js:34-46` applies panel position/scale and visible/eventMode state; opening begins from a collapsed6%-scale pose, closing starts from the current applied pose and only changes it as the transition updates. `snapshot` at72 copies actual position/scale alongside phase and animation state. `world-map-pixi.js:1035-1041` updates camera/panel before normal render. Its cheap timing DTO at1117-1126 currently exposes visibility, camera, panelPhase and panelAnimating, but not the applied panel pose.

Opening detailVisible plus a nonzero applied pose can support a first surface-response proxy. Merely observing closing phase is weaker: phase changes before the first close-motion update, while the initial applied pose can still equal baseline. For first closing motion, investigate an opt-in copy of already retained panel position/scale, or a narrowly scoped diagnostic render witness. No new per-frame counter/state body is necessary. Do not substitute final panel disappearance for first motion without explicitly labelling it an upper bound. Do not change240/320ms presentation pacing and count it as compute gain.

## J5 scrub playhead versus restored preview

`timegraphs-pixi.js:1952-1987` builds a signature from scrubbing flag/second, cursor second, committed frontier, bounds, status, metric and installed forecast-preview second. It stores lastScrubSignature before clearing/redrawing the actual marker graphics. This is already retained draw-input metadata. In contrast, the cheap DTO at2257 onward returns raw scrub/reveal/controller fields; its scrubSec alone is not evidence a marker was redrawn. Its retained plot transform can lag layout by design.

Investigate a pure opt-in copy of the existing lastScrubSignature and actual retained marker/view state after the Life handoff; do not introduce per-frame full states or call drawScrub/getPlotSnapshot from an observer. Those paths resolve metrics, call active cursor/controller getters and can warm/synchronize state. Signature changes describe issued graphics commands, not GPU presentation; native render/frame corroboration remains necessary. Preserve natural reveal clamps and no target warming before the timed scrub. First playhead/preview response and full target16/17 correctness/usefulness remain separate quantities.

## First-feedback lifetime must differ from completion lifetime

Runtimev4 deliberately invalidates terminal completion on every **matching armed event type** at121 and revalidates the candidate's exact inputCount at18. Correction after direct caller inspection: run.mjs:132 defaults to pointerdown, so ordinary pan/scrub moves do not increment this counter; a two-contact pinch supplies two pointerdowns. Desktop zoom explicitly arms wheel at703. A repeated stream of armed-type events, such as wheel, would repeatedly cancel the same double-rAF candidate if first feedback reused that rule. This is a general first-feedback lifetime constraint, not an observed pan-move reset defect in the current runtime.

A separate first-feedback candidate must keep the original operation start and baseline, allow subsequent same-source gesture input while the response remains present, and invalidate only a vanished/wrong-source/failed visual cue. The first camera change can remain true as later moves continue. Preserve event ordering, operation cancellation/deadline and queued-input timestamps. Do not weaken final terminal validation to accommodate first feedback. Add a genuine down/move/up60Hz pan control, a two-contact pinch control and a separate repeated-armed-wheel-event control, with early response and delayed final completion. The first-feedback marker must precede the final event; do not simulate repeated pointerdowns and label it an actual pan. Also cover genuine transient motion that returns to baseline before any frame, bounds/no-motion, missing frames and operation/source replacement.

## Scope and next step

The next root implementation combines this note with FEEDBACK_BINDINGS_STATIC.md after the Life Builder's fixed-source handoff, then runs focused/actual controls and matched overhead/native diagnostics. J4/J6's changing Life/modal files are intentionally outside this static review. No existing construction run is relabelled first-feedback proof. State/RNG/schemas/replay/official ticks/layering/gameplay/UI behavior remain unchanged by this documentation.
