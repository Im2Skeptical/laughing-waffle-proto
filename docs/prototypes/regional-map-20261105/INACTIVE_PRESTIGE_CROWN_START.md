# Potential Prestige and Crown starting soldiers

Cam's follow-up (2026-11-06): neutral settlements also need a Prestige amount.
Every non-player amount should look inactive, so it cannot be mistaken for
current player income. Crown regions should start with many more Crown-loyal
soldiers.

## Prototype changes

- Every non-Monster settlement has the same connected worker-circle / Prestige
  pill, including neutral settlements. Fixed dimensions and sprite anchors are
  retained.
- Player income keeps a gold icon, bright number and `+` prefix. Crown and
  neutral potential use a flat stone-green frame, muted numeral and dimmed icon,
  with no `+`. Inspection explicitly says these settlements add nothing to the
  player's shared Prestige treasury.
- Non-player values remain a zero-unrest potential estimate. They are not
  current income or a capture guarantee. Exact player contributions, shared
  treasury, unrest and node payouts are unchanged. This checkout currently uses
  population / 20, superseding the original brief's provisional / 100.
- Fresh games start with 60 loyal soldiers in the Crown capital (previously 35),
  20 per province (previously 10), and a quarter of each outer Crown town's
  residents rounded up (previously zero), capped by existing loyal adults.
  Existing Crown-loyal ordinary adults become Warrior specialists: no added
  residents or allegiance changes. Player, neutral and Monster starts are unchanged.
- The enemy remains the single hard-coded Warrior remnant. Alternate enemy
  class openings are not implemented. Soldiers remain distinct from supplied,
  armed Force; existing Arms, supply, control and upkeep rules are retained.

## Scope and checks

This is still a local, unmerged prototype on
`experiment/regional-readout-20261105`. The troop tuning is a proposed starting
balance, not a new enemy-class system or a population investigation.

Initialization uses authored deterministic arithmetic, adds no RNG draws and
keeps JSON state shapes and schema numbers unchanged. Stored runs retain their
existing initial cohorts. Replay still uses its serialized initial state and
the authoritative stepper; no separate forecast rules were introduced.

`npm run test:full-map` passed: 130 seeded openings preserve population,
allegiance, control, trade, serialization and replay; all 14 Crown regions have
loyal adult soldiers, with more than twice the previous total. All 42 full-map
contract groups also passed.

Use `npm run prototype:regional`, then
`?regionalReadout=floating&regionalForce=onbar&perf=1&art=1&launch=new`.
The performance fixture is regenerated from the revised initializer.
`node scripts/capture-stable-regional-ui-prototype.mjs` checks neutral Prestige,
active/potential labels, fixed geometry through four zoom levels, original name
positions and direct economy clicks on phone and desktop. Evidence is in
`artifacts/regional-stable-layout/`.

Final verification (2026-11-06): full `npm run verify` passed, as did the
phone/desktop capture checks through four zoom levels and neutral potential
touch inspection, with zero page errors. Crown and player economy clicks still
open their existing boards directly. The fixed preview seed (123) now starts
with 214 Crown-loyal soldiers, up from 65, across the same 14 holdings.
