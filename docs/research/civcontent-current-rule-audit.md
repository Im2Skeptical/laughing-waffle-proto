# CivContent current rule audit

Audit baseline: `99ae62ae`, 10 October 2026. Runtime definitions in `src/defs/gamepieces/detailed-settlement-defs.js` are the comparison source. Findings below describe that baseline; supervised corrections and the resulting current audit are recorded at the end. Gameplay values were preserved.

Reusable audit: `npm run audit:content-rules` ([script](../../scripts/civcontent-rule-audit.mjs)).

Detailed current rows are written to the ignored local artifact `artifacts/civcontent-rule-audit.json`.

Current schemas cited from `ai/ai-context.md`: game state v31, runner saves v22, gameConfig schema v17. Fresh runs do not migrate older saves.

## Baseline coverage

| Set | Count |
| --- | ---: |
| Practice executable rows | 109 |
| Practice rows mapped to one id | 109 |
| Practice definitions | 110 |
| Practice definitions absent from the table | 1 (`observation`) |
| Structure executable rows | 78 |
| Structure rows mapped to one id | 78 |
| Structure definitions | 78 |
| Unmapped table labels | 0 |
| Ambiguous labels | 0 |
| Table-vs-runtime findings | 22 |
| Card-vs-runtime findings | 6 |
| Bronze numeric claims that disagree with runtime | 0 |
| Milestone housing figures that disagree with runtime | 0 |

`observation` is the Bronze Common Research practice described in `docs/civcontent-2.6-implementation.md` lines 7–15. It has no executable table row. Label mapping strips a trailing `(common|scholar|warrior)` and matches `label` plus `pool`.

Omitted JSON keys were treated as shorthand when they are not a different rule: missing structure `gate`, `housing`, and `candidateBonus` compare as 0, and missing `modifiers` compare as `[]`. Object key order is ignored. Array order is kept. The only definition with `cadenceMoons` is Goat Herding, so that omission is reported. Charge trigger objects are compared only when the executable cell contains them. The historical workbook `docs/civcontent-2.6-source.json` is not an oracle.

## Confirmed worker rows

| ID | Field | Documented | Runtime | Sources |
| --- | --- | --- | --- | --- |
| `forecasting` | effects / ui.rule | Faith/Chaos resistance 3. Card and authored text: accumulated Chaos is unchanged. Table line 95. | `addFaithChaosResistance` 3 and `addChaos` 6. Line 133. | Card contradicts the effect. |
| `masonry` | require | Table line 60: Require 1 Tool. | `require` []. Consume 1 Stone. Line 97. Card matches runtime. | Bronze test set line 22 already drops the Tool require. |
| `weaving` | require | Table line 84: Require 1 Tool. | `require` []. Consume 1 Cloth. Line 122. Card matches runtime. | Bronze test set line 22. |
| `brickmaking` | consume, require | Table line 81: Consume Stone+Fuel, Require []. | Consume [], Require 1 Water and 1 Ore. Line 119. Card matches runtime. | Bronze test set lines 22–23. |
| `recordKeeping` | activation | Table line 88: `type` birth, no season keys. | `type` season, spring/summer/autumn/winter, amount 1 each, `populationBand` 60 kept. Line 126. Card says every season. | Bronze test set line 24. |
| `goatHerding` | cadenceMoons | Table line 67 activation is food / preRouting and does not mention cadence. | `cadenceMoons` 2. Line 105. Activation type and stage match the cell. | Only practice with this field. |

## Other executable-cell mismatches

These are exact cell-versus-definition differences. Where another current doc already states the runtime number, the correction is the implementation table (and any card that still copies the old cell), not the definition.

