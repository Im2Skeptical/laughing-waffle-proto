import { ensureCommissionOffers } from '../commissions.js';
import { specialistCount, structureModifiers } from "../../detailed-settlements/stock.js";
import { emitPracticeEvent } from '../../detailed-settlements/practice-events.js';
// Vassal candidate portraits, signatures, pool generation, and selection.

import {
  VASSAL_LIFE_TUNING,
  VASSAL_SIGNATURE_NODE_GROUP_IDS,
  VASSAL_SIGNATURE_NODE_VARIANTS,
  VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP,
  VASSAL_STAT_IDS,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedStructureDef, getDetailedPracticeDef } from "../../game-config.js";
import {
  generateVassalLifeMap,
} from "../../vassal-life-map-generator.js";
import {
  getRegionReference,
} from "../../world-state.js";
import {
  candidatePoolHash,
  clone,
  getDetailedSite,
  getPlayerDetailedSites,
  getVassalCandidatePool,
  getVassalLineage,
  shuffle,
} from "../selectors.js";
import {
  createEmptyHeirloomInventory,
  createEmptyHeirloomVault,
  hasPendingHeirloomOverflow,
} from "../heirlooms.js";
import { getStockShopGenerationContext } from "../stock-shops.js";
import { lifeMapNodeEnabled } from '../../life-map-design.js';

const VASSAL_PORTRAIT_KEYS = Object.freeze([
  "skinTone", "hairStyle", "hairColor", "faceShape",
  "clothingColor", "accessory", "expression",
]);

export function isValidPortraitDescriptor(portrait) {
  return !!portrait && typeof portrait === "object" && !Array.isArray(portrait)
    && VASSAL_PORTRAIT_KEYS.every((key) => typeof portrait[key] === "string" && portrait[key]);
}

export function isValidSignatureDescriptor(descriptor) {
  const variant = VASSAL_SIGNATURE_NODE_VARIANTS[descriptor?.variantId];
  return !!variant
    && descriptor.id === variant.id
    && descriptor.groupId === variant.groupId
    && descriptor.label === variant.label
    && descriptor.glyph === variant.glyph
    && descriptor.color === variant.color
    && descriptor.description === variant.description
    && descriptor.removalKind === variant.removalKind
    && descriptor.tag === variant.tag;
}

function generateVassalPortrait(state) {
  const pick = (values) => values[state.rngNextVassalPortraitInt(0, values.length - 1)];
  return {
    skinTone: pick(["umber", "sienna", "ochre", "olive", "rose", "ivory"]),
    hairStyle: pick(["crop", "waves", "braids", "coils", "long", "shaved"]),
    hairColor: pick(["black", "brown", "auburn", "gold", "silver"]),
    faceShape: pick(["round", "oval", "angular"]),
    clothingColor: pick(["red", "blue", "green", "gold", "purple", "charcoal"]),
    accessory: pick(["none", "band", "pin", "beads", "earring"]),
    expression: pick(["calm", "bright", "stern"]),
  };
}

function generateSignatureNodes(state,candidates) {
  const design=state.gameConfig.lifeMapGenerator.design;
  if(design.enabled){
    const usedGroups=new Set();
    return candidates.map(candidate=>{
      const classId=candidate.founderClassId??candidate.classId;
      const available=Object.values(VASSAL_SIGNATURE_NODE_VARIANTS).filter(v=>lifeMapNodeEnabled(design,`signature:${v.id}`,classId));
      const unused=available.filter(v=>!usedGroups.has(v.groupId)),pool=unused.length?unused:available;
      if(!pool.length)return null;
      const weight=v=>design.occurrence[design.nodes[`signature:${v.id}`].occurrence];
      let roll=state.rngNextVassalFloat()*pool.reduce((sum,v)=>sum+weight(v),0);
      let variant=pool.at(-1);for(const v of pool){roll-=weight(v);if(roll<0){variant=v;break;}}
      usedGroups.add(variant.groupId);return {...clone(variant),variantId:variant.id};
    });
  }
  const groups = shuffle(state, VASSAL_SIGNATURE_NODE_GROUP_IDS).slice(0, VASSAL_LIFE_TUNING.candidateCount);
  return groups.map((groupId) => {
    const variants = VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP[groupId];
    const variantId = variants[state.rngNextVassalInt(0, variants.length - 1)];
    return { ...clone(VASSAL_SIGNATURE_NODE_VARIANTS[variantId]), variantId };
  });
}

