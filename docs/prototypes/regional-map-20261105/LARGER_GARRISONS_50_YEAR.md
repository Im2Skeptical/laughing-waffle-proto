# Larger Crown garrisons and fixed 70% map UI

Local prototype iteration requested by Cam on 2026-11-07. The question was how
large an opening army should be to retain broad Crown territory for about 50
years, and whether the map readouts remain clear.

## Current trial

Each Crown garrison now targets ceil(previous Warriors x 1.75), capped by the
region's existing adult population. It trains loyal ordinary adults first, then
recruits unaffiliated adults into Crown allegiance. No people, housing demand or
base meal demand are added. Player, neutral and Monster populations are unchanged.
The larger numbers are actual Warrior cohorts and use the existing Force rule.
No redeployment AI is installed.

The review seed 123 starts with **363 Crown Warriors**, up from 214:
capital 90 (up from 60), each province 35 (up from 20), and outer garrisons of
9, 11, 14 or 27 depending on town size (previously 5, 6, 8 or 15).

This changes political support as well as Force. The additional Crown-aligned
Warriors count as residents, so the outer towns now begin with roughly 53-56%
Crown allegiance and use population-supported control. Their initial unrest is
zero. This is explicitly a larger-army/50-year coverage trial, not evidence that
minority military occupation alone can last 50 years.

## Measured results

The initial study compared 12 cohort variants across five seeds for 60 years.
It included training more existing adults, training all eligible loyal residents,
and adding extra soldiers. Larger minority armies preserved the opening longer
but still fell to 3-4 core holdings by year 50. Training toward a 1.5x target kept
only 4-6 holdings at year 50. A 1.75x target kept 12-14 in that study; adding 3x
as many troops achieved similar coverage with much greater population demand.

The actual installed initializer was then run for 60 years across 20 seeds:
- at year 50: 12-14 Crown holdings, mean 13.4 of the original 14;
- the Crown never fell below 12 holdings during the first 50 years;
- seed 123 retained all 14 at years 10 and 25, and 13 at years 50 and 60.

These runs had no player interventions or automatic troop redeployment.
The result does not guarantee every possible seed or survival against the player.

The 67-seed, two-year food check still passes: every region feeds its first meal
and there is no starvation-migration cascade. The 107 import / 839 single-source /
126 two-source board distribution is unchanged. There are 36 transient severe
meal shortfalls; later growth and institutional food costs remain relevant.

Evidence:
- `artifacts/warrior-force-prototype/larger-garrisons-study.json`;
- `larger-garrisons-live-validation.json` (actual installed initializer);
- `larger-garrisons-live-validation.mjs` (20-seed repeatable run).

To reproduce the earlier baseline comparison after changing the app default:
`node --import ./artifacts/warrior-force-prototype/baseline-crown-loader.mjs ./artifacts/warrior-force-prototype/larger-garrisons-study.mjs`.
The loader overrides the multiplier only inside that research process; it never
changes app source, the running preview, save state or forecast workers.

## Map UI

- Fixed 70% readout scale. The temporary top-row button, menu slider, URL
  override and associated styling/module are removed.
- Floating population/workers, Prestige and influence/Force readouts render
  above region titles. Titles retain their corner, font, fitting and map-zoom
  behavior; they are covered only where they overlap the readouts.
- Shared dimensions, sprite-edge anchoring, whole Force/Prestige numbers and
  the control-threshold shield meaning are retained.
- Captures include opening, year 6 and year 50, mobile/desktop and four zooms.

UI edits leave state, RNG, schemas and replay untouched. The army change uses
only initial JSON cohort data and adds no RNG draws, schemas, time rules or
separate projection implementation. Actual phases and authoritative replay own
all subsequent behavior.

Use a fresh run on preview 5186:
`?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&perf=1&art=1&launch=new`.

## Design follow-up

If the aim is specifically minority occupation for 50 years, count increases
alone did not achieve that in the tested range. The next candidates are ongoing
class-specific Warrior recruitment and the already-investigated redeployment
policy. Population allegiance currently includes soldiers; changing that
interpretation or newborn allegiance is a separate gameplay decision.

