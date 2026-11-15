# PROOF_RUN — HC-20261116-A1

Builder construction evidence only (WP1–WP3b). WP3b stopped on the mobile 4× deferred-completion drag control (failed twice), so the 3-rep stability suites (WP4–5) have **not** been run. There is no proof run and no proposed SOUND verdict.

Construction status (details, numbers and raw paths in `STATE.md`; committed raw JSON under `docs/performance/phase-a-20261116/runs/`):

- WP1 PASS (re-base v1.1.69, loss 6138, Node controls, browser controls, verify green).
- WP2 PASS (A1-01 pre-dispatch stall, design 2).
- WP3 PARTIAL PASS (ordinary New Game desktop drag + controls, r3).
- WP3b: prepared playing start PASS; desktop 1× 5×4 interleaved arms incl. A/A and all controls PASS (`wp3b-repeat-desktop-r2`); mobile 4× touch correctness/wrong/A-A PASS, delay PASS at n=10, **deferred FAIL ×2** (`wp3b-repeat-desktop-r2` mobile section, `wp3b-repeat-mobile-r3`).
