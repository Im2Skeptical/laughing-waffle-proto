import { VASSAL_FOUNDING_OPTIONS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { LIFEGRAPH_NODE_IDS } from '../../model/life-map-design.js';
import { lifegraphNodeLabel } from '../../model/dev-lab/lifegraph.js';
import { el, button, input, select, field, section, badge } from './elements.js';

export function renderLifegraphColumns(parent,{controller,play,onReview}){
  const {draft,graph}=controller.getSnapshot(),config=draft.generatorConfig,design=config.design;
  const row=(...children)=>{const node=el('div','','lab-controls');node.append(...children);return node;};
  const choice=(label,options,value,change)=>{const node=select(label,options,value);node.addEventListener('change',()=>change(node.value));return field(label,node);};
  const toggle=(label,value,change)=>{const node=input(label,'','checkbox');node.checked=value;node.addEventListener('change',()=>change(node.checked));return field(label,node);};
  const number=(label,value,min,max,change)=>{const node=input(label,value);node.min=String(min);node.max=String(max);node.addEventListener('change',()=>change(Number(node.value)));return field(label,node);};
  const columns=design.columns;
  const bookends=design.bookends;
  const editBookend=(kind,changes)=>controller.update(['generatorConfig','design','bookends',kind],{...bookends[kind],...changes});
  parent.append(el('p','Milestone columns contain one node shared by every route. Branches join before the milestone and open out again afterwards. Each custom milestone replaces an existing depth, so it does not lengthen a life.','lab-summary'));
  const stage=draft.preview.founding?draft.preview.classId:'successor';
  const founding=section('Founding',badge('First life only'),el('p','Founding establishes the chosen specialist class. Depth 0 adds it before the graph; another depth replaces that column. Disabling it leaves the founder unclassed and does not establish a class. Successors never receive Founding.','lab-note'),
    row(toggle('Founding enabled',bookends.founding.enabled,enabled=>editBookend('founding',{enabled})),number('Founding depth',bookends.founding.depth,0,config.normalDepthCount,depth=>editBookend('founding',{depth}))),
    choice('Preview life stage',[['successor','Successor · no Founding'],['scholar','First life · Philosopher'],['warrior','First life · Warlord']],stage,value=>controller.update(['preview'],{...draft.preview,founding:value!=='successor',classId:value==='successor'?draft.preview.classId:value})));
  if(draft.preview.founding){const family=draft.preview.classId==='scholar'?'philosopherFounding':'warlordFounding',option=VASSAL_FOUNDING_OPTIONS[family];
    founding.append(el('p',option.description),el('p',`Base time: ${option.phaseCost} phases.`, 'lab-note'));
    if(graph?.foundingNodeId)founding.append(button('Play Founding',()=>play(graph.foundingNodeId),'lifegraph-play-founding','primary'));}
  parent.append(founding);
  parent.append(section('Legacy',el('p','At the end, Legacy resolves its reward and retires the Vassal. At a numbered depth, it replaces that column and the life continues afterwards. With Legacy disabled, completing the final ordinary node retires the Vassal without a Legacy reward.','lab-note'),
    row(toggle('Legacy enabled',bookends.legacy.enabled,enabled=>editBookend('legacy',{enabled})),choice('Legacy position',[['end','After the final depth'],...Array.from({length:config.normalDepthCount},(_,i)=>[String(i+1),`Depth ${i+1}`])],String(bookends.legacy.depth),value=>editBookend('legacy',{depth:value==='end'?'end':Number(value)})),button('Edit Legacy choices',()=>onReview('legacy'),'lifegraph-edit-legacy')),
    number('Normal graph depths',config.normalDepthCount,3,20,value=>controller.update(['generatorConfig','normalDepthCount'],value)),el('p','Before shortening the graph, move any guarantees, Supply ranges and milestones that would fall beyond its new ending.','lab-note')));
  if(!design.enabled)parent.append(el('p','Milestone column settings, including Founding, Legacy and “milestones only”, apply in Pooled draft generation. Legacy independent generation keeps the normal bookends.','lab-callout'));
  const targets=[{group:'Node types',entries:LIFEGRAPH_NODE_IDS.filter(id=>id!=='legacy'&&!id.startsWith('signature:')).map(id=>[`node:${id}`,lifegraphNodeLabel(id)])},
    {group:'Families',entries:design.pools.map(pool=>[`pool:${pool.id}`,pool.label])}];
  for(const [index,column]of columns.entries()){
    const update=changes=>controller.update(['generatorConfig','design','columns',index],{...column,...changes});
    const name=input(`Milestone ${column.id} name`,column.label,'text');name.maxLength=80;name.addEventListener('change',()=>update({label:name.value}));
    const card=section(column.label,row(field('Name',name),toggle(`${column.label} enabled`,column.enabled,enabled=>update({enabled})),
      number(`${column.label} depth`,column.depth,1,config.normalDepthCount,depth=>update({depth})),
      choice(`${column.label} content`,targets,`${column.targetType}:${column.targetId}`,value=>{const [targetType,targetId]=value.split(':');update({targetType,targetId});}),
      choice(`${column.label} class`,[['common','All classes'],['specialist','Both specialist classes'],['scholar','Scholar'],['warrior','Warrior'],['unclassed','Unclassed']],column.scope,scope=>update({scope})),
      button('Remove milestone',()=>controller.update(['generatorConfig','design','columns'],columns.filter((_,i)=>i!==index)),'','quiet')));
    card.dataset.testid=`lifegraph-column-${column.id}`;
    const actual=graph?.nodes.find(node=>node.milestoneId===column.id);
    card.append(el('p',actual?`This preview: ${lifegraphNodeLabel(actual.family==='relic'&&actual.specialRelic?'specialRelic':actual.family)} · every complete route visits this node.`:'Not present in this preview. Check its class, enabled state and any generation error above.','lab-note'));
    if(column.targetType==='node')card.append(row(toggle(`${lifegraphNodeLabel(column.targetId)} milestones only`,design.nodes[column.targetId].milestonesOnly,value=>controller.setNode(column.targetId,{milestonesOnly:value})),button('Edit node choices',()=>onReview(column.targetId),'','quiet')));
    if(actual)card.append(button('Play milestone',()=>play(actual.id),'','primary'));
    parent.append(card);
  }
  parent.append(button('Add milestone column',()=>controller.addColumn(),'lifegraph-add-column','primary'),el('p','Families roll one eligible member for the whole column. Node enable switches, class limits and timing bands still apply; impossible combinations report an error. “Milestones only” removes that node type from random generation and other reservations. An existing matching milestone can satisfy a guarantee.','lab-note'));
}
