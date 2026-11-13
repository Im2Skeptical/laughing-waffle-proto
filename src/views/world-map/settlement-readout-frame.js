// Accepted two-row settlement crest. Geometry is shared with hit-target tests.
export const TIGHT_CREST_OUTLINE=[-77,-37,77,-37,74,31,57,43,0,56,-57,43,-74,31];
export function settlementCrestGeometry({capital=false,unrest=false}={}){
 const top=capital?-76:unrest?-52:-44;
 return {top,bottom:56,bar:{x:0,y:-18,width:132},counter:{x:0,y:25},prestige:{x:0,y:25},countX:-31,prestigeX:39,
  countHit:{x:-69,y:-14,width:60,height:28},prestigeHit:{x:-9,y:-14,width:78,height:28}};
}
export function drawSettlementCrestFrame(g,c){
 g.clear().lineStyle(1.8,c.edge,1).beginFill(0x1b2420,.98).drawPolygon([...TIGHT_CREST_OUTLINE]).endFill();
 g.lineStyle(1,c.edge,.25).moveTo(-65,6).lineTo(65,6);
 g.lineStyle(0).beginFill(c.ownership,.98).drawPolygon([-70,10,-7,10,-7,43,-55,35,-68,29]).endFill();
 g.beginFill(c.prestige,.98).drawPolygon([-5,10,70,10,68,29,55,35,-5,43]).endFill();
}
