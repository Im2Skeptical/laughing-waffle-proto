# Prestige shortfall feedback — throwaway comparison

Question: where should a player learn why an attempted Prestige reservation or
spend cannot happen? Three alternatives, not a sequence of upgrades.

Local branch: `proto/prestige-shortfall-feedback`. Keep local; never merge,
publish or open a PR. No option has been selected for implementation.

## Design basis

Read [game design](../../game-design.md) first, then the aesthetic/UX companion
from [PR 49](https://github.com/Im2Skeptical/laughing-waffle-proto/pull/49),
[aesthetic/UX guide at the pinned head](https://github.com/Im2Skeptical/laughing-waffle-proto/blob/632476353a53f1a82fc6d71b506eba6343ccf5aa/docs/aesthetic-ux-design.md).
These sketches use the actual Pixi renderer, shared stone/brass skin, resource
sprites, cost footer and existing paintings at 844 × 390 phone landscape.
They preserve the selected choice and paused Chronicle context. The static
Chronicle line is illustrative, not a calculated projection.

Task reference: [Trello](https://trello.com/c/SEpiEn2g). Its contents could not
be read: web access failed and the collaborative browser timed out twice.
The supplied task brief is the scope authority here.

All three primarily serve **pillar 2: assemble builds under limited resources,
space and time**. Showing affordability lets the player compare immediate
capability against other investments. No debt, new income rule, compulsory
path, automated purchase or forecast of when Prestige will be earned is added.

## Shared scope and baseline

| Surface | Include | Affordability source for production |
| --- | --- | --- |
| Life Map node options | Options that spend Prestige, including failed footer/Confirm attempts | Adjusted option cost against the current Vassal's bank |
| Shops | Reserve/stage and final confirmation of purchases | Available Prestige after the current purchase draft; recheck at Confirm |
| Settlements and routes | Paid founding/building/connection actions on Crossroads or their corresponding offer | Authoritative selected action cost and current bank/draft availability |
| Campaign attacks | Attacks whose selected action requires Prestige | Campaign resource snapshot and selected attack cost; keep Food/risk checks distinct |
| Commissions | Excluded: they award Prestige | No shortfall treatment |

Zero-cost and reward-only choices do not get warnings. A Food, capacity, history,
or other eligibility failure must not flash Prestige if Prestige is sufficient.
Do not recolour unrelated costs just because Prestige is missing.

In every option the unaffordable Prestige amount is red, and an unaffordable
reserve/spend attempt highlights the bank. The control still receives presses
to explain its rejection; inspection stays available. No failed attempt spends
Prestige, advances time, closes the screen, or changes the draft. Text supports
colour. Repeated attempts restart the short highlight rather than stacking
notifications. Reduced motion uses a steady highlight.

## Three alternatives

Build costs below are rough **production engineering estimates**, including
integration across the four surfaces and focused checks. They are not measured
prototype effort or commitments.

| Option | Behaviour and scope | Pillar served | Build cost | Risks |
| --- | --- | --- | --- | --- |
| **A — Signal at the bank** | All paid surfaces. On refusal, pulse the bank and briefly show “Not enough Prestige” directly below it. Fade after 1.8 seconds; retain red cost. No new persistent layout. | 2: make the resource constraint visible at the moment of choice. | **Small, 0.5–1 day.** Shared feedback event and bank pulse; wire refused footer/Confirm actions. | Eye travel from the pressed choice to the bank; transient copy can be missed; does not explain reservation arithmetic. |
| **B — Explain at the choice** | All paid surfaces. Keep a compact, persistent “12 available / 20 needed · Short 8 Prestige” strip beside the selected action, before a failed attempt. Shops also name the amount held by the draft. Refusal still highlights the bank. Recompute on selection/draft/bank changes. | 2: compare the exact sacrifice needed while opportunities remain visible. | **Medium, 1–2 days.** Shared shortfall readout plus selected-action layout space on each screen. | More text and tighter phone layout. Restrict to the selected action; never add a warning paragraph to every offer. |
| **C — Open the receipt** | All paid surfaces. Refusal opens a bank-anchored receipt: bank, reserved, available, selected cost, shortfall. It stays until closed, Escape, selection change or screen exit. The bank highlight fades independently. Shops benefit most from the reservation breakdown. | 2: expose how staged investments consume the limited budget; also supports pillar 1's build composition. | **Larger, 2–3 days.** Shared anchored receipt, draft labels, dismissal/focus rules and phone positioning. | Can cover comparison context and adds a dismissal step. A cost-only Life Map choice rarely needs a five-row receipt. Keep it nonmodal and never require confirmation to acknowledge failure. |

**Recommendation for a first implementation:** B, shown only for the selected
unaffordable choice, with Cam's bank highlight on attempted reserve/spend.
It explains the gap before the player presses and retains the explanation long
enough to read. Choose A if minimal layout change is the priority. C is worth
considering only if staged-shop accounting proves to be the main confusion.

## Run and compare

1. Run `npm ci` if needed, then `npm start` in this worktree.
2. Open the reported origin with
   `/?prototype=prestige-shortfall&variant=A&screen=shop`.
3. Switch A/B/C with the bottom arrows or keyboard Left/Right. The URL keeps
   the choice. Screen switches cover Life Map, market, route, settlement and attack.
4. Tap the cost footer or action to reject a purchase; **Try action** does the
   same through a dev control. **Exact funds** exercises the equality boundary.
   **Reset** restores the shortfall fixture. **Undo reservation** releases the
   illustrative shop reservation. **Still** disables the pulse. **Hold feedback**
   freezes the short highlight for screenshots only.

Prices/content are representative fixtures, not proposed balance. The shop
example has bank 18, already reserved 6, available 12 and selected price 20:
shortfall 8. Other surfaces use bank 12 and price 20. No persistence, runner,
simulation state, RNG, schema or replay code is touched. The route is explicitly
opt-in and imports no live game controller. The switcher is prototype-only.

## Committed screenshots

All use the same shop state, immediately after a refused reserve with feedback
held. PNGs are 1688 × 780 pixels (844 × 390 CSS pixels at device scale 2).

- [A — Signal at the bank](option-a.png)
- [B — Explain at the choice](option-b.png)
- [C — Open the receipt](option-c.png)

Recapture with `node scripts/prestige-shortfall-capture.mjs <preview-origin>`.
The capture checks all three variants across the five fixture screens, reserve
rejection without bank/draft mutation, exact affordability, expiry, keyboard
variant wrapping, console errors and a 1280 × 800 desktop screenshot. Detailed
results are generated under `artifacts/`, not committed.

Validation: `npm run verify` passed. Final documentation, source reachability,
architecture and build checks passed; the touch capture passed all three
variants, including the rendered cost footer/action controls and undo-reservation
availability. Phone and desktop captures were visually inspected.

These are rendered layout/interaction mockups. Production cost selectors,
failure wiring, screen-specific geometry and accessibility integration remain
implementation work after Cam chooses an option. No decision is promoted here.
