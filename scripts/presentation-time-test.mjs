import assert from 'node:assert/strict';
import { normalizeEventMarkers } from '../src/views/timegraphs-helpers.js';
import { fitPiece, constructionGeometry, regionalConstructionRect } from '../src/views/piece-geometry.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { getPracticeSymbols } from '../src/views/practice-reading-pixi.js';
import { getInspectionTerms } from '../src/views/inspection-terms.js';
import { getMoonCycleDurationSec, getMoonPhaseDurationSec } from '../src/model/moon-phases.js';
import { createNewGameState } from '../src/model/new-game.js';
import { selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { getResearchProgression } from '../src/model/research-progression.js';
import { getResearchLibraryCards, getResearchLibraryDefaultFilters, filterResearchLibraryCards, layoutResearchLibraryCards } from '../src/views/research-library-data.js';
import { advanceReplayStateOneSecond } from '../src/model/replay-second-runner.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements.js';
import { SEASON_DURATION_SEC } from '../src/defs/gamesettings/gamerules-defs.js';
import { VASSAL_TIME_COST_RANGES } from '../src/defs/gamepieces/vassal-life-map-defs.js';
import { getSettlementYearDurationSec } from '../src/model/settlement-state.js';
import {
  SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC,
  SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS,
} from '../src/views/ui-root/settlement-graph-session.js';

// Stock Supply markers keep the output needed by their specialty badge, even
// when two outputs occur at the same second. Exact duplicate events collapse.
const shopMarkers = ['Timber', 'Edible', 'Timber'].map(stockOutput => ({
  tSec: 12, nodeIcon: { family: 'stockShop', stockOutput },
}));
const normalizedShops = normalizeEventMarkers(shopMarkers, { minSec: 0, maxSec: 20 });
assert.deepEqual(normalizedShops.map(marker => marker.nodeIcon.stockOutput), ['Timber', 'Edible']);
const signatureShop = normalizeEventMarkers([{
  tSec: 14, nodeIcon: { family: 'signature', signatureNode: { variantId: 'knowledgeShop' } },
}], { minSec: 0, maxSec: 20 });
assert.equal(signatureShop[0].nodeIcon.signatureNode.variantId, 'knowledgeShop');
assert.equal(shopMarkers[0].nodeIcon.stockOutput, 'Timber', 'normalization leaves source nodes untouched');

const faceClock={tSec:0,seasonDurationSec:8};
for (const [candidateIndex, classId] of [[null, null], [0, 'scholar'], [1, 'warrior']]) {
  const state = createNewGameState(123);
  if (candidateIndex !== null) assert.equal(selectLifeMapVassal(state, candidateIndex).ok, true);
  const before = JSON.stringify(state);
  const cards = getResearchLibraryCards(state), tiers = getResearchProgression(state).tiers;
  const filters = getResearchLibraryDefaultFilters(state);
  assert.equal(filters.pool, classId ? `${classId}+common` : 'common', 'founder selection immediately sets the library default');
  const filtered = filterResearchLibraryCards(cards, filters, tiers);
  assert.deepEqual(filtered, cards.filter(card => card.def.pool === 'common' || card.def.pool === classId), 'defaults expose exactly the chosen class and generic cards');
  const layout = layoutResearchLibraryCards(filtered, tiers, 2296, classId ?? 'common');
  for (const tier of tiers) {
    const entries = layout.entries.filter(entry => entry.kind === 'card' && entry.card.tier === tier.id);
    const pools = entries.map(entry => entry.card.def.pool);
    const firstGeneric = pools.indexOf('common');
    if (classId && firstGeneric >= 0) assert.ok(pools.slice(firstGeneric).every(pool => pool === 'common'), 'all chosen-class cards precede generic cards, including Structures');
    for (const pool of [classId, 'common'].filter(Boolean)) for (const kind of ['practice', 'structure']) {
      const labels = entries.filter(entry => entry.card.def.pool === pool && entry.card.kind === kind).map(entry => entry.card.def.label);
      assert.deepEqual(labels, [...labels].sort((a,b) => a.localeCompare(b)), 'cards remain alphabetical within each class and type');
    }
  }
  assert.deepEqual(layout.groups.map(group => group.id), tiers.map(tier => tier.id), 'unlock tiers remain the primary sections');
  assert.equal(filterResearchLibraryCards(cards, {...filters, pool:''}, tiers).length, cards.length, 'All classes exposes the full catalog');
  for (const pool of ['scholar', 'warrior']) assert.deepEqual(filterResearchLibraryCards(cards, {...filters, pool}, tiers), cards.filter(card => card.def.pool === pool), 'manual class filters expose hidden cards');
  assert.equal(JSON.stringify(state), before, 'library queries do not change state or RNG');
  if (classId) {
    state.civilization.vassalLineage.currentVassalId = null;
    assert.equal(getResearchLibraryDefaultFilters(state).pool, filters.pool, 'the chosen lineage class remains the default between vassals');
  }
}
const loggingReading=getGamepieceFace(faceClock,'practice','logging');
assert.deepEqual(loggingReading.reading.effects,[
  {timing:'Spring',text:'Produce 2 Stock'},
  {timing:'Summer',text:'Produce 2 Stock'},
  {timing:'Autumn',text:'Produce 3 Stock'},
]);
assert.equal(loggingReading.reading.type,'Cycle');
assert.equal(loggingReading.reading.trigger,null,'Season timing belongs in the Activation block');
const anatomicalReading=getGamepieceFace(faceClock,'practice','anatomicalStudy');
assert.deepEqual(anatomicalReading.reading.effects,[{timing:'',text:'Produce 2 Stock'},{timing:'',text:'Gain 2 Research'}]);
assert.equal(anatomicalReading.reading.trigger,'Charge when someone in this settlement dies, or another local Practice produces Bone Stock.');
assert.ok(anatomicalReading.reading.requirements.includes('Requires a Scholar worker.'),'The hard staffing gate remains readable');
assert.ok(getPracticeSymbols(anatomicalReading).some(entry=>entry.name==='Charge'));
assert.ok(!getPracticeSymbols(loggingReading).some(entry=>entry.name==='Charge'),'Glossary includes only symbols on the selected face');
assert.ok(!getPracticeSymbols(anatomicalReading).some(entry=>/Cycle/.test(entry.name)));
assert.ok(getPracticeSymbols(anatomicalReading).some(entry=>entry.name==='Bone'),'Trigger traits are included, even when not hosted here');
assert.deepEqual(getPracticeSymbols(anatomicalReading).slice(0,3).map(entry=>entry.name),['Medicine','Record','Bone'],'Stock tags lead the symbol key');
const recipeReading=getGamepieceFace(faceClock,'practice','cropRotation').reading;
assert.ok(recipeReading.requirements.includes('Require 1 Record Stock (kept).'),'Requires is distinct from Consume');
const mixedReading=getGamepieceFace(faceClock,'practice','selectiveBreeding').reading;
assert.deepEqual(mixedReading.effects.map(effect=>effect.timing),['Birth phase','Autumn'],'Additional seasonal triggers are not lost');
for(const definition of Object.values(detailedSettlementPracticeDefs)) {
  const reading=getGamepieceFace(faceClock,'practice',definition.id).reading;
  assert.ok(reading.effects.length,`${definition.id} must explain its Activation or supplied contribution`);
  assert.ok(reading.effects.every(effect=>effect.text&&!/undefined/.test(effect.text)),`${definition.id} needs readable effects`);
  if(reading.type==='Charge')assert.ok(!/Gain \d+ (?:base )?Charge|At \d+ Charge|Discharge/.test(reading.trigger),'Charge copy explains events, not the standard meter rule');
}
const workerFace=getGamepieceFace(faceClock,'practice','forage','bronze',{workers:{tokens:[{effectiveness:.5}],effectiveWorkers:.5}});
const structureFaceState=JSON.stringify(faceClock);
for(const definition of Object.values(settlementStructureDefs)) {
  const face=getGamepieceFace(faceClock,'structure',definition.id);
  assert.equal(face.reading.type,'Structure');
  assert.equal(face.reading.passive,true);
  assert.ok(face.reading.effects.length,`${definition.id} must explain its ongoing effects`);
  assert.ok(face.reading.effects.every(effect=>effect.text&&!/undefined|NaN/.test(effect.text)),`${definition.id} needs readable effects`);
  assert.ok(!getPracticeSymbols(face).some(entry=>/^(Cycle|Charge|Worker|Worker multiplier)$/.test(entry.name)),'Structures explain their own symbols');
}
const granaryFace=getGamepieceFace(faceClock,'structure','granary','bronze',{slot:{qualityBonus:1}});
assert.equal(granaryFace.reading.effects[0].text,'+3.75 to Edible Stock Capacity');
assert.deepEqual(granaryFace.structureBonuses[0].traits,['Edible']);
assert.deepEqual(getPracticeSymbols(granaryFace).map(entry=>entry.name),['Edible','Stock capacity bonus','Construction footprint','Quality']);
const kilnTerms=getInspectionTerms(getGamepieceFace(faceClock,'structure','kiln')).terms;
assert.ok(kilnTerms.Construction&&kilnTerms.Vessel&&kilnTerms.Glass,'References cover Stock traits in Structure rules, including traits absent from its face');
assert.equal(getGamepieceFace(faceClock,'structure','mudHouses','bronze',{slot:{qualityBonus:1}}).structureBonuses[0].amount,37,'Housing rounds per Structure');
const archiveFace=getGamepieceFace(faceClock,'structure','archive','bronze',{slot:{qualityBonus:3},settlement:{populationByClass:{villager:{specialists:{scholar:{adults:0}}}}}});
assert.equal(archiveFace.reading.active,false,'Live specialist gate is distinct from the offered capacity');
assert.ok(archiveFace.reading.effects.some(effect=>/capped at \+3$/.test(effect.text)),'History caps do not scale with quality');
assert.ok(archiveFace.reading.effects.some(effect=>/^\+1 to future Scholar/.test(effect.text)),'Candidate base bonus does not scale with quality');
assert.ok(archiveFace.reading.effects.some(effect=>/combined institutional bonus capped at \+5/.test(effect.text)),'Candidate copy gives the implemented shared cap');
for(const id of ['hallOfTheFallen','hallOfChampions','hallOfFallenKings']) {
  const history=getGamepieceFace(faceClock,'structure',id).reading.effects.find(effect=>effect.text.startsWith('Additional candidate bonus'));
  assert.ok(history,`${id} describes its candidate history modifier`);
  assert.ok(history.text.includes('retired Vassals of the candidate class'),'History follows the candidate class');
  assert.ok(!history.text.includes('Scholar'),'Warrior history does not claim a Scholar-only bonus');
}
assert.ok(getGamepieceFace(faceClock,'structure','procurementOffice').reading.effects.some(effect=>/^Consume one hosted Currency Stock.*required or consumed Stock/.test(effect.text)),'Currency substitutes Require and Consume inputs and is always spent');
for(const id of ['laboratory','arcaneCollege']) {
  assert.ok(getGamepieceFace(faceClock,'structure',id).reading.effects.some(effect=>/required or consumed Stock.*including Currency \(required Stock is kept; consumed Stock is spent\)/.test(effect.text)),`${id} explains flexible providers without excluding Currency`);
}
assert.equal(getGamepieceFace(faceClock,'structure','archive','bronze',{settlement:{populationByClass:{villager:{specialists:{scholar:{adults:100}}}}}}).reading.active,true);
assert.equal(getGamepieceFace(faceClock,'structure','archive').reading.active,null,'Catalogue faces do not invent local staffing');
const configuredStructureState={...faceClock,gameConfig:{gamepieces:{structures:{granary:{...settlementStructureDefs.granary,modifiers:[{kind:'capacity',amount:7,query:{traitsAny:['Water']}}]}}}}};
const configuredStructureBefore=JSON.stringify(configuredStructureState);
assert.equal(getGamepieceFace(configuredStructureState,'structure','granary').reading.effects[0].text,'+7 to Water Stock Capacity','Reading uses configured runtime definitions');
assert.equal(JSON.stringify(configuredStructureState),configuredStructureBefore);
assert.equal(JSON.stringify(faceClock),structureFaceState,'Structure presentation never mutates state');
assert.equal(workerFace.workerMultiplier,1.5,'Worker multiplier uses effective workers, not occupied socket count');
assert.equal(getGamepieceFace(faceClock,'practice','scholarship','bronze',{workers:{tokens:[{}],effectiveWorkers:1}}).workerMultiplier,1,'Non-Stock effects do not advertise a worker yield bonus that the simulation does not apply');
assert.deepEqual(getGamepieceFace(faceClock,'practice','smelting').inputs,[],'Charge cards display no Stock costs');
assert.deepEqual(getGamepieceFace(faceClock,'practice','smelting').chargeTriggers.map(s=>s.trait),['Ore','Fuel'],'Charge symbols describe generating events');
assert.deepEqual(getGamepieceFace(faceClock,'practice','dryFarming').production.map(row=>[row.season,row.value]),[['summer',2],['autumn',6]],'Seasonal base yields remain distinct');
assert.deepEqual(getGamepieceFace(faceClock,'practice','raidingParties').production.map(row=>row.season),['summer','autumn'],'Equal-yield triggers still display every scheduled season');
assert.equal(getGamepieceFace(faceClock,'practice','cropRotation').inputs[0].kind,'require','Requirements are not displayed as consumed costs');
// Activation feedback follows the inspected snapshot, including reverse seeks;
// merely charging or displaying an unowned offer must never flash an output.
const reactionTrace=[{kind:'activated',targetPracticeId:'barter',tSec:17},{kind:'charged',targetPracticeId:'barter',tSec:18}];
for(const [second,expected] of [[16,null],[17,0],[18,1],[17,0]]) {
  const clock={...faceClock,tSec:second},slot={practiceId:'barter',charge:1};
  const before=JSON.stringify({clock,slot,reactionTrace});
  assert.equal(getGamepieceFace(clock,'practice','barter','silver',{slot,activationTrace:reactionTrace}).activationAge,expected);
  assert.equal(getGamepieceFace(clock,'practice','barter','silver').activationAge,null);
  assert.equal(JSON.stringify({clock,slot,reactionTrace}),before);
}
assert.equal(getGamepieceFace({...faceClock,tSec:9},'practice','dryFarming','bronze',{slot:{practiceId:'dryFarming'},activationTrace:[{kind:'activated',targetPracticeId:'dryFarming',tSec:9}]}).activationAge,0);
assert.equal(getGamepieceFace({...faceClock,tSec:8},'practice','dryFarming','bronze',{slot:{practiceId:'dryFarming'}}).activationAge,null);
for(const [second,season,nextSec,fill] of [[0,'summer',9,0],[8,'summer',9,8/9],[9,'autumn',17,0],[16,'autumn',17,7/8],[17,'spring',33,0],[25,'spring',33,.5],[32,'spring',33,15/16],[33,'summer',41,0],[65,'summer',73,0],[25,'spring',33,.5],[9,'autumn',17,0],[0,'summer',9,0]]) {
  const clock={...faceClock,tSec:second},before=JSON.stringify(clock);
  const face=getGamepieceFace(clock,'practice','logging');
  assert.deepEqual(face.nextTrigger,{season,tSec:nextSec},`Logging points at its next relevant trigger at ${second}`);
  assert.ok(Math.abs(face.fill-fill)<1e-10,'Readiness resets per trigger and spans skipped seasons');
  assert.equal(JSON.stringify(clock),before,'Upcoming symbols never advance the simulation');
}
assert.deepEqual(getGamepieceFace({...faceClock,tSec:17},'practice','dryFarming').nextTrigger,{season:'summer',tSec:41},'Skip both winter and spring when neither triggers');
assert.deepEqual(getGamepieceFace({...faceClock,tSec:9},'practice','saltGathering').nextTrigger,{season:'summer',tSec:41},'Single-season triggers wrap to next year');
assert.deepEqual(getGamepieceFace({seasonDurationSec:10,tSec:21},'practice','logging').nextTrigger,{season:'spring',tSec:40},'Respect configured season duration');
assert.equal(getSettlementYearDurationSec({}), SEASON_DURATION_SEC * 4, 'a missing season length is one 8-second season, four times');
assert.equal(getSettlementYearDurationSec({ seasonDurationSec: 10, seasons: [0, 1] }), 20);
assert.equal(SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC, SEASON_DURATION_SEC * 4 * SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS);
assert.equal(SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC, 3200);
assert.deepEqual(VASSAL_TIME_COST_RANGES, {
  low: { min: 128, max: 192 }, medium: { min: 224, max: 288 }, high: { min: 224, max: 320 },
});
for(const duration of [1,8,10]) {
  const state=createNewGameState(42);state.paused=false;state.seasonDurationSec=duration;
  const site=getDetailedSettlementSites(state,{playerOnly:true})[0];
  site.detailedState.practiceSlots=[{practiceId:'logging',tier:'bronze',stock:0,charge:0,work:0},null,null,null,null];
  for(let i=0;i<duration*5+2;i++) {
    const next=getGamepieceFace(state,'practice','logging').nextTrigger;
    advanceReplayStateOneSecond(state);
    const fired=(site.detailedState.practiceActivationTrace??[]).some(e=>e.targetPracticeId==='logging'&&e.tSec===state.tSec);
    assert.equal(fired,next.tSec===state.tSec,`Displayed trigger matches actual activation at ${state.tSec}, duration ${duration}`);
    if(fired)assert.equal(next.season,state.seasons[state.currentSeasonIndex]);
  }
}
for(const [id,period,offset] of [['barter',getMoonCycleDurationSec(faceClock),1],['forage',getMoonCycleDurationSec(faceClock),1+getMoonPhaseDurationSec(faceClock)]]){
  for(const second of [offset,offset+period/2,offset+period,offset+period/2,offset]){
    const clock={...faceClock,tSec:second},before=JSON.stringify(clock);
    const face=getGamepieceFace(clock,'practice',id);
    assert.ok(Math.abs(face.fill-((second-offset)%period)/period)<1e-10,`${id}: disc samples its trigger interval at ${second}`);
    assert.equal(JSON.stringify(clock),before,'Reading a face never advances time');
  }
}

for(const bounds of [{x:0,y:0,width:90,height:99},{x:5,y:8,width:350,height:200},{x:0,y:0,width:234,height:340}]){
  for(const footprint of [1,2,3]){
    const fitted=fitPiece(bounds,'structure',footprint);
    assert.equal(fitted.width/fitted.height,3*footprint/4);
    assert.ok(fitted.width*fitted.scale<=bounds.width+.001&&fitted.height*fitted.scale<=bounds.height+.001);
  }
  const card=fitPiece(bounds,'practice');assert.equal(card.width/card.height,5/7);
}
for(const capacity of [5,6,7,8]){
  const area={x:1502,y:664,width:884,height:132};
  const regional=regionalConstructionRect(area,capacity);
  assert.equal(regional.width/capacity,99,'Regional structures keep a fixed pitch across capacities');
  assert.equal(regional.x+regional.width/2,area.x+area.width/2,'Regional construction is centered');
  const strip=constructionGeometry({x:0,y:0,width:582,height:108},capacity);
  assert.ok(Math.abs(strip.cell/strip.height-3/4)<1e-10);
  assert.ok(strip.width<=582&&strip.height<=108);
}
import { getNavigationVassalPortrait } from '../src/views/settlement-navigation-pixi.js';
import { getIllustrationSpec } from '../src/views/chronicle-art.js';
import { GRAPH_METRICS } from '../src/model/graph-metrics.js';
import { createSettlementForecastController } from '../src/controllers/settlement-forecast-controller.js';
import { getGraphGroupSeriesIds, getActiveGraphGroups, toggleGraphGroup } from '../src/views/ui-root/settlement-graph-groups.js';
import {
  createSettlementGraphSession,
  getSettlementGraphMetric,
  getSettlementGraphRevealConfig,
  resolveEffectiveSettlementGraphHorizonSec,
  SETTLEMENT_GRAPH_REVEAL_DEFAULT,
  SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT,
  SETTLEMENT_GRAPH_WINDOW_SEC,
} from '../src/views/ui-root/settlement-graph-session.js';
import { computeGraphSeriesScaleRanges } from '../src/views/timegraphs-helpers.js';
import {
  createForecastRevealState,
  getAnimatedForecastCoverageEndSec,
  getDisplayHistoryEndSec,
  getForecastRevealDesiredVelocitySecPerSec,
  getForecastRevealEffectiveStartDelayMs,
  getForecastRevealFollowTargetEndSec,
  getRenderedHistoryEndSec,
  getVisibleForecastCoverageEndSec,
  pauseForecastReveal,
  resetForecastReveal,
  resolveForecastRevealPlayheadFollowSec,
  resolveForecastRevealPreviewTarget,
  restartForecastRevealFrom,
  setForecastRevealConfig,
  suspendForecastRevealPlayheadFollow,
  syncForecastRevealTarget,
} from '../src/views/timegraphs/forecast-reveal-state.js';
import {
  clampScrubSecToRevealCap,
  createScrubSession,
  pointerLocalXToSec,
  resetForecastPreviewState,
  resolveLatchedForecastPreviewRestore,
  setLatchedForecastScrub,
  syncLatchedForecastPreview,
} from '../src/views/timegraphs/scrub-session.js';
import {
  applyRunScaleHighWaterRanges,
  createScaleHighWaterState,
  syncScaleHighWaterTimeline,
} from '../src/views/timegraphs/scale-high-water.js';
import {
  buildPlotSnapshotKey,
  createPlotSnapshotCache,
  invalidatePlotSnapshot,
  isPlotSnapshotCacheHit,
  isPreviousPlotSnapshotCompatible,
  quantizePlotSnapshotMaxSec,
  quantizePlotSnapshotMinSec,
  resolvePlotSnapshotStablePrefixEndSec,
  resolvePlotSnapshotTargetMaxSec,
  storePlotSnapshot,
} from '../src/views/timegraphs/plot-snapshot-cache.js';
import {
  beginBootFadeTransition,
  clearBootFadeTransition,
  createBootFadeState,
  getBootFadeRenderState,
} from '../src/views/timegraphs/boot-fade-state.js';
import {
  animateBoundToward,
  clearAnimatedTimeBounds,
  createTimeBoundsState,
  resetAnimatedTimeBounds,
  setTimeBounds,
} from '../src/views/timegraphs/time-bounds-state.js';
import {
  activateProjectionReplacementTransition,
  buildProjectionReplacementRenderState,
  clearProjectionReplacementTransition,
  createProjectionReplacementState,
  getProjectionReplacementDebugState,
  getProjectionReplacementMaxFloorSec,
  getProjectionReplacementRenderKey,
  getProjectionReplacementScaleRanges,
  stageProjectionReplacementTransition,
} from '../src/views/timegraphs/projection-replacement-state.js';
import {
  GRAPH_BOOT_FADE_FRAME_MS,
  TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC,
  PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS,
  PROJECTION_REPLACEMENT_DIM_ALPHA,
  PROJECTION_REPLACEMENT_DIM_LINE_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA,
  SERIES_SCALE_MAX_FLASH_DURATION_MS,
  TIMEGRAPH_THEME,
} from '../src/views/timegraphs/constants.js';
import {
  createActionSecondsCache,
  getActionSecs,
  getMarkerActionSecs,
} from '../src/views/timegraphs/action-seconds-cache.js';
import {
  clearSeriesScaleMaxFlash,
  createSeriesScaleMaxFlashState,
  triggerSeriesScaleMaxFlash,
} from '../src/views/timegraphs/scale-max-flash-state.js';
import { lerpNumber } from '../src/views/timegraphs-helpers.js';
import { layoutTimegraphKey, getTimegraphLayout, TIMEGRAPH_CHROME } from '../src/views/timegraph-scroll-pixi.js';
import { detailedSettlementPracticeDefs, settlementStructureDefs } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import {
  loopPhase, sampleSpriteFrame, sampleEventProgress, sampleMote,
  resolveVisualTime, sampleChronicleScore, audioOffsetAtTime, layoutChronicleNodes,
} from '../src/views/timeline-presentation.js';

const firstPortrait = { face: 'first' };
const secondPortrait = { face: 'second' };
const viewedLife = (tSec, currentVassalId, regionId = 'a') => ({
  tSec,
  world: { sites: [{ regionId: 'a', detailedState: {} }] },
  civilization: { vassalLineage: { currentVassalId, vassalsById: {
    first: { vassalId: 'first', locationRegionId: regionId, portrait: firstPortrait },
    second: { vassalId: 'second', locationRegionId: 'b', portrait: secondPortrait },
  } } },
});
const portraitSnapshots = [viewedLife(0, null), viewedLife(10, 'first'),
  viewedLife(20, 'first', 'b'), viewedLife(30, null), viewedLife(40, 'second')];
const untouchedSnapshots = JSON.stringify(portraitSnapshots);
for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0, 4, 1]) {
  const portrait = getNavigationVassalPortrait(portraitSnapshots[index]);
  assert.equal(portrait?.vassalId ?? null, [null, 'first', 'first', null, 'second'][index],
    'Scrubbing both directions follows the active life, including gaps between Vassals');
  if (portrait) {
    assert.equal(portrait.traits, index === 4 ? secondPortrait : firstPortrait);
    assert.equal(portrait.regionId, index === 1 ? 'a' : 'b');
    assert.equal(portrait.hasSettlement, index === 1,
      'Portrait shortcuts follow the viewed location and settlement availability');
  }
}
assert.equal(JSON.stringify(portraitSnapshots), untouchedSnapshots, 'Portrait selection never mutates snapshots');

