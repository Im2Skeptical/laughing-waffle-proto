# HARNESS_REVIEW — 2026-11-12

**PROOF: NOT AUDITED.**

Cam's instruction for this wrap: a separate independent auditor will be run after browser proof exists; this file stays **NOT AUDITED**. Same-agent self-review is not acceptance.

Browser proof now exists (see `PROOF_RUN.md` and artifacts under `artifacts/perf-hillclimb-20261112/proof-browser-1230/`), but no Auditor pass has been started. Round count this resume: 0 Auditor rounds. Audit budget remaining: 5. Do not enter Phase B.

A later Auditor must:

- Be a distinct pass from the Builder (a second agent, or an explicit operator-authorized independent review).
- Inspect the exact harness revisions (hashes in `identities.mjs` / a proof `identities.json`) and raw run ids, not just the Builder's conclusion.
- Independently re-run `statistics-test.mjs` and the validity controls; independently recompute `summarize()` from raw JSON artifacts.
- Reproduce A1-01 (stall after input arrival — the Builder recorded a **FAIL** on this control), A1-04 (timeouts not dropped), A1-05 (instrument-off does not wrap Worker) from raw evidence.
- Treat `runner.baseSeed` during opening *preparation* as the idle live runner (devPlaytesting `rngSeed` 12345). The frozen fixture is only on the live runner after `enter()`.
