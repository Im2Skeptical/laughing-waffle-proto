import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createClassPortraitArt } from './vassal-class-art.js';
import { addInteractionFeedback } from './interaction-feedback.js';

const COPY = {
  warrior:{name:'WARLORD',lost:'Intelligence',stat:'Prowess',effects:['+1 Martial Force per point','15% increased RISK success chance per point'],abilities:[['Personal Retinue','+1 Martial Force per 10 held Prestige','retinue'],['Risk reward','+15 Prestige on RISK success','risk']],flavour:'Their courage outlives their name.'},
  scholar:{name:'PHILOSOPHER',lost:'Cunning',stat:'Ingenuity',effects:['+5% shop-quality chance per point','+1 Research on DISCOVERY per point'],abilities:[['Commissions','Gain Prestige each Commission completion','commission'],['Delve','Spend 10 years to reroll shop offers','delve']],flavour:'A patient mind leaves its mark.'},
};
const TIPS = {
  Cunning:'Each point adds 1 Prestige per completed node, on top of 3 base Prestige. Scholars replace this with Ingenuity and keep the base income.',
  Intelligence:'Each point discounts Prestige costs by 8%, capped at 60%. Costs round up. Warriors replace this with Prowess and lose the discount.',
  Wisdom:'Each completed node grants 2 base EXP plus Wisdom. Both classes retain this stat.',
  Effectiveness:'Each point discounts time costs by 8%, capped at 60%. Costs round up. This includes Scholar Delve.',
  Prowess:'Each point adds 1 to global Martial Force and increases RISK success by 15% of the base success chance. A 50% chance becomes 57.5% at 1 Prowess and 65% at 2. Success caps at 100%. Natural mortality is separate.',
  Ingenuity:'Each point adds 5% shop-quality chance and 1 Research on DISCOVERY. Above 100%, surplus chance rolls for another tier: 125% gives one guaranteed tier and a 25% chance of a second. Quality stops at Diamond; prices stay the same.',
  retinue:'Each 10 Prestige currently held adds 1 global Martial Force. Spending Prestige reduces this bonus. There is no population cap. Supplied Retinue improvements add Force directly.',
  risk:'Each successful RISK grants 15 extra Prestige alongside the action reward. Applies to all risky node actions, including Relic searches. Protection from a failed roll does not count as success.',
  commission:'Keep a Commission underway, complete it through your vassal’s nodes, then choose the next from three offers. Install a Practice: 20 Prestige. Finish a commissioned Structure: 40. Acquire a Relic: 60. Inheritance and autonomous civilization actions do not count.',
  delve:'Spend 10 base years to refresh this shop’s offers, discounted by Effectiveness. Costs no Prestige and can be repeated before purchases are staged. Time, aging and natural mortality resolve before new offers appear.',
};
function text(parent, copy, x, y, size=32, options={}) {
  const t=new PIXI.Text(copy,{fontFamily:'Georgia',fontSize:size,fill:RELIC.bone,lineHeight:size*1.18,wordWrap:true,wordWrapWidth:options.width??900,...options});t.position.set(x,y);parent.addChild(t);return t;
}
function panel(parent,x,y,w,h,bright=false) {const g=new PIXI.Graphics();paintRelicPanel(g,x,y,w,h,RELIC.night,bright?RELIC.gold:RELIC.brass,bright?3:2);parent.addChild(g);return g;}
function button(parent,x,y,w,h,copy,activate,disabled=false) {
  const r=new PIXI.Container();r.position.set(x,y);r.hitArea=new PIXI.Rectangle(0,0,w,h);r.eventMode=disabled?'none':'static';r.cursor=disabled?'default':'pointer';
  panel(r,0,0,w,h);if(copy){const t=text(r,copy,w/2,h/2,26,{fontWeight:'bold',fill:disabled?0x80867d:RELIC.bone});t.anchor.set(.5);}
  addInteractionFeedback(r,{x:0,y:0,width:w,height:h},{enabled:!disabled,onActivate:activate});parent.addChild(r);return r;
}