const clip={frameCount:8,framesPerSecond:12,startSec:3};
const graphLayout = getTimegraphLayout();
for (const count of [0, 3, 5, 8, 9, 17, 24]) {
  const firstPage = layoutTimegraphKey(count);
  const covered = [];
  for (let page = 0; page < firstPage.pageCount; page++) {
    const key = layoutTimegraphKey(count, page);
    assert.deepEqual({ x: key.x, y: key.y, width: key.width, height: key.height }, graphLayout.key,
      'The key housing is fixed for every selection and page');
    assert.ok(key.points.length <= 8, 'Overflow never adds sockets or shrinks the graph');
    key.points.forEach((point, index) => {
      covered.push(key.startIndex + index);
      assert.ok(point.x >= key.x && point.x + TIMEGRAPH_CHROME.iconSize <= key.x + key.width);
      assert.ok(point.y >= key.y && point.y + TIMEGRAPH_CHROME.iconSize <= key.y + key.height);
    });
    assert.deepEqual(getTimegraphLayout().plot, graphLayout.plot);
  }
  assert.deepEqual(covered, Array.from({ length: count }, (_, index) => index), 'Every selected series appears exactly once across key pages');
  assert.equal(layoutTimegraphKey(count, -1).page, 0);
  assert.equal(layoutTimegraphKey(count, 100).page, firstPage.pageCount - 1);
}
assert.equal(layoutTimegraphKey(8).pageCount, 1);
assert.equal(layoutTimegraphKey(9).pageCount, 2);
const civSeries = GRAPH_METRICS.civilization.getSeries(null, null);
const localSeries = GRAPH_METRICS.settlement.getSeries(null, null);
assert.deepEqual(getGraphGroupSeriesIds('chaos', 'civilization', civSeries), ['monsterCount', 'chaosResistance', 'chaosRawPressure']);
assert.deepEqual(getGraphGroupSeriesIds('resources', 'civilization', civSeries), ['food', 'gold', 'totalPopulation']);
assert.deepEqual(getGraphGroupSeriesIds('resources', 'settlement', localSeries), ['food', 'gold', 'totalPopulation', 'housingCapacity']);
assert.deepEqual(getGraphGroupSeriesIds('population', 'settlement', localSeries),
  ['civilizationHousingCapacity', 'totalPopulation', 'population:villager', 'population:stranger', 'housingCapacity']);
