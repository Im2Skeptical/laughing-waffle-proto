# Settlement-state legacy split

Public exports stay on `src/model/settlement-state.js`. Do not add new
detailed-settlement gameplay here. Current/selected vassal reads live in
`src/model/vassal-life-map/selectors.js`.

## Files

- `hub-legacy.js` — hub-core constructors (`createHubCore`,
  `ensureHubCoreShape`, `ensureHubSettlementState`,
  `createSettlementCardInstance`), floodplain/hinterland tile food helpers,
  and stockpile accessors (`getSettlementStockpile`, `getSettlementTotalFood`).

Callers import from `src/model/settlement-state.js`. Slot readers used by
detailed UI, vassal-history helpers, and `isSettlementPrototypeEnabled` stay
on that barrel file.
