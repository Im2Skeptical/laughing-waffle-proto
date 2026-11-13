import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState} from '../src/model/state.js';
import {buildProjectionChunkFromStateData} from '../src/model/projection-chunk.js';
import {SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,SETTLEMENT_GRAPH_FORECAST_CACHE_CAPACITY_SEC} from '../src/views/ui-root/settlement-timegraph-window.js';
export async function bakePerformanceStart(seed){
 const stateData=serializeGameState(createNewGameState(seed));
 // Prepare a complete cache-sized opening. Military protection can make the
 // world survive beyond this window; that is coverage, not a fictional loss.
 const endSec=Math.min(SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,SETTLEMENT_GRAPH_FORECAST_CACHE_CAPACITY_SEC);
 const forecast=buildProjectionChunkFromStateData(stateData,0,endSec);
 if(!forecast.ok)throw Error('Performance start forecast failed');
 const config=stateData.gameConfig;
 const body=data=>{const {gameConfig,...rest}=data;return rest;};
 return {format:1,stateData,lossSec:forecast.terminal?forecast.endSec:null,forecast:{...forecast,
  stateDataBySecond:[...forecast.stateDataBySecond].map(([sec,data])=>[sec,body(data)]),
  summaryBySecond:[...forecast.summaryBySecond],lastStateData:body(forecast.lastStateData)},config};
}
