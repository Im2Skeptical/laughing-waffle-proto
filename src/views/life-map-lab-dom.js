import { el, button, badge, table } from './development-lab/elements.js';

// Profiles capture a Lifegraph recipe. Editing and playing belong to the one
// dedicated workspace, rather than a second, abstract graph editor in Gym.
export function createLifeMapLabDom({controller,readOnly=()=>false,applyLifegraph}={}){
  const root=el('section','','lab-editor lab-panel');root.dataset.testid='life-map-lab';let unsubscribe=null;
  function render(){
    const config=controller.getGeneratorConfig(),design=config.design;
    root.replaceChildren(el('h2','Lifegraph rules in this profile'),el('p','This is the captured launch recipe. The Lifegraph workspace owns graph editing, playable nodes, review notes and diagnostics.'));
    const link=el('a','Open Lifegraph workspace','lab-quiet-link');link.href='#/dev/lifegraph';
    const apply=button('Use Lifegraph draft',()=>{applyLifegraph?.();render();},'lab-setup-lifegraph','primary');apply.disabled=readOnly();
    root.append(link,apply,badge(design.enabled?'Pooled generation':'Legacy independent generation'),table(['Setting','Captured value'],[
      ['Topology',`${config.laneCount} lanes · ${config.normalDepthCount} normal depths · ${config.routeCount} route traces`],
      ['Timing',`${config.earlyDepthCount} early · ${config.midDepthCount} middle · ${config.normalDepthCount-config.earlyDepthCount-config.midDepthCount} late`],
      ['Families',design.pools.map(p=>p.label).join(', ')],['Guarantees',design.enabled?design.guarantees.length:'Baseline class substitutions'],
    ]),el('p',readOnly()?'Copy this profile to edit before applying a Lifegraph draft.':'Use Lifegraph draft explicitly copies its current rules into this profile. Save the profile to retain them.','lab-note'));
  }
  return {element:root,init(){unsubscribe??=controller.subscribe(render);render();},render,destroy(){unsubscribe?.();root.remove();}};
}
