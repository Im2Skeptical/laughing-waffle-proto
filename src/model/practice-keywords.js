// Ordinary-game keyword rules. Card attachments and coefficients are captured
// in gameConfig.gamepieces; these pure queries also run in replay and workers.
import { synthesisContributors } from './detailed-settlements/synthesis.js';

export const PRACTICE_KEYWORDS = Object.freeze({
  synthesis: { name: 'Synthesis', classId: 'scholar', className: 'Philosopher' },
  monsterTrophies: { name: 'Monster Trophies', classId: 'warrior', className: 'Warlord' },
  economicRegions: { name: 'Economic Regions', classId: 'merchant', className: 'Merchant' },
});

export function keywordAccess(state, id, regionId = null) {
  const keyword = PRACTICE_KEYWORDS[id];
  const lineage = state?.civilization?.vassalLineage;
  const vassal = lineage?.vassalsById?.[lineage.currentVassalId];
  const playerRegion = !state?.rulesetId || regionId == null || state.world.regions.find(r=>r.id===regionId)?.controller==='player';
  const active = playerRegion && !!keyword && !!vassal && !vassal.isDead && !vassal.endedReason && vassal.classId === keyword.classId;
  return { active, emphasised: active, reason: !keyword ? '' : !playerRegion ? 'Dormant outside player-controlled regions.' : active
    ? `${keyword.className} discipline.`
    : `Dormant without an active ${keyword.className} Vassal.` };
}

export function keywordScore(state, regionId, id, excludePracticeId = null) {
  if (!state) return 0;
  if (id === 'synthesis') return synthesisContributors(state, regionId, excludePracticeId).length;
  if (id === 'monsterTrophies') return state.civilization?.history?.monsterTrophies ?? 0;
  if (id !== 'economicRegions') return 0;
  // Full-map zones contain only one holder's settlements. Empty frontier and
  // ruins cannot bridge two zones; each settlement counts once, even in a loop.
  const holder = state.world?.regions.find(r=>r.id===regionId)?.controller;
  const eligible = new Set((state.world?.sites ?? [])
    .filter(site => site.detailedState || site.neutral).map(site => site.regionId)
    .filter(id => {const faction=state.world.regions.find(region => region.id === id)?.controller;return state.rulesetId?['player','external-a'].includes(holder)&&faction===holder:['player','external-a'].includes(faction);}));
  if (!eligible.has(regionId)) return 0;
  const seen = new Set([regionId]), queue = [regionId];
  for (const current of queue) for (const edge of state.world.connections) {
    const next = edge.regionAId === current ? edge.regionBId : edge.regionBId === current ? edge.regionAId : null;
    if (eligible.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen.size;
}

// All coefficients belong to the card's serialized DSL data. This adds to the
// existing Output Multiplier, never to base output, Charge or capacity.
export function keywordOutputAmount(state, regionId, scale, practiceId = null) {
  if (!scale || !keywordAccess(state, scale.keyword, regionId).active) return 0;
  return Math.min(scale.cap, Math.floor(keywordScore(state, regionId, scale.keyword, practiceId) / scale.per)) * scale.amount;
}

export function keywordOutputSources(state, regionId, def) {
  const scale = def?.keywordOutputScale;
  const amount = keywordOutputAmount(state, regionId, scale, def?.id);
  if (!amount) return [];
  if (scale.keyword === 'synthesis') {
    const contributors = synthesisContributors(state, regionId, def.id);
    return Array.from({ length: Math.min(scale.cap, Math.floor(contributors.length / scale.per)) }, (_, index) => {
      const group = contributors.slice(index * scale.per, (index + 1) * scale.per);
      return { id: `keyword:synthesis:${group.map(source => source.slotIndex).join(':')}`,
        label: group.map(source => source.label).join(', '), amount: scale.amount, query: { tagsAny: ['Synthesis'] } };
    });
  }
  return [{ id: `keyword:${scale.keyword}`, label: PRACTICE_KEYWORDS[scale.keyword].name, amount, query: {} }];
}

export function keywordReading(state, regionId, def) {
  const scale = def?.keywordOutputScale, id = scale?.keyword, keyword = PRACTICE_KEYWORDS[id];
  if (!keyword) return null;
  const score = keywordScore(state, regionId, id, def.id), access = keywordAccess(state, id, regionId);
  const bonus = keywordOutputAmount(state, regionId, scale, def.id);
  const definition = id === 'synthesis'
    ? `Count other Scholar-staffed Practices in this settlement whose Consume and Require inputs can currently be supplied. Each counts once; this Practice never counts itself. Empty Stock recipes qualify. Check each recipe independently through normal ${state?.rulesetId ? 'local and faction-connected' : 'local, allied and neutral'} supply, without spending or reserving Stock. Timing and Charge readiness are not conditions. Currently counted: ${state ? synthesisContributors(state, regionId, def.id).map(source => source.label).join(', ') || 'none' : 'none'}.`
    : id === 'monsterTrophies'
      ? 'Count monsters actually destroyed by this civilisation, by Hunt or Campaign. Neutral conquests and successful defenses do not count. Trophies survive Vassal death; they are a count, not spendable Stock.'
      : `Count occupied settlements in this road-connected trade zone, ${state?.rulesetId ? 'held by the same faction, including this one' : 'including this one and neutral towns'}. Frontier${state?.rulesetId ? ', foreign holdings' : ''} and ruins break the zone. Each counts once; connecting two zones joins them.`;
  return { id, name: keyword.name, score, bonus, inMultiplierPool: true,
    active: access.active, emphasised: access.emphasised,
    text: `${keyword.name} contributes to Output Multiplier.`,
    definition: `${definition} ${access.reason} ${score} counted; +${scale.amount} per ${scale.per} count${scale.per === 1 ? '' : 's'}, capped at +${scale.cap * scale.amount}. Currently +${bonus} to this Practice's Output Multiplier. This contribution adds to the base 1 and other multiplier sources. Base Stock yields, recipes, Research, Charge gain and capacity are unchanged.`, lens: '' };
}
