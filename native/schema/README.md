# Serialized browser GameState v52

Baseline `496d9971630e679ce3a35da574b19e19f155b44d`. This is the shape emitted by `serializeGameState` for initialized detailed-settlement runs, including normal full-map New Game, authored starts and configured Life Map content. It includes captured GameConfig v31, Life Map generator v16 and generated graph v9. See [the tick specification](../spec/tick-pipeline.md) for which fields affect simulation versus inspection. The schema is the interchange format for fixtures and codec work. The native simulation may derive or store state differently under its deterministic stepping contract.

## Reading the schema

- `record` has a declared field set. `optional` controls whether a key may be missing and `nullable` controls whether a present value can be null. Array cell nullability is defined by its item type.
- `dict` has data-selected keys and a common value type. `intString` means a canonical signed decimal integer spelling. It is independent of JS enumeration's array-index definition. `array` preserves order, and `tuple` requires exactly the listed cells.
- `union` selects a string-tagged record by its discriminator, including Practice effect ops, Charge trigger kinds and terrain/Stock multiplier kinds. Fixed config vocabularies such as settings, seasons, cost kinds and Life Map node rules are records. Gamepiece and Relic definition registries and runtime ID maps are dictionaries. Slot-indexed arrays remain arrays or fixed-size tuples.
- Two extensions handle value shapes that have no discriminator. `nullable` has a `value` TypeRef and admits null or that type (e.g. a Practice or Heirloom cell). `oneOf` has a `variants` list of TypeRefs and requires an exact single match (e.g. a numeric Legacy depth or the literal `"end"`, and numerical or named balance costs). Records and tuples can have a descriptive `note`; notes do not change validation.
- `number` accepts finite JS Numbers and `integer` accepts finite integral JS Numbers, including unsafe-valued integral Numbers in past RNG accumulators. It does not imply a 32-bit storage type. `json` is used once, for nullable `GameState.skillProgressionDefs`. The legacy scenario API JSON-clones an arbitrary object here. All covered starts used null and no live rules interpret a fixed structure there. The legacy game event feed is empty in these runs. Its hypothetical record shape beyond the deserializer's ID check is unconfirmed.
- The validator checks shape, field presence and exact version tags. Semantic constraints such as graph reachability, references to captured definitions, unique cards and legal Stock combinations still belong to the game validators. This is a closed inventory of documented producers, captured data and source-derived variants. Browser APIs accepting additional, opaque editor keys or malformed/debug-only inputs do not make those keys part of the format. A compatible extra must be investigated and added explicitly.

## Property order and serialization

The order of `fields` is a readable example from producers, never a canonical record-write order. For byte-identical browser fixture round trips, retain a per-object order or equivalent decoding metadata, including nested records and the captured config. JS enumerates canonical array indices from 0 through 4,294,967,294 in ascending order, then other string keys in insertion order. Overwriting retains position; deletion followed by insertion appends for non-index keys. Dictionary hashing can use sorted keys when the parity protocol asks for it. Gameplay traversal must use its separately documented semantic order.

Record notes identify observed reordering with the same field set and known construction-dependent orders. Examples include settlement seeding and transition, joint cohort compositions, Vassal receipts, Practice definitions, Life Map content/graph records and event payload spreads. A fixed generated struct declaration order cannot capture those histories. `serializeGameState` takes a JSON clone and strips runtime RNG functions, dirty and season latches, board/hub occupancy and derived inventory indexes. It fixes missing/null Practice tier to bronze and derives phase from pause. Undefined object members are absent, while holes or undefined array members stringify as null. Finite numbers remain binary64. JS serialization of non-finite numbers as null is relevant to defect probes and does not make non-finites legal schema input.

Reference scope is the initialized V52 simulation. `createEmptyState` before initialization, runner-save envelopes, legacy board/pawn editors, outer performance bundles, inputs to a launch recipe and transient runtime helpers are outside this contract. Pending Practice events are typed from emitters. Transient root context, optional card effects and rare shop/Relic/Commission branches remain source-derived where capture did not exercise them.

### GameConfig number audit

Captured fields retain fractional values when their browser editors and readers
permit them. The v52 inventory initially inferred some integers from defaults.
These fields are now `number`.

