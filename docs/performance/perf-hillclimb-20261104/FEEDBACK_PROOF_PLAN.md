# First visible feedback gap

Root Builder,2026-11-05. Design only; **UNIMPLEMENTED / UNEXECUTED**. Phase A NOT SOUND. Existing runtimev4 correctly records firstFeedbackMs:null; terminal readiness must not be relabelled as first feedback.

The required quantity is trusted-input timestamp to the first action-related visible response, separately from completion/usefulness. Use an explicitly named visual cue for each operation and a before-input baseline. A controller job/worker reply, loaded texture, decoded state or logical open flag by itself is not evidence of a visible response. Retained view/presentation state plus a subsequent rendering opportunity can be a labelled browser proxy, independently corroborated on a representative real canvas/DOM path. No physical scanout or Pixel6 claim follows from double-rAF.

Implementation should use an opt-in separate observer or carefully versioned runtime extension, with no idle/hot-path app work. Sample the retained cue after the first real handler/input, preserve its own predicate-read CPU cost and availability, invalidate transient/wrong-source observations, and retain a frame-opportunity timestamp separately from semantic change. Do not wait for a gesture's final event before beginning this measurement. Do not move completion markers or remove intentional reveal/input-lock pacing. Unknown/missing cues remain null with a reason and block claims for the corresponding required step.

FEEDBACK_CANVAS_BINDINGS_STATIC.md pins the actual applied camera transform, panel pose and retained scrub draw signature. A first-feedback candidate must not reuse terminal completion's exact inputCount invalidation on repeated armed-type events. Current pan/scrub jobs arm pointerdown, so their move stream does not increment that counter; desktop zoom arms wheel. Keep final completion validation unchanged and give first feedback its own source/visual-cue lifetime. Add actual down/move/up pan, two-contact pinch and separate repeated-wheel controls with early motion/delayed final completion; repeated pointerdowns alone are not a pan model.

Before implementation, bind actual visible cues for:

- J1/J2: actual displayed launch/loading feedback, then separate full opening/Continue useful endpoint. runner.preparing alone is insufficient.
- J3: retained camera/view response to first pan/pinch input; Settlement opening/closing motion or actual visible surface change. Keep final offered-load response and drop accounting separate.
- J4/J6: actual Life surface/choice/acquisition feedback and confirm processing/closing feedback, each separate from paid-time result/recap. Inspect actual rendered decision identity, not only controller processing.
- J5: actual graph playhead/view response during the unchanged multi-event scrub, separate from fully correct target restore and usable preview.
- J7: first Menu appearance, then separately visible game-save-summary acknowledgement; load launch feedback and correct interactive continuation separately. The utility game-save-status is hidden by styles.css while Menu is open and cannot supply a visible cue for the current save path. Native transaction completion remains the I/O endpoint. See FEEDBACK_BINDINGS_STATIC.md for the exact current source and required viewport/short-phase controls.
- J8: actual displayed preparation/reveal status or presentation change; hidden private asset counts are not visible feedback. Keep first asset call, full preparation and explicit reveal completion distinct.

Validity controls must reject a wrong/stale cue and transient baseline change; distinguish immediate feedback plus delayed completion from delayed feedback; retain true input queue delay; fail closed on missing frames/observer failure and enforce operation lifetime/cancellation. Include a real input-driven known renderer delay and independently recorded native trace/render/counter evidence. Intrusive trace/screenshot/heap/full-state work belongs in matched diagnostic runs or declared outside-clock windows.

Match observer off/on and private-hook/reference A/A on representative real jobs and both desktop/mobile4 proxies, randomizing/interleaving order under a frozen schedule. Record raw samples, predicate/observer costs and uncertainty; do not call an unexplained small delta negligible or certify frames after discarding contaminated intervals. All raw telemetry and failures remain retained. Auditor acceptance is required before these quantities enter scored claims.

Next root implementation follows the private-Life Builder and exact source handoff. This plan adds no measurement or product behavior and is not harness acceptance.
