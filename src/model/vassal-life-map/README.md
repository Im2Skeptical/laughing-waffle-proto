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
  - `getVassalStatDefinition` resolves personal attributes from the established
    class, then the founder identity. Shared definitions in
    `src/defs/vassal-stat-defs.js` bind stable stat slots to class names and icons;
    stat effects, the picker, HUD and level-up read that identity. Founding still
    gates specialist populations, class-only content and class abilities.
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
    Replacement-learn receipts capture the displaced Practice and prior draft
    order. Undo restores its relative position and relinks dependent receipts;
    receipt-only fields are removed when the offer returns to inventory.
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
- `relic-pools.js`
  - Captured ordinary quality rules and Special Relic item weights, validation,
    owned/exhausted exclusions, and first-draw appearance probabilities.
- `decision-preparation.js`
  - Isolated worker transaction validation, tick resolution, and speculative
    reachable-node/reroll preparation, including presentations before and after
    entry for every legal next node. No authoritative state is mutated here.
- `multiplier-preview.js`
  - Isolated completed-board multiplier readings for shop hover and staged
    construction. Only staged/prospective sites are completed for this reading;
    actual construction, RNG and simulation ticks are untouched.
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
read review storage or consume RNG. Shop service times are shared, captured rules;
only Scholars can refresh shops, through timed Delve. Disabling pooled generation
selects the legacy independent generator and its authored option costs.

## Full-map experimental ruleset

`treasury.js` selects the shared civilization Prestige ledger for the full-map
ruleset, retaining personal accounts only in explicit legacy fixtures. Shops
preserve institution IDs and stage adoption / per-hostile-instance removal
receipts. Campaigns use physically available local/network loyal Warriors;
occupation never borrows personal Retinue or a global force pool. Foreign
travel and installation are allowed, while discretionary Stock remains subject
to player authority. See `docs/full-map-redesign-implementation.md`.
