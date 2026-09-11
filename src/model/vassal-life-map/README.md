# Vassal Life Map modules

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public API; internals live here.

## Files

- `selectors.js`
  - Lineage/current/graph/node getters, committed and playhead node ids,
    age, prestige/development income, stat presentation, cost helpers,
    and candidate-pool reads. Also holds shared clone/shuffle/site
    helpers so shop, lifecycle, and presentation stay acyclic.
- `shop.js`
  - Shop inventory builders, purchase/undo/reorder/move/reroll, staged
    reservations, and structure placement helpers.
- `lifecycle.js`
  - Initialize, candidate reroll/select, enter, option select, confirm,
    finish, development choices, `stepVassalLifeMapSecond`, pending
    resolution, node display state, and validate.
- `presentation.js`
  - `getVassalNodeDecisionPresentation`, `getVassalGamepiecePresentation`,
    regional map presentation, and option projection.

## Public entrypoints

Import these from `src/model/vassal-life-map.js`:

- Civilization: `initializeVassalLifeMapCivilization`, `stepVassalLifeMapSecond`
- Shop/confirm: `purchaseVassalShopOffer`, `undoVassalShopPurchase`,
  `reorderVassalShopPurchase`, `moveVassalShopStructure`, `rerollVassalShop`,
  `confirmVassalLifeNode`
- Presentation: `getVassalNodeDecisionPresentation`,
  `getVassalGamepiecePresentation`

Topology generation stays in `src/model/vassal-life-map-generator.js`.
