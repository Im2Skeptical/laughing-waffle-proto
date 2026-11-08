# Final pack — regional map hierarchy prototype

Latest proposal: `regionalReadout=atlas` on the real game route. Source remains on
`experiment/regional-readout-20261105`; main is untouched. This is an unmerged,
throwaway visual experiment, not production implementation or Pages publication.

## What changed

- Opaque repeated panels → small heraldic place markers.
- Two player holdings carry worker numbers and current Prestige. Foreign places
  are quieter; seal size suggests population scale.
- Names are anchored to their settlements, with a slightly closer overview fit.
- Thin allegiance seams and exceptional occupation/contested shields retain
  political signals without repeating the same supported-state badge everywhere.
- One focused summary exposes exact workers, residents, allegiance and Prestige.
- Economy is a deliberate second step; Map summary returns without covering
  housing/Food figures. Stock diagnostics are confined to that economic layer.
- Existing Chaos warning starts compact. Global navigation/timegraph, roads,
  borders, original art and all simulation behavior remain unchanged.

## Status of the quality bar

Latest scored design: 39/50 against the qualitative peer benchmark of 40/50.
**Success bar not yet met.** Stop after four iterations because the remaining
presentation gap involves settlement content, global chrome and a design choice
about foreign comparison, rather than more per-settlement panels.

Remaining gaps:
1. Exact foreign comparison requires selection. Decide whether selected nearby
   targets should temporarily reveal one comparative figure, rather than every
   town carrying routine accounting permanently.
2. Settlement paintings and place identity need a stronger presence in the
   fantasy world. Existing source artwork is reused; new Crown art stays outside
   this task's scope.
3. Existing global chrome/timegraph constrains the map's available area. No
   overlay↔timegraph redesign was smuggled into this experiment.
4. The real opening state contains population-supported holdings. Occupied and
   contested examples need a separate review before Force presentation approval.

## Review / run

`npm run prototype:regional`; use the printed preview URL with
`?regionalReadout=atlas&perf=1&art=1&launch=new`. On touch, turn landscape and
start the prepared Dev game if asked. Reveal illustrations with the ticked seal.
Select a place, inspect the compact summary, open Economy, return to Map summary.
Main menu > Developer tools switches to historical variants for comparison.

Evidence and interactive capture sheet: `artifacts/regional-readout-v2/`.
The docs in this folder include primary sources, rubric, initial audit, and each
iteration's scorecard. Scores are expert visual judgement, not user-study data
or proof of Civilization-level production polish.

Validation: full npm run verify passed during this pass. Final source architecture
and reachability checks passed. Final build/preview identity checks passed after
return-control and skin fixes. Final real-game captures check player/Crown focus,
economy disclosure and return navigation at phone/desktop sizes.

Impact: views only. No simulation state, RNG, save schema, rules, balance or
replay changes. No obsolete-save compatibility work. No new artwork or gamepieces.

One repeat preview-identity run hit a Windows Node process fail-fast crash (3221226505) with no stderr. A clean retry passed both build-preview and build-badge checks. Final static checks also preserve the existing monster/empty-region panel fallback.