const resources = getGraphGroupSeriesIds('resources', 'settlement', localSeries);
const combined = toggleGraphGroup('population', resources, 'settlement', localSeries);
assert.deepEqual(getActiveGraphGroups(combined, 'settlement', localSeries), ['resources', 'population']);
assert.deepEqual(toggleGraphGroup('population', combined, 'settlement', localSeries), resources,
  'Removing Population retains the population and housing shared with Resources');
assert.deepEqual(toggleGraphGroup('resources', resources, 'settlement', localSeries), []);
const monsterSeries = civSeries.filter((series) => series.id === 'monsterCount');
for (const values of [[0, 0], [12, 27], [100, 150]]) {
  const scale = computeGraphSeriesScaleRanges(monsterSeries, new Map([['monsterCount', values]])).get('monsterCount');
  assert.equal(scale.minValue, 0);
  assert.equal(scale.maxValue, 15, 'Monster scale is stable before and after the endgame threshold');
}
const artKeys=new Set();
for(const id of [...Object.keys(detailedSettlementPracticeDefs),...Object.keys(settlementStructureDefs)]){
  const art=getIllustrationSpec(id);
  assert.ok(art,`${id} needs an explicit gamepiece illustration`);
  const key=`${art.file}:${art.index}`;
  assert.ok(getGamepieceFace(null,detailedSettlementPracticeDefs[id]?"practice":"structure",id)?.label,`${id} has its own visible name`);
  artKeys.add(key);
}
assert.equal(artKeys.size, Object.keys(detailedSettlementPracticeDefs).length + Object.keys(settlementStructureDefs).length,
  'Every runtime Practice and Structure has a distinct painting');
