# Vassal Life Map modules

Callers keep importing from `src/model/vassal-life-map.js`. That barrel
re-exports the previous public API; internals live here.

## Files

- `selectors.js`
  - Lineage/current/graph/node getters, committed and playhead node ids,
    reachable-from-current ids, planned pin routes,
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
- `class-actions.js`
  - Shared class founding, Discovery, Campaign/Challenge and live Crisis rules.
- `class-rules.js`
  - Shared RISK success, surpassing quality rolls and Delve time calculations.
- `campaign.js`
  - Warrior visit modes, target validation, mode-specific forces, paid encounters,
    real world victories, Relic rewards and continuous-visit presentation.
- `world-choices.js`
  - Crossroads movement/routes/Tour, commit-time random rewards, and free Legacy
    choices and founding targets. Custom first pathways stay in the prototype.
- `shop-specialties.js`
  - Practice output choices, Structure categories, and deferred Monster-pressure
    substitution for card purchases beyond available Prestige.
- `commissions.js`
  - Continuous Scholar offers, actor-attributed node goals, completion, and validation.
    Eleven data-driven tasks pay 20/40/60 Prestige. Construction pays on committed
    setup, stat tasks track permanent growth, and Prestige tasks track gross income.
- `shop.js`
  - Shop inventory builders, purchase/undo/reorder/move/reroll, staged
    reservations, and structure placement helpers.
- `stock-shops.js`
  - Pure generation context: class-compatible Stock outputs and unmet recipe
    inputs across all surviving player settlements.
- `lifecycle.js`
  - Barrel. Initialize/reroll/select, enter/confirm/finish, and
    `stepVassalLifeMapSecond` live in `lifecycle/` (`candidates.js`,
    `node-confirm.js`, `step.js`). See `lifecycle/README.md`.
- `heirlooms.js`
  - Equipped/Carry/Vault inventory, unique copies, Relic offers, inheritance,
    loadout, overflow, and equipped modifiers.
- `decision-preparation.js`
  - Isolated worker transaction validation, tick resolution, and speculative
    reachable-node/reroll preparation, including presentations before and after
    entry for every legal next node. No authoritative state is mutated here.
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
`src/model/life-map-balance.js` resolves captured per-choice absolute costs and
shared Practice/Structure quality prices before ordinary discounts. It does not
read review storage or consume RNG. A disabled design preserves baseline rules.
