import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { NEUTRAL_TEMPLATES } from '../detailed-settlements/external-world.js';
import { NEUTRAL_MARKETS } from '../detailed-settlements/neutral-market.js';
import { CIV_CONTENT_TUNING } from '../detailed-settlements/stock.js';
import { getVassalCandidatePool } from '../vassal-life-map.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { generateCandidatePool } from '../vassal-life-map/lifecycle/candidates.js';
import { practiceEffectProduct } from '../practice-outputs.js';

const inputTraits = list => [...new Set((Array.isArray(list) ? list : []).flatMap(input => input?.traits ?? []))];
// What a card produces: Stock, Chaos and each non-Stock output; Structures list Housing.
export const labCardProduces = (category, def) => category === 'structure' ? (def.housing > 0 ? ['Housing'] : [])
  : [...new Set((def.effects ?? []).map(practiceEffectProduct).filter(Boolean))];

export function getLabCatalogue(state) {
  const entries = [];
  for (const [category, registry] of [['practice',state.gameConfig.gamepieces.practices], ['structure',state.gameConfig.gamepieces.structures]]) {
    for (const [id, def] of Object.entries(registry)) entries.push({ id, category, label: def.label, pool: def.pool, mode:def.mode, maturity: def.minimumQuality, locked:def.locked===true, tags: def.tags ?? [], traits: def.stockTraits ?? [], size: category === 'structure' ? def.footprint : 1, produces: labCardProduces(category, def), consumes: inputTraits(def.consume), requires: inputTraits(def.require), def });
  }
  const liveCandidates = getVassalCandidatePool(state).candidates;
  const candidates = liveCandidates.length ? liveCandidates : generateCandidatePool(deserializeGameState(serializeGameState(state)));
  for (const [index, def] of candidates.entries()) entries.push({ id: `candidate-${index}`, category: 'candidate', label: `${def.archetype} · ${def.classId} candidate ${index + 1}`, pool: def.classId, def: {...def, specimenSource:liveCandidates.length?'Current pool':'Next-pool preview on a clone'} });
  for (const def of [...Object.values(VASSAL_NODE_FAMILIES), ...Object.values(VASSAL_SIGNATURE_NODE_VARIANTS)]) entries.push({ id: def.id, category: 'life-map', label: def.label, def });
  for (const [index, def] of NEUTRAL_TEMPLATES.entries()) entries.push({ id: `neutral-${index}`, category: 'neutral', label: def.name, def: { ...def, stocks: NEUTRAL_MARKETS[index] } });
  entries.push({ id: 'spatial-monster', category: 'monster', label: 'Spatial Monster (single runtime type)', def: { baseDefense: CIV_CONTENT_TUNING.monsterDefense, pulseMoons: CIV_CONTENT_TUNING.monsterPulseMoons, chaosScale: CIV_CONTENT_TUNING.monsterChaosScale, expansionPulses: CIV_CONTENT_TUNING.monsterExpansionPulses, rule: 'Saved pressure grows logarithmically with accumulated Chaos. Pulses advance existing fronts before spawning; three advances expand a front.', liveInstances: state.world.regions.filter(r => r.monster).map(r => ({ regionId: r.id, ...r.monster })) } });
  return entries;
}

export function filterLabCatalogue(entries, filters = {}) {
  return entries.filter(e => (!filters.category || e.category === filters.category)
    && (!filters.pool || e.pool === filters.pool) && (!filters.maturity || e.maturity === filters.maturity)
    && (!filters.mode || e.mode===filters.mode)
    && (!filters.hideLocked || !e.locked)
    && (!filters.tag || e.tags?.includes(filters.tag)) && (!filters.trait || e.traits?.includes(filters.trait))
    && (!filters.size || e.size === Number(filters.size))
    && (!filters.produces || e.produces?.includes(filters.produces))
    && (!filters.consumes || e.consumes?.includes(filters.consumes)) && (!filters.requires || e.requires?.includes(filters.requires))
    && (!filters.search || JSON.stringify(e).toLowerCase().includes(filters.search.toLowerCase())));
}
