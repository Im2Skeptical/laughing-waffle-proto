# Creep and Monster Spawn

Trial player-facing vocabulary requested by Cam on 3 November 2026. Names and supported bindings live in [the mechanics catalogue](../src/defs/mechanics.js).
The Creep threshold and passive rate are unchanged. Repelled Monsters now gain
+1 Strength for their next attack; see [Monster escalation](monster-escalation.md).

- **Creep** is the shared threat meter. Card copy says `+10 Creep`, `Gain 10
  Creep`. Chaos and Resistance are separate concepts:
  Resistance contains passive Creep gain; direct Creep costs bypass it.
- **Monster Spawn** is one Monster threat resolution, normally triggered at
  **100 Creep**. It attempts expansion; interception holds the target region and
  gives the repelled Monster **+1 Strength** for its next attack. Existing
  blocked-front rules may create a new front or strengthen a Monster instead.
  These outcomes still belong to one Spawn, rather than creating extra Spawns.
- A full meter spends its threshold and retains overflow. For example, adding
  250 Creep at zero can trigger two Spawns and leave 50 Creep while the run remains
  active. The threshold remains configurable; 100 is the default.

## Engine mapping retained by this rename

| Player term | Current engine identifier | Meaning |
| --- | --- | --- |
| Creep amount | `state.civilization.chaos.monsterPressure` | Exact fractional meter value. |
| Creep per Spawn | `monsterExpansionThreshold` | Captured Game Setting; default 100. |
| Gain Creep | `addMonsterPressure` (DSL op and engine function) | Existing DSL effect and authoritative gain/resolution path. |
| Monster Spawn count | `chaos.expansionEvents` | Increments once per threshold or direct resolution, including interception. |
| Trigger a Monster Spawn | `triggerMonsterSpawn` | Fixed whole-number DSL effect; leaves Creep unchanged. |
| Every Monster Spawn | `monsterSpawn` | One global event after each resolution, including interception. |
| Monster activity | Practice event `monsterPressure` | Existing local/adjacent activity signals; see below. |

`resolveMonsterPressure` spends Creep and uses the same Spawn resolver as the
`triggerMonsterSpawn` effect. Both emit one global `monsterSpawn` event after
regional outcomes. The event carries `cause` (`creep` or `direct`), outcome and
source/target region IDs where applicable. Existing state field names and RNG
behavior are retained. The latest result is saved in `chaos.lastMonsterSpawn`
for replayable UI feedback. Current GameState v51 rejects obsolete trajectories,
including the previous holding-Force rule.

The existing `monsterPressure` event is **not** a once-per-Spawn event. One
resolution can emit `action: 'advance'` at the source and `action: 'expand'` at
the destination. Other outcomes emit `spawn` or `strengthen`; an intercepted
advance also emits `defenseSucceeded` at the target and `strengthen` at the
source. These are regional activity signals, still only one global Spawn.
Existing cards such as Watchkeeping
continue to react to their existing local/adjacent **Monster activity**, not
newly to global Creep gains or once per Spawn.

## Card authoring

```js
// Effect: Trigger a Monster Spawn. Fixed count, not worker/output-scaled.
{ op: 'triggerMonsterSpawn', amount: 1 }
// Charge trigger: Every Monster Spawn. Explicitly global, no regional filters.
{ any: [{ kind: 'monsterSpawn', scope: 'civilization' }] }
// Effect: +10 Creep; retain the established engine ID.
{ op: 'addMonsterPressure', amount: 10 }
```

Spawns resolve while the run is active. Multiple resolutions award one Charge
gain each; existing Charge caps, eligibility and one-Discharge-per-root limits
still apply. A Spawn-triggering reaction therefore cannot loop indefinitely;
its child event can refill Charge for later. Direct Spawns do not add or consume
Creep. Creep removal has no DSL operation yet and cannot be authored as a gain.

The catalogue validates these bindings and generates their names, readings and
inspection references. Regional/faction-filtered Spawn triggers are unsupported;
Monster activity remains the regional event. See the
[card authoring contract](card-design-guide.md#mechanics-catalogue).
No shipped card has been given the new Spawn effect or trigger by this work.

## Display

The Coming Dark uses the shared Libron small-caps heading treatment. Drawer
numbers are whole-number readouts; the bar and simulation keep exact progress.
An incomplete meter never rounds up to its threshold in the readout (99.6/100
shows 99/100), so rounding cannot announce a Spawn early. Detailed inspection
may retain fractional values. Creep uses the existing Monster symbol in cost
boxes and the meter.
