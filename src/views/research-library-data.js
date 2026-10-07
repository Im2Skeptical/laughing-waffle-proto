import { settlementStructureDefs, VASSAL_INTERVENTION_PRACTICE_IDS } from '../defs/gamepieces/detailed-settlement-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../model/game-config.js';
import { getPracticeReading } from '../model/practice-reading.js';
import { getStructureReading } from '../model/structure-reading.js';
import { getVassalLineage } from '../model/vassal-life-map.js';
import { DETAIL_RECT } from './world-map/constants.js';
import { DEFAULT_REGION_STRUCTURE_CAPACITY_MAX } from '../defs/world/detailed-settlement-scenario.js';
import { regionalPracticeSize, regionalConstructionRect, PIECE_SIZE } from './piece-geometry.js';

export const RESEARCH_PRACTICE_SIZE = Object.freeze(regionalPracticeSize(DETAIL_RECT.width));
const structureHeight = regionalConstructionRect({ x:0, y:0, width:DETAIL_RECT.width-44, height:DETAIL_RECT.height-566 }, DEFAULT_REGION_STRUCTURE_CAPACITY_MAX, DEFAULT_REGION_STRUCTURE_CAPACITY_MAX).height;

export function getResearchLibraryDefaultFilters(state) {
  const lineage = getVassalLineage(state);
  const classId = lineage?.establishedClassId ?? lineage?.founderClassId;
  return { search:'', pool:classId ? `${classId}+common` : 'common', kind:'', availability:'', trait:'' };
}

export function getResearchLibraryCards(state) {
  return [
    ...VASSAL_INTERVENTION_PRACTICE_IDS.map(id => ({ id, kind:'practice', def:getDetailedPracticeDef(state,id) })),
    ...Object.keys(settlementStructureDefs).map(id => ({ id, kind:'structure', def:getDetailedStructureDef(state,id) })),
  ].filter(card => card.def && card.def.locked!==true).map(card => {
    const { def, kind } = card;
    const reading = kind === 'practice' ? getPracticeReading(def) : getStructureReading(def);
    const traits = [...new Set([...(def.tags??[]), ...(def.stockTraits??[]), ...['consume','require'].flatMap(key => (def[key]??[]).flatMap(input => input.traits))])];
    const size = kind === 'practice' ? RESEARCH_PRACTICE_SIZE : { width:PIECE_SIZE.cellWidth * (def.footprint??1) * structureHeight / PIECE_SIZE.structureHeight, height:structureHeight };
    return { ...card, traits, size, tier:def.minimumQuality??'bronze', type:kind==='practice'?reading.type.toLowerCase():'structure',
      search:[def.label,def.pool,kind,reading.type,...traits,...reading.requirements,...reading.effects.map(effect=>effect.text),reading.trigger??''].join(' ').toLowerCase() };
  }).sort((a,b) => a.kind.localeCompare(b.kind) || a.def.label.localeCompare(b.def.label));
}

export function filterResearchLibraryCards(cards, filters, tiers) {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pools = filters.pool.split('+').filter(Boolean);
  return cards.filter(card => {
    const unlocked = tiers.find(tier => tier.id===card.tier).unlocked;
    return terms.every(term=>card.search.includes(term)) && (!pools.length || pools.includes(card.def.pool))
      && (!filters.kind || card.kind===filters.kind || card.type===filters.kind)
      && (!filters.trait || card.traits.includes(filters.trait))
      && (!filters.availability || (filters.availability==='unlocked'?unlocked:!unlocked));
  });
}

// Lay out natural-sized regional faces. Only visible entries become Pixi cards.
export function layoutResearchLibraryCards(cards, tiers, width, preferredPool='common') {
  const entries=[], groups=[];
  let y=0;
  for (const tier of tiers) {
    const group=cards.filter(card=>card.tier===tier.id);
    groups.push({ ...tier, y, count:group.length });
    entries.push({ kind:'heading', tier, count:group.length, x:0, y, width, height:78 });
    y+=92;
    if (!group.length) { entries.push({ kind:'empty', x:0,y,width,height:50 }); y+=78; continue; }
    const pools = [...new Set([preferredPool, 'common', ...group.map(card=>card.def.pool).sort()])];
    for (const pool of pools) for (const kind of ['practice','structure']) {
      let x=0, rowHeight=0;
      for (const card of group.filter(card=>card.def.pool===pool && card.kind===kind)) {
        const cardWidth=Math.max(160,card.size.width);
        if (x && x+cardWidth>width) { y+=rowHeight+30; x=0; rowHeight=0; }
        entries.push({ kind:'card', card, x, y, width:cardWidth, height:card.size.height+68 });
        x+=cardWidth+24; rowHeight=Math.max(rowHeight,card.size.height+68);
      }
      if (rowHeight) y+=rowHeight+32;
    }
    y+=24;
  }
  return { entries, groups, height:y };
}
