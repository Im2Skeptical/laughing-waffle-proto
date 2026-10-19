import { createLifegraphController } from '../../controllers/lifegraph-controller.js';
import { LIFEGRAPH_NODE_IDS, LIFEGRAPH_RARITIES, lifeMapAllowedScopes } from '../../model/life-map-design.js';
import { LIFEGRAPH_COST_TIERS } from '../../model/life-map-balance.js';
import { renderLifegraphChoices, renderLifegraphShopPricing } from './lifegraph-choice-editor.js';
import { nodeDesignId, lifegraphNodeLabel } from '../../model/dev-lab/lifegraph.js';
import { VASSAL_SIGNATURE_NODE_VARIANTS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { createLifegraphPreview } from './lifegraph-preview.js';
import { createLabNodeSandboxView } from './node-sandbox.js';
import { el, button, confirmButton, input, select, field, section, disclosure, badge, table, info } from './elements.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const title=value=>value[0].toUpperCase()+value.slice(1);
const TAB_OPTIONS=[['graph','Graph'],['families','Families'],['nodes','Nodes & review'],['guarantees','Guarantees'],['bands','Balance bands'],['diagnostics','Diagnostics'],['share','Save & share']];

export function createLifegraphView({controller=createLifegraphController()}={}){
  const root=el('section','','lab-lifegraph');root.dataset.testid='lab-lifegraph';
  let tab='graph',selectedDesign='practiceReform',search='',reviewOnly=false,lastSelected=null,frame=0,player=null,playerReset=null,ioText='',presetName='',generationOpen=false;
  const playerDialog=el('dialog','','lab-lifegraph-player'),playerBody=el('div');
  playerDialog.setAttribute('aria-label','Play Lifegraph node');
  playerDialog.addEventListener('close',()=>player?.setVisible(false));
  playerDialog.append(button('Close node player',()=>playerDialog.close(),'lifegraph-close-player','primary'),playerBody);document.body.append(playerDialog);
  function play(id,{type=false}={}){
    try{playerReset=()=>type?controller.openType(id):controller.openNode(id);playerReset();player??=createLabNodeSandboxView({controller:controller.sandbox,embedded:true,onReset:()=>playerReset?.()});
      playerBody.replaceChildren(player.node);player.setVisible(true);player.refreshFromController();if(!playerDialog.open)playerDialog.showModal();}
    catch(error){showError(error.message);}
  }
  const preview=createLifegraphPreview({controller,onPlay:play});
  function showError(message){const target=root.querySelector('[data-testid=lifegraph-status]');if(target){target.textContent=message;target.classList.add('lab-warning');}}
  function edit(path,value){return controller.update(path,value);}
  function number(label,value,path,{min=0,max=100,step=1}={}){
    const node=input(label,value);node.min=String(min);node.max=String(max);node.step=String(step);node.addEventListener('change',()=>edit(path,Number(node.value)));return field(label,node);
  }
  function choice(label,entries,value,handler){const node=select(label,entries,value);node.addEventListener('change',()=>handler(node.value));return field(label,node);}
  function check(label,value,handler,{disabled=false}={}){const node=input(label,'','checkbox');node.checked=value;node.disabled=disabled;node.addEventListener('change',()=>handler(node.checked));return field(label,node);}
  function controlRow(...children){const row=el('div','','lab-controls');row.append(...children);return row;}
  const designPath=(...path)=>['generatorConfig','design',...path];

  function renderHeader(parent,s){
    const head=el('div','','lab-page-head'),text=el('div');text.append(el('h2','Lifegraph'),el('p','Build families, balance opportunities and play the resulting nodes.','lab-subtitle'));head.append(text);
    parent.append(head);
    const settings=s.draft.preview,classes=el('div','','lab-segmented');classes.setAttribute('role','group');classes.setAttribute('aria-label','Lifegraph class');
    for(const id of ['unclassed','scholar','warrior']){const b=button(title(id),()=>edit(['preview','classId'],id),`lifegraph-class-${id}`);b.setAttribute('aria-pressed',String(settings.classId===id));classes.append(b);}
    const mode=select('Generation rules',[['pooled','Pooled draft'],['baseline','Legacy independent generation']],s.draft.generatorConfig.design.enabled?'pooled':'baseline');
    mode.addEventListener('change',()=>edit(designPath('enabled'),mode.value==='pooled'));
    const undo=button('Undo edit',()=>controller.undo(),'lifegraph-undo','quiet');undo.disabled=!s.canUndo;
    const top=controlRow(classes,field('Generation',mode),number('Seed',settings.seed,['preview','seed'],{max:4294967295}),button('Next seed',()=>edit(['preview','seed'],(settings.seed+1)>>>0),'lifegraph-next-seed'),undo);
    parent.append(top);
    const signatureOptions=[['none','No signature'],...Object.entries(VASSAL_SIGNATURE_NODE_VARIANTS).map(([id,d])=>[id,d.label])];
    const context=controlRow(number('Research',settings.research,['preview','research'],{max:1000000}),number('Prestige',settings.prestige,['preview','prestige'],{max:10000}),number('Age',settings.age,['preview','age']),number('All four stats',settings.stats,['preview','stats']),choice('Signature',signatureOptions,settings.signature,value=>edit(['preview','signature'],value)));
    parent.append(disclosure('Preview context',[context,el('p','A fixed disposable settlement makes seed and class comparisons reproducible. Each node opens fresh; playing it does not change the graph or other nodes.','lab-note')],{key:'lifegraph:context',open:false}));
    const status=el('p',s.message,'lab-status');status.dataset.testid='lifegraph-status';status.setAttribute('role','status');parent.append(status);
    if(!s.draft.generatorConfig.design.enabled)parent.append(el('p','Legacy mode uses independent weights and class substitutions. Switch to Pooled draft to test family, guarantee and balance edits.','lab-callout'));
    for(const error of s.generationErrors)parent.append(el('p',error,'lab-callout lab-warning'));
    const tabs=el('div','','lab-segmented lab-lifegraph-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Lifegraph tools');
    for(const [id,label]of TAB_OPTIONS){const b=button(label,()=>{tab=id;render();},`lifegraph-tab-${id}`);b.setAttribute('aria-pressed',String(tab===id));tabs.append(b);}parent.append(tabs);
  }

  function renderGraph(parent,s){
    parent.append(preview.node);preview.refresh();
    if(!s.graph)return;
    const n=s.graph.nodes.find(n=>n.id===s.selectedNodeId),id=n?nodeDesignId(n):null;
    if(n){const detail=section(lifegraphNodeLabel(id),el('p',`Depth ${n.depth+1} · lane ${n.lane+1} · ${n.band==='mid'?'middle':n.band}${n.generationRuleId?` · reserved by ${n.generationRuleId}`:''}`));
      detail.append(controlRow(button('Play this node',()=>play(n.id),'lifegraph-play-selected','primary'),button('Edit / comment on this node',()=>{selectedDesign=id;tab='nodes';render();},'lifegraph-review-selected'),badge(s.draft.generatorConfig.design.nodes[id]?.scope??'common'),badge(s.draft.generatorConfig.design.pools.find(p=>p.id===s.draft.generatorConfig.design.nodes[id]?.poolId)?.label??'')));
      const notes=s.draft.reviews[id]?.notes;if(notes)detail.append(el('p',notes,'lab-lifegraph-notes'));parent.append(detail);}
    const d=s.diagnostics;
    parent.append(controlRow(badge(`${s.graph.nodes.length} nodes`),badge(`Shops per route: ${d.shopRange.min}–${d.shopRange.max}`),badge(`Longest shop run: ${d.longestShopRun}`,d.longestShopRun>=3?'warn':''),badge(`${d.warnings.length} flags`,d.warnings.length?'warn':'ok')));
    if(d.warnings.length)parent.append(disclosure('Graph flags',d.warnings.map(w=>el('p',w.message,'lab-note')),{key:'lifegraph:flags',open:true,count:d.warnings.length}));
    parent.append(info('lifegraph:reserved','Gold dots mark reserved opportunities. Click an icon to select it, then Play selected node opens the game’s real decision screen. Every node starts from the same preview context.'));
    const topology=controlRow(...[['Lanes','laneCount',2,12],['Normal depths','normalDepthCount',3,20],['Route traces','routeCount',2,24],['Early depths','earlyDepthCount',1,18],['Middle depths','midDepthCount',1,18]].map(([label,key,min,max])=>number(label,s.draft.generatorConfig[key],['generatorConfig',key],{min,max})));
    parent.append(disclosure('Topology & timing',[topology,el('p','Early and middle consume the chosen number of depths; the remaining depths are late. Guarantee and Supply ranges must fit a smaller graph before reducing its size.','lab-note')],{key:'lifegraph:topology',open:false}));
  }

  function renderFamilies(parent,s){
    const design=s.draft.generatorConfig.design;
    parent.append(el('p','Choose a family first, then a node within that family. Adding ten shop types does not give Shops ten independent chances to win.','lab-summary'));
    for(const [index,pool]of design.pools.entries()){
      const name=input(`Family ${pool.id} name`,pool.label,'text');name.maxLength=80;name.addEventListener('change',()=>edit(designPath('pools',index,'label'),name.value));
      const members=Object.entries(design.nodes).filter(([,n])=>n.poolId===pool.id);
      const card=section(pool.label,controlRow(field('Family name',name),choice(`${pool.label} occurrence`,LIFEGRAPH_RARITIES.map(t=>[t,title(t)]),pool.occurrence,v=>edit(designPath('pools',index,'occurrence'),v)),number(`${pool.label} preferred maximum in a row`,pool.maxConsecutive,designPath('pools',index,'maxConsecutive'),{min:1,max:20})));
      const chips=el('div','','lab-controls');for(const [id,n]of members){const b=button(`${lifegraphNodeLabel(id)}${!n.enabled?' · off':''}`,()=>{selectedDesign=id;tab='nodes';render();},'','quiet');chips.append(b);}card.append(chips);
      card.append(button('Remove empty family',()=>controller.removePool(pool.id),'','quiet'));parent.append(card);
    }
    const name=input('New family name','','text');parent.append(controlRow(field('New family',name),button('Add family',()=>controller.addPool(name.value),'lifegraph-add-family')));
  }

  function renderNodes(parent,s){
    const design=s.draft.generatorConfig.design,layout=el('div','','lab-lifegraph-node-layout'),list=el('aside','','lab-lifegraph-node-list'),editor=el('section','','lab-panel');
    const find=input('Find node type',search,'search');find.addEventListener('input',()=>{search=find.value;for(const b of list.querySelectorAll('[data-node-name]'))b.hidden=!b.dataset.nodeName.includes(search.toLowerCase());});
    list.append(field('Find node',find),check('Only nodes with review notes',reviewOnly,v=>{reviewOnly=v;render();}));
    for(const id of LIFEGRAPH_NODE_IDS){if(reviewOnly&&!s.draft.reviews[id])continue;const rule=design.nodes[id];const b=button(`${lifegraphNodeLabel(id)}${!rule.enabled?' · off':''}${s.draft.reviews[id]?' · ●':''}`,()=>{selectedDesign=id;render();},`lifegraph-node-${id.replace(':','-')}`);
      b.dataset.nodeName=lifegraphNodeLabel(id).toLowerCase();b.hidden=!b.dataset.nodeName.includes(search.toLowerCase());b.setAttribute('aria-pressed',String(selectedDesign===id));list.append(b);}
    const id=selectedDesign,rule=design.nodes[id];editor.append(el('h2',lifegraphNodeLabel(id)));
    if(id!=='legacy'){
    const generation=el('div');
    const scopeOptions=lifeMapAllowedScopes(id).map(t=>[t,t==='common'?'Common · all classes':t==='specialist'?'Both specialist classes':title(t)]);
    generation.append(controlRow(check('Enabled',rule.enabled,v=>controller.setNode(id,{enabled:v}),{disabled:id==='legacy'}),choice('Node family',design.pools.map(p=>[p.id,p.label]),rule.poolId,v=>controller.setNode(id,{poolId:v})),choice('Class availability',scopeOptions,rule.scope,v=>controller.setNode(id,{scope:v})),choice('Node occurrence within family',LIFEGRAPH_RARITIES.map(t=>[t,title(t)]),rule.occurrence,v=>controller.setNode(id,{occurrence:v}))));
    const timings=controlRow();for(const t of ['early','mid','late'])timings.append(check(`Available ${t==='mid'?'middle':t}`,rule.timings.includes(t),v=>controller.setNode(id,{timings:v?[...rule.timings,t]:rule.timings.filter(x=>x!==t)})));
    const repeats=s.draft.generatorConfig.nonRepeatFamilyIds;
    timings.append(check('Prevent this node repeating consecutively',repeats.includes(id),v=>edit(['generatorConfig','nonRepeatFamilyIds'],v?[...repeats,id]:repeats.filter(x=>x!==id)),{disabled:id.startsWith('signature:')||['stockShop','legacy'].includes(id)}));generation.append(timings);
    const settings=disclosure('Generation settings',[generation],{open:generationOpen});settings.dataset.testid='lifegraph-generation';editor.append(settings);
    }
    if(id==='legacy')editor.append(el('p','Legacy is the compulsory terminal node.','lab-note'));
    const row=s.diagnostics?.families[id];if(row)editor.append(el('p',`This graph: ${row.count} nodes · early ${row.early}, middle ${row.mid}, late ${row.late} · ${row.minOnRoute}–${row.maxOnRoute} on a complete route.`,'lab-summary'));
    const example=s.graph?.nodes.find(n=>nodeDesignId(n)===id);editor.append(button(example?'Play an example from this graph':'Try this node in isolation',()=>example?play(example.id):play(id,{type:true}),'lifegraph-play-type','primary'));
    if(!example)editor.append(el('p','This node is absent from the graph. The isolated preview replaces one slot for this test only; enable and guarantee rules remain unchanged. Stock Supply uses Timber in this isolated test.','lab-note'));
    renderLifegraphChoices(editor,{controller,designId:id});
    if(['practiceReform','stockShop','publicWorks','neutralMarket','classMarket','foodShop','housingShop','signature:foodShop','signature:housingShop','signature:knowledgeShop'].includes(id))renderLifegraphShopPricing(editor,{controller,types:['practiceReform','stockShop'].includes(id)?['practice']:id==='publicWorks'?['structure']:['practice','structure']});
    const review=s.draft.reviews[id],notes=el('textarea');notes.value=review?.notes??'';notes.rows=7;notes.maxLength=20000;notes.setAttribute('aria-label','Node review notes');notes.placeholder='What feels wrong? What should change? Include content gaps or a seed to reproduce.';
    notes.addEventListener('change',()=>controller.setReview(id,notes.value,review?.status??'open'));
    editor.append(field('Review notes · saved on this device',notes),controlRow(choice('Review status',[['open','Open'],['resolved','Resolved']],review?.status??'open',v=>controller.setReview(id,notes.value,v)),button('Save note',()=>controller.setReview(id,notes.value,review?.status??'open'),'lifegraph-save-note')));
    layout.append(list,editor);parent.append(layout);
  }

  function renderGuarantees(parent,s){
    const design=s.draft.generatorConfig.design;
    parent.append(el('p','Reserve opportunities before rolling the remaining nodes. Map coverage counts the whole graph; Every route enforces a minimum on each complete path. Impossible combinations report an error.','lab-summary'));
    for(const [index,g]of design.guarantees.entries()){
      const update=changes=>edit(designPath('guarantees',index),{...g,...changes});
      const targets=[{group:'Families',entries:design.pools.map(p=>[`pool:${p.id}`,p.label])},{group:'Node types',entries:LIFEGRAPH_NODE_IDS.filter(id=>!id.startsWith('signature:')&&id!=='legacy').map(id=>[`node:${id}`,lifegraphNodeLabel(id)])}];
      parent.append(section(g.id,controlRow(choice('Guaranteed opportunity',targets,`${g.targetType}:${g.targetId}`,v=>{const [targetType,targetId]=v.split(':');update({targetType,targetId});}),choice('Guarantee class',[['common','All classes'],['specialist','Both specialist classes'],['scholar','Scholar'],['warrior','Warrior'],['unclassed','Unclassed']],g.scope,v=>update({scope:v})),number('Minimum count',g.count,designPath('guarantees',index,'count'),{min:1,max:10}),number('From depth',g.minDepth,designPath('guarantees',index,'minDepth'),{min:1,max:20}),number('Through depth',g.maxDepth,designPath('guarantees',index,'maxDepth'),{min:1,max:20}),choice('Coverage',[['map','Whole map'],['eachRoute','Every route']],g.coverage,v=>update({coverage:v})),button('Remove rule',()=>edit(designPath('guarantees'),design.guarantees.filter((_,i)=>i!==index)),'','quiet'))));
    }
    parent.append(button('Add guarantee',()=>controller.addGuarantee(),'lifegraph-add-guarantee','primary'));
    const supply=design.stockSupply;
    parent.append(section('Stock Supply reservations',controlRow(check('Reserve Stock Supply shops',supply.enabled,v=>edit(designPath('stockSupply','enabled'),v)),number('Distinct random outputs',supply.randomCount,designPath('stockSupply','randomCount'),{max:10}),number('Minimum unmet outputs',supply.unmetCount,designPath('stockSupply','unmetCount'),{max:10}),number('Supply from depth',supply.minDepth,designPath('stockSupply','minDepth'),{min:1,max:20}),number('Supply through depth',supply.maxDepth,designPath('stockSupply','maxDepth'),{min:1,max:20})),el('p','Only currently unlocked producers qualify in pooled generation. Reservations prefer separate depths and never replace another guarantee. Unmet needs still use the current all-settlement analysis; diagnostics and review notes make that limitation visible.','lab-note')));
  }

  function renderBands(parent,s){
    const design=s.draft.generatorConfig.design;
    parent.append(section('Occurrence tiers',el('p','These are relative chances. Changing Common updates every family and node assigned to Common; switching a node off is separate.'),controlRow(...LIFEGRAPH_RARITIES.map(t=>number(title(t),design.occurrence[t],designPath('occurrence',t),{min:.01,max:100,step:.25})))));
    for(const kind of ['time','prestige','risk','monsterPressure']){
      const name=kind==='risk'?'Death / defeat risk':kind==='monsterPressure'?'Monster Pressure':title(kind);
      const controls=controlRow();
      for(const tier of LIFEGRAPH_COST_TIERS){
        const value=input(`${name} · ${tier}`,design.costBands[kind][tier]*(kind==='risk'?100:1));value.min='0';value.max=kind==='risk'?'100':kind==='time'?'1000':'100000';value.step=kind==='prestige'?'1':'.1';
        value.addEventListener('change',()=>edit(designPath('costBands',kind,tier),Number(value.value)/(kind==='risk'?100:1)));controls.append(field(`${title(tier)}${kind==='risk'?' · %':kind==='time'?' · years':''}`,value));
      }
      parent.append(section(`${name} base cost presets`,el('p',kind==='time'?'Absolute solar years before discounts. Every choice using a preset shares its value.':kind==='risk'?'Chance of death before class bonuses, or defeat in Campaigns. Separate from Monster Pressure.':kind==='monsterPressure'?'Points added to the shared Monster tracker, independently of death risk. A full tracker triggers Monster activity.':'Absolute Prestige cost before discounts. Free is always 0.','lab-note'),controls));
    }
    renderLifegraphShopPricing(parent,{controller});
    renderLifegraphChoices(parent,{controller,designId:'stockShop',servicesOnly:true});
    parent.append(section('Timing bands',el('p','Assign nodes to Early, Middle or Late in Nodes & review. Change the shared depth boundaries here.'),controlRow(number('Early depth count',s.draft.generatorConfig.earlyDepthCount,['generatorConfig','earlyDepthCount'],{min:1,max:18}),number('Middle depth count',s.draft.generatorConfig.midDepthCount,['generatorConfig','midDepthCount'],{min:1,max:18}))));
  }

  function renderDiagnostics(parent,s){
    parent.append(section('Card pool coverage',el('p',`Distinct eligible cards for ${s.draft.preview.classId} at Research ${s.draft.preview.research}, before sampling three offers. Empty pools have 0; thin pools have fewer than 3. Counts include the dummy’s installed-card restrictions.`)));
    const thinOnly=check('Only empty / thin pools',false,v=>{for(const row of parent.querySelectorAll('[data-pool-status=varied]'))row.hidden=v;});parent.append(thinOnly);
    for(const row of s.cardPools){
      const members=row.cards.map(c=>`${c.label} (${c.pool}; ${c.kind})`);
      const detail=disclosure(row.label,[el('p',`${row.count} distinct cards · ${row.common} Common · ${row.specific} class-specific`),...members.map(name=>el('p',name,'lab-note')),button('Note this content gap',()=>{selectedDesign=row.id.startsWith('structure:')?'publicWorks':row.id.startsWith('tag:')?row.id==='tag:Housing'?'housingShop':row.id==='tag:Food'?'foodShop':'signature:knowledgeShop':row.id.startsWith('stock:')?'stockShop':'practiceReform';const old=s.draft.reviews[selectedDesign];controller.setReview(selectedDesign,`${old?.notes?`${old.notes}\n\n`:''}${row.label}: ${row.count} eligible cards (${s.draft.preview.classId}, Research ${s.draft.preview.research}). ${row.cards.map(c=>c.label).join(', ')}`);tab='nodes';render();})],{key:`lifegraph:pool:${row.id}`,open:false,badges:[badge(`${row.count} · ${row.status}`,row.status==='varied'?'ok':'warn')]});detail.dataset.poolStatus=row.status;parent.append(detail);
    }
    const count=input('Batch seed count',100);count.min='1';count.max='500';
    const run=button(s.batchRunning?'Checking seeds…':'Check seed batch',()=>void controller.runBatch(Number(count.value)),'lifegraph-run-batch','primary');run.disabled=s.batchRunning;
    parent.append(section('Graph distribution across seeds',controlRow(field('Consecutive seeds',count),run,button('Stop batch',()=>controller.cancelBatch(),'','quiet'))));
    const batch=s.batch;
    if(batch){parent.append(el('p',`${batch.completed}/${batch.count} checked · ${batch.failed} generation conflicts · longest shop run ${batch.maxShopRun}.`,'lab-summary'));
      parent.append(table(['Flag','Maps affected'],Object.entries(batch.warningCounts)));
      const successful=batch.completed-batch.failed;parent.append(table(['Node','Average / map','Maps missing it','Minimum–maximum / route'],Object.entries(batch.families).filter(([,r])=>r.total).map(([id,r])=>[lifegraphNodeLabel(id),(r.total/Math.max(1,successful)).toFixed(2),r.missing,`${r.minOnRoute}–${r.maxOnRoute}`])));
      for(const example of batch.examples)parent.append(disclosure(`Seed ${example.seed}`,[el('p',example.error??example.warnings.join(' ')),button('Open this seed',()=>{edit(['preview','seed'],example.seed);tab='graph';render();})],{open:false}));}
  }

  function renderShare(parent,s){
    const name=input('Experiment name',s.draft.name,'text');name.addEventListener('change',()=>edit(['name'],name.value));
    const preset=input('Preset name',presetName||s.draft.name,'text');preset.addEventListener('input',()=>{presetName=preset.value;});
    const saved=select('Saved Lifegraph experiment',[['','Choose a saved experiment'],...s.presets], '');
    parent.append(button('Load current defaults',()=>controller.reset(),'lifegraph-load-defaults','quiet'));
    parent.append(section('Experiments',controlRow(field('Experiment name',name),field('Save as',preset),button('Save experiment',()=>controller.savePreset(preset.value),'lifegraph-save-preset','primary')),controlRow(field('Saved experiment',saved),button('Load experiment',()=>controller.loadPreset(saved.value)),confirmButton('Delete saved experiment','Delete this experiment?',()=>controller.deletePreset(saved.value))),el('p','Drafts and notes save locally. Named experiments capture the rules, class context and reviews together. Export JSON to move them between devices.','lab-note')));
    const area=el('textarea');area.rows=13;area.value=ioText;area.setAttribute('aria-label','Lifegraph JSON');area.addEventListener('input',()=>{ioText=area.value;});
    const refresh=()=>{ioText=controller.exportJson();area.value=ioText;};
    const copy=async()=>{refresh();try{await navigator.clipboard.writeText(ioText);}catch{area.focus();area.select();}};
    const download=()=>{const url=URL.createObjectURL(new Blob([controller.exportJson()],{type:'application/json'})),a=el('a');a.href=url;a.download='lifegraph-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const file=input('Import Lifegraph JSON file','','file');file.accept='.json,application/json';file.addEventListener('change',async()=>{if(file.files?.[0]){const text=await file.files[0].text();controller.importJson(text);}});
    parent.append(section('Agent handoff',el('p','Export includes editable rules, review notes, preview class / Research / seed, card-pool evidence and the latest seed batch. It can be pasted directly to an agent.'),controlRow(button('Copy handoff JSON',()=>void copy(),'lifegraph-copy-json','primary'),button('Download JSON',download),button('Show current export',refresh)),field('Export / paste an import',area),controlRow(button('Import pasted JSON',()=>controller.importJson(ioText),'lifegraph-import-json'),field('Import file',file))));
    const notes=Object.entries(s.draft.reviews);if(notes.length)parent.append(section('Review queue',...notes.map(([id,r])=>{const item=el('div','','lab-lifegraph-review-entry');item.append(button(lifegraphNodeLabel(id),()=>{selectedDesign=id;tab='nodes';render();},'','quiet'),badge(r.status),el('p',r.notes));return item;})));
    const launch=el('a','Use this draft in New run setup','lab-quiet-link');launch.href='#/dev/gym?workspace=setup';parent.append(launch,el('p','In an editable launch profile, choose Use Lifegraph draft. The profile captures these rules; changing this workspace later cannot change an existing run.','lab-note'));
  }

  function render(){
    const active=document.activeElement,label=active?.getAttribute('aria-label'),start=active?.selectionStart,end=active?.selectionEnd,scroll=window.scrollY;
    const generation=root.querySelector('[data-testid=lifegraph-generation]');if(generation)generationOpen=generation.open;
    const s=controller.getSnapshot();if(s.selectedNodeId!==lastSelected){lastSelected=s.selectedNodeId;const n=s.graph?.nodes.find(n=>n.id===s.selectedNodeId);if(n)selectedDesign=nodeDesignId(n);}
    root.replaceChildren();renderHeader(root,s);
    ({graph:renderGraph,families:renderFamilies,nodes:renderNodes,guarantees:renderGuarantees,bands:renderBands,diagnostics:renderDiagnostics,share:renderShare})[tab](root,s);
    preview.setVisible(tab==='graph'&&root.isConnected);
    if(label){const next=[...root.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===label);if(next){next.focus({preventScroll:true});if(start!=null&&['text','search'].includes(next.type)||next?.tagName==='TEXTAREA')try{next.setSelectionRange(start,end);}catch{}}}
    window.scrollTo(0,scroll);
  }
  const unsubscribe=controller.subscribe(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});render();
  return {controller,render(parent){parent.append(root);preview.setVisible(tab==='graph');},hide(){preview.setVisible(false);playerDialog.close();player?.setVisible(false);},getSnapshot:()=>controller.getSnapshot(),getPoint:id=>preview.getPoint(id),
    getPlayer:()=>player?.getSnapshot(),getPlayerPoint:(...args)=>player?.getPoint(...args),destroy(){cancelAnimationFrame(frame);unsubscribe();controller.destroy();preview.destroy();player?.destroy();playerDialog.remove();root.remove();}};
}