export function generateCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const locations = getPlayerDetailedSites(state).map((site) => site.regionId);
  const legacyBonus = Math.max(0, Math.floor(
    state?.civilization?.vassalLegacy?.futureStartingPrestigeBonus ?? 0
  ));
  const isFounderPool = lineage.selectedVassalIds.length === 0;
  const candidates = locations.length === 0 ? [] : Array.from(
    { length: isFounderPool ? 2 : VASSAL_LIFE_TUNING.candidateCount },
    (_, index) => {
      const locationRegionId = locations[state.rngNextVassalInt(0, locations.length - 1)];
      const local = getDetailedSite(state, locationRegionId)?.detailedState;
      const founderClassId = isFounderPool ? (index === 1 ? 'warrior' : 'scholar') : null;
      const classId = isFounderPool || index === 1 ? null : lineage.establishedClassId;
      const institutions = classId ? (local?.structureSlots ?? []).filter(slot => slot && !slot.construction).map(slot => getDetailedStructureDef(state,slot?.structureId)).filter(def => def?.pool === classId && specialistCount(local,classId) >= (def.specialistGate ?? 0)) : [];
      const retired = (state.civilization.retiredVassals ?? []).filter(v=>v.classId===classId && v.retirementRegionId===locationRegionId);
      const classHistory=(state.civilization.retiredVassals??[]).filter(v=>v.classId===classId);
      const historyValues={
        retired:classHistory.length,commissions:classHistory.reduce((n,v)=>n+(v.completedCommissions??0),0),
        age:Math.floor(Math.max(0,(state.year??1)-1)/10),chaos:Math.floor((state.civilization.chaos.chaosPower??0)/100),
        losses:state.civilization.history?.lostSettlements??0,conquests:state.civilization.history?.conquests??0,victories:state.civilization.history?.victories??0,
        records:local?.practiceSlots.filter(s=>s?.stock>0&&getDetailedPracticeDef(state,s.practiceId)?.stockTraits.includes('Record')).length??0,
        knowledgeStructures:new Set((local?.structureSlots??[]).filter(s=>!s?.construction&&getDetailedStructureDef(state,s?.structureId)?.tags.includes('Knowledge')).map(s=>s.structureId)).size,
      };
      const historyBonus=structureModifiers(state,local).filter(m=>m.kind==='historyCandidate').reduce((best,m)=>Math.max(best,Math.min(m.cap??3,
        (m.sources??['retired','conquests','losses']).reduce((n,key)=>n+(historyValues[key]??0),0)*m.amount)),0);
      const bank=state.civilization.candidateDevelopment;
      const development=classId&&bank?Math.min(3,bank[classId]??0):0;
      if (development) {
        bank[classId]-=development;
        emitPracticeEvent(state,{kind:'candidateDevelopment',regionId:locationRegionId,classId,amount:development});
      }
      const academyBonus = Math.min(5, institutions.reduce((n,def)=>n+(def.candidateBonus??0),0) + historyBonus + (institutions.length ? Math.floor(retired.reduce((n,v)=>n+(classId==='scholar'?v.finalCunning:v.finalIntelligence),0)/5) : 0))+development;
      return ({
      classId,
      founderClassId,
      archetype: founderClassId ? (founderClassId === 'scholar' ? 'Philosopher' : 'Warlord')
        : classId ? (classId === 'scholar' ? 'Scholar' : 'Warrior') : 'Unclassed',
      candidateId: `candidate-${Math.max(1, Math.floor(lineage.nextVassalId ?? 1))}-${index + 1}`,
      age: state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateAgeMin, VASSAL_LIFE_TUNING.candidateAgeMax),
      locationRegionId, originRegionId: locationRegionId,
      prestige: state.rngNextVassalInt(
        VASSAL_LIFE_TUNING.candidatePrestigeMin,
        VASSAL_LIFE_TUNING.candidatePrestigeMax
      ) + legacyBonus,
      stats: Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [
        statId,
        state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateStatMin, VASSAL_LIFE_TUNING.candidateStatMax) + (statId === (classId==='scholar'?'cunning':'intelligence') ? academyBonus : 0)
          + (state.civilization.vassalLegacy.futureStartingStatBonuses[statId] ?? 0),
      ])),
      portrait: generateVassalPortrait(state),
    }); }
  );
  const signatureNodes = generateSignatureNodes(state,candidates);
  lineage.pendingCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    signatureNode: signatureNodes[index],
  }));
  return lineage.pendingCandidates;
}

export function initializeVassalLifeMapCivilization(state) {
  state.civilization.vassalLegacy = { futureStartingPrestigeBonus: 0, futureStartingStatBonuses:Object.fromEntries(VASSAL_STAT_IDS.map(id=>[id,0])) };
  state.civilization.heirloomVault = createEmptyHeirloomVault();
  state.civilization.vassalLineage = {
    nextVassalId: 1,
    founderClassId: null,
    establishedClassId: null,
    currentVassalId: null,
    selectedVassalIds: [],
    vassalsById: {},
    pendingCandidates: [],
    candidateRerollCount: 0,
    nextHeirloomInstanceId: 1,
    pendingHeirloomLoadout: false,
    pendingVaultOverflow: null,
    lastInheritanceReport: null,
  };
  generateCandidatePool(state);
}

export function rerollVassalCandidates(state) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  if (hasPendingHeirloomOverflow(state)) return { ok: false, reason: "heirloomOverflowPending" };
  lineage.candidateRerollCount = Math.max(0, Math.floor(lineage.candidateRerollCount ?? 0)) + 1;
  generateCandidatePool(state);
  return { ok: true, pool: getVassalCandidatePool(state) };
}

