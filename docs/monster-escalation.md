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
Primordial Chaos, passive Creep, the threshold, initial populations and Warrior
Force rules remain unchanged. Existing regional activity and reaction rules
apply: a repel emits advance, defense success and strengthening activity, but
only one global `monsterSpawn` event.

## Readout

Monster regions have a compact symbol/whole-number Strength badge at the same
fixed screen scale as settlement readouts. Tap or hover for the current attack
target, its Defense and the exact +1 rule. The Coming Dark shows the latest Spawn
outcome, including “Last: Repelled · +1 Strength”. Rewinding restores both the old
Strength and the appropriate historical result.

The latest outcome is one bounded JSON record in
`civilization.chaos.lastMonsterSpawn`. GameState **v45** replaces v44 so saved
forecasts cannot retain the old interception loop. Runner envelope v33 and
captured GameConfig v30 are unchanged. Start a fresh game.

## Measured baseline

With the [minority Crown opening](crown-minority-opening.md), 32 ordinary,
unattended seeds complete every run: **176.7-year mean**, range
**121.5–205.3 years**, with no surviving/censored
runs at the 400-year measurement cap. This is an average target, not a requirement
that every seed end before 200. Played builds can extend survival. The retained
50-year Crown opening contracts run alongside this new endgame check.
Measurements use elapsed simulation years (`tSec / 32`); the HUD names the
containing calendar year.

`npm run probe:monster-extinction -- 32` repeats the sample through the normal
60-tick stepper. It reports every seed, terminal reason, range and mean under
`artifacts/monster-escalation/`, and fails if any run remains censored or the mean
reaches 200. It also checks mean Crown retention of at least ten holdings at
year 50 and that every capital survives. The fixed sample starts with 123, 42,
424242, then `i * 7919 + 1`.
No time or simulation phases are skipped. The older authored Starter_02 fixture's
separate 200–300-year target remains a legacy-profile contract.

Run `npm run verify` for +1/hold/breach behavior, overflow, unchanged RNG, save
validation and authoritative replay. The Monster browser probe covers phone and
desktop readouts, touch inspection and scrubbing backwards.