const rect={x:0,y:0,width:1400,height:600};
const times=[0,.01,3,3.125,8.25,100.75,1e6+.5];
const frames=times.map(t=>({frame:sampleSpriteFrame(t,clip),motes:Array.from({length:16},(_,i)=>sampleMote(t,i,rect)),sound:sampleChronicleScore(t)}));
for(const index of [6,2,0,4,3,1,5,2,6,0]) {
  const t=times[index];
  assert.deepEqual({frame:sampleSpriteFrame(t,clip),motes:Array.from({length:16},(_,i)=>sampleMote(t,i,rect)),sound:sampleChronicleScore(t)},frames[index],
    'Non-sequential and reverse seeks must reproduce the identical picture and audio sample');
}
assert.equal(resolveVisualTime(12,12.75),12.75);
assert.equal(resolveVisualTime(12,13.1),12,'Unavailable simulation snapshots cannot be visually extrapolated');
assert.equal(resolveVisualTime(12,NaN),12);
assert.equal(sampleEventProgress(4,5,2),null);
assert.equal(sampleEventProgress(6,5,2),.5);
assert.equal(sampleEventProgress(8,5,2),null);
assert.equal(sampleEventProgress(Infinity,5,2),null);
assert.equal(sampleSpriteFrame(NaN,clip),0);
assert.equal(loopPhase(123,0),0);
// An asymmetric bell decay must become a swell on rewind. The actual backward
// buffer reads forward PCM at duration-offset, independent of browser support.
for(const t of [0,.13,2.9,5.73,23.9,24,100.13]) {
  const offset=audioOffsetAtTime(t,true);
  assert.ok(Math.abs(sampleChronicleScore(t)-sampleChronicleScore(24-offset))<1e-9);
}
for(let i=0;i<24000;i++)assert.ok(Math.abs(sampleChronicleScore(i/1000))<=.15,'The original score remains quiet and cannot clip');
const nodes=Array.from({length:6},(_,i)=>({id:`n${i}`,depth:1,position:{x:0,y:.2+i*.01}}));
const original=JSON.stringify(nodes);
const positions=layoutChronicleNodes(nodes,{x:0,y:0,width:1000,height:400});
for(let i=1;i<6;i++)assert.ok(positions.get(`n${i}`).y-positions.get(`n${i-1}`).y>=79.9);
assert.equal(JSON.stringify(nodes),original,'Presentation layout cannot modify serialized graph coordinates');
const sparseNodes = [
  {id:'a',depth:1,position:{x:.1,y:.3}},
  {id:'b',depth:1,position:{x:.1,y:.55}},
  {id:'c',depth:2,position:{x:.2,y:.7}},
];
const sparseLayout = layoutChronicleNodes(sparseNodes,{x:0,y:0,width:2000,height:500});
assert.equal(sparseLayout.get('a').y,150,'Sparse columns preserve generated lane positions');
assert.equal(sparseLayout.get('b').y,275);
assert.equal(sparseLayout.get('c').y,350,'Single nodes are not forced to the centre');
assert.deepEqual(layoutChronicleNodes([...sparseNodes].reverse(),{x:0,y:0,width:2000,height:500}),sparseLayout,
  'Layout is stable regardless of iteration order');

const reveal = createForecastRevealState({
  targetDurationSec: 0.6,
  minRateSecPerSec: 480,
  startDelayMs: 0,
  followGapSec: 0,
});
reveal.startSecOverride = 40;
assert.equal(getDisplayHistoryEndSec(reveal, 40), 40, 'matching reveal start override is used as display history');
assert.equal(reveal.startSecOverride, 40);
assert.equal(getDisplayHistoryEndSec(reveal, 100), 100, 'a mismatched override is discarded');
assert.equal(reveal.startSecOverride, null);
reveal.historyEndSec = 100;
reveal.visibleEndSec = 180.9;
assert.equal(getVisibleForecastCoverageEndSec(reveal, 250, 100), 180,
  'visible coverage is the floored playhead, capped by actual forecast');