| Schema fields | Browser contract |
| --- | --- |
| `KeywordScale.amount`, `per`, `cap` | A multiplier accepts a finite nonnegative coefficient and requires whole counts for `per` and `cap`. Effect-level keyword expressions share this shape and retain fractional divisors and caps. The compiler checks whole counts for the multiplier attachments. |
| `PracticeDefinition.cadenceMoons`, `minimumSupportRequired`, `retinueForce`, `minimumWarriors` | Cadence is the divisor in a remainder test, and the other fields are Force contributions or numeric thresholds. The editor validates finiteness. |
| `StructureDefinition.specialistGate`, `StructureDefinitionConversionSupport.minimumPopulation`, `ModifiersQuery.minimumSpecialists`, `minimumRequirements`, `historicalBurdens` | Gates compare an observed count to the authored threshold. |
| `StructureDefinitionModifiersEntry.arms`, `cap` | Arms is a Stock threshold and cap bounds a numeric institution bonus. |
| `PracticeDefinitionPopulationRequireEntry.amount` | Population reserves compare the eligible population count to the authored threshold. |
| `StockInput.amount`, `ConversionSupportRequireEntry.amount`, `ConversionSupportConsumeEntry.amount` | Stock planning uses numeric amounts. The shared Stock shape also covers upkeep and other recipes whose editor has no whole-number check. Practice Consume/Require and construction keep their separate integral input checks. |
| `StructureDefinitionWorkbook.row`, `PracticeDefinitionWorkbook.row` | Provenance metadata passes through the generic numeric editor. |
| `LifeMapDesignOccurrence.{common,uncommon,rare}`, `NodeFamilyWeights.{patronage,development,crossroads,practiceReform,publicWorks,crisis,training,discovery,campaign,challenge,foodShop,housingShop}`, `RelicWeight.weight` | Weighted choice operates on finite fractional weights. |
| `CostBandsTime.{cheap,fair,expensive}`, `CostBandsPrestige.{cheap,fair,expensive}`, `CostBandsMonsterPressure.{cheap,fair,expensive}`, `CardPrice.time` | Balance validation accepts finite base costs. Time rounds after conversion from years to phases. |

Remaining integer settings are explicitly checked by the settings draft
validator. Season and moon-phase durations retain their existing `number`
types for the direct configured initializer. Other integral fields represent
validated counts, grid positions, admission limits, whole currency prices or
population selections. Relevant checks are in `game-config.js`,
`mechanic-validation.js`, `vassal-life-map-generator.js`, `life-map-design.js`,
`life-map-balance.js`, and `life-map-columns.js`.

## Capture and validate

Run from the repository root with Node:

```sh
node native/schema/capture.mjs
node native/schema/capture.mjs --sustained
node native/schema/capture.mjs --queued
node native/schema/validate.mjs artifacts/native-schema/snapshots-v2 artifacts/native-schema/sustained artifacts/native-schema/queued
```

The sampler uses the model independently of the native reference trace tooling. It writes a manifest and raw JSON files under ignored `artifacts/native-schema/`. It advances 60 official ticks per reference second and uses accepted `applyAction` calls with the replay context, without changing graph reachability or forcing actions. Standard year duration is read from captured settings and the season count. The 7.25-second season case exercises a permissive direct configured-init path with longer lunar phases. The normal editor requires integral season duration.

Validation evidence from the inventory run:

- **5,198 snapshot files passed, zero failed.** That includes 2,249 exploratory captures and 2,942 expanded captures, plus five sustained checkpoints and two queued-event checkpoints. These runs overlap in seeds and some contents. There were 12 ordinary New Game seeds, 16 distinct seeds overall, and settings variations.
- The expanded run captured 192 ordinary samples (0–640 s), 12 authored starts/checkpoints (0–160 s), 26 prepared start/anchor samples across five seeds (0–3,744 s), and 2,712 action-bearing samples through 4,176 s, including seven terminal samples. The prepared seed 123 used the production-sized 6,400-s model projection and ended early on terminal loss. Four other prepared seeds used 320-s slices. Gzip/browser transport was outside this probe. The queued fixture captures a legal clear-garrison action and the next second, exercising the pending journal before and after drain.
- The sustained fixture passed at elapsed 1, 50, 200, 210 and 1,000 years (32,000 s), using captured settings to suppress pressure, births and late attrition. This isolates long clocks and seed accumulation while preserving ordinary board/site traversal.
- **384 types, 1,666 declared fields, 1,398 observed, 268 never observed, eight seen only as null.** The null-only fields were holding claimant, garrison support target, obsolete skill defs, vault overflow, maximum observed survival year and three context fields of the queued garrison event. Most missing fields are alternate DSL tag parameters or rare action branches, including other pending-event payloads, keyword prototype/locks, Discovery, replacement and removal receipts, Mandate and military aid. Their production reachability is unconfirmed by this sample. The CLI prints exact field names on every run.
- Seven negative controls rejected an unknown key, fractional integer, invalid null, missing required nullable field, unknown DSL tag, wrong tuple length and invalid mixed-type depth. The untouched source snapshot passed.

This is analysis and model-only verification. The browser simulation, RNG, serialization code, replay and layering were untouched.
