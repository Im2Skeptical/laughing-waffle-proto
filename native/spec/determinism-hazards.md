# Determinism hazards at browser baseline 496d9971

The native forecast target is about 1,000 in-game years (32,000 simulated seconds) per real second, with smooth scrubbing. Browser parity is a source of differential tests. The native engine needs a specified, reproducible sequence of decisions and state across Windows and Android. The interchange codec still needs to read and faithfully re-emit the browser snapshots it takes as fixtures. Native execution can use a different representation and explicitly version its changed rules.

- **CP — cross-platform determinism (always required).** A deterministic native rule is required wherever this operation affects state, choices, replay or summary values. JS equality is still useful for locating the first divergence.
- **JS — JS-exactness only (porting aid, may be dropped for performance).** Reproduce the browser detail where an exact oracle or browser-file round trip relies on it. A native counterpart may choose another specified rule. One line can have both aspects. CP never requires using a JavaScript container or library in native code.

## Highest-impact porting rules

| Tag | Baseline site | Porting rule |
| --- | --- | --- |
| CP / JS | `src/model/rng.js:3`, lines 16, 29, 42, 55, 68 | Serialize the existing seed values as binary64 Numbers for interchange. Each draw adds 0x6d2b79f5 to the **unwrapped** seed, then signed/unsigned low 32-bit mixing and a division by 2³². An exact codec must not truncate snapshot seeds to u32. Native can store u32 modulo seeds only after choosing a separate simulation seed contract. The base seed is provenance, plus five advancing streams. |
| CP / JS | `src/model/commands/simulation-commands.js:36` and `src/model/state.js:408` | Specify tick/phase ordering and replay granularity. Sixty repeated binary64 additions, seasonal boundary drift and mid-second latch behavior are browser-exact details. Choose an explicit clock if collapsing ticks. Preserve season-before-lunar precedence according to that clock. |
| CP | `src/model/detailed-settlements/practices.js:297` | Root/parent IDs, FIFO, cap, local-before-shared retries, first deferred entry and per-root Discharge de-duplication affect real upstream supply and control. Retain ordered queues even if batching or replacing Map/Set with indexed storage. |
| CP | `src/model/detailed-settlements/stock.js:143`, `src/model/detailed-settlements/workers.js:17` | Allocation ties use practice slots and player providers in authored region order. Parallelize only independent plans. Commit shared debits and payments in defined order, and keep tie decisions stable. |
| CP / JS | `src/model/detailed-settlements/phases/shared.js:42` | Browser consumes one draw per person even at 0 or 1 probability. Birth orders sites → residency → specialty → three roll loops. Death uses hardship before mortality. Native may use a versioned cohort sampler with its own draw accounting; each adopted stream must remain stable and serializable. |
| CP | `src/model/detailed-settlements/phases/migration.js:174`, lines 218, 232, 305, and `src/model/detailed-settlements/population-ledger.js:12` | Housing proposals, largest remainders and arrival meals require deterministic ties. Keep input order for equal comparison keys or make the original ordinal a final key. Do not independently solve each destination against stale reservations. |
| CP / JS | `src/model/detailed-settlements/phases/chaos.js:22`, `src/model/regional-map/generator.js:215`, `src/model/regional-map/biome-clustering.js:91` | Fix transcendental evaluation/quantization where results cross thresholds or rank alternatives. Exact JS mode uses the baseline V8 numerical path. Native can replace infrequent pow/exp and geometry with a portable, tested approximation, with topology/hash fixtures for the new contract. |
| CP / JS | `src/model/full-map-world.js:24`, `src/model/regional-map/generator.js:151`, `src/model/vassal-life-map-generator.js:454` | Stable ties are semantically important in seed-based construction. Import comparator order explicitly. Default sort is UTF-16 code-unit order; localeCompare is collation. Native may adopt a stable ordinal/byte policy with new generation goldens. |
| CP / JS | `src/model/state.js:408`, `src/model/game-config.js:257` | Missing keys, explicit nulls, array holes and numeric non-finites have distinct JS behaviors. Define native state invariants and validate finiteness at boundaries. Preserve key membership/nulls and key order when producing a byte-exact browser fixture. |
| CP / JS | `src/model/detailed-settlements/birth-allegiance.js:12`, `src/model/detailed-settlements/phases/migration.js:224`, `src/model/chaos-values.js` | Keep arithmetic/rounding and accumulation order defined around integer thresholds. Treat JS half-toward-positive-infinity, signed zero, epsilons and exact IEEE operation order as compatibility specifications. Choose and verify native thresholds before optimizing with parallel reductions or fused multiply-add. |

## Confirmed and suspected browser defects