reveal.historyEndSec = 90;
assert.equal(getVisibleForecastCoverageEndSec(reveal, 250, 100), 100,
  'stale reveal history does not leak coverage past display history');
assert.equal(getForecastRevealFollowTargetEndSec(reveal, 700, 100, 100), 700,
  'zero follow gap keeps the follow target at the actual forecast end');
const followReveal = createForecastRevealState({ followGapSec: 60, followResponseSec: 0.9 });
for (const endSec of [1, 4, 100]) {
  const terminalReveal = createForecastRevealState({ followGapSec: 36, followResponseSec: 1.1 });
  resetForecastReveal(terminalReveal, 0, endSec, 0, 0);
  for (let now = 16; now <= 30000; now += 16) getAnimatedForecastCoverageEndSec(terminalReveal, now, 0);
  assert.equal(getVisibleForecastCoverageEndSec(terminalReveal, endSec, 0), endSec,
    'a settled reveal must expose the exact terminal tick, including one-second forecasts');
}
{
  const cappedReveal = createForecastRevealState();
  setForecastRevealConfig(cappedReveal, SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT);
  cappedReveal.capEndSec = 101;
  resetForecastReveal(cappedReveal, 0, 101, 0, 0);
  let lastWholeSecondMs = null;
  let completedMs = null;
  for (let now = 16; now <= 10000; now += 16) {
    const visible = getAnimatedForecastCoverageEndSec(cappedReveal, now, 0);
    if (lastWholeSecondMs == null && visible >= 100) lastWholeSecondMs = now;
    if (visible >= 101) { completedMs = now; break; }
  }
  assert.ok(completedMs != null && lastWholeSecondMs != null);
  assert.ok(completedMs - lastWholeSecondMs <= 100,
    'a capped node reveal reaches its exact resolution boundary without a long terminal pause');
}
assert.equal(getForecastRevealFollowTargetEndSec(followReveal, 700, 100, 100), 640);
assert.equal(
  getForecastRevealDesiredVelocitySecPerSec(reveal, 700, 100, 100).desiredVelocitySecPerSec,
  1000,
  'ungapped reveal rate is remaining span over the target duration'
);
assert.equal(
  getForecastRevealDesiredVelocitySecPerSec(followReveal, 700, 100, 100).desiredVelocitySecPerSec,
  600
);
followReveal.capEndSec = 400;
assert.equal(getForecastRevealFollowTargetEndSec(followReveal, 700, 100, 100), 700,
  'an explicit reveal cap disables the follow gap');
followReveal.capEndSec = null;
resetForecastReveal(reveal, 100, 700, 100, 0);
assert.equal(reveal.velocitySecPerSec, 1000);
assert.equal(getAnimatedForecastCoverageEndSec(reveal, 100, 100), 200,
  'one tenth of a second at 1000 sec/sec reveals 100 forecast seconds');
pauseForecastReveal(reveal);
assert.equal(getAnimatedForecastCoverageEndSec(reveal, 250, 100), 200, 'pause freezes coverage');
const delayed = createForecastRevealState({ startDelayMs: 200, followGapSec: 0, minRateSecPerSec: 480 });
resetForecastReveal(delayed, 695, 700, 100, 0);
assert.equal(getForecastRevealEffectiveStartDelayMs(delayed, 700, 695, 100), 200);
assert.equal(getAnimatedForecastCoverageEndSec(delayed, 100, 100), 695,
  'start delay holds the playhead until the delay elapses');
followReveal.startDelayMs = 200;
assert.equal(getForecastRevealEffectiveStartDelayMs(followReveal, 700, 100, 100), 0,
  'a large remaining follow gap skips the configured start delay');
const restartReveal = createForecastRevealState({ followGapSec: 0, minRateSecPerSec: 480 });
restartForecastRevealFrom(restartReveal, 80, { extraStartDelayMs: 50 }, {
  actualHistoryEndSec: 100,
  actualForecastCoverageEndSec: 400,
  nowMs: 1000,
  activeForecastPreviewSec: 120,
});
assert.equal(restartReveal.startSecOverride, 80);
assert.equal(restartReveal.animatedEndSec, 100);
assert.equal(restartReveal.targetEndSec, 400);
assert.equal(restartReveal.previewSec, 120);
assert.equal(restartReveal.delayUntilMs, 1050);
assert.equal(getRenderedHistoryEndSec(restartReveal, 100, 400, null, { treatRevealedForecastAsHistory: false }), 100);
restartReveal.historyEndSec = 100;
restartReveal.visibleEndSec = 180;
assert.equal(getRenderedHistoryEndSec(restartReveal, 100, 400, null, { treatRevealedForecastAsHistory: true }), 180);
syncForecastRevealTarget(restartReveal, 50, 40, 2000);
assert.equal(restartReveal.targetEndSec, 50, 'a shorter actual coverage resets the reveal');
setForecastRevealConfig(restartReveal, { targetDurationSec: 1.2 });
assert.equal(restartReveal.targetDurationSec, 1.2);
setForecastRevealConfig(restartReveal, {});
assert.equal(restartReveal.targetDurationSec, 0.6, 'omitted config fields restore constructor defaults');
assert.equal(
  resolveForecastRevealPlayheadFollowSec(restartReveal, {
    visibleForecastCoverageEndSec: 180.9,
    minSec: 0,
    maxSec: 320,
  }),
  180
);
suspendForecastRevealPlayheadFollow(restartReveal);
assert.equal(resolveForecastRevealPlayheadFollowSec(restartReveal, {
  visibleForecastCoverageEndSec: 180,
}), null);
restartReveal.playheadFollowEnabled = true;
restartReveal.previewSec = 150;
assert.equal(
  resolveForecastRevealPreviewTarget(restartReveal, 180, 200, { historyEndSec: 100 }),
  180
);
assert.equal(
  resolveForecastRevealPreviewTarget(restartReveal, 180, 200, { historyEndSec: 100, isScrubbing: true }),
  null
);
assert.equal(pointerLocalXToSec(60, { x: 10, w: 100 }, 0, 100), 50);
assert.equal(clampScrubSecToRevealCap(500, 100, 200, { minSec: 0, maxSec: 1000 }), 200);
assert.equal(clampScrubSecToRevealCap(50, 100, 200, { minSec: 0, maxSec: 1000 }), 50);
const scrub = createScrubSession({ forecastPreviewStatusNote: 'Viewing forecast' });
setLatchedForecastScrub(scrub, 180.9);
assert.equal(scrub.latchedForecastScrubSec, 180);
assert.equal(resolveLatchedForecastPreviewRestore(scrub, 100, 200), 'restore');
assert.equal(resolveLatchedForecastPreviewRestore(scrub, 180, 200), 'clear');
syncLatchedForecastPreview(scrub, restartReveal, {
  active: true,
  isForecastPreview: true,
  previewSec: 150,
}, (sec) => sec);
assert.equal(scrub.latchedForecastScrubSec, null, 'automatic reveal preview does not latch');
resetForecastPreviewState(scrub, restartReveal);
assert.equal(scrub.isScrubbing, false);
assert.equal(restartReveal.previewSec, null);

{
  const highWater = createScaleHighWaterState();
  const timelineA = { id: 'run-a' };
  const timelineB = { id: 'run-b' };
  const series = [{ id: 'food' }];
  syncScaleHighWaterTimeline(highWater, timelineA);
  const first = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 10, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(first.get('food').maxValue, 10);
  const receded = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 7, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(receded.get('food').maxValue, 10, 'run-scoped high-water never recedes');
  syncScaleHighWaterTimeline(highWater, timelineA);
  const sameTimeline = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 4, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(sameTimeline.get('food').maxValue, 10, 'same timeline identity keeps high-water');
  const otherSubject = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 3, groupId: 'resources' }]]),
    series,
    'settlement:region-1'
  );
  assert.equal(otherSubject.get('food').maxValue, 3, 'subject keys isolate high-water groups');
  const fixed = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['gold', { maxValue: 8, scaleMode: 'fixed' }]]),
    [{ id: 'gold' }],
    'civilization'
  );
  assert.equal(fixed.get('gold').maxValue, 8, 'fixed series are not raised to high-water');
  syncScaleHighWaterTimeline(highWater, timelineB);
  const reset = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 4, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(reset.get('food').maxValue, 4, 'a new timeline identity resets high-water');
}