| ID | Field | Table cell | Runtime | Line | Note |
| --- | --- | --- | --- | --- | --- |
| `brewing` | consume | Edible 1 + Vessel 1 (line 85) | Edible 1 + Storage 1 | 123 | Bronze line 23. Card matches runtime. |
| `surveying` | activation, consume, effects | birth; Consume Tool 1; generateStock 2 (line 92) | migration; consume []; generateStock 1 and research 1 | 130 | Bronze lines 25–26. Card matches runtime. |
| `raidingParties` | effects | generateStock 1 (line 128) | generateStock 10, summer 10 / autumn 5, addChaos 1 | 166 | Bronze lines 26–27. Card matches runtime. |
| `longhouse` | housing | 150 (line 170) | 210 | 11 | Milestone line 92. Card says +210. |
| `tenement` | housing | 240 (line 171) | 360 | 12 | Milestone line 92. Card says +360. |
| `greatDwelling` | housing | 360 (line 172) | 630 | 13 | Milestone line 92. Card says +630. |
| `granary` | modifiers.amount | 3 (line 173) | 5 | 14 | Bronze line 28. Card says +5. |
| `astronomy` | effects | generateStock 1 (line 94) | generateStock 1 and addChaos 6 | 132 | Chaos is not on the card. |
| `ruinDelving` | effects | generateStock 2 (line 103) | generateStock 2 and addChaos 12 | 141 | Chaos is not on the card. Stock +2 matches the card. |
| `mountedRaiding` | effects | generateStock 2 (line 129) | generateStock 2 and addChaos 18 | 167 | Chaos is not on the card. Stock +2 matches the card. |
| `monsterHunting` | effects | generateStock 2 (line 138) | generateStock 3 and research 6 | 176 | Card says +3. Milestone line 178 states 6 Research for automatic hunts; the card does not. |

Astronomy's card also says completing all seasons grants Research. There is no `research` effect. Milestone deviation 5 already defers Astronomy's all-season Research reward. That clause is a documented deferral, separate from the unlisted Chaos 6.

## Card prose versus the same runtime data

The executable cell already matches runtime for these four. The card still states a clause the modifiers do not implement. Milestone line 188 already records the Storehouse, Cistern, and Millhouse shortenings. Workshop's executable cell already drops the Charge +1 Stock sentence that `ui.rule` still shows (line 18, table line 177).

| ID | Field | Card | Runtime |
| --- | --- | --- | --- |
| `cistern` | additional capacity | Food-tagged Water practices +1 capacity (line 15) | One capacity modifier, amount 2. No second modifier. |
| `millhouse` | output | +1 Edible stock when a stocked Power practice exists (line 20) | Capacity amount 2 only. No output modifier. |
| `workshop` | output | Charge practice with Tool or Construction generates +1 Stock (line 18) | Capacity amount 1 only. No output modifier. |
| `storehouse` | chosen trait | Player chooses one trait at build (line 17) | Capacity query is pinned to Construction, amount 2. |

## Limits

The audit did not replay settlement ticks, did not read `civcontent-2.6-source.json` as authority, and did not compare Charge trigger prose unless the executable JSON contained `charge`. Construction and worker figures were checked only for the bronze sentences encoded in the script (Timber House cycles, Sheepfold, Storehouse, Scriptorium, Weigh House, Schoolhouse, five one-worker practices, six stock capacities). Those claims matched runtime. Population and construction fields that no current doc states as a number were not called mismatches.

## Supervised corrections

The current executable table now matches all 109 Practice rows and 78 Structure rows under the comparisons above. The independent rerun reports zero table mismatches and zero card mismatches within the scanner's stated scope. Observation remains documented separately as a subsequent content addition.

Forecasting's existing 6 Chaos cost was added to its current table row and UI rule. Sixteen other executable rows were brought up to date with the existing tuned definitions, including Goat Herding's two-moon cadence. Astronomy, Ruin Delving and Mounted Raiding now display their existing Chaos costs; Monster Hunting displays its existing 6 Research victory reward. Cistern, Millhouse, Workshop and Storehouse describe their implemented capacity modifiers, and Astronomy no longer promises its deferred all-season Research reward.

All nine changed card fields were `ui.rule` only. An independent comparison preserved every other definition field, including gameplay effects, modifiers, costs, schemas and authored workbook wording. The historical source workbook was not changed. The audit reports findings rather than treating shortened or deferred authored clauses as authority for new mechanics.
