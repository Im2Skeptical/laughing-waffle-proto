# Prestige shortfall: selected feedback

Cam's selected direction supersedes the original three-option comparison:

- Keep an unaffordable Prestige amount red in the cost panel.
- On a refused press, flash that cost lozenge and the Prestige bank together.
- Share one timing value: both start, pulse, restart on another press, and stop
  together. The flash lasts 900 ms with two gentle pulses.
- Reduced motion uses a steady highlight for the same duration.
- No refusal message, inline deficit explanation or receipt panel.

This is still a throwaway fixture on `proto/prestige-shortfall-feedback`.
Never merge, publish or open a PR. Simulation state, RNG, schemas, replay and
production cost rules are untouched. It serves game-design pillar 2: make
resource constraints legible while composing a build.

Scope: paid Life Map choices, shop reservations, settlement/route choices and
campaign attacks requiring Prestige. Commissions and reward-only actions are
excluded. Refused actions preserve the bank and staged choices. Exact funds
are affordable and produce no warning flash.

Run `npm start` and open its reported origin with
`/?prototype=prestige-shortfall`. Screen selection and developer controls remain
available in the bottom bar. Hold feedback freezes both highlights for capture;
Still uses the reduced-motion treatment. Reset restores the fixture.

[Selected phone-landscape mockup](selected-feedback.png) shows both highlights
at their shared peak, at 844 x 390 CSS pixels with device scale 2. Existing game
art, resource sprites, cost panel and carved-stone skin are reused in Pixi.
Prices and paused Chronicle context remain illustrative fixtures.

Capture/check with `node scripts/prestige-shortfall-capture.mjs <preview-origin>`.
It checks shared animated alpha, repeated presses, simultaneous expiry,
unchanged funds/draft, all five screen fixtures, exact affordability and steady
reduced-motion feedback. Diagnostics go to `artifacts/prestige-probe.json`.

The earlier `option-a.png`, `option-b.png` and `option-c.png` are retained as
historical comparison artifacts from commit `943ae349`; their extra feedback
was rejected. The active prototype now has just the selected direction.
Design references remain game design and the aesthetic/UX guide at PR 49's
head `632476353a53f1a82fc6d71b506eba6343ccf5aa`.