{
  const cache = createPlotSnapshotCache();
  assert.equal(isPlotSnapshotCacheHit(cache, 'k'), false);
  assert.equal(quantizePlotSnapshotMinSec(20, 32), 0);
  assert.equal(quantizePlotSnapshotMaxSec(0, 33, 32), 64);
  assert.equal(
    buildPlotSnapshotKey({
      cacheVersion: 3,
      snapshotMinSec: 0,
      snapshotMaxSec: 64,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    '3|0:64|10|0|stable'
  );
  storePlotSnapshot(cache, '3|0:64|10|0|stable', {
    data: { cacheVersion: 3 },
    snapshotMinSec: 0,
    displayHistoryEndSec: 10,
    zoomed: false,
    sampleCursorSec: null,
    visibleForecastCoverageEndSec: 18.9,
  });
  assert.equal(isPlotSnapshotCacheHit(cache, '3|0:64|10|0|stable'), true);
  assert.equal(resolvePlotSnapshotStablePrefixEndSec(cache.snapshot, 40, 10), 18);
  assert.equal(
    isPreviousPlotSnapshotCompatible(cache.snapshot, {
      freezeRevealedPlotPrefix: true,
      cacheVersion: 3,
      snapshotMinSec: 0,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    true
  );
  assert.equal(
    isPreviousPlotSnapshotCompatible(cache.snapshot, {
      freezeRevealedPlotPrefix: false,
      cacheVersion: 3,
      snapshotMinSec: 0,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    false
  );
  invalidatePlotSnapshot(cache);
  assert.equal(cache.snapshot, null);
  assert.equal(cache.key, '');
  assert.equal(resolvePlotSnapshotTargetMaxSec(cache, 50, 0, 0), 50);
  assert.equal(resolvePlotSnapshotTargetMaxSec(cache, 50, 0, 16), 66);
  assert.equal(
    resolvePlotSnapshotTargetMaxSec(cache, 52, 0, 16),
    66,
    'lead hysteresis keeps the previous target'
  );
  assert.equal(
    resolvePlotSnapshotTargetMaxSec(cache, 80, 0, 16),
    96,
    'a target past the stored high-water resets'
  );
}

{
  const none = createBootFadeState({ durationMs: 0, color: 0xffffff });
  beginBootFadeTransition(none, 0);
  assert.equal(none.transition, null, 'zero-duration boot fade never starts');
  assert.equal(getBootFadeRenderState(none, 0), null);
  const fade = createBootFadeState({ durationMs: 1000, color: 0x123456 });
  beginBootFadeTransition(fade, 0);
  const start = getBootFadeRenderState(fade, 0);
  assert.equal(start.color, 0x123456);
  assert.equal(start.alpha, 1);
  assert.equal(start.key, 0);
  const mid = getBootFadeRenderState(fade, 500);
  assert.equal(mid.alpha, 0.5);
  assert.equal(mid.key, Math.floor(500 / GRAPH_BOOT_FADE_FRAME_MS));
  assert.equal(getBootFadeRenderState(fade, 1000), null, 'completed fade clears itself');
  assert.equal(fade.transition, null);
  beginBootFadeTransition(fade, 10);
  clearBootFadeTransition(fade);
  assert.equal(getBootFadeRenderState(fade, 20), null);
}

{
  const boundStep = (delta, elapsedMs) => Math.max(
    1,
    Math.floor(
      Math.max(
        TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
        Math.min(
          TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
          Math.abs(delta) / Math.max(0.05, TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC)
        )
      ) * (Math.max(0, elapsedMs) / 1000)
    )
  );
  const bounds = createTimeBoundsState();
  assert.equal(bounds.minSec, 0);
  assert.equal(bounds.maxSec, 0);
  assert.equal(bounds.animatedMinSec, null);
  resetAnimatedTimeBounds(bounds, -4.7, 12.9, 10);
  assert.equal(bounds.minSec, 0);
  assert.equal(bounds.maxSec, 12);
  assert.equal(bounds.animatedMinSec, 0);
  assert.equal(bounds.animatedMaxSec, 12);
  assert.equal(bounds.animatedBoundsLastTickMs, 10);
  setTimeBounds(bounds, 8, 3, { animate: false, nowMs: 20 });
  assert.equal(bounds.minSec, 8);
  assert.equal(bounds.maxSec, 9, 'max never falls below min + 1');
  clearAnimatedTimeBounds(bounds);
  assert.equal(bounds.animatedMinSec, null);
  assert.equal(bounds.animatedMaxSec, null);
  assert.equal(bounds.animatedBoundsLastTickMs, 0);
  assert.equal(bounds.minSec, 8, 'clear leaves displayed bounds in place');
  setTimeBounds(bounds, 0, 100, { animate: true, nowMs: 30 });
  assert.equal(bounds.minSec, 0, 'null animated bounds snap even when animate is requested');
  assert.equal(bounds.maxSec, 100);
  setTimeBounds(bounds, 0, 10000, { animate: true, nowMs: 46 });
  assert.equal(bounds.maxSec, 100 + boundStep(9900, 16));
  assert.equal(animateBoundToward(100, 100, 16), 100);
  assert.equal(animateBoundToward(Number.NaN, 50.9, 16), 50);
  assert.equal(animateBoundToward(1000, 0, 16), 1000 - boundStep(1000, 16));
  assert.equal(animateBoundToward(5, 8, 0), 6, 'zero elapsed still moves one second');
  setTimeBounds(bounds, 500, 10000, { animate: true, nowMs: 62 });
  assert.equal(bounds.minSec, 500, 'a later min snaps forward instead of waiting on the lerp');
}

{
  const replacement = createProjectionReplacementState();
  const ranges = new Map([['food', { maxValue: 12 }]]);
  const snapshot = {
    pointsForDraw: [{ tSec: 0 }, { tSec: 10 }],
    displayHistoryEndSec: 40,
    historyEndSec: 30,
    seriesScaleRanges: ranges,
  };
  assert.equal(
    stageProjectionReplacementTransition(replacement, { snapshot: { pointsForDraw: [] } }),
    false
  );
  assert.equal(replacement.staged, null);
  assert.equal(
    stageProjectionReplacementTransition(replacement, { snapshot, fallbackMaxSec: 80 }),
    true
  );
  assert.equal(replacement.staged.truncationStartSec, 40);
  assert.equal(replacement.staged.maxSecFloor, 80);
  assert.equal(
    stageProjectionReplacementTransition(replacement, {
      snapshot,
      truncationStartSec: 25.9,
      maxSecFloor: 100.2,
      transitionDurationMs: 1000,
      flashDurationMs: 200,
      fadeStrength: 1,
    }),
    true
  );
  assert.equal(replacement.staged.truncationStartSec, 25);
  assert.equal(replacement.staged.maxSecFloor, 100);
  activateProjectionReplacementTransition(replacement, 0, {
    activateProjectionReplacementTransition: true,
  });
  assert.equal(replacement.staged, null);
  assert.equal(replacement.active.startedMs, 0);
  assert.equal(getProjectionReplacementMaxFloorSec(replacement), 100);
  assert.equal(getProjectionReplacementScaleRanges(replacement), ranges);
  assert.deepEqual(getProjectionReplacementDebugState(replacement), {
    active: true,
    truncationStartSec: 25,
    maxSecFloor: 100,
    hasSnapshot: true,
  });
  assert.equal(getProjectionReplacementRenderKey(replacement, 0), '25:100:0');
  assert.equal(
    getProjectionReplacementRenderKey(replacement, PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS),
    '25:100:1'
  );
  const flash = buildProjectionReplacementRenderState(replacement, 0, 50);
  assert.equal(flash.settled, false);
  assert.equal(flash.transitionAnimating, true);
  assert.equal(flash.drawStartSec, 50);
  assert.equal(flash.drawEndSec, 100);
  assert.equal(flash.unchangedStartSec, 50);
  assert.equal(flash.unchangedEndSec, 25);
  assert.equal(flash.zoneAlpha, PROJECTION_REPLACEMENT_FLASH_ALPHA);
  assert.equal(flash.lineAlpha, PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA);
  assert.equal(flash.tintStrength, 0.74);
  assert.equal(flash.tintColor, TIMEGRAPH_THEME.eventMarkerCritical);
  const settled = buildProjectionReplacementRenderState(replacement, 1000, 50);
  assert.equal(settled.settled, true);
  assert.equal(settled.transitionAnimating, false);
  assert.equal(settled.zoneAlpha, PROJECTION_REPLACEMENT_DIM_ALPHA);
  assert.equal(settled.lineAlpha, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA);
  assert.equal(settled.tintStrength, 0.88);
  assert.equal(settled.tintColor, TIMEGRAPH_THEME.panelBorder);
  assert.equal(getProjectionReplacementRenderKey(replacement, 1000), '');
  assert.equal(
    buildProjectionReplacementRenderState(replacement, 1000, 100),
    null,
    'coverage past the replacement floor clears the overlay'
  );
  assert.equal(replacement.active, null);
  stageProjectionReplacementTransition(replacement, {
    snapshot,
    truncationStartSec: 10,
    maxSecFloor: 40,
    fadeStrength: 0.5,
  });
  activateProjectionReplacementTransition(replacement, 5, {});
  assert.equal(replacement.staged, null, 'restart without activate drops the staged overlay');
  assert.equal(replacement.active, null);
  stageProjectionReplacementTransition(replacement, {
    snapshot,
    truncationStartSec: 10,
    maxSecFloor: 40,
    transitionDurationMs: 0,
    fadeStrength: 0.5,
  });
  activateProjectionReplacementTransition(replacement, 0, {
    activateProjectionReplacementTransition: true,
  });
  const dimmed = buildProjectionReplacementRenderState(replacement, 0, 10);
  assert.equal(dimmed.settled, true);
  assert.equal(dimmed.zoneAlpha, lerpNumber(0, PROJECTION_REPLACEMENT_DIM_ALPHA, 0.5));
  assert.equal(dimmed.lineAlpha, lerpNumber(1, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA, 0.5));
  activateProjectionReplacementTransition(replacement, 0, {
    clearProjectionReplacementTransition: true,
  });
  assert.equal(replacement.active, null);
  clearProjectionReplacementTransition(replacement);
  assert.equal(replacement.staged, null);
}

{
  const cache = createActionSecondsCache();
  const timeline = { _actionSecondsVersion: 1 };
  const first = getActionSecs(cache, timeline, 0, 10);
  const again = getActionSecs(cache, timeline, 0, 10);
  assert.equal(again, first, 'same version and range reuses the cached action seconds');
  const otherRange = getActionSecs(cache, timeline, 0, 20);
  assert.notEqual(otherRange, first, 'a range change replaces the action-second cache');
  const nextVersion = getActionSecs(cache, { _actionSecondsVersion: 2 }, 0, 20);
  assert.notEqual(nextVersion, otherRange, 'an action-seconds version change replaces the cache');
  const markers = getMarkerActionSecs(cache, timeline, 0, 10, 64);
  const markersAgain = getMarkerActionSecs(cache, timeline, 0, 10, 64);
  assert.equal(markersAgain, markers, 'same marker range and cap reuse the sampled cache');
  const widerCap = getMarkerActionSecs(cache, timeline, 0, 10, 128);
  assert.notEqual(widerCap, markers, 'a marker cap change replaces the sampled cache');
}

{
  const flash = createSeriesScaleMaxFlashState();
  assert.equal(triggerSeriesScaleMaxFlash(flash, {}), false);
  const previousRanges = new Map([['food', { maxValue: 10 }], ['gold', { maxValue: 4 }]]);
  const nextRanges = new Map([['food', { maxValue: 12 }], ['gold', { maxValue: 4 }]]);
  const visibleMaxValues = new Map([['food', 12], ['gold', 4]]);
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges,
      visibleMaxValues,
      nowMs: 100,
    }),
    true
  );
  assert.equal(flash.bySeriesId.get('food').startedMs, 100);
  assert.equal(flash.bySeriesId.get('food').durationMs, SERIES_SCALE_MAX_FLASH_DURATION_MS);
  assert.equal(flash.bySeriesId.has('gold'), false, 'unchanged series do not flash');
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges: new Map([['food', { maxValue: 10 }]]),
      visibleMaxValues,
      nowMs: 200,
    }),
    false,
    'a receding max does not flash'
  );
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges,
      visibleMaxValues: new Map([['food', 11]]),
      nowMs: 200,
    }),
    false,
    'a max the visible window has not reached does not flash'
  );
  clearSeriesScaleMaxFlash(flash);
  assert.equal(flash.bySeriesId.size, 0);
}

