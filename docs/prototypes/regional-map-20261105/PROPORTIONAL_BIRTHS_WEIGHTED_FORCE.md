# Proportional births and weighted holding Force — 2026-11-08

Cam approved trying weighted resistance, requested guaranteed proportional
newborn allegiance over time, and deferred a new civilian-support distinction.
Local experiment only; no PR, promotion, or publication.

## Carried entitlement

Each birth credits every eligible allegiance by its current pre-Birth local
all-age population share. Give the newborn to the largest credit, then subtract
one from that credit. Keep the remainder for the next birth, across phases and
saves. Ties use sorted faction IDs; there are no additional random draws.

This is a normalized smooth weighted round-robin allocation. The scheduling
pattern is also visible in [NGINX's primary implementation](https://github.com/nginx/nginx/blob/master/src/http/ngx_http_upstream_round_robin.c):
add weights, choose the largest current weight, subtract total weight from it.
Our changing-share policy and fairness tests are specific to this prototype.

- One ledger per residency/specialty prevents processing order from assigning
  one class consistently to one faction. Specialty inheritance and the number
  of births are unchanged.
- No refresh interval or quantized bag size: even a tiny positive minority
  accumulates entitlement. Zero-birth phases do not reset it.
- Changing proportions retain credit. When the eligible set changes (a faction
  appears or disappears), start a new quota epoch for that birth group. Absent
  factions cannot receive births from obsolete credit.
- `birthAllegianceCredits` is plain JSON on the settlement. Format is GameState
  v43, runner envelope remains v32; start a fresh trial rather than loading v42.
- Priests, maturity allocation and class-creation Practices are unchanged.
  This guarantees newborn allocation, not the population's eventual age mix or
  lifetime allegiance after deaths, maturation, migration and conversions.

### Guarantee and limits

Within an unchanged eligible set, credit equals cumulative proportional
entitlement minus births awarded. Before assignment its sum is one; after
assignment its sum is zero. The selected maximum was positive, so subtracting
one leaves it greater than -1. Every other credit was already greater than -1
and only gained a nonnegative share. With k eligible allegiances, zero sum then
puts every credit below k−1.

Thus an allegiance is less than one birth ahead, or less than k−1 births behind,
its cumulative entitlement. For the current three factions the discrepancy is
bounded below two births **per residency/specialty ledger**, regardless of how
long it runs; floating-point tolerance is accounted for in tests. Different
birth groups' small discrepancies can add together. Eligibility changes start a
new guarantee interval; no claim of an unbroken bound across faction extinction.

With stable 35/65 shares and one birth at a time, 100 births yield exactly 35/65,
rather than all 100 going to the majority. This is bounded proportionality, not
an increasing probability that might still suffer an arbitrarily long drought.

## Holding Force

```
requiredForce = ceil(unaffiliated / 10
                   + rival civilians / 5
                   + rival adult/Elder Warriors)
```

Each resident counts once relative to the holder. Unaffiliated Warriors use the
unaffiliated term. Rival Warrior children remain civilians. Loyal people add no
resistance. The model calculates integer tenths before rounding up, avoiding
floating-point threshold errors.

- 10 loyal adult Warriors and 90 unaffiliated residents: required Force 9.
- Rival soldiers oppose at one Force each; their civilian weight is replaced.
- One loyal adult/Elder Warrior still supplies one baseline Force while working.
- Current all-age allegiance thresholds, status fields, unrest delays and
  starting armies are unchanged. No new Supported/Occupied gameplay branch.
- Campaign detachments use the same weighted resistance calculation.
- The shield remains on the influence bar, using model-computed minimum support
  at the current non-loyal mix and Force. This is a composition-dependent
  counterfactual; converting rival soldiers can move it differently from
  converting unaffiliated civilians. Inspection states this assumption and the
  neutral/civilian/soldier breakdown. With no non-loyal people, it assumes a
  hypothetical unaffiliated remainder.

## Impact and verification

No new RNG calls, model/UI imports or clock changes. Persistent quota balances
are serialized and validated; authoritative replay executes the same Birth and
control code. Pure resistance/shield queries do not mutate state.

Focused tests cover 80,000 fixed/changing-share prefixes, exact stable shares,
batch and class independence, no-birth phases, disappearing/reappearing factions,
mid-quota save continuation, rejected invalid balances and obsolete saves,
weighted control and shield boundaries, and real Birth-phase/replay continuation.
Existing full-map, settlement, save, world and replay checks cover integration.

Run `npm run test:full-map`, `npm run test:detailed-settlements`,
`npm run test:detailed-replay`, or `npm run verify`. Local preview: `npm start`.
Browser check: fresh opening and later-time floating shields, no page errors.
Verification completed: `npm run verify` exited 0. The live map probe passed
four zoom levels, phone/desktop layout, touch inspection, year-six and year-50
views. The existing three-seed 50-year Crown-opening checks also passed.
Logs: `artifacts/proportional-births-force/`; map evidence:
`artifacts/regional-stable-layout/`.

The existing larger-army opening remains the comparison baseline. Passing
minority fixtures does not by itself establish 50-year minority-garrison balance.
