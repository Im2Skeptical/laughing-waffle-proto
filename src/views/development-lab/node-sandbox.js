import { createNodeSandboxController } from '../../controllers/node-sandbox-controller.js';
import { LAB_NODE_TYPES } from '../../model/dev-lab/node-sandbox.js';
import { getResearchProgression } from '../../model/research-progression.js';
import { createVassalNodeDecisionModalView } from '../vassal-node-decision-modal-pixi.js';
import { attachDevPreviewDisplay } from '../dev-preview-display.js';
import { el, button, field, input, select, section } from './elements.js';

export function createLabNodeSandboxView() {
  const controller = createNodeSandboxController();
  const node = section('Node sandbox', el('p','An isolated dummy and settlement using the real game decision screen. Refresh restores the setup; the same settings and seed reproduce the same contents.'));
  const settings = controller.getSnapshot().settings, fields = {};
  const controls = el('div','','lab-controls');
  fields.type = select('Sandbox node type',LAB_NODE_TYPES,settings.type);
  fields.classId = select('Dummy class',[['scholar','Scholar'],['warrior','Warrior'],['unclassed','Unclassed']],settings.classId);
  controls.append(field('Node / shop',fields.type),field('Dummy class',fields.classId));
  for (const [key,label] of [['seed','Refresh seed'],['research','Research'],['prestige','Dummy Prestige'],['age','Dummy age'],['cunning','Dummy Cunning / Ingenuity'],['wisdom','Dummy Wisdom'],['effectiveness','Dummy Effectiveness'],['intelligence','Dummy Intelligence / Prowess']]) {
    fields[key] = input(label,settings[key]);
    fields[key].max = String(key === 'seed' ? 4294967295 : key === 'research' ? Number.MAX_SAFE_INTEGER : key === 'prestige' ? 10000 : 100);
    controls.append(field(label,fields[key]));
  }
  const status = el('p','','lab-status');status.setAttribute('role','status');
  const summary = el('p');
  const researchSummary = el('p');
  const viewport = el('div','','lab-node-viewport');
  const app = new PIXI.Application({width:2424,height:1080,backgroundColor:0x111c21,antialias:true,resolution:1});
  app.stage.eventMode='static';app.stage.hitArea=app.screen;
  const accessibility=app.renderer.plugins.accessibility;
  if(accessibility?.div)accessibility.div.style.pointerEvents='none';
  app.view.dataset.testid='lab-node-sandbox';app.view.tabIndex=0;
  app.view.setAttribute('aria-label','Playable dummy vassal node and shop');
  viewport.append(app.view);
  // Move DOM focus before Pixi arms the press. A field's later blur would
  // otherwise trigger the game's native gesture cancellation on the first tap.
  viewport.addEventListener('pointerdown',event=>{
    if(event.target===app.view)app.view.focus({preventScroll:true});
  },{capture:true});
  const display = attachDevPreviewDisplay(viewport);
  let error = '';
  function updateStatus() {
    const snapshot = controller.getSnapshot();
    const research = getResearchProgression(snapshot.state);
    const odds = research.tiers.filter(tier=>tier.unlocked).map(tier=>`${tier.id} ${(tier.chance*100).toFixed(1).replace(/\.0$/, '')}%`).join(', ');
    researchSummary.textContent = `Research ${research.research} · Base quality rolls: ${odds}. ${research.nextMilestone ? `Next: ${research.nextMilestone.label} at ${research.nextMilestone.research} Research. ` : ''}Research also unlocks eligible shop cards; class bonuses and upgrades still apply.`;
    status.textContent = error || snapshot.message;status.classList.toggle('lab-warning',!!error);
    const phase=!snapshot.vassal?'dummy ended':snapshot.vassal.lifeMap.pendingResolution?'outcome pending':snapshot.vassal.lifeMap.nodeStates[snapshot.nodeId]?.resolved?'resolved':'ready';
    summary.textContent = `Gym Dummy · ${snapshot.settings.classId} · seed ${snapshot.settings.seed} · t=${snapshot.state.tSec}s · Prestige ${snapshot.vassal?.prestige ?? 'ended'} · ${phase}`;
    resolve.disabled = !snapshot.vassal?.lifeMap.pendingResolution;
  }
  function run(action) {
    try { const result = action();error='';updateStatus();modal.refresh();return result ?? {ok:true}; }
    catch(e) { error=e.message;updateStatus();return {ok:false,reason:error}; }
  }
  const modal = createVassalNodeDecisionModalView({app,layer:app.stage,
    getState:()=>controller.getSnapshot().state,
    getPresentation:()=>{const {state,vassal}=controller.getSnapshot();return {vassal,readOnly:false,viewedSec:state.tSec,frontierSec:state.tSec,profileSec:state.tSec};},
    getDecisionPresentation:(...args)=>controller.getDecision(...args),
    onEnterNode:(...args)=>run(()=>controller.enter(...args)),
    onSelectOption:(...args)=>run(()=>controller.select(...args)),
    onPurchaseOffer:(...args)=>run(()=>controller.purchase(...args)),
    onUndoPurchase:(...args)=>run(()=>controller.undo(...args)),
    onReorderPurchase:(...args)=>run(()=>controller.reorder(...args)),
    onMoveStructure:(...args)=>run(()=>controller.move(...args)),
    onRerollShop:(...args)=>run(()=>controller.reroll(...args)),
    onConfirmNode:(...args)=>run(()=>controller.confirm(...args)),
  });
  function refresh(nextSeed = false) {
    const values = Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,['type','classId'].includes(key)?field.value:Number(field.value)]));
    if(nextSeed) {
      if (!Number.isInteger(values.seed) || values.seed < 0 || values.seed > 4294967295) return run(()=>{throw new Error('Choose a valid refresh seed');});
      values.seed = (values.seed + 1) >>> 0;
    }
    const result = run(()=>controller.refresh(values));
    if(result.ok) { fields.seed.value=String(values.seed);modal.open(controller.getSnapshot().nodeId); }
  }
  controls.append(button('Refresh contents',()=>refresh(),'lab-node-refresh'),button('Next seed',()=>refresh(true),'lab-node-next-seed'));
  const actions = el('div','','lab-controls');
  const resolve = button('Resolve outcome',()=>run(()=>controller.resolve()),'lab-node-resolve');
  actions.append(button('Open node',()=>modal.open(controller.getSnapshot().nodeId),'lab-node-open'),button('Close node',()=>modal.close()),resolve);
  node.append(controls,status,summary,researchSummary,actions,viewport,el('p','Use the card costs to stage, drag cards onto the settlement, and inspect their faces. The in-game reroll uses its normal cost and limit. Resolve outcome advances only this dummy simulation through the decision’s duration. Fullscreen gives the game screen more room on phones.'));
  app.view.addEventListener('keydown',event=>{if(modal.handleInspectionKey(event)){event.preventDefault();return;}if(event.key==='Escape')modal.close();});
  app.ticker.add(()=>{if(node.isConnected)modal.update();});
  updateStatus();modal.open(controller.getSnapshot().nodeId);
  return {node,render(parent){parent.append(node);},
    getSnapshot:()=>({...controller.getSnapshot(),modal:modal.getSemanticSnapshot()}),
    getPoint:(kind,index=0)=>({offer:()=>modal.getOfferClickPoint(index),face:()=>modal.getOfferFacePoint(index),undo:()=>modal.getUndoClickPoint(index),option:()=>modal.getOptionClickPoint(index),confirm:()=>modal.getConfirmClickPoint(),tableau:()=>modal.getTableauClickPoint(index),construction:()=>modal.getConstructionPoint(index),inspectClose:()=>modal.getInspectionClosePoint()})[kind]?.(),
    destroy(){modal.close({immediate:true});display.destroy();app.destroy(true,{children:true});},
  };
}
