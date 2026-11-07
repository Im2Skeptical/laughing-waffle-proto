import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {FULL_MAP_SEED_CARD_IDS} from '../src/defs/gamepieces/full-map-defs.js';
import {validateGameConfig} from '../src/model/game-config.js';
import {createTownMarket} from '../src/model/detailed-settlements/neutral-market.js';
import {changeController} from '../src/model/detailed-settlements/territory.js';
import {writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {runPracticeActivation} from '../src/model/detailed-settlements/practices.js';
import {stockCapacity} from '../src/model/detailed-settlements/stock.js';
import {getHousingCapacity} from '../src/model/detailed-settlements/queries.js';
import {getGamepieceFace} from '../src/model/gamepiece-presentation.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
const qualities=['bronze','silver','gold','diamond'];
const slot=(practiceId,tier='bronze')=>({practiceId,tier,stock:0,charge:0,work:0,instanceId:'starter-test'});
function fixture(id,workers=1,tier='bronze'){
 const state=createNewGameState(42);state.world.connections=[];
 for(const s of state.world.sites){s.detailedState.practiceSlots.fill(null);s.detailedState.structureSlots.fill(null);}
 const site=state.world.sites.find(s=>s.regionId===state.civilization.capitalRegionId),local=site.detailedState;
 writePopulationBins(local,[{classId:'villager',allegiance:'player',specialty:'ordinary',kind:'adults',age:null,count:workers*10}]);
 local.practiceSlots[0]=slot(id,tier);return{state,site,local,host:local.practiceSlots[0]};
}
function same(a,b,label){
 const actual=serializeGameState(a),expected=serializeGameState(b);
 if(JSON.stringify(actual)!==JSON.stringify(expected)){
  writeFileSync('artifacts/starter-economy-mismatch.json',JSON.stringify({actual,expected}));
  assert.fail(`${label}; artifacts/starter-economy-mismatch.json`);
 }
}
const state=createNewGameState(42),defs=state.gameConfig.gamepieces;
assert.equal(validateGameConfig(state.gameConfig).ok,true);
assert.equal(FULL_MAP_SEED_CARD_IDS.length,62);
for(const[kind,id]of[['practice','rm_scrubForaging'],['structure','rm_saggingStorehouse']]){
 const face=getGamepieceFace({},kind,id);assert.equal(face.reading.flavour,defs[kind==='practice'?'practices':'structures'][id].flavor,'authored inherited flavour reaches the actual inspector');
}
// Pure throughput/storage comparisons for matching basic roles, at every quality
// and at zero/one worker. Different production chains still need their enablers.
const pairs=[['fm_fallowFields','dryFarming'],['fm_woodlotRights','logging'],['fm_rubblePicking','quarrying'],['fm_villageWell','irrigating']];
let comparisons=0;
for(const[starter,normal]of pairs)for(const tier of qualities)for(const workers of[0,1])for(let season=0;season<4;season++){
 const a=fixture(starter,workers,tier),b=fixture(normal,workers,tier);
 a.state.currentSeasonIndex=b.state.currentSeasonIndex=season;
 runPracticeActivation(a.state,'season');runPracticeActivation(b.state,'season');
 assert(b.host.stock>=a.host.stock,`${normal} retains at least ${starter}'s seasonal output at ${tier}/${workers}/${season}`);
 assert(stockCapacity(b.state,b.local,b.host)>stockCapacity(a.state,a.local,a.host),`${normal} has greater storage`);
 comparisons++;
}
for(const tier of qualities){
 const a=fixture('rm_scrubForaging',1,tier),b=fixture('forage',1,tier);
 runPracticeActivation(a.state,'food','preRouting');runPracticeActivation(b.state,'food','preRouting');
 assert(b.host.stock>=a.host.stock,'ordinary Foraging never reduces retained food with the same worker');
 assert(stockCapacity(b.state,b.local,b.host)>stockCapacity(a.state,a.local,a.host),'ordinary Foraging has strictly greater storage at every quality');
 if(tier==='bronze')assert(b.host.stock>a.host.stock,'the first Bronze Foraging upgrade retains more food');
 const c=fixture('fm_hearthBarter',1,tier),d=fixture('barter',1,tier);
 for(const f of[c,d])for(const[index,id]of['logging','recordKeeping'].entries()){
  f.local.practiceSlots[index+1]=slot(id);f.local.practiceSlots[index+1].stock=1;
 }
 runPracticeActivation(c.state,'food','preRouting');runPracticeActivation(d.state,'birth');
 assert(d.host.stock>=c.host.stock,'ordinary Barter never reduces retained Currency with the same worker');
 assert(stockCapacity(d.state,d.local,d.host)>stockCapacity(c.state,c.local,c.host),'ordinary Barter has strictly greater Currency storage');
 assert.deepEqual(defs.practices.fm_hearthBarter.require,[],'the weak Currency producer does not deadlock towns without an Edible host');
 assert.equal(defs.practices.fm_hearthBarter.condition,defs.practices.barter.condition,'the same diversity condition prevents a free-currency advantage');
}
for(const[starter,normal,host]of[['fm_leakingGranary','granary','forage'],['rm_saggingStorehouse','storehouse','logging']])for(let qualityBonus=0;qualityBonus<4;qualityBonus++){
 const a=fixture(host),b=fixture(host);
 a.local.structureSlots[0]={structureId:starter,origin:0,width:1,placementId:'starter',qualityBonus};
 b.local.structureSlots[0]={structureId:normal,origin:0,width:1,placementId:'normal',qualityBonus};
 assert(stockCapacity(b.state,b.local,b.host)>stockCapacity(a.state,a.local,a.host),`${normal} improves actual capacity at quality ${qualityBonus}`);
}
assert(defs.structures.mudHouses.housing>defs.structures.fm_crumblingCottages.housing);
assert(defs.structures.timberHouse.housing/defs.structures.timberHouse.footprint>defs.structures.fm_crowdedTenement.housing/defs.structures.fm_crowdedTenement.footprint);
assert(defs.structures.longhouse.housing>defs.structures.fm_crowdedTenement.housing);
for(const type of ['forager','grain','timber','quarry','market']){
 const s=createNewGameState(42),town=s.world.sites.find(site=>site.neutral);
 town.neutral=createTownMarket(type);town.town.type=type;
 const expected=[...town.neutral.practices],count=s.world.sites.length;
 changeController(s,town.regionId,'player');
 assert.deepEqual(town.detailedState.practiceSlots.filter(Boolean).map(p=>p.practiceId),expected);
 assert(town.detailedState.practiceSlots.filter(Boolean).every(p=>FULL_MAP_SEED_CARD_IDS.includes(p.practiceId)));
 assert(town.detailedState.structureSlots.filter(Boolean).every(p=>FULL_MAP_SEED_CARD_IDS.includes(p.structureId)));
 assert.equal(town.detailedState.structureSlots[0].width,2,'damaged housing costs more space');
 assert.equal(s.world.sites.length,count,'first control creates no settlement');
}
const opening=[];
for(const seed of[1,23,42,83,1867,424242]){
 const s=initializeReplayClock(createNewGameState(seed)),players=s.world.regions.filter(r=>r.controller==='player').map(r=>r.id);
 for(const id of players)assert.equal(getHousingCapacity(s,id),30,'two damaged cottages retain initial player housing');
 advanceReplayStateToSecond(s,64);
 assert(players.every(id=>s.world.regions.find(r=>r.id===id).controller==='player'),'opening retains both player holdings for the first two years');
 assert(!s.runStatus?.complete,'degraded opening has a playable intervention window');
 opening.push({seed,playerHoldings:players.length,tSec:s.tSec});
}
const live=initializeReplayClock(createNewGameState(42)),timeline=createTimelineFromInitialState(live);
advanceReplayStateToSecond(live,64);
const loaded=initializeReplayClock(deserializeGameState(serializeGameState(live)),64);
advanceReplayStateToSecond(live,128);advanceReplayStateToSecond(loaded,128);same(live,loaded,'JSON continuation');
const replay=rebuildStateAtSecond(timeline,128);assert(replay.ok);same(replay.state,live,'authoritative replay');
writeFileSync('artifacts/starter-economy-report.json',JSON.stringify({comparisons,opening,firstControlTypes:5,json:true,replay:true},null,2));
console.log(`[starter-economy] ${comparisons} seasonal upgrade comparisons, all-quality storage/food/currency, five first-control recipes, six playable openings, JSON and replay passed`);