assert.equal(getSettlementGraphMetric('settlement'), GRAPH_METRICS.settlement);
assert.equal(getSettlementGraphMetric('civilization'), GRAPH_METRICS.civilization);
assert.equal(getSettlementGraphRevealConfig('pendingCommit'), SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT);
assert.equal(getSettlementGraphRevealConfig('default'), SETTLEMENT_GRAPH_REVEAL_DEFAULT);
assert.equal(resolveEffectiveSettlementGraphHorizonSec(null), SETTLEMENT_GRAPH_WINDOW_SEC);
assert.equal(resolveEffectiveSettlementGraphHorizonSec(2048), 2048);

// The recap must be ready for the current paint before the graph replays its
// newly authoritative samples, which can take a substantial browser frame.
{
  const calls = [];
  let scheduledRefresh = null;
  const vassal = { vassalId: 'v1', lifeMap: { pendingResolution: {
    nodeId: 'n1', startSec: 0, resolveSec: 100, phaseCost: 100,
  } } };
  let state = { tSec: 0, civilization: { vassalLineage: {
    currentVassalId: 'v1', vassalsById: { v1: vassal },
  } } };
  const session = createSettlementGraphSession({
    getFrontierState: () => state,
    getFrontierSec: () => 100,
    getForecastController: () => ({ processPendingCommit: () => {
      state = { ...state, tSec: 100, civilization: { vassalLineage: {
        currentVassalId: 'v1', vassalsById: { v1: {
          ...vassal, lifeMap: { pendingResolution: null },
        } },
      } } };
    } }),
    getGraphController: () => ({ refreshAuthoritativeRangeFrom: () => calls.push('refresh') }),
    getGraphView: () => ({ render: () => calls.push('render') }),
    onPendingResolutionSettled: () => calls.push('recap'),
    scheduleAfterPaint: (callback) => { scheduledRefresh = callback; },
  });
  assert.equal(session.processSettlementPendingCommit(), true,
    'the frame knows a resolution recap opened');
  assert.deepEqual(calls, ['recap'], 'the recap is prepared before graph history refresh');
  assert.equal(typeof scheduledRefresh, 'function');
  scheduledRefresh();
  assert.deepEqual(calls, ['recap', 'refresh'], 'graph history refresh follows the recap paint');
}

// The graph can reveal the last node second while an earlier commit chunk is
// still inside its pacing interval. Resolution should then finish promptly.
{
  let frontierSec = 0;
  let revealedSec = 144;
  const vassal = { vassalId: 'v1', lifeMap: { pendingResolution: {
    nodeId: 'n1', startSec: 0, resolveSec: 160,
  } } };
  const state = { civilization: { vassalLineage: {
    currentVassalId: 'v1', vassalsById: { v1: vassal },
  } } };
  const controller = createSettlementForecastController({
    getFrontierSec: () => frontierSec,
    getFrontierState: () => state,
    getViewedSec: () => 0,
    getRevealedCoverageEndSec: () => revealedSec,
    getControllerSummaryAt: () => ({ runComplete: false }),
    getControllerStateDataAt: () => null,
    commitCursorSecond: (sec) => {
      frontierSec = sec;
      if (sec >= 160) vassal.lifeMap.pendingResolution = null;
      return { ok: true };
    },
    browseCursorSecond: () => ({ ok: true }),
    clearPreviewState: () => {},
    setPlaybackViewSec: () => {},
    autoCommitBufferSec: 16,
    autoCommitChunkSec: 128,
    autoCommitMinIntervalMs: 900,
    autoCommitForceLagSec: 448,
    autoCommitFallbackMs: 1800,
  });
  controller.schedulePendingCommit(0, vassal);
  controller.processPendingCommit();
  assert.equal(frontierSec, 128, 'the first chunk follows the visible reveal');
  controller.processPendingCommit();
  assert.equal(frontierSec, 128, 'commit pacing still applies before the final second is visible');
  revealedSec = 160;
  controller.processPendingCommit();
  assert.equal(frontierSec, 160,
    'the final visible second resolves without waiting for the commit interval');
}

