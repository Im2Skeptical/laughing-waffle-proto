# Vassal Life Map modules

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public API; internals live here.

## Files

- `selectors.js`
  - Lineage/current/graph/node getters, committed and playhead node ids,
    age, prestige/development income, stat presentation, cost helpers,
    and candidate-pool reads. Also holds shared clone/shuffle/site
    helpers so shop, lifecycle, and presentation stay acyclic.
  - Id-keyed Life Map reads (`getCurrentLifeMapVassal`,
    `getSelectedLifeMapVassals`) resolve only `currentVassalId` /
    `selectedVassalIds` through `vassalsById`. Internals use these.
  - Live HUD/forecast reads (`getSettlementCurrentVassal`,
    `getSettlementSelectedVassals`, `getSettlementFirstSelectedVassal`)
    also accept a `currentVassal` object, a `selectedVassals` array, and
    selected-id fallbacks when `vassalsById` is absent.
- `shop.js`
  - Shop inventory builders, purchase/undo/reorder/move/reroll, staged
    reservations, and structure placement helpers.
- `lifecycle.js`
  - Barrel. Initialize/reroll/select, enter/confirm/finish, and
    `stepVassalLifeMapSecond` live in `lifecycle/` (`candidates.js`,
    `node-confirm.js`, `step.js`). See `lifecycle/README.md`.
- `presentation.js`
  - `getVassalNodeDecisionPresentation`, `getVassalGamepiecePresentation`,
    regional map presentation, and option projection.

## Public entrypoints

Import these from `src/model/vassal-life-map.js`:

- Civilization: `initializeVassalLifeMapCivilization`, `stepVassalLifeMapSecond`
- Lineage: `getCurrentLifeMapVassal`, `getSelectedLifeMapVassals`,
  `getSettlementCurrentVassal`, `getSettlementSelectedVassals`,
  `getSettlementFirstSelectedVassal`
- Shop/confirm: `purchaseVassalShopOffer`, `undoVassalShopPurchase`,
  `reorderVassalShopPurchase`, `moveVassalShopStructure`, `rerollVassalShop`,
  `confirmVassalLifeNode`
- Presentation: `getVassalNodeDecisionPresentation`,
  `getVassalGamepiecePresentation`

Topology generation stays in `src/model/vassal-life-map-generator.js`.
