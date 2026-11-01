import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

const output='artifacts/control-frontiers';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),page=await browser.newPage();
try{
 await page.goto('http://localhost:5185/');
 await page.waitForFunction(()=>!!globalThis.PIXI);
 const results=await page.evaluate(async()=>{
  const {addTerritoryBorder,territoryBoundarySegments}=await import('/src/views/world-map/territory-art.js');
  const app=new PIXI.Application({width:260,height:240,backgroundColor:0x102018});app.stop();
  const square=(id,x,y,w,h,kind,reverse=false)=>({regionId:id,points:(reverse?[[x,y],[x,y+h],[x+w,y+h],[x+w,y]]:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]).flat(),
    player:kind==='player',monster:kind==='monster',crown:kind==='crown',controller:kind==='crown'?'external-a':kind==='player'?'player':'frontier'});
  function paint(zones,order){
    const stage=new PIXI.Container(),segments=territoryBoundarySegments(zones);
    for(const i of order){const t=zones[i];addTerritoryBorder(stage,t.points,{...t,boundarySegments:segments.get(t.regionId)});}
    app.renderer.render(stage);const pixels=app.renderer.extract.pixels();stage.destroy({children:true});return pixels;
  }
  const pixel=(pixels,x,y)=>Array.from(pixels.slice((y*260+x)*4,(y*260+x)*4+4));
  const output=[];
  for(const [left,right,selected] of [['player','monster',false],['crown','player',false],['crown','monster',false],['player','monster',true]]){
    const zones=[square('a',20,20,100,200,left),square('b',120,20,100,200,right,true)];zones[0].selected=selected;
    const a=paint(zones,[0,1]),b=paint(zones,[1,0]);let differing=0;
    for(let y=34;y<206;y++)for(let x=112;x<128;x++)for(let c=0;c<4;c++)if(a[(y*260+x)*4+c]!==b[(y*260+x)*4+c])differing++;
    output.push({left,right,selected,differing,leftPixel:pixel(a,118,100),rightPixel:pixel(a,121,100)});
  }
  const junction=[square('a',20,20,100,200,'player'),square('b',120,20,100,100,'crown'),square('c',120,120,100,100,'monster',true)];
  const reference=paint(junction,[0,1,2]);let differing=0;
  for(const order of [[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
    const actual=paint(junction,order);
    for(let y=104;y<136;y++)for(let x=104;x<136;x++)for(let c=0;c<4;c++)if(actual[(y*260+x)*4+c]!==reference[(y*260+x)*4+c])differing++;
  }
  output.push({junction:true,differing});app.destroy(true);return output;
 });
 for(const result of results){assert.equal(result.differing,0,'ownership frontier must be independent of draw order');
  if(!result.junction)assert.notDeepEqual(result.leftPixel,result.rightPixel,'both owners retain distinguishable colour');}
 writeFileSync(output+'/pixels.json',JSON.stringify(results,null,2));
 console.log('[control-frontiers] passed: opposing owners, selection, reversed winding and three-way split junction; exact draw-order-independent frontier pixels');
}finally{await browser.close();}
