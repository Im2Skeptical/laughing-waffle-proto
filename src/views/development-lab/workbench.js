import { getDetailedSettlementViewModel } from '../../model/detailed-settlements.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool } from '../../model/vassal-life-map.js';
import { classActionOptions } from '../../model/vassal-life-map/class-actions.js';
import { getLabObservation } from '../../model/dev-lab/sandbox.js';
import { NEUTRAL_TEMPLATES } from '../../model/detailed-settlements/external-world.js';
import { planStock, stockTraits } from '../../model/detailed-settlements/stock.js';
import { el, input, select, field, button, section, details, table, disclosure, info, badge, group, isNarrow } from './elements.js';

import { openLabPicker } from './picker.js';
import { enablePracticeOrdering } from './ordering.js';

const qualities = ['bronze','silver','gold','diamond'];
export function renderWorkbench(parent,{controller,cards,run,gym}) {
  const {state,regionId,previous,detail} = controller.getSnapshot();
  const vm = getDetailedSettlementViewModel(state,regionId), local = state.world.sites.find(s=>s.regionId===regionId)?.detailedState;
  const observation = getLabObservation(state,regionId), vassal = getCurrentLifeMapVassal(state);
  const edit = (kind,payload) => run(()=>controller.edit(kind,payload));
  const auto = (controls, action) => controls.forEach(control=>control.addEventListener('change',action));
  const location = select('Settlement',state.world.sites.map(s=>[s.regionId,`${s.regionId} · ${s.name} · ${s.simulationMode}${s.neutral?' · neutral':''}`]),regionId);
  location.addEventListener('change',()=>run(()=>controller.selectRegion(location.value)));
  parent.append(field('Inspect settlement',location));
  if (!vm) parent.append(el('p',`This region has no active tableau. Last defense: ${observation.lastDefense?.result ?? 'none'}. Select a settlement to edit its pieces.`));
  const metrics = el('div','','lab-metrics');
  for (const [key,label] of Object.entries({population:'Population',housing:'Housing',edible:'Edible Stock',demand:'Meal demand',currency:'Currency Stock',scholars:'Scholars',warriors:'Warriors',support:'Martial Support',prestige:'Prestige',prowess:'Prowess',ingenuity:'Ingenuity',chaos:'Chaos',monsters:'Monsters'})) {
    const value = observation[key];
    metrics.append(el('div',`${label}\n${value ?? '—'}${previous && previous[key] !== value ? ` (was ${previous[key] ?? '—'})` : ''}`));
  }
  metrics.append(el('div',`Retinue\n${observation.retinue.value} / ${observation.retinue.cap}\nNext: ${observation.retinue.nextPrestige ?? 'capped'}`));
  parent.append(metrics);
  if (['stock','require'].includes(controller.getSnapshot().exhibitId) && local?.practiceSlots[0]) {
    const slot=local.practiceSlots[0],traits=stockTraits(state,slot);
    const probe=planStock(state,local,[{traits,amount:1}]);
    parent.append(section('Whole-board Stock probe',el('p',`Slot 1 (${slot.practiceId}) holds ${slot.stock} Stock. Consume 1 [${traits.join(' / ')}]: ${probe.ok?`funded from slot ${probe.providers[0].slotIndex+1}`:'unavailable'}.`,'lab-summary'),el('p','Matching Stock is checked left to right, including the consumer’s own Stock. This query spends nothing.','lab-note')));
  }
  const tableau = el('div','','lab-tableau'); tableau.dataset.testid='lab-tableau';
  vm?.practices.forEach((p,index)=>{
    const workers=(p.workers?.tokens??[]).map(t=>t.specialist??'ordinary');
    const meta=p.face?[...p.tags.map(tag=>badge(tag)),badge(workers.length?`Workers: ${workers.join(', ')}`:'No workers','muted')]:[];
    const card=cards.card(p.face,`${index+1}. ${p.label ?? 'Empty'}`,null,{meta});
    card.dataset.slotIndex=index;
    if (p.face) {
      // Provider links jump to and highlight the slot that supplies the Stock.
      if (p.evaluation?.providers?.length) for (const provider of p.evaluation.providers) {
        const link=button(`${provider.kind === 'consume'?'Consume':'Require'} ${provider.amount}: [${provider.slotIndex+1} ${provider.practiceId}] → [${index+1} ${p.label}]`,()=>{
          const source=tableau.querySelector(`[data-slot-index="${provider.slotIndex}"]`);
          if(!source)return;
          source.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
          source.classList.remove('lab-flash');void source.offsetWidth;source.classList.add('lab-flash');
          setTimeout(()=>source.classList.remove('lab-flash'),1600);
        });
        link.className='lab-provider';link.setAttribute('aria-label',`Show provider slot ${provider.slotIndex+1}, ${provider.practiceId}`);card.append(link);
      }
      if (p.evaluation?.mode==='charge') card.append(el('p',`Charge ${p.evaluation.charge} / ${p.evaluation.chargeThreshold}${p.evaluation.blocked?' — blocked':''}`));
      if (p.evaluation?.blocked) card.append(el('p',`Blocked: ${p.evaluation.blockedReason}`,'lab-warning'));
      else if (p.evaluation?.missing) card.append(el('p',`Recipe needs: ${p.evaluation.missing.kind} [${p.evaluation.missing.traits.join(' / ')}] on the board`));
      if (previous?.stocks?.[index]?.stock !== undefined) card.append(el('p',`Stock ${previous.stocks[index].stock} → ${p.stock}`));
    }
    if (gym) {
      const handle=button(`Drag slot ${index+1}`,()=>{});handle.dataset.dragSlot=index;handle.className='lab-drag-handle';
      handle.setAttribute('aria-label',`Reorder slot ${index+1}; drag or Alt plus left/right`);
      card.prepend(handle);
      const quality=select(`Quality slot ${index+1}`,qualities,p.tier??'bronze'), stock=input(`Stock slot ${index+1}`,p.stock??0);
      const apply=()=>edit('practice',{index,id:p.practiceId??'',tier:quality.value,stock:stock.value});
      auto([quality,stock],apply);
      card.append(button(p.face?'Replace Practice':'Choose Practice',()=>openLabPicker({state,category:'practice',cards,
        installed:local.practiceSlots.filter((_,i)=>i!==index).filter(Boolean).map(s=>s.practiceId),
        onChoose:id=>edit('practice',{index,id,tier:quality.value,stock:0})})),field('Quality',quality),field('Stock',stock));
    }
    tableau.append(card);
  });
  if(gym) enablePracticeOrdering(tableau,(from,to)=>edit('move',{from,to}));
  const tableauPanel=section('Practice tableau');
  tableauPanel.firstChild.append(' ',badge('5 slots'));
  if(gym)tableauPanel.append(info('tableau','Drag a slot handle to reorder; slots between shift along. Keyboard: focus a handle and press Alt + Left / Right. Quality and Stock apply when you leave the field.',{label:'Reordering and editing'}));
  tableauPanel.append(tableau);parent.append(tableauPanel);
  const buildings=el('div','','lab-card-grid');
  vm?.structures.filter(Boolean).forEach(s=>{
    const card=cards.card(s.face,`${s.label} · cells ${s.origin+1}–${s.origin+s.width}`);
    if(gym)card.append(button('Remove Structure',()=>edit('removeStructure',{id:s.placementId})));buildings.append(card);
  });
  const structurePanel=disclosure('Structures',[buildings],{key:'gym:structures',open:true,className:'lab-panel',badges:[badge(`${vm?.usedStructureCapacity ?? 0} / ${vm?.structureCapacity ?? 0} cells`)]});
  if(gym && vm) {
    const quality=select('Structure quality bonus',[[0,'Base'],[1,'+25%'],[2,'+50%'],[3,'+75%']],0);
    const controls=el('div','','lab-controls');controls.append(field('Quality for new Structure',quality),button('Browse Structures',()=>openLabPicker({state,category:'structure',cards,onChoose:id=>edit('structure',{id,quality:quality.value})})));
    structurePanel.append(controls);
  }
  parent.append(structurePanel);
  const housing=Object.values(state.gameConfig.gamepieces.structures).filter(d=>d.housing);
  if (controller.getSnapshot().exhibitId==='housing') {
    const house=select('Housing rung',housing.map(d=>[d.id,`${d.label} · ${d.housing}`]),'mudHouses');
    parent.append(section('Housing ladder',table(['Structure','Base capacity'],housing.map(d=>[d.label,d.housing])),house,button('Replace house',()=>edit('house',{id:house.value}))));
  }
  if(vm && (gym || ['scholar','five'].includes(controller.getSnapshot().exhibitId))) {
    const pop=input('Adult population',vm?.population.total??0), scholars=input('Scholar adults',vm?.specialists.scholar??0), warriors=input('Warrior adults',vm?.specialists.warrior??0);
    const controls=el('div','','lab-controls');controls.append(field('Population',pop,{help:'Replaces the settlement’s age and status cohorts with adult Villagers.'}),field('Scholars',scholars,{help:'A subset of the population, not extra people.'}),field('Warriors',warriors,{help:'A subset of the population, not extra people.'}));
    auto([pop,scholars,warriors],()=>edit('population',{population:pop.value,scholars:scholars.value,warriors:warriors.value}));
    parent.append(disclosure('Population & staffing',[controls],{key:'gym:population',open:true,className:'lab-panel'}));
  }
  if(vassal) {
    const panel=disclosure(`${vassal.classId[0].toUpperCase()+vassal.classId.slice(1)} Vassal`,[el('div','','lab-chips')],{key:'gym:vassal',open:true,className:'lab-panel'});
    panel.lastChild.append(badge(`Location ${vassal.locationRegionId}`),badge(`Commission: ${vassal.commission?.objective ?? 'none'}`),badge(`Discovery: ${vassal.discoveryAccess ? 'next shop' : 'none'}`));
    const controls=el('div','','lab-controls');
    const prestige=input('Prestige',vassal.prestige), ingenuity=input('Ingenuity',vassal.stats.cunning), prowess=input('Prowess',vassal.stats.intelligence);
    if(gym) {
      const stats=el('div','','lab-controls');stats.append(field('Prestige',prestige),field('Ingenuity',ingenuity),field('Prowess',prowess));
      auto([prestige,ingenuity,prowess],()=>edit('vassal',{prestige:prestige.value,ingenuity:ingenuity.value,prowess:prowess.value}));
      panel.append(group('Stats',stats));
    }
    controls.append(button('Spend 5 Prestige',()=>edit('spendPrestige',{})),button('Preview seeded shop',()=>run(()=>controller.shop())),button('Check Commission',()=>edit('commissionCheck',{})));
    if (!gym && vassal.classId === 'scholar') controls.append(button('Commission target: replace slot 5 with Foraging',()=>edit('practice',{index:4,id:'forage',stock:0,tier:'bronze'})));
    panel.append(group('Actions',controls));
    const effects=el('div','','lab-controls');
    for(const family of [...(vassal.classId==='scholar'?['commission','discovery']:['campaign']),'crisis']) {
      const options=classActionOptions(state,vassal,family)??[];
      const choice=select(`${family} option`,options.map(o=>[o.id,o.label]),options[0]?.id);
      const row=el('div','','lab-inline');row.append(field(family[0].toUpperCase()+family.slice(1),choice),button('Resolve effect',()=>edit('classEffect',{family,id:choice.value})));effects.append(row);
    }
    panel.append(group('Class effects',effects,info('class-effects','These call the real class effect and legality helpers, without Life Map travel time, Prestige rewards or danger rolls. Use Play from here for the full journey.')));
    parent.append(panel);
  }
  if(gym || controller.getSnapshot().exhibitId==='scholar') {
    const candidates=getVassalCandidatePool(state).candidates;
    const panel=disclosure('Candidates & institutions',[],{key:'gym:candidates',open:!isNarrow(),className:'lab-panel',count:candidates.length});
    panel.append(table(['Candidate','Class','Settlement','Ingenuity','Prowess'],candidates.map((c,i)=>[i+1,c.classId,c.locationRegionId,c.stats.cunning,c.stats.intelligence])));
    const choice=select('Candidate',candidates.map((c,i)=>[i,`${i+1} · ${c.classId}`]),0), choose=button('Select candidate',()=>edit('candidate',{index:choice.value})); choose.disabled=!!vassal;
    if(vassal)choose.title='Only available when no Vassal is active';
    const row=el('div','','lab-controls');row.append(field('Candidate',choice),choose,button('Generate next candidate pool',()=>edit('candidates',{})),button('Compare institution bonuses',()=>run(()=>controller.institutions())));
    panel.append(row,info('candidates','Generating uses the serialized candidate RNG stream and current institutions; Reset restores the exact sequence. Selecting needs no active Vassal.'));parent.append(panel);
  }
  if(gym) {
    const panel=disclosure('External actors & Chaos',[],{key:'gym:external',open:!isNarrow(),className:'lab-panel'});
    const regions=state.world.regions.map(r=>[r.id,`${r.id} · ${r.controller}${r.monster?' · Monster':''}`]);
    const target=select('Target region',regions,regions.find(([id])=>id!==regionId)?.[0]), defense=input('Monster defense',3), age=input('Monster age in moons',3), chaos=input('Chaos power',observation.chaos);
    const row=el('div','','lab-controls');row.append(field('Region',target),field('Defense',defense),field('Age (moons)',age),button('Spawn / set Monster',()=>edit('monster',{regionId:target.value,defense:defense.value,age:age.value})),button('Remove Monster',()=>edit('monster',{regionId:target.value,remove:true})));
    const templates=select('Neutral template',NEUTRAL_TEMPLATES.map((t,i)=>[i,t.name]),0);
    const second=el('div','','lab-controls');second.append(field('Neutral template',templates),button('Spawn neutral in target',()=>edit('neutral',{regionId:target.value,template:templates.value})),button('Connect target to settlement',()=>edit('connection',{regionId:target.value})),button('Ruin selected settlement',()=>edit('ruin',{})),field('Chaos',chaos));
    auto([chaos],()=>edit('chaos',{value:chaos.value}));
    panel.append(group('Monster',row),group('Neutrals & world',second));parent.append(panel);
  }
  const activation=(vm?.activationTrace??[]).slice(-12), cascade=observation.cascadeTrace??[];
  parent.append(disclosure('World & traces',[table(['Region','Owner / mode','Population','Hosted Stock','Monster'],state.world.regions.map(r=>{
    const site=state.world.sites.find(s=>s.regionId===r.id);
    return [r.id,`${r.controller} / ${site?.simulationMode??'frontier'}`,site?.detailedState?Object.values(site.detailedState.populationByClass).reduce((n,c)=>n+c.children+c.adults+c.eldersByAge.reduce((sum,e)=>sum+e.count,0),0):'—',site?.detailedState?.practiceSlots.filter(Boolean).map(p=>`${p.practiceId}: ${p.stock}`).join(', '),r.monster?`Defense ${r.monster.defense}, age ${r.monster.ageMoons}`:'—'];
  })),details('Last meal and defense',{meal:observation.meal,defense:observation.lastDefense}),details('History and current observations',observation),details(`Recent activation trace (${activation.length})`,activation),details(`Causal cascade sequence (${Array.isArray(cascade)?cascade.length:0})`,cascade)],
    {key:'gym:world',open:false,className:'lab-panel',count:state.world.regions.length}));
  if(detail?.kind==='projection') parent.append(section(detail.equal?'Exact projection match':'Projection mismatch',el('p',`Both paths ended at t=${detail.endSec}. All serialized fields compared, including RNG, cohorts and spatial outcomes.`),table(['Field','Authoritative','Projection'],detail.differences.map(d=>[d.path,d.authoritative,d.projection])),details('Compared summaries',{authoritative:{tSec:detail.authoritative.tSec,rng:detail.authoritative.rng,history:detail.authoritative.civilization.history},projection:{tSec:detail.projection.tSec,rng:detail.projection.rng,history:detail.projection.civilization.history}})));
  if(detail?.kind==='shop') parent.append(section('Seeded shop preview',el('p',`Discovery access: ${!!detail.node.discoveryAccess}`),table(['Offer','Quality','Prestige / phases'],detail.node.offers.map(o=>[o.label,o.intervention?.resultingTier??o.intervention?.tier,`${o.basePrestigeCost} / ${o.basePhaseCost}`])),details('Actual generated offers',detail.node.offers)));
  if(detail?.kind==='institutions') parent.append(section('Institutions: same RNG comparison',el('p','Only Structures differ between these two candidate-generation previews. Neither preview changes the fixture or its RNG.'),table(['Class','Settlement','Ingenuity without → with','Prowess without → with'],detail.rows.map(r=>[r.classId,r.regionId,`${r.baseIngenuity} → ${r.ingenuity}`,`${r.baseProwess} → ${r.prowess}`]))));
  if(detail) parent.lastElementChild.dataset.labResult = 'true';
}
