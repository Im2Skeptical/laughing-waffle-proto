import { createLabNodeSandbox } from '../model/dev-lab/node-sandbox.js';
import { createNodeSandboxController } from './node-sandbox-controller.js';
import { createLifegraphDraft, validateLifegraphDraft, createLifegraphPreviewState, generateLifegraphPreview,
  openLifegraphNode, openLifegraphNodeType, diagnoseLifegraph, diagnoseLifegraphCardPools, LIFEGRAPH_STORAGE_KEY, LIFEGRAPH_PRESETS_KEY } from '../model/dev-lab/lifegraph.js';
import { getCurrentLifeMapVassal } from '../model/vassal-life-map.js';
import { serializeGameState, deserializeGameState } from '../model/state.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function storage(){try{return globalThis.localStorage??null;}catch{return null;}}
function replacePath(value,path,next){const copy=clone(value);let cursor=copy;for(const key of path.slice(0,-1))cursor=cursor[key];cursor[path.at(-1)]=next;return copy;}

export function createLifegraphController({baseSandbox=null,store=storage()}={}){
  const base=baseSandbox??createLabNodeSandbox();
  const baseJson=serializeGameState(base.state);
  const sandbox=createNodeSandboxController({initialSandbox:base});
  let draft=createLifegraphDraft(),presets=[],history=[],state=null,graph=null,diagnostics=null,cardPools=[],generationErrors=[],selectedNodeId=null;
  let message='Drafts and notes save on this device. Launching is explicit.',batch=null,batchRunning=false,batchToken=0;
  const listeners=new Set();
  const notify=()=>{for(const listener of listeners)listener();};
  const settings=()=>{const p=draft.preview;return {...base.settings,classId:p.classId,seed:p.seed,research:p.research,prestige:p.prestige,age:p.age,
    cunning:p.stats,wisdom:p.stats,intelligence:p.stats,effectiveness:p.stats};};
  function persist(){try{store?.setItem(LIFEGRAPH_STORAGE_KEY,JSON.stringify(draft));if(!store)message='Storage unavailable. Export your draft before leaving.';}catch{message='Storage unavailable. Export your draft before leaving.';}}
  function rebuild(){
    batchToken++;batchRunning=false;batch=null;
    state=createLifegraphPreviewState(deserializeGameState(baseJson),draft);
    const result=generateLifegraphPreview(state,draft);
    graph=result.graph??null;generationErrors=result.ok?[]:result.errors??[result.reason];
    if(graph){getCurrentLifeMapVassal(state).lifeMap={graph,currentNodeId:null,completedNodeIds:[],availableNodeIds:[...graph.entryNodeIds],nodeStates:{},pendingResolution:null};diagnostics=diagnoseLifegraph(graph);}else diagnostics=null;
    cardPools=diagnoseLifegraphCardPools(state);
    if(!graph?.nodes.some(n=>n.id===selectedNodeId))selectedNodeId=graph?.nodes[0]?.id??null;
  }
  function commit(next,label,{preview=true}={}){
    const errors=validateLifegraphDraft(next);if(errors.length){message=errors[0];notify();return {ok:false,errors};}
    history.push(draft);history=history.slice(-30);draft=clone(next);message=label;
    if(preview)rebuild();persist();notify();return {ok:true};
  }
  try{const saved=store?.getItem(LIFEGRAPH_STORAGE_KEY);if(saved){const value=JSON.parse(saved);if(!validateLifegraphDraft(value).length)draft=value;else message='Stored draft is from another schema. The current default is loaded; your stored export was not applied.';}
    const savedPresets=JSON.parse(store?.getItem(LIFEGRAPH_PRESETS_KEY)??'[]');if(Array.isArray(savedPresets))presets=savedPresets.filter(p=>typeof p.name==='string'&&!validateLifegraphDraft(p.draft).length);
  }catch{message='Stored draft could not be read. Export before leaving if storage is unavailable.';}
  rebuild();
  return {
    sandbox,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>({draft,state,graph,diagnostics,cardPools,generationErrors,selectedNodeId,message,batch,batchRunning,presets:presets.map(p=>p.name),canUndo:!!history.length}),
    getGeneratorConfig:()=>clone(draft.generatorConfig),
    update(path,value){return commit(replacePath(draft,path,value),'Draft updated. Preview and diagnostics use these rules.');},
    setNode(id,changes){return commit(replacePath(draft,['generatorConfig','design','nodes',id],{...draft.generatorConfig.design.nodes[id],...changes}),'Node rules updated.');},
    setReview(id,notes,status='open'){const next=clone(draft);if(notes.trim()||status==='resolved')next.reviews[id]={notes,status};else delete next.reviews[id];return commit(next,'Review saved.',{preview:false});},
    reset(){return commit(createLifegraphDraft(),'Loaded the default pooled experiment.');},
    undo(){if(!history.length)return;draft=history.pop();rebuild();persist();message='Undid the last edit.';notify();},
    selectNode(id){if(!graph?.nodes.some(n=>n.id===id))return;selectedNodeId=id;notify();},
    openNode(id=selectedNodeId){if(!graph)throw new Error(generationErrors[0]);selectedNodeId=id;
      const scenario=openLifegraphNode(state,graph,id,settings());sandbox.loadScenario(scenario);notify();return scenario;},
    openType(id){if(!graph)throw new Error(generationErrors[0]);const scenario=openLifegraphNodeType(state,graph,id,settings());sandbox.loadScenario(scenario);return scenario;},
    addPool(label){const next=clone(draft);let n=1;while(next.generatorConfig.design.pools.some(p=>p.id===`family-${n}`))n++;
      next.generatorConfig.design.pools.push({id:`family-${n}`,label:label.trim()||`Family ${n}`,occurrence:'uncommon',maxConsecutive:2});return commit(next,'Family added. Assign nodes in the node reviewer.');},
    removePool(id){const design=draft.generatorConfig.design;if(Object.values(design.nodes).some(n=>n.poolId===id)||design.guarantees.some(g=>g.targetType==='pool'&&g.targetId===id)){message='Move this family’s nodes and guarantees before removing it.';notify();return {ok:false};}
      return commit(replacePath(draft,['generatorConfig','design','pools'],design.pools.filter(p=>p.id!==id)),'Family removed.');},
    addGuarantee(){const next=clone(draft),rules=next.generatorConfig.design.guarantees;let n=1;while(rules.some(g=>g.id===`guarantee-${n}`))n++;
      rules.push({id:`guarantee-${n}`,targetType:'pool',targetId:next.generatorConfig.design.pools[0].id,scope:'common',count:1,minDepth:1,maxDepth:Math.min(4,next.generatorConfig.normalDepthCount),coverage:'map'});return commit(next,'Guarantee added.');},
    savePreset(name){name=name.trim();if(!name||name.length>120){message='Choose a preset name (up to 120 characters).';notify();return {ok:false};}
      const next=presets.filter(p=>p.name!==name);next.push({name,draft:clone({...draft,name})});try{if(!store)throw new Error();store.setItem(LIFEGRAPH_PRESETS_KEY,JSON.stringify(next));presets=next;message=`Saved “${name}”.`;notify();return {ok:true};}catch{message='Preset could not be stored. Export this draft instead.';notify();return {ok:false};}},
    loadPreset(name){const preset=presets.find(p=>p.name===name);return preset?commit(preset.draft,`Loaded “${name}”.`):{ok:false};},
    deletePreset(name){try{const next=presets.filter(p=>p.name!==name);if(!store)throw new Error();store.setItem(LIFEGRAPH_PRESETS_KEY,JSON.stringify(next));presets=next;message='Preset deleted.';notify();return {ok:true};}catch{message='Preset could not be removed from storage.';notify();return {ok:false};}},
    exportJson(){return JSON.stringify({...draft,evidence:{seed:draft.preview.seed,classId:draft.preview.classId,diagnostics,cardPools,batch,generationErrors}},null,2);},
    importJson(text){try{const value=JSON.parse(text);delete value.evidence;return commit(value,'Imported experiment, rules and review notes.');}catch(error){message=`Import failed: ${error.message}`;notify();return {ok:false,errors:[message]};}},
    async runBatch(count=100){
      if(batchRunning)return;const token=++batchToken,captured=clone(draft),capturedState=createLifegraphPreviewState(deserializeGameState(baseJson),captured);
      count=Math.max(1,Math.min(500,Math.floor(count)||100));batchRunning=true;batch={count,completed:0,failed:0,missing:{},warningCounts:{},examples:[],families:{},maxShopRun:0};notify();
      for(let index=0;index<count;index++){
        if(token!==batchToken)return;
        const seed=(captured.preview.seed+index)>>>0,result=generateLifegraphPreview(capturedState,captured,seed);batch.completed++;
        if(!result.ok){batch.failed++;if(batch.examples.length<20)batch.examples.push({seed,error:result.errors?.[0]??result.reason});}
        else{const d=diagnoseLifegraph(result.graph);batch.maxShopRun=Math.max(batch.maxShopRun,d.longestShopRun);for(const [id,row]of Object.entries(d.families)){const summary=batch.families[id]??={total:0,missing:0,minOnRoute:Infinity,maxOnRoute:0};summary.total+=row.count;summary.missing+=row.count===0?1:0;summary.minOnRoute=Math.min(summary.minOnRoute,row.minOnRoute);summary.maxOnRoute=Math.max(summary.maxOnRoute,row.maxOnRoute);}
          const codes=new Set(d.warnings.map(w=>w.code));for(const code of codes)batch.warningCounts[code]=(batch.warningCounts[code]??0)+1;
          if(d.warnings.length&&batch.examples.length<20)batch.examples.push({seed,warnings:d.warnings.map(w=>w.message)});}
        if(index%20===19){notify();await new Promise(resolve=>setTimeout(resolve,0));}
      }
      if(token===batchToken){batchRunning=false;message=`Checked ${count} consecutive seeds for ${captured.preview.classId}. Click an example seed to reproduce it.`;notify();}
    },
    cancelBatch(){batchToken++;batchRunning=false;message='Batch stopped.';notify();},
    destroy(){batchToken++;listeners.clear();},
  };
}
