import { VASSAL_FOUNDING_OPTIONS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { LIFEGRAPH_NODE_IDS } from '../../model/life-map-design.js';
import { getLifeMapColumnRules, lifeMapColumnMatches, resolveLifeMapColumns } from '../../model/life-map-columns.js';
import { lifegraphNodeLabel } from '../../model/dev-lab/lifegraph.js';
import { el, button, input, select, field, section, badge } from './elements.js';

export function renderLifegraphColumns(parent,{controller,play,onReview}){
  const {draft,graph}=controller.getSnapshot(),config=draft.generatorConfig,design=config.design,bookends=design.bookends;
  const row=(...children)=>{const node=el('div','','lab-controls');node.append(...children);return node;};
  const choice=(label,options,value,change)=>{const node=select(label,options,value);node.addEventListener('change',()=>change(node.value));return field(label,node);};
  const toggle=(label,value,change)=>{const node=input(label,'','checkbox');node.checked=value;node.addEventListener('change',()=>change(node.checked));return field(label,node);};
  const number=(label,value,min,max,change)=>{const node=input(label,value);node.min=String(min);node.max=String(max);node.addEventListener('change',()=>change(Number(node.value)));return field(label,node);};
  const editBookend=(kind,changes)=>controller.update(['generatorConfig','design','bookends',kind],{...bookends[kind],...changes});
  const context={classId:draft.preview.classId==='unclassed'?null:draft.preview.classId,founderClassId:draft.preview.founding?draft.preview.classId:null};
  const rules=getLifeMapColumnRules(design),winners=resolveLifeMapColumns(config,context);
  const status=rule=>{
    if(!design.enabled)return 'Rule priorities apply in Pooled draft generation.';
    if(!rule.enabled)return 'Disabled in this preview.';
    if(!lifeMapColumnMatches(rule,context))return 'Not eligible for this preview’s class or life stage.';
    const winner=winners.find(other=>other.depth===rule.depth);
    if(winner?.id!==rule.id)return `This preview: ${winner?.label??'another rule'} takes priority at this depth. Move this rule earlier to change the winner.`;
    const actual=graph?.nodes.find(node=>rule.kind==='founding'?node.bookend==='founding':node.milestoneId===rule.id);
    return actual?`This preview: selected · ${lifegraphNodeLabel(actual.family==='relic'&&actual.specialRelic?'specialRelic':actual.family)} · every complete route visits this node.`:'This preview: selected. Check any generation error above for content that cannot fit.';
  };
  const controls=(rule,index)=>{
    const earlier=button(`Move ${rule.label} earlier`,()=>controller.moveColumnRule(rule.id,-1),`lifegraph-rule-up-${rule.id}`,'quiet');earlier.disabled=index===0;
    const later=button(`Move ${rule.label} later`,()=>controller.moveColumnRule(rule.id,1),`lifegraph-rule-down-${rule.id}`,'quiet');later.disabled=index===rules.length-1;
    const text=el('p',status(rule),'lab-note');text.dataset.testid=`lifegraph-rule-status-${rule.id}`;
    return [row(badge(`Priority ${index+1}`),earlier,later),text];
  };
  parent.append(el('p','Rules are checked from top to bottom at each depth. The first enabled rule matching the Vassal’s class and life stage wins. Put a specific rule before its fallback at the same depth. Each winning column joins all routes before branching again; it replaces that depth without lengthening the life.','lab-summary'));
  const stage=draft.preview.founding?draft.preview.classId:'successor';
  parent.append(choice('Preview life stage',[['successor','Successor · no Founding'],['scholar','First life · Philosopher'],['warrior','First life · Warlord']],stage,value=>controller.update(['preview'],{...draft.preview,founding:value!=='successor',classId:value==='successor'?draft.preview.classId:value})));
  const targets=[{group:'Node types',entries:LIFEGRAPH_NODE_IDS.filter(id=>id!=='legacy'&&!id.startsWith('signature:')).map(id=>[`node:${id}`,lifegraphNodeLabel(id)])},{group:'Families',entries:design.pools.map(pool=>[`pool:${pool.id}`,pool.label])}];
  for(const [index,rule]of rules.entries()){
    if(rule.kind==='founding'){
      const card=section('Founding',...controls(rule,index),badge('First life only'),el('p','Founding establishes the chosen specialist class. Depth 0 adds it before the graph; a numbered depth competes with other rules at that depth. Put Founding before Crossroads to select Founding for protovassals and Crossroads for successors. If another rule wins or Founding is disabled, that life remains unclassed.','lab-note'),row(toggle('Founding enabled',bookends.founding.enabled,enabled=>editBookend('founding',{enabled})),number('Founding depth',bookends.founding.depth,0,config.normalDepthCount,depth=>editBookend('founding',{depth}))));
      card.dataset.testid='lifegraph-column-founding';
      if(draft.preview.founding){const family=draft.preview.classId==='scholar'?'philosopherFounding':'warlordFounding',option=VASSAL_FOUNDING_OPTIONS[family];card.append(el('p',option.description),el('p',`Base time: ${option.phaseCost} phases.`,'lab-note'));if(graph?.foundingNodeId)card.append(button('Play Founding',()=>play(graph.foundingNodeId),'lifegraph-play-founding','primary'));}
      if(bookends.founding.depth>0)card.append(button('Add fallback at this depth',()=>controller.addColumn({depth:rule.depth,afterId:rule.id}),'lifegraph-founding-fallback','quiet'));
      parent.append(card);continue;
    }
    const columnIndex=design.columns.findIndex(column=>column.id===rule.id),{kind,...column}=rule;
    const update=changes=>controller.update(['generatorConfig','design','columns',columnIndex],{...column,...changes});
    const name=input(`Milestone ${column.id} name`,column.label,'text');name.maxLength=80;name.addEventListener('change',()=>update({label:name.value}));
    const card=section(column.label,...controls(rule,index),row(field('Name',name),toggle(`${column.label} enabled`,column.enabled,enabled=>update({enabled})),number(`${column.label} depth`,column.depth,1,config.normalDepthCount,depth=>update({depth})),choice(`${column.label} content`,targets,`${column.targetType}:${column.targetId}`,value=>{const [targetType,targetId]=value.split(':');update({targetType,targetId});}),choice(`${column.label} class`,[['common','All classes'],['specialist','Both specialist classes'],['scholar','Scholar'],['warrior','Warrior'],['unclassed','Unclassed']],column.scope,scope=>update({scope})),choice(`${column.label} life stage`,[['any','Any life'],['firstLife','First life · protovassal'],['successor','Successors only']],column.lifeStage,lifeStage=>update({lifeStage})),button('Remove milestone',()=>controller.removeColumn(column.id),'','quiet')));
    card.dataset.testid=`lifegraph-column-${column.id}`;
    if(column.targetType==='node')card.append(row(toggle(`${lifegraphNodeLabel(column.targetId)} milestones only`,design.nodes[column.targetId].milestonesOnly,value=>controller.setNode(column.targetId,{milestonesOnly:value})),button('Edit node choices',()=>onReview(column.targetId),'','quiet')));
    const actual=graph?.nodes.find(node=>node.milestoneId===column.id);if(actual)card.append(button('Play milestone',()=>play(actual.id),'','primary'));
    card.append(button('Add fallback at this depth',()=>controller.addColumn({depth:column.depth,afterId:column.id}),`lifegraph-fallback-${column.id}`,'quiet'));parent.append(card);
  }
  parent.append(button('Add milestone rule',()=>controller.addColumn(),'lifegraph-add-column','primary'),el('p','Conditions select a rule before its content is rolled. A selected rule with no eligible content reports an error; it does not silently use a lower-priority rule. With no matching rule at a depth, ordinary random generation applies. “Milestones only” removes a node type from random generation and other reservations; a matching milestone can satisfy a guarantee.','lab-note'));
  parent.append(section('Legacy',el('p','Legacy reserves its own depth and cannot share it with a milestone rule. At the end it resolves its reward and retires the Vassal; at a numbered depth the life continues afterwards. With Legacy disabled, completing the final ordinary node retires the Vassal without a Legacy reward.','lab-note'),row(toggle('Legacy enabled',bookends.legacy.enabled,enabled=>editBookend('legacy',{enabled})),choice('Legacy position',[['end','After the final depth'],...Array.from({length:config.normalDepthCount},(_,i)=>[String(i+1),`Depth ${i+1}`])],String(bookends.legacy.depth),value=>editBookend('legacy',{depth:value==='end'?'end':Number(value)})),button('Edit Legacy choices',()=>onReview('legacy'),'lifegraph-edit-legacy')),number('Normal graph depths',config.normalDepthCount,3,20,value=>controller.update(['generatorConfig','normalDepthCount'],value)),el('p','Before shortening the graph, move any guarantees, Supply ranges and milestones that would fall beyond its new ending.','lab-note')));
}
