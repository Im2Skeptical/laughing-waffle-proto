import assert from 'node:assert/strict';
import { routeSampleRoads } from '../images/dark-fantasy/map-generation-prototype/roads.js';
import { ferrySpans, bridgeSpans, sampleRoadPath } from '../images/dark-fantasy/map-generation-prototype/road-crossings.js';
import { ferryPose, roadBorderCrossings, landRoadSections } from '../src/views/world-map/road-crossings.js';
import { composePlayableTerrain } from '../images/dark-fantasy/map-generation-prototype/playable-terrain.js';

// Measure the actual road painter, including biome-specific timbers and bridge
// decks. A generic width constant test missed both oversized special cases.
function paintedRoadWidth(biome, river=false) {
  const oldDocument=globalThis.document,oldPixi=globalThis.PIXI;
  globalThis.document={createElement(){const pixels=new Set(),ctx={fillRect(x,y){pixels.add(`${x},${y}`);}};return {pixels,getContext:()=>ctx};}};
  globalThis.PIXI={Texture:{from:canvas=>({canvas})}};
  try {
    const width=64,height=32,waterIndices=new Uint8Array(width*height);
    if(river)for(let y=0;y<height;y++)for(let x=30;x<=34;x++)waterIndices[y*width+x]=16;
    const result=composePlayableTerrain({width,height,detail:2,texel:2,roadWidthScale:.32,roadsOnly:true,
      map:{seed:1,regions:[{biome,outline:[{x:2,y:2},{x:62,y:2},{x:62,y:30},{x:2,y:30}]}]},
      pixel:p=>p,world:(x,y)=>({x,y}),bounds:{minX:0,minY:0},land:new Uint8Array(width*height).fill(1),
      regionIds:new Int16Array(width*height),waterIndices,materialAt:()=>biome,ART:{},
      surfaces:{registerPaths(){},path:()=>0x887755},mixColour:a=>a,anchors:[],sites:[],connections:[],
      routedRoads:[[{x:8,y:16},{x:56,y:16}]],interactions:{mountainPass:0}});
    const ys=[...result.roadTexture.canvas.pixels].map(key=>key.split(',').map(Number)).filter(([x])=>x===(river?32:24)).map(([,y])=>y);
    return Math.max(...ys)-Math.min(...ys)+1;
  } finally {globalThis.document=oldDocument;globalThis.PIXI=oldPixi;}
}
const ordinaryWidth=paintedRoadWidth('plains');
assert.ok(paintedRoadWidth('swamp')<=ordinaryWidth,'swamp timber planks follow the same thin road width');
assert.ok(paintedRoadWidth('plains',true)<=ordinaryWidth+2,'bridge deck and abutments stay close to the road width');

const width=48,height=24,size=width*height,land=new Uint8Array(size).fill(1),waterIndices=new Uint8Array(size),regionIds=new Int16Array(size);
const fine=sampleRoadPath([{x:0,y:0},{x:4,y:0}]);
assert.deepEqual(fine,[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0}]);
assert.equal(ferrySpans(fine,p=>p.x===1).length,1,'a narrow island-water gap between route samples gets a crossing');
for(let y=0;y<height;y++)for(let x=19;x<=28;x++){land[y*width+x]=0;waterIndices[y*width+x]=1;}
const input={width,height,land,waterIndices,regionIds,materialAt:()=> 'plains',bounds:{minX:0,minY:0,maxX:width,maxY:height},pairs:[{a:0,b:1,id:'islands'}]};
const sites=[{x:6,y:12},{x:40,y:12}],before=JSON.stringify([...land,...waterIndices]);
assert.equal(routeSampleRoads(sites,input).length,0,'ordinary study still omits disconnected islands');
const roads=routeSampleRoads(sites,{...input,ferryConnections:true});
assert.equal(roads.length,1,'live connection has a complete presentation route');
assert.equal(roads[0].connectionId,'islands');
assert.deepEqual(roads,routeSampleRoads(sites,{...input,ferryConnections:true}));
const sea=p=>!land[Math.round(p.y)*width+Math.round(p.x)];
const spans=ferrySpans(roads[0],sea);
assert.equal(spans.length,1);
const sections=landRoadSections(roads[0],spans.map(span=>({points:span.points})));
assert.equal(sections.length,2,'road highlights stop at both docks');
assert.ok(sections.flat().every(p=>!sea(p)),'no solid highlight or border gate is painted on the ferry span');
assert.ok(!sea(spans[0].a)&&!sea(spans[0].b),'docks are on the two dry approaches');
assert.equal(bridgeSpans(roads[0],p=>waterIndices[Math.round(p.y)*width+Math.round(p.x)],1).length,0,'sea never becomes a river bridge');
assert.equal(JSON.stringify([...land,...waterIndices]),before,'routing never mutates geography');
const lagoonInput={...input,land:new Uint8Array(size).fill(1),ferryConnections:true};
const lagoonRoad=routeSampleRoads(sites,lagoonInput)[0];
const lagoonSpans=ferrySpans(lagoonRoad,p=>waterIndices[Math.round(p.y)*width+Math.round(p.x)]===1);
assert.equal(lagoonSpans.length,1,'open-water indices still require a ferry when the broad land mask includes the lagoon');
assert.equal(landRoadSections(lagoonRoad,lagoonSpans).length,2);
assert.deepEqual(ferryPose(spans[0].points,5),ferryPose(spans[0].points,53),'ferry loops deterministically');
assert.notDeepEqual(ferryPose(spans[0].points,5),ferryPose(spans[0].points,15),'ferry moves with viewed time');
const crossings=roadBorderCrossings([{x:0,y:5},{x:10,y:5}],[{from:{x:5,y:0},to:{x:5,y:10}}]);
assert.deepEqual(crossings,[{x:5,y:5,dx:1,dy:0}]);
assert.deepEqual(roadBorderCrossings([{x:0,y:5},{x:10,y:5}],[{from:{x:0,y:9},to:{x:10,y:9}}]),[]);
assert.deepEqual(ferrySpans([{x:0},{x:1}],()=>true),[],'no dock is invented without a dry bank');
console.log('[ready-roads] PASS island fallback, dry docks, no sea bridges, unchanged geography, reversible ferry poses and road/border intersections');
