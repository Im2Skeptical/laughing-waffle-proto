# Repelled Monster escalation

Cam approved this first pass on 8 November 2026, following the v1.1.55 Monster
stall diagnosis. Ordinary starts should average under 200 years to extinction.

## Rule

Every Monster Spawn advances one front. A region holds when its Defense matches
or exceeds Monster Strength. A successful defense keeps the region; the repelled
Monster then gains **+1 Strength for its next attack**. A successful expansion
does not receive that bonus. Each resolution remains one global Spawn and spends
one full Creep meter when caused by Creep, retaining overflow.

This uses the existing `region.monster.defense` rating for both attack and
defense. There is no additional resource or per-person equipment tracking.
The repel rule leaves Primordial Chaos, passive Creep and the threshold unchanged.
The companion Crown and Force tuning is described in [the opening notes](crown-minority-opening.md). Existing regional activity and reaction rules
apply: a repel emits advance, defense success and strengthening activity, but
only one global `monsterSpawn` event.

## Readout

Monster regions have a compact symbol/whole-number Strength badge at the same
fixed screen scale as settlement readouts. Tap or hover for the current attack
target, its Defense and the exact +1 rule. The Coming Dark shows the latest Spawn
outcome, including “Last: Repelled · +1 Strength”. Rewinding restores both the old
Strength and the appropriate historical result.

The latest outcome is one bounded JSON record in
`civilization.chaos.lastMonsterSpawn`. Current GameState **v51** rejects obsolete
forecasts, including the previous holding threshold. Runner envelope v33 and
captured GameConfig v31 are current. Start a fresh game.
Supported Lab and viewing fixtures can start Monsters at Strength zero. Their
recorded Strength remains nonnegative, including a first repel from zero to one,
so ordinary save and forecast-anchor validation can restore those outcomes.

## Measured baseline

With the [civilian core and minority outer garrisons](crown-minority-opening.md),
the 70% holding base, 90%-allied player opening and [ten-year Unrest](unrest.md),
the 16 November 2026 audit at source revision `930801a5` reproduces 32 ordinary
unattended seeds with a **141.891-year mean**, range **31.5 to 226.6875 years**,
and no surviving/censored runs at the 400-year cap. Original Crown holdings
retained at year 50 average 10.581 (7 to 14) across the 31 runs reaching that
checkpoint; all 31 sampled capitals remain held. Seed 23758 ends in territorial
loss at 31.5 years, so the probe fails its complete year-50 sampling guardrail.
The extinction target is an average, not a requirement that every seed end before
200. Played builds can extend survival.
Measurements use elapsed simulation years (`tSec / 32`); the HUD names the
containing calendar year.

`npm run probe:monster-extinction -- 32` repeats the sample through the normal
60-tick stepper. It reports every seed, terminal reason, range and mean under
`artifacts/monster-escalation/`, and fails if any run remains censored or the mean
reaches 200. It also checks mean Crown retention of at least nine holdings at
year 50, that all seeds reach that checkpoint and that every sampled capital
remains held. The audited sample meets the extinction target but fails the
checkpoint requirement above.
The fixed sample starts with 123, 42,
424242, then `i * 7919 + 1`.
No time or simulation phases are skipped. The older authored Starter_02 fixture's
separate 200–300-year target remains a legacy-profile contract.

Run `npm run verify` for +1/hold/breach behavior, overflow, unchanged RNG, save
validation and authoritative replay. The Monster browser probe covers phone and
desktop readouts, touch inspection and scrubbing backwards.