function createLifeMapState(state, vassalId, candidate) {
  const generationSeed = Math.floor(state?.rng?.vassalLifeMapSeed ?? 0);
  const generated = generateVassalLifeMap(state?.gameConfig?.lifeMapGenerator, {
    nextFloat: () => state.rngNextVassalLifeMapFloat(),
    nextInt: (min, max) => state.rngNextVassalLifeMapInt(min, max),
  }, {
    graphId: `${vassalId}-life-map`,
    generationSeed,
    signatureNode: candidate.signatureNode,
    classId: candidate.founderClassId ?? candidate.classId,
    trainingOpening: !!candidate.classId,
    ...getStockShopGenerationContext(state, candidate),
  });
  if (!generated.ok) {
    throw new Error(`Could not generate Vassal Life Map: ${generated.errors?.join("; ") ?? generated.reason}`);
  }
  return {
    graph: generated.graph,
    currentNodeId: null,
    completedNodeIds: [],
    availableNodeIds: [...generated.graph.entryNodeIds],
    nodeStates: {},
    pendingResolution: null,
  };
}

export function selectLifeMapVassal(state, candidateIndex, expectedPoolHash = null, override = null) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  if (hasPendingHeirloomOverflow(state)) return { ok: false, reason: "heirloomOverflowPending" };
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  const candidates = (lineage.pendingCandidates ?? []).map((candidate, index) => {
    const source = index === safeIndex && override ? override : candidate;
    const copy = clone(source);
    delete copy.candidateIndex;
    return copy;
  });
  const actualHash = candidatePoolHash(candidates);
  if (expectedPoolHash && expectedPoolHash !== actualHash) {
    return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
  }
  const source = candidates[safeIndex];
  if (!source) return { ok: false, reason: "invalidCandidate" };
  const survivingSites=getPlayerDetailedSites(state);
  if(!survivingSites.length) return {ok:false,reason:'noPlayerSettlement'};
  if(!survivingSites.some(site=>site.regionId===source.locationRegionId)) source.locationRegionId=survivingSites[0].regionId;
  const idNumber = Math.max(1, Math.floor(lineage.nextVassalId ?? 1));
  const vassalId = `vassal-${idNumber}`;
  const record = {
    ...clone(source),
    vassalId,
    initialAge: Math.max(0, Math.floor(source.age ?? 0)),
    selectedSec: Math.max(0, Math.floor(state.tSec ?? 0)),
    selectedYear: Math.max(1, Math.floor(state.year ?? 1)),
    developmentProgress: 0,
    developmentChoiceQueue: [],
    nextDevelopmentChoiceId: 1,
    lifeMap: createLifeMapState(state, vassalId, source),
    lifeEvents: [{
      eventId: `${vassalId}:selected`, kind: "selected", tSec: state.tSec,
      text: `Selected at ${getRegionReference(state, source.locationRegionId) ?? source.locationRegionId}`,
    }],
    isDead: false,
    endedReason: null,
    deathCause: null,
    endSec: null,
    heirlooms: createEmptyHeirloomInventory(),
  };
  if (record.founderClassId) {
    const graph = record.lifeMap.graph;
    const entryNodeIds = [...graph.entryNodeIds];
    const foundingNodeId = `${vassalId}-founding`;
    const normalDepthCount = graph.generatorConfig.normalDepthCount;
    for (const node of graph.nodes) node.position.x = (node.position.x * normalDepthCount + 1) / (normalDepthCount + 1);
    graph.nodes.unshift({
      id: foundingNodeId, depth: -1, lane: Math.floor(graph.generatorConfig.laneCount / 2), band: "founding",
      family: record.founderClassId === "scholar" ? "philosopherFounding" : "warlordFounding",
      position: { x: 0, y: 0.5 },
    });
    graph.edges.unshift(...entryNodeIds.map(toNodeId => ({ fromNodeId: foundingNodeId, toNodeId })));
    graph.foundingNodeId = foundingNodeId;
    graph.entryNodeIds = [foundingNodeId];
    record.lifeMap.availableNodeIds = [foundingNodeId];
    lineage.founderClassId = record.founderClassId;
  }
  ensureCommissionOffers(state, record);
  delete record.age;
  lineage.nextVassalId = idNumber + 1;
  lineage.currentVassalId = vassalId;
  lineage.selectedVassalIds.push(vassalId);
  lineage.vassalsById[vassalId] = record;
  lineage.pendingCandidates = [];
  lineage.candidateRerollCount = 0;
  const vaultOccupied = (state.civilization.heirloomVault ?? []).filter(Boolean).length;
  lineage.pendingHeirloomLoadout = vaultOccupied > 0;
  return { ok: true, vassal: record, pendingHeirloomLoadout: lineage.pendingHeirloomLoadout };
}
