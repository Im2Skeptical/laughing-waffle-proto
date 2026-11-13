// Three throwaway shapes on the real map, ?settlementReadout=plate|medallion|crest.
// Data, control thresholds and inspection meanings stay with the existing view.
export const COMBINED_READOUT_VARIANTS=['plate','medallion','crest'];
export const TIGHT_CREST_OUTLINE=[-77,-37,77,-37,74,31,57,43,0,56,-57,43,-74,31];

export function combinedReadoutGeometry(variant,{capital=false,unrest=false}={}){
 const top=capital?-76:unrest?-52:-44;
 if(variant==='plate')return {variant,top,bottom:42,bar:{x:0,y:-18,width:132},counter:{x:0,y:25},prestige:{x:0,y:25},countX:-31,prestigeX:39,
  countHit:{x:-69,y:-13,width:60,height:28},prestigeHit:{x:-9,y:-13,width:78,height:28}};
 if(variant==='medallion')return {variant,top,bottom:42,bar:{x:43,y:-18,width:100},counter:{x:-19,y:0},prestige:{x:17,y:25},countX:-31,prestigeX:39,
  countHit:{x:-71,y:-28,width:58,height:52},prestigeHit:{x:-9,y:-13,width:78,height:28}};
 if(variant==='crest')return {variant,top,bottom:86,bar:{x:0,y:-18,width:132},counter:{x:42,y:26},prestige:{x:-26,y:64},countX:-34,prestigeX:39,
  countHit:{x:-65,y:-17,width:60,height:35},prestigeHit:{x:-9,y:-13,width:78,height:28}};
 if(variant==='tightcrest')return {variant,top,bottom:56,bar:{x:0,y:-18,width:132},counter:{x:0,y:25},prestige:{x:0,y:25},countX:-31,prestigeX:39,
  countHit:{x:-69,y:-14,width:60,height:28},prestigeHit:{x:-9,y:-14,width:78,height:28}};
 return null;
}

export function drawCombinedPlate(g,c){
 g.lineStyle(1.7,c.edge,1).beginFill(0x1b2420,.98).drawRoundedRect(-78,-37,156,79,7).endFill();
 g.lineStyle(1,c.edge,.22).moveTo(-71,5).lineTo(71,5);
 g.lineStyle(0).beginFill(c.ownership,.98).drawRoundedRect(-73,9,64,30,4).endFill();
 g.beginFill(c.prestige,.98).drawRoundedRect(-7,9,80,30,4).endFill();
}

export function drawClippedMedallion(g,c){
 g.lineStyle(1.7,c.edge,1).beginFill(0x1b2420,.98).drawRoundedRect(-29,-37,131,79,6).endFill();
 g.lineStyle(0).beginFill(c.prestige,.98).drawRoundedRect(-1,9,98,30,4).endFill();
 const circle=[];
 for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;circle.push(-58+Math.cos(a)*30,Math.min(24,Math.sin(a)*30));}
 g.lineStyle(3,c.edge,1).beginFill(c.ownership,.98).drawPolygon(circle).endFill();
 g.lineStyle(1,c.edge,.35).moveTo(-76,23).lineTo(-40,23);
}

export function drawHangingCrest(g,c){
 g.lineStyle(1.8,c.edge,1).beginFill(0x1b2420,.98).drawPolygon([-77,-37,77,-37,71,35,37,49,35,75,0,86,-35,75,-37,49,-71,35]).endFill();
 g.lineStyle(1,c.edge,.25).moveTo(-65,6).lineTo(65,6);
 g.lineStyle(0).beginFill(c.ownership,.98).drawRoundedRect(-28,9,61,33,8).endFill();
 g.beginFill(c.prestige,.98).drawRoundedRect(-34,49,75,29,7).endFill();
}
export function drawTightCrest(g,c){
 g.lineStyle(1.8,c.edge,1).beginFill(0x1b2420,.98).drawPolygon([...TIGHT_CREST_OUTLINE]).endFill();
 g.lineStyle(1,c.edge,.25).moveTo(-65,6).lineTo(65,6);
 g.lineStyle(0).beginFill(c.ownership,.98).drawPolygon([-70,10,-7,10,-7,43,-55,35,-68,29]).endFill();
 g.beginFill(c.prestige,.98).drawPolygon([-5,10,70,10,68,29,55,35,-5,43]).endFill();
}

export function drawCombinedReadoutFrame(g,geometry,colours){
 g.clear();({plate:drawCombinedPlate,medallion:drawClippedMedallion,crest:drawHangingCrest,tightcrest:drawTightCrest}[geometry.variant])(g,colours);
}