export function createProtovassalDossier({candidates:poolCandidates, selectedIndex, onPreview, onConfirm}) {
  const candidates=[...poolCandidates].sort((a,b)=>(a.founderClassId==='warrior'?0:1)-(b.founderClassId==='warrior'?0:1));
  const root=new PIXI.Container();root.position.set(432,116);root.eventMode='static';root.hitArea=new PIXI.Rectangle(0,0,1560,958);
  root.controls={};root.tipId=null;
  root.on('pointerdown',event=>event.stopPropagation());
  panel(root,0,0,1560,958);
  const selected=candidates.find(c=>c.candidateIndex===selectedIndex)??candidates[0];
  const classId=selected.founderClassId;const data=COPY[classId];
  text(root,data.name,40,86,54,{fontWeight:'bold'});text(root,`Unlocks ${classId.toUpperCase()}`,40,160,30,{fill:RELIC.gold});
  const art=createClassPortraitArt(classId,{size:440,founder:true});if(art){art.position.set(46,278);root.addChild(art);}
  text(root,data.flavour,40,774,26,{fontStyle:'italic',fill:0xb1b4a6,width:460});
  let tip=null;
  function inspect(id,anchorY) {
    if(tip){root.removeChild(tip);tip.destroy({children:true});tip=null;}
    root.tipId=id;
    tip=new PIXI.Container();tip.position.set(560,Math.min(490,Math.max(190,anchorY)));tip.eventMode='static';tip.on('pointerdown',e=>e.stopPropagation());
    panel(tip,0,0,930,300,true);text(tip,['retinue','risk','commission','delve'].includes(id)?data.abilities.find(a=>a[2]===id)[0]:id,24,22,36,{fill:RELIC.gold,fontWeight:'bold'});
    text(tip,TIPS[id],24,82,28,{width:882});root.controls.closeTooltip=button(tip,830,10,84,58,'×',()=>{root.removeChild(tip);tip.destroy({children:true});tip=null;root.tipId=null;});root.addChild(tip);
  }
  root.on('pointerdown',()=>{if(tip){root.removeChild(tip);tip.destroy({children:true});tip=null;root.tipId=null;}});
  function hit(id,x,y,w,h) {const r=new PIXI.Container();r.position.set(x,y);r.hitArea=new PIXI.Rectangle(0,0,w,h);r.eventMode='static';r.cursor='pointer';r.on('pointerdown',e=>e.stopPropagation());r.on('pointertap',()=>inspect(id,y+h));root.addChild(r);root.controls[id]=r;}
  panel(root,540,130,978,360);text(root,'BASE ATTRIBUTES',564,148,24,{fill:0xb1b4a6});
  ['Cunning','Intelligence','Wisdom','Effectiveness'].forEach((name,i)=>{
    const y=188+i*70;const lost=name===data.lost;const t=text(root,name,564,y,34,{fill:lost?0x80867d:RELIC.bone});
    if(lost){root.addChild(new PIXI.Graphics().lineStyle(2,0x80867d).moveTo(564,y+22).lineTo(564+t.width,y+22));text(root,'REPLACED',564,y+39,20,{fill:0x80867d});}hit(name,558,y-4,278,48);
  });
  panel(root,848,140,660,340,true);text(root,'CLASS ATTRIBUTES',872,156,24,{fill:RELIC.gold});text(root,`${data.stat}  ›`,872,192,44,{fill:RELIC.gold,fontWeight:'bold'});hit(data.stat,872,192,610,55);
  data.effects.forEach((copy,i)=>text(root,copy,872,250+i*78,32,{width:610}));
  root.addChild(new PIXI.Graphics().lineStyle(1,RELIC.brass).moveTo(872,410).lineTo(1482,410));text(root,`Replaces ${data.lost}`,872,422,26,{fill:0xb1b4a6});
  text(root,'CLASS ABILITIES',564,518,24,{fill:RELIC.gold});data.abilities.forEach(([name,copy,id],i)=>{const y=560+i*112;text(root,name,564,y,36,{fontWeight:'bold'});text(root,copy,564,y+46,32,{fill:0xb1b4a6,width:842});text(root,'›',1450,y+15,36,{fill:RELIC.gold});hit(id,554,y,930,99);});
  root.controls.begin=button(root,1024,802,494,76,`BEGIN WITH ${data.name}`,()=>onConfirm(selected.candidateIndex));
  const start=(1560-4*88)/2;
  const thumbs=[];
  for(let index=0;index<4;index++) {
    const candidate=candidates[index];const b=button(root,start+index*88,890,76,62,candidate?'':'?',()=>onPreview(candidate.candidateIndex),!candidate);
    if(candidate){const a=createClassPortraitArt(candidate.founderClassId,{size:54,founder:true});if(a){a.position.set(11,4);b.addChild(a);}b.portraitStage='youth';if(candidate===selected)panel(b,0,0,76,62,true).alpha=.25;}thumbs.push(b);
  }
  text(root,`${candidates.indexOf(selected)+1} / 4`,780,853,24,{fill:0xb1b4a6}).anchor.x=.5;
  function navigate(delta) {const index=candidates.indexOf(selected);onPreview(candidates[(index+delta+candidates.length)%candidates.length].candidateIndex);}
  root.controls.previous=button(root,start-84,890,70,62,'‹',()=>navigate(-1));root.controls.next=button(root,start+352+2,890,70,62,'›',()=>navigate(1));
  root.candidateRoots=[];
  candidates.forEach((candidate,index)=>{root.candidateRoots[candidate.candidateIndex]=thumbs[index];});
  root.getSnapshot=()=>({classId,name:data.name,replacedStat:data.lost,classStat:data.stat,tooltip:root.tipId,availableFounders:candidates.length,totalSlots:4});
  return root;
}
