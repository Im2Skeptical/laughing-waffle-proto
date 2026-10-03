# Trigger Dictionary

Current detailed-settlement stepping is defined by
`src/model/detailed-settlements/phases.js` and
`src/defs/gamesettings/moon-phase-defs.js`. Practices are explicitly Scheduled
or Charge. Definitions live in `src/defs/gamepieces/detailed-settlement-defs.js`;
the resolver is `src/model/detailed-settlements/practices.js`.

## Authoritative boundary order

Every official second still advances through normal simulation ticks:

1. A changed solar season runs matching Scheduled Practices, respecting
   `activation.seasonKeys`.
2. A lunar boundary resolves Birth, Food, Housing, Faith, Migration or Death,
   each lasting the run's configured `phaseDurationSec`.
3. The Vassal Life Map steps if the run has not completed. Events flush through
   the same authoritative queue.

The default solar year is independent of the six-phase moon. Legacy
`newMoon`, `fullMoon` and `MOON_CYCLE_SEC` are not this clock.

## Scheduled activation

`activation.type`, optional `activation.also`, stage, seasonal filters and
conditions determine when a recipe is eligible. Birth/Food/Housing/Death
handlers and explicit Crisis resolution invoke their respective activation
types. `passive` definitions are consulted by the consuming rule; they do not
advance time or automatically fire every second.

For each trigger/stage batch, all eligible local recipes run before neighbour
sourcing. Pending root events and their local reaction children drain before
shared retries. Each retry re-evaluates inputs, staffing and conditions;
successes never repeat and incomplete plans reserve nothing. Neutral sites
participate in their normal production/meals with their existing restrictions.

## Charge events and Discharge

Emitters record JSON events with event/root/parent IDs, region, source and the
actual outcome. `charge.trigger.any` OR clauses match one event once. Current
content listens to Stock generation/consumption, candidate Development, Chaos,
population deaths, Trade, Monster pressure/destruction, Support, Campaign,
Challenge, successful defense, martial actions and survived Danger.

All matching gains for an event occur before ready cards resolve in authored
region/tableau order. Positive actual Stock yields emit events; clipped zero
yields do not. Full Charge caps further gain. A legal Discharge resets Charge,
applies its cost-free effects and can emit children. Blocked cards retain their
meter and can retry when a later event changes their conditions.

Each Practice may Discharge once per root chain across local/shared passes;
refills remain banked. A bounded global safety cap records a diagnostic instead
of allowing an infinite cascade. Root IDs, trace records and Charge are shared
by ticks, replay, saves and forecasts. See
[the Charge implementation](../docs/civcontent-2.6-implementation.md).

## Worker and transaction boundaries

Worker assignments derive from current cohorts. Scholars claim specialist
sockets before ordinary population-band tokens; ordinary workers fill slots
left-to-right, with cohort effectiveness from Game Settings. Scheduled workers
multiply Stock output; Charge workers multiply incoming Charge. Both retain a
base effect without ordinary workers unless explicit staffing gates block it.

Vassal selection, node entry, paid rerolls and confirmation are real timeline
transactions. Hover, drafts and speculative preparation use isolated snapshots
and never spend authoritative RNG or Prestige. Confirmation adopts the
validated transaction once; its time cost resolves through normal ticks.

Run `npm run test:detailed-settlements`, `npm run test:vassal-life-map`, and
`npm run test:detailed-replay`; `npm run verify` includes the content and Charge
suites.
