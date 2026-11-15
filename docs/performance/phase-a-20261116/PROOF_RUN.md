# PROOF_RUN — HC-20261116-A1

Builder construction evidence only (WP1–WP3c). WP3c cleared the mobile 4× drag controls on attempt 2. The 3-rep stability suites (WP4–5) have **not** been run (deferred to the next session by the orchestrator). There is no proof run and no proposed SOUND verdict.

Construction status (details, numbers and raw paths in `STATE.md`; committed raw JSON under `docs/performance/phase-a-20261116/runs/`):

- WP1 PASS (re-base v1.1.69, loss 6138, Node controls, browser controls, verify green).
- WP2 PASS (A1-01 pre-dispatch stall, design 2).
- WP3 PARTIAL PASS (ordinary New Game desktop drag + controls, r3).
- WP3b: prepared playing start PASS; desktop 1× 5×4 interleaved arms incl. A/A and all controls PASS (`wp3b-repeat-desktop-r2`); mobile 4× touch correctness/wrong/A-A PASS, delay PASS at n=10, **deferred FAIL ×2** (`wp3b-repeat-desktop-r2` mobile section, `wp3b-repeat-mobile-r3`).
- WP3c PASS on attempt 2 (`wp3c-mobile-a2`): mobile 4× touch, carry-over- and position-balanced order, 5 s settle gap, n=21/arm. A/A −127 [−385, +135] ms; delay +926 [718, 1381]; deferred +697 [451, 1024]; carry-over −50 [−278, +332]. Attempt 1 (`wp3c-mobile-a1`) failed delay/deferred against the A/A envelope. Mobile 4× resolution ≈ 0.4 s per-drag median at n=21.