- **CP / JS. Confirmed mid-second save/restore divergence.** Seed 123, ordinary start, advance to second 8 via the replay runner. After tick 480, season index 0 and `seasonClockSec = 7.999999999999977`. One more `updateGame(1/60, state)` moves to season index 1 and sets `_seasonChanged = true`, with `tSec` still 8. The serializer deletes the latch and deserializer resets it. After 59 more identical ticks, the uninterrupted second-9 trace contains nine `activationType: "season"` records and the restored branch contains zero. This demonstrates a model API gap. Reachability through normal browser save slots (which use second boundaries) is unconfirmed. See `src/model/state.js:421` and `src/model/commands/simulation-commands.js:90`.
- **CP / JS. Confirmed RNG accumulator precision loss at target horizon.** The browser stores Number accumulators while the native architecture describes uint32 wraparound. On the sustained seed-123 profile in [tick pipeline](tick-pipeline.md#workload-sizes-and-coarse-cpu-profile), the general seed exceeded the safe-integer range at second 25,729 (`9007373259725332`) and reached `11208457474296332` at 32,000 s. The odd increment cannot retain its low bit once addition rounds to an even representable Number. This changes the draw stream from uint32 modular Mulberry32. Replay with the same browser Number remains deterministic. Keep the exact incoming value in the interchange layer, and choose explicitly whether native continuation from such a snapshot preserves browser rounding or restarts modulo semantics. See `src/model/rng.js:3`.
- **CP / JS. Confirmed non-finite Primordial pressure with valid tunables.** Probe `getPrimordialChaosPressure` at year 156 with cadence 1 and growth factor 100. The power overflows. A zero base produces NaN internally, which `roundChaos` masks to 0. A positive base returns Infinity, which the serializer turns into null if stored. Normal-play reachability and the exact downstream effect on progression were unconfirmed. Native must define bounds or saturation before such a number reaches a decision or summary. See `src/model/detailed-settlements/phases/chaos.js:13` and `src/model/chaos-values.js:3`.
- **CP / JS. Suspected topology collation portability issue.** A generated ordered list uses `localeCompare` without a locale. Graph and arbitrary editor IDs can contain punctuation or case. A locale or ICU change could alter order. No platform divergence was reproduced. See `src/model/vassal-life-map-generator.js:454`.
- **JS. Captured configuration validator gaps.** `canonicalizeLifeMapDesign` spreads imported keys through, while effect validation tests top-level keys more strictly than nested shape. A browser validator accepting an unused key does not establish a typed simulation contract. No action-dependent divergence was confirmed for that input class. See `src/model/life-map-design.js:18` and `src/model/mechanic-validation.js:25`.

## File inventory

The inventory starts at replay-second runner, new game, state, actions and Life Map generator. It scans their relative static import/re-export closure at the baseline (135 files, 31,284 lines). It includes load/validation and legacy code that is reachable by imports but may be dormant in the live tick path. Lines are source sites, not a claim that every match is hot or every guard is externally reachable. Sorted comparator domains are valid constructed state unless an exception is described. A stable total preorder may return zero for distinct values. Total ordering of instances then uses the original index. Code-unit default sort and locale collation are different.

The inventory groups repetitive null/NaN guards by file and reports other sites individually. This is a lexical inventory with source review of the major execution paths. Dynamic iteration aliases, non-obvious numeric thresholds not matching the scan, and legacy input reachability are unconfirmed. No wall clock, host entropy, or Date use was found in this model/definition import closure. Browser/UI seed choices and profiler wall times are outside it.



### src/defs/gamepieces/bronze-keyword-defs.js

- **CP / JS** L12 `[(['patternCarving','scarredShields'].includes(id)?'keywordCapacityScale':'keywordOutputScale')]:{keyword,per:1,amount:1}…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/gamepieces/detailed-settlement-defs.js

- **CP / JS** L210 `export const VASSAL_INTERVENTION_PRACTICE_IDS = Object.freeze(Object.keys(detailedSettlementPracticeDefs));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L211 `export const detailedSettlementEffectOps = Object.freeze(Object.keys(MECHANIC_EFFECTS).filter(op => MECHANIC_EFFECTS[op].…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/gamepieces/env-events-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 264.

### src/defs/gamepieces/full-map-defs.js

- **CP / JS** L3732 `[...Object.values(fullMapPractices), ...Object.values(fullMapStructures)]` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L3734 `.concat(Object.keys(remnantSupplyPracticeDefs),Object.keys(remnantBasicPracticeDefs),Object.keys(remnantBasicStructureDefs))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/gamepieces/hub-structure-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 157.

### src/defs/gamepieces/regional-practice-defs.js

- **CP / JS** L43 `export const REGIONAL_PRACTICE_IDS = Object.freeze(Object.keys(regionalPracticeDefs));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/gamepieces/settlement-practice-defs.js

- **CP / JS** L165 `'Every ${Math.max(1, Math.floor(PRACTICE_REST_PASSIVE_CADENCE_MOONS))} moons',` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L173 `MOON_CYCLE_SEC * Math.max(1, Math.floor(PRACTICE_REST_PASSIVE_CADENCE_MOONS)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/defs/gamepieces/vassal-heirloom-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 126, 130.
- **CP / JS** L46 `effects: Object.freeze({ ...effects }),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L123 `export const VASSAL_HEIRLOOM_DEFINITION_IDS = Object.freeze(Object.keys(VASSAL_HEIRLOOM_DEFS));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L130 `const text = String(quality ?? "");` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L131 `return text ? '${text[0].toUpperCase()}${text.slice(1)}' : "";` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.

### src/defs/gamepieces/vassal-life-map-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 172, 173, 174, 179, 183, 184, 185, 186, 189, 193, 263.
- **CP / JS** L174 `&& (effect.amount > 0 || Object.values(effect.seasonAmounts ?? {}).some(amount => amount > 0)));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L178 `return [...new Set(Object.values(practiceDefs).flatMap(def =>` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L179 `(def.stockTraits ?? []).filter(output => isVassalStockOutputPractice(def, output))))].sort();` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L263 `const safeAge = Math.max(0, Math.floor(age ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/defs/gamesettings/moon-phase-defs.js

- **CP / JS** L42 `Object.fromEntries(MOON_PHASE_DEFS.map((phase, index) => [phase.id, index]))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/gamesettings/scenarios-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 100, 103, 108, 112, 113.

### src/defs/gamesystems/hub-system-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 96, 107, 149, 172, 190.

### src/defs/mechanics.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 118, 128, 129, 130, 136, 137, 138, 139, 140, 142, 143.
- **CP / JS** L6 `fields: [...amountFields, ...(extra.fixed ? [] : scalingFields), ...(extra.param ? [extra.param] : [])], ...extra });` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L7 `const event = (kind, name, icon, { scopes = ['local', 'adjacent', 'connected', 'civilization'], filters = [], ...extra } …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L8 `({ kind, name, icon, scopes, filters: [...(scopes.includes('local') ? ['faction', 'controller'] : []), ...filters], ...ex…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L12 `Object.values(value).forEach(freeze);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L87 `effects: [effect('convertPopulation', 'Population conversion', 'population', { fields: [...amountFields, ...scalingFields…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L90 `effects: [effect('politicalForce', 'Political Force', 'support', { fields: [...amountFields, ...scalingFields, 'defenseOn…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L117 `const rows = Object.entries(MECHANICS).flatMap(([mechanicId, mechanic]) =>` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L118 `(mechanic[field] ?? []).map(binding => [binding[key], { ...binding, mechanicId, status: mechanic.status }]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L119 `if (new Set(rows.map(([id]) => id)).size !== rows.length) throw new Error('Duplicate mechanic ${field} binding');` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L120 `return freeze(Object.fromEntries(rows));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L125 `export const MECHANIC_KEYWORDS = freeze(Object.fromEntries(Object.entries(MECHANICS)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L127 `.map(([id, value]) => [id, { name: value.name, ...value.keyword }])));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L134 `const ids = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L142 `for (const mod of [...(def?.modifiers??[]),...(def?.stockMultipliers??[])]) add(mechanicMultiplier(mod.kind));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L144 `return [...ids].map(id => ({ id, name: MECHANICS[id].name, type: MECHANICS[id].type,` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/defs/tooltip-ui-utils.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 7.
- **CP / JS** L10 `for (const def of Object.values(registry)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/defs/world/detailed-settlement-scenario.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 21, 33, 46, 56, 65, 66.

### src/defs/world/world-map-defs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 14, 32, 33.
- **CP / JS** L103 `name: 'Settlement${String(regionIndex + 1).padStart(2, "0")}',` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.

### src/model/actions.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 70, 75, 90, 105, 106, 119, 130, 214.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 71.
- **CP / JS** L71 `return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L89 `? Math.max(0, Math.floor(cap))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L90 `: Math.max(0, Math.floor(state.actionPointCap ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L92 `typeof points === "number" ? Math.floor(points) : overrideCap;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **JS / CP** L130 `'Unknown action kind: '${action?.kind}'. Action: ${JSON.stringify(action)}'` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/chaos-values.js

- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 8.
- **CP / JS** L4 `return Math.max(0, Math.round((Number(value) || 0) * 100000) / 100000);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L9 `return Number(Math.abs(value) < 0.01 ? value.toPrecision(1) : value.toFixed(2)).toString();` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.

### src/model/commands/ap-helpers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 32.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 29, 37.
- **CP / JS** L19 `? Math.max(0, Math.floor(override.cap))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L20 `: Math.max(0, Math.floor(state.actionPointCap ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L24 `const bonus = Math.floor(getGlobalSkillModifier(state, "apCapBonus", 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/commands/debug-commands.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 35, 39, 46, 47, 48, 55, 56, 57, 59, 68, 77, 83, 84, 86, 102, 108, 111, 125, 132, 133, 137, 138, 144, 146, 147, 161, 170, 174, 175, 179, 184, 206, 208, 227, 239.
- **CP / JS** Missing continued. Lines 240, 261, 264, 279, 283, 299, 300, 307.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 35, 57, 60, 70, 196, 261, 264.
- **CP / JS** L35 `return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L60 `return Number.isFinite(rawSpan) && rawSpan > 0 ? Math.floor(rawSpan) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L65 `const start = Math.max(0, Math.floor(startSlot));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L66 `const end = start + Math.max(1, Math.floor(span));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L70 `const anchor = Number.isFinite(structure.col) ? Math.floor(structure.col) : index;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L106 `overrides[String(safeSlotIndex)] = true;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L108 `delete overrides[String(safeSlotIndex)];` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L110 `if (Object.keys(overrides).length === 0) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L117 `const start = Math.max(0, Math.floor(startSlot));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L118 `const end = start + Math.max(1, Math.floor(span));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L197 `? Math.floor(def.defaultSpan)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L226 `? Math.max(0, Math.floor(cap))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L227 `: Math.max(0, Math.floor(state.actionPointCap ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L228 `const overridePoints = typeof points === "number" ? Math.floor(points) : overrideCap;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L262 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L264 `const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/commands/settlement-vassal-commands.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 19, 20, 21, 25, 26, 44, 46, 48.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 19.
- **CP / JS** L20 `? Math.floor(payload.candidateIndex) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/commands/simulation-commands.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 50, 58, 80, 88, 106.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 25.
- **CP / JS** L21 `const nextSeasonIndex = ((state.currentSeasonIndex || 0) + 1) % seasons.length;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L25 `const currentYear = Number.isFinite(state.year) ? Math.floor(state.year) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L44 `state.seasonClockSec += dt;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L48 `state.seasonClockSec -= dur;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L60 `state.simStepIndex = (state.simStepIndex || 0) + 1;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L62 `const prevTSec = state.tSec || 0;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L63 `const newTSec = Math.floor(state.simStepIndex / TICKS_PER_SEC);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-practice-tiers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 30, 35, 36.
- **CP / JS** L35 `const base = Math.max(0, Math.floor(definition?.workerCapacity ?? 2));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/biome-multipliers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 19, 27.
- **CP** L11 `patches=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L12 `const regions=new Map(definition.regions.map(region=>[region.id,region]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L15 `const ids=[],queue=[region.id],seen=new Set(queue);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/detailed-settlements/birth-allegiance.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 25.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 34.
- **CP / JS** L5 `const ids=Object.keys(shares).filter(id=>shares[id]>0).sort();` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L6 `const total=ids.reduce((n,id)=>n+shares[id],0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L12 `if(!credit||Object.keys(credit).sort().join('|')!==ids.join('|'))credit=ledgers[key]=Object.fromEntries(ids.map(id=>[id,0…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L13 `const counts=Object.fromEntries(ids.map(id=>[id,0]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L22 `const remainder=ids.slice(0,-1).reduce((n,id)=>n+credit[id],0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L31 `for(const [key,credits] of Object.entries(ledgers)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L33 `const entries=Object.entries(credits);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L35 `||Math.abs(entries.reduce((n,[,c])=>n+c,0))>1e-8)return ['invalid birth allegiance credit balance'];` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/cohorts.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 7, 8, 9, 10, 18, 26, 41, 44, 52, 57, 58.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 56.
- **CP / JS** L4 `export const emptySpecialists = () => Object.fromEntries(SPECIALIST_IDS.map(id => [id, emptyAgeCohort()]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L5 `export const ageCohortTotal = c => (c?.children ?? 0) + (c?.adults ?? 0) + (c?.eldersByAge ?? []).reduce((n,e)=>n+e.count…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L9 `const ages = new Map((target.eldersByAge ?? []).map(e=>[e.age,e.count]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L11 `target.eldersByAge = [...ages].filter(([,count])=>count>0).sort((a,b)=>a[0]-b[0]).map(([age,count])=>({age,count}));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L29 `for (const key of Object.keys(value)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L37 `try { return plainStructuredCopy(value, new Map()); }` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L51 `for(const part of Object.values(parts)) addAgeCohort(combined,part);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L52 `Object.assign(target,combined,{specialists:Object.fromEntries(SPECIALIST_IDS.map(id=>[id,parts[id]??emptyAgeCohort()]))});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L56 `return Object.values(parts).every(c=>Number.isInteger(c.children)&&c.children>=0&&Number.isInteger(c.adults)&&c.adults>=0)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L58 `&& (cohort.eldersByAge??[]).every(e=>SPECIALIST_IDS.reduce((n,id)=>n+(cohort.specialists?.[id]?.eldersByAge.find(a=>a.age…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/construction.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 10, 11, 18, 28.
- **CP** L13 `const paid = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L25 `traits: [...new Set(plan.providers.flatMap(provider => stockTraits(state, stockProviderSlot(state, site.detailedState, pr…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/detailed-settlements/demographics.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 16, 24, 27, 30, 31, 32, 34, 37, 38, 41, 42, 43, 44.
- **CP / JS** L8 `const group=()=>({...ages(),specialties:Object.fromEntries(SPECIALTIES.map(id=>[id,ages()]))});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L10 `return Object.entries(settlement.populationByClass).flatMap(([classId,c])=>Object.entries(splitSpecialistCohorts(c)).flat…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L16 `const sum = (entries,key) => Object.values(entries??{}).reduce((n,e)=>n+(e?.[key]??0),0);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L19 `const byAllegiance=Object.fromEntries((knownAllegiance?['player','external-a','neutral']:['unrecorded']).map(id=>[id,grou…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L20 `const specialties=Object.fromEntries(SPECIALTIES.map(id=>[id,ages()])),population=ages(),elderAges=new Map();` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L26 `for(const target of [population,faction,faction.specialties[b.specialty],specialty]){target[kind]+=b.count;target.total+=…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L29 `const residency=Object.entries(settlement.populationByClass).map(([id,c])=>{` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L30 `const tier=String(c.faith?.tier??'gold'),faith=tier[0].toUpperCase()+tier.slice(1),count=(c.children??0)+(c.adults??0)+(c…` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L40 `elderAges:[...elderAges].sort((a,b)=>a[0]-b[0]).map(([age,count])=>({age,count})),` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L43 `arrivals:(last?.migration?.inbound??[]).reduce((n,m)=>n+(m.survivors??m.amount??0),0),` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L44 `departures:(last?.migration?.outbound??[]).reduce((n,m)=>n+(m.amount??0),0)},` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/external-world.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 24, 27, 33, 34, 38, 39, 40, 42, 46, 48, 51, 54, 62, 66, 67, 71, 72, 77, 78, 90, 91, 96, 97, 100, 106, 131, 134, 135, 139, 140, 142, 150, 173, 180, 182.
- **CP / JS** Missing continued. Lines 186, 193, 195, 196, 197, 199, 201, 212, 213, 219, 225, 233, 235, 242, 244, 246, 247, 261, 289, 298, 299, 324, 346, 348, 349, 355, 366, 367, 380.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 126.
- **CP / JS** L35 `if (mod.kind==='stockSupport') multiplier+=Math.min(3,stocked)*mod.amount;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L36 `if (defense&&mod.kind==='stockDefense') flat+=Math.min(3,stocked)*mod.amount;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L42 `return Math.floor(warriors / CIV_CONTENT_TUNING.warriorsPerSupport * multiplier + flat + (settlement?.supportBank?.format…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L48 `const share=Math.min(.5,modifiers.reduce((n,m)=>n+(m.kind==='networkSupport'?m.amount:0),0)+(local?.supportBank?.coordina…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L52 `const amount=Math.min(10,Math.floor(localMartialSupport(state,id,defense)*share));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L58 `export const getMartialSupport = (state,regionId,defense=false) => getSupportSources(state,regionId,defense).reduce((n,s)…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L60 `const contributions = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L68 `const sources=military?[{regionId,amount:Math.max(0,military.force-military.receivedForce)},...military.supportSources.ma…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L89 `const population = sites.reduce((n, site) => n + specialistCount(site.detailedState, 'warrior'), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L91 `const held = Math.floor(Math.max(0, prestigeAccount(state,vassal).prestige ?? 0) / VASSAL_CLASS_RULES.warrior.prestigePer…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L94 `bonus += structureModifiers(state, site.detailedState).reduce((n, m) => n + (m.kind === 'retinueForce' ? m.amount : 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L100 `return { value: held + Math.floor(bonus), cap: null, population, nextPrestige: (held + 1) * VASSAL_CLASS_RULES.warrior.pr…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L109 `const support = getCivilizationSupportSources(state).reduce((n, source) => n + source.amount, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L121 `const queue = [[start,0]], seen = new Set([start]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L133 `settlement.populationByClass.villager = { ...settlement.populationByClass.villager, children:0, adults:template.populatio…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L136 `const stocks = NEUTRAL_MARKETS[index].map(entry => ({ ...entry, traits: [...entry.traits], stock: Math.floor(entry.capaci…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L152 `eligible.sort((a,b) => {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L205 `if(apply) { provider.stock-=yieldCount; state.civilization.history.raids++;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L215 `const population=Object.values(settlement.populationByClass).reduce((n,c)=>n+c.children+c.adults+c.eldersByAge.reduce((s,…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L216 `for(const c of Object.values(settlement.populationByClass)) { c.children=0;c.adults=0;c.eldersByAge=[];c.specialists=empt…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L217 `settlement.populationByClass.stranger.adults=Math.max(1,Math.floor(population*(edge>=3?1:.8)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L218 `if(edge<3) for(const p of settlement.practiceSlots.filter(Boolean)) p.stock=Math.floor(p.stock*.8);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L274 `target.monster={defense:CIV_CONTENT_TUNING.monsterDefense+Math.floor(spawnNumber/3)};` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L278 `const region=regions.filter(region => region.monster).sort((a,b)=>a.monster.defense-b.monster.defense)[0];` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L301 `const edibleCost=plan.providers.filter(p=>p.kind==='consume'&&p.regionId===targetId&&stockTraits(state,stockProviderSlot(…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L309 `state.civilization.research.total += region.monster.defense;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L315 `const share=Math.min(.75,structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='evacuationShare'?m.amount:0),0));` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L317 `const moved=evacuatePopulation(state,targetId,id,Math.ceil(getPopulationSummary(state,targetId).total*share));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L335 `chaos.monsterPressure = Math.round((chaos.monsterPressure-threshold)*1e9)/1e9;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L350 `emitPracticeEvent(state, { kind: 'monsterSpawn', cause, ...result });` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L382 `chaos.monsterPressure = Math.round((chaos.monsterPressure + Math.max(0, amount))*1e9)/1e9;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/helpers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 10, 13, 45, 46, 49, 51, 61, 65, 81, 92, 93, 99, 100, 116, 119, 120, 121, 122, 123, 124, 132, 135, 138, 139, 140, 174, 190, 194, 195, 196, 197, 199, 226, 227, 228.
- **CP / JS** Missing continued. Lines 229, 230, 231.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 13, 20, 45.
- **CP / JS** L14 `? Math.max(1, Math.floor(state.seasonDurationSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L20 `const safeYear = Number.isFinite(year) ? Math.max(1, Math.floor(year)) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L28 `return Math.max(0, Math.round((Number(value) || 0) * FOOD_SCALE) / FOOD_SCALE);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L63 `for (const key of Object.keys(value)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L88 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L92 `return (classState?.eldersByAge ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L93 `(sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L99 `return Math.max(0, Math.floor(classState?.children ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L100 `+ Math.max(0, Math.floor(classState?.adults ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L105 `return Object.fromEntries(POPULATION_CLASS_ORDER.map((classId) => [classId, {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L120 `children: Math.max(0, Math.floor(source.children ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L121 `adults: Math.max(0, Math.floor(source.adults ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L123 `age: Math.max(0, Math.floor(cohort?.age ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L124 `count: Math.max(0, Math.floor(cohort?.count ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L132 `if (Object.values(composition??{}).some(c=>Array.isArray(c?.joint))) return populationBins({populationByClass:composition…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L136 `for (const [specialty, cohort] of Object.entries(parts)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L141 `.sort((a, b) => a.age - b.age).entries()) {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L150 `for (let i=startIndex;i<bins.length;i++) { bins[i].specialty = specialty; bins[i].order = bins[i].order * 3 + Object.keys…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L172 `const merged = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L176 `result[classId].eldersByAge = [...merged.entries()]` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L177 `.sort((a, b) => a[0] - b[0])` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L184 `return compositionBins(composition).reduce((sum, bin) => sum + bin.count, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L195 `children: Math.max(0, Math.floor(classState.children ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L196 `adults: Math.max(0, Math.floor(classState.adults ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L199 `count: Math.max(0, Math.floor(cohort.count ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L204 `const available = bins.reduce((sum, bin) => sum + bin.count, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L205 `const target = Math.min(available, Math.max(0, Math.floor(requestedCount)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L209 `const count = Math.min(bin.count, Math.floor(exact));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L210 `return { ...bin, count, remainder: exact - count, capacity: bin.count };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L212 `let remaining = target - allocations.reduce((sum, bin) => sum + bin.count, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L213 `for (const bin of [...allocations].sort((a, b) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.

### src/model/detailed-settlements/neutral-market.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 34, 35, 53, 55, 75, 83, 92.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 41, 42, 49, 50, 51, 52.
- **CP** L44 `const ids = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **JS / CP** L68 `let stocks=JSON.parse(JSON.stringify(NEUTRAL_MARKETS[p.market]));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L72 `practices:[...p.practices],stocks:stocks.map(s=>({...s,stock:Math.floor(s.capacity/2)}))};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **JS / CP** L77 `if(!site.neutral)site.neutral=JSON.parse(JSON.stringify(site.town.market));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L99 `slot.stock+=amount;goods.stock-=amount;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/phases.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 44, 52, 53, 54, 68, 69, 74, 82, 87, 103.
- **CP / JS** L63 `state.civilization.research = { total: Math.max(0, getGameSetting(state, "startingResearch") || 0) };` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.

### src/model/detailed-settlements/phases/birth.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 22, 39, 67, 91.
- **CP / JS** L19 `const lastAgedYear = Math.max(1, Math.floor(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L22 `const ageAdvance = Math.max(0, Math.floor(state.year ?? 1) - lastAgedYear);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L32 `for(const [specialty,snapshot] of Object.entries(parts)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L39 `const faithLabel = String(classState.faith.tier ?? "gold")` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L40 `.replace(/^./, (letter) => letter.toUpperCase());` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L47 `const nextElders = snapshot.eldersByAge.map((cohort) => ({ ...cohort }));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L60 `for(const moved of [...mature,...elderly]) {const b=own.find(b=>b.allegiance===moved.allegiance&&b.kind===moved.kind&&b.a…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L66 `writePopulationBins(settlement,[...other,...own,...newborns,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L67 `...mature.map(b=>({...b,kind:'adults',age:null})),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L68 `...elderly.map(b=>({...b,kind:'elder',age:getGameSetting(state,'newElderAge')}))]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L72 `snapshot.eldersByAge = nextElders.sort((a, b) => a.age - b.age);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L73 `totals.births += births; totals.matured += matured; totals.newElders += newElders;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L85 `Object.assign(result.byClass[classId], totals);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L91 `Math.floor(state.year ?? 1)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/phases/chaos.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 30, 42, 50, 55, 82, 103, 107, 109.
- **CP / JS** L18 `Math.floor(getGameSetting(state, "primordialGrowthCadenceYears"))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L20 `const elapsedYears = Math.max(0, Math.floor(state?.year ?? 1) - 1);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L21 `const growthSteps = Math.floor(elapsedYears / growthCadenceYears);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L22 `return roundChaos(basePressure * (growthFactor ** growthSteps));` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L36 `const faithResistance = Object.entries(faithPopulation).reduce((sum, [tier, population]) => {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L107 `pending[key] += Math.max(0, Math.floor(losses?.[key] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/phases/death.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 91, 99, 104, 138.
- **CP / JS** L39 `return compositionFromBins(compositionBins(composition).map(bin=>({...bin,count:rollCount(state,bin.count,probability)})));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L52 `const hardshipDeathsByRegion = Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L64 `const classes=new Set(compositionBins(vulnerable).map(b=>b.classId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L91 `if(!hasPopulationLedger(settlement)) for(const part of Object.values(parts)) part.eldersByAge = (part.eldersByAge ?? []).…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L95 `return { ...cohort, count: cohort.count - deaths };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L119 `arrivalDeaths: migration.inbound.reduce((sum, move) => sum + move.arrivalDeaths, 0),` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L124 `const natural=Object.values(byClass).reduce((n,c)=>n+c.naturalDeaths,0);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L125 `const mitigation=Math.min(.75,structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='lossResistance'?m.amount:0)…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L136 `prematureDeaths += internalMovements.reduce((sum, movement) => sum + movement.arrivalDeaths, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L138 `for(const site of getDetailedSettlementSites(state,{playerOnly:true})){const d=turn.regions[site.regionId]?.death;if(d){p…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/phases/faith.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 22, 23, 31, 33, 53, 60, 62, 65, 87, 102.
- **CP / JS** L23 `faith.streak = Math.max(0, Math.floor(faith.streak ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L72 `const requested = Math.ceil(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/phases/food.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 53, 100, 111, 149.
- **CP / JS** L86 `return { ...result, targetStatus };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L130 `? Math.ceil(classTotal * (1 - ratio) - 0.00001)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/phases/housing.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 32, 62, 70.

### src/model/detailed-settlements/phases/migration.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 33, 35, 39, 41, 42, 46, 47, 72, 81, 82, 84, 85, 89, 91, 93, 110, 115, 117, 118, 121, 124, 125, 155, 162, 184, 186, 187, 388, 401, 521, 534.
- **CP** L45 `const byAge = new Map(target.eldersByAge.map((cohort) => [cohort.age, cohort.count]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L49 `target.eldersByAge = [...byAge.entries()]` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L50 `.sort((a, b) => a[0] - b[0])` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L73 `const next = { ...intent, requested, composition };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L88 `const removalsByAge = new Map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L109 `if(hasPopulationLedger(settlement)) {writePopulationBins(settlement,[...populationBins(settlement),...compositionBins(com…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L121 `const merged = new Map((stranger.eldersByAge ?? []).map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L127 `stranger.eldersByAge = [...merged.entries()]` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L128 `.sort((a, b) => a[0] - b[0])` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L134 `return Math.floor(getHousingCapacity(state, regionId));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L174 `return candidates.sort((a, b) => {` Occupancy ascending, food and headroom descending, then authored region. Total on distinct region IDs.
- **CP** L184 `const order = new Map((state?.world?.regions ?? []).map((region, index) => [region.id, index]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L187 `.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER)` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L188 `|| String(a).localeCompare(String(b)));` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L192 `const projectedPopulation = Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L207 `intent.remaining > 0 && intent.candidateIndex < intent.candidates.length)) {` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L208 `const proposalsByDestination = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L210 `if (intent.remaining <= 0 || intent.candidateIndex >= intent.candidates.length) continue;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L217 `for (const [destinationId, proposals] of [...proposalsByDestination.entries()]` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L218 `.sort((a, b) => compareAuthoredRegionIds(state, a[0], b[0]))) {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L221 `const requested = proposals.reduce((sum, intent) => sum + intent.remaining, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L227 `count: Math.min(intent.remaining, Math.floor(exact)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L228 `remainder: exact - Math.floor(exact),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L231 `let remainder = grantedTotal - shares.reduce((sum, share) => sum + share.count, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L232 `for (const share of [...shares].sort((a, b) =>` Largest remainder, source order, then class order. Equal proposals preserve original intent order.
- **CP / JS** L240 `remainder -= 1;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L262 `const byDestination = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L269 `for (const destinationMovements of byDestination.values()) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L286 `const paidDemand = bins.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L298 `bin.survivorCount = Math.floor(exact);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L300 `usedFood += bin.survivorCount * bin.mealCost;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L305 `const rankedBins = [...bins].sort((a, b) =>` Largest remainder, movement index, then bin order. Unique ordinals break ties.
- **CP / JS** L316 `usedFood += bin.mealCost;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L320 `consumeStock(state, destination, "Edible", Math.ceil(usedFood - 1e-9));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L324 `.map((bin) => ({ ...bin, count: bin.survivorCount }));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L356 `const available=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L364 `return {...intent,composition,requested:compositionTotal(composition)};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L370 `const emitterIds = new Set(requestedIntents.map((intent) => intent.sourceId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L447 `movement.transferId = 'migration:${Math.max(0, Math.floor(tSec))}:${movement.reason}:${index}';` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L450 `movement.transferId = 'migration:${Math.max(0, Math.floor(tSec))}:external:${movement.reason}:${index}';` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L456 `movements: [...movements, ...externalMovements],` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L457 `externalEmigrants: externalMovements.reduce((sum, movement) => sum + movement.amount, 0),` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L471 `.reduce((sum, movement) => sum + movement.amount, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L514 `...populationBins(source),...compositionBins(movement.composition),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L520 `const refunds=cancelled.map(move=>({...move,remaining:move.amount}));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L529 `return returned?{...intent,admitted:Math.max(0,intent.admitted-returned),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L536 `result.migration={...result.migration,...summary};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/phases/moon-turn.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 35, 44, 45.
- **CP / JS** L16 `regions: Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/phases/shared.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 10, 13, 22, 23, 26, 32.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 24, 27.
- **CP / JS** L23 `const additions = (modifiers?.additive ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L26 `const multiplier = (modifiers?.multipliers ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L45 `if (state.rngNextFloat() < probability) successes += 1;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/political-recipes.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 14, 16, 22, 23, 25, 37, 40, 45, 47, 54, 55, 56, 59.
- **CP / JS** L9 `const count = bins => bins.reduce((n,b)=>n+b.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L23 `if(def.requireBaseHeadroom){const base=def.effects.filter(e=>e.op==='generateStock').reduce((n,e)=>n+(e.amount??0),0);if(…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L29 `const candidates=remote?neighbours:[site.regionId,...(supports.some(s=>s.reach==='connectedAdjacent')?neighbours:[])];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L30 `if(slot.targetRegionId)candidates.sort((a,b)=>Number(b===slot.targetRegionId)-Number(a===slot.targetRegionId));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L42 `const filter={...effect.filter,...support.filter};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L43 `const remaining=populationBins(target).map(b=>({...b,count:b.count-selected.filter(s=>s.allegiance===b.allegiance&&s.clas…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L46 `for(const b of extra){const n=Math.min(left,b.count);if(n){selected.push({...b,count:n});left-=n;}}` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L59 `for(const conversion of plan.conversions??[]){const amount=transformPeople(getDetailedSettlement(state,conversion.targetI…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/population-ledger.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 18, 20, 23, 29, 33, 39, 45, 54.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 62.
- **CP / JS** L7 `const available = bins.reduce((n,b)=>n+b.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L8 `const target = Math.min(available, Math.max(0, Math.floor(requested)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L10 `const result = bins.map(b=>{const exact=target*b.count/available;return {...b,count:Math.floor(exact),remainder:exact%1};});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L11 `let left=target-result.reduce((n,b)=>n+b.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L12 `for(const b of [...result].sort((a,b)=>b.remainder-a.remainder||compare(key(a),key(b)))) {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L15 `return result.filter(b=>b.count).map(({remainder,...b})=>b);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L18 `return Object.entries(settlement?.populationByClass??{}).flatMap(([classId,c])=>(c.joint??[]).map(b=>({...b,classId})));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L20 `export const hasPopulationLedger = settlement => Object.values(settlement?.populationByClass??{}).some(c=>Array.isArray(c…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L22 `const merged=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L24 `for(const [classId,c] of Object.entries(settlement.populationByClass)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L25 `c.joint=[...merged.values()].filter(b=>b.classId===classId).sort((a,b)=>compare(key(a),key(b))).map(({classId,order,...b}…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L27 `c.specialists=Object.fromEntries(['scholar','warrior'].map(id=>[id,{children:0,adults:0,eldersByAge:[]}]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L30 `c.eldersByAge.sort((a,b)=>a.age-b.age);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L45 `for(const b of selected){const source=bins.find(s=>key(s)===key(b));const count=Math.min(source?.count??0,b.count);if(cou…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L50 `writePopulationBins(settlement,[...populationBins(settlement),...actual.map(b=>({...b,...changes}))]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L51 `return actual.reduce((n,b)=>n+b.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L60 `const bins=populationBins(settlement),seen=new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **JS / CP** L65 `const derived={populationByClass:JSON.parse(JSON.stringify(settlement.populationByClass))};` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L67 `for(const [id,c] of Object.entries(settlement.populationByClass)){` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L69 `if(c.children!==d.children||c.adults!==d.adults||JSON.stringify(c.eldersByAge)!==JSON.stringify(d.eldersByAge)||JSON.stri…` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/detailed-settlements/practice-events.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 12, 13, 14, 15, 16, 18, 19, 26, 27, 31, 32, 46, 47, 57, 58.
- **CP / JS** L18 `const entry = { ...(state.rulesetId?{faction,controller,instanceId:slot?.instanceId??null}:{}),...event, id, rootId: jour…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L26 `return (action?.effects ?? []).reduce((sum, effect) =>` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L31 `return (action?.effects ?? []).reduce((sum, effect) =>` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L39 `emitPracticeEvent(state, { ...context, kind: 'chaosIncreased', amount: cost });` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L44 `const record = { tSec: state.tSec, ...entry };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/practice-multipliers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 8, 9, 10, 11, 12, 13, 14.

### src/model/detailed-settlements/practices.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 25, 29, 40, 41, 43, 46, 49, 58, 61, 62, 63, 64, 68, 75, 78, 79, 84, 85, 86, 87, 88, 93, 102, 103, 116, 122, 127, 133, 134, 135, 138, 140, 141, 142, 143.
- **CP / JS** Missing continued. Lines 144, 145, 149, 152, 154, 156, 164, 168, 169, 173, 174, 182, 198, 202, 205, 211, 214, 215, 221, 224, 226, 228, 230, 231, 235, 250, 254, 265, 266, 276, 277, 278, 279, 286, 299.
- **CP / JS** Missing continued. Lines 317, 321, 322, 324, 354, 355, 359, 360, 362, 377, 385, 392.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 27, 29.
- **CP / JS** L22 `for (const [op, binding] of Object.entries(MECHANIC_EFFECTS)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L25 `for (const op of Object.keys(practiceEffectResolvers)) if (MECHANIC_EFFECTS[op]?.status !== 'implemented') errors.push('$…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L26 `for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L32 `for (const cost of [...def.consume, ...def.require]) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L33 `if (!cost.traits.some(trait => Object.values(detailedSettlementPracticeDefs).some(provider => (['common', def.pool].inclu…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L41 `return [...new Set([...(getDetailedPracticeDef(state, practiceId)?.tags ?? []), ...(isScholarStaffed(assignment) ? ['Know…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L49 `return [...new Set([...assignDetailedSettlementWorkers(state, regionId).flatMap(a => getPracticeTags(state, a.practiceId,…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L58 `const signatures = new Set(stockProviderSlots(state, settlement, localOnly).filter(s => !s.market && (s.slot?.stock ?? 0)…` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L73 `const getMartialSupportForCondition = (state,id) => Math.floor(specialistCount(getDetailedSettlement(state,id),'warrior')…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L83 `if (effect.populationBand) amount+=Math.min(3+modifiers.reduce((n,m)=>n+(m.kind==='scalingCap'&&matchesPractice(state,slo…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L89 `if(effect.op==='convertPopulation')return Math.floor(amount*(def.mode==='charge'?1:1+assignment.effectiveWorkers*def.work…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L91 `amount+=modifiers.reduce((sum,m)=>sum+(m.kind==='output'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment)…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L95 `amount=Math.floor(amount*stockOutputBreakdown(state,settlement,slot,isScholarStaffed(assignment),modifiers).multiplier*(d…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L97 `amount+=modifiers.reduce((n,m)=>n+(m.kind==='effectBonus'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L104 `return Math.max(1,Math.floor(def.charge.threshold-structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='chargeT…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L109 `const base=def.charge.gain+structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='chargeGain'&&matchesPractice(s…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L112 `return Math.max(0,Math.floor(base*(1+assignment.effectiveWorkers*def.workerBonus)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L119 `if (!plan.ok) return {...plan,reason:'Missing ${plan.missing.kind}: ${plan.missing.amount} [${plan.missing.traits.join(' …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L121 `const spent=plan.providers.filter(p=>p.kind==='consume'&&p.regionId===site.regionId&&p.slotIndex===assignment.slotIndex).…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L124 `if (def.mode==='charge' && def.effects.every(e=>e.op==='train') && Object.values(settlement.populationByClass).every(c=>c…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L126 `if(!populationPlan.ok)return {...populationPlan,providers:[]};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L127 `if(populationPlan.extraConsume?.length||populationPlan.extraRequire?.length){plan=planStock(state,settlement,[...def.cons…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L129 `return external.ok?{...plan,external,populationPlan}:{ok:false,providers:[],reason:'No eligible external target'};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L142 `conversionTargets:plan.populationPlan?.conversions?.map(c=>({regionId:c.targetId,amount:c.selected.reduce((n,b)=>n+b.coun…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L171 `if (def.cadenceMoons && Math.floor(state.tSec / (getGameSetting(state, 'phaseDurationSec') * 6)) % def.cadenceMoons) cont…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L174 `if (def.activation.conditions?.[activationType] && !conditionsMet(state,site,{...def,condition:def.activation.conditions[…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L210 `if(!state.rulesetId||getRegionState(state,site.regionId).controller==='player') state.civilization.research.total+=amount;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L221 `const bank=owner.candidateDevelopment??={scholar:0,warrior:0}; bank[effect.classId]+=Math.floor(amount);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L244 `traits:[...new Set(consumed.flatMap(p=>stockTraits(state,stockProviderSlot(state,settlement,p))))],tags:getPracticeTags(s…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L301 `const roots = new Map(), deferred = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L304 `if (!roots.has(rootId)) roots.set(rootId, { discharged: new Set(), resolutions: 0, events: 0, stopped: false });` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L314 `for (const [key, candidate] of deferred) if (candidate.event.rootId === event.rootId) deferred.delete(key);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L381 `const [key, candidate] = deferred.entries().next().value;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/detailed-settlements/queries.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 21, 22, 23, 27, 31, 32, 35, 43, 44, 53, 54, 59, 62, 63, 81, 83, 84, 100, 108, 114, 120, 142, 149, 157, 171, 172, 173, 191, 203.
- **CP / JS** L61 `: neutral.stocks.reduce((sum, stock) => sum + (stock.traits.includes('Edible') ? stock.capacity : 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L62 `if (capacityKind === "housing") return (settlement?.structureSlots ?? []).reduce((n,s) => n + Math.floor((s?.construction…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L63 `return (settlement?.practiceSlots ?? []).reduce((n,s) => n + (stockTraits(state,s).includes("Edible") ? stockCapacity(sta…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L83 `children: Math.max(0, Math.floor(cohort.children ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L84 `adults: Math.max(0, Math.floor(cohort.adults ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L99 `mealDemand: Math.ceil((children + adults + elders) / CIV_CONTENT_TUNING.populationPerEdible),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L100 `mealOverhead: state.rulesetId ? (settlement?.structureSlots??[]).filter(s=>s&&!s.construction).reduce((n,s)=>n+(getDetail…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L111 `const starvationMigrants = POPULATION_CLASS_ORDER.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L114 `Math.floor(lastMeal?.byClass?.[classId]?.migrants ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L139 `return Math.max(0, Math.min(3, Math.floor(getGameSetting(state, "greenForcedTier"))));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L141 `const cadence = Math.max(1, Math.floor(getGameSetting(state, "greenCadenceYears")));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L142 `return Math.max(0, Math.min(3, Math.floor(Math.max(1, state?.year ?? 1) / cadence)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L148 `const cadenceYears = Math.max(1, Math.floor(getGameSetting(state, "greenCadenceYears")));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L149 `const year = Math.max(1, Math.floor(state?.year ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L172 `for (let index = 0; index < Math.max(0, Math.floor(cohort.count ?? 0)); index += 1) {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L173 `ages.push(Math.max(45, Math.floor(cohort.age ?? 45)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L177 `ages.sort((a, b) => a - b);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L183 `const totalPrestige = ages.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L188 `const averagePrestige = count > 0 ? Math.floor(totalPrestige / count) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/scopes.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 22, 40, 48, 49, 55, 56, 83, 85, 86, 89, 99, 101, 107, 123, 153, 158, 162, 164, 166, 168, 169, 171, 188.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 26.
- **CP** L40 `return new Map((getWorldDefinition(state)?.regions ?? []).map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L47 `return [...new Set(regionIds)].sort((left, right) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L50 `|| (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0)` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L85 `const requiredValue = (scope.requiredDefinitionPath ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L111 `const visited = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L121 `candidateIds.push(...visited);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L125 `const visited = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L138 `candidateIds = [...visited];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L154 `const score = Math.max(0, Number(evaluator.score) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L168 `const colours = [...new Set(ids.map((id) => getRegionState(state, id)?.colour).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L176 `? orderRegionIds(state, [regionId, ...scopeRegionIds])` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/stock.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 12, 13, 14, 15, 16, 24, 28, 29, 30, 31, 32, 33, 35, 38, 43, 45, 47, 50, 57, 58, 61, 67, 72, 73, 74, 75, 79, 86, 91, 94, 95, 105, 110, 121, 122.
- **CP / JS** Missing continued. Lines 123, 125, 130, 131, 140, 141, 142, 159, 163, 168, 172, 176, 180, 186, 188, 191, 199, 202, 207, 239, 240, 241, 242, 250, 251, 253, 256, 263, 264, 265, 269, 270, 284, 297, 312.
- **CP / JS** Missing continued. Lines 313, 323, 334.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 21, 36.
- **CP / JS** L14 `export const stockTotal = (state, settlement, trait) => localStockSlots(state, settlement).reduce((sum, slot) => sum + (s…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L15 `export const specialistCount = (settlement, classId) => Object.values(settlement?.populationByClass ?? {}).reduce((sum, c…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L35 `if (mod.query?.scholarScale) amount *= Math.min(mod.query.cap ?? 3, Math.floor(specialistCount(settlement, 'scholar') / m…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L36 `return Number.isFinite(amount) ? {...mod,amount,sourceId:def.id,sourceLabel:def.label,sourceInstanceId:slot.placementId} …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L38 `}).filter((mod,index,all) => !mod.query?.unique || all.findIndex(m => m.kind === mod.kind && JSON.stringify(m.query) === …` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L58 `const tags = [...(def?.tags ?? []), ...(staffed ? ['Knowledge'] : [])];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L64 `&& (!query.requiresOrConsumesAny || query.requiresOrConsumesAny.some(t => [...def.require,...def.consume].some(c => c.tra…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L65 `&& (!query.minimumRequirements || [...def.require,...def.consume].length >= query.minimumRequirements)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L80 `if (base > 0) sources.push(...practiceMultiplierSources(state,settlement,def,'capacity'),...keywordCapacitySources(state,…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L81 `const multiplier = 1 + sources.reduce((sum, source) => sum + source.amount, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L82 `return { base, quality, scholar, multiplier, sources, total: base > 0 ? Math.floor((base + quality + scholar) * multiplie…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L87 `...(mod.sourceInstanceId?{instanceId:mod.sourceInstanceId}:{}),...(mod.regionIds?{regionIds:[...mod.regionIds]}:{})};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L96 `sources.push(...practiceMultiplierSources(state,settlement,def,'outputMultiplier'),...keywordSources(state,regionId,def));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L97 `return {multiplier:1+sources.reduce((sum,source)=>sum+source.amount,0),sources};` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L106 `slot.stock = Math.max(before,Math.min(stockCapacity(state, settlement, slot, staffed), before + Math.max(0, Math.floor(am…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L112 `tags:[...new Set([...def.tags,...(staffed?['Knowledge']:[])])],pool:def.pool,scholarStaffed:staffed});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L135 `return [...sources, ...markets].flatMap(source => localStockSlots(state, source.settlement).map((slot, slotIndex) =>` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L189 `const sources = stockProviderSlots(state, settlement, localOnly, {...context,beneficiary});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L203 `if (kind === 'consume' && consumer) needed = Math.max(needed>0?1:0, Math.ceil(needed - modifiers.reduce((n,m) => n + (m.k…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L226 `const currency = sources.reduce((sum, source, index) => sum + (source.local && stockTraits(state, source.slot).includes('…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L227 `const amount = Math.min(needed, remaining[i], Math.floor(currency / slots[i].price));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L241 `context:{...context,beneficiary},consumerId:consumer?.instanceId,allegiance:consumer?.allegiance,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L243 `return { ok: true, providers, ...(authority?{authority}:{}) };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L255 `const debit=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L257 `if([...debit].some(([slot,amount])=>slot.stock<amount))return false;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L260 `stockProviderSlot(state, settlement, p).stock -= p.amount;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L268 `for (const [targetRegionId, amount] of Object.entries(purchases)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L286 `source.slot.stock -= taken;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L294 `const taken = Math.min(remaining, source.slot.stock, Math.floor(stockTotal(state, settlement, 'Currency') / source.slot.p…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L299 `source.slot.stock -= taken;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L321 `let remaining = Math.max(0, Math.floor(amount));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L322 `for (const cohort of Object.values(settlement.populationByClass)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L334 `return stockProviderSlots(state,settlement,false,{beneficiary:'player',discretionary:true}).reduce((n,s)=>n+(stockTraits(…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/detailed-settlements/synthesis.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 18.

### src/model/detailed-settlements/territory.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 41, 44, 46, 51, 55, 58, 66, 68, 71, 72, 78, 82, 84, 86, 87, 89, 90, 92, 93, 94, 96, 102, 104, 111, 112, 114, 117, 125, 126, 127, 137, 138, 146, 149, 153.
- **CP / JS** Missing continued. Lines 154, 165, 170, 182.
- **CP / JS** L24 `return {unaffiliated,rivalCivilians,rivalWarriors,units,required:Math.ceil(units/scale)};` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L37 `return total>0?Math.max(1,Math.ceil(total*minimumHoldingShare(total,force,composition)-1e-9)):0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L49 `const warriors=eligible.reduce((n,b)=>n+b.count,0),adultWarriors=eligible.filter(b=>b.kind==='adults').reduce((n,b)=>n+b.…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L58 `for(const b of Object.values(settlement?.politicalForce??{}))if(b.allegiance===faction&&b.untilSec>state.tSec){if(b.defen…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L60 `const upkeep=modifiers.reduce((n,m)=>n+(m.kind==='garrisonUpkeep'?m.amount:0),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L75 `const bonus=base.supplied?mods.reduce((n,m)=>n+(m.kind==='occupation'&&m.adjacent?m.amount:0),0):0;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L86 `const receivedForce=incoming.reduce((n,s)=>n+s.force,0),force=Math.max(0,base.force-(sent?.force??0))+receivedForce;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L89 `return {...base,availableWarriors,availableAdultWarriors,warriorForce,bonusForce:Math.max(0,force-warriorForce-receivedFo…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L102 `const support=allegianceSummary(settlement),total=Object.values(support).reduce((n,c)=>n+c,0),loyal=support[region?.contr…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L111 `return {holder:region?.controller,support,total,loyal,disloyal,share,required,resistance,...military,minimumLoyal,minimum…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L117 `const reserved=support.holder===faction&&!support.supported?(support.required===null?military.availableAdultWarriors:Math…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L168 `const claimant=Object.keys(s.support).sort().find(f=>f!=='neutral'&&f!==s.holder&&s.support[f]/s.total>=CONTROL_DEFAULTS.…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L184 `settlement.garrison={...settlement.garrison,supplied,paid:supplied?cost:0,required:cost,tSec:state.tSec};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/unrest.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 7, 8, 14, 15, 18.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 16, 17.
- **CP / JS** L9 `return {...episode, remainingYears: Math.max(0, episode.untilSec - state.tSec) / secondsPerYear(state),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/vassals.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 69, 72, 74, 75, 93, 94, 95, 96, 97, 100, 107, 109, 110, 112, 114, 115, 128, 131, 135, 138, 141, 147, 148, 151, 153, 157, 162, 163, 173, 174, 186, 193, 201, 217, 250.
- **CP / JS** Missing continued. Lines 251, 277, 285, 294, 297, 299, 309, 312, 313, 314, 320, 324, 328, 329, 333, 338, 348, 353, 354, 361, 365, 369, 388, 389, 393, 399, 403, 406, 439, 470, 472, 474, 475, 479, 482.
- **CP / JS** Missing continued. Lines 484, 522, 523, 524, 542, 558, 562, 563, 564, 566, 593, 598, 600, 601, 602, 615, 616, 620, 623, 631, 636, 640, 644, 646, 663, 669, 670, 672, 673, 674, 675, 681, 682, 686, 687.
- **CP / JS** Missing continued. Lines 691, 692, 704, 722.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 265, 330, 353, 412, 438, 476, 521, 522, 594, 597, 613.
- **CP** L75 `const existing = connectionKeys ?? new Set(connections.map((entry) =>` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L101 `slots.splice(0, slots.length, ...result.slots);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L128 `const slots = reserved.structureSlots ?? settlement.structureSlots.map(slot => slot ? { ...slot } : null);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L129 `for (const structureId of shuffleWithStateRng(state, Object.keys(settlementStructureDefs).filter(id => !FULL_MAP_SEED_CAR…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L138 `const globalSlots = reserved.globalStructureSlots ?? Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L141 `site.detailedState.structureSlots.map(slot => slot ? { ...slot } : null),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L146 `Object.keys(settlementStructureDefs).filter(id => !FULL_MAP_SEED_CARD_IDS.includes(id))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L162 `const connectionKeys = reserved.connectionKeys ?? new Set(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **JS / CP** L260 `return JSON.stringify(candidates);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L266 `? Math.max(0, Math.min(999, Math.floor(rerollIndex)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L297 `[targetRegionId]: settlement?.structureSlots.map(slot => slot ? { ...slot } : null) ?? [],` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L299 `connectionKeys: new Set((state?.world?.connections ?? []).map((entry) =>` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L313 `: settlement?.structureSlots.map(slot => slot ? { ...slot } : null);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L413 `? Math.max(0, Math.floor(rawSpec[key])) : fallback;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L417 `candidateId: 'debug-candidate-${lineage.nextVassalId}-${Math.max(1, Math.floor(candidateIndex) + 1)}',` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L438 `const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L455 `: { ...candidate, candidateIndex: index }` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L462 `expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _candidateIndex, ...candidate }) => candidate)),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L477 `? Math.max(0, Math.min(999, Math.floor(rerollIndex)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L487 `if (candidateIndex < 0 || candidateIndex >= candidates.length) {` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L523 `const selectedYear = Math.max(1, Math.floor(state.year ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L524 `const selectedSec = Math.max(0, Math.floor(state.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L527 `Math.floor(candidate.deathAge) - Math.floor(candidate.initialAge)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L566 `return state.rulesetId ? state.civilization.prestige : current ? Math.max(0, Math.floor(current.prestige ?? 0)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L595 `return Math.max(0, Math.floor(intervention.appliedSec));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L600 `const selectedYear = Math.max(1, Math.floor(vassal.selectedYear ?? state.year ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L601 `const initialAge = Math.max(0, Math.floor(vassal.initialAge ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L602 `const traitModifier = Math.floor(vassal.traitPrestigeModifier ?? 0);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L605 `Math.ceil(Math.floor(intervention.requiredPrestige) - initialAge - traitModifier)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L614 `? Math.max(0, Math.floor(vassal.deathSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L624 `const slotIndex = Math.floor(intervention.slotIndex);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L637 `const slotIndex = Math.floor(intervention.slotIndex);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L677 `? 'Replace ${replaced} with ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}'` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L678 `: 'Add ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}';` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L704 `Math.floor(vassal.lastFaithYear ?? vassal.selectedYear)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/detailed-settlements/view-model.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 37, 73, 74, 92, 94, 95, 96, 97, 98, 101, 102, 103, 127, 132, 134, 137, 139, 140, 148, 155, 157, 164, 170, 173, 177, 178, 179, 186, 187, 203, 205, 207, 209, 210, 214.
- **CP / JS** Missing continued. Lines 216, 218, 219.
- **CP / JS** L38 `const byClass = Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L69 `const assignedByClass = Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L84 `population.total += localPopulation.total;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L97 `target.total += source.total ?? 0;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L107 `storedFood += stockTotal(state, site.detailedState, "Edible");` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L108 `looseFood += 0;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L109 `storedFoodCapacity += getStoredFoodCapacity(state, regionId);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L119 `specialists: Object.fromEntries(['scholar','warrior'].map(c => [c, sites.reduce((n,s)=>n+specialistCount(s.detailedState,…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L132 `chaosPower: Math.max(0, Number(state?.civilization?.chaos?.chaosPower) || 0),` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L137 `monsterCount: Math.max(0, Math.floor(state?.civilization?.chaos?.monsterCount ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L153 `const availableWorkerCount = POPULATION_CLASS_ORDER.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L156 `return total + Math.floor(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L163 `const activeWorkerCount = workers.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L209 `structures: settlement.structureSlots.map((slot) => slot ? ({ ...slot, face: getGamepieceFace(state, "structure", slot.st…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/detailed-settlements/workers.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 9, 14, 15, 18, 19, 20, 30, 31, 35, 40, 43, 56.
- **CP / JS** L15 `const scholarRequired=defs.map(def=>Number(!!def?.scholarRequired));` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L17 `const scholarOrder=[...assignments].sort((a,b)=>scholarRequired[b.slotIndex]-scholarRequired[a.slotIndex]||a.slotIndex-b.…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L18 `for(const [classId,cohort] of Object.entries(settlement?.populationByClass??{})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L30 `for(const [classId,cohort] of Object.entries(settlement?.populationByClass??{})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L33 `let workers=Math.floor(Math.max(0,ageCohortTotal(cohort)-cohort.children-scholars)/Math.max(1,getGameSetting(state,'popul…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/full-map-crown.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 21, 22, 23, 24.
- **CP / JS** L18 `const {population,loyal,warriors,loyalChildren}=opening,children=Math.floor(population/4);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/full-map-food.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 16, 25, 48, 55, 56, 63, 71.
- **CP / JS** L9 `const d=site.detailedState,target=populationBins(d).reduce((n,b)=>n+b.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L12 `const count=cottage.housing>0?Math.ceil(target/cottage.housing):0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L17 `for(const slot of [...housing,...retained]) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L18 `if(origin+slot.width>d.structureSlots.length)break;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L19 `d.structureSlots[origin]={...slot,origin};origin+=slot.width;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L53 `const budgets=new Map(markets.map(s=>[s.regionId,Math.max(0,s.neutral.stocks.filter(x=>x.traits.includes('Edible')&&x.pri…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L71 `const installed=new Set(state.world.sites.flatMap(s=>s.neutral||s.simulationMode==='ruin'?(s.neutral??s.town.market).prac…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/full-map-world.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 46, 49, 66, 67, 68, 69, 72, 81, 83, 95, 102, 106, 109.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 14.
- **CP** L12 `const seen=new Set([start]),queue=[[start,0]];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L25 `.sort((a,b)=>mapDistance(state,players[0],b.id)-mapDistance(state,players[0],a.id));` Descending BFS distance. Two unreachable distances give NaN; JS treats as a stable tie, so use explicit unreachable ordering.
- **CP / JS** L27 `.filter(id=>!players.includes(id)).sort((a,b)=>mapDistance(state,players[0],b)-mapDistance(state,players[0],a)).slice(0,3…` Descending BFS distance. Two unreachable distances give NaN; use explicit stable ties.
- **CP** L31 `const capital=core.capital,provinces=new Set(core.provinces);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L35 `.sort((a,b)=>Math.min(...players.map(id=>mapDistance(state,id,a.id)))-Math.min(...players.map(id=>mapDistance(state,id,b.…` Ascending nearest-player BFS distance. Infinity minus Infinity yields NaN; use stable unreachable ties.
- **CP** L36 `const neutralIds=new Set(outskirts.slice(0,3).map(r=>r.id));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L50 `const type=types[Math.floor(state.rngNextFloat()*types.length)];` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L52 `site.town={type,activated:!neutral&&!monster,...(neutral?{}:{market})};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L63 `loyal=Math.floor(population*share);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L64 `const children=Math.floor(population/4),loyalChildren=Math.floor(children*share);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L87 `if(nextStructureCell+width>region.structureCapacity)return false;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L89 `settlement.structureSlots[origin]={structureId,placementId:'${region.id}:${role}',origin,width,...(qualityBonus?{qualityB…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L105 `for(const slot of settlement.practiceSlots)if(slot&&'stock'in slot)slot.stock=slot.practiceId==='cp_ironCommunion'?2:stoc…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L112 `for(const province of provinces)addWorldConnection(state,capital,province);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L118 `seedFullMapFood(state,new Set([capital,...provinces]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/game-config.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 197, 261, 276, 277, 278, 285, 287, 293, 309, 310, 314, 319, 324, 326, 329, 330, 332, 333, 362, 363, 364, 365, 385, 394, 412, 444, 446, 447, 449, 456, 457, 459, 463, 464, 465.
- **CP / JS** Missing continued. Lines 466, 467, 468, 469, 470, 513, 517, 518, 519, 524, 525, 526, 532, 539, 540, 545, 546, 551, 559, 560, 561, 592.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 205, 229, 236, 261, 298, 323, 324, 334, 447, 449, 457, 458, 464, 469, 470, 488, 495, 541.
- **JS / CP** L21 `const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L184 `Object.fromEntries(SETTING_FIELDS.map((entry) => [entry.id, entry]))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L190 `values: Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L200 `values: Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L205 `: (Number.isFinite(source[entry.id]) ? Number(source[entry.id]) : entry.defaultValue),` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L253 `return [...new Set(value.filter((tag) => typeof tag === "string")` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L275 `const activation={...clone(template),type:source.type};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L277 `if(source.also?.length)activation.also=[...new Set(source.also.filter(type=>scheduleTypes.includes(type)&&type!==source.t…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L278 `if(source.seasonKeys?.length)activation.seasonKeys=[...new Set(source.seasonKeys.filter(key=>seasonKeys.includes(key)))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L282 `if(path.at(-1)==='source'&&source)return {...copyEditableLeaves(template,source,path.slice(0,-1)),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L290 `return Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L291 `Object.entries(template).map(([key, entry]) => [` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L298 `return Number.isFinite(source) ? Number(source) : template;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L313 `for(const [id,def] of Object.entries(registry)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L318 `for(const [id,def] of Object.entries(practices)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L328 `if(source.stockMultipliers && !validateGamepieceMechanics({...def,stockMultipliers:source.stockMultipliers}).length) def.…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L330 `const seasonal=[def.activation.type,...(def.activation.also??[])].includes('season');` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L334 `else if(amounts&&typeof effect.amount==='number')effect.seasonAmounts=Object.fromEntries(Object.entries(amounts).filter((…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L354 `for (const [key, entry] of Object.entries(value)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L381 `for (const [id, definition] of Object.entries(entries)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L391 `path: [kind, id, ...path],` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L397 `value: getAtPath(safe, [kind, id, ...path]),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L406 `return String(value)` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L408 `.replace(/^./, (letter) => letter.toUpperCase());` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L412 `return path.reduce((current, key) => current?.[key], value);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L439 `for (const id of Object.keys(authored[kind])) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L442 `for(const [id,def] of Object.entries(value[kind])) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L453 `if (kind==='practices') for (const [id,def] of Object.entries(value.practices)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L469 `for(const effect of def.effects??[])if(effect.seasonAmounts&&Object.entries(effect.seasonAmounts).some(([key,amount])=>!s…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L470 `for (const cost of [...(def.consume??[]),...(def.require??[])]) if (!Number.isInteger(cost.amount)||cost.amount<0||!cost.…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L492 `const key = String(entry.path.at(-1));` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L541 `return Number.isFinite(value) ? Number(value) : fallback;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **JS / CP** L567 `value = JSON.parse(text);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **JS / CP** L592 `return JSON.stringify(canonical, null, 2);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/game-model.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 31.

### src/model/gamepiece-presentation.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 28, 30, 31, 32, 36, 58, 59, 60, 61, 73, 75, 76, 80, 81, 82, 83, 84, 85, 87, 88, 91, 92, 93, 94, 96, 97, 98, 99, 103, 105, 107, 108, 110, 113, 118.
- **CP / JS** Missing continued. Lines 119, 120, 121, 122, 123, 124, 132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 153, 154, 155.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 58.
- **CP / JS** L22 `const number = value => Math.round(value * 100) / 100;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L31 `if(event.traitsAny?.length)return event.traitsAny.map(trait=>({...common,trait}));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L32 `return [{...common,icon:binding?.icon??(event.scholarStaffed||event.tagsAny?.includes('Knowledge')?'knowledge':'stock')}];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L40 `return [...(def.housing?['${def.housing} Housing. Numeric bonuses from duplicate structures add.']:[]),...(def.pool !== '…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L43 `const seasonBoundaryOffsets = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L50 `while (clock < duration) { clock += 1 / 60; ticks++; }` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L51 `seasonBoundaryOffsets.set(duration, Math.ceil(ticks / 60) - duration);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L65 `const boundary = Math.max(1, Math.floor((time - offset) / duration) + 1);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L86 `let value = output.field ? def[output.field] * multiplier ** (output.field === 'capacityPerCountSquared' ? 2 : 1)` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L89 `return { ...GAMEPIECE_OUTPUTS[output.resource], resource: output.resource, value: number(value) };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L108 `? Object.fromEntries(def.activation.seasonKeys.map(season => [season, effect.amount ?? 0])) : null);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L109 `return seasons ? Object.entries(seasons).map(([season, value]) => ({ season, icon, value, label: '${season}: ${value} bas…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L128 `:reading.effects.slice(0,1).map(effect=>({...effect,text:effect.text+' + '+keyword.name+'.'}));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L132 `return { kind, definitionId: id, label: def.label, tier, tags: [...new Set([...(def.tags ?? []),...(workers?.tokens?.some…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L135 `politicalOutput:def.category==='influence'?(def.effects.some(e=>e.op==='convertPopulation')?(evaluation?(evaluation.conve…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L138 `chargeGain:def.mode==='charge'?(evaluation?.chargeGain??Math.floor(def.charge.gain*workerMultiplier)):null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L150 `detailLines: [...(evaluation?.conversionTargets??[]).map(t=>'Conversion target: ${getRegionReference(state,t.regionId)}; …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L152 `def.lane === 'charge' ? 'When its authored event occurs, gain ${evaluation?.chargeGain??Math.floor(def.charge.gain*worker…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L154 `...(def.mode==='charge'?['Charge: ${evaluation?.charge??slot?.charge??0} / ${threshold}.',describeMechanicTrigger(def.cha…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/init.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 13, 18, 19, 26, 29, 32, 43, 49, 61, 62, 63, 65, 69, 73, 77, 97, 98.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 25, 27, 30.
- **JS / CP** L14 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L25 `const tSec = Number.isFinite(state.tSec) ? Math.floor(state.tSec) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L28 `? Math.max(0, Math.floor(state.apCapOverride.cap))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L29 `: Math.max(0, Math.floor(state.actionPointCap ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L31 `? Math.floor(state.apCapOverride.points)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L32 `: Math.floor(state.actionPoints ?? 0);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L39 `const skillCapBonus = Math.floor(getGlobalSkillModifier(state, "apCapBonus", 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L43 `Math.max(0, Math.floor(state.actionPoints ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L98 `Object.keys(state).forEach((k) => delete state[k]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L99 `Object.assign(state, fresh);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/keywords-classes-prototype.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 16, 18, 24, 25, 27, 28, 33, 38, 43, 48, 53, 57, 64, 68, 69, 77, 78, 81, 87, 98.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 53.
- **CP / JS** L9 `const disciplines={...affinity,scholar:'synthesis'};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L13 `const title = id => id[0].toUpperCase() + id.slice(1);` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L18 `taught:[...new Set((value.taught??[]).filter(id=>Object.hasOwn(KEYWORD_PROTOTYPE_NAMES,id)))]};` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L53 `return Math.min(scale.cap??Infinity,Math.floor(score/(scale.per??1)))*(scale.amount??1);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L63 `if(multiplierMode)return {...def,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L69 `return {...def, condition:null, externalAction:null, pool:'common',` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L71 `effects:[...def.effects.map(effect=>({...effect,keywordScale:scale})),...(lens?[{...lens,amount:0,keywordScale:scale}]:[])],` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/life-map-balance.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 36, 38, 42, 43, 45, 56, 63, 65, 69, 71, 77, 85, 86, 94, 96, 100, 101, 102, 103, 104, 105.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 93, 105.
- **CP / JS** L4 `export const LIFEGRAPH_COST_CHOICES = Object.freeze(['free',...LIFEGRAPH_COST_TIERS]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L9 `spec('quest','Quest','fair','free','calculated'),{...spec('leave','Leave Campaign'),costKinds:['time','prestige','monster…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L12 `{...spec('delve','Scholar Delve',10),costKinds:['time'],description:'Scholar only. Spend time, then reopen the shop with …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L13 `{...spec('emptyConfirm','Leave without a purchase',5),costKinds:['time'],description:'Time spent when confirming an empty…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L32 `...Object.fromEntries(LIFEGRAPH_SHOP_NODE_IDS.map(id=>[id,[]])),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L33 `'signature:removePractice':[{...spec('remove','Remove an installed Practice','cheap','fair'),costKinds:['time','prestige'…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L36 `export const getLifeMapOptionSpecs=nodeId=>[...(LIFEGRAPH_OPTION_SPECS[nodeId]??[]),...(LIFEGRAPH_SHOP_NODE_IDS.includes(…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L58 `const yearPhases=(state,years)=>Math.max(years>0?1:0,Math.round(years*lifeMapPhasesPerYear(state)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L67 `const next={...option,balanceKey:key};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L72 `if(option.mode)next.risk=Math.round(risk*100);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L88 `return {...offer,basePrestigeCost:price.prestige,basePhaseCost:yearPhases(state,price.time),baseCurrencyCost:price.curren…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L94 `for(const kind of Object.keys(limit))for(const tier of LIFEGRAPH_COST_TIERS)if(!valid(kind,design.costBands?.[kind]?.[tie…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L95 `for(const [nodeId,specs]of Object.entries(LIFEGRAPH_OPTION_SPECS))for(const option of specs)for(const kind of Object.keys…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L100 `for(const [nodeId,options]of Object.entries(design.optionCosts??{}))for(const id of Object.keys(options??{}))if(!LIFEGRAP…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L102 `for(const [id,rule]of Object.entries(design.shopServices??{}))if(!LIFEGRAPH_SHOP_SERVICE_SPECS.some(s=>s.id===id)||!rule|…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/life-map-columns.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 4, 13, 38, 42, 45, 54, 57, 58, 59, 62, 75, 81.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 39, 42, 53.
- **CP / JS** L8 `const rules=design.columns.map(column=>({...column,kind:'milestone'}));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L9 `rules.splice(design.bookends.founding.priority,0,{...design.bookends.founding,id:'founding',label:'Founding',kind:'foundi…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L26 `const depths=new Set(),selected=[];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L35 `const errors = [], ids = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L77 `const depth = column.depth - 1, removed = new Set(nodes.filter(node => node.depth === depth).map(node => node.id));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L78 `const id=column.kind==='legacy'?'life-d${String(depth+1).padStart(2,'0')}-boss':column.kind==='founding'?foundingNodeId:'…` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L79 `const node = { id, depth, lane: Math.floor((config.laneCount - 1) / 2),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L94 `return { nodes: nodes.sort((a, b) => a.depth - b.depth || a.lane - b.lane), edges,bossNodeId,foundingNodeId:placedFoundin…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.

### src/model/life-map-design.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 26, 28, 55, 61, 70, 81, 85, 92, 98, 106, 110, 111, 114, 130, 142, 152, 159, 192.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 52, 55, 72, 73, 80, 82, 88.
- **CP / JS** L11 `...Object.keys(VASSAL_SIGNATURE_NODE_VARIANTS).map(id => 'signature:${id}')]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L12 `const clone = value => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L23 `return {...fallback,...clone(value)};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L45 `const ids=new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L68 `if(!Array.isArray(rule.timings)||!rule.timings.length||rule.timings.some(t=>!LIFEGRAPH_TIMINGS.includes(t))||new Set(rule…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L76 `const ruleIds=new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L86 `const reserved=new Set(resolveLifeMapColumns({design},{classId}).map(c=>c.depth));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L99 `let roll=rng.nextFloat()*entries.reduce((sum,item)=>sum+weight(item),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L107 `const design=config.design, byId=new Map(nodes.map(n=>[n.id,n]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L120 `const runs=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L123 `const key='${n.id}:${poolId}';if(!runs.has(key))runs.set(key,1+Math.max(0,...parents(n.id).map(p=>poolRun(p,poolId))));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L151 `const scores=new Map(),paths=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L152 `for(const n of nodes){const ps=parents(n.id);const p=ps.sort((a,b)=>(scores.get(a.id)??0)-(scores.get(b.id)??0))[0];score…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L154 `const terminal=terminals.sort((a,b)=>scores.get(a.id)-scores.get(b.id))[0];` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L160 `.sort((a,b)=>(a.maxDepth-a.minDepth)-(b.maxDepth-b.minDepth));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L173 `const chosen=[...new Set(nodes.filter(n=>n.family==='stockShop'&&n.depth>=supply.minDepth-1&&n.depth<=supply.maxDepth-1).…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L175 `const existing=new Set(chosen),pool=[...new Set(available)].filter(output=>!existing.has(output)).sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L177 `const unmet=[...new Set(unmetStockOutputs)].filter(output=>available.includes(output)&&!chosen.includes(output)).sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/life-map-lab-draft.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 24, 25, 50, 53, 67.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 24, 37.
- **CP / JS** L24 `previewSeed: Number.isFinite(value?.previewSeed) ? Math.floor(value.previewSeed) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **JS / CP** L48 `const value = JSON.parse(text);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **JS / CP** L67 `return JSON.stringify(canonicalizeLifeMapLabDraft(value), null, 2);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/live-second-stage-scheduler.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 4, 23.

### src/model/map-lab-draft.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 27, 30, 34, 36, 38, 39, 40, 46, 48, 51, 65, 68, 84, 93, 94, 95, 103, 106, 115, 116, 130, 131, 132, 133, 134, 176, 177, 179, 180, 183, 184, 185, 218, 221, 222.
- **CP / JS** Missing continued. Lines 223, 224, 227, 230, 233, 236, 237, 241, 242, 244, 254, 268, 284, 296, 311, 316, 318, 327, 330, 335, 345, 365, 369, 372, 373, 374, 386, 404, 406, 439.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 52, 122, 176, 179, 180, 184, 185, 224, 269, 308, 325.
- **JS / CP** L24 `const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L36 `slot && slot.tier == null ? { ...slot, tier: "bronze" } : slot);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L48 `const regionById = new Map((draft.regions ?? []).map((entry) => [entry?.id, entry]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L75 `const siteByRegion = new Map(definition.sites.map((site) => [site.regionId, site]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L121 `return Object.values(settlementStructureDefs).reduce((sum, def) => {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L130 `for (const classState of Object.values(detailedState?.populationByClass ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L131 `total += Math.max(0, Math.floor(classState?.children ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L132 `total += Math.max(0, Math.floor(classState?.adults ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L133 `total += (classState?.eldersByAge ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L134 `(sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)), 0` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L150 `const practiceIds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L177 `for (const [classId, classState] of Object.entries(state.populationByClass ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L215 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L239 `const keys = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L266 `? Number(patch.structureCapacity)` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L268 `const occupiedEnd = Math.max(0, ...(region.detailedState?.structureSlots ?? []).filter(Boolean).map(p => p.origin + p.wid…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L361 `return { ...result, connected };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L371 `const neighbours = new Map(definition.regions.map((entry) => [entry.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L376 `const remaining = new Set(definition.regions.map((entry) => entry.id));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L386 `for (const neighbour of neighbours.get(id) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **JS / CP** L426 `value = JSON.parse(text);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **JS / CP** L439 `return JSON.stringify(canonicalizeMapLabDraft(draft), null, 2);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/mechanic-readings.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 11, 12, 15, 19, 26, 34, 40, 41, 47, 50, 58.
- **CP / JS** L2 `const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L60 `const season = mod.seasonKeys ? ' during ${mod.seasonKeys.map(s => s[0].toUpperCase()+s.slice(1)).join(' or ')}' : '';` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.

### src/model/mechanic-validation.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 26, 27, 29, 36, 39, 42, 44, 47, 50, 51, 52, 53, 57, 58, 59.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 18, 32, 53.
- **CP / JS** L19 `|| Object.keys(mod).some(key=>!binding.fields.includes(key))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L34 `if (binding.fields && Object.keys(effect).some(key => !binding.fields.includes(key))) errors.push('${effect.op}: unsuppor…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L38 `if (Object.keys(trigger).some(key => !['any', 'anotherPractice'].includes(key))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L49 `if (Object.keys(clause).some(key => !['kind', 'scope', ...allowed].includes(key))) errors.push('${clause.kind}: unsupport…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/moon-phases.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 9, 10, 13, 17, 18, 37, 40.
- **CP / JS** L10 `return Math.max(1, Math.floor(getGameSetting(state, "phaseDurationSec") ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L18 `const sec = Math.max(0, Math.floor(tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L23 `: Math.floor(elapsed / phaseDurationSec) % MOON_PHASE_COUNT;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L26 `: Math.floor(elapsed / getMoonCycleDurationSec(state));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L37 `const safeFrom = Math.max(0, Math.floor(fromSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L40 `Math.floor(phaseIndex ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L46 `return firstBoundary + Math.ceil((safeFrom - firstBoundary) / cycleSec) * cycleSec;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/moon.js

- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 13.
- **CP / JS** L12 `const n = Math.floor(v);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L28 `Math.floor(cycleSec / 2)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L50 `return Math.round(minCap + phase * (maxCap - minCap));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/new-game.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20.
- **CP / JS** L23 `mapLab={...mapLab,worldDefinitionId:id,connections:next.connections,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L24 `regions:mapLab.regions.map(r=>({...r,colour:r.colour===previous.regions.find(p=>p.id===r.id).initialState.colour` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L42 `if (profile.launch.startMode === "randomRoad" && String(mapLab.worldDefinitionId).startsWith("regional-")) {seedFullMapWo…` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.

### src/model/persistent-memory.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 39, 56, 62, 90, 97, 118, 123, 138, 139, 176, 187, 192, 234, 235.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 39.
- **CP** L12 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L22 `out.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L29 `for (const [poolId, kinds] of Object.entries(root)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L39 `return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L62 `if (prev != null && prev.localeCompare(value) >= 0) return false;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L70 `for (const [poolId, kinds] of Object.entries(raw)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L80 `const keys = Object.keys(raw);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L158 `current.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L209 `for (const [poolId, sourceKinds] of Object.entries(sourceMap)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/practice-draft.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 9, 10, 16, 17, 18, 19, 27, 33, 40, 43, 45.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 43.
- **CP** L6 `const incoming = [], consumed = new Set(), removed = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L16 `const slot={...createDetailedPracticeSlot(action.practiceId,action.resultingTier),...existing,tier:action.resultingTier??…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L28 `let pool = [...incoming, ...survivors];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L30 `const remaining = new Map(pool.filter(Boolean).map(slot => [slot.practiceId, slot]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L38 `pool = [...remaining.values(), ...ordered];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/practice-keywords.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 8, 10, 11, 12, 19, 22, 26, 27, 29, 33, 41, 43, 50, 51, 55, 65, 66, 67, 71, 74, 77, 78.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 43, 55.
- **CP** L27 `const eligible = new Set((state.world?.sites ?? [])` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L31 `const seen = new Set([regionId]), queue = [regionId];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L43 `return Math.min(scale.cap ?? Infinity, Math.floor(keywordScore(state, regionId, scale.keyword, practiceId) / scale.per)) …` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L55 `return Array.from({ length: Math.min(scale.cap ?? Infinity, Math.floor(contributors.length / scale.per)) }, (_, index) => {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/practice-outputs.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 12, 13, 15, 17, 20, 40.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 18, 23, 28, 51.
- **CP / JS** L7 `export const PRACTICE_OUTPUTS = Object.freeze(Object.fromEntries(Object.entries(MECHANIC_EFFECTS).filter(([, effect]) => …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L18 `&& Object.entries(value).every(([key,amount])=>SEASONS.includes(key)&&Number.isFinite(amount)));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L22 `if (Object.keys(effect).some(key=>!['op',...AMOUNT_KEYS,...(spec.param?[spec.param]:[])].includes(key))) return false;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L31 `const keys = value => Object.keys(value).filter(key=>key!=='seasonAmounts').sort();` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Default UTF-16 lexical total preorder. Preserve stable ties.
- **JS / CP** L32 `return JSON.stringify(keys(a)) === JSON.stringify(keys(b)) && keys(a).every(key=>sameShape(a[key],b[key])) && validSeason…` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP** L42 `return outputs.every(validPracticeOutput) && new Set(outputs.map(practiceOutputKey)).size === outputs.length;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L51 `&& Object.keys(input).every(key=>['amount','traits'].includes(key)) && Number.isInteger(input.amount) && input.amount >= 0` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L52 `&& Array.isArray(input.traits) && input.traits.length > 0 && new Set(input.traits).size === input.traits.length` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/practice-reading.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 11, 13, 15, 16, 19, 26, 27, 28, 30, 31, 34, 39, 40, 52, 53, 62, 63.
- **CP / JS** L5 `const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L15 `:[activation.type,...(activation.also??[])].flatMap(type=>type==='season'` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L18 `return times.map(({type,season,timing})=>({timing,amount:effects.reduce((sum,effect)=>sum+` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L27 `const times = charge ? [''] : [activation.type, ...(activation.also ?? [])].flatMap(type =>` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L31 `timing, text: describeMechanicEffect(effect, effect.seasonAmounts?.[timing.toLowerCase()] ?? effect.amount ?? 0)` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.

### src/model/regional-map/biome-clustering.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 39, 51, 52, 53, 70.
- **CP** L3 `const cache=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L8 `const count=neighbours.length,all=(1<<count)-1,order=sizes.map((size,label)=>({size,label})).sort((a,b)=>b.size-a.size);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP** L9 `const failed=new Set(),assignment=Array(count).fill(-1);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L22 `const remaining=order.slice(depth),parts=componentSizes(available),possible=new Set([0]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L23 `for(const {size} of remaining)for(const n of [...possible])possible.add(n+size);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L25 `let layer=new Set();for(let mask=available;mask;mask&=mask-1)layer.add(mask&-mask);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L27 `const next=new Set();for(const group of layer){let fringe=0;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L33 `for(const group of layer)if(search(available^group,depth+1)){` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L45 `const names=Object.keys(quota),byId=new Map(regions.map((r,i)=>[r.id,i]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L48 `for(const [a,b] of shared){neighbours[a]|=1<<b;neighbours[b]|=1<<a;}` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **JS / CP** L55 `const key=JSON.stringify([seed,neighbours,quota,affinity]);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L59 `for(let i=0;i<assignment.length;i++){masks[assignment[i]]|=1<<i;fit+=affinity[i][assignment[i]];}` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L69 `const rng={rng:{seed:seed^0x62a81f}};attachRngHelpers(rng);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP** L70 `const pool=new Map();let minimum=null,maximum=null;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L72 `const candidate={assignment:assignment.slice(),...result},old=pool.get(result.matching);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L89 `const temperature=(mode==='spread'?2.3:3.5)*Math.pow(1-step/steps,2)+.025;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L91 `if(delta>=0||rng.rngNextFloat()<Math.exp(delta/temperature))current=result;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP** L100 `if(cache.size>12)cache.delete(cache.keys().next().value);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L103 `const target=Math.round(solutions.minimum.matching+(solutions.maximum.matching-solutions.minimum.matching)*amount);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L105 `[...solutions.pool.values()].filter(s=>s.matching>=solutions.minimum.matching&&s.matching<=solutions.maximum.matching)` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L106 `.sort((a,b)=>Math.abs(a.matching-target)-Math.abs(b.matching-target)||a.matching-b.matching||a.groups-b.groups)[0];` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.

### src/model/regional-map/boot-profile.js

- **JS / CP** L11 `region.detailedState=JSON.parse(JSON.stringify(template));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/regional-map/definition.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 17, 18, 19, 22, 25, 48.
- **CP** L4 `const cache=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L15 `export const regionalMapId=(seed,revision=CURRENT_GENERATOR_REVISION)=>'regional-v${revision}:${Number(seed)>>>0}';` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L18 `const revision=match?Number(match[1]):null;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L19 `return match&&Object.hasOwn(GENERATORS,revision)&&Number(match[2])<=4294967295?{revision,seed:Number(match[2])}:null;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L29 `if(cache.size>12)cache.delete(cache.keys().next().value);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L34 `const vertices=new Map(),key=p=>'${Math.round(p.x*1e9)},${Math.round(p.y*1e9)}';` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L37 `const connections=map.edges.filter(e=>e.regions.length===2&&map.regions.find(r=>r.id===[...e.regions].sort()[0]).neighbou…` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L38 `.map((e,i)=>({e,rank:decorationRandom(map.seed,i+741)})).sort((a,b)=>a.rank-b.rank)` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L40 `const starters=new Set(Object.values(connections[0]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L48 `id:r.id,name:names[i]??'${biome[0].toUpperCase()+biome.slice(1)} ${i+1}',biome,` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L50 `display:{labelPoint:{...r.centre},sitePoint:{...r.centre}},` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L54 `return {id,name:'Regional world · ${map.seed}',geometry:{vertices:[...vertices.values()]},regions,connections,sites:[],` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/regional-map/generator.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 165, 179, 214, 263, 325, 465, 559, 625.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 165, 179, 367, 510, 563, 705.
- **CP / JS** L17 `const distance = (a, b) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L18 `const key = p => '${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}';` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L19 `const edgeKey = (a, b) => [a, b].sort().join('|');` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L24 `const state = { rng: { seed: seed ^ 0x537a91 } }; attachRngHelpers(state);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP** L34 `const next = new Map(edges.filter(e => e.regions.length === 1).map(edge => {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L38 `const perimeter = [], start = next.keys().next().value;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L49 `perimeter.reduce((best, entry, i) => entry.point.x * ASPECT * dx + entry.point.y * dy` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L51 `const ordered = [...perimeter.slice(corners[0]), ...perimeter.slice(0, corners[0])];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L82 `return Math.abs(polygon.reduce((sum, p, i) => {` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L115 `const outer = new Set(edges.filter(e => e.regions.length === 1).flatMap(e => [e.a, e.b]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L116 `const seaVertices = new Set(edges.filter(e => e.regions.length === 1 && oceanSides.includes(e.worldSide)).flatMap(e => [e…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L117 `const connections = new Map([...vertices.keys()].map(id => [id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L122 `const inlandComponents = new Map(); let component = 0;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L123 `for (const id of vertices.keys()) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L129 `pending.push(...connections.get(current).filter(c => c.edge.regions.length === 2).map(c => c.to));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L147 `const used = new Set(), features = [];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L150 `const accessible = [...outer].filter(id => connections.get(id).some(c => c.edge.regions.length === 2));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L151 `const nearest = (p, candidates = accessible) => candidates.sort((a, b) => distance(vertices.get(a), p) - distance(vertice…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L155 `const starts = [...vertices.keys()].filter(id => !seaVertices.has(id) && connections.get(id).some(c => c.edge.regions.len…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L159 `const best = pairs.sort((a, b) => a.score - b.score)[0];` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L163 `const scores = new Map([[start, 0]]), previous = new Map(), pending = new Set(vertices.keys());` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L165 `const current = [...pending].reduce((best, id) => (scores.get(id) ?? Infinity) < (scores.get(best) ?? Infinity) ? id : be…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L168 `for (const { to, edge } of connections.get(current)) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L174 `const forward = ((b.x - a.x) * (destination.x - source.x) * ASPECT ** 2 + (b.y - a.y) * (destination.y - source.y))` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L209 `const amplitude = Math.min(.016, length * .1, ...nearCentres.map(d => d * .16)) * roughness;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L210 `const samples = Math.max(4, Math.ceil(length * 150));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L215 `const wave = edge.feature ? edge.featureDirection * (Math.sin(along * Math.PI * 2 * featureFrequency + edge.featurePhase)` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L216 `+ .25 * Math.sin(along * 83 + edge.featurePhase)) : Math.sin(t * Math.PI * 4.8 + phase) + .25 * Math.sin(t * 43 + phase);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L217 `const offset = amplitude * Math.sin(Math.PI * t) ** 2 * wave;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L230 `const columns = Math.ceil((bounds.maxX - bounds.minX) * ASPECT / .017), lines = Math.ceil((bounds.maxY - bounds.minY) / .…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L233 `const coordinates = (min, max, count, axis) => [...new Set([...Array.from({ length: count + 1 }, (_, i) => lerp(min, max,…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L234 `...anchors.map(p => p[axis])].map(v => +v.toFixed(10)))].sort((a, b) => a - b);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L239 `return { ...p, value: field(p) };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L241 `const joins = new Map(), points = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L244 `vertices.forEach((a, i) => {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L252 `if (!joins.has(a)) joins.set(a, new Set());` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L253 `if (!joins.has(b)) joins.set(b, new Set());` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L260 `const remaining = new Set(joins.keys()), contours = [];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L262 `const start = remaining.values().next().value, loop = [];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L266 `const next = [...joins.get(current)].find(id => id !== previous);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L271 `return contours.sort((a, b) => polygonArea(b) - polygonArea(a));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L275 `const remaining = new Set(regions.filter(r => r.biome === 'islands').map(r => r.id)), clusters = [];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L277 `const regionIds = [], pending = [remaining.values().next().value];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L292 `foliage: Array.from({ length: 7 }, (_, i) => ({ x: region.centre.x + Math.cos(i * 2.4 + phase) * radius * .55 / ASPECT,` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L293 `y: region.centre.y + Math.sin(i * 2.4 + phase) * radius * .55 })) };` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L297 `return { edgeId: edge.id, points: [a.centre, edge.points[Math.floor(edge.points.length / 2)], b.centre],` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L306 `const angle = Math.atan2(p.y - core.centre.y, (p.x - core.centre.x) * ASPECT);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L307 `return core.radius * (1 + .13 * Math.sin(angle * 3 + core.phase) + .07 * Math.sin(angle * 5 - core.phase)) - distance(p, …` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L308 `}), ...bridges.map(bridge => bridge.width - Math.min(segmentDistance(p, bridge.points[0], bridge.points[1]), segmentDista…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L311 `const coastInset = .008 * Math.min(1, ...bridges.map(b => distance(p, b.points[1]) / (b.width * 1.5)));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L315 `const contours = islandContours(bounds, field, [...cores.map(c => c.centre), ...bridges.map(b => b.points[1])]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L330 `const oceanVertices = new Set(edges.filter(e => e.regions.length === 1 && oceanSides.includes(e.worldSide)).flatMap(e => …` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L341 `const t = j / 16, across = bend * Math.sin(t * Math.PI / 2);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L358 `const x = p.x * ASPECT * frequency, y = p.y * frequency, ix = Math.floor(x), iy = Math.floor(y);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L360 `const value = (a, b) => decorationRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ salt);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L370 `const d = segmentDistance(p, ...patch.points);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L374 `const weight = 1 / (.004 + d ** 3); total += weight; affinity[patch.kind] += weight;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L386 `const influence = 1 / (1 + landDistance ** 2 * 2);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L387 `for (const kind of Object.keys(affinity)) affinity[kind] = affinity[kind] / (total || 1) * influence;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L391 `const strength = Math.exp(-(distance(p, anchor.point) ** 2) / .09);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L405 `y: -.95 + (Math.floor(i / 12) + .5 + (state.rngNextFloat() - .5) * .65) * 2.9 / 8,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L412 `polygon = clip(polygon, 2 * ASPECT ** 2 * (other.x - site.x), 2 * (other.y - site.y),` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L413 `ASPECT ** 2 * (other.x ** 2 - site.x ** 2) + other.y ** 2 - site.y ** 2 + site.weight - other.weight);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP** L419 `const owners = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L428 `const angle = Math.atan2(y, x);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L429 `const radius = 1 + .19 * Math.sin(angle * 3 + phases[0]) + .12 * Math.sin(angle * 5 + phases[1]);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L430 `return Math.hypot(x, y) / radius;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L432 `const start = cells.reduce((best, cell) => score(cell) < score(best) ? cell : best).index;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L433 `const selected = new Set([start]), frontier = new Set(cells[start].neighbours);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L436 `const seen = new Set(), pending = [...perimeter];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L445 `const next = [...frontier].sort((a, b) => score(cells[a]) - score(cells[b])).find(keepsExteriorConnected);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L449 `return [...selected].sort((a, b) => a - b).map((index, i) => ({` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L450 `id: 'R${String(i + 1).padStart(2, '0')}', polygon: cells[index].polygon, centre: cells[index].centre,` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L456 `const state = { rng: { seed: Math.floor(seed) } }; attachRngHelpers(state);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L457 `const world = createWorld(Math.floor(seed));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L459 `const vertices = new Map(), edgeMap = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L464 `const [first, second] = [a, b].sort();` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP** L469 `const edges = [...edgeMap.values()];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L476 `const biomes = shuffle(Object.keys(BIOMES).filter(b=>b!=='monster'), state), quota = Object.fromEntries(biomes.map((biome…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L501 `const totalArea = regions.reduce((sum, r) => sum + r.area, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L502 `const biomeAreas = Object.fromEntries(Object.keys(BIOMES).map(b => [b, regions.filter(r => r.biome === b).reduce((sum, r)…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L512 `const a = points[i - 1], b = points[i], dx = (b.x - a.x) * ASPECT, dy = b.y - a.y, length = Math.hypot(dx, dy);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L514 `const t = Math.max(0, Math.min(1, ((p.x - a.x) * ASPECT * dx + (p.y - a.y) * dy) / length ** 2));` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP** L534 `return { minX: Math.min(...points.map(p => p.x)) - margin / ASPECT, maxX: Math.max(...points.map(p => p.x)) + margin / AS…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L535 `minY: Math.min(...points.map(p => p.y)) - margin, maxY: Math.max(...points.map(p => p.y)) + margin };` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L556 `rocky: neighbours.some(r => r.biome === 'mountains') || rocky(edge.points[Math.floor(edge.points.length / 2)]) });` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L559 `edgeId: null, points: [...contour, contour[0]], water: 'island-water', rocky: rocky(contour[Math.floor(contour.length / 2…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L567 `if (q.distance < best.distance) best = { ...q, coast };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L591 `const points = raw.slice(start, end + 1), near = closestCoast(points[Math.floor(points.length / 2)]);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L610 `if (!i) return [p]; const a = raw[i - 1], steps = Math.max(1, Math.ceil(distance(a, p) / .006));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L624 `const length = points => points.reduce((sum, p, i) => sum + (i ? distance(points[i - 1], p) : 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L625 `let course = spans.sort((a, b) => length(b) - length(a))[0] ?? [];` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L650 `if (length(coastal) > .12) interactions.push({ type: 'coastal-river', points: coastal, point: coastal[Math.floor(coastal.…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L667 `interactions.push({ type, points, point: points[Math.floor(points.length / 2)], featureIndex }); episode = [];` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L683 `for (const coast of coasts.filter(c => c.rocky)) interactions.push({ type: 'rocky-coast', points: coast.points, point: co…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L726 `const a = points[i - 1], b = points[i], dx = (b.x - a.x) * ASPECT, dy = b.y - a.y, length = Math.hypot(dx, dy);` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L728 `const t = Math.max(0, Math.min(1, ((p.x - a.x) * ASPECT * dx + (p.y - a.y) * dy) / length ** 2));` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L729 `if (Math.hypot((p.x - lerp(a.x, b.x, t)) * ASPECT, p.y - lerp(a.y, b.y, t)) < limit) return true;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L737 `let value = Math.imul((seed ^ index) >>> 0, 1597334677);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L738 `value = Math.imul(value ^ value >>> 16, 2246822519);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L739 `return ((value ^ value >>> 13) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.

### src/model/regional-map/names.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 6, 85, 93.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 26, 31.
- **CP / JS** L5 `const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L10 `if (Math.hypot(x-.5,y-.5) < .17) return 'Central';` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L11 `return DIRECTIONS[(Math.round(Math.atan2(y-.5,x-.5)/(Math.PI/4))+8)%8];` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L15 `for (let value = index+1; value > 0; value = Math.floor((value-1)/26)) label = String.fromCharCode(65+(value-1)%26)+label;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L32 `for (let candidate=1;candidate<=columns;candidate++) if (!used[candidate]) {` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L37 `for (let candidate=0;candidate<=columns;candidate++) {` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L57 `const anchors=[...DIRECTIONS.map((name,index)=>({name,x:Math.cos(index*Math.PI/4),y:Math.sin(index*Math.PI/4)})),{name:'C…` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L58 `const slots=Math.ceil(members.length/DIRECTIONS.length)*anchors.length;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L68 `const centralPenalty=anchor.name==='Central'&&Math.hypot(localX,localY)>.5?100:0;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation.
- **CP / JS** L71 `return (x-anchor.x)**2+(y-anchor.y)**2+Math.floor(slot/anchors.length)*6+centralPenalty;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L80 `const ordered=[...regions].sort(compareIds),byId=new Map(ordered.map(r=>[r.id,r]));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L81 `const visited=new Set(),byBase=new Map(),names=new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L90 `members.sort(compareIds);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L100 `for (const [base,members] of byBase) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L101 `members.sort(geographicOrder).forEach((region,index)=>names.set(region.id,` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.

### src/model/regional-practices.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 15, 23, 48, 60, 89, 207.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 126, 182.
- **CP / JS** L15 `amount: Math.max(0, Math.floor(amount ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L38 `const distinctIds = [...new Set(hypotheticalPracticeIds.filter((id) => id !== practiceId))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L67 `const visited = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L78 `const componentRegionIds = [...visited];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L157 `diagnostics: Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L158 `Object.entries(bonus).filter(([key]) => !["amount", "text"].includes(key))` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L195 `return evaluation.ok ? { ...evaluation, installedIndex } : evaluation;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L199 `const byPracticeId = Object.fromEntries(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L200 `Object.keys(regionalPracticeDefs).map((practiceId) => [practiceId, {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L224 `byPracticeId[evaluation.practiceId].totalScore += evaluation.score;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L231 `totalScore: entries.reduce((total, entry) => total + entry.score, 0),` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/replay-second-runner.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 15, 25, 29, 50, 57, 60, 71, 73, 74, 77, 78, 81, 82.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 8.
- **CP / JS** L9 `return Math.max(0, Math.floor(value));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/research-progression.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 6, 14, 22, 36.
- **CP / JS** L6 `const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L14 `const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L22 `const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L25 `const thresholds = [0, ...['Silver', 'Gold', 'Diamond'].map(tier => getGameSetting(state, 'research${tier}Threshold'))];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L33 `...tiers.slice(1).map(tier => ({ research: tier.threshold, label: '${tier.id[0].toUpperCase()}${tier.id.slice(1)} unlocke…` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L35 `].sort((a, b) => a.research - b.research);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.

### src/model/rng.js

- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 83.
- **CP / JS** L5 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L6 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L7 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L11 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L12 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L13 `return a + Math.floor(_rngNextFloat(state) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L18 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L19 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L20 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L24 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L25 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L26 `return a + Math.floor(_rngNextVassalFloat(state) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L31 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L32 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L33 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L37 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L38 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L39 `return a + Math.floor(_rngNextVassalDevelopmentFloat(state) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L44 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L45 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L46 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L50 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L51 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L52 `return a + Math.floor(_rngNextVassalLifeMapFloat(state) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L57 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L58 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L59 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L63 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L64 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L65 `return a + Math.floor(_rngNextVassalPortraitFloat(state) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L70 `t = Math.imul(t ^ (t >>> 15), 1 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L71 `t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L72 `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L76 `const a = Math.ceil(min);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L77 `const b = Math.floor(max);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L78 `return a + Math.floor(_rngNextFloatSeed(seedState) * (b - a + 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L83 `seed: Number.isFinite(seed) ? Math.floor(seed) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/settlement-exec.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 27, 35, 39, 44, 47, 54, 62, 88, 93, 98, 105, 151, 154, 157, 160, 165, 171, 172, 180, 181, 182, 184, 188, 189, 190, 191, 210, 223, 233, 234, 235, 237, 238, 240, 250.
- **CP / JS** Missing continued. Lines 253, 255, 262, 273, 284, 290, 295, 300, 301, 305, 306, 309, 313, 317, 329, 331, 339, 358, 362, 384, 404, 417, 418, 420, 421, 423, 434, 448, 455, 481, 488, 499, 519, 524, 528.
- **CP / JS** Missing continued. Lines 545, 553, 555, 568, 610, 615, 632, 638, 665, 671, 703, 716, 717, 718, 721, 724, 734, 743, 804, 811, 841, 843, 852, 856, 857, 864, 865, 867, 868, 870, 871, 872, 874, 876, 877.
- **CP / JS** Missing continued. Lines 878, 880, 883, 887, 888, 895, 911, 918, 920, 921, 944, 953, 963, 970, 975, 979, 981, 984, 987, 988, 998, 1005, 1014, 1021, 1028, 1042, 1052, 1059, 1061, 1062, 1066, 1081, 1082, 1097, 1102.
- **CP / JS** Missing continued. Lines 1103, 1112, 1114, 1115, 1121.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 35, 44, 47, 54, 71, 72, 93, 98, 117, 146, 165, 184, 198, 202, 211, 225, 239, 240, 248, 262, 338, 379, 384, 399, 404, 419, 421, 477, 543, 618, 634, 640, 651, 667, 673.
- **CP / JS** Number guard continued. Lines 718, 721, 804, 807, 812, 821, 825, 851, 868, 872, 911, 914, 1116, 1121.
- **CP / JS** L35 `return Number.isFinite(commitment?.amount) ? Math.max(0, Math.floor(commitment.amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L40 `return commitments.reduce((sum, commitment) => sum + getCommitmentAmount(commitment), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L45 `return Math.max(0, Math.floor(classState.adults));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L48 `return Math.max(0, Math.floor(classState.total));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L54 `return Number.isFinite(classState?.youth) ? Math.max(0, Math.floor(classState.youth)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L71 `const total = Number.isFinite(totalPopulation) ? Math.max(0, Math.floor(totalPopulation)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L73 `? Math.max(0, Math.floor(populationCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L94 `? Math.max(0, Math.floor(summary.totalPopulation))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L95 `: classIds.reduce((sum, classId) => {` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L99 `? Math.max(0, Math.floor(summary.populationCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L146 `if (Number.isFinite(input)) return Math.max(0, Math.floor(input));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L151 `baseValue = Math.max(0, Math.floor(classSummary?.freePopulation ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L154 `baseValue = Math.max(0, Math.floor(classSummary?.totalPopulation ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L157 `baseValue = Math.max(0, Math.floor(classSummary?.youth ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L164 `? Math.max(0, Math.floor(getSettlementTotalFood(state)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L166 `? Math.max(0, Math.floor(stockpiles[key]))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L184 `key && Number.isFinite(godState?.[key]) ? Math.max(0, Math.floor(godState[key])) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L191 `baseValue = Math.max(0, Math.floor(progress?.remainingCitizenYearsForNextTier ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L198 `const divideBy = Number.isFinite(input.divideBy) ? Math.floor(input.divideBy) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L200 `baseValue = Math.floor(baseValue / divideBy);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L202 `const minimum = Number.isFinite(input.minimum) ? Math.max(0, Math.floor(input.minimum)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L206 `return Math.max(0, Math.floor(baseValue));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L211 `if (Number.isFinite(spec)) return Math.max(0, Math.floor(spec));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L219 `amount = resolved.reduce((sum, value) => sum + value, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L221 `amount = resolved.reduce((max, value) => Math.max(max, value), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L223 `amount = resolved.reduce((min, value) => Math.min(min, value), resolved[0] ?? 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L225 `const minimum = Number.isFinite(spec.minimum) ? Math.max(0, Math.floor(spec.minimum)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L229 `return Math.max(0, Math.floor(amount));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L239 `const amountScale = Number.isFinite(effect.amountScale) ? Number(effect.amountScale) : 1;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L243 `costPerUnit: Math.max(1, Math.floor(Math.abs(amountScale))),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L248 `const amount = Number.isFinite(baseAmount) ? Math.max(0, Math.floor(baseAmount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L261 `? Math.max(0, Math.floor(getSettlementTotalFood(state)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L263 `? Math.max(0, Math.floor(stockpiles[cost.key]))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L265 `const affordableUnits = Math.max(0, Math.floor(available / Math.max(1, cost.costPerUnit)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L272 `amount: Math.max(0, Math.floor(clampedAmount)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L309 `Math.floor(progress?.completedCitizenYearsTowardNextTier ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L313 `Math.floor(progress?.requiredCitizenYearsForNextTier ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L317 `Math.floor(progress?.remainingCitizenYearsForNextTier ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L339 `if ((classSummary?.freePopulation ?? 0) < Math.floor(requires.freePopulationAtLeast)) {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L378 `for (const [key, amountRaw] of Object.entries(entry)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L380 `const amount = Math.max(0, Math.floor(amountRaw));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L383 `? Math.floor(getSettlementTotalFood(state))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L385 `? Math.floor(stockpiles[key])` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L398 `for (const [key, amountRaw] of Object.entries(entry)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L400 `const amount = Math.max(0, Math.floor(amountRaw));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L403 `? Math.floor(getSettlementTotalFood(state))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L405 `? Math.floor(stockpiles[key])` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L419 `const amount = Number.isFinite(entry.amount) ? Math.max(0, Math.floor(entry.amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L421 `const value = key && Number.isFinite(godState?.[key]) ? Math.floor(godState[key]) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L433 `const capabilitySet = new Set(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L477 `const safeAmount = Number.isFinite(totalAmount) ? Math.max(0, Math.floor(totalAmount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L480 `const totalAvailable = classIds.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L481 `(sum, classId) => sum + Math.max(0, Math.floor(availableByClass[classId] ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L488 `const available = Math.max(0, Math.floor(availableByClass[classId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L490 `const share = Math.min(available, Math.floor((safeAmount * available) / totalAvailable));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L499 `const available = Math.max(0, Math.floor(availableByClass[classId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L542 `for (const [key, rawValue] of Object.entries(passiveBonuses)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L545 `Number(totalsByClass[targetClassId][key] ?? 0) + Number(rawValue);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L588 `const totalPopulation = classIds.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L592 `const committedPopulation = classIds.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L598 `const totalAdultPopulation = classIds.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L619 `? Math.max(0, Math.floor(settlementSpec.staffingRequired))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L631 `foodCapacity +=` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L635 `? Math.max(0, Math.floor(settlementSpec.foodCapacityBonus))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L641 `? Math.max(0, Math.floor(settlementSpec.populationCapacityBonus))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L652 `activeStructureIds.push(Math.floor(structure.instanceId));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L668 `? Math.max(0, Math.floor(settlementSpec.foodCapacityBonus))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L674 `? Math.max(0, Math.floor(settlementSpec.populationCapacityBonus))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L703 `const staffed = Math.max(0, Math.floor(staffingByClass[classId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L719 `? Math.max(0, Math.floor(classState.happiness.fullFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L722 `? Math.max(0, Math.floor(classState.happiness.missedFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L730 `const uniqueCapabilities = Array.from(new Set(capabilities)).sort((a, b) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L731 `a.localeCompare(b)` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L733 `const freePopulation = Object.values(classSummaries).reduce(` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L734 `(sum, classSummary) => sum + Math.max(0, Math.floor(classSummary.freePopulation ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L750 `core.props.activeStructureIds = activeStructureIds.sort((a, b) => a - b);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L805 `? Math.max(0, Math.floor(summary.foodCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L811 `const redResourceCap = Math.max(0, Math.floor(summary?.totalPopulation ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L842 `return classState.commitments.reduce((sum, commitment) => {` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L851 `const safeNowSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L869 `? Math.max(0, Math.floor(commitment.releaseSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L873 `? Math.max(0, Math.floor(commitment.startSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L912 `? Math.max(1, Math.floor(def.timing.cadenceSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L914 `const safeNowSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/settlement-leadership.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 8, 15, 36, 38, 39, 41, 47, 49, 50, 59, 61, 62, 64, 67, 137, 149, 164, 179, 181, 200, 201, 205, 222, 245, 262, 281, 285, 308, 310, 312, 334, 346.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 38, 39, 101, 113, 145, 173, 236, 247, 281, 312, 325.
- **JS / CP** L9 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP** L16 `const seen = allowSet ? new Set() : {};` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L38 `const minAge = Number.isFinite(band?.minAgeYears) ? Math.floor(band.minAgeYears) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L39 `const maxAge = Number.isFinite(band?.maxAgeYears) ? Math.floor(band.maxAgeYears) : Infinity;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L41 `return Math.max(0, Math.min(1, Number(band?.yearlyChance ?? 0)));` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L59 `totalAdults += Math.max(0, Math.floor(adultSummaries?.[classId]?.adults ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L64 `roll -= Math.max(0, Math.floor(adultSummaries?.[classId]?.adults ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L71 `return Object.values(settlementPracticeDefs)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L78 `.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L90 `return Object.values(settlementPracticeDefs)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L97 `.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L102 `const raw = Number(value);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L113 `const targetCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L162 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L200 `const reorderChance = Number(orderDef?.agendaMutation?.reorderChance ?? 0);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L201 `const developmentChance = Number(orderDef?.agendaMutation?.developmentChance ?? 0);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L257 `const normalizedMajorDevelopmentChance = Math.max(0, Math.min(1, Number(majorDevelopmentChance) || 0));` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L282 `? Math.max(0, Math.floor(getPracticeSlotCount(classId)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L313 `? Math.max(0, Math.floor(getAgendaSizeForClass(classId)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L325 `const normalizedAgendaSize = Number.isFinite(agendaSize) ? Math.max(0, Math.floor(agendaSize)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/settlement-order-exec.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 21, 24, 27, 32, 36, 40, 45, 62, 71, 79, 83, 136, 145, 149, 159, 161, 163, 165, 167, 169, 171, 172, 180, 184, 185, 194, 198, 200, 212, 241, 242, 243, 250, 252, 253.
- **CP / JS** Missing continued. Lines 254, 270, 271, 275, 283, 284, 287, 288, 297, 301, 304, 308, 320, 323, 327, 346, 347, 356, 370, 378, 379, 388, 410, 424, 432, 433, 435, 441, 444, 448, 479, 480, 482, 484, 487.
- **CP / JS** Missing continued. Lines 501, 502, 513, 525, 578, 591, 602, 618, 630, 631, 633, 635, 639, 641, 666, 675, 684, 698, 699, 724, 726, 728, 730, 731, 733, 734, 738, 739, 740, 742, 744, 765, 767, 777, 779.
- **CP / JS** Missing continued. Lines 789, 804.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 21, 72, 75, 105, 110, 114, 149, 152, 163, 184, 239, 441, 444, 480, 484, 487, 633, 739, 740.
- **CP / JS** L21 `return Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L73 `? Math.max(1, Math.floor(member.joinedYear))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L75 `ageYears: Number.isFinite(member.ageYears) ? Math.max(0, Math.floor(member.ageYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L103 `for (const [defId, year] of Object.entries(rawByClass)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L106 `normalizedByClass[defId] = Math.max(1, Math.floor(year));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L111 `? Math.max(1, Math.floor(existing.nextMemberId))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L115 `? Math.max(1, Math.floor(existing.lastProcessedYear))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L136 `Math.floor(card.systemState.elderCouncil?.nextMemberId ?? nextMemberId)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L149 `const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L153 `? Math.max(1, Math.floor(councilState.nextMemberId))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L163 `ageYears: Number.isFinite(entry?.ageYears) ? Math.max(0, Math.floor(entry.ageYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L184 `const ageYears = Number.isFinite(member?.ageYears) ? Math.max(0, Math.floor(member.ageYears)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L185 `const modifierDelta = Number(getModifierDef(orderDef, member?.modifierId)?.prestigeDelta ?? 0);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L236 `? Object.entries(source)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L239 `const slotIndex = Number.isFinite(Number(rawIndex))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L240 `? Math.max(0, Math.floor(Number(rawIndex)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L244 `normalizedBySlot[String(slotIndex)] = { mode: "empty" };` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L258 `normalizedBySlot[String(slotIndex)] = { mode: "set", defId };` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L261 `if (Object.keys(normalizedBySlot).length > 0) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L275 `totals[defId] = Math.max(0, Math.floor(totals[defId] ?? 0)) + memberPrestige;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L282 `return [...practiceIds].sort((a, b) => {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L283 `const prestigeDelta = Math.max(0, Math.floor(prestigeTotals?.[b] ?? 0)) -` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L284 `Math.max(0, Math.floor(prestigeTotals?.[a] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L287 `Math.max(0, Math.floor(boardPositions?.[a] ?? Number.MAX_SAFE_INTEGER)) -` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L288 `Math.max(0, Math.floor(boardPositions?.[b] ?? Number.MAX_SAFE_INTEGER));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L290 `return a.localeCompare(b);` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L318 `const boardPositions = Object.fromEntries(residentBoard.map((defId, index) => [defId, index]));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L320 `(defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) > 0` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L323 `(defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) <= 0` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L325 `const incomingSupportedDefIds = Object.keys(prestigeTotals)` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L327 `(defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) > 0 && !residentBoard.includes(defId)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L329 `.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L332 `[...supportedResidentDefIds, ...incomingSupportedDefIds],` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L337 `const naturalBoard = [...supportedDefIds, ...unsupportedResidentDefIds].slice(0, maxSlots);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L353 `const entry = debugBoard[String(index)];` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L368 `const existingByDefId = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L437 `.sort((a, b) => (b.prestige - a.prestige) || (b.ageYears - a.ageYears) || a.memberId.localeCompare(b.memberId));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L442 `? Math.max(1, Math.floor(orderDef.recruitmentCadenceYears))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L445 `? Math.max(1, Math.floor(orderDef.recruitmentAdultsPerElder))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L448 `const adultPopulation = Math.max(0, Math.floor(populationSummary?.adults ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L449 `const guaranteedRecruits = Math.floor(adultPopulation / adultsPerElder);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L481 `? Math.floor(councilState.lastProcessedYear)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L485 `? Math.max(1, Math.floor(orderDef.recruitmentCadenceYears))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L487 `const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L633 `const safeSlotIndex = Number.isFinite(slotIndex) ? Math.max(0, Math.floor(slotIndex)) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L663 `? { ...councilState.debugPracticeBoardByClass[safeClassId] }` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L666 `delete current[String(safeSlotIndex)];` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L668 `current[String(safeSlotIndex)] = { mode: "set", defId: safePracticeDefId };` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L670 `current[String(safeSlotIndex)] = { mode: "empty" };` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L672 `if (Object.keys(current).length > 0) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L739 `joinedYear: Number.isFinite(spec?.joinedYear) ? Math.max(1, Math.floor(spec.joinedYear)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L740 `ageYears: Number.isFinite(spec?.ageYears) ? Math.max(0, Math.floor(spec.ageYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L762 `const eligibleVassalIds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/settlement-state.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 59, 62, 63, 64, 71, 76, 78, 79, 83, 84, 85, 86, 92, 97, 98, 110, 118, 120, 126, 130, 131, 136, 137, 139, 141, 142, 144, 146, 148, 149, 151, 154, 161, 171, 175.
- **CP / JS** Missing continued. Lines 176, 180, 182, 184, 185, 190, 191, 193, 195, 196, 198, 200, 202, 203, 211, 215, 219, 221, 222, 224, 225, 233, 236, 240, 242, 246, 247, 248, 252, 257, 258, 259, 264, 266, 268.
- **CP / JS** Missing continued. Lines 269, 271, 272, 273, 279, 283, 284, 285, 287, 292, 296, 301, 302, 310, 326, 331, 332, 338, 343, 345, 347, 348, 350, 352, 355, 357, 360, 363, 365, 371, 374, 377, 380, 381, 392.
- **CP / JS** Missing continued. Lines 395, 396, 397, 400, 403, 411, 435, 445, 453, 458, 460, 465, 466, 467, 470, 477, 483, 484, 485, 488, 500, 501, 504, 507, 518, 526.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 98, 105, 118, 120, 128, 137, 139, 144, 146, 149, 151, 173, 180, 182, 191, 193, 196, 198, 213, 222, 238, 299, 338, 348, 350, 352, 355, 357, 360, 363, 371, 374, 377, 392, 397.
- **CP / JS** Number guard continued. Lines 400, 405, 445, 490, 493, 496, 501, 504, 509.
- **CP / JS** L60 `return normalizeClassOrder(Object.keys(detailed.populationByClass));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L66 `explicitOrder.length ? explicitOrder : Object.keys(populationClasses || {})` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L77 `return Object.fromEntries(Object.entries(detailed.populationByClass).map(([classId, entry]) => {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L78 `const elders = (entry.eldersByAge ?? []).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L79 `(sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)), 0` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L83 `youth: Math.max(0, Math.floor(entry.children ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L84 `adults: Math.max(0, Math.floor(entry.adults ?? 0)) + elders,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L85 `total: Math.max(0, Math.floor(entry.children ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L86 `+ Math.max(0, Math.floor(entry.adults ?? 0)) + elders,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L99 `? Math.max(1, Math.floor(state.seasonDurationSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L105 `const safeYear = Number.isFinite(year) ? Math.max(1, Math.floor(year)) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L119 `? Math.max(0, Math.floor(vassal.endSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L120 `: Number.isFinite(vassal?.deathSec) ? Math.max(0, Math.floor(vassal.deathSec)) : 0` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L129 `? Math.max(0, Math.floor(historyEndSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L130 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L138 `? Math.max(0, Math.floor(current.birthSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L140 `? Math.max(0, Math.floor(current.selectedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L145 `? Math.max(0, Math.floor(next.birthSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L147 `? Math.max(0, Math.floor(next.selectedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L150 `? Math.max(0, Math.floor(current.endSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L152 `? Math.max(0, Math.floor(current.deathSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L174 `? Math.max(0, Math.floor(historyEndSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L175 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L177 `const seconds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L181 `? Math.max(0, Math.floor(selectedVassals[index].birthSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L183 `? Math.max(0, Math.floor(selectedVassals[index].selectedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L192 `? Math.max(0, Math.floor(currentVassal.birthSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L194 `? Math.max(0, Math.floor(currentVassal.selectedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L197 `? Math.max(0, Math.floor(currentVassal.endSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L199 `? Math.max(0, Math.floor(currentVassal.deathSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L208 `return [...seconds].sort((a, b) => a - b);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L214 `? Math.max(0, Math.floor(visibleThroughSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L215 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L216 `const seconds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L223 `? Math.max(0, Math.floor(event.tSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L230 `return [...seconds].sort((a, b) => a - b);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L239 `? Math.max(0, Math.floor(tSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L240 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L242 `(entry) => Math.max(0, Math.floor(entry?.tSec ?? 0)) <= safeTSec` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L298 `for (const rawIndex of Object.keys(bySlot)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L299 `const slotIndex = Number.isFinite(Number(rawIndex))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L300 `? Math.max(0, Math.floor(Number(rawIndex)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L316 `const key = String(index);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L338 `return Number.isFinite(commitment?.amount) ? Math.max(0, Math.floor(commitment.amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L349 `? Math.max(0, Math.floor(derived.adults))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L351 `? Math.max(0, Math.floor(populationClass.adults))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L353 `? Math.max(0, Math.floor(populationClass.total))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L356 `? Math.max(0, Math.floor(derived.youth))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L358 `? Math.max(0, Math.floor(populationClass.youth))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L361 `? Math.max(0, Math.floor(derived.total))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L364 `? Math.max(0, Math.floor(derived.committed))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L366 `? populationClass.commitments.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L372 `? Math.max(0, Math.floor(derived.staffed))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L375 `? Math.max(0, Math.floor(derived.free))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L378 `? Math.max(0, Math.floor(derived.reserved))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L393 `? Math.max(0, Math.floor(props.populationCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L398 `? Math.max(0, Math.floor(happiness.fullFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L401 `? Math.max(0, Math.floor(happiness.missedFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L405 `Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L429 `total += summary.total;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L446 `? Math.max(0, Math.floor(props.populationCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L491 `? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L494 `? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L497 `? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L502 `? Math.max(0, Math.floor(happinessState.fullFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L505 `? Math.max(0, Math.floor(happinessState.missedFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L509 `Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.

### src/model/settlement-state/hub-legacy.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 25, 37, 43, 78, 119, 123, 130, 144, 146, 151, 152, 154, 155, 162, 165, 168, 169, 171, 173, 177, 178, 185, 189, 210, 227, 236, 238, 239, 241, 246, 247, 250, 253, 270, 272.
- **CP / JS** Missing continued. Lines 273, 274, 280, 281, 283, 287, 289, 291, 319, 323, 334, 336, 342, 367, 369, 371, 372, 375, 398, 399, 415, 425, 426, 427, 443, 444, 453, 459, 475, 478, 482, 483, 489, 491, 513.
- **CP / JS** Missing continued. Lines 521, 542, 544, 545, 546, 575, 576, 583, 595, 596, 621, 625, 626, 633, 634, 637, 641, 648, 682, 685, 686, 733, 764, 765, 815, 816.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 42, 49, 100, 101, 104, 107, 110, 113, 124, 144, 151, 154, 163, 166, 170, 173, 195, 196, 199, 234, 235, 262, 263, 264, 265, 266, 267, 268, 270, 272, 273, 274, 289, 291, 325.
- **CP / JS** Number guard continued. Lines 326, 354, 360, 378, 381, 384, 387, 390, 398, 498, 528, 596, 642, 649, 655, 667, 682, 686, 701, 718, 734, 739, 771, 815, 818.
- **JS / CP** L38 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L42 `const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L47 `const next = raw && typeof raw === "object" ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L49 `next[key] = Number.isFinite(next[key]) ? Number(next[key]) : 0;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L83 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L98 `raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L100 `year: Number.isFinite(next.year) ? Math.max(1, Math.floor(next.year)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L102 `? Math.max(0, Number(next.mealAttempts))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L105 `? Math.max(0, Number(next.mealSuccesses))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L108 `? Math.max(0, Number(next.attractionProgress))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L111 `? Math.max(0, Number(next.lastMealAttempts))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L114 `? Math.max(0, Number(next.lastMealSuccesses))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L125 `? Math.max(0, Math.min(1, Number(next.lastSeasonFeedRatio)))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L132 `raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L140 `raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L144 `Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : null` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L147 `.slice(-Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH || 3)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L152 `? Math.max(0, Math.floor(next.fullFeedStreak ?? next.positiveFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L155 `? Math.max(0, Math.floor(next.missedFeedStreak ?? next.negativeFeedStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L164 `? Math.max(0, Math.floor(raw.startSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L167 `? Math.max(0, Math.floor(raw.releaseSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L170 `const amount = Number.isFinite(raw.amount) ? Math.max(0, Math.floor(raw.amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L173 `id: Number.isFinite(raw.id) ? Math.floor(raw.id) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L191 `raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L195 `const legacyTotal = Number.isFinite(next.total) ? Math.max(0, Math.floor(next.total)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L197 `? Math.max(0, Math.floor(next.adults))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L199 `const youth = Number.isFinite(next.youth) ? Math.max(0, Math.floor(next.youth)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L212 `raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L218 `for (const [key, value] of Object.entries(next)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L232 `: 'vassal-event-${Math.max(0, Math.floor(fallbackIndex))}',` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L234 `tSec: Number.isFinite(raw.tSec) ? Math.max(0, Math.floor(raw.tSec)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L235 `ageYears: Number.isFinite(raw.ageYears) ? Math.max(0, Math.floor(raw.ageYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L262 `birthSec: Number.isFinite(raw.birthSec) ? Math.max(0, Math.floor(raw.birthSec)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L263 `birthYear: Number.isFinite(raw.birthYear) ? Math.max(1, Math.floor(raw.birthYear)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L264 `selectedSec: Number.isFinite(raw.selectedSec) ? Math.max(0, Math.floor(raw.selectedSec)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L265 `deathSec: Number.isFinite(raw.deathSec) ? Math.max(0, Math.floor(raw.deathSec)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L266 `deathYear: Number.isFinite(raw.deathYear) ? Math.max(1, Math.floor(raw.deathYear)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L267 `initialAgeYears: Number.isFinite(raw.initialAgeYears) ? Math.max(0, Math.floor(raw.initialAgeYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L268 `deathAgeYears: Number.isFinite(raw.deathAgeYears) ? Math.max(0, Math.floor(raw.deathAgeYears)) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L270 `Number.isFinite(raw.villagerAgeYears) ? Math.max(0, Math.floor(raw.villagerAgeYears)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L272 `Number.isFinite(raw.professionAgeYears) ? Math.max(0, Math.floor(raw.professionAgeYears)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L273 `traitAgeYears: Number.isFinite(raw.traitAgeYears) ? Math.max(0, Math.floor(raw.traitAgeYears)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L274 `elderAgeYears: Number.isFinite(raw.elderAgeYears) ? Math.max(0, Math.floor(raw.elderAgeYears)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L289 `Number.isFinite(raw.joinedCouncilSec) ? Math.max(0, Math.floor(raw.joinedCouncilSec)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L291 `Number.isFinite(raw.removedFromCouncilSec) ? Math.max(0, Math.floor(raw.removedFromCouncilSec)) : null,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L310 `for (const [vassalId, value] of Object.entries(next.vassalsById)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L325 `nextVassalId: Number.isFinite(next.nextVassalId) ? Math.max(1, Math.floor(next.nextVassalId)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L326 `nextPoolId: Number.isFinite(next.nextPoolId) ? Math.max(1, Math.floor(next.nextPoolId)) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L357 `Math.min(SETTLEMENT_FLOODPLAIN_FOOD_CAP, Math.floor(settlement.foodStored))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L361 `? Math.max(0, Math.floor(settlement.blueResourceStored))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L376 `const next = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L379 `? Math.max(0, Math.floor(next.foodCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L382 `? Math.max(0, Math.floor(next.populationCapacity))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L385 `? Math.max(0, Math.floor(next.structureStaffingReserved))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L388 `? Math.max(0, Math.floor(next.committedPopulation))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L391 `? Math.max(0, Math.floor(next.freePopulation))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L398 `.map((entry) => (Number.isFinite(entry) ? Math.floor(entry) : null))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L498 `const fallbackCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L529 `? Math.max(1, Math.floor(colHint))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L536 `: Object.keys(target.core.systemState.populationClasses || {})` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L585 `{ ...(target.zones.structures || {}), slots: structureSlotsSource },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L597 `? Math.max(1, Math.floor(state.nextSettlementCardInstanceId))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L643 `? Math.max(0, Math.min(SETTLEMENT_FLOODPLAIN_FOOD_CAP, Math.floor(value)))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L649 `return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L658 `Math.min(SETTLEMENT_FLOODPLAIN_FOOD_CAP, Math.floor(amount))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L668 `? Math.max(0, Math.floor(amount))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L674 `return getSettlementFloodplainTiles(state).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L683 `return Number(detailed.storedFood) + Number(detailed.looseFood);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L687 `? Math.max(0, Number(stockpiles.food))` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L693 `return getSettlementHinterlandTiles(state).reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L701 `let remainingToAdd = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L718 `let remainingToRemove = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L727 `removedTotal += removed;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L734 `let remainingToConsume = Number.isFinite(amount) ? Math.max(0, Number(amount)) : 0;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L739 `const storedFood = Number.isFinite(stockpiles.food) ? Math.max(0, Number(stockpiles.food)) : 0;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L749 `const fieldConsumed = removeSettlementFloodplainFood(state, Math.ceil(remainingToConsume));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L767 `const currentTotal = hinterlandTiles.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L772 `? Math.max(0, Math.floor(desiredTotal))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L803 `const actualTotal = hinterlandTiles.reduce(` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L815 `if (key === "food" && Number.isFinite(detailed?.storedFood)) return Number(detailed.storedFood);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L818 `return Number.isFinite(stockpiles[key]) ? Number(stockpiles[key]) : 0;` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.

### src/model/settlement-upgrades.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 10, 12, 13, 18, 20, 26, 32, 37, 51, 54, 58, 84, 86, 92, 93, 97, 100, 108, 115, 116, 127, 140, 143, 147, 155, 156, 188, 202.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 75, 101, 109, 163.
- **CP / JS** L78 `? Math.max(0, Math.floor(upgradeState.completedCitizenYearsTowardNextTier))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L100 `const bonus = Number(capacityMap?.[tier] ?? 0);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L101 `return Number.isFinite(bonus) ? Math.max(0, Math.floor(bonus)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L108 `const threshold = Number(thresholdMap?.[tier] ?? 0);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L109 `return Number.isFinite(threshold) ? Math.max(0, Math.floor(threshold)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L127 `Math.floor(upgradeState?.completedCitizenYearsTowardNextTier ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L163 `const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L188 `Math.floor(upgradeState.completedCitizenYearsTowardNextTier ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/skills.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 41, 101, 103, 123, 131, 243, 250, 267, 271, 279, 316.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 43, 55, 122, 123, 130, 131, 244, 251.
- **CP / JS** L26 `global: { ...GLOBAL_SKILL_MOD_DEFAULTS },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L42 `const asNum = Number(pawnId);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L43 `if (Number.isFinite(asNum)) return String(Math.floor(asNum));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L44 `return String(pawnId);` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L52 `const out = { ...defaults };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L54 `for (const key of Object.keys(defaults)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L63 `new Set(raw.filter((id) => typeof id === "string" && id.length))` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L64 `).sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L73 `for (const [pawnId, entry] of Object.entries(ensureObject(modifiers.pawnById))) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L104 `runtime.modifiers.pawnById[pawnKey] = { ...PAWN_SKILL_MOD_DEFAULTS };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L143 `list.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L286 `return new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L325 `unlockedRecipes: new Set(runtime.unlocks.recipes),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L326 `unlockedHubStructures: new Set(runtime.unlocks.hubStructures),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L327 `unlockedEnvTags: new Set(runtime.unlocks.envTags),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L328 `unlockedHubTags: new Set(runtime.unlocks.hubTags),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L329 `unlockedFeatures: new Set(runtime.unlocks.features),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L330 `unlockedItemTags: new Set(runtime.unlocks.itemTags),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L336 `recipeIds: new Set(),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L337 `hubStructureIds: new Set(),` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L370 `new Set(nodeIds.filter((id) => typeof id === "string" && id.length))` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L371 `).sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.

### src/model/starter-boot-profile.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 62.
- **JS / CP** L8 `const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP** L53 `const regionById = new Map(mapLab.regions.map((region) => [region.id, region]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L70 `Object.assign(gameSettings.values, {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/state.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 101, 114, 121, 125, 142, 171, 172, 177, 178, 184, 185, 187, 197, 216, 217, 220, 240, 241, 246, 253, 259, 262, 267, 273, 292, 294, 297, 298, 308, 310, 313, 320, 346, 349, 357.
- **CP / JS** Missing continued. Lines 358, 377, 384, 405, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 426, 427, 429, 431, 432, 434, 436, 437, 440, 441, 442, 443, 453, 456, 457, 460, 464.
- **CP / JS** Missing continued. Lines 468, 469, 470, 473, 506, 507, 526, 527, 541, 545, 554, 574, 590, 591, 605, 610, 616, 619, 628, 633, 648, 658, 663, 673, 691, 694, 707, 711, 719, 720, 721, 722, 723, 724, 729.
- **CP / JS** Missing continued. Lines 733, 750, 752, 757, 760, 763, 788, 802, 832, 841, 845, 846, 849, 855, 861, 868, 870, 882, 911, 924, 932, 961, 971, 972, 985, 994.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 246, 273, 292, 294, 297, 298, 310, 313, 346, 349, 461, 462, 463, 469, 470, 485, 486, 487, 488, 489, 568, 569, 573, 584, 585, 586, 587, 607, 610, 627, 628, 632, 633, 656, 658.
- **CP / JS** Number guard continued. Lines 661, 663, 666, 669, 674, 684, 694, 707, 727, 733, 740, 743, 746, 832, 845, 846, 886, 892, 936, 942, 974.
- **CP / JS** L112 `locationNames: { ...DEFAULT_LOCATION_NAMES },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L130 `vassalSeed: (Math.floor(seed) ^ 0x56a55a19) | 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L131 `vassalDevelopmentSeed: (Math.floor(seed) ^ 0x3d7e10af) | 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L132 `vassalLifeMapSeed: (Math.floor(seed) ^ 0x19a7c4e3) | 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L133 `vassalPortraitSeed: (Math.floor(seed) ^ 0x2f6e2b1d) | 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L250 `total += weight;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L273 `col: Number.isFinite(anchor?.col) ? Math.floor(anchor.col) : 0,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L275 `ordered.sort((a, b) => (a.col - b.col) || (a.index - b.index));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L293 `? Math.floor(state.rng.baseSeed)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L295 `? Math.floor(state.rng.seed)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L297 `const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L299 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L301 `let seed = baseSeed | 0;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L302 `seed = Math.imul(seed ^ (year + 0x9e3779b9), 0x85ebca6b);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L303 `seed = Math.imul(seed ^ (seasonIndex + 0x7f4a7c15), 0xc2b2ae35);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L304 `return seed | 0;` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul.
- **CP / JS** L311 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L313 `const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L347 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L349 `year: Number.isFinite(state?.year) ? Math.floor(state.year) : 1,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **JS / CP** L409 `const clean = JSON.parse(JSON.stringify(state));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L434 `for (const inv of Object.values(local.ownerInventories ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L511 `for (const child of Object.values(value)) freeze(child);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L516 `|| (Object.isFrozen(value) && Object.values(value).every(isDeepFrozen));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L525 `const raw = typeof data === "string" ? JSON.parse(data) : data;` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **JS / CP** L530 `const key = JSON.stringify(rawConfig);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L541 `const state = deepCloneSerializable({ ...raw, gameConfig: undefined });` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L550 `const raw = typeof data === "string" ? JSON.parse(data) : data;` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L570 `? Math.floor(state.rng.baseSeed)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L574 `state.rng.baseSeed = Math.floor(state.rng.seed ?? 123456789);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L610 `const id = Number.isFinite(entry?.id) ? Math.floor(entry.id) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L611 `if (id > maxEventId) maxEventId = id;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L629 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L634 `? Math.floor(state.year)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L646 `for (const [aggregateKey, rawRun] of Object.entries(local.activeEnvEventRuns)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L650 `normalizedRuns[String(aggregateKey)] = {` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L655 `: String(aggregateKey),` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L657 `? Math.floor(rawRun.sourceYear)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L659 `? Math.floor(state.year)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L662 `? Math.floor(rawRun.sourceSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L664 `? Math.floor(state.currentSeasonIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L667 `? Math.max(0, Math.floor(rawRun.firstDrawSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L670 `? Math.max(1, Math.floor(rawRun.cardsDrawn))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L675 `? Math.max(0, Math.floor(rawRun.expiresSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L685 `? Math.floor(state.nextFollowerCreationOrderIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L697 `Math.floor(pawn.followerCreationOrderIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L734 `? Math.floor(anchor.instanceId)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L736 `if (id > maxEnvStructureId) maxEnvStructureId = id;` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L771 `? Math.max(0, Math.floor(state.apCapOverride.cap))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L775 `? Math.floor(state.apCapOverride.points)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L789 `const skillCapBonus = Math.floor(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L798 `for (const inv of Object.values(local.ownerInventories)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L832 `const cols = Number.isFinite(board.cols) ? Math.floor(board.cols) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L853 `const col = Math.floor(pawn.hubCol);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L859 `const col = Math.floor(pawn.envCol);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L890 `const col = Math.floor(rawCol);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L896 `const span = Math.floor(rawSpan);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L940 `const col = Math.floor(rawCol);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L946 `const span = Math.floor(rawSpan);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L974 `if (!Number.isFinite(structure.col) || Math.floor(structure.col) !== col) {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L985 `Object.keys(gameState).forEach((k) => delete gameState[k]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L986 `Object.assign(gameState, loaded);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L994 `Object.keys(gameState).forEach((k) => delete gameState[k]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L995 `Object.assign(gameState, stateObj);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/state/board-legacy.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 42, 43, 52, 65, 67, 72, 90, 104, 108, 148, 155, 158, 162, 183, 184, 185, 190, 191, 192, 199, 233, 242, 246, 257, 265, 272, 284, 315, 337, 351, 353, 362, 377, 387, 401.
- **CP / JS** Missing continued. Lines 402, 407, 448, 450, 456, 465, 515, 518, 521, 527, 538, 545.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 62, 148, 183, 190, 223, 229, 265, 377, 381, 465, 468.
- **CP / JS** L62 `const safeCols = Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : HUB_COLS;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L115 `return { ...DEFAULT_LOCATION_NAMES };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L149 `? Math.max(0, Math.floor(local.board.cols))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L183 `const col = Number.isFinite(envCol) ? Math.floor(envCol) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L190 `const col = Number.isFinite(envCol) ? Math.floor(envCol) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L223 `Number.isFinite(hub.cols) && hub.cols > 0 ? Math.floor(hub.cols) : HUB_COLS` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L229 `Number.isFinite(hub.cols) && hub.cols > 0 ? Math.floor(hub.cols) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L266 `? Math.floor(def.defaultSpan)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L286 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L349 `for (const [systemId, spec] of Object.entries(systems)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L378 `? Math.floor(def.defaultSpan)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L381 `Number.isFinite(span) && span > 0 ? Math.floor(span) : fallbackSpan;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L466 `? Math.floor(def.defaultSpan)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L557 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **JS / CP** L574 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.

### src/model/state/pawn-legacy.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 50, 51, 75, 81, 84, 86, 87, 88, 89, 90, 95, 96, 97, 98, 100, 101, 145, 146, 147, 148, 153, 162, 168, 213, 215, 222, 229, 237.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 56, 79, 82, 87, 88, 122, 138, 141, 142, 143, 144, 198, 201, 216, 218, 224, 225.
- **CP / JS** L57 `? Math.max(0, Math.floor(ai.suppressAutoUntilSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L80 `? Math.floor(fallback.hubCol)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L83 `? Math.floor(fallback.envCol)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L87 `const hubCol = Number.isFinite(value?.hubCol) ? Math.floor(value.hubCol) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L88 `const envCol = Number.isFinite(value?.envCol) ? Math.floor(value.envCol) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L108 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L116 `out.sort((a, b) => a.localeCompare(b));` Locale-dependent total preorder for valid strings. Pin collation for JS comparisons and preserve ties. Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L123 `? Math.max(0, Math.floor(pawn.skillPoints))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L145 `const deposits = Math.max(0, Math.floor(pawn.prestigeCapBaseFromDeposits ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L146 `const bonus = Math.max(0, Math.floor(pawn.prestigeCapBonus ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L147 `const base = Math.max(0, Math.floor(pawn.prestigeCapBase ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L148 `const debt = Math.max(0, Math.floor(pawn.prestigeCapDebt ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L153 `pawn.workerCount = Math.max(0, Math.floor(pawn.workerCount ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L199 `? Math.max(0, Math.floor(existing.eatStreak))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L202 `? Math.max(0, Math.floor(existing.decayElapsedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L219 `? Math.floor(fallbackOrderIndex)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/structure-layout.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5, 14, 38, 39, 42, 43, 46, 75, 81, 90, 95, 109, 115.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 22, 24, 55.
- **CP** L17 `const ids = new Set(), cells = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L24 `if (placement.origin !== index || !Number.isInteger(placement.width) || placement.width < 1 || placement.width > 3 || ind…` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L44 `const { tier: _obsoleteTier, ...structureEntry } = entry;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L45 `const placement = { ...structureEntry, origin, width,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L49 `slots.splice(0, slots.length, ...result.slots);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L55 `if (!Number.isInteger(width) || width < 1 || width > 3 || !Number.isInteger(origin) || origin < 0 || origin + width > slo…` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L56 `const overlaps = [...new Set(occupiedCells(slots).slice(origin, origin + width).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L67 `const result = canPlace(slots, width, origin, { ...options, allowDemolition });` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L68 `if (result.ok) return { ...result, origin };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L75 `return slots.map(p => p && !placementIds.includes(p.placementId) ? { ...p } : null);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L83 `next[placement.origin] = { ...placement, ...(placement.construction ? {construction:{...placement.construction}} : {}) };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L90 `let slots = confirmed.map(p => p ? { ...p } : null);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L92 `const latestEdits = new Map(edits.map(edit => [edit.placementId, edit.origin]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L96 `const placement = latestEdits.has(action.placementId) ? {...action, origin:latestEdits.get(action.placementId)} : action;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L103 `const pool = [...confirmed.filter(Boolean), ...actions];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L110 `const result = applyBuild(slots, {...piece, origin:edit.origin}, {allowDemolition:true, stagedIds});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/structure-reading.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 18, 19, 20, 21, 22, 25, 26, 33, 36, 45, 52, 53, 68, 70, 72, 74, 79, 87, 90, 91, 99, 100, 101, 106, 107, 109, 111, 112.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 88.
- **CP / JS** L4 `const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L5 `const fmt = value => String(Math.round(value * 100) / 100);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L45 `capacity: mod.query?.traitsAny?.length && Object.keys(mod.query).every(key=>['traitsAny','stockedTraitsAny','unique'].inc…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L83 `const amount = Math.floor(def.housing * factor);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L101 `const payments=[...(support.consume??[]).map(c=>'Consume ${c.amount} ${c.traits.join(' or ')} Stock'),...(support.require…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map-generator.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 58, 109, 128, 157, 174, 193, 223, 229, 230, 236, 263, 270, 280, 281, 292, 302, 323, 329, 342, 344, 349, 369, 376, 382, 386, 408, 411, 450, 452, 463, 477, 498, 510, 511.
- **CP / JS** Missing continued. Lines 512, 513, 514, 515, 516, 519, 520, 521, 525, 526, 531, 532, 538, 539, 542, 543, 548, 549, 551, 560, 563, 565, 568, 569, 574, 583, 590, 599, 620, 621, 624, 625, 626, 627.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 38, 39, 41, 42, 44, 46, 48, 58, 79, 83, 87, 88, 92, 96, 99, 120, 501, 513, 531, 532.
- **JS / CP** L16 `const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L38 `laneCount: Number.isFinite(source.laneCount) ? Math.floor(source.laneCount) : fallback.laneCount,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L40 `? Math.floor(source.normalDepthCount) : fallback.normalDepthCount,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L41 `routeCount: Number.isFinite(source.routeCount) ? Math.floor(source.routeCount) : fallback.routeCount,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L43 `? Math.floor(source.earlyDepthCount) : fallback.earlyDepthCount,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L45 `? Math.floor(source.midDepthCount) : fallback.midDepthCount,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L47 `? Number(source.layoutSmoothing) : fallback.layoutSmoothing,` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L49 `? Number(source.minimumNodeGap) : fallback.minimumNodeGap,` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L50 `nonRepeatFamilyIds: [...new Set(Array.isArray(source.nonRepeatFamilyIds)` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L54 `weights: Object.fromEntries(BANDS.map((band) => [` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L56 `Object.fromEntries(VASSAL_NORMAL_NODE_FAMILY_IDS.map((familyId) => [` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L59 `? Number(source.weights[band][familyId]) : fallback.weights[band][familyId],` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L89 `&& value.earlyDepthCount + value.midDepthCount >= value.normalDepthCount) {` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L105 `|| new Set(value.nonRepeatFamilyIds).size !== value.nonRepeatFamilyIds.length) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L115 `for (const familyId of Object.keys(weights)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L196 `function rollFamily(rng, weights, excluded = new Set()) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L199 `const total = candidates.reduce((sum, id) => sum + weights[id], 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L216 `const signatures = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L220 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L229 `.map((edge) => signatures.get(edge.toNodeId) ?? edge.toNodeId).sort();` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP** L234 `const entrySignatures = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L241 `const reachable = new Set(retainedEntries);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L259 `const entries = nodes.filter((node) => node.depth === depth).sort((a, b) => a.lane - b.lane);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L277 `const parents = new Map(nodes.map((node) => [node.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L278 `const children = new Map(nodes.map((node) => [node.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L283 `const nodeById = new Map(nodes.map((node) => [node.id, node]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L294 `const mean = linked.reduce((sum, value) => sum + value, 0) / linked.length;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L304 `const mean = linked.reduce((sum, value) => sum + value, 0) / linked.length;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L311 `const { _baseY, _y, ...clean } = node;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L315 `x: Math.round(((node.depth-minDepth) / (maxDepth-minDepth)) * 1000000) / 1000000,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L316 `y: node.milestoneId || node.bookend ? 0.5 : Math.round(_y * 1000000) / 1000000,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L324 `stockOutputs = getVassalStockOutputIds(Object.values(detailedSettlementPracticeDefs).filter(def => def.pool === "common" …` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L339 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L341 `const existingEdgeKeys = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L364 `const occupied = new Set(routeTraces.flatMap((path) =>` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L366 `const nodeId = (depth, lane) => 'life-d${String(depth + 1).padStart(2, "0")}-r${String(lane + 1).padStart(2, "0")}';` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L367 `let nodes = [...occupied].map((key) => {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L370 `}).sort((a, b) => a.depth - b.depth || a.lane - b.lane);` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L375 `const incoming = new Map(nodes.map((node) => [node.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L377 `const nodeById = new Map(nodes.map((node) => [node.id, node]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L381 `const excluded = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L382 `for (const parentId of incoming.get(node.id) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L424 `const outputPool = [...new Set(stockOutputs)].filter(canUseOutput).sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L429 `const unmet = [...new Set(unmetStockOutputs)].filter(canUseOutput).sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L454 `edges = deduped.edges.sort((a, b) =>` From ID then to ID via default collation. Comparator can tie equivalent strings; retain original edge order.
- **CP / JS** L455 `a.fromNodeId.localeCompare(b.fromNodeId) || a.toNodeId.localeCompare(b.toNodeId));` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L507 `const ids = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L508 `const nodeById = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L514 `if (![...VASSAL_NORMAL_NODE_FAMILY_IDS.filter(id=>id!=='specialRelic'), ...Object.keys(VASSAL_FOUNDING_OPTIONS), "legacy"…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L536 `const edgeKeys = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L609 `const reachable = new Set(graph.entryNodeIds);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/vassal-life-map/campaign.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 16, 21, 59, 60, 61, 62, 63, 78, 81, 91, 93, 128, 129, 135, 136, 137, 138, 142, 143, 147, 150, 155.
- **CP** L16 `const reachable=new Set(stockProviderSlots(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,false,{ben…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L20 `const warriors = state.rulesetId?sites.reduce((n,s)=>n+availableDetachment(state,s.regionId),0):sites.reduce((sum,site) =…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L21 `.reduce((n,cohort) => n + (cohort.specialists?.warrior?.adults ?? 0),0),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L22 `const arms = sites.reduce((sum,site) => sum + stockTotal(state,site.detailedState,'Arms'),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L23 `return Object.fromEntries(['attack','duel','quest'].map(mode => {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L35 `const baseRisk = Math.min(100,Math.round(defense/Math.max(1,forces[mode].total+defense)*100));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L96 `state.civilization.research.total += option.defense*3;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L110 `if (reward) nodeState.rewardAcquisition={...reward,id:'campaign-reward',phaseCost:option.phaseCost,effects:[],immediateDe…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L127 `const allTargets=buildCampaignOptions(state,vassal,nodeState).filter(option=>option.mode).map(option=>({...option,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L135 `const targets=allTargets.filter(target=>target.mode===option.id), priced=selected?.mode===option.id?selected:targets.filt…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L136 `return {...option,cost:priced?.cost??0,phases:priced?.phases??0,foodCost:priced?.foodCost??0,monsterPressureCost:priced?.…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L150 `const reachable=[...new Set(stockProviderSlots(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,false,…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L153 `for(const id of reachable){` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L161 `writePopulationBins(target,[...populationBins(target),...troops.map(b=>({...b,classId:'stranger'}))]);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/class-actions.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 30, 33, 42, 48, 51, 52, 54, 60, 64, 68, 82, 85, 100, 101, 114, 121, 124, 126, 127, 138, 149, 150.
- **CP / JS** L60 `const previewBonus=Math.min(3,(settlement?.previewBonus??0)+structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind=…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L114 `state.civilization.research.total+=action.research+VASSAL_CLASS_RULES.scholar.discoveryResearchPerPoint*Math.max(0,getVas…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L128 `state.civilization.research.total+=action.difficulty*3;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L143 `state.civilization.research.total+=monster.defense;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/vassal-life-map/class-rules.js

- **CP / JS** L8 `const base = Math.max(0, Math.min(1, Number(baseDeathChance) || 0));` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L17 `const guaranteed = Math.floor(chance);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/vassal-life-map/commissions.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 13, 14, 15, 19, 22, 42, 47, 49, 53, 59, 69, 80, 85, 89, 93, 97, 99, 100, 108, 115, 127, 135.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 131, 132, 133.
- **CP / JS** L14 `const permanentStat = (vassal, statId) => Math.max(0, Math.floor(vassal.stats?.[statId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L15 `const tags = definitions => [...new Set(definitions.flatMap(def => def.tags ?? []))].sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L18 `const reachable = new Set(getVassalLifeMapReachableNodeIds(vassal));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L24 `const structures = Object.keys(settlementStructureDefs).map(id => getDetailedStructureDef(state, id)).filter(unlocked);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L26 `const destinations = new Set(buildCrossroadsOptions(state, vassal).map(option => option.locationRegionId).filter(Boolean));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L33 `if (def.parameter === 'nodeFamily') return [...new Set(context.nodes.map(node => node.family))]` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L34 `.filter(family => VASSAL_NODE_FAMILIES[family]).sort().map(nodeFamily => ({ nodeFamily }));` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L52 `const selected = shuffle(state, pool).sort((a, b) => recent.lastIndexOf(a.def.id) - recent.lastIndexOf(b.def.id)).slice(0…` Recency rank after shuffle. Equal ranks keep the shuffled order.
- **CP / JS** L61 `return { ...def, ...target, ...labels, ...offerText(def, { ...target, ...labels }),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L71 `vassal.commission = { ...offer, acceptedSec: state.tSec, progress: 0,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L93 `goal.progress = Math.min(goal.amount, goal.progress + Math.max(0, Math.floor(event.amount ?? 0)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L129 `|| new Set(offers.map(offer => offer.id)).size !== offers.length) errors.push('invalid Commission offers');` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/vassal-life-map/heirlooms.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 20, 35, 43, 48, 49, 54, 59, 66, 78, 80, 88, 95, 102, 106, 128, 129, 130, 131, 132, 133, 134, 135, 174, 175, 205, 208, 214, 257, 276, 283, 286, 287, 309, 310, 314.
- **CP / JS** Missing continued. Lines 331, 343, 352, 368, 369, 370, 382, 396, 399, 400, 409, 412, 421, 430, 431, 433, 436, 463, 467, 475, 483, 498, 507, 512, 529, 532, 533.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 136, 139, 144, 149, 154, 159, 263, 504.
- **JS / CP** L17 `const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L20 `return Array.from({ length: Math.max(0, Math.floor(count ?? 0)) }, () => null);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L59 `const idNumber = Math.max(1, Math.floor(lineage?.nextHeirloomInstanceId ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L91 `effects: { ...def.effects },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L107 `return new Set(collectOwnedItems(state, vassal).map((item) => item.definitionId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L130 `mods.patronageNodePrestige += Math.max(0, Math.floor(effects.patronageNodePrestige ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L131 `mods.nodeDevelopment += Math.max(0, Math.floor(effects.nodeDevelopment ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L132 `mods.crossroadsNodeDevelopment += Math.max(0, Math.floor(effects.crossroadsNodeDevelopment ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L133 `mods.bonusCunning += Math.max(0, Math.floor(effects.bonusCunning ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L134 `mods.bonusIntelligence += Math.max(0, Math.floor(effects.bonusIntelligence ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L135 `mods.extraShopOffers += Math.max(0, Math.floor(effects.extraShopOffers ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L190 `const present = new Set(eligible.map((def) => def.quality));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L194 `const total = weights.reduce((sum, value) => sum + value, 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L207 `let roll=state.rngNextVassalFloat()*eligible.reduce((sum,row)=>sum+row.weight,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L257 `? Math.max(0, Math.floor(getEquippedHeirloomModifiers(vassal).extraShopOffers ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L271 `civilization: { ...state.civilization, vassalLineage: { ...lineageOf(state) } },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L295 `const replaceIndex = Math.floor(acquire.replaceEquippedIndex);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L331 `const replaceIndex = Math.floor(acquire.replaceCarryIndex ?? acquire.discard?.index);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L359 `const collected = [...inventory.equipped, ...inventory.carry].filter(Boolean);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L387 `const combined = [...vaultItems, ...survivors];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L412 `const wanted = [...new Set((keepInstanceIds ?? []).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L416 `const byId = new Map(pending.map((item) => [item.instanceId, item]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L436 `const selected = [...new Set((equippedInstanceIds ?? []).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L441 `const byId = new Map(vault.map((item) => [item.instanceId, item]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L481 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L519 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L532 `for (const [vassalId, vassal] of Object.entries(lineage?.vassalsById ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/lifecycle/candidates.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 48, 78, 81, 97, 104, 111, 112, 113, 114, 115, 116, 118, 119, 120, 121, 122, 124, 125, 127, 132, 138, 148, 167, 168, 169, 176, 177, 183, 187, 193, 194, 201, 208, 212, 216.
- **CP / JS** Missing continued. Lines 220, 221, 226, 229, 241, 246, 247, 248, 255, 258, 259, 260, 267, 274.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 225.
- **CP** L76 `const usedGroups=new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L79 `const available=Object.values(VASSAL_SIGNATURE_NODE_VARIANTS).filter(v=>lifeMapNodeEnabled(design,'signature:${v.id}',cla…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L83 `let roll=state.rngNextVassalFloat()*pool.reduce((sum,v)=>sum+weight(v),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L85 `usedGroups.add(variant.groupId);return {...clone(variant),variantId:variant.id};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L92 `return { ...clone(VASSAL_SIGNATURE_NODE_VARIANTS[variantId]), variantId };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L103 `const legacyBonus = Math.max(0, Math.floor(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L118 `retired:classHistory.length,commissions:classHistory.reduce((n,v)=>n+(v.completedCommissions??0),0),` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L119 `age:Math.floor(Math.max(0,(state.year??1)-1)/10),chaos:Math.floor((state.civilization.chaos.chaosPower??0)/100),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L122 `knowledgeStructures:new Set((local?.structureSlots??[]).filter(s=>!s?.construction&&getDetailedStructureDef(state,s?.stru…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L124 `const historyBonus=structureModifiers(state,local).filter(m=>m.kind==='historyCandidate').reduce((best,m)=>Math.max(best,…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L125 `(m.sources??['retired','conquests','losses']).reduce((n,key)=>n+(historyValues[key]??0),0)*m.amount)),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L132 `const academyBonus = Math.min(5, institutions.reduce((n,def)=>n+(def.candidateBonus??0),0) + historyBonus + (institutions…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L138 `candidateId: 'candidate-${Math.max(1, Math.floor(lineage.nextVassalId ?? 1))}-${index + 1}',` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L145 `stats: Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L162 `state.civilization.vassalLegacy = { futureStartingPrestigeBonus: 0, futureStartingStatBonuses:Object.fromEntries(VASSAL_S…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L187 `lineage.candidateRerollCount = Math.max(0, Math.floor(lineage.candidateRerollCount ?? 0)) + 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L193 `const generationSeed = Math.floor(state?.rng?.vassalLifeMapSeed ?? 0);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L225 `const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L241 `const idNumber = Math.max(1, Math.floor(lineage.nextVassalId ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L246 `initialAge: Math.max(0, Math.floor(source.age ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L247 `selectedSec: Math.max(0, Math.floor(state.tSec ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L248 `selectedYear: Math.max(1, Math.floor(state.year ?? 1)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/vassal-life-map/lifecycle/node-confirm.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 83, 86, 99, 103, 129, 132, 141, 143, 145, 148, 150, 153, 156, 179, 190, 198, 200, 205, 209, 224, 238, 244, 251, 272, 274, 276, 277, 280, 281, 282, 289, 301, 305, 312, 314.
- **CP / JS** Missing continued. Lines 315, 318, 321, 322, 323, 324, 325, 343, 348, 349, 350, 353, 360, 362, 365, 367, 370, 374, 382, 385, 388, 392, 400, 401, 403, 404, 423, 424, 428, 433, 436, 438, 445, 446, 447.
- **CP / JS** Missing continued. Lines 465, 466, 467, 468, 484, 485, 512, 524, 525, 534, 536, 541, 543, 546, 555, 562, 563, 565, 567, 570, 576, 577, 578, 579, 583, 592, 599, 600, 627, 629, 641, 647, 650, 651, 654.
- **CP / JS** Missing continued. Lines 678, 684.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 283, 286, 287, 353, 360, 365, 385, 428.
- **CP / JS** L94 `nextSlot = {...existing,tier:intervention.resultingTier};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L112 `const option = { ...clone(template), statId, statLabel, label: '${template.label}: ${statLabel}' };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L132 `enteredSec: Math.max(0, Math.floor(state.tSec ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L190 `nodeState.options = nodeState.options.map(({ yearCost, ...option }) => resolveLifeMapOptionCosts(state,nodeState,yearCost…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L191 `? option : { ...option, phaseCost: getVassalYearPhaseCost(state, yearCost) }));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L288 `chaos[effect.key] = Math.floor(Math.min(maximum, Math.max(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L289 `minimum, Math.floor(chaos[effect.key]) + Math.floor(effect.amount ?? 0)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L301 `kind, tSec: Math.max(0, Math.floor(state.tSec ?? 0)), ...extra,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L312 `vassal.endSec = Math.max(0, Math.floor(state.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L322 `finalCunning: Math.max(0, Math.floor(vassal.stats?.cunning ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L323 `finalWisdom: Math.max(0, Math.floor(vassal.stats?.wisdom ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L324 `finalEffectiveness: Math.max(0, Math.floor(vassal.stats?.effectiveness ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L325 `finalIntelligence: Math.max(0, Math.floor(vassal.stats?.intelligence ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L354 `let delta = Math.floor(option.prestigeDelta);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L356 `delta = Math.floor(delta * getEquippedHeirloomModifiers(vassal).patronageOptionMultiplier);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L362 `0, Math.floor(vassal.stats[option.statId] ?? 0) + Math.floor(option.statDelta)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L367 `0, Math.floor(vassal.stats[option.lossStatId] ?? 0) + Math.floor(option.lossStatDelta)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L378 `.sort();` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP / JS** L388 `Math.max(0, Math.floor(legacy.futureStartingPrestigeBonus ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L389 `+ Math.max(0, Math.floor(option.legacyStartingPrestigeBonus))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L446 `let nextId = Math.max(1, Math.floor(vassal.nextDevelopmentChoiceId ?? 1));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L447 `for (let index = 0; index < Math.max(0, Math.floor(count ?? 0)); index += 1) {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L484 `nodeState.resolvedSec = Math.max(0, Math.floor(state.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L577 `.reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), (nodeState?.removalReceipts??[]).reduce((n,r)=>…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L579 `.reduce((sum, purchase) => sum + Math.max(0, purchase.currencyCost ?? 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **JS / CP** L590 `JSON.stringify(settlement.practiceSlots) !== JSON.stringify(validation.reservation.practiceSlots)` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **JS / CP** L591 `|| JSON.stringify(settlement.structureSlots) !== JSON.stringify(validation.reservation.structureSlots));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L627 `const monsterCost=nodeState.purchasedOffers.reduce((sum,purchase)=>sum+(purchase.monsterPressureCost??0),(nodeState.remov…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L635 `nodeState.accumulatedPhaseCost += emptyCost;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L651 `if (relicPhaseCost != null) optionResult = { ...optionResult, phaseCost: relicPhaseCost };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L652 `nodeState.accumulatedPhaseCost += optionResult.phaseCost;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L654 `nodeState.confirmedSec = Math.max(0, Math.floor(state.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L656 `+ Math.max(0, Math.floor(nodeState.accumulatedPhaseCost)) * getMoonPhaseDurationSec(state);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L659 `resolveSec, phaseCost: Math.max(0, Math.floor(nodeState.accumulatedPhaseCost)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L669 `nodeState.confirmedSec=Math.floor(state.tSec);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L684 `vassal.stats[statId] = Math.max(0, Math.floor(vassal.stats[statId] ?? 0)) + 1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/vassal-life-map/lifecycle/step.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 33, 34, 43, 44, 50, 51, 55, 56, 57, 59, 60, 66, 67, 78, 95, 96, 98, 103, 106, 107, 109, 114, 115, 118, 120, 121, 122, 125, 128, 129, 132, 133, 138, 139, 146.
- **CP / JS** Missing continued. Lines 147, 152, 154, 156, 160, 161, 162, 164, 169, 170, 171, 176, 187, 194, 195, 200, 201, 205, 206, 211, 216.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 71, 74, 121, 122, 125, 133, 149, 150, 192, 200, 201, 202, 215, 216, 226, 228.
- **CP / JS** L34 `if (!vassal || !pending || Math.floor(tSec ?? 0) < Math.floor(pending.resolveSec ?? 0)) {` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L39 `return { ...completeNodeResolution(state, vassal, nodeState), resolved: true };` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L93 `const groups = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L118 `for (const [vassalId, vassal] of Object.entries(lineage.vassalsById ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L140 `|| offered.length !== 3 || new Set(offered).size !== 3` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L171 `...Object.keys(vassal?.lifeMap?.nodeStates ?? {}),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L176 `for (const [nodeId, nodeState] of Object.entries(vassal?.lifeMap?.nodeStates ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **JS / CP** L194 `|| JSON.stringify(purchases.map(p => p?.offerId)) !== JSON.stringify(nodeState.purchasedOfferIds)` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP** L195 `|| new Set(purchases.map(p => p?.offerId)).size !== purchases.length) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/vassal-life-map/multiplier-preview.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 10, 16, 17, 28, 35, 38, 43, 45.
- **CP / JS** L12 `const settlement = {...site.detailedState,...slots};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L13 `const projected = {...state,world:{...state.world,sites:state.world.sites.map(s => s === site ? {...s,detailedState:settl…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L19 `const mark=pool=>({...pool,sources:pool.sources.map(source=>({...source,pending:predict&&!!source.instanceId&&completeIds…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L24 `const completed = {...after,structureSlots:after.structureSlots.map(slot => {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L26 `const {construction,...finished} = slot; return finished;` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L35 `introduced??=read({...after,structureSlots:before.structureSlots});` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L38 `return {...row,before:baseline??null};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L44 `const result = multiplierBoardPreview(state,regionId,before,reservation,[...stagedIds,...(action.kind==='structure'?[plac…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L46 `return {...result,kind:action.kind,rows:result.rows.filter(row => action.kind === 'practice' ? row.practiceId === action.…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/presentation.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 54, 58, 62, 63, 64, 70, 73, 74, 82, 83, 84, 85, 86, 89, 92, 95, 101, 103, 114, 115, 117, 120, 121, 123, 124, 125, 132, 133, 135, 136, 138, 142, 148, 149, 155.
- **CP / JS** Missing continued. Lines 156, 158, 161, 165, 167, 168, 173, 174, 176, 178, 181, 183, 203, 205, 207, 212, 214, 216, 217, 221, 222, 229, 233, 235, 241, 243, 264, 275, 277, 278, 279, 280, 281, 282, 283.
- **CP / JS** Missing continued. Lines 284, 285, 287, 289, 291, 293, 295, 302, 305, 308, 310, 311, 313, 314, 315, 317, 323, 325, 327, 328, 329, 330, 331, 332, 333, 334, 339, 341, 345, 349, 351, 354, 364, 367, 368.
- **CP / JS** Missing continued. Lines 370, 372, 375, 378, 379, 380, 381, 384, 385, 386, 387, 388, 389, 391, 392, 394, 400, 401, 402, 404, 405, 406, 410, 415, 427, 436, 439, 443, 445, 446, 449, 450, 452, 454, 456.
- **CP / JS** Missing continued. Lines 458, 460, 467, 474, 475.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 227, 233, 409.
- **CP / JS** L54 `const text = String(value ?? "");` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L55 `return text ? '${text[0].toUpperCase()}${text.slice(1)}' : "";` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP** L82 `const order = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L83 `const adjacency = new Map((definition?.regions ?? []).map((region) => [region.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L88 `for (const neighbours of adjacency.values()) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L89 `neighbours.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L92 `const previous = new Map([[startId, null]]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L95 `for (const next of adjacency.get(current) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L135 `...[...(nodeState.inventory ?? []), ...(nodeState.purchasedOffers ?? [])]` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L141 `const includedIds = new Set([` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L148 `const regionOrder = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L165 `const actualKeys = new Set((state?.world?.connections ?? []).map((edge) =>` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L167 `const stagedByKey = new Map((nodeState.purchasedOffers ?? [])` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L177 `const candidateEdges = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L188 `const connections = [...candidateEdges.entries()].filter(([, edge]) =>` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L206 `regions: regions.sort((left, right) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L222 `let delta = Math.floor(option.prestigeDelta ?? 0);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L224 `delta = Math.floor(delta * getEquippedHeirloomModifiers(vassal).patronageOptionMultiplier);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L229 `0, Math.floor(immediate.stats[option.statId] ?? 0) + Math.floor(option.statDelta)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L235 `0, Math.floor(immediate.stats[option.lossStatId] ?? 0) + Math.floor(option.lossStatDelta)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L257 `earnedLevelCount: Math.floor(completionExpTotal / VASSAL_LIFE_TUNING.developmentThreshold),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L272 `return {...getVassalNodeDecisionPresentation(result.ok ? isolated : state, nodeId), draftPreview: result};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L280 `.reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), (nodeState?.removalReceipts??[]).reduce((n,r)=>…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L282 `.reduce((sum, purchase) => sum + Math.max(0, purchase.currencyCost ?? 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L293 `const accumulatedPhaseCost = Math.max(0, Math.floor(nodeState?.accumulatedPhaseCost ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L302 `state, vassal, Math.floor(state.tSec ?? 0) + totalPhaseCost * getMoonPhaseDurationSec(state)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L320 `const tableauState = previewSite ? {...state,world:{...state.world,sites:state.world.sites.map(site=>site===previewSite?{…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L330 `return { ...slot, staged: !!purchase, offerId: purchase?.offerId ?? null,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L344 `const currencyCost = purchased ? offer.currencyCost : Math.max(0, Number(offer.baseCurrencyCost) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L349 `return {...validatePurchaseInterventions(state, vassal, [{ ...offer, ...(prepared.placement ? { placement: prepared.place…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L370 `intervention.tier, { ...intervention, construction: { completedCycles: 0 } }) : null,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L381 `const worldOptions = (nodeState?.options ?? []).map(option=>({...clone(option),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L383 `...(option.randomReward?{randomReward:{...option.randomReward,relicChance:100*option.randomReward.relicChance}}:{}),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L399 `node:acquiring?{...node,family:'relic'}:node,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L406 `nodeState: nodeState ? {...clone(nodeState), ...(acquiring?{family:'relic',selectedOptionId:nodeState.rewardAcquisition.i…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L409 `return {...clone(option), ...(bonus ? {riskPrestigeBonus:bonus} : {}), ...(Number.isFinite(option.immediateDeathChance) ?…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L415 `stagedMonsterPressureCost:[...(nodeState?.purchasedOffers??[]),...(nodeState?.removalReceipts??[])].reduce((n,r)=>n+(r.mo…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L443 `demolishedStructures: (projected?.structures?.demolished ?? []).map(slot => ({ ...slot,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/relic-pools.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 11, 12, 13, 14, 15.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 8.
- **CP / JS** L13 `for(const id of Object.keys(pools??{}))if(!RELIC_POOL_IDS.includes(id))errors.push('design.relicPools.${id}: unknown pool');` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L14 `for(const quality of Object.keys(pools?.relic?.qualities??{}))if(!VASSAL_HEIRLOOM_QUALITIES.includes(quality))errors.push…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L15 `for(const id of Object.keys(pools?.specialRelic?.entries??{}))if(!VASSAL_HEIRLOOM_DEFS[id])errors.push('design.relicPools…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L22 `const excluded=new Set(excludedIds),pool=design.relicPools[poolId];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L25 `return {...def,enabled:rule.enabled,weight:rule.weight,owned:excluded.has(id),available:rule.enabled&&!excluded.has(id),c…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L30 `const total=qualities.reduce((sum,quality)=>sum+pool.qualities[quality].weight,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L33 `const total=eligible.reduce((sum,row)=>sum+row.weight,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/vassal-life-map/selectors.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 17, 19, 34, 35, 36, 40, 41, 42, 47, 52, 57, 59, 61, 62, 65, 66, 68, 71, 75, 79, 83, 87, 94, 95, 96, 114, 125, 129, 135, 144, 148, 149, 157, 158, 166.
- **CP / JS** Missing continued. Lines 167, 172, 177, 178, 191, 193, 199, 209, 210, 216, 217, 218, 219, 223, 226, 229, 230, 232, 234, 235, 238, 247, 248, 252, 253, 254, 258, 262, 266, 267, 274, 275, 276, 277, 281.
- **CP / JS** Missing continued. Lines 288, 289, 292, 293, 294, 301, 309, 313, 314, 324, 325, 329, 334, 344, 345, 349, 354, 360, 363, 364, 371, 383, 406, 418, 430, 445, 456, 462, 463, 474, 484, 489, 493, 494, 495.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 19, 227, 232, 248, 254, 275, 291, 352, 361, 467.
- **JS / CP** L14 `export const clone = (value) => JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L20 `? Math.max(1, Math.floor(state.seasonDurationSec)) : 8;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L93 `const outgoing = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L100 `for (const list of outgoing.values()) list.sort();` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L105 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L114 `for (const next of outgoing.get(current) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L125 `const previous = new Map([[fromId, null]]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L129 `for (const next of outgoing.get(current) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L157 `const pins = [...new Set((pinnedNodeIds ?? []).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L161 `const reachFromPin = new Map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L164 `const ordered = [...pins].sort((left, right) => {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L168 `return left.localeCompare(right);` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L177 `?? starts.filter((id) => collectReachable(outgoing, [id]).has(firstPin)).sort()[0];` Default UTF-16 lexical total preorder. Preserve stable ties.
- **CP** L199 `const current = [...new Set((pinnedNodeIds ?? []).filter(Boolean))];` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L228 `? Math.max(0, Math.floor(tSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L229 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L233 `? Math.max(0, Math.floor(vassal.selectedSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L238 `selectedSec >= Math.max(0, Math.floor(selected.selectedSec ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L249 `return Math.max(0, Math.floor(nodeState.confirmedSec));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L256 `return Math.max(0, Math.floor(vassal.endSec));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L266 `for (const nodeId of Object.keys(vassal?.lifeMap?.nodeStates ?? {})) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L275 `const safeTSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : null;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L291 `const atSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L292 `: Math.max(0, Math.floor(state?.tSec ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L293 `return Math.max(0, Math.floor(current.initialAge ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L294 `+ Math.max(0, Math.floor((atSec - Math.floor(current.selectedSec ?? 0)) / getYearDurationSec(state)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L299 `return Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L301 `Math.max(0, Math.floor(vassal?.stats?.[statId] ?? 0))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L309 `+ (getVassalStatDefinition(vassal, 'cunning').id === 'ingenuity' ? 0 : Math.max(0, Math.floor(getVassalEffectiveStats(vas…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L313 `const wisdom = Math.max(0, Math.floor(getVassalEffectiveStats(vassal).wisdom ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L315 `return VASSAL_LIFE_TUNING.baseDevelopmentIncome + Math.floor(wisdom * multiplier);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L321 `return Math.floor(population/TERRITORIAL_PRESTIGE_POPULATION_PER_POINT);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L326 `const population=populationBins(settlement).reduce((total,bin)=>total+bin.count,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L332 `prestige: Math.round(getVassalPrestigeIncome(vassal)` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L334 `+ (state?.rulesetId ? getPlayerDetailedSites(state).reduce((total,site)=>total+getRegionPrestigePerNode(state,site.region…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L353 `? Math.max(0, Math.floor(valueOverride))` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L354 `: Math.max(0, Math.floor(effective[statId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L357 `const pointsToCap = Math.max(0, Math.ceil(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L360 `const baseValue = Math.max(0, Math.floor(vassal?.stats?.[statId] ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L363 `if (definition.id === 'ingenuity') return { ...definition, value, powerLabel: '${Math.round(value * VASSAL_CLASS_RULES.sc…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L364 `if (definition.id === 'prowess') return { ...definition, value, powerLabel: '+${value} Martial Force', formula: 'Global M…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L386 `const percent = Math.round(discount * 100);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L391 `formula: '${Math.round(VASSAL_LIFE_TUNING.discountPerStat * 100)}% per point · ${Math.round(cap * 100)}% cap · costs roun…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L393 `multiplier: Math.round((1 - discount) * 100) / 100,` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L402 `const safeBase = Math.max(0, Number(base) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L406 `Math.max(0, Math.floor(stat ?? 0)) * VASSAL_LIFE_TUNING.discountPerStat` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L408 `const result = Math.ceil(safeBase * (1 - discount));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L419 `return Math.max(years > 0 ? 1 : 0, Math.round(` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L432 `cost = Math.max(0, Math.ceil(cost * (1 - discount)));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L442 `cost = Math.max(1, Math.ceil(cost * modifiers.travelCostMultiplier));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L447 `cost = Math.max(1, Math.ceil(cost * modifiers.hourglassFirstActionMultiplier));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L450 `cost = Math.max(1, Math.ceil(cost * modifiers.allTimeCostMultiplier));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L456 `if (!nodeState || !(Math.max(0, Math.floor(phaseCost ?? 0)) > 0)) return;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L463 `let remaining = Math.max(0, Math.floor(phaseCost ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L467 `const years = Number.isInteger(phasesPerYear) ? Math.floor(remaining / phasesPerYear) : 0;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L469 `const moons = Math.floor(remaining / MOON_PHASE_COUNT);` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **JS / CP** L484 `return JSON.stringify(candidates ?? []);` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L493 `poolId: 'life-vassal-${Math.max(1, Math.floor(lineage?.nextVassalId ?? 1))}-reroll-${Math.max(0, Math.floor(lineage?.cand…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L494 `createdSec: Math.max(0, Math.floor(state?.tSec ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L495 `rerollIndex: Math.max(0, Math.floor(lineage?.candidateRerollCount ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L497 `expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _index, ...candidate }) => candidate)),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/shop-specialties.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 12, 13, 17, 22, 28, 33, 42, 49, 50, 51, 52, 53.
- **CP / JS** L24 `const ids = kind === 'practice' ? VASSAL_INTERVENTION_PRACTICE_IDS : Object.keys(settlementStructureDefs);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L35 `categories = [first,...(second ? [second] : [])];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L38 `iconId:kind==='practice'?(tag==='Food'?'stock-edible':'stock-${tag.toLowerCase()}'):{Housing:'housingCapacity',Stock:'sto…` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L52 `const reserved = (nodeState?.purchasedOffers ?? []).reduce((sum,purchase) => sum + purchase.prestigeCost,0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.

### src/model/vassal-life-map/shop.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 55, 56, 59, 61, 62, 63, 64, 68, 70, 71, 73, 76, 82, 91, 93, 95, 96, 108, 111, 113, 118, 123, 132, 137, 138, 139, 162, 168, 171, 174, 193, 201, 202, 212, 213.
- **CP / JS** Missing continued. Lines 223, 226, 227, 229, 243, 245, 247, 248, 249, 254, 257, 264, 268, 269, 272, 276, 281, 282, 291, 296, 304, 306, 311, 314, 323, 324, 328, 330, 331, 332, 333, 338, 342, 347, 348.
- **CP / JS** Missing continued. Lines 349, 351, 352, 355, 357, 360, 362, 367, 370, 372, 388, 396, 399, 401, 421, 431, 435, 436, 451, 457, 460, 463, 465, 483, 487, 488, 496, 505, 506, 507, 508, 509, 510, 511, 512.
- **CP / JS** Missing continued. Lines 513, 514, 515, 516, 517, 518, 519, 520, 521, 523, 525, 527, 537, 543, 548, 551, 562, 568, 585, 590, 591, 592, 600, 610, 615, 628, 632, 636, 639, 641.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 323, 361, 366, 391, 545, 561.
- **CP** L42 `export const CARD_SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "neutralMarket", "classMarket", "foodShop", "…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L43 `export const SHOP_FAMILIES = new Set(CARD_SHOP_FAMILIES);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L46 `function qualityLabel(tier) { return '${tier[0].toUpperCase()}${tier.slice(1)}'; }` Specify text ordering/case rules where choices depend on it; exact mode uses JS UTF-16 or baseline collation.
- **CP / JS** L64 `for (const p of purchases.filter(p=>p.intervention?.kind==='practiceSlot').sort((a,b)=>a.intervention.capacity-b.interven…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L73 `const connectionKeys = new Set((state?.world?.connections ?? []).map(edge => getWorldConnectionKey(edge.regionAId, edge.r…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L95 `const reserved = (nodeState.purchasedOffers??[]).reduce((n,p)=>n+(p.prestigeCost??0),0)` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L96 `+ (nodeState.removalReceipts??[]).reduce((n,p)=>n+(p.prestigeCost??0),0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L141 `targetRegionId: vassal.locationRegionId, structureId, tier, ...(qualityBonus ? {qualityBonus} : {}) },` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L156 `const selected = [...specific.slice(0, count - 1), ...common.slice(0, 1)];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L159 `return [...selected, ...remaining.slice(0, count - selected.length)];` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L183 `for (const id of Object.keys(settlementStructureDefs)) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L247 `const roll = Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L281 `if(offer.intervention?.mode==='adopt')return {...offer,inventoryIndex};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L284 `return {...offer,basePhaseCost:costs.phaseCost,basePrestigeCost:costs.prestigeCost,inventoryIndex};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L286 `return {...resolveLifeMapShopPrice(state,offer),inventoryIndex};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L309 `if (String(offerId).startsWith('practice-slot:')) {` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L314 `purchaseSequence:Math.max(0,...nodeState.purchasedOffers.map(p=>p.purchaseSequence??0))+1,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L329 `const currencyCost = Math.max(0, Number(offer.baseCurrencyCost) || 0);` Specify shift masks, signedness and overflow; JS mode uses ToInt32/ToUint32 and imul. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L331 `.reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L333 `.reduce((sum, purchase) => sum + Math.max(0, purchase.currencyCost ?? 0), 0);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L346 `...clone(offer), ...(prepared.placement ? { placement: prepared.placement } : {}), prestigeCost, monsterPressureCost, pha…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L347 `purchaseSequence: Math.max(0,...nodeState.purchasedOffers.map(p=>p.purchaseSequence??0))+1,` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L348 `sourceInventoryRoll: Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L349 `sourceInventoryIndex: Math.max(0, Math.floor(offer.inventoryIndex ?? index)),` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L398 `const kept = new Set(validation.practices.slots.filter(Boolean).map(slot => slot.instanceId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L406 `nodeState.accumulatedPhaseCost += phaseCost;` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L414 `function cancelPracticeDraft(order, purchase, capacity, laterPracticeIds = new Set()) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L431 `const active = new Set((learn ? order.slice(0, capacity) : order).filter(entry => entry != null && entry !== id` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L442 `const fixed = new Map(order.flatMap((entry, index) => laterPracticeIds.has(entry) ? [[index, entry]] : []));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L468 `const laterPracticeIds = new Set(laterPractices.map(p => p.intervention.practiceId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L475 `const historyIds = new Set(laterPractices.filter(p => p.purchaseSequence < remaining.purchaseSequence).map(p => p.interve…` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L493 `const kept = new Set(after.practices.slots.filter(Boolean).map(slot => slot.instanceId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L520 `const originalIndex = Math.max(0, Math.floor(restored.sourceInventoryIndex ?? nodeState.inventory.length));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L524 `nodeState.inventory.sort((left, right) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L525 `Math.floor(left.inventoryIndex ?? 0) - Math.floor(right.inventoryIndex ?? 0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L540 `if (String(offerId).startsWith('practice:')) {` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L561 `const targetIndex = Number.isFinite(toIndex) ? Math.floor(toIndex) : -1;` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L570 `pool.splice(targetIndex, 0, ...pool.splice(at, 1));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L587 `if (String(offerId).startsWith('structure:')) {` Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L590 `if (!projection.ok || ![...projection.structures.slots, ...projection.structures.demolished].some(p => p?.placementId ===…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L601 `const next = nodeState.purchasedOffers.map(p => p === purchase ? { ...p, placement: { ...p.placement, origin } } : p);` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L631 `const kept=new Set(validation.practices.slots.filter(Boolean).map(s=>s.instanceId));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L633 `let available=prestigeAccount(state,vassal).prestige - nodeState.purchasedOffers.filter(p=>p.intervention.kind==='practic…` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP** L634 `const charged=new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L636 `for(const [index,p] of [...cards].sort((a,b)=>(a.purchaseSequence??0)-(b.purchaseSequence??0)).entries()) {` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L643 `Object.assign(p,quote,{removalReceipts:victims.map(s=>({instanceId:s.instanceId,allegiance:s.allegiance,prestigeTax:5,pre…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L648 `return {instanceId:s.instanceId,allegiance:s.allegiance,...quote};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.

### src/model/vassal-life-map/stock-shops.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 13, 20, 25, 28, 31, 33, 39.
- **CP** L26 `const supplied = new Set(getVassalStockOutputIds(installed));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L27 `const missing = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L30 `for (const def of [...installed,...constructionRecipes]) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L31 `for (const input of [...(def.consume ?? []), ...(def.require ?? [])]) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L39 `Object.values(site.detailedState.populationByClass ?? {}).some(cohort => ageCohortTotal(cohort) > 0))) {` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L42 `return { stockOutputs, unclassedStockOutputs, unmetStockOutputs: [...missing].sort() };` Default UTF-16 lexical total preorder. Preserve stable ties. Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.

### src/model/vassal-life-map/treasury.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 4, 10.
- **CP / JS** L10 `const income=Math.max(0,Math.floor(amount??0));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/vassal-life-map/world-choices.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 18, 23, 25, 26, 37, 38, 59, 62.
- **CP** L16 `const queue = [[origin, 0]], seen = new Set([origin]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L27 `return a && b ? Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * Math.sqrt(regions.length))) : regions.length;` Fix portable arithmetic at thresholds. Exact JS mode uses the matching V8 operation. Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP** L41 `const existing = new Set(state.world.connections.map(edge => getWorldConnectionKey(edge.regionAId, edge.regionBId)));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L49 `return [...moves, ...routes, {id:'tour',label:'Tour this region',phaseCost:RULES.tourYears * phasesPerYear(state),` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L56 `const pool = Object.values(VASSAL_HEIRLOOM_DEFS).filter(def => def.quality === 'bronze' && !owned.has(def.id));` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L59 `return {...option,randomReward:null,definitionId:def.id,label:def.label,quality:def.quality,description:def.description,i…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L62 `return {...option,randomReward:null,statId,statDelta:option.randomReward.statDelta};` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L67 `const highest = VASSAL_STAT_IDS.reduce((best, id) => stats[id] > stats[best] ? id : best, VASSAL_STAT_IDS[0]);` Keep input order when floating sums/products can change a threshold; JS exact folds left here unless reduceRight.
- **CP / JS** L70 `{id:'highest-stat',label:'Teach ${label}',description:'Future Vassals start with +${Math.floor(stats[highest]/RULES.legac…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L71 `prestigeCost:0,phaseCost:0,legacyReward:{kind:'stat',statId:highest,amount:Math.floor(stats[highest]/RULES.legacyStatDivi…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L72 `{id:'accumulated-prestige',label:'Leave renown',description:state.rulesetId?'Endow the civilization with ${Math.floor(sta…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
- **CP / JS** L73 `prestigeCost:0,phaseCost:0,legacyReward:{kind:'prestige',amount:Math.floor(prestigeAccount(state,vassal).prestige/RULES.l…` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.

### src/model/world-definitions.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 5.

### src/model/world-state.js

- **CP / JS** Fallback/omission sites. Preserve gameplay distinctions. JS mode specifically distinguishes missing, null, undefined, false and zero according to the operator. Lines 42, 50, 63, 102, 114, 117, 118, 119, 124, 125, 127, 128, 137, 145, 146, 148, 161, 162, 164, 165, 167, 168, 170, 171, 177, 179, 195, 204, 209, 210, 216, 217, 218, 219, 220.
- **CP / JS** Missing continued. Lines 222, 224, 233, 243, 252, 265, 274, 275, 277, 280, 281, 286, 289, 290, 291, 295, 299, 310, 323, 324, 339, 349, 352, 355, 359, 364, 373, 378, 391, 393, 405, 407, 420, 424, 425.
- **CP / JS** Missing continued. Lines 431, 435, 437, 448, 452, 460, 463, 465, 467, 470, 480, 482, 486, 487, 489, 490, 492, 493, 501, 502, 503, 508, 509, 514, 515, 519, 524, 532, 533, 536, 553, 557, 558, 564, 570.
- **CP / JS** Finite/integral/fallback checks and Infinity/NaN sentinels. Give native failures defined handling; preserve JS guard/NaN propagation in exact mode. Lines 33, 167, 182, 216, 217.
- **JS / CP** L29 `return JSON.parse(JSON.stringify(value));` Match JSON snapshot/write semantics for exchange; for native clones define which data survive and avoid copying shared immutable config.
- **CP / JS** L37 `return [String(regionAId), String(regionBId)].sort().join("|");` Default UTF-16 lexical total preorder. Preserve stable ties. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP / JS** L46 `return [String(vertexAId), String(vertexBId)].sort().join("|");` Default UTF-16 lexical total preorder. Preserve stable ties. Keep ID/sentinel conversion deterministic; match JS parser/formatter for interchange.
- **CP** L53 `if (vertexIds.length < 2) return new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L54 `return new Set(vertexIds.map((vertexId, index) => getPolygonEdgeKey(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L64 `const edgeKeysByRegionId = new Map(regions.map((region) => [` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L93 `adjacency = new Map(definition.regions.map(region => [region.id, []]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L99 `for (const neighbours of adjacency.values()) Object.freeze(neighbours);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L114 `const order = new Map((definition?.regions ?? []).map((entry, index) => [entry.id, index]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L123 `.sort((left, right) => {` Authored ranks for both endpoints. Equal/missing ranks preserve input via stable ties.
- **CP** L143 `const connectionKeys = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L189 `const practiceIds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L216 `for (const slot of settlement.practiceSlots ?? []) if (slot && ((gamepieces?.practices?.[slot.practiceId]??detailedSettle…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP / JS** L224 `for (const cohort of Object.values(settlement.populationByClass ?? {})) if (!validSpecialistCohorts(cohort)) errors.push(…` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L239 `const vertexById = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L240 `const regionById = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L268 `validateRegionMechanics({ id: entry.id, ...entry.initialState }, errors, "initial region");` Keep semantic enumeration, overwrite position and insertion order when observable; byte ordering is a codec concern.
- **CP** L271 `const neighbors = new Map(Array.from(regionById.keys(), (id) => [id, new Set()]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L284 `const siteIds = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L305 `const start = regionById.keys().next().value;` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L306 `const visited = new Set([start]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L310 `for (const next of neighbors.get(current) ?? []) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L337 `const indexById = new Map();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L449 `const expectedIds = new Set(definition.regions.map((entry) => entry.id));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L450 `const seen = new Set();` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L457 `for (const id of expectedIds) {` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L460 `validateConnections(state?.world?.connections, new Map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L481 `const order = new Map(definition.regions.map((entry, index) => [entry.id, index]));` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L482 `state.world.regions.sort((a, b) => (order.get(a?.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b?.id) ?? Number.MAX_SAFE_I…` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP / JS** L485 `state.world.sites.sort((a, b) =>` Explicit ranked comparator in source. Stable total preorder for finite keys; equal ranked keys keep input order. Confirm non-finite sentinel handling.
- **CP** L513 `const playerIds = new Set([starterEdge.regionAId, starterEdge.regionBId]);` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L531 `const draftRegionById = new Map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP** L556 `const draftDetailedByRegion = new Map(` Keep insertion order for iteration/retry; if used only for lookup, equality/identity is sufficient.
- **CP / JS** L572 `const capacity = Math.max(0, Math.floor(region.structureCapacity));` Keep discrete thresholds deterministic. Exact mode uses JS floor/ceil/round including negative halves and signed zero.
