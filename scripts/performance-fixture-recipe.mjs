import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState} from '../src/model/state.js';
import {buildProjectionChunkFromStateData} from '../src/model/projection-chunk.js';
import {SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC} from '../src/views/ui-root/settlement-timegraph-window.js';
export async function bakePerformanceStart(){
 const stateData=serializeGameState(createNewGameState(123));
 const forecast=buildProjectionChunkFromStateData(stateData,0,SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC);
 if(!forecast.ok||!forecast.terminal)throw Error('Performance start must reach an exact loss boundary');
 const config=stateData.gameConfig;
 const body=data=>{const {gameConfig,...rest}=data;return rest;};
 return {format:1,stateData,lossSec:forecast.endSec,forecast:{...forecast,
  stateDataBySecond:[...forecast.stateDataBySecond].map(([sec,data])=>[sec,body(data)]),
  summaryBySecond:[...forecast.summaryBySecond],lastStateData:body(forecast.lastStateData)},config};
}
