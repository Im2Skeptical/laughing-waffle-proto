import { isFullMapOfferDefinition, FULL_MAP_SUPPLY_DEPENDENCIES } from '../../defs/gamepieces/full-map-defs.js';
import { prestigeAccount } from './treasury.js';
import { VASSAL_WORKSHOP_RULES as RULES } from '../../defs/vassal-workshop-rules.js';
import { VASSAL_INTERVENTION_PRACTICE_IDS, settlementStructureDefs } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { getVassalStockOutputIds, isVassalStockOutputPractice } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../game-config.js';
import { getDetailedPracticeTierIndex } from '../detailed-practice-tiers.js';
import { getResearchUnlockIndex } from '../research-progression.js';
import { getVassalActionPrestigeCost, shuffle } from './selectors.js';

export function structureShopCategory(def) {
  return def.housing || def.tags?.includes('Housing') ? 'Housing'
    : def.modifiers?.some(mod => mod.kind === 'capacity') ? 'Stock' : 'Special';
}

export function matchesPracticeShopSpecialty(def, specialty) {
  if (specialty === 'Food') return def?.tags?.includes('Food') ?? false;
  return isVassalStockOutputPractice(def, specialty);
}

export function createShopSpecialties(state, vassal, nodeState) {
  if (!['practiceReform','publicWorks'].includes(nodeState.family)) return null;
  const kind = nodeState.family === 'practiceReform' ? 'practice' : 'structure';
  const ids = kind === 'practice' ? VASSAL_INTERVENTION_PRACTICE_IDS : Object.keys(settlementStructureDefs);
  const definitions = ids.map(id => kind === 'practice' ? getDetailedPracticeDef(state,id) : getDetailedStructureDef(state,id))
    .filter(def => def && !def.locked && (['common',vassal.classId].includes(def.pool) || state.rulesetId && FULL_MAP_SUPPLY_DEPENDENCIES.includes(def.id))
      && (!state.rulesetId || isFullMapOfferDefinition(def))
      && getDetailedPracticeTierIndex(def.minimumQuality ?? 'bronze') <= Math.min(3,getResearchUnlockIndex(state)+(vassal.discoveryAccess?1:0)));
  let categories = ['Housing','Stock','Special'];
  if (kind === 'practice') {
    const basics = ['Food','Construction','Currency'].filter(tag => definitions.some(def => matchesPracticeShopSpecialty(def,tag)));
    // Edited content can remove every basic; keep a disabled basic rather than advertise an unrelated pool.
    const first = shuffle(state,basics)[0] ?? 'Food';
    const second = shuffle(state,getVassalStockOutputIds(definitions).filter(tag => tag !== first))[0];
    categories = [first,...(second ? [second] : [])];
  }
  const choices = categories.map(tag => ({id:tag,label:tag,
    iconId:kind==='practice'?(tag==='Food'?'stock-edible':`stock-${tag.toLowerCase()}`):{Housing:'housingCapacity',Stock:'stock-construction',Special:'activation'}[tag],
    description:kind === 'practice' ? (tag==='Food'?'Practices with the Food tag.':`Practices producing ${tag} Stock.`) : {Housing:'Housing structures.',Stock:'Structures increasing Stock capacity.',Special:'Other special structures.'}[tag],
    enabled:definitions.some(def => kind === 'practice' ? matchesPracticeShopSpecialty(def,tag) : structureShopCategory(def) === tag)}));
  if (kind === 'practice') choices.push({id:'random',label:'Random',prestigeGain:RULES.randomShopPrestige,description:'Open the general Practice pool. Gain 10 Prestige now.',enabled:definitions.length>0});
  return {kind,selectedTag:null,choices};
}

export function getShopOfferPrice(vassal, nodeState, offer, state = null) {
  const cost = getVassalActionPrestigeCost(vassal, offer.basePrestigeCost ?? 0,
    {isFirstShopPurchase:!nodeState?.purchasedOffers?.length});
  const reserved = (nodeState?.purchasedOffers ?? []).reduce((sum,purchase) => sum + purchase.prestigeCost,0);
  const eligible = ['practice','structure'].includes(offer.intervention?.kind) && (state?.rulesetId || offer.intervention.mode !== 'remove');
  return eligible && cost > Math.max(0,prestigeAccount(state,vassal).prestige-reserved)
    ? {prestigeCost:0,monsterPressureCost:RULES.purchaseMonsterPressure}
    : {prestigeCost:cost,monsterPressureCost:0};
}
