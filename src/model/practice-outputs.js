// Non-Stock Practice outputs that reviewed cards may add or remove. Every op
// here is resolved by detailed-settlements/practices.js with only `amount` and
// (where listed) one parameter. Stock production, Chaos and other DSL effects
// stay fixed in their authored order.
// `icon` names the face resource icon used for that output.
export const PRACTICE_OUTPUTS = Object.freeze({
  research:{label:'Research',icon:'research'},
  train:{label:'Specialists trained',param:'classId',choices:['scholar','warrior'],icon:'population'},
  addHousingForPhase:{label:'Housing',icon:'housingCapacity'},
  reduceLocalFoodRequirement:{label:'Edible saved',icon:'food'},
  addFaithChaosResistance:{label:'Chaos resistance',icon:'faith'},
  bankCandidateDevelopment:{label:'Candidate development',param:'classId',choices:['scholar','warrior'],icon:'prestige'},
  bankShopQuality:{label:'Shop quality bonus',param:'classId',choices:['scholar'],icon:'activation'},
  bankSupport:{label:'Support banked',param:'bank',choices:['formation','siege','mobility','coordination','greatHost'],icon:'support'},
  bankPreview:{label:'Preview bonus',icon:'hourglass'},
  boostSeasonalFood:{label:'Seasonal food boost',icon:'food'},
});
// Card faces are laid out for at most three effects.
export const PRACTICE_EFFECT_LIMIT = 3;
const SEASONS = ['spring','summer','autumn','winter'];
const AMOUNT_KEYS = ['amount','seasonAmounts'];
export const isPracticeOutput = effect => Object.hasOwn(PRACTICE_OUTPUTS, effect?.op);
export const practiceOutputKey = effect => `${effect.op}${PRACTICE_OUTPUTS[effect.op]?.param ? `:${effect[PRACTICE_OUTPUTS[effect.op].param]}` : ''}`;
// What a card produces, for filters: Stock, Chaos or the output's label.
export const practiceEffectProduct = effect => effect?.op === 'generateStock' ? 'Stock' : effect?.op === 'addChaos' ? 'Chaos' : PRACTICE_OUTPUTS[effect?.op]?.label ?? null;

const validSeasonAmounts = value => value === undefined || (value && typeof value === 'object' && !Array.isArray(value)
  && Object.entries(value).every(([key,amount])=>SEASONS.includes(key)&&Number.isFinite(amount)));
export function validPracticeOutput(effect) {
  const spec = PRACTICE_OUTPUTS[effect?.op];
  if (!spec || !effect || typeof effect !== 'object' || Array.isArray(effect)) return false;
  if (Object.keys(effect).some(key=>!['op',...AMOUNT_KEYS,...(spec.param?[spec.param]:[])].includes(key))) return false;
  if (!Number.isFinite(effect.amount) || !validSeasonAmounts(effect.seasonAmounts)) return false;
  return !spec.param || spec.choices.includes(effect[spec.param]);
}
// Same structure with numeric leaves free to differ (they are reviewable values).
function sameShape(a, b) {
  if (typeof a === 'number') return Number.isFinite(b);
  if (!a || typeof a !== 'object') return a === b;
  if (!b || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = value => Object.keys(value).filter(key=>key!=='seasonAmounts').sort();
  return JSON.stringify(keys(a)) === JSON.stringify(keys(b)) && keys(a).every(key=>sameShape(a[key],b[key])) && validSeasonAmounts(b.seasonAmounts);
}
// A reviewed effect list keeps every fixed (non-output) effect of `template`
// in order and shape; outputs may be added or removed, one per type.
export function practiceEffectsCompatible(template, effects) {
  if (!Array.isArray(template) || !Array.isArray(effects)) return false;
  if (effects.length > Math.max(PRACTICE_EFFECT_LIMIT, template.length)) return false;
  const fixed = template.filter(effect=>!isPracticeOutput(effect)), kept = effects.filter(effect=>!isPracticeOutput(effect));
  if (fixed.length !== kept.length || fixed.some((effect,index)=>effect.op!==kept[index]?.op||!sameShape(effect,kept[index]))) return false;
  const outputs = effects.filter(isPracticeOutput);
  return outputs.every(validPracticeOutput) && new Set(outputs.map(practiceOutputKey)).size === outputs.length;
}

// Consume/Require lists on scheduled Practices: whole amounts of 0 or more and
// one or more Stock traits (any listed trait can supply the input). Charge
// cards never take Stock inputs. Faces fit three inputs in total.
export const PRACTICE_INPUT_LIMIT = 3;
export function validPracticeInputs(list, traits) {
  return Array.isArray(list) && list.length <= PRACTICE_INPUT_LIMIT && list.every(input=>input && typeof input === 'object' && !Array.isArray(input)
    && Object.keys(input).every(key=>['amount','traits'].includes(key)) && Number.isInteger(input.amount) && input.amount >= 0
    && Array.isArray(input.traits) && input.traits.length > 0 && new Set(input.traits).size === input.traits.length
    && input.traits.every(trait=>trait !== 'Charge' && traits.includes(trait)));
}
