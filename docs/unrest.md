# Unrest

Cam's direction, 10 November 2026. Unrest is a temporary collapse of faction
control, replacing the old continuously adjusted 0–100 severity value.

- At a Death control check, an inhabited faction holding below its current
  Force-adjusted allegiance threshold immediately becomes unheld and enters
  Unrest. A stable government held by a minority of loyal Warriors does not.
- The episode lasts ten game years, measured in authoritative simulation seconds
  using the run's captured seasonal clock. Pausing does not advance it.
- No faction controls the town. People retain their allegiance and specialty;
  local Practices, Structures and demographics continue. Faction supply access
  and territorial Prestige are unavailable. Resource Stock remains local.
  Housing overflow, happiness, Faith progression and Faith collapse remain active
  throughout the episode. Ordinary Crown and unheld demographic scope is unchanged.
- Peaceful claims are blocked and accumulate no claim checks during the episode.
  The normal military capture system remains separate: conquest does not start
  Unrest, and capture can replace an existing episode.
- At the exact expiry second, Unrest ends automatically into ordinary unheld
  storefront status. The developed board and population then freeze under the
  existing unheld-town rules. No faction receives control automatically; normal
  peaceful claims can subsequently accumulate their two checks at 75% allegiance.
  Pending demographic migration is cancelled at expiry, including unresolved
  hardship and booked arrivals/departures. Booked residents return to their source
  before freezing, keeping their original residency, allegiance and specialty.
- Losing the last player holding still ends the run immediately, even if
  player-allied residents survive inside Unrest towns.

## Chaos and presentation

The first balance pass adds **1 Chaos per Unrest region per game year**, independent
of population or former holder. Per-second accrual is paid through the existing
Faith-phase global Chaos reckoning, including partial moons at entry/expiry.
This is accumulated Chaos, not direct Creep. Resistance and Monster Spawn rules
continue to govern how that Chaos translates into threat. Expiry stops new income;
Chaos already generated remains in the world pool.

The map retains the allegiance bar and inactive potential Prestige. A compact
`Unrest 10y` caption replaces the holding shield; inspection explains remaining
time, Chaos income, control restrictions and expiry. The regional header also
shows the countdown. The Coming Dark inspection lists Unrest Chaos separately;
the regional Unrest graph series reads years remaining, not a percentage.

`unrestDurationYears` and `unrestChaosPerYear` are captured Game Settings. The
episode is a JSON `control.unrest` record with start/expiry seconds and previous
controller, or null outside Unrest. It emits `unrestStarted`/`unrestEnded` model
events; no new card hooks or bespoke Practices are introduced.

## Verification

`node scripts/unrest-state-test.mjs` covers threshold loss, retained population
identity, active local production, isolated supply, blocked claims, exact expiry,
ten-year Chaos totals, conquest, last-holding loss, JSON validation, save continuation
and authoritative replay. `npm run verify` includes that contract suite.
`npm run probe:monster-extinction` measures opening survival and year-50 Crown
retention across seeds. New Game is required: GameState v49 and captured config
v31 reject obsolete trajectories. Runner saves remain v33.

The initial 32-seed balance sample averages 149.871 years to extinction, below the
200-year mean target; all runs finish within the 400-year measurement window.
Original Crown holdings retained at year 50 average 10.5 (8 to 13), with all
capitals held. Detailed rows: `artifacts/monster-escalation/extinction-32.json`.
