// Disposable shop rules; player New Game never reads these recipes.
import { VASSAL_INTERVENTION_PRACTICE_IDS, settlementStructureDefs } from '../../../src/defs/gamepieces/detailed-settlement-defs.js';
import { getVassalStockOutputIds, isVassalStockOutputPractice } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../../../src/model/game-config.js';
import { getDetailedPracticeTierIndex } from '../../../src/model/detailed-practice-tiers.js';
import { getResearchUnlockIndex } from '../../../src/model/research-progression.js';
import { getVassalActionPrestigeCost } from '../../../src/model/vassal-life-map.js';

export const isOpeningTagShop = spec => ['shop', 'structureShop'].includes(spec?.kind);
const structureTag = def => (def.housing > 0 || def.tags?.includes('Housing')) ? 'Housing'
  : def.modifiers?.some(modifier => modifier.kind === 'capacity') ? 'Stock' : 'Special';

function draw(state, values, count) {
  const pool = [...values], result = [];
  while (pool.length && result.length < count) result.push(pool.splice(state.rngNextVassalInt(0, pool.length - 1), 1)[0]);
  return result;
}
export function createOpeningShopSelection(state, vassal, spec) {
  const kind = spec.kind === 'structureShop' ? 'structure' : 'practice';
  const ids = kind === 'practice' ? VASSAL_INTERVENTION_PRACTICE_IDS : Object.keys(settlementStructureDefs);
  const installed = state.world.sites.find(site=>site.regionId===vassal.locationRegionId)?.detailedState?.practiceSlots??[];
  const authored = spec.cards?.filter(card => (card.kind ?? 'practice') === kind);
  const cards = (authored ?? ids.map(definitionId => ({ kind, definitionId }))).filter(card => {
    const def = kind === 'practice' ? getDetailedPracticeDef(state, card.definitionId) : getDetailedStructureDef(state, card.definitionId);
    return def && def.locked !== true && ['common', vassal.classId ?? vassal.founderClassId].includes(def.pool)
      && !(kind==='practice'&&installed.some(slot=>slot?.practiceId===card.definitionId&&slot.tier==='diamond'))
      && getDetailedPracticeTierIndex(def.minimumQuality ?? 'bronze') <= getResearchUnlockIndex(state);
  });
  const choices = kind === 'practice'
    ? draw(state, getVassalStockOutputIds(cards.map(card => getDetailedPracticeDef(state, card.definitionId))), 3)
    : ['Housing', 'Stock', 'Special'];
  return { kind, selectedTag: null, monsterPressurePerPurchase: spec.monsterPressurePerPurchase ?? 10,
    tags: choices.map(tag => ({ id: tag, label: tag,
      iconId: kind === 'practice' ? `stock-${tag.toLowerCase()}` : {Housing:'housingCapacity',Stock:'stock-construction',Special:'activation'}[tag],
      cards: cards.filter(card => kind === 'practice' ? isVassalStockOutputPractice(getDetailedPracticeDef(state, card.definitionId), tag)
        : structureTag(getDetailedStructureDef(state, card.definitionId)) === tag) })) };
}
export function chooseOpeningShopTag(session, tagId, createOffers) {
  const selection = session.shopSelection, tag = selection?.tags.find(tag => tag.id === tagId);
  if (!tag || selection.selectedTag || !tag.cards.length) throw new Error('Choose an available tag.');
  const vassal = session.state.civilization.vassalLineage.vassalsById[session.vassalId];
  const current = vassal.lifeMap.nodeStates[session.runtimeNodeId];
  current.inventory = createOffers(draw(session.state, tag.cards, 3));
  selection.selectedTag = tag.id;
}
export function openingShopPrice(vassal, current, offer, flatPressure) {
  const reserved = current.purchasedOffers.reduce((sum, purchase) => sum + purchase.prestigeCost, 0);
  const cost = getVassalActionPrestigeCost(vassal, offer.basePrestigeCost ?? 0, {isFirstShopPurchase:!current.purchasedOffers.length});
  return cost > Math.max(0, vassal.prestige - reserved)
    ? { prestigeCost: 0, monsterPressureCost: flatPressure, usesMonsterPressure: true }
    : { prestigeCost: cost, monsterPressureCost: 0, usesMonsterPressure: false };
}
