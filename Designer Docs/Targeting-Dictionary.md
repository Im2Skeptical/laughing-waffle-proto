# Targeting Dictionary

Current hosted-Stock recipes, Structure queries and Charge events use different
target descriptors. Definitions live in
`src/defs/gamepieces/detailed-settlement-defs.js`; resolution lives in
`src/model/detailed-settlements/stock.js`, `practices.js`, `scopes.js`, and
`external-world.js` within `src/model/detailed-settlements/`.

## Stock providers

The host is identified by `regionId` in the authored `state.world.sites` order.
Stock lives on each of its five `detailedState.practiceSlots`; Structures have
no Stock wallet. Food and Currency are totals derived by Stock Trait.

Provider discovery is local first, left-to-right, then other player-controlled
detailed settlements that share both a polygon edge and a direct live road.
Neighbour ties use authored region order and each provider's slot order.
Neutral settlements use their local hosts; connected Trade/Raid is a separate
external-world rule, not permission to borrow their meal supply.

Consume/Require clauses match any listed Trait. Require retains provider Stock;
Consume debits it only after the whole plan succeeds. Substitution and wildcard
modifiers are evaluated by the same planner. Missing inputs reserve nothing.
Scheduled local recipes and their reactions run before shared retries. Food
resolves every local meal before neighbour meals can use the remaining Stock.
See [simulation behavior](../ai/sim.md) for batch ordering.

## Structure queries and placement

Modifiers can match Stock Traits, Card Tags, specialist staffing, recipe
inputs, effect operations and Charge trigger kinds/Traits. Other conditions
check local specialists, stocked hosts, threats and history. Scholar staffing
adds the Knowledge Card Tag, never a Stock Trait. Exact query fields and
coefficients remain in the definitions and resolver.

Structures occupy one to three contiguous construction cells, have stable
placement IDs and may have duplicate instances. The region's
`structureCapacity` bounds legal origins. Shop drafts validate placement and
displacement before the authoritative confirmation; they do not mutate a
preview or consume worker-built progress.

## Charge event scope

`charge.trigger.any` holds OR clauses matched once per event. The default scope
is the hosting settlement. `adjacent` uses polygon neighbours; `connected`
uses direct road connections; `civilization` admits global matching events.
Clauses may filter Traits, Tags, staffing, class/pool, premature or martial
events, action kinds and source counts. `anotherPractice` excludes the same
Practice instance as an event source. Trigger scope is independent of Stock
provider scope.

## Region scopes

`resolveDetailedRegionScope` retains JSON-only map evaluators:

- `adjacent` selects direct graph connections in this API.
- `connectedComponent` follows connections through traversal filters.
- `commercialAdjacent` adds participating player Caravan relay settlements.
- `conditionalHostStructure` chooses a scope from local Structure presence
  and an optional enabled definition capability.

Endpoint filters constrain controller, host-relative colour, detailed sites or
Practice presence. Results use authored order. These map-score scopes do not
replace the stricter adjacent-and-connected Stock provider rule.

## Vassal and global targets

An active Vassal's Life Map actions use the current settlement and explicit
validated action/region targets. Elder Order resistance does not govern
candidate selection or purchases. `state.civilization` owns Chaos, the shared
Practice event journal, Research, class history and the single Vassal lineage;
`state.runStatus` owns completion status. Views inspect or stage these targets;
only confirmed model actions and ticks change them.

Verify with `npm run test:detailed-settlements`,
`npm run test:vassal-life-map`, and `npm run test:detailed-replay`.
