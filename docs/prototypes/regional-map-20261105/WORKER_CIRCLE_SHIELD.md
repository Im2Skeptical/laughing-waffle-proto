Subsequent preference: fixed relative sizes and stable sprite anchors; names
remain at their original regional corners, underneath the readings. The label
clearance behavior described below is superseded by STABLE_LAYOUT.md.

﻿# Worker medallion, Prestige pill, and numbered shield

Current preference: **workers**, resolved by Cam. The circular worker medallion
connects to a rectangular Prestige pill. Prestige remains rounded to whole numbers.
Latest URL: `?regionalReadout=floating&regionalForce=onbar&perf=1&art=1&launch=new`.
Developer controls and historical URLs remain outside the evaluated game view.

## Shield placement and numbers

A numbered shield sits directly on the allegiance meter, centred in the current
holder's coloured slice (or its boundary if that holder has zero allegiance).
It shows whole supplied holding Force, rounded **down**, with exact Force on
inspection. For example, 5.8 shows 5: it must not imply the requirement of 6 is met.
Prestige continues to use nearest-integer display rounding; model values and
aggregate node-payout rounding are unchanged.

The circle and shield are placed clear of the rendered building footprint.
Direct region-to-economy clicks are preserved. Region-name clearance retains the
previous prototype behavior; a crowded label can be hidden when it cannot fit.

## Mechanics clarification

The existing political thresholds are 60% allegiance to claim and 45% to retain.
Supplied, armed occupation can hold below 45% and block allegiance capture while
Force meets ceil(disloyal residents / 25). It does not change the authored 60%
claim threshold. The shield is therefore an identity/Force reading on the holder's
allegiance slice, **not an invented moving claim threshold**. A future threshold
encoding would need a separate decision about claim versus holding and allegiance
ordering; no such gameplay or meter-axis change is implied by this prototype.

Evidence: src/model/detailed-settlements/territory.js controlSummary/resolveControl.
No simulation, RNG, schema, save, replay, roads/borders or timegraph changes.

## Samples and verification

`regionalForceSample=both` retains the explicit view-only examples: 200 residents,
13 workers, 70 Free / 90 Crown / 40 unaffiliated, 4/6 insufficient Force and 8/6
sufficient Force. `regionalForceSample=fractional` demonstrates 5.8 Force and a
shield number of 5. These never mutate GameState; economic boards still use real
state. Captions and inspection identify the display samples.

Capture command: `node scripts/capture-worker-shield-prototype.mjs`.
Artifacts: artifacts/regional-worker-shield/ (phone, desktop, samples, fractional).
Checks: worker default, integer Force/Prestige, shield centre on the actual meter
track, sprite clearance, no extra regional menu, and direct economy disclosure.
Broader seeds and dynamic occupation playthroughs remain outside the visual pass.


Validation: full npm run verify passed. Final phone and desktop capture checks
passed with zero page errors, including the shield centre lying on the actual
allegiance track and a 5.8/6 example displaying 5 whole Force points. Final
architecture, source reachability and build checks passed. Source remains an
unmerged local experiment; no production promotion or publication.
