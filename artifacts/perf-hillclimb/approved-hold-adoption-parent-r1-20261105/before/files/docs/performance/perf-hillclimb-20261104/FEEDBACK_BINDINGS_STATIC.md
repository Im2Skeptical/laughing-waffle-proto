# Actual DOM feedback bindings

Root Builder static review,2026-11-05. **STATIC ONLY / NOT EXECUTED. Phase A NOT SOUND.** No executable source, HARNESS, tests, browser, build, server or simulation was changed/run. The separate Life Builder retains the exclusive execution slot. This is a concrete binding analysis for the pending first-feedback implementation, not an independent audit, measurement or acceptance.

## Source identities

| File | SHA256 |
| --- | --- |
| src/views/game-menu-dom.js |54dae44cccd256b2c65d51a48bb4647b06dc9760b66522ad9c78e72fabbb124b|
| src/views/game-loading-dom.js |fa9c814aeedcf68594451cc43ce04e0184b6ea4f0e8a38b38eb5363473f9d862|
| src/views/save-recovery-dom.js |013273b4651c061e64f032f1223a9358d6aedf022eaa84b48196ad60e5ddbb23|
| src/views/settlement-debug-menu-dom.js |718968693b02f9cdca28699f795563f3d99947967de600b2c78a03b3566b6b70|
| styles.css |ec05c6a73a6ef95d586f39ee307fa9691e80e7167f4e6d7a0b7d07b740134cb0|
| scripts/perf-hillclimb/browser-runtime.mjs |f81efb2accba8b8ae3b7c35db109835c8639aa91c87c7e3ec69541fc608714f1|

These hashes authenticate inspected source, not a served build. Recheck before implementation. Existing runtimev4 leaves firstFeedbackMs:null and has no first-feedback observer.

## J1/J2 and J7 load

`game-menu-dom.js:103-129` synchronously changes into a loading presentation when enter receives a non-null slot. It renders before awaiting display mode, then deliberately yields through rAF plus a task before invoking the heavy action. The visible rendering at193-201 contains heading Preparing your chronicle and the connected `game-loading-details` section. `game-loading-dom.js:5-50` owns a real status paragraph and `game-loading-progress` progressbar, with CSS ink/animation in styles.css:100-117. This is an actual UI change, unlike runner.preparing metadata alone.

Proposed first-feedback cue: transition from no connected loading section to the loading section inside the open, non-hidden game menu, with nonempty status/progress content and no hidden ancestor, followed by a validated rendering opportunity. Do not call session loading/status/model getters. Observe the persistent menu/document root: menu render uses replaceChildren at168, so a listener attached to a prior section can miss replacement. Loading text updates every250ms at421, but that polling interval must not become the timing resolution for first appearance.

Ordinary New Game has separate actual inputs: `game-new` opens the slot picker, while `game-slot-1` launches full opening preparation. The existing main runner times them separately; do not use slot-picker appearance as feedback for the later launch. Prepared Performance New and Continue pass the real performance slot at158-163 and share the loading presentation without browser navigation. Fresh saved-slot Continue also passes a slot at229; in-memory resume at227 passes null and can instead close the menu directly. Keep these paths labelled and do not invent a loading screen for resume. Orientation failure/portrait hint/cancel/error are distinct failure/alternate cues, never successful preparation.

## J7 save: hidden source is not visible acknowledgement

The actual main save job clicks Menu at run.mjs:941-947. `returnToMenu` at379-380 opens the menu after session.openMenu. `show` adds body.game-menu-open and displays the panel at88-94. **styles.css:15-17 hides the utility-controls bar with display:none!important while that class is present.** The runtime's `game-save-status` phase observer and current completion predicate can witness logical save transitions, but that utility button is hidden on this path. Its Saving/Saved text cannot be called visible first feedback or visible save acknowledgement here. Existing native transaction/state proof remains useful; no old run is relabelled invalid in other dimensions.

There is a source-supported replacement to investigate: `game-menu-dom.js:283-285` appends recovery.element inside the menu for nondiagnostic modes; failures append it earlier at192. `save-recovery-dom.js:16-17,38-51` supplies `game-save-summary` role=status, with Saving/Saved, last successful save time/second and failure text. Its section is hidden only when session.canResume is false. `syncSaveStatus` at450-455 updates the recovery text and rerenders on phase changes.

First Menu appearance and visible save acknowledgement are separate cues. Bind the former to the displayed panel. For the latter, validate actual viewport visibility of game-save-summary on each layout in a separate native/screenshot diagnostic, then match its visible successful text to the newly committed native transaction/payload. DOM presence, a changed title or hidden data-phase alone does not prove that acknowledgement is visible. Preserve the current trusted-input start and native I/O endpoint. No extra click, scroll, artificial delay or easier workload belongs in a positive acceptance run just to manufacture feedback.

A very short Saving phase may occur wholly between frames. A MutationObserver receipt alone cannot certify it was painted. Record the actual candidate and frame validation; missing visual acknowledgement must remain an observed product absence/censored response when corroborated, or an unbound harness gap if visibility was never established. Do not silently assign completion time to firstFeedbackMs. Existing hidden phase checks may remain separate causal corroboration.

## J8 progressive preparation and explicit reveal

`settlement-debug-menu-dom.js:122-129` changes the real debug-open seal from its ordinary symbol to a checkmark, changes its title/aria label, and sets data-artwork-ready=true when artwork is ready. styles.css:124-125 increases its opacity. This is a source-backed visible prepared indication; private packed-texture counts alone are not. Establish the seal is displayed outside the menu and workshop, then sample its real symbol/attribute transition with frame validation. Preparation's first visible ready indication is distinct from launch/loading feedback and full hidden-asset preparation time.

Pointerdown adds is-holding at139 and pointerup/cancellation removes it at148-154. styles.css:126 gives that class a different background/glow. A short tap can add/remove the class before any rendered frame; do not count its DOM mutation as painted press feedback automatically. The click at155-157 calls revealArtwork only for an allowed tap and readiness, then synchronizes the seal back to its ordinary state. The persistent seal change and actual illustrated presentation are distinct first-response/completion candidates; both still require current-source and rendering corroboration. Keep the genuine hold850ms behavior and explicit reveal semantics unchanged.

## Next execution

After the Life handoff, implement first-feedback observation using these bindings, frozen operation identities, explicit costs/availability and operation lifetime cancellation. Validate wrong/stale/transient cues, short save phases, an immediate cue with delayed heavy completion, delayed cue, missing frames and queued input. Include the real J7 menu/summary visibility and J8 short-tap case. Matched observer on/off and native rendering evidence remain required. J3/J4/J5/J6 canvas cues still need their own source binding after the Life Builder's final files; this note does not review its changing files or poll its task.

Impact: documentation/read-only source analysis only; state, RNG, schemas, authoritative replay, all official ticks, layering, UI interaction/copy/layout and pacing remain unchanged. No measured performance gain is claimed.