{
  const calls = [];
  const graphController = {
    getData: () => ({ subjectKey: 'civilization' }),
    setMetric: (metric) => calls.push(['setMetric', metric]),
    setSubject: (subject, key) => calls.push(['setSubject', subject, key]),
    setHorizonSecOverride: (sec) => calls.push(['setHorizon', sec]),
    ensureCache: () => calls.push(['ensureCache']),
    refreshAuthoritativeRangeFrom: (sec) => calls.push(['refreshFrom', sec]),
  };
  const graphView = {
    clearProjectionReplacementTransition: () => calls.push(['clearTransition']),
    resetDataContext: () => calls.push(['resetDataContext']),
    render: () => calls.push(['render']),
    setForecastRevealConfig: (config) => calls.push(['setRevealConfig', config]),
    restartForecastRevealFrom: (sec, opts) => calls.push(['restartReveal', sec, opts]),
    clearForecastRevealRestart: () => calls.push(['clearRevealRestart']),
  };
  const seriesMenu = {
    setContext: (scope) => calls.push(['setContext', scope]),
    selectDefaultGroup: () => calls.push(['selectDefaultGroup']),
    syncSelection: () => calls.push(['syncSelection']),
  };
  let worldMode = 'map';
  let frontierState = {
    civilization: {
      vassalLineage: {
        currentVassalId: 'v1',
        vassalsById: {
          v1: { endedReason: 'died' },
        },
      },
    },
  };
  const forecastController = {
    getRevealMode: () => (frontierState.civilization.vassalLineage.currentVassalId ? 'pendingCommit' : 'default'),
    syncHorizon: () => calls.push(['syncHorizon']),
    processPendingCommit: ({ clearForecastRevealRestart }) => {
      calls.push(['processPendingCommit']);
      clearForecastRevealRestart?.();
      frontierState = {
        civilization: {
          vassalLineage: {
            currentVassalId: null,
            vassalsById: { v1: { endedReason: 'died' } },
          },
        },
      };
    },
  };
  const session = createSettlementGraphSession({
    getGraphController: () => graphController,
    getGraphView: () => graphView,
    getForecastController: () => forecastController,
    getSeriesMenu: () => seriesMenu,
    getSelectedWorldRegionId: () => 'river-crown',
    getFrontierState: () => frontierState,
    getFrontierSec: () => 320,
    setWorldViewMode: (mode) => {
      worldMode = mode;
      calls.push(['setWorldViewMode', mode]);
    },
  });
  assert.equal(session.getSettlementGraphScope(), 'civilization');
  assert.equal(session.getSettlementGraphMetric(), GRAPH_METRICS.civilization);
  session.setSettlementGraphContext('settlement', 'river-crown');
  assert.equal(session.getSettlementGraphScope(), 'settlement');
  assert.equal(session.getSettlementGraphMetric(), GRAPH_METRICS.settlement);
  assert.deepEqual(calls.slice(0, 7), [
    ['clearTransition'],
    ['setMetric', GRAPH_METRICS.settlement],
    ['setSubject', { regionId: 'river-crown' }, 'river-crown'],
    ['setContext', 'settlement'],
    ['selectDefaultGroup'],
    ['syncSelection'],
    ['ensureCache'],
  ]);
  session.setSettlementGraphHorizonOverride(4096);
  assert.equal(session.getEffectiveSettlementGraphHorizonSec(), 4096);
  session.syncSettlementGraphRevealConfig();
  assert.equal(calls.at(-1)?.[1], SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT);
  session.syncSettlementGraphRevealConfig();
  session.processSettlementPendingCommit();
  assert.equal(worldMode, 'map');
  assert.ok(calls.some((entry) => entry[0] === 'clearRevealRestart'));
  assert.ok(calls.some((entry) => entry[0] === 'restartReveal' && entry[1] === 320));
  const ended = session.revealCivilizationAfterVassalEnd('missing');
  assert.equal(ended, false);
}

// Returning from a death recap is navigation, which pauses the graph. The
// gameplay reveal must restart after that navigation, without a node-end cap.
{
  const { createSettlementVassalFlow } = await import('../src/views/ui-root/settlement-vassal-flow.js');
  for (const endedReason of ['died', 'retired']) {
    const state = { tSec: 320, civilization: { vassalLineage: {
      currentVassalId: null, vassalsById: { v1: { endedReason } },
    } } };
    let revealing = false;
    const session = createSettlementGraphSession({
      getFrontierState: () => state,
      getFrontierSec: () => 320,
      getGraphView: () => ({ restartForecastRevealFrom: (sec, options) => {
        assert.equal(sec, 320);
        assert.equal(options.revealTargetEndSec, undefined);
        revealing = true;
      } }),
    });
    const flow = createSettlementVassalFlow({
      playback: { getSettlementFrontierState: () => state },
      setWorldViewMode: () => { revealing = false; },
      revealCivilizationAfterVassalEnd: session.revealCivilizationAfterVassalEnd,
    });
    flow.noteResolutionSettled({ beforeState: state, beforeVassalId: 'v1' });
    session.revealCivilizationAfterVassalEnd('v1');
    flow.dismissResolutionRecap();
    assert.equal(revealing, true, `${endedReason} recap dismissal continues civilization unveil`);
    flow.noteResolutionSettled({ beforeState: state, beforeVassalId: 'v1' });
    flow.resetSelectionForFreshRun();
    assert.equal(flow.getResolutionRecap(), null, 'a fresh run clears the prior recap');
  }
}

{
  const { createRunCompletePresentation, getRunCompleteInfo } = await import('../src/views/run-complete-presentation.js');
  const { getCivilizationSurvivalViewModel } = await import('../src/views/civilization-survival-hud.js');
  const { createEmptyState } = await import('../src/model/state.js');
  const alive = createEmptyState();
  const lost = createEmptyState();
  lost.runStatus = { complete: true, reason: 'redGodMonsterOverrun', year: 12, tSec: 352 };
  const before = JSON.stringify(lost);
  const ui = createRunCompletePresentation();
  const timeline = {};
  const sync = (frontierState, viewedState, revision = 0) => ui.sync({frontierState, viewedState, timeline, revision});
  assert.equal(sync(alive, alive).open, false, 'a living run has no loss popup');
  assert.equal(sync(alive, lost).opened, true, 'reaching a forecasted loss opens its explanation');
  assert.equal(ui.getSnapshot().info.projected, true);
  const forecastStrip = getCivilizationSurvivalViewModel(lost, { observedEnd: ui.getSnapshot().info });
  assert.equal(forecastStrip.runComplete, false,
    'a viewed terminal forecast is still labelled as foreseen survival');
  assert.equal(forecastStrip.endDetails.title, 'FORESEEN EXTINCTION');
  assert.equal(forecastStrip.endDetails.projected, true);
  ui.minimize();
  assert.equal(sync(alive, alive).open, false, 'scrubbing back does not reopen a minimised popup');
  assert.equal(ui.getSnapshot().indicatorVisible, true, 'the observed loss remains visible in history');
  assert.equal(getCivilizationSurvivalViewModel(alive, { observedEnd: ui.getSnapshot().info }).projectedLossYear, 12);
  assert.equal(sync(alive, alive, 1).info, null, 'an intervention clears the obsolete forecast');
  assert.equal(sync(lost, alive, 2).opened, true, 'a confirmed loss opens even while browsing an earlier year');
  const confirmed = ui.getSnapshot().info;
  assert.equal(confirmed.title, 'GAME OVER');
  assert.match(confirmed.explanation, /taken every player settlement/);
  ui.minimize();
  assert.equal(sync(lost, alive, 2).open, false);
  const strip = getCivilizationSurvivalViewModel(alive, { observedEnd: confirmed });
  assert.equal(strip.runComplete, true);
  assert.equal(strip.actualLossYear, 12, 'history cannot replace the final loss year with Unfolding');
  assert.equal(strip.endDetails.title, 'GAME OVER');
  assert.equal(strip.endDetails.year, 12);
  assert.equal(strip.endDetails.projected, false);
  assert.equal(getCivilizationSurvivalViewModel(alive).endDetails, null);
  ui.reopen();
  assert.equal(ui.getSnapshot().open, true);
  assert.equal(ui.sync({frontierState:alive, viewedState:alive, timeline:{}, revision:0}).info, null,
    'a new run clears the old banner');
  assert.equal(JSON.stringify(lost), before, 'presentation does not mutate the loss state');
  assert.equal(getRunCompleteInfo({...lost,runStatus:{...lost.runStatus,reason:'futureLoss'}}).cause, 'Civilization lost');
}
console.log('[presentation-time] OK: gamepiece art, reversible presentation, timegraph reveal/scrub, and persistent loss presentation');
