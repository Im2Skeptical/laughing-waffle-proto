# Output and Capacity Multipliers

Implementation scope confirmed with Cam on 2026-10-23. The visual primary source
is local branch `proto/output-multi-pool`, commit `ec72f622`; that branch remains
the throwaway experiment. This implementation starts from local `main`
`e1d7da6d` in its own worktree and does not publish or integrate the prototype.

## Agreed mechanics

- Output Multiplier and Capacity Multiplier are independent additive pools,
  each starting at ×1. Matching contributions add to the named multiplier.
- Output Multiplier scales generated Stock; capacity still caps retained Stock.
  Activation cadence, input recipes and Charge gain are unchanged.
- Plains contribute +1 Output Multiplier per contiguous region to Grain Stock,
  including Milling. Mountains do the same for Stone; forest for Construction.
- Count the shared-edge, same-biome component containing the settlement,
  including its own region and regardless of ownership. Disconnected patches and
  other biomes do not join that component.
- Construction is the existing Stock Trait, including matching Quarrying,
  Carpentry, Masonry and other producers, not only Logging.
- Granary keeps its existing Capacity Multiplier effect. The prototype's extra
  +2 Output bonus, Edible output scope and +0.5 biome coefficient are discarded.
- Existing flat output bonuses retain their place in the base-yield calculation;
  they do not become multiplier contributions. Scheduled Stock uses that base
  yield ? Output Multiplier ? workers, rounded down, then the existing post-yield
  numeric bonuses; Charge Stock uses no worker output multiplier. Capacity limits
  retained Stock afterward. New multiplier effects use a distinct data operation;
  neither pool automatically contributes to the other.
- Replace player-facing “Stock Power” with “Capacity Multiplier”; use “Output
  Multiplier” for the new pool. Compact fittings use their symbolic identities.

## Agreed presentation and interactions

- Symbol-only Output/Capacity pairs per Stock-producing Practice on settlement boards, including
  the regional settlement panel and shop's settlement window.
- Practice offers preview both multipliers. Structure offers update affected
  settlement fittings on hover and reservation, without their own multiplier pills.
- Completion previews use isolated boards at current conditions. Only staged
  and prospective Structures are treated as complete; unrelated construction
  remains pending. The live simulation receives bonuses only on real completion.
- Changed values show their delta and attached hourglass. Purchase, placement,
  reorder, undo and discard update the reading through existing controllers.
- Compact carved contribution ledgers support hover, click/tap pinning, nested
  source inspection, bounded scrolling, source identities and pending markers.
- A distinct base-amount block sits above multiplier contributors. Output shows
  authored Stock yields by season/activation; Capacity shows its amount before
  multiplication, with Practice/Quality/Scholar parts when applicable. The header
  shows the accumulated multiplier and no longer repeats a tiny “Base ×1”.
- Hovering any part of an offer, including price/frame, shows its compact reading
  immediately beside that buy slot. Overlap to its right is an accepted tradeoff.
- Discarding newly reserved construction undoes its purchase and releases its
  reserved costs, restoring displaced Structures. Existing demolition is retained.
- Construction readings show actual per-phase costs; construction recipe icons
  are larger. Delve, prices, card/art dimensions and unrelated navigation retain
  their normal layout. Prototype selectors and boot fixtures are not player UI.

## Validation

Verify target traits, component boundaries, ownership independence, additive
composition, actual scheduled/Charge Stock yields, unchanged capacity and Charge
gain, pending/completed Structures, no Granary output bonus, pure previews,
source provenance, save/clone/worker/replay parity and actual phone/desktop UI.
Run the repository verification and the focused mouse/touch shop probes. Record
the final local commit, preview identity and actual game screenshots at handoff.


## Local review

Run `npm start`, then use the ordinary game screens. `npm run probe:multipliers`
checks a disposable real-game session through the existing Gym handoff. It uses
`http://localhost:5193/` by default; set `MULTIPLIER_PROBE_URL` for another local
preview. It exercises whole-slot/price hover, completed-result reservation,
discard refunds, pinned nested sources, mouse/touch, regional/detailed boards
and Practice shop pairs. It never writes player saves or starts a preview server.

Actual game captures (844 ? 390 phone landscape, plus desktop):

- [Compact ledger and pending sources](prototypes/output-capacity-multipliers/phone-ledger.png)
- [Buy-slot construction preview](prototypes/output-capacity-multipliers/phone-building-preview.png)
- [Regional settlement panel](prototypes/output-capacity-multipliers/phone-region.png)
- [Seasonal output base ledger](prototypes/output-capacity-multipliers/phone-output-ledger.png)
- [Detailed settlement](prototypes/output-capacity-multipliers/phone-settlement.png)
- [Practice shop](prototypes/output-capacity-multipliers/phone-practice-shop.png)
- [Desktop ledger](prototypes/output-capacity-multipliers/desktop-ledger.png)

The Gym badge identifies disposable review state. The +1 biome coefficient is
intentionally untuned: a six-region plains patch gives Grain ?7, so unchanged
capacity can bind quickly. No economy or balance changes compensate for it.


Verification commands: `npm run verify`, `npm run probe:multipliers`, and
`npm run probe:settlement-draft`. The focused model test additionally compares
exact serialized save continuation, authoritative replay and forecast state.
The browser probes cover seven individual contributors in a bounded scrolling
source list, real reservation/discard refunds, and existing desktop/touch
placement, reorder, undo, upgrade, Confirm and replay behavior.
