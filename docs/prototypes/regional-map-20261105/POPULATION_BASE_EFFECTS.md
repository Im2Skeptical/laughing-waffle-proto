# Population baseline benefits and Priest birth influence

Design discussion only. This records Cam's decisions on 2026-11-06; it does not
claim that the current simulation implements them. No new game rules, starting
cohorts, RNG behavior or schema versions were changed for this record.

Subsequent implementation: the Warrior baseline, inherited specialties and
class-specific Muster are now part of the local playable
[Crown Force experiment](WARRIOR_FORCE_PLAYABLE.md). Research, Priests and
classed-worker staffing bonuses remain design work. The implementation report
supersedes the historical current-code descriptions below for that subset.

## Confirmed direction

- Use **1 Force per loyal Warrior** as the new base unit. Occupation resistance,
  military bonuses and the recently enlarged Crown starting cohorts need a
  coordinated balance pass; their new numeric values are not yet decided.
- Classed populations retain their baseline benefit while staffing Practices.
  The accepted eligibility proposal covers non-child specialists, including
  adults and Elders. Staffing is not a prerequisite for the baseline benefit.
- Active specialist training belongs to that specialist's class-specific Practices.
  Common and other-class Practices can provide direct resource-dependent effects
  instead. The current Common Seigneurial Muster therefore needs reconciliation.
- **Normal births inherit their source cohort's specialty in the current trial.**
  Cam restored class births on 2026-11-06 after observing that specialists
  disappeared too quickly with ordinary-only births. This supersedes the earlier
  ordinary-newborn decision. Practices still train existing people; active
  training remains class-specific. Birth allegiance is allocated separately,
  and the planned Priest effect still concerns allegiance only.
- Warrior Force should not require per-Warrior equipment tracking. Arms costs
  belong to training cards or explicit direct-Force cards. The discussion also
  proposes removing the separate garrison-supply gate from intrinsic Force;
  ordinary population Food/Housing rules remain relevant.
- Scholars provide baseline Research over time; its rate and cadence are still
  tuning choices.
- Classed-worker staffing bonuses require a separate UX design pass. The
  decision to keep baseline benefits does not approve silently stacking new
  Research with every existing Scholar staffing bonus or changing those bonuses.
- Merchant/money redesign remains deferred.

## Recovered Priest decision

Source: the earlier full-map design discussion,
`mcp:2ad2208f-ba5b-40fd-8589-a5ac877d9d46`, user messages at positions 105, 111
and 117, with the candidate formulation at position 115:

<t3-thread://v2/7ba1733f-caeb-4c8e-8fca-1f087002f3ee/mcp:2ad2208f-ba5b-40fd-8589-a5ac877d9d46>

1. Assign newborn allegiance using the normal local population distribution.
2. Priests have an intervention chance proportional to their local presence.
3. On intervention, choose allegiance using the local Priests' faction shares.
   This may reaffirm the initial allegiance.

The effect changes newborn **allegiance**, not the number of births, their
specialty, or the allegiance of existing residents. Existing-resident conversion
remains an explicit card effect. Cam endorsed this direction in the earlier
thread; the later full-map implementation brief at position 2028 explicitly
deferred Priest birth influence.

The candidate probability model was:

    alpha = min(1, strength * eligiblePriests / totalResidents)
    newbornShare[f] = (1 - alpha) * ordinaryBirthShare[f]
                       + alpha * priestAllegianceShare[f]

Here `ordinaryBirthShare` means the distribution without Priest intervention,
not a population specialty. With no eligible Priests, retain the normal birth
allegiance distribution. Eligible Priest counts should follow the agreed
non-child baseline eligibility and count each faction's Priests, independently
of who controls the region.

`strength = 2` was an illustrative earlier proposal, not accepted tuning.
Exact strength, probability caps and the final population denominator remain
tuning details. Implementation must preserve birth totals and use authoritative
Birth-phase resolution and the simulation RNG, rather than UI-side rolls.

## Current implementation and open questions

- `phases/birth.js` currently allocates newborn allegiance from the pre-birth,
  all-age population distribution. No Priest intervention exists.
- Births inherit specialty through the per-specialty birth loop. The current
  trial restores that behavior while preserving birth totals, residency and the
  separate allegiance calculation. Newborn specialists provide their adult
  baseline benefit only once mature.
- The population ledger currently admits only ordinary, Scholar and Warrior
  specialties. Priest population requires an explicit model/schema/content pass.
- Common/other-class direct-effect cards need attainable resource providers;
  current Arms and Record production is mostly class-specific. Retained
  `Require` checks Stock without making an exclusive resource reservation.
- Staffing UX must distinguish population's baseline contribution from the
  extra contribution of the people assigned to a particular Practice. Worker
  tokens and people must use clearly distinguished units.

This supersedes the immediately preceding proposal in this thread that Priests
automatically convert existing residents each moon.
